import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";
import { calculateNPS, formatCents } from "@/lib/analytics/kpis";
import {
  Calendar,
  CheckCircle2,
  UserX,
  Star,
  DollarSign,
  MessageSquare,
} from "lucide-react";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const clinicId = await getClinicId();

  if (!clinicId) {
    return (
      <PageContainer>
        <PageHeader title={t("title")} />
        <p style={{ color: "var(--text-muted)" }}>{t("noData")}</p>
      </PageContainer>
    );
  }

  const admin = createAdminClient();

  const { data: clinic } = await admin
    .from("clinics")
    .select("timezone")
    .eq("id", clinicId)
    .single();

  const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setDate(todayEnd.getDate() + 1);
  todayEnd.setHours(0, 0, 0, 0);

  const [appointments, noShows, confirmations, npsData, invoicesData, escalated] =
    await Promise.all([
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("starts_at", todayStart.toISOString())
        .lt("starts_at", todayEnd.toISOString()),

      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "no_show")
        .gte("starts_at", todayStart.toISOString())
        .lt("starts_at", todayEnd.toISOString()),

      admin
        .from("confirmation_queue")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "sent"),

      admin
        .from("nps_responses")
        .select("score")
        .eq("clinic_id", clinicId)
        .gte("created_at", todayStart.toISOString())
        .lt("created_at", todayEnd.toISOString()),

      admin
        .from("invoices")
        .select("amount_cents, status")
        .eq("clinic_id", clinicId)
        .eq("status", "overdue"),

      admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "escalated"),
    ]);

  const npsScores = (npsData.data || [])
    .map((r: { score: number | null }) => r.score)
    .filter((s): s is number => s !== null);
  const nps = calculateNPS(npsScores);

  const overdueTotal = (invoicesData.data || []).reduce(
    (sum: number, inv: { amount_cents: number }) => sum + inv.amount_cents,
    0,
  );

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label={t("kpi.appointments")}
            value={appointments.count || 0}
            icon={Calendar}
            iconBg="rgba(139,92,246,0.15)"
            iconColor="var(--accent)"
          />
          <KpiCard
            label={t("kpi.confirmations")}
            value={confirmations.count || 0}
            icon={CheckCircle2}
            iconBg="rgba(34,197,94,0.15)"
            iconColor="var(--success)"
          />
          <KpiCard
            label={t("kpi.noShows")}
            value={noShows.count || 0}
            icon={UserX}
            iconBg="rgba(245,158,11,0.15)"
            iconColor="var(--warning)"
          />
          <KpiCard
            label={t("kpi.nps")}
            value={nps.score !== null ? nps.score : "\u2014"}
            icon={Star}
            iconBg="rgba(59,130,246,0.15)"
            iconColor="var(--info)"
            subtitle={nps.total > 0 ? `${nps.total} responses` : undefined}
          />
          <KpiCard
            label={t("kpi.revenue")}
            value={overdueTotal > 0 ? formatCents(overdueTotal) : "\u2014"}
            icon={DollarSign}
            iconBg="rgba(239,68,68,0.15)"
            iconColor="var(--danger)"
            subtitle={overdueTotal > 0 ? "overdue" : undefined}
          />
          <KpiCard
            label={t("kpi.escalated")}
            value={escalated.count || 0}
            icon={MessageSquare}
            iconBg="rgba(139,92,246,0.15)"
            iconColor="var(--accent)"
          />
        </div>
        <AlertsList />
      </div>
    </PageContainer>
  );
}
