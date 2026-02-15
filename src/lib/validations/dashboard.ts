import { z } from "zod";

export const dashboardPeriodSchema = z.enum(["today", "7d", "30d", "90d"]);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

export const reportPeriodSchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
  professionalId: z.string().uuid().optional(),
});
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
