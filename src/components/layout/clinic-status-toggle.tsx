"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Tooltip from "@radix-ui/react-tooltip";

interface ClinicStatusToggleProps {
  initialActive: boolean;
  collapsed: boolean;
}

interface ActivationError {
  missing: string[];
}

export function ClinicStatusToggle({
  initialActive,
  collapsed,
}: ClinicStatusToggleProps) {
  const t = useTranslations("activation");
  const [active, setActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<ActivationError | null>(null);

  async function handleActivate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/activate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });

      if (res.ok) {
        setActive(true);
      } else if (res.status === 400) {
        const data = await res.json();
        if (Array.isArray(data.missing)) {
          setError({ missing: data.missing });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    setLoading(true);
    setShowConfirm(false);

    try {
      const res = await fetch("/api/onboarding/activate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });

      if (res.ok) {
        setActive(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    if (loading) return;
    setError(null);

    if (active) {
      setShowConfirm(true);
    } else {
      handleActivate();
    }
  }

  const statusDot = (
    <div
      className="size-2.5 shrink-0 rounded-full"
      style={{
        backgroundColor: active
          ? "var(--status-success)"
          : "var(--text-muted)",
      }}
    />
  );

  const toggleSwitch = (
    <div
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
      style={{
        backgroundColor: active ? "var(--accent)" : "var(--surface-elevated)",
      }}
    >
      <div
        className="absolute top-0.5 size-4 rounded-full transition-transform"
        style={{
          backgroundColor: "white",
          transform: active ? "translateX(16px)" : "translateX(2px)",
        }}
      />
    </div>
  );

  // Collapsed view: just a colored dot with tooltip
  if (collapsed) {
    return (
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleToggle}
              disabled={loading}
              className="flex w-full items-center justify-center px-2 py-3"
              aria-label={active ? t("active") : t("inactive")}
            >
              {statusDot}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={8}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: "var(--surface-elevated)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {active ? t("tooltip.active") : t("tooltip.inactive")}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return (
    <div className="px-3 py-3">
      {/* Toggle row */}
      <button
        onClick={handleToggle}
        disabled={loading}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
      >
        {statusDot}
        <span
          className="flex-1 text-left text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {active ? t("active") : t("inactive")}
        </span>
        {toggleSwitch}
      </button>

      {/* Deactivation confirmation */}
      {showConfirm && (
        <div
          className="mt-2 rounded-lg border p-3"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <p
            className="mb-2 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("confirmDeactivate")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--nav-hover-bg)]"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleDeactivate}
              disabled={loading}
              className="flex-1 rounded-md px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--status-danger)" }}
            >
              {t("confirm")}
            </button>
          </div>
        </div>
      )}

      {/* Activation error */}
      {error && (
        <div
          className="mt-2 rounded-lg border p-3"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <p
            className="mb-1 text-xs font-medium"
            style={{ color: "var(--status-danger)" }}
          >
            {t("activationFailed")}
          </p>
          <ul className="space-y-0.5">
            {error.missing.map((key) => (
              <li
                key={key}
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                - {t(`requirement.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
