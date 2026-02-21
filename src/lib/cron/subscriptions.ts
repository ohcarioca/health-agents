import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Valid subscription statuses that allow cron processing.
 * - trialing: clinic is in trial period
 * - active: clinic has an active paid subscription
 * - past_due: payment failed but still within grace period
 */
const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due"];

/**
 * Fetches the set of clinic IDs that have an active subscription.
 * Used by all cron routes to skip clinics without valid subscriptions.
 */
export async function getSubscribedClinicIds(
  supabase: ReturnType<typeof createAdminClient>
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("clinic_id")
    .in("status", ACTIVE_SUBSCRIPTION_STATUSES);

  if (error) {
    console.error("[cron/subscriptions] failed to fetch subscriptions:", error.message);
    // Return empty set on error — fail closed (skip all clinics)
    return new Set();
  }

  return new Set((data ?? []).map((s) => s.clinic_id));
}
