"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { PhoneInputField } from "@/components/ui/phone-input-field";
import { CLINIC_TYPES } from "@/lib/onboarding/clinic-templates";

interface StepClinicProps {
  clinicName: string;
  onClinicNameChange: (value: string) => void;
  assistantName: string;
  onAssistantNameChange: (value: string) => void;
  clinicType: string;
  onClinicTypeChange: (value: string) => void;
  clinicDescription: string;
  onClinicDescriptionChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  address: string;
  onAddressChange: (value: string) => void;
}

export function StepClinic({
  clinicName,
  onClinicNameChange,
  assistantName,
  onAssistantNameChange,
  clinicType,
  onClinicTypeChange,
  clinicDescription,
  onClinicDescriptionChange,
  phone,
  onPhoneChange,
  address,
  onAddressChange,
}: StepClinicProps) {
  const t = useTranslations("onboarding");

  function handleTypeChange(value: string) {
    onClinicTypeChange(value);
    const found = CLINIC_TYPES.find((ct) => ct.value === value);
    if (found && found.description) {
      onClinicDescriptionChange(found.description);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step1.description")}
      </p>

      <Input
        id="clinicName"
        label={t("step1.clinicName")}
        value={clinicName}
        onChange={(e) => onClinicNameChange(e.target.value)}
        required
      />

      <div>
        <Input
          id="assistantName"
          label={t("step1.assistantName")}
          placeholder={t("step1.assistantNamePlaceholder")}
          value={assistantName}
          onChange={(e) => onAssistantNameChange(e.target.value)}
        />
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {t("step1.assistantNameHelp")}
        </p>
      </div>

      <div>
        <label
          htmlFor="clinicType"
          className="mb-1.5 block text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("step1.clinicType")}
        </label>
        <select
          id="clinicType"
          value={clinicType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:outline-[var(--accent-ring)]"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: clinicType ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          <option value="">{t("step1.clinicTypePlaceholder")}</option>
          {CLINIC_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="clinicDescription"
          className="mb-1.5 block text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("step1.clinicDescription")}
        </label>
        <textarea
          id="clinicDescription"
          value={clinicDescription}
          onChange={(e) => onClinicDescriptionChange(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:outline-[var(--accent-ring)]"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <PhoneInputField
        label={t("step1.phone")}
        value={phone}
        onChange={onPhoneChange}
      />

      <Input
        id="address"
        label={t("step1.address")}
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
      />
    </div>
  );
}
