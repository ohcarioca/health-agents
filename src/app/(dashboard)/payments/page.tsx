import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PaymentsView } from "@/components/payments/payments-view";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const PER_PAGE = 25;

export default async function PaymentsPage() {
  const t = await getTranslations("payments");

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

  const { data: invoices, count } = await admin
    .from("invoices")
    .select("*, patients!inner(id, name, phone, cpf, email, asaas_customer_id), payment_links(*)", {
      count: "exact",
    })
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(0, PER_PAGE - 1);

  const { data: allInvoices } = await admin
    .from("invoices")
    .select("amount_cents, status")
    .eq("clinic_id", clinicId);

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mt-6">
        <PaymentsView
          initialInvoices={invoices ?? []}
          initialCount={count ?? 0}
          initialKpiInvoices={allInvoices ?? []}
        />
      </div>
    </PageContainer>
  );
}
