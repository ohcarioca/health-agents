import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  return { clinicId: membership.clinic_id as string, admin };
}

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkRequirements(ctx.clinicId, ctx.admin);

  return NextResponse.json({ data: result });
}
