import { z } from "zod";

const whatsappTextSchema = z.object({
  body: z.string(),
});

const whatsappMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: whatsappTextSchema.optional(),
});

const whatsappContactSchema = z.object({
  profile: z.object({
    name: z.string(),
  }),
  wa_id: z.string(),
});

const whatsappMetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

const whatsappValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: whatsappMetadataSchema,
  contacts: z.array(whatsappContactSchema).optional(),
  messages: z.array(whatsappMessageSchema).optional(),
});

const whatsappChangeSchema = z.object({
  value: whatsappValueSchema,
  field: z.string(),
});

const whatsappEntrySchema = z.object({
  id: z.string(),
  changes: z.array(whatsappChangeSchema),
});

export const whatsappWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(whatsappEntrySchema),
});

export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookSchema>;
export type WhatsAppMessage = z.infer<typeof whatsappMessageSchema>;
export type WhatsAppMetadata = z.infer<typeof whatsappMetadataSchema>;
