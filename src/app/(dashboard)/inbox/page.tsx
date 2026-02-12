import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function InboxPage() {
  const t = useTranslations("inbox");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="accent">{t("filters.all")}</Badge>
            <Badge variant="neutral">{t("filters.escalated")}</Badge>
            <Badge variant="neutral">{t("filters.resolved")}</Badge>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} interactive variant="glass">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </Card>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <Card variant="glass">
            <div className="flex min-h-[400px] items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("selectConversation")}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
