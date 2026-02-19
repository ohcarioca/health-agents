"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  PartyPopper,
  Sparkles,
} from "lucide-react";

interface RequirementsData {
  is_active: boolean;
  requirements: Record<string, boolean>;
}

type RequirementKey =
  | "operating_hours"
  | "professional_schedule"
  | "service_with_price"
  | "whatsapp";

const REQUIREMENT_KEYS: RequirementKey[] = [
  "operating_hours",
  "professional_schedule",
  "service_with_price",
  "whatsapp",
];

const SETTINGS_TAB_MAP: Record<RequirementKey, string> = {
  operating_hours: "/settings?tab=clinic",
  professional_schedule: "/settings?tab=professionals",
  service_with_price: "/settings?tab=services",
  whatsapp: "/settings?tab=whatsapp",
};

export function StepCompletion() {
  const t = useTranslations("onboarding.completion");
  const tReq = useTranslations("activation.requirement");
  const router = useRouter();

  const [requirements, setRequirements] = useState<RequirementsData | null>(null);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/onboarding/status");
        if (res.ok) {
          const { data } = await res.json();
          setRequirements(data);
          if (data.is_active) setActivated(true);
        }
      } catch (err) {
        console.error("[completion] failed to fetch status:", err);
      } finally {
        setLoadingReqs(false);
      }
    }
    fetchStatus();
  }, []);

  const reqs = requirements?.requirements ?? {};
  const completedKeys = REQUIREMENT_KEYS.filter((k) => reqs[k]);
  const pendingKeys = REQUIREMENT_KEYS.filter((k) => !reqs[k]);
  const allMet = pendingKeys.length === 0 && requirements !== null;
  const completedCount = completedKeys.length;
  const totalCount = REQUIREMENT_KEYS.length;

  async function handleActivate() {
    setActivating(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/activate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (res.ok) {
        setActivated(true);
      } else {
        setError(t("activationError"));
      }
    } catch {
      setError(t("activationError"));
    } finally {
      setActivating(false);
    }
  }

  function handleGoToDashboard() {
    document.cookie = "onboarding_active=; path=/; max-age=0";
    router.push("/");
    router.refresh();
  }

  function handleGoToSettings(key: RequirementKey) {
    document.cookie = "onboarding_active=; path=/; max-age=0";
    router.push(SETTINGS_TAB_MAP[key]);
    router.refresh();
  }

  return (
    <div className="space-y-5 text-center">
      {/* Success icon */}
      <div className="flex justify-center">
        <div
          className="flex size-16 items-center justify-center rounded-full"
          style={{ backgroundColor: allMet && !loadingReqs ? "var(--success-subtle, #ecfdf5)" : "var(--accent-subtle)" }}
        >
          {allMet && !loadingReqs ? (
            <Sparkles className="size-8" style={{ color: "var(--success)" }} />
          ) : (
            <PartyPopper className="size-8" style={{ color: "var(--accent)" }} />
          )}
        </div>
      </div>

      {/* Title + subtitle */}
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {allMet && !loadingReqs ? t("titleAllMet") : t("title")}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {allMet && !loadingReqs ? t("subtitleAllMet") : t("subtitle")}
        </p>
      </div>

      {/* Progress bar */}
      {!loadingReqs && (
        <div className="mx-auto w-full max-w-xs">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("progress")}
            </span>
            <span className="text-xs font-semibold" style={{ color: allMet ? "var(--success)" : "var(--text-primary)" }}>
              {completedCount}/{totalCount}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(completedCount / totalCount) * 100}%`,
                backgroundColor: allMet ? "var(--success)" : "var(--accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* Requirements list */}
      <div className="text-left">
        {loadingReqs ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Completed items */}
            {completedKeys.map((key) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: "var(--success-subtle, #f0fdf4)" }}
              >
                <CheckCircle2 className="size-5 shrink-0" style={{ color: "var(--success)" }} />
                <span
                  className="flex-1 text-sm font-medium"
                  style={{ color: "var(--success)" }}
                >
                  {tReq(key)}
                </span>
              </div>
            ))}

            {/* Divider between completed and pending */}
            {completedKeys.length > 0 && pendingKeys.length > 0 && (
              <div className="flex items-center gap-2 px-1 py-1.5">
                <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("pendingLabel")}
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
              </div>
            )}

            {/* Pending items with accordion */}
            {pendingKeys.map((key) => {
              const isExpanded = expandedKey === key;
              return (
                <div
                  key={key}
                  className="overflow-hidden rounded-lg border"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:opacity-80"
                    style={{ backgroundColor: "transparent" }}
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                  >
                    <Circle className="size-5 shrink-0" style={{ color: "var(--text-muted)" }} />
                    <span
                      className="flex-1 text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {tReq(key)}
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 transition-transform duration-200"
                      style={{
                        color: "var(--text-muted)",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>

                  {/* Accordion content */}
                  <div
                    className="overflow-hidden transition-all duration-200"
                    style={{
                      maxHeight: isExpanded ? "120px" : "0px",
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    <div
                      className="border-t px-3 pb-3 pt-2.5"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <p className="mb-2.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {t(`hint_${key}`)}
                      </p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ color: "var(--accent)" }}
                        onClick={() => handleGoToSettings(key)}
                      >
                        {t("goToSettings")}
                        <ExternalLink className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activated success */}
      {activated && (
        <p className="text-sm font-medium" style={{ color: "var(--success)" }}>
          {t("activated")}
        </p>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pt-1">
        {allMet && !activated && (
          <Button onClick={handleActivate} disabled={activating}>
            {activating ? <Spinner size="sm" /> : t("activate")}
          </Button>
        )}
        <Button
          variant={activated || !allMet ? "primary" : "ghost"}
          onClick={handleGoToDashboard}
        >
          {t("goToDashboard")}
        </Button>
      </div>
    </div>
  );
}
