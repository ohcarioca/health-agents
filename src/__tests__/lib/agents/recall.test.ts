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

describe("recall agent", () => {
  // ── Registration tests ──

  describe("registration", () => {
    it("registers the 'recall' type in the global registry", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("recall");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'recall'", () => {
      const config = getAgentType("recall");
      expect(config).toBeDefined();
      expect(config!.type).toBe("recall");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      const config = getAgentType("recall");
      expect(config).toBeDefined();
      expect(config!.supportedChannels).toContain("whatsapp");
    });
  });

  // ── Tools tests ──

  describe("getTools", () => {
    it("returns exactly 3 tools", () => {
      const config = getAgentType("recall")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      expect(tools).toHaveLength(3);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("recall")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("send_reactivation_message");
      expect(names).toContain("route_to_scheduling");
      expect(names).toContain("mark_patient_inactive");
    });
  });
  // ── System prompt tests ──

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("recall")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "pt-BR",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("reativa") ||
          lower.includes("retorno") ||
          lower.includes("paciente")
      ).toBe(true);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("recall")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "en",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("reactivat") ||
          lower.includes("return") ||
          lower.includes("patient")
      ).toBe(true);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("recall")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "es",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("reactiv") ||
          lower.includes("retorno") ||
          lower.includes("paciente")
      ).toBe(true);
    });
  });

  // ── Instructions tests ──

  describe("getInstructions", () => {
    it("returns instructions for pt-BR", () => {
      const config = getAgentType("recall")!;
      const instructions = config.getInstructions("professional", "pt-BR");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for en", () => {
      const config = getAgentType("recall")!;
      const instructions = config.getInstructions("professional", "en");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for es", () => {
      const config = getAgentType("recall")!;
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
      config = getAgentType("recall")!;
      vi.clearAllMocks();
    });

    describe("route_to_scheduling", () => {
      it("updates status and returns responseData with routedTo scheduling", async () => {
        const mockSupabase = createMockSupabase();

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "route_to_scheduling",
            args: { recall_id: "recall-123" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.responseData).toBeDefined();
        expect(result.responseData!.routedTo).toBe("scheduling");
        expect(mockSupabase.from).toHaveBeenCalledWith("recall_queue");
      });
    });

    describe("mark_patient_inactive", () => {
      it("records opt-out and returns result containing opt", async () => {
        const mockSupabase = createMockSupabase();

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "mark_patient_inactive",
            args: { recall_id: "recall-123", reason: "Patient moved away" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result!.toLowerCase()).toContain("opt");
        expect(mockSupabase.from).toHaveBeenCalledWith("recall_queue");
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
