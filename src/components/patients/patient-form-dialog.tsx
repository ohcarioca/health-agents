"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createPatientSchema } from "@/lib/validations/patients";

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    date_of_birth: string | null;
    notes: string | null;
  };
  onSuccess: () => void;
}

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function formatCpf(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  onSuccess,
}: PatientFormDialogProps) {
  const t = useTranslations("patients");
  const tc = useTranslations("common");
  const isEditing = !!patient;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [cpf, setCpf] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(patient?.name ?? "");
      setPhone(patient?.phone ? formatPhone(patient.phone) : "");
      setEmail(patient?.email ?? "");
      setDateOfBirth(patient?.date_of_birth ?? "");
      setCpf(patient?.cpf ? formatCpf(patient.cpf) : "");
      setNotes(patient?.notes ?? "");
      setSaving(false);
      setFieldErrors({});
    }
  }, [open, patient]);

  function handlePhoneBlur() {
    const digits = phone.replace(/\D/g, "");
    setPhone(formatPhone(digits));
  }

  function handleCpfBlur() {
    const digits = cpf.replace(/\D/g, "");
    setCpf(formatCpf(digits));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const data = {
      name,
      phone: phone.replace(/\D/g, ""),
      email: email || "",
      date_of_birth: dateOfBirth || "",
      cpf: cpf.replace(/\D/g, "") || "",
      notes: notes || "",
    };

    const parsed = createPatientSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const errors: Record<string, string> = {};
      for (const [field, messages] of Object.entries(flat.fieldErrors)) {
        if (messages && messages.length > 0) {
          errors[field] = messages[0];
        }
      }
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const url = isEditing
        ? `/api/patients/${patient.id}`
        : "/api/patients";

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        if (res.status === 409 && json.error === "duplicate_phone") {
          setFieldErrors({ phone: t("duplicatePhone") });
          return;
        }
        setFieldErrors({ _form: json.error ?? t("saveError") });
        return;
      }

      toast.success(tc("success"));
      onSuccess();
    } catch {
      setFieldErrors({ _form: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t("edit") : t("add")}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="patientName"
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          error={fieldErrors.name}
        />

        <Input
          id="patientPhone"
          label={t("phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={handlePhoneBlur}
          required
          error={fieldErrors.phone}
          placeholder="(11) 99999-9999"
        />

        <Input
          id="patientEmail"
          label={t("email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />

        <Input
          id="patientDateOfBirth"
          label={t("dateOfBirth")}
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          error={fieldErrors.date_of_birth}
        />

        <Input
          id="patientCpf"
          label={t("cpf")}
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          onBlur={handleCpfBlur}
          error={fieldErrors.cpf}
          placeholder="000.000.000-00"
        />

        <div>
          <label
            htmlFor="patientNotes"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("notes")}
          </label>
          <textarea
            id="patientNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: fieldErrors.notes ? "var(--danger)" : "var(--border)",
              color: "var(--text-primary)",
              resize: "vertical",
            }}
          />
          {fieldErrors.notes && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
              {fieldErrors.notes}
            </p>
          )}
        </div>

        {fieldErrors._form && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {fieldErrors._form}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? tc("loading") : tc("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
