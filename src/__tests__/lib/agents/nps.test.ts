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

describe("nps agent", () => {
  // ── Registration tests ──

  describe("registration", () => {
    it("registers the 'nps' type in the global registry", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("nps");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'nps'", () => {
      const config = getAgentType("nps");
      expect(config).toBeDefined();
      expect(config!.type).toBe("nps");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      const config = getAgentType("nps");
      expect(config).toBeDefined();
      expect(config!.supportedChannels).toContain("whatsapp");
    });
  });

  // ── Tools tests ──

  describe("getTools", () => {
    it("returns exactly 4 tools", () => {
      const config = getAgentType("nps")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      expect(tools).toHaveLength(4);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("nps")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("collect_nps_score");
      expect(names).toContain("collect_nps_comment");
      expect(names).toContain("redirect_to_google_reviews");
      expect(names).toContain("alert_detractor");
    });
  });

  // ── System prompt tests ──

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("nps")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "pt-BR",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("satisfa") ||
          lower.includes("avalia") ||
          lower.includes("pesquisa") ||
          lower.includes("nps")
      ).toBe(true);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("nps")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "en",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("satisfaction") ||
          lower.includes("survey") ||
          lower.includes("nps")
      ).toBe(true);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("nps")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "es",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("satisfacci") ||
          lower.includes("encuesta") ||
          lower.includes("nps")
      ).toBe(true);
    });
  });

  // ── Instructions tests ──

  describe("getInstructions", () => {
    it("returns instructions for pt-BR", () => {
      const config = getAgentType("nps")!;
      const instructions = config.getInstructions("professional", "pt-BR");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for en", () => {
      const config = getAgentType("nps")!;
      const instructions = config.getInstructions("professional", "en");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for es", () => {
      const config = getAgentType("nps")!;
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
      config = getAgentType("nps")!;
      vi.clearAllMocks();
    });

    describe("collect_nps_score", () => {
      it("records a promoter score (10) and hints to redirect to Google Reviews", async () => {
        // .update().eq("appointment_id").eq("clinic_id") — second eq resolves
        const secondEq = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockReturnValue({ eq: secondEq });

        const mockSupabase = createMockSupabase({
          nps_responses: npsChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "collect_nps_score",
            args: {
              appointment_id: "appt-123",
              score: 10,
            },
          },
          context
        );

        expect(result.result).toBeDefined();
      });

      it("records a detractor score (3) and hints to alert", async () => {
        const secondEq = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockReturnValue({ eq: secondEq });

        const mockSupabase = createMockSupabase({
          nps_responses: npsChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "collect_nps_score",
            args: {
              appointment_id: "appt-123",
              score: 3,
            },
          },
          context
        );

        expect(result.result).toBeDefined();
      });
    });

    describe("collect_nps_comment", () => {
      it("records the comment and returns confirmation", async () => {
        // .update().eq("appointment_id").eq("clinic_id") — second eq resolves
        const secondEq = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockReturnValue({ eq: secondEq });

        const mockSupabase = createMockSupabase({
          nps_responses: npsChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "collect_nps_comment",
            args: {
              appointment_id: "appt-123",
              comment: "Great experience!",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("recorded");
      });
    });

    describe("redirect_to_google_reviews", () => {
      it("returns the Google Reviews URL when configured", async () => {
        const clinicChainable = createChainable({
          data: { google_reviews_url: "https://g.page/r/example/review" },
          error: null,
        });

        // .update().eq("appointment_id").eq("clinic_id") — second eq resolves
        const secondEq = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockReturnValue({ eq: secondEq });

        const mockFromFn = vi
          .fn()
          .mockImplementation((table: string) => {
            if (table === "clinics") return clinicChainable;
            if (table === "nps_responses") return npsChainable;
            return createChainable();
          });

        const mockSupabase = { from: mockFromFn };

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "redirect_to_google_reviews",
            args: {
              appointment_id: "appt-123",
            },
          },
          context
        );

        expect(result.appendToResponse).toBeDefined();
        expect(result.appendToResponse).toContain(
          "https://g.page/r/example/review"
        );
      });

      it("returns 'not configured' when no Google Reviews URL exists", async () => {
        const clinicChainable = createChainable({
          data: { google_reviews_url: null },
          error: null,
        });

        const mockSupabase = createMockSupabase({
          clinics: clinicChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "redirect_to_google_reviews",
            args: {
              appointment_id: "appt-123",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("not configured");
      });
    });

    describe("alert_detractor", () => {
      it("registers the detractor alert", async () => {
        // .update().eq("appointment_id").eq("clinic_id") — second eq resolves
        const secondEq = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        const npsChainable = createChainable();
        npsChainable.eq = vi.fn().mockReturnValue({ eq: secondEq });

        const mockSupabase = createMockSupabase({
          nps_responses: npsChainable,
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "alert_detractor",
            args: {
              appointment_id: "appt-123",
              score: 3,
              comment: "Poor service",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("alert");
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
