import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";
import { calculateNPS, formatCents, calculateRevenueMetrics } from "@/lib/analytics/kpis";
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
        .eq("clinic_id", clinicId),

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

  const revenue = calculateRevenueMetrics(
    (invoicesData.data || []).map((inv: { amount_cents: number; status: string }) => ({
      amount_cents: inv.amount_cents,
      status: inv.status,
    }))
  );

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 space-y-6">
        {/* Row 1: Primary KPI cards — 3 columns */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label={t("kpi.appointments")}
            value={appointments.count || 0}
            icon={Calendar}
            iconBg="rgba(139,92,246,0.15)"
            iconColor="var(--accent)"
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
            value={revenue.paidCents > 0 ? formatCents(revenue.paidCents) : "\u2014"}
            icon={DollarSign}
            iconBg="rgba(16,185,129,0.15)"
            iconColor="var(--success)"
            subtitle={revenue.overdueCount > 0 ? `${revenue.overdueCount} em atraso` : undefined}
          />
        </div>

        {/* Row 2: Upcoming Appointments (2/3) + Alerts (1/3) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <UpcomingAppointments />
          </div>
          <div className="lg:col-span-1">
            <AlertsList />
          </div>
        </div>

        {/* Row 3: Secondary stats — inline badges */}
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-5 py-4"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" style={{ color: "var(--success)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("kpi.confirmations")}
            </span>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {confirmations.count || 0}
            </span>
          </div>
          <div
            className="hidden h-4 w-px sm:block"
            style={{ backgroundColor: "var(--border)" }}
          />
          <div className="flex items-center gap-2">
            <UserX className="size-4" style={{ color: "var(--warning)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("kpi.noShows")}
            </span>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {noShows.count || 0}
            </span>
          </div>
          <div
            className="hidden h-4 w-px sm:block"
            style={{ backgroundColor: "var(--border)" }}
          />
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4" style={{ color: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("kpi.escalated")}
            </span>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {escalated.count || 0}
            </span>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
