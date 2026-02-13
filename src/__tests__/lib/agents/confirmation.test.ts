import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (imported by engine.ts and process-message.ts)
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI (imported by engine.ts and router.ts)
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

// Mock WhatsApp service
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Google Calendar service
vi.mock("@/services/google-calendar", () => ({
  deleteEvent: vi.fn().mockResolvedValue(undefined),
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
  lt: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function createChainable(
  resolvedValue: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  }
): MockChainable {
  const chainable: MockChainable = {} as MockChainable;

  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.insert = vi.fn().mockReturnValue(chainable);
  chainable.update = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.neq = vi.fn().mockReturnValue(chainable);
  chainable.in = vi.fn().mockReturnValue(chainable);
  chainable.lt = vi.fn().mockReturnValue(chainable);
  chainable.gt = vi.fn().mockReturnValue(chainable);
  chainable.gte = vi.fn().mockReturnValue(chainable);
  chainable.lte = vi.fn().mockReturnValue(chainable);
  chainable.order = vi.fn().mockReturnValue(chainable);
  chainable.limit = vi.fn().mockReturnValue(chainable);
  chainable.single = vi.fn().mockResolvedValue(resolvedValue);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  return chainable;
}

/**
 * Creates a mock supabase that handles the confirmation agent's DB access pattern:
 * - appointments: 1st call = select array (lookup), 2nd call = select single (details), 3rd call = update
 * - confirmation_queue: 1st call = select (lookup), 2nd call = update
 * - professionals: select single (for Google Calendar sync)
 */
function createConfirmationMockSupabase(options: {
  appointmentIds?: string[];
  queueAppointmentId?: string | null;
  updateError?: { message: string } | null;
  googleEventId?: string | null;
  professionalId?: string | null;
} = {}) {
  const {
    appointmentIds = ["appt-123"],
    queueAppointmentId = "appt-123",
    updateError = null,
    googleEventId = null,
    professionalId = null,
  } = options;

  const callCounts: Record<string, number> = {};

  const fromMock = vi.fn().mockImplementation((table: string) => {
    callCounts[table] = (callCounts[table] ?? 0) + 1;
    const callNum = callCounts[table];

    if (table === "appointments") {
      if (callNum === 1) {
        // findActiveConfirmationAppointment: select + eq + eq + in + order
        return createChainResolvingWith({
          data: appointmentIds.map((id) => ({ id })),
          error: null,
        });
      }
      // Subsequent calls: could be select(..).single() (detail fetch) or update(..).eq()
      // Return a dual-purpose mock that handles both patterns
      return createDualPurposeChainable({
        selectSingleData: {
          id: appointmentIds[0] ?? "appt-123",
          professional_id: professionalId,
          google_event_id: googleEventId,
        },
        updateError,
      });
    }

    if (table === "confirmation_queue") {
      if (callNum === 1) {
        // findActiveConfirmationAppointment: select + in + eq + order + limit + maybeSingle
        return createChainResolvingWithMaybeSingle({
          data: queueAppointmentId ? { appointment_id: queueAppointmentId } : null,
          error: null,
        });
      }
      // update: .update().eq().eq() resolves
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    }

    if (table === "professionals") {
      return createChainWithSingle({
        data: {
          google_calendar_id: "cal-123",
          google_refresh_token: "refresh-token",
        },
        error: null,
      });
    }

    return createChainable();
  });

  return { from: fromMock };
}

/**
 * Dual-purpose chainable: handles both `.select().eq().single()` (detail fetch)
 * and `.update().eq()` (update) patterns from the same mock.
 */
function createDualPurposeChainable(options: {
  selectSingleData: unknown;
  updateError?: { message: string } | null;
}) {
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};
  const resolvedSelect = { data: options.selectSingleData, error: null };
  const resolvedUpdate = { data: null, error: options.updateError ?? null };

  chainable.select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(resolvedSelect),
    }),
  });

  chainable.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(resolvedUpdate),
  });

  return chainable;
}

/** Chainable that resolves at the end of any chain (for array queries) */
function createChainResolvingWith(resolvedValue: { data: unknown; error: unknown }) {
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};

  // All chainable methods return themselves (resolved at terminal)
  const self = new Proxy(chainable, {
    get: (_target, prop: string) => {
      if (prop === "then") {
        // Make it thenable — resolves the chain
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      if (!chainable[prop]) {
        chainable[prop] = vi.fn().mockReturnValue(self);
      }
      return chainable[prop];
    },
  });

  return self;
}

/** Chainable that resolves via .maybeSingle() */
function createChainResolvingWithMaybeSingle(resolvedValue: { data: unknown; error: unknown }) {
  const chainable: MockChainable = {} as MockChainable;

  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.in = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.order = vi.fn().mockReturnValue(chainable);
  chainable.limit = vi.fn().mockReturnValue(chainable);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  return chainable;
}

function createToolCallContext(
  overrides?: Partial<ToolCallContext>
): ToolCallContext {
  return {
    supabase: createConfirmationMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-123",
    recipientId: "patient-456",
    clinicId: "clinic-789",
    ...overrides,
  };
}

// ── Tests ──

describe("confirmation agent", () => {
  // ── Registration tests ──

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
      expect(config).toBeDefined();
      expect(config!.supportedChannels).toContain("whatsapp");
    });
  });

  describe("getTools", () => {
    it("returns exactly 3 tools", () => {
      const config = getAgentType("confirmation")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      expect(tools).toHaveLength(3);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("confirmation")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("confirm_attendance");
      expect(names).toContain("reschedule_from_confirmation");
      expect(names).toContain("mark_no_show");
    });
  });

  // ── System prompt tests ──

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("confirmation")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "pt-BR",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("confirmacao") || lower.includes("consulta")
      ).toBe(true);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("confirmation")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "en",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("confirm") || lower.includes("appointment")
      ).toBe(true);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("confirmation")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "es",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("confirmacion") || lower.includes("cita")
      ).toBe(true);
    });
  });

  // ── Instructions tests ──

  describe("getInstructions", () => {
    it("returns instructions for pt-BR", () => {
      const config = getAgentType("confirmation")!;
      const instructions = config.getInstructions("professional", "pt-BR");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for en", () => {
      const config = getAgentType("confirmation")!;
      const instructions = config.getInstructions("professional", "en");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for es", () => {
      const config = getAgentType("confirmation")!;
      const instructions = config.getInstructions("professional", "es");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });

  // ── Tool handler tests ──

  describe("handleToolCall", () => {
    let config: NonNullable<ReturnType<typeof getAgentType>>;

    beforeEach(() => {
      config = getAgentType("confirmation")!;
      vi.clearAllMocks();
    });

    describe("confirm_attendance", () => {
      it("auto-resolves appointment and confirms it", async () => {
        const mockSupabase = createConfirmationMockSupabase({
          appointmentIds: ["appt-123"],
          queueAppointmentId: "appt-123",
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "confirm_attendance", args: {} },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("confirmed");

        // Verify appointments was queried (select) then updated
        expect(mockSupabase.from).toHaveBeenCalledWith("appointments");
        expect(mockSupabase.from).toHaveBeenCalledWith("confirmation_queue");
      });

      it("returns error when no appointment found", async () => {
        const mockSupabase = createConfirmationMockSupabase({
          appointmentIds: [],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "confirm_attendance", args: {} },
          context
        );

        expect(result.result).toContain("No pending appointment");
      });
    });

    describe("reschedule_from_confirmation", () => {
      it("auto-resolves appointment, cancels it, and returns routing data", async () => {
        const mockSupabase = createConfirmationMockSupabase({
          appointmentIds: ["appt-123"],
          queueAppointmentId: "appt-123",
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "reschedule_from_confirmation",
            args: { reason: "Cannot make it on that day" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("cancelled");
        expect(result.responseData).toBeDefined();
        expect(result.responseData!.routedTo).toBe("scheduling");
      });

      it("returns error when no appointment found", async () => {
        const mockSupabase = createConfirmationMockSupabase({
          appointmentIds: [],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "reschedule_from_confirmation",
            args: { reason: "busy" },
          },
          context
        );

        expect(result.result).toContain("No pending appointment");
      });
    });

    describe("mark_no_show", () => {
      it("auto-resolves appointment and marks as no-show", async () => {
        const mockSupabase = createConfirmationMockSupabase({
          appointmentIds: ["appt-123"],
          queueAppointmentId: "appt-123",
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "mark_no_show", args: {} },
          context
        );

        expect(result.result).toBeDefined();
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
