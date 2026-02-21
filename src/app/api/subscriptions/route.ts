import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSubscriptionSchema } from "@/lib/validations/subscriptions";
import { createCustomer, createSubscription } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: subscription, error } = await admin
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("clinic_id", clinicId)
    .single();

  if (error || !subscription) {
    return NextResponse.json(
      { error: "Subscription not found" },
      { status: 404 },
    );
  }

  // Fetch usage stats: professional count + messages used
  const { count: profCount } = await admin
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  const { data: clinic } = await admin
    .from("clinics")
    .select("messages_used_month")
    .eq("id", clinicId)
    .single();

  return NextResponse.json({
    data: {
      ...subscription,
      usage: {
        professionals: profCount ?? 0,
        messages_used_month: clinic?.messages_used_month ?? 0,
      },
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
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

  // Get plan by slug (must be active)
  const { data: plan } = await admin
    .from("plans")
    .select("id, price_cents, name, slug")
    .eq("slug", parsed.data.planSlug)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json(
      { error: "Plan not found or inactive" },
      { status: 404 },
    );
  }

  // Get existing subscription (must be trialing or expired, not already active)
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, status, asaas_customer_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "Subscription record not found" },
      { status: 404 },
    );
  }

  if (existing.status === "active") {
    return NextResponse.json(
      { error: "Subscription is already active" },
      { status: 409 },
    );
  }

  if (existing.status !== "trialing" && existing.status !== "expired") {
    return NextResponse.json(
      { error: "Subscription must be trialing or expired to activate" },
      { status: 409 },
    );
  }

  // Get or create Asaas customer
  let asaasCustomerId = existing.asaas_customer_id;

  if (!asaasCustomerId) {
    // Get clinic info for customer creation
    const { data: clinic } = await admin
      .from("clinics")
      .select("name, phone")
      .eq("id", clinicId)
      .single();

    const customerResult = await createCustomer({
      name: parsed.data.creditCardHolderInfo.name,
      cpfCnpj: parsed.data.creditCardHolderInfo.cpfCnpj,
      email: parsed.data.creditCardHolderInfo.email,
      phone: clinic?.phone ?? undefined,
      externalReference: `clinic:${clinicId}`,
    });

    if (!customerResult.success || !customerResult.customerId) {
      return NextResponse.json(
        { error: `Failed to create payment customer: ${customerResult.error}` },
        { status: 502 },
      );
    }

    asaasCustomerId = customerResult.customerId;
  }

  // Calculate next due date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDueDate = tomorrow.toISOString().split("T")[0];

  // Create Asaas subscription
  const subResult = await createSubscription({
    customerId: asaasCustomerId,
    valueCents: plan.price_cents,
    nextDueDate,
    description: `Orbita - ${plan.name}`,
    externalReference: `sub:${existing.id}`,
    creditCard: parsed.data.creditCard,
    creditCardHolderInfo: parsed.data.creditCardHolderInfo,
  });

  if (!subResult.success || !subResult.subscriptionId) {
    return NextResponse.json(
      { error: `Failed to create subscription: ${subResult.error}` },
      { status: 502 },
    );
  }

  // Calculate period dates
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Update local subscription
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      status: "active",
      asaas_subscription_id: subResult.subscriptionId,
      asaas_customer_id: asaasCustomerId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    console.error("[subscriptions] Failed to update local subscription:", updateError);
    return NextResponse.json(
      { error: "Subscription created but failed to update local record" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { data: { id: existing.id, status: "active", plan: plan.slug } },
    { status: 201 },
  );
}
