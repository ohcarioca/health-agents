import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["kpi.appointments", "kpi.confirmations", "kpi.noShows", "kpi.nps"].map(
            (key) => (
              <Card key={key}>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {t(key)}
                </p>
                <p
                  className="mt-2 text-3xl font-bold font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  —
                </p>
                <Skeleton className="mt-3 h-10 w-full" />
              </Card>
            )
          )}
        </div>

        {/* Visual Funnel Placeholder */}
        <Card>
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("funnel")}
          </p>
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>

        {/* Alerts List Placeholder */}
        <Card>
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
