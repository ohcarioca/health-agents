import { z } from "zod";

export const createInvoiceSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional(),
  amount_cents: z.number().int().positive(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  notes: z.string().max(500).optional(),
});

export const updateInvoiceSchema = z.object({
  status: z
    .enum(["pending", "partial", "paid", "overdue", "cancelled"])
    .optional(),
  amount_cents: z.number().int().positive().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .optional(),
  notes: z.string().max(500).optional(),
  paid_at: z.string().datetime().optional(),
});
