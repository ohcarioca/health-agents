"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle2, XCircle, PartyPopper } from "lucide-react";

interface RequirementsData {
  is_active: boolean;
  requirements: Record<string, boolean>;
}

const REQUIREMENT_KEYS = [
  "operating_hours",
  "professional_schedule",
  "service_with_price",
  "whatsapp",
  "google_calendar",
] as const;

export function StepCompletion() {
  const t = useTranslations("onboarding.completion");
  const tReq = useTranslations("activation.requirement");
  const router = useRouter();

  const [requirements, setRequirements] = useState<RequirementsData | null>(null);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const allMet = requirements
    ? Object.values(requirements.requirements).every(Boolean)
    : false;

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

  return (
    <div className="space-y-5 text-center">
      {/* Success icon */}
      <div className="flex justify-center">
        <div
          className="flex size-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--accent-subtle)" }}
        >
          <PartyPopper className="size-8" style={{ color: "var(--accent)" }} />
        </div>
      </div>

      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("title")}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("subtitle")}
        </p>
      </div>

      {/* Requirements checklist */}
      <div className="text-left">
        <h3 className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {t("requirementsTitle")}
        </h3>

        {loadingReqs ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : (
          <div className="space-y-2">
            {REQUIREMENT_KEYS.map((key) => {
              const met = requirements?.requirements[key] ?? false;
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: met ? "var(--success)" : "var(--border)",
                    backgroundColor: met ? "var(--success-subtle, transparent)" : "transparent",
                  }}
                >
                  {met ? (
                    <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--success)" }} />
                  ) : (
                    <XCircle className="size-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                  )}
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {tReq(key)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status message */}
      {!loadingReqs && !activated && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {allMet ? t("allMet") : t("someMissing")}
        </p>
      )}

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
