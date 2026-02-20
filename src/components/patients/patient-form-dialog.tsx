"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createPatientSchema } from "@/lib/validations/patients";
import type { CustomFieldDefinition } from "@/types";

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
    custom_fields?: Record<string, string>;
  };
  customFields?: CustomFieldDefinition[];
  onSuccess: () => void;
  onCustomFieldCreated?: (field: CustomFieldDefinition) => void;
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
  customFields,
  onSuccess,
  onCustomFieldCreated,
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
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Inline custom field creation
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "select">("text");
  const [creatingField, setCreatingField] = useState(false);

  useEffect(() => {
    if (open) {
      setName(patient?.name ?? "");
      setPhone(patient?.phone ? formatPhone(patient.phone) : "");
      setEmail(patient?.email ?? "");
      setDateOfBirth(patient?.date_of_birth ?? "");
      setCpf(patient?.cpf ? formatCpf(patient.cpf) : "");
      setNotes(patient?.notes ?? "");
      setCustomValues(patient?.custom_fields ?? {});
      setSaving(false);
      setFieldErrors({});
      setAddingField(false);
      setNewFieldName("");
      setNewFieldType("text");
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

  function handleCustomFieldChange(fieldId: string, value: string) {
    setCustomValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleCreateField() {
    if (!newFieldName.trim()) return;
    setCreatingField(true);
    try {
      const res = await fetch("/api/settings/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFieldName.trim(),
          type: newFieldType,
          options: [],
          required: false,
          display_order: customFields?.length ?? 0,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        onCustomFieldCreated?.(json.data);
        setAddingField(false);
        setNewFieldName("");
        setNewFieldType("text");
        toast.success(t("fieldCreated"));
      } else if (res.status === 409) {
        toast.error(t("fieldNameExists"));
      } else {
        toast.error(t("saveError"));
      }
    } catch {
      toast.error(t("saveError"));
    } finally {
      setCreatingField(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    // Validate required custom fields
    const errors: Record<string, string> = {};
    if (customFields) {
      for (const field of customFields) {
        if (field.required && !customValues[field.id]?.trim()) {
          errors[`cf_${field.id}`] = t("detail.noValue");
        }
      }
    }

    const data = {
      name,
      phone: phone.replace(/\D/g, ""),
      email: email || "",
      date_of_birth: dateOfBirth || "",
      cpf: cpf.replace(/\D/g, "") || "",
      notes: notes || "",
      custom_fields: customValues,
    };

    const parsed = createPatientSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      for (const [field, messages] of Object.entries(flat.fieldErrors)) {
        if (messages && messages.length > 0) {
          errors[field] = messages[0];
        }
      }
    }

    if (Object.keys(errors).length > 0) {
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
        body: JSON.stringify(parsed!.data),
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

  const sortedCustomFields = customFields
    ? [...customFields].sort((a, b) => a.display_order - b.display_order)
    : [];

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

        {/* Custom fields */}
        {sortedCustomFields.length > 0 && (
          <div
            className="space-y-4 border-t pt-4"
            style={{ borderColor: "var(--border)" }}
          >
            {sortedCustomFields.map((field) => (
              <div key={field.id}>
                {field.type === "text" ? (
                  <Input
                    id={`cf_${field.id}`}
                    label={`${field.name}${field.required ? " *" : ""}`}
                    value={customValues[field.id] ?? ""}
                    onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                    error={fieldErrors[`cf_${field.id}`]}
                  />
                ) : (
                  <div>
                    <label
                      htmlFor={`cf_${field.id}`}
                      className="block text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {field.name}{field.required ? " *" : ""}
                    </label>
                    <select
                      id={`cf_${field.id}`}
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                      style={{
                        backgroundColor: "var(--surface)",
                        borderColor: fieldErrors[`cf_${field.id}`] ? "var(--danger)" : "var(--border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="">—</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {fieldErrors[`cf_${field.id}`] && (
                      <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                        {fieldErrors[`cf_${field.id}`]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inline custom field creation */}
        <div
          className="border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          {addingField ? (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    id="newFieldName"
                    label={t("fieldName")}
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder={t("fieldNamePlaceholder")}
                  />
                </div>
                <div className="w-32">
                  <label
                    htmlFor="newFieldType"
                    className="block text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t("fieldType")}
                  </label>
                  <select
                    id="newFieldType"
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as "text" | "select")}
                    className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="text">{t("fieldTypeText")}</option>
                    <option value="select">{t("fieldTypeSelect")}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateField}
                  loading={creatingField}
                  disabled={!newFieldName.trim()}
                >
                  {t("createField")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingField(false)}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingField(true)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
              style={{ color: "var(--accent)" }}
            >
              <Plus className="size-4" />
              {t("addCustomField")}
            </button>
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
          <Button type="submit" loading={saving}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
