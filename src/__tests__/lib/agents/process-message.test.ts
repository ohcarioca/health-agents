import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (imported by engine.ts, process-message.ts, router.ts)
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI (imported by engine.ts and router.ts)
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

// Mock WhatsApp service
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock engine — returns a canned response
vi.mock("@/lib/agents/engine", () => ({
  chatWithToolLoop: vi.fn().mockResolvedValue({
    responseText: "Hello! How can I help you today?",
    toolCallCount: 0,
    toolCallNames: [],
  }),
}));

// Mock router
vi.mock("@/lib/agents/router", () => ({
  routeMessage: vi.fn().mockResolvedValue({
    module: "support",
    reason: "test",
  }),
}));

// ── Mock Supabase ──

// Call counter to distinguish sequential calls to the same table
let patientSelectCallCount = 0;
let messagesSelectCallCount = 0;
let insertedPatientName: string | undefined;

function createMockSupabase(options?: {
  patientExists?: boolean;
  patientInsertError?: { code: string; message: string } | null;
  raceConditionPatient?: boolean;
}) {
  const {
    patientExists = false,
    patientInsertError = null,
    raceConditionPatient = false,
  } = options ?? {};

  patientSelectCallCount = 0;
  messagesSelectCallCount = 0;
  insertedPatientName = undefined;

  const mockPatient = patientExists
    ? {
        id: "patient-123",
        name: "Existing Patient",
        phone: "5511999990000",
        notes: null,
        custom_fields: null,
      }
    : null;

  const racePatient = {
    id: "patient-race-123",
    name: "Race Patient",
    phone: "5511999990000",
    notes: null,
    custom_fields: null,
  };

  const fromMock = vi.fn().mockImplementation((table: string) => {
    // ── messages table ──
    if (table === "messages") {
      messagesSelectCallCount++;
      const currentCall = messagesSelectCallCount;

      return {
        // select path (idempotency check + history)
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              // maybeSingle for idempotency check
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
            // order for history
            order: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
          })),
        })),
        // insert path (save incoming + assistant messages)
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: `msg-${currentCall}` },
              error: null,
            }),
          }),
        }),
      };
    }

    // ── patients table ──
    if (table === "patients") {
      patientSelectCallCount++;
      const currentCall = patientSelectCallCount;

      return {
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              // maybeSingle for initial lookup (call 1)
              maybeSingle: vi.fn().mockResolvedValue({
                data: currentCall === 1 ? mockPatient : null,
                error: null,
              }),
              // single for race condition re-query
              single: vi.fn().mockResolvedValue({
                data: raceConditionPatient ? racePatient : null,
                error: raceConditionPatient
                  ? null
                  : { message: "not found" },
              }),
            })),
          })),
        })),
        insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
          insertedPatientName = data.name as string;
          if (patientInsertError) {
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: patientInsertError,
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "patient-new-123",
                  name: data.name,
                  phone: data.phone,
                  notes: null,
                  custom_fields: null,
                },
                error: null,
              }),
            }),
          };
        }),
      };
    }

    // ── conversations table ──
    if (table === "conversations") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "conv-new-123" },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }

    // ── agents table ──
    if (table === "agents") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "agent-1",
                    name: "Support Agent",
                    description: "A support agent",
                    instructions: null,
                    config: {},
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }

    // ── clinics table ──
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
                whatsapp_phone_number_id: "phone-id-123",
                whatsapp_access_token: "token-123",
              },
              error: null,
            }),
          }),
        }),
      };
    }

    // ── module_configs table ──
    if (table === "module_configs") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { settings: {} },
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    // ── insurance_plans table ──
    if (table === "insurance_plans") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ name: "Unimed" }],
            error: null,
          }),
        }),
      };
    }

    // ── services table ──
    if (table === "services") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ name: "Consulta" }],
            error: null,
          }),
        }),
      };
    }

    // ── professionals table ──
    if (table === "professionals") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: "prof-1", name: "Dr. Silva", specialty: "Cardiologia" },
              ],
              error: null,
            }),
          }),
        }),
      };
    }

    // ── message_queue table ──
    if (table === "message_queue") {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "queue-1" },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }

    // Default fallback
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
  });

  return { from: fromMock };
}

// Mock createAdminClient
let mockSupabaseInstance: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabaseInstance),
}));

// Import from barrel AFTER mocks
import { processMessage, buildSystemPrompt } from "@/lib/agents";
import type { AgentTypeConfig, RecipientContext, SystemPromptParams } from "@/lib/agents";

// ── Tests ──

describe("processMessage — auto-register patient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-creates patient when phone not found", async () => {
    mockSupabaseInstance = createMockSupabase({ patientExists: false });

    const result = await processMessage({
      phone: "5511999990000",
      message: "Ola, bom dia",
      externalId: "ext-001",
      clinicId: "clinic-1",
      contactName: "Maria Silva",
    });

    // Should return a non-empty result (message was processed)
    expect(result.responseText).toBeTruthy();
    expect(result.conversationId).toBeTruthy();
    expect(result.module).toBe("support");
  });

  it("uses contactName for patient name", async () => {
    mockSupabaseInstance = createMockSupabase({ patientExists: false });

    await processMessage({
      phone: "5511999990000",
      message: "Ola",
      externalId: "ext-002",
      clinicId: "clinic-1",
      contactName: "Joao Pereira",
    });

    // Verify the insert was called with the contactName
    expect(insertedPatientName).toBe("Joao Pereira");
  });

  it("falls back to phone when contactName is missing", async () => {
    mockSupabaseInstance = createMockSupabase({ patientExists: false });

    await processMessage({
      phone: "5511999990000",
      message: "Ola",
      externalId: "ext-003",
      clinicId: "clinic-1",
      // no contactName
    });

    // Verify the insert used the normalized phone as name
    expect(insertedPatientName).toBe("5511999990000");
  });

  it("falls back to phone when contactName is whitespace only", async () => {
    mockSupabaseInstance = createMockSupabase({ patientExists: false });

    await processMessage({
      phone: "5511999990000",
      message: "Ola",
      externalId: "ext-004",
      clinicId: "clinic-1",
      contactName: "   ",
    });

    // trim() makes it empty, so falls back to phone
    expect(insertedPatientName).toBe("5511999990000");
  });

  it("handles race condition (23505 unique constraint) by re-querying", async () => {
    mockSupabaseInstance = createMockSupabase({
      patientExists: false,
      patientInsertError: { code: "23505", message: "duplicate key" },
      raceConditionPatient: true,
    });

    const result = await processMessage({
      phone: "5511999990000",
      message: "Ola",
      externalId: "ext-005",
      clinicId: "clinic-1",
      contactName: "Race Test",
    });

    // Should succeed by re-querying after the conflict
    expect(result.responseText).toBeTruthy();
    expect(result.conversationId).toBeTruthy();
  });

  it("returns empty result on non-23505 insert error", async () => {
    mockSupabaseInstance = createMockSupabase({
      patientExists: false,
      patientInsertError: { code: "42000", message: "some other error" },
    });

    const result = await processMessage({
      phone: "5511999990000",
      message: "Ola",
      externalId: "ext-006",
      clinicId: "clinic-1",
      contactName: "Error Test",
    });

    // Should return empty result (processing aborted)
    expect(result.responseText).toBe("");
    expect(result.conversationId).toBe("");
    expect(result.queued).toBe(false);
  });

  it("force-routes new patient to support module", async () => {
    mockSupabaseInstance = createMockSupabase({ patientExists: false });

    const result = await processMessage({
      phone: "5511999990000",
      message: "Quero agendar uma consulta",
      externalId: "ext-007",
      clinicId: "clinic-1",
      contactName: "New Patient",
    });

    // New patients should be routed to support regardless of message content
    expect(result.module).toBe("support");
  });
});

describe("buildSystemPrompt — new patient context injection", () => {
  it("includes NEW PATIENT line when isNewPatient is true", () => {
    const mockAgentConfig: AgentTypeConfig = {
      type: "test-agent",
      buildSystemPrompt: () => "You are a test agent.",
      getInstructions: () => "Test instructions",
      getTools: () => [],
      handleToolCall: async () => ({}),
      supportedChannels: ["whatsapp"],
    };

    const params: SystemPromptParams = {
      agentName: "Test Agent",
      tone: "professional",
      locale: "pt-BR",
    };

    const recipient: RecipientContext = {
      id: "patient-1",
      firstName: "Maria",
      fullName: "Maria Silva",
      phone: "5511999990000",
      isNewPatient: true,
    };

    const prompt = buildSystemPrompt(mockAgentConfig, params, recipient);

    expect(prompt).toContain("NEW PATIENT");
    expect(prompt).toContain("first contact");
    expect(prompt).toContain("Maria Silva");
  });

  it("does NOT include NEW PATIENT line when isNewPatient is false", () => {
    const mockAgentConfig: AgentTypeConfig = {
      type: "test-agent",
      buildSystemPrompt: () => "You are a test agent.",
      getInstructions: () => "Test instructions",
      getTools: () => [],
      handleToolCall: async () => ({}),
      supportedChannels: ["whatsapp"],
    };

    const params: SystemPromptParams = {
      agentName: "Test Agent",
      tone: "professional",
      locale: "pt-BR",
    };

    const recipient: RecipientContext = {
      id: "patient-1",
      firstName: "Maria",
      fullName: "Maria Silva",
      phone: "5511999990000",
      isNewPatient: false,
    };

    const prompt = buildSystemPrompt(mockAgentConfig, params, recipient);

    expect(prompt).not.toContain("NEW PATIENT");
    expect(prompt).toContain("Maria Silva");
  });

  it("does NOT include NEW PATIENT line when isNewPatient is undefined", () => {
    const mockAgentConfig: AgentTypeConfig = {
      type: "test-agent",
      buildSystemPrompt: () => "You are a test agent.",
      getInstructions: () => "Test instructions",
      getTools: () => [],
      handleToolCall: async () => ({}),
      supportedChannels: ["whatsapp"],
    };

    const params: SystemPromptParams = {
      agentName: "Test Agent",
      tone: "professional",
      locale: "pt-BR",
    };

    const recipient: RecipientContext = {
      id: "patient-1",
      firstName: "Maria",
      fullName: "Maria Silva",
      phone: "5511999990000",
    };

    const prompt = buildSystemPrompt(mockAgentConfig, params, recipient);

    expect(prompt).not.toContain("NEW PATIENT");
  });
});
