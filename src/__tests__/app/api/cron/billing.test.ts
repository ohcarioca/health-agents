import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/agents/outbound", () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue({ success: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
  canSendToPatient: vi.fn().mockResolvedValue(true),
}));

import { GET } from "@/app/api/cron/billing/route";
import {
  sendOutboundMessage,
  isWithinBusinessHours,
  canSendToPatient,
} from "@/lib/agents/outbound";

// ── Helpers ──

const CRON_SECRET = "test-cron-secret-123";

function createRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/billing", {
    method: "GET",
    headers,
  });
}

// ── Fixtures ──

const INVOICE = {
  id: "inv-1",
  clinic_id: "clinic-1",
  patient_id: "patient-1",
  amount_cents: 15000,
  due_date: "2026-02-14",
  status: "pending",
  notes: null,
  patients: {
    id: "patient-1",
    name: "Maria Silva",
    phone: "5511999998888",
  },
};

const CLINIC = {
  timezone: "America/Sao_Paulo",
  is_active: true,
  whatsapp_phone_number_id: "123456789",
  whatsapp_access_token: "test-access-token",
};

const CONVERSATION = {
  id: "conv-1",
};

// ── Tests ──

describe("GET /api/cron/billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  it("returns 401 without valid CRON_SECRET header", async () => {
    const response = await GET(createRequest());
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 with wrong CRON_SECRET", async () => {
    const response = await GET(createRequest("Bearer wrong-secret"));
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 200 with valid CRON_SECRET and no pending invoices", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.total).toBe(0);
  });
  it("processes a pending invoice and sends billing reminder", async () => {
    const callCounts: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;

      if (table === "invoices") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: [INVOICE],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "clinics") {
        return createChainWithSingle(CLINIC, null);
      }

      if (table === "message_queue") {
        const callNum = callCounts[table];

        // First call: count previous billing messages (none)
        if (callNum === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        // Second call: insert queue entry
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === "conversations") {
        const callNum = callCounts[table];

        // First call: find existing conversation
        if (callNum === 1) {
          return createChainWithMaybeSingle(CONVERSATION, null);
        }

        // Second call: update current_module
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(body.total).toBe(1);

    // Verify sendOutboundMessage was called with correct params
    expect(sendOutboundMessage).toHaveBeenCalledTimes(1);
    const callArgs = (sendOutboundMessage as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const options = callArgs[1];
    expect(options.clinicId).toBe("clinic-1");
    expect(options.patientId).toBe("patient-1");
    expect(options.patientPhone).toBe("5511999998888");
    expect(options.text).toContain("Maria");
    expect(options.text).toContain("R$ 150,00");
    expect(options.skipBusinessHoursCheck).toBe(true);
  });

  it("skips invoice when outside business hours", async () => {
    (isWithinBusinessHours as ReturnType<typeof vi.fn>).mockReturnValue(false);

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: [INVOICE],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "clinics") {
        return createChainWithSingle(CLINIC, null);
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skipped).toBe(1);
    expect(body.processed).toBe(0);

    expect(sendOutboundMessage).not.toHaveBeenCalled();
  });

  it("skips invoice when daily rate limit reached", async () => {
    (canSendToPatient as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: [INVOICE],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "clinics") {
        return createChainWithSingle(CLINIC, null);
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skipped).toBe(1);
    expect(body.processed).toBe(0);

    expect(sendOutboundMessage).not.toHaveBeenCalled();
  });

  it("skips invoice and marks overdue when 3 attempts already sent", async () => {
    (isWithinBusinessHours as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (canSendToPatient as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const callCounts: Record<string, number> = {};
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;

      if (table === "invoices") {
        const callNum = callCounts[table];

        // First call: select pending invoices
        if (callNum === 1) {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [INVOICE],
                  error: null,
                }),
              }),
            }),
          };
        }

        // Second call: update status to overdue
        return {
          update: updateMock,
        };
      }

      if (table === "clinics") {
        return createChainWithSingle(CLINIC, null);
      }

      if (table === "message_queue") {
        // Return 3 previous messages -- max attempts reached
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: "msg-1" }, { id: "msg-2" }, { id: "msg-3" }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skipped).toBe(1);
    expect(body.processed).toBe(0);

    // Should have updated invoice status to overdue
    expect(updateMock).toHaveBeenCalledWith({ status: "overdue" });
    expect(sendOutboundMessage).not.toHaveBeenCalled();
  });

  it("returns 500 when database query fails", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "connection_error" },
          }),
        }),
      }),
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe("connection_error");
  });
});

// ── Chain helpers ──

function createChainWithSingle(
  data: unknown,
  error: { message: string } | null
) {
  const singleFn = vi.fn().mockResolvedValue({ data, error });

  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleFn,
  };
}

function createChainWithMaybeSingle(
  data: unknown,
  error: { message: string } | null
) {
  const maybeSingleFn = vi.fn().mockResolvedValue({ data, error });

  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: maybeSingleFn,
  };
}
