import { z } from "zod";

export const customFieldTypeSchema = z.enum(["text", "select"]);

export const createCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: customFieldTypeSchema,
    options: z.array(z.string().trim().min(1).max(100)).default([]),
    required: z.boolean().default(false),
    display_order: z.number().int().min(0).default(0),
  })
  .refine(
    (data) => data.type !== "select" || data.options.length > 0,
    { message: "Select fields must have at least one option", path: ["options"] },
  );

export const updateCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    type: customFieldTypeSchema.optional(),
    options: z.array(z.string().trim().min(1).max(100)).optional(),
    required: z.boolean().optional(),
    display_order: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.type === "select" && data.options !== undefined) {
        return data.options.length > 0;
      }
      return true;
    },
    { message: "Select fields must have at least one option", path: ["options"] },
  );

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
