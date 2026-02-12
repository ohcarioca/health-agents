import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, CheckCircle2, UserX, Star } from "lucide-react";

const KPI_ITEMS = [
  { key: "kpi.appointments", icon: Calendar, bg: "rgba(139,92,246,0.15)", color: "var(--accent)" },
  { key: "kpi.confirmations", icon: CheckCircle2, bg: "rgba(34,197,94,0.15)", color: "var(--success)" },
  { key: "kpi.noShows", icon: UserX, bg: "rgba(245,158,11,0.15)", color: "var(--warning)" },
  { key: "kpi.nps", icon: Star, bg: "rgba(59,130,246,0.15)", color: "var(--info)" },
] as const;

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_ITEMS.map(({ key, icon: Icon, bg, color }) => (
            <Card key={key} variant="glass">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: bg }}
                >
                  <Icon className="size-5" strokeWidth={1.75} style={{ color }} />
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {t(key)}
                </p>
              </div>
              <p
                className="mt-3 text-3xl font-bold font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                —
              </p>
              <Skeleton className="mt-3 h-10 w-full" />
            </Card>
          ))}
        </div>

        {/* Visual Funnel Placeholder */}
        <Card variant="glass">
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("funnel")}
          </p>
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>

        {/* Alerts List Placeholder */}
        <Card variant="glass">
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("alerts")}
          </p>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
