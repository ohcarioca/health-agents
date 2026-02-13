import { z } from "zod";

// --- Clinic Settings ---

export const clinicSettingsSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().max(15).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(2).optional().or(z.literal("")),
  zip_code: z.string().max(10).optional().or(z.literal("")),
  timezone: z.string().max(50).optional().or(z.literal("")),
});

export type ClinicSettingsInput = z.infer<typeof clinicSettingsSchema>;

// --- Schedule Grid ---

const timeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
}).refine(
  (slot) => slot.start < slot.end,
  { message: "Start time must be before end time" }
);

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export const scheduleGridSchema = z.object(
  Object.fromEntries(
    WEEKDAYS.map((day) => [day, z.array(timeSlotSchema).default([])])
  ) as Record<typeof WEEKDAYS[number], z.ZodDefault<z.ZodArray<typeof timeSlotSchema>>>
);

export type ScheduleGrid = z.infer<typeof scheduleGridSchema>;
export type TimeSlot = z.infer<typeof timeSlotSchema>;

// --- Professional ---

export const createProfessionalSchema = z.object({
  name: z.string().min(2).max(100),
  specialty: z.string().max(100).optional().or(z.literal("")),
  appointment_duration_minutes: z.number().int().min(5).max(480).default(30),
  schedule_grid: scheduleGridSchema.optional(),
});

export const updateProfessionalSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  specialty: z.string().max(100).optional().or(z.literal("")),
  appointment_duration_minutes: z.number().int().min(5).max(480).optional(),
  active: z.boolean().optional(),
  schedule_grid: scheduleGridSchema.optional(),
});

export type CreateProfessionalInput = z.infer<typeof createProfessionalSchema>;
export type UpdateProfessionalInput = z.infer<typeof updateProfessionalSchema>;
