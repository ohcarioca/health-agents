import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/layout/sidebar";

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
    .select("clinic_id, role, clinics(name, phone, is_active)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  // Redirect to onboarding if clinic setup is incomplete (phone is NULL until onboarding saves it)
  const clinic = membership?.clinics as { name: string; phone: string | null; is_active: boolean } | null;
  if (clinic?.phone === null || clinic?.phone === undefined) {
    redirect("/setup");
  }

  const isActive = clinic?.is_active ?? false;
  const clinicName = clinic?.name || "My Clinic";
  const userName =
    user.user_metadata?.full_name || user.email || "User";
  const userEmail = user.email || "";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      <Sidebar
        clinicName={clinicName}
        userName={userName}
        userEmail={userEmail}
        isActive={isActive}
      />
      <main className="relative min-h-screen pt-14 transition-all duration-200 lg:pl-[260px] lg:pt-0">
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            backgroundImage: "var(--atmosphere-dashboard)",
          }}
        />
        <div className="relative">{children}</div>
      </main>
    </div>
  );
}
