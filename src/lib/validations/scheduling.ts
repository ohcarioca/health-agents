import { z } from "zod";

export const availableSlotsQuerySchema = z.object({
  professional_id: z.string().uuid("Invalid professional ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  service_id: z.string().uuid("Invalid service ID").optional(),
});

export const bookAppointmentSchema = z.object({
  professional_id: z.string().uuid("Invalid professional ID"),
  patient_id: z.string().uuid("Invalid patient ID"),
  service_id: z.string().uuid("Invalid service ID").optional(),
  starts_at: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
  ends_at: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
});

export const updateAppointmentSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  cancellation_reason: z.string().max(500).optional(),
});

export const cancelAppointmentSchema = z.object({
  cancellation_reason: z.string().max(500).optional(),
});

export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
