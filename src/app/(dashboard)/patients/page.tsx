import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PatientsView } from "@/components/patients/patients-view";

const PER_PAGE = 25;

export default async function PatientsPage() {
  const t = await getTranslations("patients");

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

  const { data: patients, count } = await admin
    .from("patients")
    .select("id, name, phone, email, cpf, date_of_birth, notes, last_visit_at, created_at", {
      count: "exact",
    })
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(0, PER_PAGE - 1);

  return (
    <div>
      <h1
        className="mb-6 text-xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {t("title")}
      </h1>
      <PatientsView
        initialPatients={patients ?? []}
        initialCount={count ?? 0}
      />
    </div>
  );
}
