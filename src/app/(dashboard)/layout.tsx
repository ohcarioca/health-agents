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
    .select("clinic_id, role, clinics(name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const clinicName =
    (membership?.clinics as { name: string } | null)?.name || "My Clinic";
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
      />
      <main
        className="min-h-screen pt-14 transition-all duration-200 lg:pl-[260px] lg:pt-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 0% 0%, rgba(139, 92, 246, 0.04) 0%, transparent 50%)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
