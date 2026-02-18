"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PatientOption {
  id: string;
  name: string;
  phone: string;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateInvoiceDialog({ open, onOpenChange, onSuccess }: CreateInvoiceDialogProps) {
  const t = useTranslations("payments.form");
  const tc = useTranslations("common");

  const [patientSearch, setPatientSearch] = useState("");
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchPatients = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setPatientOptions([]);
      return;
    }
    try {
      const res = await fetch(`/api/calendar/patients/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const json = await res.json();
        setPatientOptions(json.data ?? []);
        setShowDropdown(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchPatients(patientSearch), 300);
    return () => clearTimeout(timer);
  }, [patientSearch, searchPatients]);

  useEffect(() => {
    if (open) {
      setPatientSearch("");
      setSelectedPatient(null);
      setPatientOptions([]);
      setAmount("");
      setDueDate("");
      setNotes("");
      setError("");
    }
  }, [open]);

  function selectPatient(p: PatientOption) {
    setSelectedPatient(p);
    setPatientSearch(p.name);
    setShowDropdown(false);
  }

  function parseCentsFromInput(value: string): number {
    const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return 0;
    return Math.round(num * 100);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;

    const amountCents = parseCentsFromInput(amount);
    if (amountCents <= 0) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          amount_cents: amountCents,
          due_date: dueDate,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("error"));
        return;
      }

      onSuccess();
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("title")} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient search */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("patient")}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                setSelectedPatient(null);
              }}
              placeholder={t("patientPlaceholder")}
              className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
            {showDropdown && patientOptions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {patientOptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPatient(p)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>{p.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("amount")}
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("amountPlaceholder")}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Due date */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("dueDate")}
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!selectedPatient || !amount || !dueDate || submitting}
          >
            {submitting ? t("creating") : t("submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
