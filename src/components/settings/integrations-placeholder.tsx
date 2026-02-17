import { useTranslations } from "next-intl";
import { Mail, CalendarDays, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const INTEGRATIONS = [
  { key: "gmail", icon: Mail },
  { key: "calendar", icon: CalendarDays },
  { key: "pagarme", icon: CreditCard },
] as const;

export function IntegrationsPlaceholder() {
  const t = useTranslations("settings.integrations");

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("comingSoon")}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {INTEGRATIONS.map(({ key, icon: Icon }) => (
          <Card key={key}>
            <div className="flex items-center gap-3">
              <Icon
                className="size-5"
                strokeWidth={1.75}
                style={{ color: "var(--text-muted)" }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t(key)}
                </p>
              </div>
              <Badge variant="neutral">{t("notConnected")}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
