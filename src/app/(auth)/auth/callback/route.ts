import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Check if user already has a clinic
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("id")
    .eq("user_id", data.user.id)
    .limit(1)
    .single();

  if (!membership) {
    // First-time OAuth user: create a clinic
    const name =
      data.user.user_metadata?.full_name || data.user.email || "My Clinic";
    const slug =
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) +
      "-" +
      Date.now().toString(36);

    const { data: clinic } = await admin
      .from("clinics")
      .insert({ name, slug })
      .select("id")
      .single();

    if (clinic) {
      await admin
        .from("clinic_users")
        .insert({
          clinic_id: clinic.id,
          user_id: data.user.id,
          role: "owner",
        });

      // Create default module configs
      const moduleTypes = [
        "support",
        "scheduling",
        "confirmation",
        "nps",
        "billing",
        "recall",
      ] as const;
      await admin.from("module_configs").insert(
        moduleTypes.map((type) => ({
          clinic_id: clinic.id,
          module_type: type,
          enabled: true,
        }))
      );
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
