"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CompactScheduleGrid } from "./compact-schedule-grid";
import { ProfessionalServicesForm } from "./professional-services-form";
import { createProfessionalSchema } from "@/lib/validations/settings";
import type { ScheduleGrid } from "@/lib/validations/settings";

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
  onSuccess: () => void;
  onCancel: () => void;
}

const SUBTAB_KEYS = ["tabData", "tabSchedule", "tabServices"] as const;

export function ProfessionalForm({
  professional,
  onSuccess,
  onCancel,
}: ProfessionalFormProps) {
  const t = useTranslations("settings.professionals");
  const tf = useTranslations("settings.professionalForm");
  const isEditing = !!professional;

  const [activeSubTab, setActiveSubTab] = useState(0);
  const [name, setName] = useState(professional?.name ?? "");
  const [specialty, setSpecialty] = useState(professional?.specialty ?? "");
  const [duration, setDuration] = useState(
    professional?.appointment_duration_minutes ?? 30,
  );
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleGrid>(
    (professional?.schedule_grid as ScheduleGrid | undefined) ?? DEFAULT_GRID,
  );
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
      const url = isEditing
        ? `/api/settings/professionals/${professional.id}`
        : "/api/settings/professionals";

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("saveError"));
        return;
      }

      onSuccess();
    } catch {
      setError(t("saveError"));
    } finally {
      setLoading(false);
    }
  }

  // Subtabs available: always show Dados + Horário. Only show Serviços when editing.
  const subtabs = isEditing ? SUBTAB_KEYS : SUBTAB_KEYS.slice(0, 2);

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
          <Input
            id="specialty"
            label={t("specialty")}
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
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
                : isEditing
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

      {activeSubTab === 2 && isEditing && (
        <ProfessionalServicesForm professionalId={professional.id} />
      )}
    </div>
  );
}
