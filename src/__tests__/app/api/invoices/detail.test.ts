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

function createChainMock(finalResult: unknown = { data: null, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(finalResult),
  };
}

const membershipChain = createChainMock({ data: { clinic_id: "clinic-1" }, error: null });
const invoiceChain = createChainMock();

const mockFrom = vi.fn((table: string) => {
  if (table === "clinic_users") return membershipChain;
  if (table === "invoices") return invoiceChain;
  return createChainMock();
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import { GET, PUT } from "@/app/api/invoices/[id]/route";

// ── Helpers ──

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(
  method: string,
  body?: Record<string, unknown>
): Request {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/invoices/inv-1", init);
}

// ── Tests ──

describe("GET /api/invoices/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    membershipChain.select.mockReturnThis();
    membershipChain.eq.mockReturnThis();
    membershipChain.limit.mockReturnThis();
    membershipChain.single.mockResolvedValue({ data: { clinic_id: "clinic-1" }, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await GET(createRequest("GET"), createParams("inv-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when invoice not found", async () => {
    invoiceChain.single.mockResolvedValueOnce({ data: null, error: { message: "Not found" } });

    const res = await GET(createRequest("GET"), createParams("inv-999"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Invoice not found");
  });

  it("returns invoice with patient and payment_links", async () => {
    const invoiceData = {
      id: "inv-1",
      amount_cents: 15000,
      status: "pending",
      patients: { id: "pat-1", name: "Maria", phone: "11999990000", cpf: null, email: null, asaas_customer_id: null },
      payment_links: [],
    };
    invoiceChain.single.mockResolvedValueOnce({ data: invoiceData, error: null });

    const res = await GET(createRequest("GET"), createParams("inv-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe("inv-1");
    expect(json.data.patients.name).toBe("Maria");
  });
});

describe("PUT /api/invoices/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    membershipChain.select.mockReturnThis();
    membershipChain.eq.mockReturnThis();
    membershipChain.limit.mockReturnThis();
    membershipChain.single.mockResolvedValue({ data: { clinic_id: "clinic-1" }, error: null });

    invoiceChain.update.mockReturnThis();
    invoiceChain.eq.mockReturnThis();
    invoiceChain.select.mockReturnThis();
    invoiceChain.single.mockResolvedValue({
      data: { id: "inv-1", status: "paid", paid_at: "2026-02-18T12:00:00.000Z" },
      error: null,
    });
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/invoices/inv-1", {
      method: "PUT",
      body: "not-json",
    });

    const res = await PUT(req, createParams("inv-1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid input", async () => {
    const req = createRequest("PUT", { status: "invalid-status" });
    const res = await PUT(req, createParams("inv-1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const req = createRequest("PUT", { status: "paid" });
    const res = await PUT(req, createParams("inv-1"));
    expect(res.status).toBe(401);
  });

  it("updates invoice status to paid", async () => {
    const req = createRequest("PUT", { status: "paid" });
    const res = await PUT(req, createParams("inv-1"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("paid");
  });

  it("auto-sets paid_at when marking as paid without explicit paid_at", async () => {
    const req = createRequest("PUT", { status: "paid" });
    await PUT(req, createParams("inv-1"));

    // Verify that update was called with paid_at auto-set
    expect(invoiceChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paid",
        paid_at: expect.any(String),
      })
    );
  });

  it("does not override explicit paid_at", async () => {
    const explicitDate = "2026-01-15T10:00:00.000Z";
    const req = createRequest("PUT", { status: "paid", paid_at: explicitDate });
    await PUT(req, createParams("inv-1"));

    // paid_at should NOT be overridden since it was provided
    expect(invoiceChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paid",
        paid_at: explicitDate,
      })
    );
  });

  it("updates invoice to cancelled status", async () => {
    invoiceChain.single.mockResolvedValueOnce({
      data: { id: "inv-1", status: "cancelled" },
      error: null,
    });

    const req = createRequest("PUT", { status: "cancelled" });
    const res = await PUT(req, createParams("inv-1"));

    expect(res.status).toBe(200);
  });
});
