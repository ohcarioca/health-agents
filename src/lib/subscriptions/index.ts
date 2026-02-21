import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";

/** Active statuses that allow full platform usage */
const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due"];

/**
 * Get the current subscription for a clinic.
 * Returns null if no subscription exists.
 */
export async function getClinicSubscription(clinicId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("clinic_id", clinicId)
    .single();
  return data;
}

/**
 * Check if a clinic has an active subscription (trialing, active, or past_due).
 */
export async function isSubscriptionActive(clinicId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("clinic_id", clinicId)
    .single();

  if (!data) return false;
  return ACTIVE_STATUSES.includes(data.status as SubscriptionStatus);
}

/**
 * Check if the clinic can add more professionals based on plan limits.
 * Returns { allowed: true } or { allowed: false, limit, current }.
 */
export async function canAddProfessional(clinicId: string): Promise<{
  allowed: boolean;
  limit?: number | null;
  current?: number;
}> {
  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id, status, plans(max_professionals)")
    .eq("clinic_id", clinicId)
    .single();

  // Trial or no subscription = unlimited
  if (!sub || sub.status === "trialing") return { allowed: true };
  // No plan assigned yet = unlimited
  if (!sub.plan_id) return { allowed: true };

  const plan = sub.plans as { max_professionals: number | null } | null;
  if (!plan || plan.max_professionals === null) return { allowed: true };

  const { count } = await supabase
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  const current = count ?? 0;
  return {
    allowed: current < plan.max_professionals,
    limit: plan.max_professionals,
    current,
  };
}

/**
 * Increment the monthly message counter for a clinic.
 * Returns the new count and whether the clinic is over its plan limit.
 */
export async function incrementMessageCount(clinicId: string): Promise<{
  count: number;
  limit: number | null;
  overLimit: boolean;
  warningThreshold: boolean;
}> {
  const supabase = createAdminClient();

  // Get current count and increment
  const { data: clinicData } = await supabase
    .from("clinics")
    .select("messages_used_month")
    .eq("id", clinicId)
    .single();

  const currentCount = (clinicData?.messages_used_month ?? 0) + 1;

  await supabase
    .from("clinics")
    .update({ messages_used_month: currentCount })
    .eq("id", clinicId);

  // Get plan limit
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, plans(max_messages_month)")
    .eq("clinic_id", clinicId)
    .single();

  if (!sub || sub.status === "trialing") {
    return { count: currentCount, limit: null, overLimit: false, warningThreshold: false };
  }

  const plan = sub.plans as { max_messages_month: number | null } | null;
  const limit = plan?.max_messages_month ?? null;

  if (limit === null) {
    return { count: currentCount, limit: null, overLimit: false, warningThreshold: false };
  }

  return {
    count: currentCount,
    limit,
    overLimit: currentCount >= limit,
    warningThreshold: currentCount >= Math.floor(limit * 0.8),
  };
}
