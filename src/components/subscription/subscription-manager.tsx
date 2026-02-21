"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Crown,
  CreditCard,
  ArrowRightLeft,
  XCircle,
  ExternalLink,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { PlanSelector } from "./plan-selector";
import { CreditCardForm } from "./credit-card-form";
import { formatCents } from "@/lib/analytics/kpis";

// --- Types ---

interface PlanData {
  name: string;
  slug: string;
  price_cents: number;
  max_professionals: number | null;
  max_messages_month: number | null;
}

interface SubscriptionData {
  id: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  plan_id: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  plans: PlanData | null;
  usage: {
    professionals: number;
    messages_used_month: number;
  };
}

interface Invoice {
  id: string;
  value: number;
  dueDate: string;
  status: string;
  paymentDate?: string;
  invoiceUrl?: string;
}

// --- Helpers ---

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function computeTrialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  const end = new Date(trialEndsAt);
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
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

function mapInvoiceStatus(
  asaasStatus: string
): "paid" | "pending" | "overdue" {
  const normalized = asaasStatus.toUpperCase();
  if (
    normalized === "RECEIVED" ||
    normalized === "CONFIRMED" ||
    normalized === "RECEIVED_IN_CASH"
  ) {
    return "paid";
  }
  if (normalized === "OVERDUE") {
    return "overdue";
  }
  return "pending";
}

// --- Sub-components ---

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

interface StatusBadgeProps {
  status: "paid" | "pending" | "overdue";
  label: string;
}

function StatusBadge({ status, label }: StatusBadgeProps) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    paid: { bg: "rgba(34,197,94,0.1)", text: "var(--success)" },
    pending: { bg: "rgba(234,179,8,0.1)", text: "var(--warning)" },
    overdue: { bg: "rgba(239,68,68,0.1)", text: "var(--error)" },
  };

  const colors = colorMap[status] ?? colorMap.pending;

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}

// --- Main Component ---

export function SubscriptionManager() {
  const t = useTranslations("subscription");

  // Subscription data
  const [subscription, setSubscription] = useState<SubscriptionData | null>(
    null
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // UI state
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState("");
  const [cardFormMode, setCardFormMode] = useState<"subscribe" | "update-card">(
    "subscribe"
  );
  const [cancelling, setCancelling] = useState(false);

  // Fetch subscription data
  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/subscriptions");
      if (res.ok) {
        const body = (await res.json()) as { data?: SubscriptionData };
        setSubscription(body.data ?? null);
      } else {
        setSubscription(null);
      }
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await fetch("/api/subscriptions/invoices");
      if (res.ok) {
        const body = (await res.json()) as { data?: Invoice[] };
        setInvoices(body.data ?? []);
      }
    } catch {
      // Invoices are supplementary
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  useEffect(() => {
    if (
      subscription &&
      (subscription.status === "active" || subscription.status === "past_due")
    ) {
      fetchInvoices();
    }
  }, [subscription, fetchInvoices]);

  // Handlers
  function handleSelectPlan(planSlug: string) {
    setSelectedPlanSlug(planSlug);
    setCardFormMode("subscribe");
    setShowCardForm(true);
    setShowPlanSelector(false);
  }

  function handleUpdateCard() {
    setCardFormMode("update-card");
    setShowCardForm(true);
  }

  function handleCardFormSuccess() {
    setShowCardForm(false);
    setSelectedPlanSlug("");
    fetchSubscription();
    fetchInvoices();
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch("/api/subscriptions/cancel", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to cancel");
      }
      toast.success(t("actions.cancel"));
      setShowCancelDialog(false);
      await fetchSubscription();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Determine display state
  const status = subscription?.status ?? "expired";
  const plan = subscription?.plans ?? null;
  const isTrialingWithoutPlan = status === "trialing" && !plan;
  const showPlanSelectorDirectly =
    isTrialingWithoutPlan || status === "expired";

  // Card form plan info
  const cardPlanName = plan?.name ?? "";
  const cardPlanPrice = plan ? formatPrice(plan.price_cents) : "";

  return (
    <div className="space-y-8">
      {/* Title */}
      <h2
        className="text-lg font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {t("title")}
      </h2>

      {/* State: Trialing without plan or Expired -> show PlanSelector directly */}
      {showPlanSelectorDirectly && (
        <div className="space-y-4">
          {isTrialingWithoutPlan && subscription?.trial_ends_at && (
            <div
              className="flex items-center gap-3 rounded-xl border-l-4 px-4 py-3"
              style={{
                backgroundColor: "var(--surface)",
                borderLeftColor: "var(--info)",
                borderColor: "var(--border)",
              }}
            >
              <Clock
                className="size-5 shrink-0"
                style={{ color: "var(--info)" }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("trial.banner", {
                  days: computeTrialDaysLeft(subscription.trial_ends_at),
                })}
              </p>
            </div>
          )}

          {status === "expired" && (
            <div
              className="flex items-center gap-3 rounded-xl border-l-4 px-4 py-3"
              style={{
                backgroundColor: "var(--surface)",
                borderLeftColor: "var(--error)",
                borderColor: "var(--border)",
              }}
            >
              <XCircle
                className="size-5 shrink-0"
                style={{ color: "var(--error)" }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("trial.expired")}
              </p>
            </div>
          )}

          <PlanSelector onSelectPlan={handleSelectPlan} />
        </div>
      )}

      {/* State: Active or Past Due -> show current plan card */}
      {(status === "active" || status === "past_due") && plan && (
        <>
          {/* Current Plan Card */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Crown
                  className="size-6 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <div>
                  <h3
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {plan.name}
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatPrice(plan.price_cents)}
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("plans.month")}
                    </span>
                  </p>
                </div>
              </div>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{
                  backgroundColor:
                    status === "active" ? "var(--success)" : "var(--warning)",
                }}
              >
                {status === "active"
                  ? t("active.label")
                  : t("pastDue.banner", { amount: formatCents(plan.price_cents) })}
              </span>
            </div>

            {/* Period dates */}
            {subscription && (
              <div className="mt-4 flex gap-6">
                <div>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("periodStart")}
                  </p>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatDate(subscription.current_period_start)}
                  </p>
                </div>
                <div>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("nextBilling")}
                  </p>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatDate(subscription.current_period_end)}
                  </p>
                </div>
              </div>
            )}

            {/* Usage bars */}
            {subscription && (
              <div className="mt-4 flex gap-6">
                {plan.max_professionals !== null && (
                  <UsageBar
                    label={t("usage.professionals", {
                      current: subscription.usage.professionals,
                      limit: plan.max_professionals,
                    })}
                    percent={usagePercent(
                      subscription.usage.professionals,
                      plan.max_professionals
                    )}
                  />
                )}
                {plan.max_messages_month !== null && (
                  <UsageBar
                    label={t("usage.messages", {
                      current: subscription.usage.messages_used_month,
                      limit: plan.max_messages_month,
                    })}
                    percent={usagePercent(
                      subscription.usage.messages_used_month,
                      plan.max_messages_month
                    )}
                  />
                )}
                {plan.max_professionals === null &&
                  plan.max_messages_month === null && (
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("usage.unlimited")}
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Actions Row */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPlanSelector(true)}
            >
              <ArrowRightLeft className="size-4" />
              {t("actions.upgrade")}
            </Button>
            <Button variant="outline" onClick={handleUpdateCard}>
              <CreditCard className="size-4" />
              {t("actions.updateCard")}
            </Button>
            <Button
              variant="danger"
              onClick={() => setShowCancelDialog(true)}
            >
              <XCircle className="size-4" />
              {t("actions.cancel")}
            </Button>
          </div>

          {/* Plan Selector (toggled) */}
          {showPlanSelector && (
            <PlanSelector
              currentPlanSlug={plan.slug}
              onSelectPlan={handleSelectPlan}
            />
          )}
        </>
      )}

      {/* State: Cancelled -> show plan info + access until + PlanSelector */}
      {status === "cancelled" && (
        <div className="space-y-6">
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <XCircle
                  className="size-6 shrink-0"
                  style={{ color: "var(--error)" }}
                />
                <div>
                  <h3
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {plan?.name ?? "\u2014"}
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("cancelled.label")}
                  </p>
                </div>
              </div>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: "rgba(239,68,68,0.1)",
                  color: "var(--error)",
                }}
              >
                {t("cancelled.label")}
              </span>
            </div>

            {subscription?.current_period_end && (
              <p
                className="mt-3 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {t("cancelled.accessUntil", {
                  date: formatDate(subscription.current_period_end),
                })}
              </p>
            )}
          </div>

          <PlanSelector onSelectPlan={handleSelectPlan} />
        </div>
      )}

      {/* Invoice History */}
      {(status === "active" || status === "past_due") && (
        <div>
          <h3
            className="mb-4 text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {t("invoices.title")}
          </h3>

          {invoicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : invoices.length === 0 ? (
            <div
              className="rounded-xl border p-6 text-center"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {"\u2014"}
              </p>
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-xl border"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <table className="w-full">
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      backgroundColor: "var(--surface)",
                    }}
                  >
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("invoices.date")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("invoices.amount")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("invoices.status")}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("invoices.receipt")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const invoiceStatus = mapInvoiceStatus(invoice.status);
                    const statusLabel = t(`invoices.${invoiceStatus}`);

                    return (
                      <tr
                        key={invoice.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <td
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {formatDate(
                            invoice.paymentDate ?? invoice.dueDate
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {formatCents(invoice.value)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={invoiceStatus}
                            label={statusLabel}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {invoice.invoiceUrl ? (
                            <a
                              href={invoice.invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm transition-colors hover:opacity-80"
                              style={{ color: "var(--accent)" }}
                            >
                              <ExternalLink className="size-3.5" />
                              {t("invoices.receipt")}
                            </a>
                          ) : (
                            <span
                              className="text-sm"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {"\u2014"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Credit Card Form Dialog */}
      <CreditCardForm
        open={showCardForm}
        onOpenChange={setShowCardForm}
        planName={cardPlanName}
        planPrice={cardPlanPrice}
        mode={cardFormMode}
        planSlug={selectedPlanSlug || undefined}
        onSuccess={handleCardFormSuccess}
      />

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title={t("actions.cancel")}
      >
        <p
          className="mb-6 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("actions.confirmCancel")}
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setShowCancelDialog(false)}
            disabled={cancelling}
          >
            {t("actions.cancelDismiss")}
          </Button>
          <Button
            variant="danger"
            onClick={handleCancel}
            loading={cancelling}
          >
            {t("actions.cancelConfirm")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
