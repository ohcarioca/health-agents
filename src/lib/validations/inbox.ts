import { z } from "zod";

export const conversationListQuerySchema = z.object({
  status: z.enum(["active", "escalated", "resolved"]).optional(),
  module: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4096),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
