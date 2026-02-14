import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (imported by engine.ts and process-message.ts)
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI (imported by engine.ts and router.ts)
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext, ToolCallResult } from "@/lib/agents";

// ── Mock Supabase factory ──

function createMockSupabase() {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === "clinics") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                name: "Test Clinic",
                phone: "1199998888",
                address: "Rua Test, 123",
                timezone: "America/Sao_Paulo",
                operating_hours: null,
              },
              error: null,
            }),
          }),
        }),
      };
    }

    // insurance_plans and services return arrays (no .single())
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data:
            table === "insurance_plans"
              ? [{ name: "Unimed" }]
              : [{ name: "Consulta" }],
          error: null,
        }),
      }),
    };
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

describe("basic-support agent", () => {
  describe("registration", () => {
    it("registers the 'support' type in the global registry", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("support");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'support'", () => {
      const config = getAgentType("support");
      expect(config).toBeDefined();
      expect(config!.type).toBe("support");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      const config = getAgentType("support");
      expect(config).toBeDefined();
      expect(config!.supportedChannels).toEqual(["whatsapp"]);
    });
  });

  describe("getTools", () => {
    it("returns exactly 3 tools", () => {
      const config = getAgentType("support")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      expect(tools).toHaveLength(3);
    });

    it("returns tools named get_clinic_info, escalate_to_human, and route_to_module", () => {
      const config = getAgentType("support")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("get_clinic_info");
      expect(names).toContain("escalate_to_human");
      expect(names).toContain("route_to_module");
    });
  });

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("support")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "pt-BR",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("assistente") || lower.includes("suporte")
      ).toBe(true);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("support")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "en",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("assistant") || lower.includes("support")
      ).toBe(true);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("support")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "es",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("asistente") || lower.includes("soporte")
      ).toBe(true);
    });
  });

  describe("getInstructions", () => {
    it("returns instructions for pt-BR", () => {
      const config = getAgentType("support")!;
      const instructions = config.getInstructions("professional", "pt-BR");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for en", () => {
      const config = getAgentType("support")!;
      const instructions = config.getInstructions("professional", "en");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for es", () => {
      const config = getAgentType("support")!;
      const instructions = config.getInstructions("professional", "es");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });

  describe("handleToolCall", () => {
    let config: NonNullable<ReturnType<typeof getAgentType>>;

    beforeEach(() => {
      config = getAgentType("support")!;
    });

    describe("get_clinic_info", () => {
      it("queries Supabase and returns clinic info as result string", async () => {
        const context = createToolCallContext();
        const result: ToolCallResult = await config.handleToolCall(
          { name: "get_clinic_info", args: {} },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("Test Clinic");
        expect(result.result).toContain("1199998888");
        expect(result.result).toContain("Rua Test, 123");
        expect(result.result).toContain("America/Sao_Paulo");
        expect(result.result).toContain("Unimed");
        expect(result.result).toContain("Consulta");
      });

      it("calls supabase.from with correct table names", async () => {
        const context = createToolCallContext();
        const supabase = context.supabase as unknown as { from: ReturnType<typeof vi.fn> };

        await config.handleToolCall(
          { name: "get_clinic_info", args: {} },
          context
        );

        expect(supabase.from).toHaveBeenCalledWith("clinics");
        expect(supabase.from).toHaveBeenCalledWith("insurance_plans");
        expect(supabase.from).toHaveBeenCalledWith("services");
      });

      it("returns error message when clinic query fails", async () => {
        const mockSupabase = {
          from: vi.fn().mockImplementation((table: string) => {
            if (table === "clinics") {
              return {
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: "Clinic not found" },
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
          }),
        };

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "get_clinic_info", args: {} },
          context
        );

        expect(result.result).toContain("Failed to retrieve clinic information");
        expect(result.result).toContain("Clinic not found");
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

      it("handles missing reason gracefully", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          { name: "escalate_to_human", args: {} },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.newConversationStatus).toBe("escalated");
      });
    });

    describe("route_to_module", () => {
      it("returns result and responseData with routedTo and routeContext", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          {
            name: "route_to_module",
            args: {
              module: "scheduling",
              context: "Patient wants to book an appointment",
            },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("Patient wants to book an appointment");
        expect(result.responseData).toBeDefined();
        expect(result.responseData!.routedTo).toBe("scheduling");
        expect(result.responseData!.routeContext).toBe(
          "Patient wants to book an appointment"
        );
      });

      it("handles missing context gracefully", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          { name: "route_to_module", args: { module: "billing" } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.responseData).toBeDefined();
        expect(result.responseData!.routedTo).toBe("billing");
        expect(result.responseData!.routeContext).toBe("");
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
