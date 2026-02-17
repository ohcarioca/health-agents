import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getProfessionalColor } from "@/lib/calendar/utils";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function CalendarPage() {
  const t = await getTranslations("calendar");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/login");
  const clinicId = membership.clinic_id as string;

  // Fetch active professionals
  const { data: professionals } = await admin
    .from("professionals")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("name");

  const professionalOptions = (professionals ?? []).map((p, i) => ({
    id: p.id as string,
    name: p.name as string,
    color: getProfessionalColor(i),
  }));

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6">
        <CalendarView professionals={professionalOptions} />
      </div>
    </PageContainer>
  );
}
