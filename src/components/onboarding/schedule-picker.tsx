"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface SchedulePickerProps {
  value: ScheduleGrid;
  onChange: (grid: ScheduleGrid) => void;
}

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

// Generate time options from 06:00 to 22:00 in 30-min increments
const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
  }
}

interface DayConfig {
  enabled: boolean;
  start: string;
  end: string;
}

type WeekConfig = Record<Weekday, DayConfig>;

const PRESETS = {
  commercial: {
    monday: { enabled: true, start: "08:00", end: "18:00" },
    tuesday: { enabled: true, start: "08:00", end: "18:00" },
    wednesday: { enabled: true, start: "08:00", end: "18:00" },
    thursday: { enabled: true, start: "08:00", end: "18:00" },
    friday: { enabled: true, start: "08:00", end: "18:00" },
    saturday: { enabled: false, start: "08:00", end: "13:00" },
    sunday: { enabled: false, start: "08:00", end: "12:00" },
  } satisfies WeekConfig,
  commercialSaturday: {
    monday: { enabled: true, start: "08:00", end: "18:00" },
    tuesday: { enabled: true, start: "08:00", end: "18:00" },
    wednesday: { enabled: true, start: "08:00", end: "18:00" },
    thursday: { enabled: true, start: "08:00", end: "18:00" },
    friday: { enabled: true, start: "08:00", end: "18:00" },
    saturday: { enabled: true, start: "08:00", end: "13:00" },
    sunday: { enabled: false, start: "08:00", end: "12:00" },
  } satisfies WeekConfig,
  extended: {
    monday: { enabled: true, start: "07:00", end: "20:00" },
    tuesday: { enabled: true, start: "07:00", end: "20:00" },
    wednesday: { enabled: true, start: "07:00", end: "20:00" },
    thursday: { enabled: true, start: "07:00", end: "20:00" },
    friday: { enabled: true, start: "07:00", end: "20:00" },
    saturday: { enabled: true, start: "08:00", end: "14:00" },
    sunday: { enabled: false, start: "08:00", end: "12:00" },
  } satisfies WeekConfig,
} as const;

type PresetKey = keyof typeof PRESETS | "custom";

function gridToConfig(grid: ScheduleGrid): WeekConfig {
  const config = {} as WeekConfig;
  for (const day of WEEKDAYS) {
    const blocks = grid[day] ?? [];
    if (blocks.length === 0) {
      config[day] = { enabled: false, start: "08:00", end: "18:00" };
    } else {
      config[day] = {
        enabled: true,
        start: blocks[0].start,
        end: blocks[blocks.length - 1].end,
      };
    }
  }
  return config;
}

function configToGrid(config: WeekConfig): ScheduleGrid {
  const grid = {} as Record<Weekday, { start: string; end: string }[]>;
  for (const day of WEEKDAYS) {
    const dc = config[day];
    grid[day] = dc.enabled ? [{ start: dc.start, end: dc.end }] : [];
  }
  return grid as ScheduleGrid;
}

function detectPreset(config: WeekConfig): PresetKey {
  for (const [key, preset] of Object.entries(PRESETS)) {
    let match = true;
    for (const day of WEEKDAYS) {
      const c = config[day];
      const p = preset[day];
      if (c.enabled !== p.enabled) { match = false; break; }
      if (c.enabled && (c.start !== p.start || c.end !== p.end)) { match = false; break; }
    }
    if (match) return key as PresetKey;
  }
  return "custom";
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const t = useTranslations("onboarding.scheduleGrid");
  const tDays = useTranslations("settings.weekdaysShort");

  const [config, setConfig] = useState<WeekConfig>(() => gridToConfig(value));
  const [activePreset, setActivePreset] = useState<PresetKey>(() =>
    detectPreset(gridToConfig(value))
  );

  const commit = useCallback(
    (next: WeekConfig) => {
      setConfig(next);
      setActivePreset(detectPreset(next));
      onChange(configToGrid(next));
    },
    [onChange],
  );

  function applyPreset(key: PresetKey) {
    if (key === "custom") return;
    const preset = PRESETS[key];
    const next = {} as WeekConfig;
    for (const day of WEEKDAYS) {
      next[day] = { ...preset[day] };
    }
    setActivePreset(key);
    commit(next);
  }

  function toggleDay(day: Weekday) {
    const next = { ...config, [day]: { ...config[day], enabled: !config[day].enabled } };
    commit(next);
  }

  function updateTime(day: Weekday, field: "start" | "end", val: string) {
    const next = { ...config, [day]: { ...config[day], [field]: val } };
    commit(next);
  }

  function copyMondayToWeekdays() {
    const mon = config.monday;
    const next = { ...config };
    for (const day of WEEKDAYS) {
      if (day !== "saturday" && day !== "sunday") {
        next[day] = { ...mon };
      }
    }
    commit(next);
  }

  const presetOptions: { key: PresetKey; label: string }[] = [
    { key: "commercial", label: t("presetCommercial") },
    { key: "commercialSaturday", label: t("presetCommercialSat") },
    { key: "extended", label: t("presetExtended") },
    { key: "custom", label: t("presetCustom") },
  ];

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presetOptions.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => key !== "custom" && applyPreset(key)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              borderColor: activePreset === key ? "var(--accent)" : "var(--border)",
              backgroundColor: activePreset === key ? "var(--accent-muted)" : "transparent",
              color: activePreset === key ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Day rows */}
      <div className="space-y-1.5">
        {WEEKDAYS.map((day) => {
          const dc = config[day];
          const isWeekend = day === "saturday" || day === "sunday";

          return (
            <div
              key={day}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              style={{
                borderColor: "var(--border)",
                opacity: dc.enabled ? 1 : 0.6,
              }}
            >
              {/* Day toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={dc.enabled}
                onClick={() => toggleDay(day)}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={{
                  backgroundColor: dc.enabled
                    ? "var(--accent)"
                    : "var(--surface-elevated)",
                }}
              >
                <span
                  className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    dc.enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>

              {/* Day name */}
              <span
                className="w-10 text-xs font-medium"
                style={{
                  color: dc.enabled ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {tDays(day)}
              </span>

              {/* Time selectors */}
              {dc.enabled ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={dc.start}
                    onChange={(e) => updateTime(day, "start", e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                  <select
                    value={dc.end}
                    onChange={(e) => updateTime(day, "end", e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {TIME_OPTIONS.filter((time) => time > dc.start).map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("closed")}
                </span>
              )}

              {/* Weekend badge */}
              {isWeekend && (
                <span
                  className="ml-auto rounded px-1.5 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    color: "var(--text-muted)",
                  }}
                >
                  {t("weekend")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Copy shortcut */}
      <button
        type="button"
        onClick={copyMondayToWeekdays}
        className="text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--accent)" }}
      >
        {t("copyMondayToWeekdays")}
      </button>
    </div>
  );
}
