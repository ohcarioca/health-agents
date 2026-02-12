import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  "tabs.clinic",
  "tabs.professionals",
  "tabs.patients",
  "tabs.integrations",
  "tabs.whatsapp",
] as const;

export default function SettingsPage() {
  const t = useTranslations("settings");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 space-y-6">
        <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                i === 0
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>
        <Card>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
