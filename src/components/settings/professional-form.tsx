"use client";

import { useState, useRef, useMemo, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { CompactScheduleGrid } from "./compact-schedule-grid";
import {
  ProfessionalServicesForm,
  type ProfessionalServicesFormHandle,
} from "./professional-services-form";
import { createProfessionalSchema } from "@/lib/validations/settings";
import type { ScheduleGrid } from "@/lib/validations/settings";
import { getSpecialtySuggestions } from "@/lib/constants/specialties";

const DEFAULT_GRID: ScheduleGrid = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

interface ProfessionalFormProps {
  professional?: {
    id: string;
    name: string;
    specialty: string | null;
    appointment_duration_minutes: number;
    schedule_grid?: Record<string, { start: string; end: string }[]>;
  };
  clinicType?: string | null;
  clinicOperatingHours?: Record<string, { start: string; end: string }[]>;
  onSuccess: () => void;
  onCancel: () => void;
}

const SUBTAB_KEYS = ["tabData", "tabSchedule", "tabServices"] as const;

export function ProfessionalForm({
  professional,
  clinicType,
  clinicOperatingHours,
  onSuccess,
  onCancel,
}: ProfessionalFormProps) {
  const t = useTranslations("settings.professionals");
  const tf = useTranslations("settings.professionalForm");
  const isEditing = !!professional;

  // Track the ID of a just-created professional so we stay in the dialog
  const [createdId, setCreatedId] = useState<string | null>(null);
  const effectiveId = professional?.id ?? createdId;

  const servicesRef = useRef<ProfessionalServicesFormHandle>(null);

  const specialtySuggestions = useMemo(
    () => getSpecialtySuggestions(clinicType),
    [clinicType],
  );

  // Default schedule: clinic operating_hours for new professionals, own schedule for existing
  const defaultGrid: ScheduleGrid =
    (professional?.schedule_grid as ScheduleGrid | undefined) ??
    (clinicOperatingHours as ScheduleGrid | undefined) ??
    DEFAULT_GRID;

  const [activeSubTab, setActiveSubTab] = useState(0);
  const [name, setName] = useState(professional?.name ?? "");
  const [specialty, setSpecialty] = useState(professional?.specialty ?? "");
  const [duration, setDuration] = useState(
    professional?.appointment_duration_minutes ?? 30,
  );
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleGrid>(defaultGrid);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const data = {
      name,
      specialty,
      appointment_duration_minutes: duration,
      schedule_grid: scheduleGrid,
    };

    const parsed = createProfessionalSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError = Object.values(flat.fieldErrors).flat()[0];
      setError(firstError ?? t("saveError"));
      return;
    }

    setLoading(true);
    try {
      const url = effectiveId
        ? `/api/settings/professionals/${effectiveId}`
        : "/api/settings/professionals";

      const res = await fetch(url, {
        method: effectiveId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("saveError"));
        return;
      }

      if (!effectiveId) {
        // Just created — store ID and switch to Services tab
        const json = await res.json();
        setCreatedId(json.data.id);
        setActiveSubTab(2);
      } else {
        onSuccess();
      }
    } catch {
      setError(t("saveError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDone() {
    if (servicesRef.current) {
      const ok = await servicesRef.current.save();
      if (!ok) return;
    }
    onSuccess();
  }

  // Always show all 3 tabs — Services tab handles the "save first" state internally
  const subtabs = SUBTAB_KEYS;

  return (
    <div className="space-y-4">
      {/* Subtab bar */}
      <div
        className="flex gap-1 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {subtabs.map((key, i) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSubTab(i)}
            className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-colors ${
              i === activeSubTab
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tf(key)}
          </button>
        ))}
      </div>

      {/* Subtab content */}
      {activeSubTab === 0 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="profName"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Combobox
            id="specialty"
            label={t("specialty")}
            value={specialty}
            onChange={setSpecialty}
            suggestions={specialtySuggestions}
            placeholder={tf("specialtyPlaceholder")}
          />
          <Input
            id="duration"
            label={t("duration")}
            type="number"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={5}
            max={480}
          />

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("name") === "Nome" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? "..."
                : effectiveId
                  ? t("edit")
                  : t("add")}
            </Button>
          </div>
        </form>
      )}

      {activeSubTab === 1 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <CompactScheduleGrid value={scheduleGrid} onChange={setScheduleGrid} />

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("name") === "Nome" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : t("name") === "Nome" ? "Salvar" : "Save"}
            </Button>
          </div>
        </form>
      )}

      {activeSubTab === 2 && (
        effectiveId ? (
          <div className="space-y-4">
            <ProfessionalServicesForm
              ref={servicesRef}
              professionalId={effectiveId}
              preselectAll={!!createdId}
            />
            <div className="flex justify-end border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <Button type="button" onClick={handleDone}>
                {tf("done")}
              </Button>
            </div>
          </div>
        ) : (
          <p
            className="py-6 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {tf("saveFirst")}
          </p>
        )
      )}
    </div>
  );
}
