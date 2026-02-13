# Phase 8: Confirmation + NPS Agents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two proactive (outbound) agents — Confirmation and NPS — that initiate contact with patients via WhatsApp, plus the cron infrastructure to trigger them.

**Architecture:** The Confirmation agent sends up to 3 reminders (48h/24h/2h before appointment) using WhatsApp template messages for outbound initiation and conversational AI for responses. The NPS agent sends a satisfaction survey after completed appointments, routes promoters (9-10) to Google Reviews and alerts on detractors (0-6). Both are driven by Vercel Cron jobs that scan queue tables. A shared outbound message runner handles rate limiting (max 3 messages/patient/day) and business hours enforcement (8am-8pm Mon-Sat).

**Tech Stack:** LangChain + OpenAI, Supabase (confirmation_queue + nps_responses tables already exist), Meta WhatsApp Business API (template messages), Vercel Cron, next-intl for i18n.

---

## Prerequisite Context

**Existing infrastructure you'll use:**
- Agent registry: `src/lib/agents/registry.ts` — `registerAgentType()` / `getAgentType()`
- Agent barrel: `src/lib/agents/index.ts` — side-effect imports auto-register agents
- Agent types: `src/lib/agents/types.ts` — `AgentTypeConfig`, `ToolCallResult`, etc.
- Engine: `src/lib/agents/engine.ts` — `chatWithToolLoop()` (max 5 iterations)
- WhatsApp service: `src/services/whatsapp.ts` — `sendTextMessage()`, `sendTemplateMessage()`
- Process message: `src/lib/agents/process-message.ts` — full orchestration pipeline
- DB tables: `confirmation_queue` (pending/processing/sent/failed/responded), `nps_responses` (score, comment, review_sent, alert_sent)
- Types: `src/types/index.ts` — `ConfirmationQueueItem`, `NpsResponse`, `AppointmentStatus`

**Existing agent pattern to follow:** `src/lib/agents/agents/basic-support.ts` and `src/lib/agents/agents/scheduling.ts`. Each agent has: BASE_PROMPTS (3 locales), INSTRUCTIONS (3 locales), tool stubs, handler functions, config object, `registerAgentType()` call.

**Test pattern to follow:** `src/__tests__/lib/agents/scheduling.test.ts` — mock `server-only`, mock `@langchain/openai`, mock Supabase with `createChainable()` / `createMockSupabase()` factory, test registration, tools, prompts, instructions, and tool handlers.

---

## Task 1: Outbound Message Runner (shared utility)

Both agents need outbound messaging with rate limiting and business hours. Build this shared utility first.

**Files:**
- Create: `src/lib/agents/outbound.ts`
- Test: `src/__tests__/lib/agents/outbound.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/agents/outbound.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true, messageId: "msg-1" }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true, messageId: "msg-2" }),
}));

import {
  isWithinBusinessHours,
  canSendToPatient,
  sendOutboundMessage,
} from "@/lib/agents/outbound";

describe("outbound message runner", () => {
  describe("isWithinBusinessHours", () => {
    it("returns true for Monday 10am Sao Paulo time", () => {
      // Monday 10am BRT = Monday 13:00 UTC
      const date = new Date("2026-02-16T13:00:00.000Z"); // Monday
      expect(isWithinBusinessHours(date, "America/Sao_Paulo")).toBe(true);
    });

    it("returns false for Sunday", () => {
      const date = new Date("2026-02-15T13:00:00.000Z"); // Sunday
      expect(isWithinBusinessHours(date, "America/Sao_Paulo")).toBe(false);
    });

    it("returns false before 8am local", () => {
      // 7am BRT = 10:00 UTC
      const date = new Date("2026-02-16T10:00:00.000Z");
      expect(isWithinBusinessHours(date, "America/Sao_Paulo")).toBe(false);
    });

    it("returns false after 8pm local", () => {
      // 21:00 BRT = 00:00 UTC next day
      const date = new Date("2026-02-17T00:00:00.000Z");
      expect(isWithinBusinessHours(date, "America/Sao_Paulo")).toBe(false);
    });
  });

  describe("canSendToPatient", () => {
    it("returns true when fewer than 3 messages sent today", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({
                    data: [{ id: "1" }, { id: "2" }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };
      const result = await canSendToPatient(
        mockSupabase as unknown as Parameters<typeof canSendToPatient>[0],
        "clinic-1",
        "patient-1",
        "America/Sao_Paulo"
      );
      expect(result).toBe(true);
    });

    it("returns false when 3 or more messages sent today", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({
                    data: [{ id: "1" }, { id: "2" }, { id: "3" }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };
      const result = await canSendToPatient(
        mockSupabase as unknown as Parameters<typeof canSendToPatient>[0],
        "clinic-1",
        "patient-1",
        "America/Sao_Paulo"
      );
      expect(result).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/agents/outbound.test.ts`
Expected: FAIL — module `@/lib/agents/outbound` does not exist

**Step 3: Write minimal implementation**

Create `src/lib/agents/outbound.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTextMessage, sendTemplateMessage } from "@/services/whatsapp";

const MAX_MESSAGES_PER_DAY = 3;
const BUSINESS_HOUR_START = 8; // 8am local
const BUSINESS_HOUR_END = 20; // 8pm local

/**
 * Check if the current time is within business hours (8am-8pm Mon-Sat)
 * in the given timezone.
 */
export function isWithinBusinessHours(
  date: Date,
  timezone: string
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);

  // Sunday = no outbound
  if (weekday === "Sun") return false;

  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

/**
 * Check if we can still send messages to this patient today (max 3/day).
 */
export async function canSendToPatient(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  timezone: string
): Promise<boolean> {
  // Calculate start of today in clinic timezone
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const startOfDay = new Date(`${todayStr}T00:00:00`);
  // Convert back to UTC for DB query
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStart = `${todayStr}T00:00:00`;

  const { data: sentToday } = await supabase
    .from("message_queue")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .gte("created_at", todayStart)
    .in("status", ["sent", "pending", "processing"]);

  const count = sentToday?.length ?? 0;
  return count < MAX_MESSAGES_PER_DAY;
}

/**
 * Result of an outbound send attempt.
 */
export interface OutboundSendResult {
  success: boolean;
  messageId?: string;
  skippedReason?: string;
}

/**
 * Send an outbound text message with rate-limit and business-hours checks.
 */
export async function sendOutboundMessage(
  supabase: SupabaseClient,
  options: {
    clinicId: string;
    patientId: string;
    patientPhone: string;
    text: string;
    timezone: string;
    conversationId: string;
    skipBusinessHoursCheck?: boolean;
  }
): Promise<OutboundSendResult> {
  const {
    clinicId,
    patientId,
    patientPhone,
    text,
    timezone,
    conversationId,
    skipBusinessHoursCheck,
  } = options;

  // Business hours check
  if (!skipBusinessHoursCheck && !isWithinBusinessHours(new Date(), timezone)) {
    return { success: false, skippedReason: "outside_business_hours" };
  }

  // Rate limit check
  const allowed = await canSendToPatient(supabase, clinicId, patientId, timezone);
  if (!allowed) {
    return { success: false, skippedReason: "rate_limit_exceeded" };
  }

  // Queue the message
  const { data: queueRow } = await supabase
    .from("message_queue")
    .insert({
      conversation_id: conversationId,
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      content: text,
      status: "pending",
      attempts: 0,
      max_attempts: 3,
    })
    .select("id")
    .single();

  // Send via WhatsApp
  const result = await sendTextMessage(patientPhone, text);

  // Update queue status
  if (queueRow) {
    await supabase
      .from("message_queue")
      .update({
        status: result.success ? "sent" : "failed",
        ...(result.success ? { sent_at: new Date().toISOString() } : {}),
        ...(result.error ? { error: result.error } : {}),
        attempts: 1,
      })
      .eq("id", queueRow.id);
  }

  return {
    success: result.success,
    messageId: result.messageId,
    ...(!result.success ? { skippedReason: result.error } : {}),
  };
}

/**
 * Send an outbound WhatsApp template message (for >24h window).
 */
export async function sendOutboundTemplate(
  supabase: SupabaseClient,
  options: {
    clinicId: string;
    patientId: string;
    patientPhone: string;
    templateName: string;
    templateLanguage: string;
    templateParams: string[];
    localBody: string;
    timezone: string;
    conversationId: string;
  }
): Promise<OutboundSendResult> {
  const {
    clinicId,
    patientId,
    patientPhone,
    templateName,
    templateLanguage,
    templateParams,
    localBody,
    timezone,
    conversationId,
  } = options;

  if (!isWithinBusinessHours(new Date(), timezone)) {
    return { success: false, skippedReason: "outside_business_hours" };
  }

  const allowed = await canSendToPatient(supabase, clinicId, patientId, timezone);
  if (!allowed) {
    return { success: false, skippedReason: "rate_limit_exceeded" };
  }

  const { data: queueRow } = await supabase
    .from("message_queue")
    .insert({
      conversation_id: conversationId,
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      content: localBody,
      status: "pending",
      attempts: 0,
      max_attempts: 3,
    })
    .select("id")
    .single();

  const result = await sendTemplateMessage(
    patientPhone,
    templateName,
    templateLanguage,
    templateParams
  );

  if (queueRow) {
    await supabase
      .from("message_queue")
      .update({
        status: result.success ? "sent" : "failed",
        ...(result.success ? { sent_at: new Date().toISOString() } : {}),
        ...(result.error ? { error: result.error } : {}),
        attempts: 1,
      })
      .eq("id", queueRow.id);
  }

  return {
    success: result.success,
    messageId: result.messageId,
    ...(!result.success ? { skippedReason: result.error } : {}),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/agents/outbound.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/lib/agents/outbound.ts src/__tests__/lib/agents/outbound.test.ts
git commit -m "feat: add outbound message runner with rate limiting and business hours"
```

---

## Task 2: DB migration — add patient_id to message_queue

The `message_queue` table currently has no `patient_id` column, but the outbound runner needs it for per-patient rate limiting. Also add a `source` column to track which agent/cron initiated the outbound message.

**Files:**
- Create: `supabase/migrations/005_message_queue_outbound.sql`

**Step 1: Write the migration**

```sql
-- 005_message_queue_outbound.sql
-- Add patient_id and source columns for outbound message tracking

alter table message_queue
  add column if not exists patient_id uuid references patients(id) on delete set null;

alter table message_queue
  add column if not exists source text;

-- Index for rate-limit query: count messages per patient per day
create index if not exists idx_message_queue_patient_day
  on message_queue (clinic_id, patient_id, created_at)
  where status in ('sent', 'pending', 'processing');
```

**Step 2: Apply migration to Supabase**

Run: Apply via Supabase dashboard SQL editor or `supabase db push` if using CLI.

**Step 3: Regenerate types (if using `supabase gen types`)**

Run: `npx supabase gen types typescript --project-id <project_id> > src/types/database.ts` (or update manually).

**Step 4: Commit**

```bash
git add supabase/migrations/005_message_queue_outbound.sql
git commit -m "feat: add patient_id and source columns to message_queue for outbound tracking"
```

---

## Task 3: Confirmation Agent — agent config + registration

Build the Confirmation agent following the exact pattern of `basic-support.ts`.

**Files:**
- Create: `src/lib/agents/agents/confirmation.ts`
- Modify: `src/lib/agents/index.ts` (add side-effect import)
- Test: `src/__tests__/lib/agents/confirmation.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/agents/confirmation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext, ToolCallResult } from "@/lib/agents";

// ── Mock Supabase factory ──

type MockChainable = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function createChainable(
  resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }
): MockChainable {
  const chainable: MockChainable = {} as MockChainable;
  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.insert = vi.fn().mockReturnValue(chainable);
  chainable.update = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.neq = vi.fn().mockReturnValue(chainable);
  chainable.in = vi.fn().mockReturnValue(chainable);
  chainable.gte = vi.fn().mockReturnValue(chainable);
  chainable.order = vi.fn().mockReturnValue(chainable);
  chainable.limit = vi.fn().mockReturnValue(chainable);
  chainable.single = vi.fn().mockResolvedValue(resolvedValue);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chainable;
}

function createMockSupabase(tableOverrides: Record<string, MockChainable> = {}) {
  const defaultChainable = createChainable();
  const fromMock = vi.fn().mockImplementation((table: string) => {
    return tableOverrides[table] ?? defaultChainable;
  });
  return { from: fromMock };
}

function createToolCallContext(overrides?: Partial<ToolCallContext>): ToolCallContext {
  return {
    supabase: createMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-123",
    recipientId: "patient-456",
    clinicId: "clinic-789",
    ...overrides,
  };
}

describe("confirmation agent", () => {
  describe("registration", () => {
    it("registers the 'confirmation' type in the global registry", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("confirmation");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'confirmation'", () => {
      const config = getAgentType("confirmation");
      expect(config).toBeDefined();
      expect(config!.type).toBe("confirmation");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      const config = getAgentType("confirmation");
      expect(config!.supportedChannels).toContain("whatsapp");
    });
  });

  describe("getTools", () => {
    it("returns exactly 3 tools", () => {
      const config = getAgentType("confirmation")!;
      const tools = config.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
      expect(tools).toHaveLength(3);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("confirmation")!;
      const tools = config.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
      const names = tools.map((t) => t.name);
      expect(names).toContain("confirm_attendance");
      expect(names).toContain("reschedule_from_confirmation");
      expect(names).toContain("mark_no_show");
    });
  });

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("confirmation")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "pt-BR" });
      expect(prompt.toLowerCase()).toMatch(/confirma|consulta|lembrete/);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("confirmation")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "en" });
      expect(prompt.toLowerCase()).toMatch(/confirm|appointment|reminder/);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("confirmation")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "es" });
      expect(prompt.toLowerCase()).toMatch(/confirmar|cita|recordatorio/);
    });
  });

  describe("getInstructions", () => {
    it("returns instructions for all 3 locales", () => {
      const config = getAgentType("confirmation")!;
      expect(config.getInstructions("professional", "pt-BR").length).toBeGreaterThan(0);
      expect(config.getInstructions("professional", "en").length).toBeGreaterThan(0);
      expect(config.getInstructions("professional", "es").length).toBeGreaterThan(0);
    });
  });

  describe("handleToolCall", () => {
    let config: NonNullable<ReturnType<typeof getAgentType>>;

    beforeEach(() => {
      config = getAgentType("confirmation")!;
      vi.clearAllMocks();
    });

    describe("confirm_attendance", () => {
      it("updates appointment status to confirmed", async () => {
        const apptChainable = createChainable();
        apptChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        const confirmChainable = createChainable();
        confirmChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        let callCount = 0;
        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "appointments") {
            callCount++;
            return callCount === 1 ? apptChainable : createChainable();
          }
          if (table === "confirmation_queue") return confirmChainable;
          return createChainable();
        });

        const context = createToolCallContext({
          supabase: { from: mockFromFn } as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "confirm_attendance", args: { appointment_id: "appt-1" } },
          context
        );

        expect(result.result).toContain("confirmed");
      });
    });

    describe("reschedule_from_confirmation", () => {
      it("routes to scheduling module", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          { name: "reschedule_from_confirmation", args: { appointment_id: "appt-1", reason: "conflict" } },
          context
        );

        expect(result.result).toContain("rescheduling");
        expect(result.responseData?.routedTo).toBe("scheduling");
      });
    });

    describe("mark_no_show", () => {
      it("marks appointment as no_show", async () => {
        const apptChainable = createChainable();
        apptChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        const mockSupabase = createMockSupabase({ appointments: apptChainable });
        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "mark_no_show", args: { appointment_id: "appt-1" } },
          context
        );

        expect(result.result).toContain("no-show");
      });
    });

    describe("unknown tool", () => {
      it("returns an empty object for unknown tool names", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          { name: "nonexistent_tool", args: {} },
          context
        );
        expect(result).toEqual({});
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/agents/confirmation.test.ts`
Expected: FAIL — `confirmation` type not registered

**Step 3: Write the Confirmation agent**

Create `src/lib/agents/agents/confirmation.ts`:

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import type {
  AgentTypeConfig,
  AgentToolOptions,
  SystemPromptParams,
  RecipientContext,
  ToolCallInput,
  ToolCallContext,
  ToolCallResult,
} from "../types";

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e um assistente de confirmacao de consultas. Seu papel e lembrar pacientes sobre consultas agendadas e registrar suas respostas.

Regras:
- Use o primeiro nome do paciente.
- Responda sempre em portugues do Brasil.
- Seja breve e direto.
- Quando o paciente confirmar presenca, chame confirm_attendance imediatamente.
- Quando o paciente quiser remarcar, chame reschedule_from_confirmation para encaminhar ao agendamento.
- Se o paciente nao responder ou disser que nao vai, registre a informacao de forma educada.
- Nao insista mais de 2 vezes na mesma mensagem.`,

  en: `You are an appointment confirmation assistant. Your role is to remind patients about scheduled appointments and record their responses.

Rules:
- Use the patient's first name.
- Always respond in English.
- Be brief and direct.
- When the patient confirms attendance, call confirm_attendance immediately.
- When the patient wants to reschedule, call reschedule_from_confirmation to hand off to scheduling.
- If the patient says they won't attend, record the information politely.
- Do not insist more than 2 times on the same message.`,

  es: `Eres un asistente de confirmacion de citas. Tu rol es recordar a los pacientes sobre citas agendadas y registrar sus respuestas.

Reglas:
- Usa el primer nombre del paciente.
- Responde siempre en espanol.
- Se breve y directo.
- Cuando el paciente confirme asistencia, llama confirm_attendance inmediatamente.
- Cuando el paciente quiera reprogramar, llama reschedule_from_confirmation para derivar al agendamiento.
- Si el paciente dice que no ira, registra la informacion de forma educada.
- No insistas mas de 2 veces en el mismo mensaje.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Lembre pacientes sobre consultas agendadas. Confirme presenca ou encaminhe para reagendamento.",
  en: "Remind patients about scheduled appointments. Confirm attendance or route to rescheduling.",
  es: "Recuerda a los pacientes sobre citas agendadas. Confirma asistencia o deriva a reprogramacion.",
};

// ── Tool Definitions (Stubs) ──

const confirmAttendanceTool = tool(
  async (input) => {
    return JSON.stringify({ action: "confirm_attendance", appointment_id: input.appointment_id });
  },
  {
    name: "confirm_attendance",
    description: "Confirms that the patient will attend their appointment. Call this when the patient says they will come, confirms, or agrees.",
    schema: z.object({
      appointment_id: z.string().describe("UUID of the appointment to confirm"),
    }),
  }
);

const rescheduleFromConfirmationTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "reschedule_from_confirmation",
      appointment_id: input.appointment_id,
      reason: input.reason,
    });
  },
  {
    name: "reschedule_from_confirmation",
    description: "Patient wants to reschedule instead of confirming. Routes the conversation to the scheduling module.",
    schema: z.object({
      appointment_id: z.string().describe("UUID of the appointment to reschedule"),
      reason: z.string().describe("Brief reason the patient wants to reschedule"),
    }),
  }
);

const markNoShowTool = tool(
  async (input) => {
    return JSON.stringify({ action: "mark_no_show", appointment_id: input.appointment_id });
  },
  {
    name: "mark_no_show",
    description: "Marks an appointment as no-show. Use this when the patient explicitly says they will not attend and does not want to reschedule.",
    schema: z.object({
      appointment_id: z.string().describe("UUID of the appointment to mark as no-show"),
    }),
  }
);

// ── Tool Handlers ──

async function handleConfirmAttendance(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId = typeof args.appointment_id === "string" ? args.appointment_id : "";

  if (!appointmentId) {
    return { result: "Error: appointment_id is required." };
  }

  try {
    // Update appointment status to confirmed
    await context.supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", appointmentId);

    // Update confirmation_queue entry to responded
    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "confirmed" })
      .eq("appointment_id", appointmentId)
      .eq("status", "sent");

    return { result: "Appointment confirmed successfully. The patient has been marked as attending." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error confirming appointment: ${message}` };
  }
}

async function handleRescheduleFromConfirmation(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const reason = typeof args.reason === "string" ? args.reason : "No reason provided";

  return {
    result: `Patient wants rescheduling. Routing to scheduling module. Reason: ${reason}`,
    responseData: { routedTo: "scheduling", routeContext: reason },
  };
}

async function handleMarkNoShow(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId = typeof args.appointment_id === "string" ? args.appointment_id : "";

  if (!appointmentId) {
    return { result: "Error: appointment_id is required." };
  }

  try {
    await context.supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appointmentId);

    return { result: "Appointment marked as no-show." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error marking no-show: ${message}` };
  }
}

// ── Agent Config ──

const confirmationConfig: AgentTypeConfig = {
  type: "confirmation",

  buildSystemPrompt(params: SystemPromptParams, _recipient?: RecipientContext): string {
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },

  getInstructions(_tone: string, locale: string): string {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },

  getTools(_options: AgentToolOptions) {
    return [confirmAttendanceTool, rescheduleFromConfirmationTool, markNoShowTool];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "confirm_attendance":
        return handleConfirmAttendance(toolCall.args, context);
      case "reschedule_from_confirmation":
        return handleRescheduleFromConfirmation(toolCall.args, context);
      case "mark_no_show":
        return handleMarkNoShow(toolCall.args, context);
      default:
        console.warn(`[confirmation] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(confirmationConfig);
```

**Step 4: Add side-effect import to barrel**

In `src/lib/agents/index.ts`, add at the bottom:

```ts
import "./agents/confirmation";
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/agents/confirmation.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

**Step 7: Commit**

```bash
git add src/lib/agents/agents/confirmation.ts src/lib/agents/index.ts src/__tests__/lib/agents/confirmation.test.ts
git commit -m "feat: add confirmation agent with 3 tools and tests"
```

---

## Task 4: NPS Agent — agent config + registration

**Files:**
- Create: `src/lib/agents/agents/nps.ts`
- Modify: `src/lib/agents/index.ts` (add side-effect import)
- Test: `src/__tests__/lib/agents/nps.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/agents/nps.test.ts` following the same pattern as confirmation.test.ts. Key assertions:

- Registers `"nps"` type
- Has 4 tools: `collect_nps_score`, `collect_nps_comment`, `redirect_to_google_reviews`, `alert_detractor`
- `collect_nps_score` with score 10 → result contains "promoter" or similar
- `collect_nps_score` with score 3 → result contains "detractor" or similar
- `redirect_to_google_reviews` → returns appendToResponse with the Google Reviews link
- `alert_detractor` → creates an alert record
- Unknown tool → returns `{}`
- 3 locales for prompts and instructions

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext, ToolCallResult } from "@/lib/agents";

type MockChainable = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function createChainable(
  resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }
): MockChainable {
  const chainable: MockChainable = {} as MockChainable;
  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.insert = vi.fn().mockReturnValue(chainable);
  chainable.update = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.single = vi.fn().mockResolvedValue(resolvedValue);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chainable;
}

function createMockSupabase(tableOverrides: Record<string, MockChainable> = {}) {
  const defaultChainable = createChainable();
  return {
    from: vi.fn().mockImplementation((table: string) => tableOverrides[table] ?? defaultChainable),
  };
}

function createToolCallContext(overrides?: Partial<ToolCallContext>): ToolCallContext {
  return {
    supabase: createMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-123",
    recipientId: "patient-456",
    clinicId: "clinic-789",
    ...overrides,
  };
}

describe("nps agent", () => {
  describe("registration", () => {
    it("registers the 'nps' type in the global registry", () => {
      expect(getRegisteredTypes()).toContain("nps");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'nps'", () => {
      const config = getAgentType("nps");
      expect(config).toBeDefined();
      expect(config!.type).toBe("nps");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      expect(getAgentType("nps")!.supportedChannels).toContain("whatsapp");
    });
  });

  describe("getTools", () => {
    it("returns exactly 4 tools", () => {
      const config = getAgentType("nps")!;
      const tools = config.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
      expect(tools).toHaveLength(4);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("nps")!;
      const tools = config.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
      const names = tools.map((t) => t.name);
      expect(names).toContain("collect_nps_score");
      expect(names).toContain("collect_nps_comment");
      expect(names).toContain("redirect_to_google_reviews");
      expect(names).toContain("alert_detractor");
    });
  });

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR", () => {
      const config = getAgentType("nps")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "pt-BR" });
      expect(prompt.toLowerCase()).toMatch(/satisfa|avalia|pesquisa/);
    });

    it("returns English text for en", () => {
      const config = getAgentType("nps")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "en" });
      expect(prompt.toLowerCase()).toMatch(/satisfaction|survey|feedback/);
    });

    it("returns Spanish text for es", () => {
      const config = getAgentType("nps")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "es" });
      expect(prompt.toLowerCase()).toMatch(/satisfacci|encuesta|evaluaci/);
    });
  });

  describe("getInstructions", () => {
    it("returns instructions for all 3 locales", () => {
      const config = getAgentType("nps")!;
      expect(config.getInstructions("professional", "pt-BR").length).toBeGreaterThan(0);
      expect(config.getInstructions("professional", "en").length).toBeGreaterThan(0);
      expect(config.getInstructions("professional", "es").length).toBeGreaterThan(0);
    });
  });

  describe("handleToolCall", () => {
    let config: NonNullable<ReturnType<typeof getAgentType>>;

    beforeEach(() => {
      config = getAgentType("nps")!;
      vi.clearAllMocks();
    });

    describe("collect_nps_score", () => {
      it("records a promoter score (9-10)", async () => {
        const npsChainable = createChainable({ data: { id: "nps-1" }, error: null });
        const mockSupabase = createMockSupabase({ nps_responses: npsChainable });
        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "collect_nps_score", args: { appointment_id: "appt-1", score: 10 } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result!.toLowerCase()).toMatch(/thank|obrigad|graci/);
      });

      it("records a detractor score (0-6)", async () => {
        const npsChainable = createChainable({ data: { id: "nps-1" }, error: null });
        const mockSupabase = createMockSupabase({ nps_responses: npsChainable });
        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "collect_nps_score", args: { appointment_id: "appt-1", score: 3 } },
          context
        );

        expect(result.result).toBeDefined();
      });
    });

    describe("collect_nps_comment", () => {
      it("saves the comment to nps_responses", async () => {
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        const mockSupabase = createMockSupabase({ nps_responses: npsChainable });
        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "collect_nps_comment", args: { appointment_id: "appt-1", comment: "Great service!" } },
          context
        );

        expect(result.result).toContain("recorded");
      });
    });

    describe("redirect_to_google_reviews", () => {
      it("returns Google Reviews link in appendToResponse", async () => {
        const clinicChainable = createChainable({
          data: { google_reviews_url: "https://g.page/r/example/review" },
          error: null,
        });
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "clinics") return clinicChainable;
          if (table === "nps_responses") return npsChainable;
          return createChainable();
        });

        const context = createToolCallContext({
          supabase: { from: mockFromFn } as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "redirect_to_google_reviews", args: { appointment_id: "appt-1" } },
          context
        );

        expect(result.appendToResponse).toContain("https://g.page/r/example/review");
      });
    });

    describe("alert_detractor", () => {
      it("marks nps_response as alert_sent", async () => {
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        const mockSupabase = createMockSupabase({ nps_responses: npsChainable });
        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "alert_detractor", args: { appointment_id: "appt-1", score: 3, comment: "Bad" } },
          context
        );

        expect(result.result).toContain("alert");
      });
    });

    describe("unknown tool", () => {
      it("returns an empty object", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall({ name: "nonexistent", args: {} }, context);
        expect(result).toEqual({});
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/agents/nps.test.ts`
Expected: FAIL — `nps` type not registered

**Step 3: Write the NPS agent**

Create `src/lib/agents/agents/nps.ts` following the same structure as confirmation.ts. Key elements:

- Type: `"nps"`
- 4 tools: `collect_nps_score`, `collect_nps_comment`, `redirect_to_google_reviews`, `alert_detractor`
- `collect_nps_score` inserts into `nps_responses` table with score
- `collect_nps_comment` updates nps_responses with comment
- `redirect_to_google_reviews` reads `clinics.google_reviews_url`, returns in `appendToResponse`, marks `review_sent = true`
- `alert_detractor` marks `alert_sent = true` on the nps_response
- System prompts explain NPS flow: ask score → ask comment → if promoter route to Google Reviews, if detractor alert

**Step 4: Add side-effect import to barrel**

In `src/lib/agents/index.ts`, add:

```ts
import "./agents/nps";
```

**Step 5: Run tests and commit**

Run: `npx vitest run`
Expected: All tests pass

```bash
git add src/lib/agents/agents/nps.ts src/lib/agents/index.ts src/__tests__/lib/agents/nps.test.ts
git commit -m "feat: add NPS agent with 4 tools and tests"
```

---

## Task 5: DB migration — add google_reviews_url to clinics

The NPS agent needs a `google_reviews_url` column on the `clinics` table to redirect promoters.

**Files:**
- Create: `supabase/migrations/006_clinics_google_reviews.sql`

**Step 1: Write the migration**

```sql
-- 006_clinics_google_reviews.sql
alter table clinics
  add column if not exists google_reviews_url text;
```

**Step 2: Apply and commit**

```bash
git add supabase/migrations/006_clinics_google_reviews.sql
git commit -m "feat: add google_reviews_url column to clinics table"
```

---

## Task 6: Confirmation Cron Route

Vercel Cron that scans `confirmation_queue` for pending confirmations whose `scheduled_at` has arrived.

**Files:**
- Create: `src/app/api/cron/confirmations/route.ts`
- Test: `src/__tests__/app/api/cron/confirmations.test.ts`
- Modify: `vercel.json` (create if missing — add cron config)

**Step 1: Write the failing test**

Create `src/__tests__/app/api/cron/confirmations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

// Mock supabase admin
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

// Mock outbound
vi.mock("@/lib/agents/outbound", () => ({
  sendOutboundTemplate: vi.fn().mockResolvedValue({ success: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
}));

import { GET } from "@/app/api/cron/confirmations/route";

describe("GET /api/cron/confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 without valid CRON_SECRET header", async () => {
    const req = new Request("http://localhost/api/cron/confirmations", {
      headers: {},
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid CRON_SECRET header", async () => {
    // Mock: no pending confirmations
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/cron/confirmations", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/app/api/cron/confirmations.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write the cron route**

Create `src/app/api/cron/confirmations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOutboundTemplate, isWithinBusinessHours } from "@/lib/agents/outbound";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Fetch pending confirmations whose scheduled_at has arrived
  const { data: pending, error } = await supabase
    .from("confirmation_queue")
    .select(`
      id,
      clinic_id,
      appointment_id,
      stage,
      appointments!inner (
        id, starts_at, ends_at, status,
        professional_id,
        patient_id,
        patients!inner ( id, name, phone ),
        professionals!inner ( id, name )
      )
    `)
    .eq("status", "pending")
    .lte("scheduled_at", now);

  if (error) {
    console.error("[cron/confirmations] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;
  let skipped = 0;

  for (const item of pending) {
    const appointment = item.appointments as Record<string, unknown>;
    if (!appointment) continue;

    // Skip if appointment was already cancelled or completed
    const apptStatus = appointment.status as string;
    if (apptStatus === "cancelled" || apptStatus === "completed" || apptStatus === "no_show") {
      await supabase
        .from("confirmation_queue")
        .update({ status: "failed" })
        .eq("id", item.id);
      skipped++;
      continue;
    }

    const patient = appointment.patients as Record<string, unknown>;
    const professional = appointment.professionals as Record<string, unknown>;
    if (!patient || !professional) continue;

    const patientPhone = (patient.phone as string) ?? "";
    const patientName = ((patient.name as string) ?? "").split(" ")[0];
    const professionalName = (professional.name as string) ?? "";
    const patientId = patient.id as string;

    // Load clinic timezone
    const { data: clinic } = await supabase
      .from("clinics")
      .select("timezone")
      .eq("id", item.clinic_id)
      .single();

    const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

    // Business hours check
    if (!isWithinBusinessHours(new Date(), timezone)) {
      skipped++;
      continue;
    }

    // Format appointment date/time for the message
    const startsAt = new Date(appointment.starts_at as string);
    const dateStr = startsAt.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    });
    const timeStr = startsAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    });

    // Mark as processing
    await supabase
      .from("confirmation_queue")
      .update({ status: "processing" })
      .eq("id", item.id);

    // Find or create conversation for this patient+clinic
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("clinic_id", item.clinic_id)
      .eq("patient_id", patientId)
      .eq("channel", "whatsapp")
      .eq("status", "active")
      .maybeSingle();

    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          clinic_id: item.clinic_id,
          patient_id: patientId,
          channel: "whatsapp",
          status: "active",
          current_module: "confirmation",
        })
        .select("id")
        .single();
      conversationId = newConv?.id ?? "";
    }

    // Send template message (outbound >24h requires template)
    const sendResult = await sendOutboundTemplate(supabase, {
      clinicId: item.clinic_id,
      patientId,
      patientPhone,
      templateName: "appointment_reminder",
      templateLanguage: "pt_BR",
      templateParams: [patientName, professionalName, dateStr, timeStr],
      localBody: `Ola ${patientName}! Lembrete: voce tem consulta com ${professionalName} em ${dateStr} as ${timeStr}. Pode confirmar sua presenca?`,
      timezone,
      conversationId,
    });

    // Update queue status
    await supabase
      .from("confirmation_queue")
      .update({
        status: sendResult.success ? "sent" : "failed",
        ...(sendResult.success ? { sent_at: new Date().toISOString() } : {}),
        attempts: (item.attempts ?? 0) + 1,
      })
      .eq("id", item.id);

    if (sendResult.success) processed++;
    else skipped++;
  }

  return NextResponse.json({ processed, skipped, total: pending.length });
}
```

**Step 4: Create vercel.json with cron config**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/confirmations",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Step 5: Run test and commit**

Run: `npx vitest run src/__tests__/app/api/cron/confirmations.test.ts`
Expected: PASS

```bash
git add src/app/api/cron/confirmations/route.ts src/__tests__/app/api/cron/confirmations.test.ts vercel.json
git commit -m "feat: add confirmation cron route with business hours and rate limiting"
```

---

## Task 7: Auto-enqueue confirmations when appointment is booked

When an appointment is booked, automatically create 3 entries in `confirmation_queue` (48h, 24h, 2h before).

**Files:**
- Create: `src/lib/scheduling/enqueue-confirmations.ts`
- Test: `src/__tests__/lib/scheduling/enqueue-confirmations.test.ts`
- Modify: `src/lib/agents/agents/scheduling.ts` — call enqueue after booking

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildConfirmationEntries } from "@/lib/scheduling/enqueue-confirmations";

describe("buildConfirmationEntries", () => {
  it("creates 3 entries for 48h, 24h, and 2h before", () => {
    const startsAt = "2026-02-20T15:00:00.000Z"; // Friday 12:00 BRT
    const entries = buildConfirmationEntries({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      startsAt,
    });

    expect(entries).toHaveLength(3);
    expect(entries[0].stage).toBe("48h");
    expect(entries[1].stage).toBe("24h");
    expect(entries[2].stage).toBe("2h");

    // 48h before
    const scheduled48 = new Date(entries[0].scheduled_at);
    const expected48 = new Date(new Date(startsAt).getTime() - 48 * 60 * 60 * 1000);
    expect(scheduled48.getTime()).toBe(expected48.getTime());
  });

  it("skips stages that are already in the past", () => {
    // Appointment in 1 hour — only 2h is still valid (but it's past), so skip all or only keep valid ones
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const entries = buildConfirmationEntries({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      startsAt: oneHourFromNow,
    });

    // All stages (48h, 24h, 2h) would be in the past for a 1h-out appointment
    expect(entries).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/scheduling/enqueue-confirmations.test.ts`
Expected: FAIL

**Step 3: Implement**

Create `src/lib/scheduling/enqueue-confirmations.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

const STAGES = [
  { stage: "48h", hoursBeforeMs: 48 * 60 * 60 * 1000 },
  { stage: "24h", hoursBeforeMs: 24 * 60 * 60 * 1000 },
  { stage: "2h", hoursBeforeMs: 2 * 60 * 60 * 1000 },
] as const;

interface ConfirmationEntry {
  clinic_id: string;
  appointment_id: string;
  stage: string;
  status: string;
  scheduled_at: string;
  attempts: number;
}

export function buildConfirmationEntries(params: {
  clinicId: string;
  appointmentId: string;
  startsAt: string;
}): ConfirmationEntry[] {
  const { clinicId, appointmentId, startsAt } = params;
  const appointmentTime = new Date(startsAt).getTime();
  const now = Date.now();

  return STAGES.filter(({ hoursBeforeMs }) => {
    const scheduledAt = appointmentTime - hoursBeforeMs;
    return scheduledAt > now; // Only create if the scheduled time is still in the future
  }).map(({ stage, hoursBeforeMs }) => ({
    clinic_id: clinicId,
    appointment_id: appointmentId,
    stage,
    status: "pending",
    scheduled_at: new Date(appointmentTime - hoursBeforeMs).toISOString(),
    attempts: 0,
  }));
}

export async function enqueueConfirmations(
  supabase: SupabaseClient,
  params: {
    clinicId: string;
    appointmentId: string;
    startsAt: string;
  }
): Promise<void> {
  const entries = buildConfirmationEntries(params);
  if (entries.length === 0) return;

  const { error } = await supabase.from("confirmation_queue").insert(entries);
  if (error) {
    console.error("[enqueue-confirmations] insert error:", error);
  }
}
```

**Step 4: Integrate into scheduling agent's handleBookAppointment**

In `src/lib/agents/agents/scheduling.ts`, after the appointment is successfully inserted (after the `if (insertError || !appointment)` check), add:

```ts
import { enqueueConfirmations } from "@/lib/scheduling/enqueue-confirmations";

// ... inside handleBookAppointment, after successful insert:
// Enqueue confirmation reminders
try {
  await enqueueConfirmations(context.supabase, {
    clinicId: context.clinicId,
    appointmentId: appointment.id as string,
    startsAt,
  });
} catch (enqueueError) {
  console.error("[scheduling] failed to enqueue confirmations:", enqueueError);
}
```

**Step 5: Run tests and commit**

Run: `npx vitest run`
Expected: All pass

```bash
git add src/lib/scheduling/enqueue-confirmations.ts src/__tests__/lib/scheduling/enqueue-confirmations.test.ts src/lib/agents/agents/scheduling.ts
git commit -m "feat: auto-enqueue confirmation reminders when appointment is booked"
```

---

## Task 8: NPS Cron Route

Scans for appointments with status `completed` that don't yet have an nps_responses entry.

**Files:**
- Create: `src/app/api/cron/nps/route.ts`
- Test: `src/__tests__/app/api/cron/nps.test.ts`
- Modify: `vercel.json` (add NPS cron)

**Step 1: Write the failing test**

Similar to Task 6 — test auth, and that it returns 200 with valid CRON_SECRET.

**Step 2: Implement the cron route**

Create `src/app/api/cron/nps/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOutboundMessage, isWithinBusinessHours } from "@/lib/agents/outbound";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find completed appointments that don't have NPS responses yet
  // Look for appointments completed in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: completedAppointments, error } = await supabase
    .from("appointments")
    .select(`
      id, clinic_id, patient_id, professional_id, starts_at, status, updated_at,
      patients!inner ( id, name, phone ),
      professionals!inner ( id, name )
    `)
    .eq("status", "completed")
    .gte("updated_at", oneDayAgo);

  if (error) {
    console.error("[cron/nps] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!completedAppointments || completedAppointments.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // Filter out appointments that already have NPS responses
  const appointmentIds = completedAppointments.map((a) => a.id);
  const { data: existingNps } = await supabase
    .from("nps_responses")
    .select("appointment_id")
    .in("appointment_id", appointmentIds);

  const existingIds = new Set((existingNps ?? []).map((n) => n.appointment_id));
  const needsNps = completedAppointments.filter((a) => !existingIds.has(a.id));

  let processed = 0;
  let skipped = 0;

  for (const appt of needsNps) {
    const patient = appt.patients as Record<string, unknown>;
    const professional = appt.professionals as Record<string, unknown>;
    if (!patient || !professional) continue;

    const patientPhone = (patient.phone as string) ?? "";
    const patientName = ((patient.name as string) ?? "").split(" ")[0];
    const professionalName = (professional.name as string) ?? "";
    const patientId = patient.id as string;

    const { data: clinic } = await supabase
      .from("clinics")
      .select("timezone")
      .eq("id", appt.clinic_id)
      .single();

    const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

    if (!isWithinBusinessHours(new Date(), timezone)) {
      skipped++;
      continue;
    }

    // Create NPS response placeholder (score null = not yet collected)
    const { data: npsRow } = await supabase
      .from("nps_responses")
      .insert({
        clinic_id: appt.clinic_id,
        appointment_id: appt.id,
        patient_id: patientId,
      })
      .select("id")
      .single();

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("clinic_id", appt.clinic_id)
      .eq("patient_id", patientId)
      .eq("channel", "whatsapp")
      .eq("status", "active")
      .maybeSingle();

    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          clinic_id: appt.clinic_id,
          patient_id: patientId,
          channel: "whatsapp",
          status: "active",
          current_module: "nps",
        })
        .select("id")
        .single();
      conversationId = newConv?.id ?? "";
    }

    // Send NPS survey message
    const message = `Ola ${patientName}! Como foi sua consulta com ${professionalName}? De uma nota de 0 a 10 para nos ajudar a melhorar o atendimento.`;

    const sendResult = await sendOutboundMessage(supabase, {
      clinicId: appt.clinic_id,
      patientId,
      patientPhone,
      text: message,
      timezone,
      conversationId,
      skipBusinessHoursCheck: true, // Already checked above
    });

    if (sendResult.success) processed++;
    else skipped++;
  }

  return NextResponse.json({ processed, skipped, total: needsNps.length });
}
```

**Step 3: Update vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/confirmations",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/nps",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

**Step 4: Run tests and commit**

```bash
git add src/app/api/cron/nps/route.ts src/__tests__/app/api/cron/nps.test.ts vercel.json
git commit -m "feat: add NPS cron route to survey patients after completed appointments"
```

---

## Task 9: Appointment status transition — mark as completed

The NPS cron needs appointments to be marked `completed`. Add a way to transition appointment status. For now, the simplest approach: an API route that the clinic can use from the inbox or settings.

**Files:**
- Create: `src/app/api/appointments/[id]/complete/route.ts`

**Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  // Verify appointment belongs to clinic and is in a completable state
  const { data: appointment, error: fetchError } = await supabase
    .from("appointments")
    .select("id, status")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (fetchError || !appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.status !== "confirmed" && appointment.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot complete appointment with status "${appointment.status}"` },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id, status: "completed" } });
}
```

**Step 2: Commit**

```bash
git add src/app/api/appointments/[id]/complete/route.ts
git commit -m "feat: add appointment completion endpoint for NPS trigger"
```

---

## Task 10: i18n strings for confirmation and NPS modules

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add i18n keys**

Add to all 3 locale files under a new `"agents"` section:

```json
{
  "agents": {
    "confirmation": {
      "label": "Confirmação",
      "description": "Confirma presença de pacientes antes das consultas"
    },
    "nps": {
      "label": "Pesquisa NPS",
      "description": "Coleta avaliação de satisfação após consultas"
    }
  }
}
```

(And equivalent translations for `en` and `es`.)

**Step 2: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add i18n strings for confirmation and NPS agents"
```

---

## Task 11: Export outbound from agents barrel

Make sure the outbound utility is accessible from the barrel.

**Files:**
- Modify: `src/lib/agents/index.ts`

**Step 1: Add export**

```ts
// Outbound message runner
export {
  isWithinBusinessHours,
  canSendToPatient,
  sendOutboundMessage,
  sendOutboundTemplate,
} from "./outbound";
```

**Step 2: Run full test suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, zero errors

**Step 3: Commit**

```bash
git add src/lib/agents/index.ts
git commit -m "feat: export outbound message runner from agents barrel"
```

---

## Task 12: TypeScript compile check + full test run

Final verification that everything compiles and all tests pass.

**Step 1: Run TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (including new confirmation, nps, outbound, cron tests)

**Step 3: Final commit (if any fixes needed)**

---

## Task 13: Update CLAUDE.md and MEMORY.md

Update project documentation to reflect the new agents and cron infrastructure.

**Files:**
- Modify: `CLAUDE.md` — add confirmation and nps agent types to registry docs
- Modify: auto memory `MEMORY.md` — add Phase 8 notes

**Step 1: Update CLAUDE.md**

Add to the agent registry documentation that `confirmation` and `nps` are now registered types.

**Step 2: Update MEMORY.md**

Add Phase 8 notes:
- Confirmation agent: 3 tools (confirm_attendance, reschedule_from_confirmation, mark_no_show)
- NPS agent: 4 tools (collect_nps_score, collect_nps_comment, redirect_to_google_reviews, alert_detractor)
- Cron: `/api/cron/confirmations` (every 15min), `/api/cron/nps` (every 2h)
- Outbound runner: `src/lib/agents/outbound.ts` — rate limit 3/day, business hours 8am-8pm Mon-Sat
- `CRON_SECRET` env var required for cron auth
- `google_reviews_url` column on clinics table for NPS promoter redirect

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 8 confirmation and NPS agents"
```

---

## Summary

| Task | What | Files Created | Files Modified |
|------|------|--------------|---------------|
| 1 | Outbound message runner | `outbound.ts`, test | — |
| 2 | DB migration (message_queue) | `005_*.sql` | — |
| 3 | Confirmation agent | `confirmation.ts`, test | `index.ts` |
| 4 | NPS agent | `nps.ts`, test | `index.ts` |
| 5 | DB migration (google_reviews_url) | `006_*.sql` | — |
| 6 | Confirmation cron route | `cron/confirmations/route.ts`, test | `vercel.json` |
| 7 | Auto-enqueue confirmations | `enqueue-confirmations.ts`, test | `scheduling.ts` |
| 8 | NPS cron route | `cron/nps/route.ts`, test | `vercel.json` |
| 9 | Appointment completion endpoint | `[id]/complete/route.ts` | — |
| 10 | i18n strings | — | 3 locale files |
| 11 | Export outbound from barrel | — | `index.ts` |
| 12 | Full compile + test check | — | — |
| 13 | Update docs | — | `CLAUDE.md` |
