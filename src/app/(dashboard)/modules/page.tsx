import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";
import { ModulesGrid, type ModuleEntry } from "@/components/modules/modules-grid";

const MODULE_KEYS = [
  "support",
  "scheduling",
  "confirmation",
  "nps",
  "billing",
  "recall",
] as const;

export default async function ModulesPage() {
  const t = await getTranslations("modules");
  const clinicId = await getClinicId();

  const moduleData: ModuleEntry[] = MODULE_KEYS.map((key) => ({
    key,
    enabled: true,
    settings: {},
  }));

  const conversationCounts: Record<string, number> = {};

  if (clinicId) {
    const admin = createAdminClient();

    const [configsResult, conversationsResult] = await Promise.all([
      admin
        .from("module_configs")
        .select("module_type, enabled, settings")
        .eq("clinic_id", clinicId),
      admin
        .from("conversations")
        .select("current_module")
        .eq("clinic_id", clinicId),
    ]);

    const configMap = new Map(
      (configsResult.data || []).map((c) => [c.module_type as string, c])
    );

    for (let i = 0; i < moduleData.length; i++) {
      const config = configMap.get(moduleData[i].key);
      if (config) {
        moduleData[i] = {
          key: moduleData[i].key,
          enabled: config.enabled as boolean,
          settings: (config.settings ?? {}) as Record<string, unknown>,
        };
      }
    }

    for (const conv of conversationsResult.data || []) {
      const mod = (conv.current_module as string) || "support";
      conversationCounts[mod] = (conversationCounts[mod] || 0) + 1;
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <ModulesGrid modules={moduleData} conversationCounts={conversationCounts} />
    </PageContainer>
  );
}
