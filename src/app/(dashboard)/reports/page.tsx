import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ReportsPage() {
  const t = useTranslations("reports");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={<Button variant="secondary" disabled>{t("exportPdf")}</Button>}
      />
      <div className="mt-6 space-y-6">
        <div className="flex items-center gap-2">
          <Badge variant="accent">{t("period.7d")}</Badge>
          <Badge variant="neutral">{t("period.30d")}</Badge>
          <Badge variant="neutral">{t("period.90d")}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("chart.appointments")}
            </p>
            <Skeleton className="mt-4 h-48 w-full" />
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("chart.nps")}
            </p>
            <Skeleton className="mt-4 h-48 w-full" />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
