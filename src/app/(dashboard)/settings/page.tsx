"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Spinner } from "@/components/ui/spinner";
import { ClinicForm } from "@/components/settings/clinic-form";
import { ProfessionalsList } from "@/components/settings/professionals-list";
import { ServicesList } from "@/components/settings/services-list";
import { InsurancePlansList } from "@/components/settings/insurance-plans-list";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { WhatsAppConfig } from "@/components/settings/whatsapp-placeholder";
import { TeamContent } from "@/components/team/team-content";
import { CustomFieldsList } from "@/components/settings/custom-fields-list";
import { OperatingHoursTab } from "@/components/settings/operating-hours-tab";
import { SubscriptionManager } from "@/components/subscription/subscription-manager";
import type { Clinic } from "@/types";

const TAB_KEYS = [
  "tabs.clinic",
  "tabs.operatingHours",
  "tabs.professionals",
  "tabs.services",
  "tabs.insurancePlans",
  "tabs.customFields",
  "tabs.integrations",
  "tabs.whatsapp",
  "tabs.team",
  "tabs.subscription",
] as const;

const TAB_PARAM_MAP: Record<string, number> = {
  clinic: 0,
  "operating-hours": 1,
  professionals: 2,
  services: 3,
  "insurance-plans": 4,
  "custom-fields": 5,
  integrations: 6,
  whatsapp: 7,
  team: 8,
  subscription: 9,
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
          className="flex flex-wrap gap-1 overflow-x-auto rounded-lg p-1"
          style={{ backgroundColor: "var(--background)" }}
        >
          {TAB_KEYS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                i === activeTab
                  ? "bg-[var(--surface)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              style={i === activeTab ? { boxShadow: "var(--shadow-sm)" } : undefined}
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
            {activeTab === 1 && <OperatingHoursTab />}
            {activeTab === 2 && <ProfessionalsList clinic={clinic} />}
            {activeTab === 3 && <ServicesList />}
            {activeTab === 4 && <InsurancePlansList />}
            {activeTab === 5 && <CustomFieldsList />}
            {activeTab === 6 && <IntegrationsTab />}
            {activeTab === 7 && <WhatsAppConfig />}
          </>
        )}
        {activeTab === 8 && <TeamContent />}
        {activeTab === 9 && <SubscriptionManager />}
      </div>
    </PageContainer>
  );
}
