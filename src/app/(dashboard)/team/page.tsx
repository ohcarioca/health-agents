import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function TeamPage() {
  const t = useTranslations("team");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={<Button variant="primary" disabled>{t("invite")}</Button>}
      />
      <div className="mt-6">
        <Card variant="glass">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name="Owner User" size="sm" />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t("placeholder.ownerName")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("placeholder.ownerEmail")}
                  </p>
                </div>
              </div>
              <Badge variant="accent">{t("roles.owner")}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
