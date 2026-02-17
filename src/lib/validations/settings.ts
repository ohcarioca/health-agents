import { z } from "zod";

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

// --- Clinic Settings ---

export const clinicSettingsSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.string().max(50).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(2).optional().or(z.literal("")),
  zip_code: z.string().max(10).optional().or(z.literal("")),
  timezone: z.string().max(50).optional().or(z.literal("")),
  whatsapp_phone_number_id: z.string().max(50).optional().or(z.literal("")),
  whatsapp_waba_id: z.string().max(50).optional().or(z.literal("")),
  whatsapp_access_token: z.string().max(500).optional().or(z.literal("")),
  operating_hours: scheduleGridSchema.optional(),
});

export type ClinicSettingsInput = z.infer<typeof clinicSettingsSchema>;

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

// --- Services ---

export const createServiceSchema = z.object({
  name: z.string().min(2).max(100),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  price_cents: z.number().int().min(0).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  price_cents: z.number().int().min(0).optional().nullable(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// --- Insurance Plans ---

export const createInsurancePlanSchema = z.object({
  name: z.string().min(2).max(100),
});

export type CreateInsurancePlanInput = z.infer<typeof createInsurancePlanSchema>;

// --- Professional Services (upsert) ---

export const upsertProfessionalServicesSchema = z.object({
  services: z.array(
    z.object({
      service_id: z.string().uuid(),
      price_cents: z.number().int().min(0),
    })
  ),
});

export type UpsertProfessionalServicesInput = z.infer<typeof upsertProfessionalServicesSchema>;

// --- Operating Hours (reuse ScheduleGrid for clinic hours) ---

export const operatingHoursSchema = scheduleGridSchema;
export type OperatingHours = ScheduleGrid;

// --- Onboarding Activation ---

export const activateClinicSchema = z.object({
  active: z.boolean(),
});

export type ActivateClinicInput = z.infer<typeof activateClinicSchema>;

// --- Calendar Appointments ---

export const createAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  insurance_plan_id: z.string().uuid().optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  cancellation_reason: z.string().max(500).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

// --- Public Page ---

export const socialLinkSchema = z.object({
  type: z.enum(['instagram', 'facebook', 'website', 'youtube', 'tiktok', 'linkedin', 'google_maps', 'other']),
  url: z.string().url(),
  label: z.string().min(1).max(50),
});

export const publicPageSchema = z.object({
  public_page_enabled: z.boolean().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  social_links: z.array(socialLinkSchema).max(20).optional(),
  show_prices: z.boolean().optional(),
});

export type SocialLinkInput = z.infer<typeof socialLinkSchema>;
export type PublicPageInput = z.infer<typeof publicPageSchema>;
