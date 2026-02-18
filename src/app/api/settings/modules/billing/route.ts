import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const updateBillingSettingsSchema = z.object({
  auto_billing: z.boolean(),
});

async function getClinicContext() {
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
  return {
    clinicId: membership.clinic_id,
    role: membership.role,
    userId: user.id,
  };
}

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", ctx.clinicId)
    .eq("module_type", "billing")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Module config not found" },
      { status: 404 },
    );
  }

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    data: { auto_billing: settings.auto_billing === true },
  });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateBillingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Read current settings to merge (preserves other settings)
  const { data: current } = await admin
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", ctx.clinicId)
    .eq("module_type", "billing")
    .single();

  const currentSettings = (current?.settings ?? {}) as Record<string, unknown>;
  const newSettings = {
    ...currentSettings,
    auto_billing: parsed.data.auto_billing,
  };

  const { data, error } = await admin
    .from("module_configs")
    .update({ settings: newSettings })
    .eq("clinic_id", ctx.clinicId)
    .eq("module_type", "billing")
    .select("id, settings")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
