import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clinicSettingsSchema } from "@/lib/validations/settings";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return { clinicId: membership.clinic_id, role: membership.role, userId: user.id };
}

export async function GET() {
  const ctx = await getClinicId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: clinic, error } = await admin
    .from("clinics")
    .select(
      "id, name, slug, phone, email, address, city, state, zip_code, logo_url, timezone, operating_hours, created_at, updated_at, google_reviews_url, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, is_active, type, description, public_page_enabled, accent_color, social_links, show_prices, google_calendar_id",
    )
    .eq("id", ctx.clinicId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: clinic });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = clinicSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx = await getClinicId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can update clinic settings" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // Only update fields that were explicitly provided (not undefined).
  // This prevents the WhatsApp tab from wiping phone/email/address etc.
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updateData[key] = value === "" ? null : value;
    }
  }

  const { data: clinic, error: updateError } = await admin
    .from("clinics")
    .update(updateData)
    .eq("id", ctx.clinicId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: clinic });
}
