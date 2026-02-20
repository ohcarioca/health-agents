"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CustomFieldDefinition } from "@/types";

interface PatientInfoTabProps {
  patient: {
    name: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    date_of_birth: string | null;
    notes: string | null;
    custom_fields: Record<string, string>;
    created_at: string;
  };
  customFieldDefs: CustomFieldDefinition[];
  locale: string;
  onEdit: () => void;
}

function formatPhone(digits: string): string {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function maskCpf(cpf: string): string {
  if (cpf.length === 11)
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  return cpf;
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  const t = useTranslations("patients.detail");
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span
        className="shrink-0 text-sm font-medium sm:w-40"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
        {value || t("noValue")}
      </span>
    </div>
  );
}

export function PatientInfoTab({
  patient,
  customFieldDefs,
  locale,
  onEdit,
}: PatientInfoTabProps) {
  const t = useTranslations("patients");
  const td = useTranslations("patients.detail");

  const sortedCustomFields = [...customFieldDefs].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="space-y-3">
      <InfoRow label={t("name")} value={patient.name} />
      <InfoRow label={t("phone")} value={formatPhone(patient.phone)} />
      <InfoRow label={t("email")} value={patient.email} />
      <InfoRow
        label={t("dateOfBirth")}
        value={
          patient.date_of_birth
            ? new Date(patient.date_of_birth + "T12:00:00").toLocaleDateString(locale)
            : null
        }
      />
      <InfoRow
        label={t("cpf")}
        value={patient.cpf ? maskCpf(patient.cpf) : null}
      />
      <InfoRow label={t("notes")} value={patient.notes} />

      {/* Custom fields */}
      {sortedCustomFields.length > 0 && (
        <div
          className="space-y-3 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          {sortedCustomFields.map((field) => (
            <InfoRow
              key={field.id}
              label={field.name}
              value={patient.custom_fields?.[field.id] || null}
            />
          ))}
        </div>
      )}

      <div
        className="border-t pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        <InfoRow
          label={td("registered")}
          value={new Date(patient.created_at).toLocaleDateString(locale)}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-4" />
          {td("editButton")}
        </Button>
      </div>
    </div>
  );
}
