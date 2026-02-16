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

// Mock Asaas service
vi.mock("@/services/asaas", () => ({
  createCustomer: vi.fn().mockResolvedValue({ success: true, customerId: "cus_abc" }),
  createCharge: vi.fn().mockResolvedValue({
    success: true,
    chargeId: "pay_abc",
    invoiceUrl: "https://www.asaas.com/i/abc123",
    bankSlipUrl: "https://www.asaas.com/b/pdf/abc123",
  }),
  getChargeStatus: vi.fn().mockResolvedValue({
    success: true,
    status: "RECEIVED",
    paymentDate: "2026-02-14",
  }),
  getPixQrCode: vi.fn().mockResolvedValue({
    success: true,
    payload: "00020126580014br.gov.bcb.pix...",
  }),
  getBoletoIdentificationField: vi.fn().mockResolvedValue({
    success: true,
    identificationField: "001900000...",
  }),
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
 * Creates a mock Supabase client for billing agent tests.
 * Handles table-specific mock behavior for invoices, payment_links,
 * patients, and conversations.
 */
function createBillingMockSupabase(options: {
  invoiceData?: Record<string, unknown> | null;
  paymentLinkData?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
} = {}) {
  const {
    invoiceData = {
      id: "inv-123",
      amount_cents: 15000,
      due_date: "2026-03-01",
      description: "Consulta",
      clinic_id: "clinic-789",
      status: "pending",
      patients: {
        id: "patient-456",
        name: "Maria Silva",
        phone: "5511999999999",
        email: "maria@example.com",
        cpf: "12345678900",
        asaas_customer_id: null,
      },
    },
    paymentLinkData = {
      id: "pl-123",
      asaas_payment_id: "pay_abc",
      method: "pix",
      status: "active",
    },
    updateError = null,
  } = options;

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === "invoices") {
      const chain = createChainable({ data: invoiceData, error: null });
      return chain;
    }

    if (table === "payment_links") {
      const chain = createChainable({ data: paymentLinkData, error: null });
      return chain;
    }

    if (table === "patients") {
      return createChainable({ data: null, error: updateError });
    }

    if (table === "conversations") {
      return createChainable({ data: null, error: null });
    }

    return createChainable();
  });

  return { from: fromMock };
}

function createToolCallContext(
  overrides?: Partial<ToolCallContext>
): ToolCallContext {
  return {
    supabase: createBillingMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-123",
    recipientId: "patient-456",
    clinicId: "clinic-789",
    ...overrides,
  };
}

// ── Tests ──

describe("billing agent", () => {
  // ── Registration tests ──

  describe("registration", () => {
    it("registers the 'billing' type in the global registry", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("billing");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'billing'", () => {
      const config = getAgentType("billing");
      expect(config).toBeDefined();
      expect(config!.type).toBe("billing");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      const config = getAgentType("billing");
      expect(config).toBeDefined();
      expect(config!.supportedChannels).toContain("whatsapp");
    });
  });

  describe("getTools", () => {
    it("returns exactly 4 tools", () => {
      const config = getAgentType("billing")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      expect(tools).toHaveLength(5);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("billing")!;
      const tools = config.getTools({
        clinicId: "clinic-789",
        conversationId: "conv-123",
        locale: "pt-BR",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("list_patient_invoices");
      expect(names).toContain("create_payment_link");
      expect(names).toContain("check_payment_status");
      expect(names).toContain("send_payment_reminder");
      expect(names).toContain("escalate_billing");
    });
  });

  // ── System prompt tests ──

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("billing")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "pt-BR",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("pagamento") || lower.includes("cobran") || lower.includes("fatura")
      ).toBe(true);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("billing")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "en",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("payment") || lower.includes("billing") || lower.includes("invoice")
      ).toBe(true);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("billing")!;
      const prompt = config.buildSystemPrompt({
        agentName: "Test Agent",
        tone: "professional",
        locale: "es",
      });
      const lower = prompt.toLowerCase();
      expect(
        lower.includes("pago") || lower.includes("cobro") || lower.includes("factura")
      ).toBe(true);
    });
  });

  // ── Instructions tests ──

  describe("getInstructions", () => {
    it("returns instructions for pt-BR", () => {
      const config = getAgentType("billing")!;
      const instructions = config.getInstructions("professional", "pt-BR");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for en", () => {
      const config = getAgentType("billing")!;
      const instructions = config.getInstructions("professional", "en");
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for es", () => {
      const config = getAgentType("billing")!;
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
      config = getAgentType("billing")!;
      vi.clearAllMocks();
    });

    describe("create_payment_link", () => {
      it("creates a payment link and returns URL in appendToResponse", async () => {
        const mockSupabase = createBillingMockSupabase();

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "create_payment_link",
            args: { invoice_id: "inv-123", method: "pix" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("Payment link created");
        expect(result.appendToResponse).toBeDefined();
        expect(result.appendToResponse).toContain("https://www.asaas.com/i/abc123");
        expect(mockSupabase.from).toHaveBeenCalledWith("invoices");
        expect(mockSupabase.from).toHaveBeenCalledWith("payment_links");
      });
    });

    describe("check_payment_status", () => {
      it("checks payment status and returns RECEIVED", async () => {
        const mockSupabase = createBillingMockSupabase();

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "check_payment_status",
            args: { invoice_id: "inv-123" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("RECEIVED");
      });
    });

    describe("send_payment_reminder", () => {
      it("returns reminder guidance with amount info", async () => {
        const mockSupabase = createBillingMockSupabase();

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "send_payment_reminder",
            args: { invoice_id: "inv-123", tone: "gentle" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("reminder");
        expect(result.result).toContain("R$");
      });

      it("returns already paid message for paid invoices", async () => {
        const mockSupabase = createBillingMockSupabase({
          invoiceData: {
            id: "inv-123",
            amount_cents: 15000,
            due_date: "2026-03-01",
            status: "paid",
          },
        });

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "send_payment_reminder",
            args: { invoice_id: "inv-123", tone: "gentle" },
          },
          context
        );

        expect(result.result).toContain("already paid");
      });
    });

    describe("escalate_billing", () => {
      it("escalates and sets conversation status", async () => {
        const mockSupabase = createBillingMockSupabase();

        const context = createToolCallContext({
          supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        });

        const result: ToolCallResult = await config.handleToolCall(
          {
            name: "escalate_billing",
            args: { reason: "Patient disputes the charge" },
          },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result).toContain("escalated");
        expect(result.newConversationStatus).toBe("escalated");
        expect(mockSupabase.from).toHaveBeenCalledWith("conversations");
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
