import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClinicSchema } from "@/lib/validations/settings";
import { checkRequirements } from "@/lib/onboarding/requirements";

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
    clinicId: membership.clinic_id as string,
    role: membership.role as string,
    admin,
  };
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = activateClinicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can activate or deactivate the clinic" },
      { status: 403 }
    );
  }

  const { active } = parsed.data;

  // Deactivation requires no validation
  if (!active) {
    const { error: updateError } = await ctx.admin
      .from("clinics")
      .update({ is_active: false })
      .eq("id", ctx.clinicId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { active: false } });
  }

  // Activation: validate all 5 requirements
  const result = await checkRequirements(ctx.clinicId, ctx.admin);
  const missing = Object.entries(result.requirements)
    .filter(([, met]) => !met)
    .map(([key]) => key);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "requirements_not_met", missing },
      { status: 400 }
    );
  }

  const { error: updateError } = await ctx.admin
    .from("clinics")
    .update({ is_active: true })
    .eq("id", ctx.clinicId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { active: true } });
}
