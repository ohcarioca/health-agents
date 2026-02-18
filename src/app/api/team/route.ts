import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClinicRole } from "@/types";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic membership" }, { status: 404 });
  }

  const { data: rows } = await admin
    .from("clinic_users")
    .select("id, user_id, clinic_id, role, created_at")
    .eq("clinic_id", membership.clinic_id)
    .order("created_at", { ascending: true });

  const members = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      return {
        id: row.id,
        user_id: row.user_id,
        clinic_id: row.clinic_id,
        role: row.role as ClinicRole,
        created_at: row.created_at,
        email: data.user?.email ?? "",
        name: data.user?.user_metadata?.full_name ?? "",
      };
    }),
  );

  return NextResponse.json({
    data: {
      members,
      currentUserId: user.id,
      currentRole: membership.role as ClinicRole,
    },
  });
}
