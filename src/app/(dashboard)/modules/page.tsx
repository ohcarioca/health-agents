import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Star,
  CreditCard,
  RotateCcw,
} from "lucide-react";

const MODULES = [
  { key: "support", icon: MessageSquare },
  { key: "scheduling", icon: Calendar },
  { key: "confirmation", icon: CheckCircle2 },
  { key: "nps", icon: Star },
  { key: "billing", icon: CreditCard },
  { key: "recall", icon: RotateCcw },
] as const;

export default function ModulesPage() {
  const t = useTranslations("modules");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map(({ key, icon: Icon }) => (
          <Card key={key} interactive variant="glass">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2" style={{ backgroundColor: "var(--accent-muted)" }}>
                  <Icon className="size-5" strokeWidth={1.75} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t(`${key}.name`)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t(`${key}.description`)}
                  </p>
                </div>
              </div>
              <Badge variant="success">{t("active")}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
