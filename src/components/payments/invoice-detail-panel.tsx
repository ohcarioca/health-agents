"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  X,
  Copy,
  Check,
  QrCode,
  FileText,
  CreditCard,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { PaymentMethodIcon } from "./payment-method-icon";
import { formatCents } from "@/lib/analytics/kpis";

interface PaymentLink {
  id: string;
  method: string;
  status: string;
  url: string;
  invoice_url: string | null;
  pix_payload: string | null;
  boleto_identification_field: string | null;
  created_at: string;
}

interface InvoicePatient {
  id: string;
  name: string;
  phone: string;
  cpf: string | null;
  email: string | null;
  asaas_customer_id: string | null;
}

export interface InvoiceRow {
  id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  patients: InvoicePatient;
  payment_links: PaymentLink[];
}

interface InvoiceDetailPanelProps {
  invoice: InvoiceRow | null;
  onClose: () => void;
  onUpdate: () => void;
}

function formatPhone(digits: string): string {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

const METHOD_LABEL_KEY: Record<string, string> = {
  pix: "methodPix",
  boleto: "methodBoleto",
  credit_card: "methodCard",
  link: "methodPix",
};

const LINK_STATUS_VARIANT: Record<string, "success" | "warning" | "neutral"> = {
  active: "warning",
  paid: "success",
  expired: "neutral",
};

export function InvoiceDetailPanel({ invoice, onClose, onUpdate }: InvoiceDetailPanelProps) {
  const t = useTranslations("payments");
  const td = useTranslations("payments.detail");
  const locale = useLocale();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatingMethod, setGeneratingMethod] = useState<string | null>(null);

  if (!invoice) return null;

  const patient = invoice.patients;
  const isOverdue = invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.due_date) < new Date();

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function generatePaymentLink(method: "pix" | "boleto" | "credit_card") {
    setGeneratingMethod(method);
    try {
      const res = await fetch(`/api/invoices/${invoice!.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });

      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? t("errors.linkError"));
        return;
      }

      onUpdate();
    } catch {
      alert(t("errors.linkError"));
    } finally {
      setGeneratingMethod(null);
    }
  }

  async function handleMarkPaid() {
    if (!window.confirm(t("markPaidConfirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${invoice!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (res.ok) onUpdate();
      else alert(t("errors.updateError"));
    } catch {
      alert(t("errors.updateError"));
    }
  }

  async function handleCancel() {
    if (!window.confirm(t("cancelConfirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${invoice!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) onUpdate();
      else alert(t("errors.updateError"));
    } catch {
      alert(t("errors.updateError"));
    }
  }

  const canGenerateLinks = invoice.status === "pending" || invoice.status === "overdue";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {td("title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--nav-hover-bg)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("patient")}</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{patient.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("phone")}</span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{formatPhone(patient.phone)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("amount")}</span>
              <span className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {formatCents(invoice.amount_cents)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("dueDate")}</span>
              <span
                className="text-sm font-medium"
                style={{ color: isOverdue ? "var(--danger)" : "var(--text-primary)" }}
              >
                {new Date(invoice.due_date + "T12:00:00").toLocaleDateString(locale)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("status")}</span>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            {invoice.notes && (
              <div>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("notes")}</span>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{invoice.notes}</p>
              </div>
            )}
          </div>

          <div className="border-t" style={{ borderColor: "var(--border)" }} />

          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {td("paymentLinks")}
            </h3>
            {invoice.payment_links.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{td("noLinks")}</p>
            ) : (
              <div className="space-y-2">
                {invoice.payment_links.map((link) => {
                  const methodLabel = t(METHOD_LABEL_KEY[link.method] ?? "methodPix");
                  const statusKey = `link${link.status.charAt(0).toUpperCase() + link.status.slice(1)}` as "linkActive" | "linkPaid" | "linkExpired";
                  return (
                    <div
                      key={link.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-2">
                        <PaymentMethodIcon method={link.method} />
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{methodLabel}</span>
                        <Badge variant={LINK_STATUS_VARIANT[link.status] ?? "neutral"}>
                          {td(statusKey)}
                        </Badge>
                      </div>
                      {(link.invoice_url || link.url) && (
                        <button
                          onClick={() => copyToClipboard(link.invoice_url || link.url, link.id)}
                          className="rounded p-1 transition-colors hover:bg-[var(--nav-hover-bg)]"
                          style={{ color: "var(--text-muted)" }}
                          title={td("copyLink")}
                        >
                          {copiedId === link.id ? (
                            <Check className="size-4" style={{ color: "var(--success)" }} />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canGenerateLinks && (
            <>
              <div className="border-t" style={{ borderColor: "var(--border)" }} />
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => generatePaymentLink("pix")} disabled={generatingMethod !== null}>
                  {generatingMethod === "pix" ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" style={{ color: "var(--success)" }} />}
                  {td("generatePix")}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => generatePaymentLink("boleto")} disabled={generatingMethod !== null}>
                  {generatingMethod === "boleto" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" style={{ color: "var(--warning)" }} />}
                  {td("generateBoleto")}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => generatePaymentLink("credit_card")} disabled={generatingMethod !== null}>
                  {generatingMethod === "credit_card" ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" style={{ color: "var(--accent)" }} />}
                  {td("generateCard")}
                </Button>

                <div className="border-t pt-2" style={{ borderColor: "var(--border)" }} />
                <Button variant="primary" size="sm" className="w-full" onClick={handleMarkPaid}>
                  {t("markPaid")}
                </Button>
                <Button variant="danger" size="sm" className="w-full" onClick={handleCancel}>
                  {t("cancelInvoice")}
                </Button>
              </div>
            </>
          )}

          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }} />
          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {td("timeline")}
            </h3>
            <div className="space-y-2">
              {invoice.paid_at && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="size-2 rounded-full" style={{ backgroundColor: "var(--success)" }} />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {td("paidAt")} — {new Date(invoice.paid_at).toLocaleDateString(locale)}
                  </span>
                </div>
              )}
              {invoice.payment_links.map((link) => {
                const label = t(METHOD_LABEL_KEY[link.method] ?? "methodPix");
                return (
                  <div key={link.id} className="flex items-center gap-2 text-sm">
                    <div className="size-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                    <span style={{ color: "var(--text-secondary)" }}>
                      {label} — {new Date(link.created_at).toLocaleDateString(locale)}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 text-sm">
                <div className="size-2 rounded-full" style={{ backgroundColor: "var(--text-muted)" }} />
                <span style={{ color: "var(--text-secondary)" }}>
                  {td("createdAt")} — {new Date(invoice.created_at).toLocaleDateString(locale)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
