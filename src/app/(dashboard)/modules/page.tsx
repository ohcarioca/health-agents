import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";
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

export default async function ModulesPage() {
  const t = await getTranslations("modules");
  const clinicId = await getClinicId();

  const moduleConfigs: Record<string, boolean> = {};
  const conversationCounts: Record<string, number> = {};

  if (clinicId) {
    const admin = createAdminClient();

    const [configsResult, conversationsResult] = await Promise.all([
      admin
        .from("module_configs")
        .select("module_type, enabled")
        .eq("clinic_id", clinicId),
      admin
        .from("conversations")
        .select("current_module")
        .eq("clinic_id", clinicId),
    ]);

    for (const config of configsResult.data || []) {
      moduleConfigs[config.module_type as string] = config.enabled as boolean;
    }

    for (const conv of conversationsResult.data || []) {
      const module = (conv.current_module as string) || "support";
      conversationCounts[module] = (conversationCounts[module] || 0) + 1;
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map(({ key, icon: Icon }) => {
          const enabled = moduleConfigs[key] !== false;
          const count = conversationCounts[key] || 0;

          return (
            <Card key={key} interactive variant="glass">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-lg p-2"
                    style={{ backgroundColor: "var(--accent-muted)" }}
                  >
                    <Icon
                      className="size-5"
                      strokeWidth={1.75}
                      style={{ color: "var(--accent)" }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t(`${key}.name`)}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t(`${key}.description`)}
                    </p>
                  </div>
                </div>
                <Badge variant={enabled ? "success" : "neutral"}>
                  {enabled ? t("enabled") : t("disabled")}
                </Badge>
              </div>
              <div
                className="mt-3 border-t pt-3"
                style={{ borderColor: "var(--border)" }}
              >
                <p
                  className="text-xs font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {count > 0
                    ? t("conversations", { count })
                    : t("noConversations")}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
