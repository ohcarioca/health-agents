import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));

const mockUser = { id: "user-1" };
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser } });

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
  }),
}));

const mockCreateCustomer = vi.fn();
const mockCreateCharge = vi.fn();
const mockGetPixQrCode = vi.fn();
const mockGetBoletoIdentificationField = vi.fn();

vi.mock("@/services/asaas", () => ({
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  createCharge: (...args: unknown[]) => mockCreateCharge(...args),
  getPixQrCode: (...args: unknown[]) => mockGetPixQrCode(...args),
  getBoletoIdentificationField: (...args: unknown[]) => mockGetBoletoIdentificationField(...args),
}));

function createChainMock(finalResult: unknown = { data: null, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(finalResult),
  };
}

const membershipChain = createChainMock({ data: { clinic_id: "clinic-1" }, error: null });
const invoiceChain = createChainMock();
const paymentLinkChain = createChainMock();
const patientChain = createChainMock();

const mockFrom = vi.fn((table: string) => {
  if (table === "clinic_users") return membershipChain;
  if (table === "invoices") return invoiceChain;
  if (table === "payment_links") return paymentLinkChain;
  if (table === "patients") return patientChain;
  return createChainMock();
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import { POST } from "@/app/api/invoices/[id]/payment-link/route";

// ── Helpers ──

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(body?: Record<string, unknown>): Request {
  const init: RequestInit = { method: "POST" };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/invoices/inv-1/payment-link", init);
}

const sampleInvoice = {
  id: "inv-1",
  amount_cents: 15000,
  due_date: "2026-03-15",
  clinic_id: "clinic-1",
  patients: {
    id: "pat-1",
    name: "Maria Silva",
    phone: "11999990000",
    email: "maria@example.com",
    cpf: "12345678901",
    asaas_customer_id: null,
  },
};

const sampleInvoiceWithCustomer = {
  ...sampleInvoice,
  patients: {
    ...sampleInvoice.patients,
    asaas_customer_id: "cus_existing",
  },
};

// ── Tests ──

describe("POST /api/invoices/[id]/payment-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    membershipChain.select.mockReturnThis();
    membershipChain.eq.mockReturnThis();
    membershipChain.limit.mockReturnThis();
    membershipChain.single.mockResolvedValue({ data: { clinic_id: "clinic-1" }, error: null });

    invoiceChain.select.mockReturnThis();
    invoiceChain.eq.mockReturnThis();
    invoiceChain.single.mockResolvedValue({ data: sampleInvoice, error: null });

    paymentLinkChain.insert.mockReturnThis();
    paymentLinkChain.select.mockReturnThis();
    paymentLinkChain.single.mockResolvedValue({
      data: { id: "link-1", method: "pix", status: "active", url: "https://asaas.com/pay" },
      error: null,
    });

    patientChain.update.mockReturnThis();
    patientChain.eq.mockResolvedValue({ data: null, error: null });

    mockCreateCustomer.mockResolvedValue({ success: true, customerId: "cus_new" });
    mockCreateCharge.mockResolvedValue({
      success: true,
      chargeId: "chr_123",
      invoiceUrl: "https://asaas.com/pay",
    });
    mockGetPixQrCode.mockResolvedValue({ success: true, payload: "pix-payload-data" });
    mockGetBoletoIdentificationField.mockResolvedValue({
      success: true,
      identificationField: "boleto-field-data",
    });
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/invoices/inv-1/payment-link", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req, createParams("inv-1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid method", async () => {
    const req = createRequest({ method: "cash" });
    const res = await POST(req, createParams("inv-1"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when invoice not found", async () => {
    invoiceChain.single.mockResolvedValueOnce({ data: null, error: { message: "Not found" } });

    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-999"));
    expect(res.status).toBe(404);
  });

  it("returns 422 when patient has no CPF and no existing Asaas customer", async () => {
    const noCpfInvoice = {
      ...sampleInvoice,
      patients: { ...sampleInvoice.patients, cpf: null },
    };
    invoiceChain.single.mockResolvedValueOnce({ data: noCpfInvoice, error: null });

    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("CPF");
  });

  it("creates Asaas customer when patient has no asaas_customer_id", async () => {
    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(201);
    expect(mockCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Maria Silva",
        cpfCnpj: "12345678901",
        phone: "11999990000",
        email: "maria@example.com",
        externalReference: "pat-1",
      })
    );

    // Should save customer id to patient
    expect(mockFrom).toHaveBeenCalledWith("patients");
  });

  it("reuses existing Asaas customer when patient has asaas_customer_id", async () => {
    invoiceChain.single.mockResolvedValueOnce({ data: sampleInvoiceWithCustomer, error: null });

    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(201);
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockCreateCharge).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_existing" })
    );
  });

  it("creates PIX charge and fetches QR code", async () => {
    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(201);
    expect(mockCreateCharge).toHaveBeenCalledWith(
      expect.objectContaining({ billingType: "PIX" })
    );
    expect(mockGetPixQrCode).toHaveBeenCalledWith("chr_123");
    expect(mockGetBoletoIdentificationField).not.toHaveBeenCalled();
  });

  it("creates BOLETO charge and fetches identification field", async () => {
    const req = createRequest({ method: "boleto" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(201);
    expect(mockCreateCharge).toHaveBeenCalledWith(
      expect.objectContaining({ billingType: "BOLETO" })
    );
    expect(mockGetBoletoIdentificationField).toHaveBeenCalledWith("chr_123");
    expect(mockGetPixQrCode).not.toHaveBeenCalled();
  });

  it("creates CREDIT_CARD charge without extra data", async () => {
    const req = createRequest({ method: "credit_card" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(201);
    expect(mockCreateCharge).toHaveBeenCalledWith(
      expect.objectContaining({ billingType: "CREDIT_CARD" })
    );
    expect(mockGetPixQrCode).not.toHaveBeenCalled();
    expect(mockGetBoletoIdentificationField).not.toHaveBeenCalled();
  });

  it("creates UNDEFINED charge for link method", async () => {
    const req = createRequest({ method: "link" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(201);
    expect(mockCreateCharge).toHaveBeenCalledWith(
      expect.objectContaining({ billingType: "UNDEFINED" })
    );
  });

  it("returns 500 when customer creation fails", async () => {
    mockCreateCustomer.mockResolvedValueOnce({ success: false, error: "API down" });

    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("API down");
  });

  it("returns 500 when charge creation fails", async () => {
    mockCreateCharge.mockResolvedValueOnce({ success: false, error: "Charge failed" });

    const req = createRequest({ method: "pix" });
    const res = await POST(req, createParams("inv-1"));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Charge failed");
  });
});
