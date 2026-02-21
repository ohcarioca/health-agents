import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { cancelSubscription } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function POST() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  const admin = createAdminClient();

  // Get subscription (must have asaas_subscription_id, not already cancelled)
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, status, asaas_subscription_id, current_period_end")
    .eq("clinic_id", clinicId)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "Subscription not found" },
      { status: 404 },
    );
  }

  if (subscription.status === "cancelled") {
    return NextResponse.json(
      { error: "Subscription is already cancelled" },
      { status: 409 },
    );
  }

  if (!subscription.asaas_subscription_id) {
    return NextResponse.json(
      { error: "No payment subscription linked" },
      { status: 409 },
    );
  }

  // Cancel in Asaas
  const result = await cancelSubscription(subscription.asaas_subscription_id);

  if (!result.success) {
    return NextResponse.json(
      { error: `Failed to cancel subscription: ${result.error}` },
      { status: 502 },
    );
  }

  // Update local subscription
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: now,
    })
    .eq("id", subscription.id);

  if (updateError) {
    console.error("[subscriptions] Failed to update cancellation locally:", updateError);
    return NextResponse.json(
      { error: "Subscription cancelled in provider but failed to update locally" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      status: "cancelled",
      accessUntil: subscription.current_period_end,
    },
  });
}
