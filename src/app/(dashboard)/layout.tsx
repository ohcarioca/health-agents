import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { hasTimeBlocks } from "@/lib/onboarding/requirements";

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
    .select("clinic_id, role, clinics(name, is_active, operating_hours)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  // Redirect to onboarding if clinic is brand new (never completed Step 1)
  const clinic = membership?.clinics as {
    name: string;
    is_active: boolean;
    operating_hours: unknown;
  } | null;
  if (!clinic?.is_active && !hasTimeBlocks(clinic?.operating_hours)) {
    redirect("/setup");
  }

  const isActive = clinic?.is_active ?? false;
  const clinicName = clinic?.name || "My Clinic";
  const userName =
    user.user_metadata?.full_name || user.email || "User";
  const userEmail = user.email || "";

  return (
    <DashboardShell
      clinicName={clinicName}
      userName={userName}
      userEmail={userEmail}
      isActive={isActive}
    >
      {children}
    </DashboardShell>
  );
}
