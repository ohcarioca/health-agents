"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { SERVICE_TEMPLATES } from "@/lib/onboarding/clinic-templates";
import { Plus, X } from "lucide-react";

export interface ServiceItem {
  name: string;
  duration_minutes: number;
  price: string;
}

interface StepProfessionalProps {
  profName: string;
  onProfNameChange: (value: string) => void;
  specialty: string;
  onSpecialtyChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  clinicType: string;
  services: ServiceItem[];
  onServicesChange: (services: ServiceItem[]) => void;
}

export function StepProfessional({
  profName,
  onProfNameChange,
  specialty,
  onSpecialtyChange,
  duration,
  onDurationChange,
  clinicType,
  services,
  onServicesChange,
}: StepProfessionalProps) {
  const t = useTranslations("onboarding");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState("");

  const templates = SERVICE_TEMPLATES[clinicType] ?? [];

  function handleSelectTemplate(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (!value) return;

    if (value === "__custom__") {
      setShowCustomInput(true);
      e.target.value = "";
      return;
    }

    const tmpl = templates.find((t) => t.name === value);
    if (tmpl) {
      onServicesChange([
        ...services,
        { name: tmpl.name, duration_minutes: tmpl.duration_minutes, price: "" },
      ]);
    }
    e.target.value = "";
  }

  function addCustomService() {
    if (customName.trim().length < 2) return;
    onServicesChange([
      ...services,
      { name: customName.trim(), duration_minutes: 30, price: "" },
    ]);
    setCustomName("");
    setShowCustomInput(false);
  }

  function removeService(index: number) {
    onServicesChange(services.filter((_, i) => i !== index));
  }

  function updateService(index: number, field: keyof ServiceItem, value: string | number) {
    const updated = services.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    onServicesChange(updated);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step2.description")}
      </p>

      {/* Professional section */}
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {t("step2.profSection")}
      </h3>

      <Input
        id="profName"
        label={t("step2.name")}
        value={profName}
        onChange={(e) => onProfNameChange(e.target.value)}
        required
      />
      <Input
        id="specialty"
        label={t("step2.specialty")}
        value={specialty}
        onChange={(e) => onSpecialtyChange(e.target.value)}
      />
      <Input
        id="duration"
        label={t("step2.duration")}
        type="number"
        min={5}
        max={480}
        value={duration}
        onChange={(e) => onDurationChange(Number(e.target.value) || 30)}
      />

      {/* Services section */}
      <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("step2.serviceSection")}
        </h3>

        {/* Service dropdown */}
        <div>
          <select
            onChange={handleSelectTemplate}
            defaultValue=""
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:outline-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-muted)",
            }}
          >
            <option value="">{t("step2.selectService")}</option>
            {templates.map((tmpl) => (
              <option key={tmpl.name} value={tmpl.name}>
                {tmpl.name} ({tmpl.duration_minutes}min)
              </option>
            ))}
            <option value="__custom__">{t("step2.customService")}</option>
          </select>
        </div>

        {/* Custom service input */}
        {showCustomInput && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="customServiceName"
                label={t("step2.customServiceName")}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t("step2.customServiceName")}
              />
            </div>
            <button
              type="button"
              onClick={addCustomService}
              disabled={customName.trim().length < 2}
              className="mb-0.5 flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-foreground)",
              }}
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => { setShowCustomInput(false); setCustomName(""); }}
              className="mb-0.5 rounded-lg px-2 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Services list */}
        {services.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("step2.noServices")}
          </p>
        ) : (
          <div className="space-y-2">
            {services.map((svc, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border p-3"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--surface)",
                }}
              >
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {svc.name}
                </span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={svc.duration_minutes}
                  onChange={(e) =>
                    updateService(index, "duration_minutes", Number(e.target.value) || 30)
                  }
                  className="w-16 rounded border px-2 py-1 text-center text-xs"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                  title={t("step2.serviceDuration")}
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  min
                </span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    R$
                  </span>
                  <input
                    type="text"
                    value={svc.price}
                    onChange={(e) => updateService(index, "price", e.target.value)}
                    placeholder="0,00"
                    className="w-24 rounded border py-1 pl-7 pr-2 text-right text-xs"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                    title={t("step2.servicePrice")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeService(index)}
                  className="rounded p-1 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                  style={{ color: "var(--text-muted)" }}
                  title={t("step2.removeService")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
