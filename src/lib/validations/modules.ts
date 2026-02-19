import { z } from "zod";

export const FaqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const BillingModuleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  auto_billing: z.boolean().optional(),
});

export const NpsModuleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
});

export const RecallModuleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  inactivity_days: z.number().int().min(7).max(730).optional(),
});

export const SupportModuleUpdateSchema = z.object({
  faq_items: z.array(FaqItemSchema).optional(),
});

export const CONFIGURABLE_MODULE_TYPES = [
  "billing",
  "nps",
  "recall",
  "support",
] as const;

export type ConfigurableModuleType = (typeof CONFIGURABLE_MODULE_TYPES)[number];

export function parseModuleUpdate(
  type: string,
  body: unknown
):
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: z.ZodError } {
  switch (type) {
    case "billing": {
      const result = BillingModuleUpdateSchema.safeParse(body);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result.data as Record<string, unknown> };
    }
    case "nps": {
      const result = NpsModuleUpdateSchema.safeParse(body);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result.data as Record<string, unknown> };
    }
    case "recall": {
      const result = RecallModuleUpdateSchema.safeParse(body);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result.data as Record<string, unknown> };
    }
    case "support": {
      const result = SupportModuleUpdateSchema.safeParse(body);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result.data as Record<string, unknown> };
    }
    default:
      return {
        success: false,
        error: new z.ZodError([
          {
            code: "custom",
            message: "Unsupported module type",
            path: ["type"],
          },
        ]),
      };
  }
}
