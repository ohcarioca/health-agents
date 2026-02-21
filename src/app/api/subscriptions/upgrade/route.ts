import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { upgradeSubscriptionSchema } from "@/lib/validations/subscriptions";
import { updateSubscription } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = upgradeSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input" },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  const admin = createAdminClient();

  // Get current subscription (must be active with asaas_subscription_id)
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, status, asaas_subscription_id, plan_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "Subscription not found" },
      { status: 404 },
    );
  }

  if (subscription.status !== "active") {
    return NextResponse.json(
      { error: "Subscription must be active to upgrade" },
      { status: 409 },
    );
  }

  if (!subscription.asaas_subscription_id) {
    return NextResponse.json(
      { error: "No payment subscription linked" },
      { status: 409 },
    );
  }

  // Get new plan by slug
  const { data: newPlan } = await admin
    .from("plans")
    .select("id, price_cents, name, slug, max_professionals, max_messages_month")
    .eq("slug", parsed.data.planSlug)
    .eq("is_active", true)
    .single();

  if (!newPlan) {
    return NextResponse.json(
      { error: "Plan not found or inactive" },
      { status: 404 },
    );
  }

  // Update Asaas subscription with new value
  const result = await updateSubscription({
    subscriptionId: subscription.asaas_subscription_id,
    valueCents: newPlan.price_cents,
  });

  if (!result.success) {
    console.error("[subscriptions] Upgrade failed:", result.error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 502 },
    );
  }

  // Update local plan_id
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({ plan_id: newPlan.id })
    .eq("id", subscription.id);

  if (updateError) {
    console.error("[subscriptions] Failed to update local plan:", updateError);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      plan: {
        slug: newPlan.slug,
        name: newPlan.name,
        price_cents: newPlan.price_cents,
        max_professionals: newPlan.max_professionals,
        max_messages_month: newPlan.max_messages_month,
      },
    },
  });
}
