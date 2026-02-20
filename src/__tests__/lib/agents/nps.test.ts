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

/**
 * Creates a chainable Supabase mock where ALL methods return `this`
 * and terminal methods (single, maybeSingle) resolve to `resolvedValue`.
 */
function createChainable(
  resolvedValue: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  }
) {
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "neq", "in", "is", "lt", "gt", "gte", "lte",
    "order", "limit", "filter",
  ];

  for (const method of methods) {
    chainable[method] = vi.fn().mockReturnValue(chainable);
  }

  chainable.single = vi.fn().mockResolvedValue(resolvedValue);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  return chainable;
}

/**
 * Creates a mock Supabase client with per-table chainable overrides.
 * For tables called multiple times, pass an array — responses are consumed in order.
 */
function createMockSupabase(
  tableOverrides: Record<string, ReturnType<typeof createChainable> | ReturnType<typeof createChainable>[]> = {}
) {
  const callCounters: Record<string, number> = {};

  const fromMock = vi.fn().mockImplementation((table: string) => {
    const override = tableOverrides[table];
    if (!override) return createChainable();

    if (Array.isArray(override)) {
      const idx = callCounters[table] ?? 0;
      callCounters[table] = idx + 1;
      return override[idx] ?? createChainable();
    }

    return override;
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
        // 1st call: resolveNpsResponse → returns pending NPS row
        const resolveChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        // 2nd call: update score
        const updateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          nps_responses: [resolveChainable, updateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "collect_nps_score", args: { score: 10 } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("promoter");
      });

      it("records a detractor score (3) and hints to alert", async () => {
        const resolveChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        const updateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          nps_responses: [resolveChainable, updateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "collect_nps_score", args: { score: 3 } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("detractor");
      });

      it("records a neutral score (7)", async () => {
        const resolveChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        const updateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          nps_responses: [resolveChainable, updateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "collect_nps_score", args: { score: 7 } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("neutral");
      });

      it("rounds decimal scores to nearest integer", async () => {
        const resolveChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        const updateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          nps_responses: [resolveChainable, updateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "collect_nps_score", args: { score: 9.5 } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("promoter");
      });

      it("returns error when no pending NPS survey exists", async () => {
        const resolveChainable = createChainable({
          data: null,
          error: null,
        });

        const mockSupabase = createMockSupabase({
          nps_responses: [resolveChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "collect_nps_score", args: { score: 8 } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("No pending NPS survey");
      });
    });

    describe("collect_nps_comment", () => {
      it("records the comment and returns confirmation", async () => {
        // 1st call: find most recent NPS response
        const findChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        // 2nd call: update comment
        const updateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          nps_responses: [findChainable, updateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "collect_nps_comment",
            args: { comment: "Great experience!" },
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
        const npsResolveChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        const npsUpdateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          clinics: clinicChainable,
          nps_responses: [npsResolveChainable, npsUpdateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          { name: "redirect_to_google_reviews", args: {} },
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
          { name: "redirect_to_google_reviews", args: {} },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("not configured");
      });
    });

    describe("alert_detractor", () => {
      it("registers the detractor alert", async () => {
        const npsResolveChainable = createChainable({
          data: { appointment_id: "appt-123" },
          error: null,
        });
        const npsUpdateChainable = createChainable();

        const mockSupabase = createMockSupabase({
          nps_responses: [npsResolveChainable, npsUpdateChainable],
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "alert_detractor",
            args: { score: 3, comment: "Poor service" },
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
