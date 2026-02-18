import { describe, it, expect } from "vitest";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  createPaymentLinkSchema,
} from "@/lib/validations/billing";

describe("createInvoiceSchema", () => {
  it("accepts valid input", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 15000,
      due_date: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      appointment_id: "660e8400-e29b-41d4-a716-446655440000",
      amount_cents: 5000,
      due_date: "2026-04-01",
      notes: "Consulta de retorno",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid patient_id", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "not-a-uuid",
      amount_cents: 15000,
      due_date: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount_cents", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 0,
      due_date: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount_cents", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: -100,
      due_date: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects decimal amount_cents", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 150.5,
      due_date: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid due_date format", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 15000,
      due_date: "15/03/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes longer than 500 characters", () => {
    const result = createInvoiceSchema.safeParse({
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 15000,
      due_date: "2026-03-15",
      notes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = createInvoiceSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("updateInvoiceSchema", () => {
  it("accepts partial update with status only", () => {
    const result = updateInvoiceSchema.safeParse({ status: "paid" });
    expect(result.success).toBe(true);
  });

  it("accepts all valid statuses", () => {
    for (const status of ["pending", "partial", "paid", "overdue", "cancelled"]) {
      const result = updateInvoiceSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = updateInvoiceSchema.safeParse({ status: "unknown" });
    expect(result.success).toBe(false);
  });

  it("accepts amount_cents update", () => {
    const result = updateInvoiceSchema.safeParse({ amount_cents: 20000 });
    expect(result.success).toBe(true);
  });

  it("accepts paid_at as ISO datetime", () => {
    const result = updateInvoiceSchema.safeParse({
      status: "paid",
      paid_at: "2026-02-18T14:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no-op update)", () => {
    const result = updateInvoiceSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createPaymentLinkSchema", () => {
  it("accepts pix method", () => {
    const result = createPaymentLinkSchema.safeParse({ method: "pix" });
    expect(result.success).toBe(true);
  });

  it("accepts boleto method", () => {
    const result = createPaymentLinkSchema.safeParse({ method: "boleto" });
    expect(result.success).toBe(true);
  });

  it("accepts credit_card method", () => {
    const result = createPaymentLinkSchema.safeParse({ method: "credit_card" });
    expect(result.success).toBe(true);
  });

  it("accepts link method (universal link)", () => {
    const result = createPaymentLinkSchema.safeParse({ method: "link" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid method", () => {
    const result = createPaymentLinkSchema.safeParse({ method: "cash" });
    expect(result.success).toBe(false);
  });

  it("rejects missing method", () => {
    const result = createPaymentLinkSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
