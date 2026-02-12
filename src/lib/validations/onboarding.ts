import { z } from "zod";

export const clinicDataSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(10).max(15).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(2).optional().or(z.literal("")),
});

export const professionalSchema = z.object({
  name: z.string().min(2).max(100),
  specialty: z.string().max(100).optional().or(z.literal("")),
  durationMinutes: z.number().int().min(5).max(480).default(30),
});

export type ClinicDataInput = z.infer<typeof clinicDataSchema>;
export type ProfessionalInput = z.infer<typeof professionalSchema>;
