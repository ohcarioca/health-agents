import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamContent } from "@/components/team/team-content";
import type { TeamMember, ClinicRole } from "@/types";

export default async function TeamPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  // Get caller's membership
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    redirect("/setup");
  }

  // Get all clinic members
  const { data: rows } = await admin
    .from("clinic_users")
    .select("id, user_id, clinic_id, role, created_at")
    .eq("clinic_id", membership.clinic_id)
    .order("created_at", { ascending: true });

  // Enrich with auth user metadata
  const members: TeamMember[] = await Promise.all(
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

  return (
    <TeamContent
      initialMembers={members}
      currentUserId={user.id}
      currentRole={membership.role as ClinicRole}
    />
  );
}
