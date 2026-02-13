"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Spinner } from "@/components/ui/spinner";
import { ClinicForm } from "@/components/settings/clinic-form";
import { ProfessionalsList } from "@/components/settings/professionals-list";
import { PatientsPlaceholder } from "@/components/settings/patients-placeholder";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { WhatsAppPlaceholder } from "@/components/settings/whatsapp-placeholder";
import type { Clinic } from "@/types";

const TAB_KEYS = [
  "tabs.clinic",
  "tabs.professionals",
  "tabs.patients",
  "tabs.integrations",
  "tabs.whatsapp",
] as const;

const TAB_PARAM_MAP: Record<string, number> = {
  clinic: 0,
  professionals: 1,
  patients: 2,
  integrations: 3,
  whatsapp: 4,
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    (tabParam && TAB_PARAM_MAP[tabParam]) ?? 0,
  );
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClinic() {
      try {
        const res = await fetch("/api/settings/clinic");
        if (!res.ok) {
          console.error("[settings] failed to fetch clinic:", res.status);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) setClinic(json.data);
      } catch (err) {
        console.error("[settings] fetch clinic error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchClinic();
  }, []);

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 space-y-6">
        {/* Tab bar */}
        <div
          className="flex gap-1 overflow-x-auto border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {TAB_KEYS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                i === activeTab
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            {activeTab === 0 && clinic && <ClinicForm clinic={clinic} />}
            {activeTab === 1 && <ProfessionalsList />}
            {activeTab === 2 && <PatientsPlaceholder />}
            {activeTab === 3 && <IntegrationsTab />}
            {activeTab === 4 && <WhatsAppPlaceholder />}
          </>
        )}
      </div>
    </PageContainer>
  );
}
