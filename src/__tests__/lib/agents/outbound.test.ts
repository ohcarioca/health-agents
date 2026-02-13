import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock whatsapp service
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
}));

import {
  isWithinBusinessHours,
  canSendToPatient,
  sendOutboundMessage,
  sendOutboundTemplate,
} from "@/lib/agents/outbound";
import { sendTextMessage, sendTemplateMessage } from "@/services/whatsapp";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIMEZONE = "America/Sao_Paulo";

// ── Helpers ──

function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Build an ISO string in the target timezone, then convert to UTC Date
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;

  // Use Intl to find the offset for this specific datetime in this timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Create a date that, when formatted in the target timezone, shows the desired time.
  // We do this by creating an approximate UTC date and adjusting.
  const approx = new Date(dateStr + "Z");
  const parts = formatter.formatToParts(approx);
  const getVal = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const actualHour = getVal("hour");
  const actualDay = getVal("day");

  // Compute the difference and adjust
  const hourDiff = hour - actualHour;
  const dayDiff = day - actualDay;
  const totalHourAdj = hourDiff + dayDiff * 24;

  return new Date(approx.getTime() + totalHourAdj * 60 * 60 * 1000);
}

function createMockSupabase(overrides?: {
  countResult?: number;
  countError?: { message: string } | null;
  insertResult?: { id: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const {
    countResult = 0,
    countError = null,
    insertResult = { id: "queue-1" },
    insertError = null,
    updateError = null,
  } = overrides ?? {};

  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  });

  const fromMock = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              count: countResult,
              error: countError,
            }),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: insertResult,
          error: insertError,
        }),
      }),
    }),
    update: updateMock,
  }));

  return { from: fromMock } as unknown as SupabaseClient;
}

// ── Tests ──

describe("outbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isWithinBusinessHours", () => {
    it("returns true for Monday 10am", () => {
      // 2026-02-09 is a Monday
      const date = createDateInTimezone(2026, 2, 9, 10, 0, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(true);
    });

    it("returns false for Sunday", () => {
      // 2026-02-08 is a Sunday
      const date = createDateInTimezone(2026, 2, 8, 12, 0, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(false);
    });

    it("returns false before 8am", () => {
      // 2026-02-09 is a Monday
      const date = createDateInTimezone(2026, 2, 9, 7, 0, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(false);
    });

    it("returns false at 8pm (20:00)", () => {
      // 2026-02-09 is a Monday
      const date = createDateInTimezone(2026, 2, 9, 20, 0, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(false);
    });

    it("returns true at exactly 8am", () => {
      const date = createDateInTimezone(2026, 2, 9, 8, 0, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(true);
    });

    it("returns true at 7:59pm (19:59)", () => {
      const date = createDateInTimezone(2026, 2, 9, 19, 59, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(true);
    });

    it("returns true for Saturday within hours", () => {
      // 2026-02-14 is a Saturday
      const date = createDateInTimezone(2026, 2, 14, 12, 0, TIMEZONE);
      expect(isWithinBusinessHours(date, TIMEZONE)).toBe(true);
    });
  });

  describe("canSendToPatient", () => {
    it("returns true when fewer than 3 messages sent today", async () => {
      const supabase = createMockSupabase({ countResult: 2 });
      const result = await canSendToPatient(
        supabase,
        "clinic-1",
        "patient-1",
        TIMEZONE
      );
      expect(result).toBe(true);
    });

    it("returns false when 3 or more messages sent today", async () => {
      const supabase = createMockSupabase({ countResult: 3 });
      const result = await canSendToPatient(
        supabase,
        "clinic-1",
        "patient-1",
        TIMEZONE
      );
      expect(result).toBe(false);
    });

    it("returns false when query errors", async () => {
      const supabase = createMockSupabase({
        countError: { message: "DB error" },
      });
      const result = await canSendToPatient(
        supabase,
        "clinic-1",
        "patient-1",
        TIMEZONE
      );
      expect(result).toBe(false);
    });

    it("returns true when count is 0", async () => {
      const supabase = createMockSupabase({ countResult: 0 });
      const result = await canSendToPatient(
        supabase,
        "clinic-1",
        "patient-1",
        TIMEZONE
      );
      expect(result).toBe(true);
    });
  });

  describe("sendOutboundMessage", () => {
    it("returns skippedReason when outside business hours", async () => {
      // 2026-02-08 is a Sunday in Sao Paulo
      const sunday = createDateInTimezone(2026, 2, 8, 12, 0, TIMEZONE);
      vi.useFakeTimers();
      vi.setSystemTime(sunday);

      const supabase = createMockSupabase();
      const result = await sendOutboundMessage(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        text: "Hello!",
        timezone: TIMEZONE,
        conversationId: "conv-1",
      });

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe("outside_business_hours");

      vi.useRealTimers();
    });

    it("sends message and returns success", async () => {
      const mockSend = sendTextMessage as ReturnType<typeof vi.fn>;
      mockSend.mockResolvedValue({ success: true, messageId: "wamid-123" });

      const supabase = createMockSupabase();
      const result = await sendOutboundMessage(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        text: "Hello!",
        timezone: TIMEZONE,
        conversationId: "conv-1",
        skipBusinessHoursCheck: true,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("wamid-123");
      expect(mockSend).toHaveBeenCalledWith("5511999998888", "Hello!");
    });

    it("returns skippedReason when daily limit reached", async () => {
      const supabase = createMockSupabase({ countResult: 3 });
      const result = await sendOutboundMessage(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        text: "Hello!",
        timezone: TIMEZONE,
        conversationId: "conv-1",
        skipBusinessHoursCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe("daily_limit_reached");
    });

    it("returns skippedReason when queue insert fails", async () => {
      const supabase = createMockSupabase({
        insertResult: null,
        insertError: { message: "insert failed" },
      });
      const result = await sendOutboundMessage(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        text: "Hello!",
        timezone: TIMEZONE,
        conversationId: "conv-1",
        skipBusinessHoursCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe("queue_insert_failed");
    });

    it("returns skippedReason when WhatsApp send fails", async () => {
      const mockSend = sendTextMessage as ReturnType<typeof vi.fn>;
      mockSend.mockResolvedValue({ success: false, error: "HTTP 500" });

      const supabase = createMockSupabase();
      const result = await sendOutboundMessage(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        text: "Hello!",
        timezone: TIMEZONE,
        conversationId: "conv-1",
        skipBusinessHoursCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe("send_failed");
    });
  });

  describe("sendOutboundTemplate", () => {
    it("sends template message and returns success", async () => {
      const mockSend = sendTemplateMessage as ReturnType<typeof vi.fn>;
      mockSend.mockResolvedValue({ success: true, messageId: "wamid-456" });

      const supabase = createMockSupabase();
      const result = await sendOutboundTemplate(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        templateName: "lembrete_da_sua_consulta",
        templateLanguage: "pt_BR",
        templateParams: ["Maria", "Dr. Silva"],
        localBody: "Ola Maria, lembrete da consulta com Dr. Silva",
        timezone: TIMEZONE,
        conversationId: "conv-1",
        skipBusinessHoursCheck: true,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("wamid-456");
      expect(mockSend).toHaveBeenCalledWith(
        "5511999998888",
        "lembrete_da_sua_consulta",
        "pt_BR",
        ["Maria", "Dr. Silva"]
      );
    });

    it("returns skippedReason when daily limit reached", async () => {
      const supabase = createMockSupabase({ countResult: 5 });
      const result = await sendOutboundTemplate(supabase, {
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientPhone: "5511999998888",
        templateName: "lembrete_da_sua_consulta",
        templateLanguage: "pt_BR",
        templateParams: ["Maria"],
        localBody: "Ola Maria",
        timezone: TIMEZONE,
        conversationId: "conv-1",
        skipBusinessHoursCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe("daily_limit_reached");
    });
  });
});
