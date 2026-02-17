import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch clinic info using admin client (bypasses RLS for initial load)
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role, clinics(name, phone)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  // Redirect to onboarding if clinic setup is incomplete (phone is NULL until onboarding saves it)
  const clinic = membership?.clinics as { name: string; phone: string | null } | null;
  if (clinic?.phone === null || clinic?.phone === undefined) {
    redirect("/setup");
  }

  const clinicName = clinic?.name || "My Clinic";
  const userName =
    user.user_metadata?.full_name || user.email || "User";
  const userEmail = user.email || "";

  return (
    <DashboardShell
      clinicName={clinicName}
      userName={userName}
      userEmail={userEmail}
    >
      {children}
    </DashboardShell>
  );
}
