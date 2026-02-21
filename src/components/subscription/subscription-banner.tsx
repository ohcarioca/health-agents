"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Crown, AlertTriangle, XCircle, Clock } from "lucide-react";
import { formatCents } from "@/lib/analytics/kpis";

interface SubscriptionData {
  id: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  plan_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plans: {
    name: string;
    price_cents: number;
    max_professionals: number | null;
    max_messages_month: number | null;
  } | null;
  usage: {
    professionals: number;
    messages_used_month: number;
  };
}

function computeTrialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  const end = new Date(trialEndsAt);
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function usagePercent(current: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

function usageColor(percent: number): string {
  if (percent >= 90) return "var(--error)";
  if (percent >= 70) return "var(--warning)";
  return "var(--info)";
}

interface UsageBarProps {
  label: string;
  percent: number;
}

function UsageBar({ label, percent }: UsageBarProps) {
  const color = usageColor(percent);
  return (
    <div className="flex-1">
      <p className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div
        style={{ backgroundColor: "var(--border)" }}
        className="h-2 w-full rounded-full"
      >
        <div
          style={{ width: `${percent}%`, backgroundColor: color }}
          className="h-2 rounded-full transition-all"
        />
      </div>
    </div>
  );
}

function TrialingBanner({
  data,
  t,
}: {
  data: SubscriptionData;
  t: ReturnType<typeof useTranslations>;
}) {
  const daysLeft = computeTrialDaysLeft(data.trial_ends_at);

  return (
    <div
      className="flex items-center gap-3 rounded-xl border-l-4 px-4 py-3"
      style={{
        backgroundColor: "var(--surface)",
        borderLeftColor: "var(--info)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <Crown
        className="size-5 shrink-0"
        style={{ color: "var(--info)" }}
      />
      <p
        className="flex-1 text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {t("trial.banner", { days: daysLeft })}
      </p>
      <Link
        href="/settings?tab=subscription"
        className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
        style={{ backgroundColor: "var(--info)" }}
      >
        {t("trial.cta")}
      </Link>
    </div>
  );
}

function ActiveBanner({
  data,
  t,
}: {
  data: SubscriptionData;
  t: ReturnType<typeof useTranslations>;
}) {
  const planName = data.plans?.name ?? "—";
  const nextBilling = formatDate(data.current_period_end);
  const maxProfessionals = data.plans?.max_professionals ?? null;
  const maxMessages = data.plans?.max_messages_month ?? null;

  const profPercent = usagePercent(data.usage.professionals, maxProfessionals);
  const msgPercent = usagePercent(data.usage.messages_used_month, maxMessages);

  const profLabel =
    maxProfessionals !== null
      ? t("usage.professionals", {
          current: data.usage.professionals,
          limit: maxProfessionals,
        })
      : t("usage.unlimited");

  const msgLabel =
    maxMessages !== null
      ? t("usage.messages", {
          current: data.usage.messages_used_month,
          limit: maxMessages,
        })
      : t("usage.unlimited");

  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-3">
        <Crown
          className="size-5 shrink-0"
          style={{ color: "var(--success)" }}
        />
        <p
          className="flex-1 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("active.banner", { plan: planName, date: nextBilling })}
        </p>
      </div>
      {(maxProfessionals !== null || maxMessages !== null) && (
        <div className="mt-3 flex gap-6">
          {maxProfessionals !== null && (
            <UsageBar label={profLabel} percent={profPercent} />
          )}
          {maxMessages !== null && (
            <UsageBar label={msgLabel} percent={msgPercent} />
          )}
        </div>
      )}
    </div>
  );
}

function PastDueBanner({
  data,
  t,
}: {
  data: SubscriptionData;
  t: ReturnType<typeof useTranslations>;
}) {
  const amount = data.plans ? formatCents(data.plans.price_cents) : "—";

  return (
    <div
      className="flex items-center gap-3 rounded-xl border-l-4 px-4 py-3"
      style={{
        backgroundColor: "var(--surface)",
        borderLeftColor: "var(--warning)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <AlertTriangle
        className="size-5 shrink-0"
        style={{ color: "var(--warning)" }}
      />
      <p
        className="flex-1 text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {t("pastDue.banner", { amount })}
      </p>
      <Link
        href="/settings?tab=subscription"
        className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
        style={{ backgroundColor: "var(--warning)" }}
      >
        {t("pastDue.cta")}
      </Link>
    </div>
  );
}

function ExpiredBanner({
  t,
}: {
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border-l-4 px-4 py-3"
      style={{
        backgroundColor: "var(--surface)",
        borderLeftColor: "var(--error)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-3">
        <Clock
          className="size-5 shrink-0"
          style={{ color: "var(--error)" }}
        />
        <p
          className="flex-1 text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("trial.expired")}
        </p>
        <Link
          href="/settings?tab=subscription"
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
          style={{ backgroundColor: "var(--error)" }}
        >
          {t("trial.cta")}
        </Link>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("readOnly.description")}
      </p>
    </div>
  );
}

function CancelledBanner({
  data,
  t,
}: {
  data: SubscriptionData;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border-l-4 px-4 py-3"
      style={{
        backgroundColor: "var(--surface)",
        borderLeftColor: "var(--error)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-3">
        <XCircle
          className="size-5 shrink-0"
          style={{ color: "var(--error)" }}
        />
        <div className="flex-1">
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("cancelled.label")}
          </p>
          {data.current_period_end && (
            <p
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {t("cancelled.accessUntil", {
                date: formatDate(data.current_period_end),
              })}
            </p>
          )}
        </div>
        <Link
          href="/settings?tab=subscription"
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
          style={{ backgroundColor: "var(--error)" }}
        >
          {t("trial.cta")}
        </Link>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("readOnly.description")}
      </p>
    </div>
  );
}

export function SubscriptionBanner() {
  const t = useTranslations("subscription");
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const res = await fetch("/api/subscriptions");
        if (res.ok) {
          const body: { data?: SubscriptionData } = await res.json();
          setData(body.data ?? null);
        }
      } catch {
        // Subscription banner is supplementary — silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchSubscription();
    const interval = setInterval(fetchSubscription, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) return null;

  switch (data.status) {
    case "trialing":
      return <TrialingBanner data={data} t={t} />;
    case "active":
      return <ActiveBanner data={data} t={t} />;
    case "past_due":
      return <PastDueBanner data={data} t={t} />;
    case "expired":
      return <ExpiredBanner t={t} />;
    case "cancelled":
      return <CancelledBanner data={data} t={t} />;
    default:
      return null;
  }
}
