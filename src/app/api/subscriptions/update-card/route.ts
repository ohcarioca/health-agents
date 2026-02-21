import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateCardSchema } from "@/lib/validations/subscriptions";
import { tokenizeCreditCard } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateCardSchema.safeParse(body);
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

  // Get subscription (must have asaas_customer_id)
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, asaas_customer_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "Subscription not found" },
      { status: 404 },
    );
  }

  if (!subscription.asaas_customer_id) {
    return NextResponse.json(
      { error: "No payment customer linked" },
      { status: 409 },
    );
  }

  // Tokenize new credit card
  const result = await tokenizeCreditCard({
    customerId: subscription.asaas_customer_id,
    creditCard: parsed.data.creditCard,
    creditCardHolderInfo: parsed.data.creditCardHolderInfo,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: `Failed to update card: ${result.error}` },
      { status: 502 },
    );
  }

  // Extract last 4 digits from masked card number (e.g., "xxxxxxxxxxxx1234")
  const lastFourDigits = result.creditCardNumber
    ? result.creditCardNumber.slice(-4)
    : undefined;

  return NextResponse.json({
    data: {
      lastFourDigits,
      brand: result.creditCardBrand,
    },
  });
}
