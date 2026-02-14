import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));

const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = vi.fn(() => ({
  update: mockUpdate,
  eq: mockEq,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/services/asaas", () => ({
  verifyWebhookToken: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/webhooks/asaas/route";
import { verifyWebhookToken } from "@/services/asaas";

// ── Helpers ──

function createRequest(
  body: Record<string, unknown>,
  token = "valid-token"
): Request {
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": token,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe("POST /api/webhooks/asaas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default: token is valid
    (verifyWebhookToken as ReturnType<typeof vi.fn>).mockReturnValue(true);
    // Reset chainable mocks
    mockUpdate.mockReturnThis();
    mockEq.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq });
  });

  it("returns 401 for invalid webhook token", async () => {
    (verifyWebhookToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const req = createRequest(
      { event: "PAYMENT_RECEIVED", payment: {} },
      "invalid-token"
    );

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("invalid token");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/webhooks/asaas", {
      method: "POST",
      headers: { "asaas-access-token": "valid-token" },
      body: "not-json{{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("invalid JSON");
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
});
