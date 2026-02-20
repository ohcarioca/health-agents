import { z } from "zod";

// Brazilian CPF check-digit validation
export function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(cpf[10]);
}

export const createPatientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(10).max(13)),
  email: z.string().email().optional().or(z.literal("")),
  date_of_birth: z
    .string()
    .date()
    .refine((d) => new Date(d) < new Date(), { message: "Must be in the past" })
    .optional()
    .or(z.literal("")),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().length(11).refine(isValidCpf, { message: "Invalid CPF" }))
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  custom_fields: z.record(z.string(), z.string()).optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export const batchPatientSchema = z.object({
  patients: z.array(createPatientSchema).min(1).max(500),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type BatchPatientInput = z.infer<typeof batchPatientSchema>;
