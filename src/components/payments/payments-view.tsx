"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Ban,
  CircleCheck,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { InvoiceStatusBadge } from "@/components/payments/invoice-status-badge";
import { PaymentMethodIcon } from "@/components/payments/payment-method-icon";
import { CreateInvoiceDialog } from "@/components/payments/create-invoice-dialog";
import { InvoiceDetailPanel } from "@/components/payments/invoice-detail-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { InvoiceRow } from "@/components/payments/invoice-detail-panel";
import { toast } from "sonner";
import {
  formatCents,
  calculateRevenueMetrics,
  type InvoiceForMetrics,
} from "@/lib/analytics/kpis";

interface PaymentsViewProps {
  initialInvoices: InvoiceRow[];
  initialCount: number;
  initialKpiInvoices: InvoiceForMetrics[];
}

const PER_PAGE = 25;

function formatPhone(digits: string): string {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export function PaymentsView({
  initialInvoices,
  initialCount,
  initialKpiInvoices,
}: PaymentsViewProps) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [count, setCount] = useState(initialCount);
  const [kpiInvoices, setKpiInvoices] = useState<InvoiceForMetrics[]>(initialKpiInvoices);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    invoice: InvoiceRow;
    type: "markPaid" | "cancel";
  } | null>(null);

  const totalPages = Math.ceil(count / PER_PAGE);
  const metrics = calculateRevenueMetrics(kpiInvoices);

  const fetchInvoices = useCallback(
    async (p: number, q: string, status: string, period: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (q.trim().length >= 2) params.set("search", q.trim());
        if (status !== "all") params.set("status", status);
        if (period !== "all") params.set("period", period);

        const res = await fetch(`/api/invoices?${params}`);
        if (res.ok) {
          const json = await res.json();
          setInvoices(json.data ?? []);
          setCount(json.count ?? 0);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices?kpi=true");
      if (res.ok) {
        const json = await res.json();
        setKpiInvoices(json.data ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Debounced search — resets to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchInvoices(1, search, statusFilter, periodFilter);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Filter changes — reset to page 1
  useEffect(() => {
    setPage(1);
    fetchInvoices(1, search, statusFilter, periodFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, periodFilter]);

  // Page change
  useEffect(() => {
    if (page > 1) {
      fetchInvoices(page, search, statusFilter, periodFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleCreateSuccess() {
    setCreateOpen(false);
    fetchInvoices(1, search, statusFilter, periodFilter);
    fetchKpis();
    setPage(1);
  }

  function handleDetailUpdate() {
    fetchInvoices(page, search, statusFilter, periodFilter);
    fetchKpis();
    if (selectedInvoice) {
      fetch(`/api/invoices/${selectedInvoice.id}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.data) setSelectedInvoice(json.data);
        })
        .catch(() => {});
    }
  }

  function handleQuickMarkPaid(inv: InvoiceRow) {
    setConfirmAction({ invoice: inv, type: "markPaid" });
    setConfirmOpen(true);
    setOpenMenuId(null);
    setMenuPos(null);
  }

  function handleQuickCancel(inv: InvoiceRow) {
    setConfirmAction({ invoice: inv, type: "cancel" });
    setConfirmOpen(true);
    setOpenMenuId(null);
    setMenuPos(null);
  }

  async function executeConfirmAction() {
    if (!confirmAction) return;
    const { invoice: inv, type } = confirmAction;
    const newStatus = type === "markPaid" ? "paid" : "cancelled";
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchInvoices(page, search, statusFilter, periodFilter);
        fetchKpis();
      }
    } catch {
      toast.error(t("errors.updateError"));
    }
  }

  const overdueCents = kpiInvoices
    .filter((inv) => inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount_cents, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Clock}
          label={t("kpiPending")}
          value={formatCents(metrics.pendingCents)}
          iconBg="rgba(139,92,246,0.1)"
          iconColor="var(--accent)"
        />
        <KpiCard
          icon={AlertTriangle}
          label={t("kpiOverdue")}
          value={formatCents(overdueCents)}
          subtitle={t("kpiOverdueCount", { count: metrics.overdueCount })}
          iconBg="rgba(239,68,68,0.1)"
          iconColor="var(--danger)"
        />
        <KpiCard
          icon={CheckCircle}
          label={t("kpiPaid")}
          value={formatCents(metrics.paidCents)}
          subtitle={t("kpiThisMonth")}
          iconBg="rgba(34,197,94,0.1)"
          iconColor="var(--success)"
        />
        <KpiCard
          icon={TrendingUp}
          label={t("kpiConversion")}
          value={`${metrics.conversionRate}%`}
          iconBg="rgba(139,92,246,0.1)"
          iconColor="var(--accent)"
        />
      </div>

      {/* Table card or empty state */}
      {count === 0 && search.trim().length < 2 && statusFilter === "all" && periodFilter === "all" ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Receipt className="size-12" strokeWidth={1} style={{ color: "var(--text-muted)" }} />
          <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            {t("empty")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("emptyHint")}
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
      ) : (
        <div
          className="rounded-xl border"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {/* Header: search + filters + actions */}
          <div
            className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-1 flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-full max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="all">{t("filterAll")}</option>
                <option value="pending">{t("filterPending")}</option>
                <option value="overdue">{t("filterOverdue")}</option>
                <option value="paid">{t("filterPaid")}</option>
                <option value="cancelled">{t("filterCancelled")}</option>
              </select>

              {/* Period filter */}
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="all">{t("periodAll")}</option>
                <option value="this-month">{t("periodThisMonth")}</option>
                <option value="30d">{t("periodLast30")}</option>
                <option value="90d">{t("periodLast90")}</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <p className="text-sm whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {t("count", { count })}
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {t("add")}
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className={`relative ${loading ? "opacity-50" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("patient")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("amount")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("dueDate")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("status")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("method")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isOverdue =
                      inv.status !== "paid" &&
                      inv.status !== "cancelled" &&
                      new Date(inv.due_date) < new Date();
                    const latestLink = inv.payment_links.length > 0
                      ? inv.payment_links[inv.payment_links.length - 1]
                      : null;

                    return (
                      <tr
                        key={inv.id}
                        className="cursor-pointer border-b transition-colors hover:bg-[var(--nav-hover-bg)]"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => setSelectedInvoice(inv)}
                      >
                        <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                          <div className="font-medium">{inv.patients.name}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatPhone(inv.patients.phone)}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                          {formatCents(inv.amount_cents)}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: isOverdue ? "var(--danger)" : "var(--text-secondary)" }}
                        >
                          {new Date(inv.due_date + "T12:00:00").toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3">
                          {latestLink ? (
                            <PaymentMethodIcon method={latestLink.method} />
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            ref={openMenuId === inv.id ? menuBtnRef : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openMenuId === inv.id) {
                                setOpenMenuId(null);
                                setMenuPos(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMenuPos({ top: rect.bottom + 4, left: rect.right - 192 });
                                setOpenMenuId(inv.id);
                              }
                            }}
                            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* No results */}
            {invoices.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t("noResults")}
                </p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between border-t px-5 py-4"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t("page", { page, total: totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("nextPage")}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions dropdown — rendered at root with fixed positioning to escape overflow */}
      {openMenuId && menuPos && (() => {
        const inv = invoices.find((i) => i.id === openMenuId);
        if (!inv) return null;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpenMenuId(null); setMenuPos(null); }} />
            <div
              className="fixed z-50 w-48 rounded-lg border py-1"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <button
                type="button"
                onClick={() => { setSelectedInvoice(inv); setOpenMenuId(null); setMenuPos(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                style={{ color: "var(--text-primary)" }}
              >
                <Eye className="size-4" />
                {t("view")}
              </button>
              {(inv.status === "pending" || inv.status === "overdue") && (
                <>
                  <button
                    type="button"
                    onClick={() => handleQuickMarkPaid(inv)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                    style={{ color: "var(--success)" }}
                  >
                    <CircleCheck className="size-4" />
                    {t("markPaid")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickCancel(inv)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                    style={{ color: "var(--danger)" }}
                  >
                    <Ban className="size-4" />
                    {t("cancelInvoice")}
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* Create dialog */}
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />

      {/* Detail panel */}
      <InvoiceDetailPanel
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onUpdate={handleDetailUpdate}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmAction?.type === "markPaid" ? t("markPaid") : t("cancelInvoice")}
        description={confirmAction?.type === "markPaid" ? t("markPaidConfirm") : t("cancelConfirm")}
        confirmLabel={confirmAction?.type === "markPaid" ? t("markPaid") : t("cancelInvoice")}
        cancelLabel={tc("cancel")}
        variant={confirmAction?.type === "markPaid" ? "primary" : "danger"}
        onConfirm={executeConfirmAction}
      />
    </div>
  );
}
