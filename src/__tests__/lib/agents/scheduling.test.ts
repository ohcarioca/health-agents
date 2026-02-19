import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (imported by engine.ts and process-message.ts)
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI (imported by engine.ts and router.ts)
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

// Mock scheduling availability module
vi.mock("@/lib/scheduling/availability", () => ({
  getAvailableSlots: vi.fn().mockReturnValue([
    { start: "2026-02-18T12:00:00.000Z", end: "2026-02-18T12:30:00.000Z" },
  ]),
  formatSlotsForLLM: vi.fn().mockReturnValue("Wednesday, February 18: 09:00"),
}));

// Mock Google Calendar service
vi.mock("@/services/google-calendar", () => ({
  getFreeBusy: vi.fn().mockResolvedValue({ success: true, busyBlocks: [] }),
  createEvent: vi.fn().mockResolvedValue({ success: true, eventId: "evt-123" }),
  updateEvent: vi.fn().mockResolvedValue({ success: true }),
  deleteEvent: vi.fn().mockResolvedValue({ success: true }),
}));

import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext, ToolCallResult } from "@/lib/agents";
import { getAvailableSlots } from "@/lib/scheduling/availability";

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

function createMockSupabase(
  tableOverrides: Record<string, MockChainable> = {}
) {
  const defaultChainable = createChainable();
  const fromMock = vi.fn().mockImplementation((table: string) => {
    return tableOverrides[table] ?? defaultChainable;
  });

  return { from: fromMock };
}

function createToolCallContext(
  overrides?: Partial<ToolCallContext>
): ToolCallContext {
  return {
    supabase: createMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-123",
    recipientId: "patient-456",
    clinicId: "clinic-789",
    ...overrides,
  };
}

// ── Tests ──

describe("scheduling agent", () => {
  // ── Registration tests ──

  describe("registration", () => {
    it("registers the 'scheduling' type in the global registry", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("scheduling");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'scheduling'", () => {
      const config = getAgentType("scheduling");
      expect(config).toBeDefined();
      expect(config!.type).toBe("scheduling");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      const config = getAgentType("scheduling");
      expect(config).toBeDefined();
      expect(config!.supportedChannels).toContain("whatsapp");
    });
  });

  describe("getTools", () => {
    it("returns exactly 6 tools", () => {
      const config = getAgentType("scheduling")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      expect(tools).toHaveLength(6);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("scheduling")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("check_availability");
      expect(names).toContain("book_appointment");
      expect(names).toContain("reschedule_appointment");
      expect(names).toContain("cancel_appointment");
      expect(names).toContain("list_patient_appointments");
      expect(names).toContain("escalate_to_human");
    });
  });

  // ── System prompt tests ──

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("scheduling")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "pt-BR",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("agendamento") || lower.includes("consulta")
      ).toBe(true);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("scheduling")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "en",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("appointment") || lower.includes("scheduling")
      ).toBe(true);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("scheduling")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "es",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("cita") || lower.includes("agendamiento")
      ).toBe(true);
    });
  });

  // ── Instructions tests ──

  describe("getInstructions", () => {
    it("returns instructions for pt-BR", () => {
      const config = getAgentType("scheduling")!;
      const instructions = config.getInstructions("professional", "pt-BR");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for en", () => {
      const config = getAgentType("scheduling")!;
      const instructions = config.getInstructions("professional", "en");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });

  // ── Tool handler tests ──

  describe("handleToolCall", () => {
    let config: NonNullable<ReturnType<typeof getAgentType>>;

    beforeEach(() => {
      config = getAgentType("scheduling")!;
      vi.clearAllMocks();
    });

    describe("check_availability", () => {
      it("returns available slots when professional has a schedule", async () => {
        const profChainable = createChainable({
          data: {
            schedule_grid: {
              monday: [{ start: "09:00", end: "17:00" }],
            },
            appointment_duration_minutes: 30,
            google_calendar_id: null,
            google_refresh_token: null,
          },
          error: null,
        });

        const appointmentsChainable = createChainable();
        // For the appointments query, the chain resolves via the last .lte()
        // which then resolves the promise (no .single()). We override the
        // chainable so the final promise-like call returns empty appointments.
        appointmentsChainable.lte = vi.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        const clinicChainable = createChainable({
          data: { timezone: "America/Sao_Paulo" },
          error: null,
        });

        const mockSupabase = createMockSupabase({
          professionals: profChainable,
          appointments: appointmentsChainable,
          clinics: clinicChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "check_availability",
            args: {
              professional_id: "prof-123",
              date: "2026-02-18",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("Available slots");
        expect(result.result).toContain("1 found");
      });

      it("returns no available slots when professional has no schedule", async () => {
        // Mock getAvailableSlots to return empty for this test
        vi.mocked(getAvailableSlots).mockReturnValueOnce([]);

        const profChainable = createChainable({
          data: {
            schedule_grid: {},
            appointment_duration_minutes: 30,
            google_calendar_id: null,
            google_refresh_token: null,
          },
          error: null,
        });

        const appointmentsChainable = createChainable();
        appointmentsChainable.lte = vi.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        const clinicChainable = createChainable({
          data: { timezone: "America/Sao_Paulo" },
          error: null,
        });

        const mockSupabase = createMockSupabase({
          professionals: profChainable,
          appointments: appointmentsChainable,
          clinics: clinicChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          {
            name: "check_availability",
            args: {
              professional_id: "prof-123",
              date: "2026-02-18",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("No available slots");
      });
    });

    describe("book_appointment", () => {
      it("books an appointment when no conflicts exist", async () => {
        // Conflicts query: no conflicts found
        const conflictsChainable = createChainable();
        conflictsChainable.limit = vi.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        // Insert query: returns new appointment
        const insertChainable = createChainable({
          data: { id: "appt-new-123" },
          error: null,
        });

        // Professional query for Google Calendar sync
        const profChainable = createChainable({
          data: {
            name: "Dr. Smith",
            google_calendar_id: null,
            google_refresh_token: null,
          },
          error: null,
        });

        // We need appointments.from to return different chainables for
        // the conflict check (first call) and the insert (second call).
        // Since both query "appointments", we use a call-counting approach.
        let appointmentCallCount = 0;
        const appointmentsHandler = (): MockChainable => {
          appointmentCallCount++;
          if (appointmentCallCount === 1) {
            return conflictsChainable;
          }
          // Second call is the insert + select + single
          return insertChainable;
        };

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "appointments") {
            return appointmentsHandler();
          }
          if (table === "professionals") {
            return profChainable;
          }
          return createChainable();
        });

        const mockSupabase = { from: mockFromFn };

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          {
            name: "book_appointment",
            args: {
              professional_id: "prof-123",
              starts_at: "2026-02-18T12:00:00.000Z",
              ends_at: "2026-02-18T12:30:00.000Z",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("booked");
      });

      it("returns error when a conflict exists", async () => {
        const conflictsChainable = createChainable();
        conflictsChainable.limit = vi.fn().mockResolvedValue({
          data: [{ id: "existing-appt" }],
          error: null,
        });

        const mockSupabase = createMockSupabase({
          appointments: conflictsChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          {
            name: "book_appointment",
            args: {
              professional_id: "prof-123",
              starts_at: "2026-02-18T12:00:00.000Z",
              ends_at: "2026-02-18T12:30:00.000Z",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("already booked");
      });
    });

    describe("cancel_appointment", () => {
      it("cancels an existing appointment successfully", async () => {
        // First call: fetch existing appointment (select + eq + eq + single)
        const fetchChainable = createChainable({
          data: {
            id: "appt-456",
            patient_id: "patient-456",
            professional_id: "prof-123",
            google_event_id: null,
          },
          error: null,
        });

        // Second call: update status (update + eq)
        const updateChainable = createChainable();
        updateChainable.eq = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });

        let appointmentCallCount = 0;
        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "appointments") {
            appointmentCallCount++;
            if (appointmentCallCount === 1) {
              return fetchChainable;
            }
            return updateChainable;
          }
          return createChainable();
        });

        const mockSupabase = { from: mockFromFn };

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          {
            name: "cancel_appointment",
            args: {
              appointment_id: "appt-456",
              reason: "Patient requested cancellation",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("cancelled successfully");
        expect(result.result).toContain("Patient requested cancellation");
      });
    });

    describe("list_patient_appointments", () => {
      it("returns a formatted list when appointments exist", async () => {
        // First call: list appointments
        const listChainable = createChainable();
        listChainable.order = vi.fn().mockResolvedValue({
          data: [
            {
              id: "appt-1",
              starts_at: "2026-02-20T14:00:00.000Z",
              ends_at: "2026-02-20T14:30:00.000Z",
              status: "scheduled",
              professional_id: "prof-1",
              service_id: "svc-1",
            },
            {
              id: "appt-2",
              starts_at: "2026-02-22T10:00:00.000Z",
              ends_at: "2026-02-22T10:30:00.000Z",
              status: "confirmed",
              professional_id: "prof-2",
              service_id: null,
            },
          ],
          error: null,
        });

        // Second call: professionals lookup
        const profChainable = createChainable();
        profChainable.in = vi.fn().mockResolvedValue({
          data: [
            { id: "prof-1", name: "Dr. Ana" },
            { id: "prof-2", name: "Dr. Carlos" },
          ],
          error: null,
        });

        // Third call: services lookup
        const svcChainable = createChainable();
        svcChainable.in = vi.fn().mockResolvedValue({
          data: [{ id: "svc-1", name: "General Consultation" }],
          error: null,
        });

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "appointments") {
            return listChainable;
          }
          if (table === "professionals") {
            return profChainable;
          }
          if (table === "services") {
            return svcChainable;
          }
          return createChainable();
        });

        const mockSupabase = { from: mockFromFn };

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "list_patient_appointments", args: {} },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("Upcoming appointments (2)");
        expect(result.result).toContain("Dr. Ana");
        expect(result.result).toContain("Dr. Carlos");
        expect(result.result).toContain("General Consultation");
      });

      it("returns no appointments message when list is empty", async () => {
        const listChainable = createChainable();
        listChainable.order = vi.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        const mockSupabase = createMockSupabase({
          appointments: listChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "list_patient_appointments", args: {} },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("No upcoming appointments");
      });
    });

    describe("escalate_to_human", () => {
      it("returns result message and sets newConversationStatus to 'escalated'", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          {
            name: "escalate_to_human",
            args: { reason: "Patient requested human agent" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("escalated");
        expect(result.result).toContain("Patient requested human agent");
        expect(result.newConversationStatus).toBe("escalated");
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
