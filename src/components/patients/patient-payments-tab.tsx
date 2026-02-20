"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface InvoiceRow {
  id: string;
  status: string;
  amount_cents: number;
  due_date: string;
  paid_at: string | null;
  created_at: string;
}

interface PatientPaymentsTabProps {
  patientId: string;
  locale: string;
}

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(245,158,11,0.1)", color: "var(--warning, #f59e0b)", label: "Pendente" },
  overdue: { bg: "rgba(239,68,68,0.1)", color: "var(--danger)", label: "Vencido" },
  paid: { bg: "rgba(34,197,94,0.1)", color: "var(--success, #22c55e)", label: "Pago" },
  cancelled: { bg: "var(--surface-elevated)", color: "var(--text-muted)", label: "Cancelado" },
};

export function PatientPaymentsTab({ patientId, locale }: PatientPaymentsTabProps) {
  const t = useTranslations("patients.detail");

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/patients/${patientId}/invoices`);
        if (res.ok) {
          const json = await res.json();
          setInvoices(json.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <CreditCard className="size-8" strokeWidth={1} style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("noPayments")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const statusInfo = STATUS_STYLES[inv.status] ?? STATUS_STYLES.pending;

        return (
          <div
            key={inv.id}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatCents(inv.amount_cents)}
                </p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: statusInfo.bg,
                    color: statusInfo.color,
                  }}
                >
                  {statusInfo.label}
                </span>
              </div>
              <div className="flex gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>
                  {t("dueDate")}: {new Date(inv.due_date + "T12:00:00").toLocaleDateString(locale)}
                </span>
                {inv.paid_at && (
                  <span>
                    Pago: {new Date(inv.paid_at).toLocaleDateString(locale)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
