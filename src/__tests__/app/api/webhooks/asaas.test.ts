import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));

vi.mock("@/services/asaas", () => ({
  verifyWebhookToken: vi.fn().mockReturnValue(true),
}));

const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = vi.fn((_table: string) => ({
  update: mockUpdate,
  eq: mockEq,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import { POST } from "@/app/api/webhooks/asaas/route";
import { verifyWebhookToken } from "@/services/asaas";

const mockVerifyWebhookToken = vi.mocked(verifyWebhookToken);

// ── Helpers ──

function createRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Request {
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe("POST /api/webhooks/asaas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyWebhookToken.mockReturnValue(true);
    mockUpdate.mockReturnThis();
    mockEq.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq });
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/webhooks/asaas", {
      method: "POST",
      body: "not-json{{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("invalid JSON");
  });

  it("returns 401 when webhook token is invalid", async () => {
    mockVerifyWebhookToken.mockReturnValue(false);

    const req = createRequest(
      { event: "PAYMENT_RECEIVED", payment: { id: "pay_abc" } },
      { "asaas-access-token": "bad-token" }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });

  it("accepts request when webhook token is valid", async () => {
    mockVerifyWebhookToken.mockReturnValue(true);

    const req = createRequest(
      { event: "PAYMENT_CREATED", payment: { id: "pay_abc" } },
      { "asaas-access-token": "valid-token" }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("ignored");
    expect(mockVerifyWebhookToken).toHaveBeenCalledWith("valid-token");
  });

  it("ignores non-payment events and returns 200", async () => {
    const req = createRequest({
      event: "PAYMENT_CREATED",
      payment: { id: "pay_abc" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("ignored");
    expect(json.event).toBe("PAYMENT_CREATED");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("skips when externalReference is missing", async () => {
    const req = createRequest({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_abc" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("skipped");
    expect(json.reason).toBe("no_external_reference");
  });

  it("marks invoice and payment_link as paid on PAYMENT_RECEIVED", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: "pending" }, error: null });
    const mockSelectEq = vi.fn().mockReturnValue({ single: mockSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: mockSelect,
          eq: mockSelectEq,
          update: mockUpdate,
        };
      }
      return { update: mockUpdate, eq: mockEq };
    });

    const req = createRequest({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_abc123",
        customer: "cus_xyz",
        billingType: "PIX",
        value: 150.0,
        status: "RECEIVED",
        externalReference: "invoice-uuid-1",
        paymentDate: "2026-02-14",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.invoiceId).toBe("invoice-uuid-1");
    expect(json.event).toBe("PAYMENT_RECEIVED");

    // Should update payment_links and invoices
    expect(mockFrom).toHaveBeenCalledWith("payment_links");
    expect(mockFrom).toHaveBeenCalledWith("invoices");
  });

  it("marks invoice and payment_link as paid on PAYMENT_CONFIRMED", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: "pending" }, error: null });
    const mockSelectEq = vi.fn().mockReturnValue({ single: mockSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: mockSelect,
          eq: mockSelectEq,
          update: mockUpdate,
        };
      }
      return { update: mockUpdate, eq: mockEq };
    });

    const req = createRequest({
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_def456",
        externalReference: "invoice-uuid-2",
        paymentDate: "2026-02-14",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.event).toBe("PAYMENT_CONFIRMED");

    expect(mockFrom).toHaveBeenCalledWith("payment_links");
    expect(mockFrom).toHaveBeenCalledWith("invoices");
  });

  it("marks invoice as overdue on PAYMENT_OVERDUE", async () => {
    const req = createRequest({
      event: "PAYMENT_OVERDUE",
      payment: {
        id: "pay_overdue",
        externalReference: "invoice-uuid-3",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.event).toBe("PAYMENT_OVERDUE");

    expect(mockFrom).toHaveBeenCalledWith("invoices");
    // Should NOT update payment_links for overdue
    const paymentLinksCalls = mockFrom.mock.calls.filter(
      (call: string[]) => call[0] === "payment_links"
    );
    expect(paymentLinksCalls).toHaveLength(0);
  });

  it("skips duplicate paid event when invoice is already paid", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: "paid" }, error: null });
    const mockSelectEq = vi.fn().mockReturnValue({ single: mockSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: mockSelect,
          eq: mockSelectEq,
          update: mockUpdate,
        };
      }
      return { update: mockUpdate, eq: mockEq };
    });

    const req = createRequest({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_dup",
        externalReference: "invoice-already-paid",
        paymentDate: "2026-02-14",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("already_processed");
    expect(json.invoiceId).toBe("invoice-already-paid");

    // Should NOT call update since invoice is already paid
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("handles PAYMENT_REFUNDED by reverting invoice status", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: "paid" }, error: null });
    const mockSelectEq = vi.fn().mockReturnValue({ single: mockSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: mockSelect,
          eq: mockSelectEq,
          update: mockUpdate,
        };
      }
      return { update: mockUpdate, eq: mockEq };
    });

    const req = createRequest({
      event: "PAYMENT_REFUNDED",
      payment: {
        id: "pay_refund_001",
        externalReference: "invoice-uuid-4",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.event).toBe("PAYMENT_REFUNDED");

    expect(mockFrom).toHaveBeenCalledWith("invoices");
    expect(mockFrom).toHaveBeenCalledWith("payment_links");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "active" });
    expect(mockUpdate).toHaveBeenCalledWith({ status: "pending", paid_at: null });
  });

  it("skips refund when invoice is not paid", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: "pending" }, error: null });
    const mockSelectEq = vi.fn().mockReturnValue({ single: mockSingle });

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return {
          select: mockSelect,
          eq: mockSelectEq,
          update: mockUpdate,
        };
      }
      return { update: mockUpdate, eq: mockEq };
    });

    const req = createRequest({
      event: "PAYMENT_REFUNDED",
      payment: {
        id: "pay_refund_002",
        externalReference: "invoice-pending",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("already_processed");

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
