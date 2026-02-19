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
  modality: 'in_person' | 'online' | 'both';
}

interface StepServicesProps {
  clinicType: string;
  services: ServiceItem[];
  onServicesChange: (services: ServiceItem[]) => void;
}

export function StepServices({
  clinicType,
  services,
  onServicesChange,
}: StepServicesProps) {
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
        { name: tmpl.name, duration_minutes: tmpl.duration_minutes, price: "", modality: "both" },
      ]);
    }
    e.target.value = "";
  }

  function addCustomService() {
    if (customName.trim().length < 2) return;
    onServicesChange([
      ...services,
      { name: customName.trim(), duration_minutes: 30, price: "", modality: "both" },
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
        {t("stepServices.description")}
      </p>

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
          <option value="">{t("stepServices.selectService")}</option>
          {templates.map((tmpl) => (
            <option key={tmpl.name} value={tmpl.name}>
              {tmpl.name} ({tmpl.duration_minutes}min)
            </option>
          ))}
          <option value="__custom__">{t("stepServices.customService")}</option>
        </select>
      </div>

      {/* Custom service input */}
      {showCustomInput && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="customServiceName"
              label={t("stepServices.customServiceName")}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={t("stepServices.customServiceName")}
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
          {t("stepServices.noServices")}
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
                title={t("stepServices.serviceDuration")}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                min
              </span>
              {/* Modality selector */}
              <select
                value={svc.modality}
                onChange={(e) =>
                  updateService(index, "modality", e.target.value as ServiceItem["modality"])
                }
                className="rounded border px-2 py-1 text-xs"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
                title={t("stepServices.modality")}
              >
                <option value="both">{t("stepServices.modalityBoth")}</option>
                <option value="in_person">{t("stepServices.modalityInPerson")}</option>
                <option value="online">{t("stepServices.modalityOnline")}</option>
              </select>
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
                  title={t("stepServices.servicePrice")}
                />
              </div>
              <button
                type="button"
                onClick={() => removeService(index)}
                className="rounded p-1 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                style={{ color: "var(--text-muted)" }}
                title={t("stepServices.removeService")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
