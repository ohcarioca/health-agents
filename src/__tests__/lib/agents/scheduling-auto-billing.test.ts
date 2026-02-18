import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (imported by engine.ts, process-message.ts, asaas.ts, enqueue-confirmations.ts)
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI (imported by engine.ts and router.ts)
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

// Mock scheduling availability module
vi.mock("@/lib/scheduling/availability", () => ({
  getAvailableSlots: vi.fn().mockReturnValue([
    { start: "2026-02-18T12:00:00.000Z", end: "2026-02-18T12:30:00.000Z" },
  ]),
}));

// Mock Google Calendar service
vi.mock("@/services/google-calendar", () => ({
  getFreeBusy: vi.fn().mockResolvedValue({ success: true, busyBlocks: [] }),
  createEvent: vi
    .fn()
    .mockResolvedValue({ success: true, eventId: "evt-123" }),
  updateEvent: vi.fn().mockResolvedValue({ success: true }),
  deleteEvent: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock enqueue-confirmations
vi.mock("@/lib/scheduling/enqueue-confirmations", () => ({
  enqueueConfirmations: vi.fn().mockResolvedValue(undefined),
}));

// Mock auto-billing check
vi.mock("@/lib/billing/auto-billing", () => ({
  isAutoBillingEnabled: vi.fn().mockResolvedValue(false),
}));

// Mock Asaas service
vi.mock("@/services/asaas", () => ({
  createCustomer: vi.fn().mockResolvedValue({
    success: true,
    customerId: "cus_asaas_123",
  }),
  createCharge: vi.fn().mockResolvedValue({
    success: true,
    chargeId: "chr_asaas_456",
    invoiceUrl: "https://asaas.com/pay/chr_asaas_456",
  }),
  getPixQrCode: vi.fn().mockResolvedValue({
    success: true,
    payload: "00020126...PIX_PAYLOAD",
  }),
  getChargeStatus: vi.fn(),
  getBoletoIdentificationField: vi.fn(),
}));

import { getAgentType } from "@/lib/agents";
import type { ToolCallContext, ToolCallResult } from "@/lib/agents";
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";
import {
  createCustomer,
  createCharge,
  getPixQrCode,
} from "@/services/asaas";

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

// ── Test Constants ──

const CLINIC_ID = "clinic-789";
const PATIENT_ID = "patient-456";
const PROF_ID = "prof-123";
const SERVICE_ID = "svc-001";
const APPOINTMENT_ID = "appt-new-001";
const INVOICE_ID = "inv-001";
const STARTS_AT = "2026-02-18T14:00:00.000Z";
const ENDS_AT = "2026-02-18T14:30:00.000Z";

// ── Tests ──

describe("scheduling auto-billing integration", () => {
  let schedulingConfig: NonNullable<ReturnType<typeof getAgentType>>;
  let confirmationConfig: NonNullable<ReturnType<typeof getAgentType>>;

  beforeEach(() => {
    schedulingConfig = getAgentType("scheduling")!;
    confirmationConfig = getAgentType("confirmation")!;
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────
  // Scenario 1: book_appointment with auto_billing enabled
  // ────────────────────────────────────────────

  describe("handleBookAppointment with auto_billing enabled", () => {
    it("creates an invoice and payment link when service has a price", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(true);

      // Track table call counts to differentiate successive calls to the same table
      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            // Conflict check: .select().eq().in().lt().gt().limit()
            const c = createChainable();
            c.limit = vi.fn().mockResolvedValue({ data: [], error: null });
            return c;
          }
          if (callNum === 2) {
            // Insert appointment: .insert().select().single()
            return createChainable({
              data: { id: APPOINTMENT_ID },
              error: null,
            });
          }
          // Subsequent: update google_event_id
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "professional_services") {
          // Auto-billing: price lookup
          return createChainable({
            data: { price_cents: 15000 },
            error: null,
          });
        }

        if (table === "services") {
          // Fallback price (should not be reached if professional_services has data)
          return createChainable({
            data: { base_price_cents: 10000 },
            error: null,
          });
        }

        if (table === "invoices") {
          // Auto-billing: insert invoice
          return createChainable({
            data: { id: INVOICE_ID },
            error: null,
          });
        }

        if (table === "patients") {
          // Auto-billing: patient lookup for CPF
          return createChainable({
            data: {
              id: PATIENT_ID,
              name: "Maria Silva",
              phone: "11987650001",
              email: "maria@test.com",
              cpf: "12345678901",
              asaas_customer_id: null,
            },
            error: null,
          });
        }

        if (table === "payment_links") {
          // Auto-billing: insert payment link
          const c = createChainable();
          c.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "clinics") {
          return createChainable({
            data: { name: "Clinica Teste", timezone: "America/Sao_Paulo" },
            error: null,
          });
        }

        if (table === "professionals") {
          return createChainable({
            data: {
              name: "Dr. Joao",
              google_calendar_id: null,
              google_refresh_token: null,
            },
            error: null,
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await schedulingConfig.handleToolCall(
        {
          name: "book_appointment",
          args: {
            professional_id: PROF_ID,
            starts_at: STARTS_AT,
            ends_at: ENDS_AT,
            service_id: SERVICE_ID,
          },
        },
        context
      );

      // Appointment was booked
      expect(result.result).toBeDefined();
      expect(result.result).toContain("booked");

      // Auto-billing was checked
      expect(isAutoBillingEnabled).toHaveBeenCalledWith(
        mockSupabase,
        CLINIC_ID
      );

      // Invoice was created (invoices table was accessed)
      expect(fromMock).toHaveBeenCalledWith("invoices");

      // Asaas customer was created (no existing asaas_customer_id)
      expect(createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Maria Silva",
          cpfCnpj: "12345678901",
        })
      );

      // Asaas charge was created
      expect(createCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: "cus_asaas_123",
          billingType: "UNDEFINED",
          valueCents: 15000,
        })
      );

      // Pix QR code was requested
      expect(getPixQrCode).toHaveBeenCalledWith("chr_asaas_456");

      // Payment link was inserted
      expect(fromMock).toHaveBeenCalledWith("payment_links");

      // appendToResponse contains payment info
      expect(result.appendToResponse).toBeDefined();
      expect(result.appendToResponse).toContain("R$ 150,00");
      expect(result.appendToResponse).toContain(
        "https://asaas.com/pay/chr_asaas_456"
      );
      expect(result.appendToResponse).toContain("PIX_PAYLOAD");
    });
  });

  // ────────────────────────────────────────────
  // Scenario 2: book_appointment with auto_billing disabled
  // ────────────────────────────────────────────

  describe("handleBookAppointment with auto_billing disabled", () => {
    it("does not create an invoice when auto-billing is disabled", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(false);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            const c = createChainable();
            c.limit = vi.fn().mockResolvedValue({ data: [], error: null });
            return c;
          }
          if (callNum === 2) {
            return createChainable({
              data: { id: APPOINTMENT_ID },
              error: null,
            });
          }
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "clinics") {
          return createChainable({
            data: { name: "Clinica Teste", timezone: "America/Sao_Paulo" },
            error: null,
          });
        }

        if (table === "professionals") {
          return createChainable({
            data: {
              name: "Dr. Joao",
              google_calendar_id: null,
              google_refresh_token: null,
            },
            error: null,
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await schedulingConfig.handleToolCall(
        {
          name: "book_appointment",
          args: {
            professional_id: PROF_ID,
            starts_at: STARTS_AT,
            ends_at: ENDS_AT,
            service_id: SERVICE_ID,
          },
        },
        context
      );

      expect(result.result).toContain("booked");

      // Invoice was NOT created
      expect(fromMock).not.toHaveBeenCalledWith("invoices");

      // Asaas was NOT called
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createCharge).not.toHaveBeenCalled();

      // No billing appendix
      expect(result.appendToResponse).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────
  // Scenario 3: book_appointment with auto_billing enabled but no service price
  // ────────────────────────────────────────────

  describe("handleBookAppointment with auto_billing enabled but no service price", () => {
    it("does not create an invoice when the service has no price", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(true);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            const c = createChainable();
            c.limit = vi.fn().mockResolvedValue({ data: [], error: null });
            return c;
          }
          if (callNum === 2) {
            return createChainable({
              data: { id: APPOINTMENT_ID },
              error: null,
            });
          }
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "professional_services") {
          // No professional-specific price
          return createChainable({ data: null, error: { code: "PGRST116" } });
        }

        if (table === "services") {
          // Service has no base price (0 or null)
          return createChainable({
            data: { base_price_cents: 0 },
            error: null,
          });
        }

        if (table === "clinics") {
          return createChainable({
            data: { name: "Clinica Teste", timezone: "America/Sao_Paulo" },
            error: null,
          });
        }

        if (table === "professionals") {
          return createChainable({
            data: {
              name: "Dr. Joao",
              google_calendar_id: null,
              google_refresh_token: null,
            },
            error: null,
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await schedulingConfig.handleToolCall(
        {
          name: "book_appointment",
          args: {
            professional_id: PROF_ID,
            starts_at: STARTS_AT,
            ends_at: ENDS_AT,
            service_id: SERVICE_ID,
          },
        },
        context
      );

      expect(result.result).toContain("booked");

      // Auto-billing was checked
      expect(isAutoBillingEnabled).toHaveBeenCalled();

      // Invoice was NOT created because price is 0
      expect(fromMock).not.toHaveBeenCalledWith("invoices");

      // Asaas was NOT called
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createCharge).not.toHaveBeenCalled();

      // No billing appendix
      expect(result.appendToResponse).toBeUndefined();
    });

    it("does not create an invoice when no service_id is provided", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(true);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            const c = createChainable();
            c.limit = vi.fn().mockResolvedValue({ data: [], error: null });
            return c;
          }
          if (callNum === 2) {
            return createChainable({
              data: { id: APPOINTMENT_ID },
              error: null,
            });
          }
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "clinics") {
          return createChainable({
            data: { name: "Clinica Teste", timezone: "America/Sao_Paulo" },
            error: null,
          });
        }

        if (table === "professionals") {
          return createChainable({
            data: {
              name: "Dr. Joao",
              google_calendar_id: null,
              google_refresh_token: null,
            },
            error: null,
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await schedulingConfig.handleToolCall(
        {
          name: "book_appointment",
          args: {
            professional_id: PROF_ID,
            starts_at: STARTS_AT,
            ends_at: ENDS_AT,
            // No service_id -> priceCents remains 0
          },
        },
        context
      );

      expect(result.result).toContain("booked");

      // Invoice was NOT created (no service_id, so priceCents = 0)
      expect(fromMock).not.toHaveBeenCalledWith("invoices");
      expect(createCustomer).not.toHaveBeenCalled();
      expect(result.appendToResponse).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────
  // Scenario 4: book_appointment with auto_billing enabled but patient has no CPF
  // ────────────────────────────────────────────

  describe("handleBookAppointment with auto_billing enabled but patient has no CPF", () => {
    it("creates an invoice but no payment link when patient lacks CPF", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(true);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            const c = createChainable();
            c.limit = vi.fn().mockResolvedValue({ data: [], error: null });
            return c;
          }
          if (callNum === 2) {
            return createChainable({
              data: { id: APPOINTMENT_ID },
              error: null,
            });
          }
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "professional_services") {
          return createChainable({
            data: { price_cents: 20000 },
            error: null,
          });
        }

        if (table === "invoices") {
          return createChainable({
            data: { id: INVOICE_ID },
            error: null,
          });
        }

        if (table === "patients") {
          // Patient has NO CPF
          return createChainable({
            data: {
              id: PATIENT_ID,
              name: "Maria Silva",
              phone: "11987650001",
              email: "maria@test.com",
              cpf: null,
              asaas_customer_id: null,
            },
            error: null,
          });
        }

        if (table === "clinics") {
          return createChainable({
            data: { name: "Clinica Teste", timezone: "America/Sao_Paulo" },
            error: null,
          });
        }

        if (table === "professionals") {
          return createChainable({
            data: {
              name: "Dr. Joao",
              google_calendar_id: null,
              google_refresh_token: null,
            },
            error: null,
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await schedulingConfig.handleToolCall(
        {
          name: "book_appointment",
          args: {
            professional_id: PROF_ID,
            starts_at: STARTS_AT,
            ends_at: ENDS_AT,
            service_id: SERVICE_ID,
          },
        },
        context
      );

      expect(result.result).toContain("booked");

      // Invoice WAS created
      expect(fromMock).toHaveBeenCalledWith("invoices");

      // Patient was looked up
      expect(fromMock).toHaveBeenCalledWith("patients");

      // Asaas was NOT called (no CPF)
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createCharge).not.toHaveBeenCalled();

      // No payment link = no billing appendix
      expect(result.appendToResponse).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────
  // Scenario 5: cancel_appointment with linked invoice
  // ────────────────────────────────────────────

  describe("handleCancelAppointment with linked invoice", () => {
    it("cancels the invoice and expires payment links", async () => {
      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            // Fetch existing appointment: .select().eq().eq().single()
            return createChainable({
              data: {
                id: "appt-to-cancel",
                patient_id: PATIENT_ID,
                professional_id: PROF_ID,
                google_event_id: null,
              },
              error: null,
            });
          }
          // Update: .update().eq() resolves
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "invoices") {
          if (callNum === 1) {
            // Lookup linked invoice: .select().eq().in().single()
            return createChainable({
              data: { id: INVOICE_ID, status: "pending" },
              error: null,
            });
          }
          // Update invoice status to cancelled: .update().eq()
          const c = createChainable();
          c.eq = vi.fn().mockResolvedValue({ data: null, error: null });
          return c;
        }

        if (table === "payment_links") {
          // Expire active payment links: .update().eq().eq()
          const c = createChainable();
          c.eq = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          });
          return c;
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await schedulingConfig.handleToolCall(
        {
          name: "cancel_appointment",
          args: {
            appointment_id: "appt-to-cancel",
            reason: "Patient changed plans",
          },
        },
        context
      );

      expect(result.result).toContain("cancelled successfully");

      // Invoice was looked up and updated
      expect(fromMock).toHaveBeenCalledWith("invoices");

      // Payment links were expired
      expect(fromMock).toHaveBeenCalledWith("payment_links");
    });
  });

  // ────────────────────────────────────────────
  // Scenario 6: confirm_attendance with pending invoice
  // ────────────────────────────────────────────

  describe("handleConfirmAttendance with pending invoice", () => {
    it("includes payment URL in appendToResponse when pending invoice exists", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(true);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            // findActiveConfirmationAppointment: select + eq + eq + in + order
            // Use a proxy-based thenable that resolves at the end of any chain
            return createChainResolvingWith({
              data: [{ id: "appt-confirm-001" }],
              error: null,
            });
          }
          // update + select + single: confirm appointment
          return createChainable({
            data: { id: "appt-confirm-001" },
            error: null,
          });
        }

        if (table === "confirmation_queue") {
          if (callNum === 1) {
            // findActiveConfirmationAppointment: select + in + eq + order + limit + maybeSingle
            return createChainResolvingWithMaybeSingle({
              data: { appointment_id: "appt-confirm-001" },
              error: null,
            });
          }
          // Update confirmation_queue
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === "invoices") {
          // Invoice lookup: .select().eq().in().single()
          return createChainable({
            data: {
              id: INVOICE_ID,
              amount_cents: 15000,
              due_date: "2026-02-18",
              status: "pending",
            },
            error: null,
          });
        }

        if (table === "payment_links") {
          // Existing payment link: .select().eq().eq().order().limit().single()
          return createChainable({
            data: {
              url: "https://asaas.com/pay/existing-link",
              pix_payload: "PIX_EXISTING_PAYLOAD",
            },
            error: null,
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await confirmationConfig.handleToolCall(
        { name: "confirm_attendance", args: {} },
        context
      );

      expect(result.result).toContain("confirmed");

      // appendToResponse contains payment reminder with existing link
      expect(result.appendToResponse).toBeDefined();
      expect(result.appendToResponse).toContain("R$ 150,00");
      expect(result.appendToResponse).toContain(
        "https://asaas.com/pay/existing-link"
      );
      expect(result.appendToResponse).toContain("PIX_EXISTING_PAYLOAD");
    });
  });

  // ────────────────────────────────────────────
  // Scenario 7: confirm_attendance without pending invoice
  // ────────────────────────────────────────────

  describe("handleConfirmAttendance without pending invoice", () => {
    it("does not include payment appendix when no pending invoice exists", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(true);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            return createChainResolvingWith({
              data: [{ id: "appt-confirm-002" }],
              error: null,
            });
          }
          return createChainable({
            data: { id: "appt-confirm-002" },
            error: null,
          });
        }

        if (table === "confirmation_queue") {
          if (callNum === 1) {
            return createChainResolvingWithMaybeSingle({
              data: { appointment_id: "appt-confirm-002" },
              error: null,
            });
          }
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === "invoices") {
          // No pending invoice found
          return createChainable({
            data: null,
            error: { code: "PGRST116" },
          });
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await confirmationConfig.handleToolCall(
        { name: "confirm_attendance", args: {} },
        context
      );

      expect(result.result).toContain("confirmed");

      // No billing appendix since there is no pending invoice
      expect(result.appendToResponse).toBeUndefined();
    });

    it("does not include payment appendix when auto-billing is disabled", async () => {
      vi.mocked(isAutoBillingEnabled).mockResolvedValueOnce(false);

      const callCounts: Record<string, number> = {};

      const fromMock = vi.fn().mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] ?? 0) + 1;
        const callNum = callCounts[table];

        if (table === "appointments") {
          if (callNum === 1) {
            return createChainResolvingWith({
              data: [{ id: "appt-confirm-003" }],
              error: null,
            });
          }
          return createChainable({
            data: { id: "appt-confirm-003" },
            error: null,
          });
        }

        if (table === "confirmation_queue") {
          if (callNum === 1) {
            return createChainResolvingWithMaybeSingle({
              data: { appointment_id: "appt-confirm-003" },
              error: null,
            });
          }
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }

        return createChainable();
      });

      const mockSupabase = { from: fromMock };
      const context: ToolCallContext = {
        supabase: mockSupabase as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: PATIENT_ID,
        clinicId: CLINIC_ID,
      };

      const result: ToolCallResult = await confirmationConfig.handleToolCall(
        { name: "confirm_attendance", args: {} },
        context
      );

      expect(result.result).toContain("confirmed");

      // No billing appendix since auto-billing is disabled
      expect(result.appendToResponse).toBeUndefined();

      // Invoices table was NOT queried
      expect(fromMock).not.toHaveBeenCalledWith("invoices");
    });
  });
});

// ── Helper functions for confirmation agent's complex query patterns ──

/** Chainable that resolves at the end of any chain (for array queries) */
function createChainResolvingWith(resolvedValue: {
  data: unknown;
  error: unknown;
}) {
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};

  const self = new Proxy(chainable, {
    get: (_target, prop: string) => {
      if (prop === "then") {
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
function createChainResolvingWithMaybeSingle(resolvedValue: {
  data: unknown;
  error: unknown;
}) {
  const chainable: MockChainable = {} as MockChainable;

  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.in = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.order = vi.fn().mockReturnValue(chainable);
  chainable.limit = vi.fn().mockReturnValue(chainable);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  return chainable;
}
