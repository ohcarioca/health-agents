import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function WhatsAppPlaceholder() {
  const t = useTranslations("settings.whatsapp");

  return (
    <Card variant="glass">
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
        >
          <MessageCircle
            className="size-5"
            strokeWidth={1.75}
            style={{ color: "var(--success)" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("title")}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("comingSoon")}
          </p>
        </div>
        <Badge variant="neutral">{t("notConnected")}</Badge>
      </div>
    </Card>
  );
}
