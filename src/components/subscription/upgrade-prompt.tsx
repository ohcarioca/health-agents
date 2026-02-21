"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { AlertTriangle, Users } from "lucide-react";

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: "subscription_required" | "professional_limit_reached";
  limit?: number;
  current?: number;
}

export function UpgradePrompt({
  open,
  onOpenChange,
  reason,
  limit,
  current,
}: UpgradePromptProps) {
  const t = useTranslations("subscription");
  const router = useRouter();

  function handleCta() {
    onOpenChange(false);
    router.push("/settings?tab=subscription");
  }

  if (reason === "subscription_required") {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("readOnly.title")}
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div
            className="flex size-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, var(--warning) 15%, transparent)" }}
          >
            <AlertTriangle
              className="size-7"
              style={{ color: "var(--warning)" }}
            />
          </div>

          <p
            className="text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("readOnly.description")}
          </p>

          <p
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {t("readOnly.dataNotice")}
          </p>

          <button
            type="button"
            onClick={handleCta}
            className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("trial.cta")}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("limitReached.professionalsTitle")}
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
        >
          <Users
            className="size-7"
            style={{ color: "var(--accent)" }}
          />
        </div>

        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("limitReached.professionals", {
            current: current ?? 0,
            limit: limit ?? 0,
          })}
        </p>

        <button
          type="button"
          onClick={handleCta}
          className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("plans.changePlan")}
        </button>
      </div>
    </Dialog>
  );
}
