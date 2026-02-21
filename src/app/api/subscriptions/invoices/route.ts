import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscriptionPayments } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get subscription's asaas_subscription_id
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("asaas_subscription_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "Subscription not found" },
      { status: 404 },
    );
  }

  if (!subscription.asaas_subscription_id) {
    return NextResponse.json({ data: [] });
  }

  // Fetch payments from Asaas
  const result = await getSubscriptionPayments(
    subscription.asaas_subscription_id,
  );

  if (!result.success) {
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: result.payments ?? [] });
}
