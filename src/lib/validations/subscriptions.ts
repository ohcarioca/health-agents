import { z } from "zod";

const creditCardSchema = z.object({
  holderName: z.string().min(3).max(100),
  number: z.string().regex(/^\d{13,19}$/, "Invalid card number"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "MM format"),
  expiryYear: z.string().regex(/^\d{4}$/, "YYYY format"),
  ccv: z.string().regex(/^\d{3,4}$/, "3-4 digits"),
});

const creditCardHolderInfoSchema = z.object({
  name: z.string().min(3).max(100),
  email: z.string().email(),
  cpfCnpj: z.string().min(11).max(18),
  postalCode: z.string().regex(/^\d{8}$/, "8 digits, no dash"),
  addressNumber: z.string().min(1).max(10),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  addressComplement: z.string().max(100).optional(),
});

export const createSubscriptionSchema = z.object({
  planSlug: z.string().min(1),
  creditCard: creditCardSchema,
  creditCardHolderInfo: creditCardHolderInfoSchema,
});

export const upgradeSubscriptionSchema = z.object({
  planSlug: z.string().min(1),
});

export const updateCardSchema = z.object({
  creditCard: creditCardSchema,
  creditCardHolderInfo: creditCardHolderInfoSchema,
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpgradeSubscriptionInput = z.infer<
  typeof upgradeSubscriptionSchema
>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
