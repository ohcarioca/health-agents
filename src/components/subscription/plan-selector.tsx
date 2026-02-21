"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  max_professionals: number | null;
  max_messages_month: number | null;
  description: string | null;
}

export interface SelectedPlan {
  slug: string;
  name: string;
  price_cents: number;
}

interface PlanSelectorProps {
  currentPlanSlug?: string;
  onSelectPlan: (plan: SelectedPlan) => void;
}

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function PlanSelector({ currentPlanSlug, onSelectPlan }: PlanSelectorProps) {
  const t = useTranslations("subscription");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlans() {
      try {
        const res = await fetch("/api/plans");
        if (!res.ok) {
          throw new Error("Failed to fetch plans");
        }
        const json = (await res.json()) as { data?: Plan[] };
        if (!cancelled && json.data) {
          setPlans(json.data);
        }
      } catch {
        if (!cancelled) {
          setError(t("plans.title"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPlans();

    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div>
      <h2
        className="mb-6 text-lg font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {t("plans.title")}
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentPlanSlug;

          return (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-xl border p-6"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: isCurrent ? "var(--accent)" : "var(--border)",
                borderWidth: isCurrent ? "2px" : "1px",
              }}
            >
              {isCurrent && (
                <span
                  className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  <Check className="size-3" strokeWidth={2.5} />
                  {t("plans.current")}
                </span>
              )}

              <div className="mb-4">
                <h3
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {plan.name}
                </h3>
                {plan.description && (
                  <p
                    className="mt-1 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {plan.description}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <span
                  className="text-3xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  R$ {formatPrice(plan.price_cents)}
                </span>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("plans.month")}
                </span>
              </div>

              <ul className="mb-6 flex flex-col gap-2">
                <li
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Check
                    className="size-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: "var(--accent)" }}
                  />
                  {plan.max_professionals === null
                    ? t("plans.professionalsUnlimited")
                    : t("plans.professionals", { count: plan.max_professionals })}
                </li>
                <li
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Check
                    className="size-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: "var(--accent)" }}
                  />
                  {plan.max_messages_month === null
                    ? t("plans.messagesUnlimited")
                    : t("plans.messages", { count: plan.max_messages_month })}
                </li>
              </ul>

              <div className="mt-auto">
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onSelectPlan({ slug: plan.slug, name: plan.name, price_cents: plan.price_cents })}
                    className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {currentPlanSlug
                      ? t("plans.changePlan")
                      : t("plans.subscribe")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
