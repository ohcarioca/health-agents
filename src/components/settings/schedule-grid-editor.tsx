"use client";

import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface ScheduleGridEditorProps {
  value: ScheduleGrid;
  onChange: (grid: ScheduleGrid) => void;
}

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

/** Generate time options from 06:00 to 22:00 in 30-minute increments. */
function buildTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 6; h <= 22; h++) {
    const hh = String(h).padStart(2, "0");
    options.push(`${hh}:00`);
    if (h < 22) {
      options.push(`${hh}:30`);
    }
  }
  return options;
}

const TIME_OPTIONS = buildTimeOptions();

export function ScheduleGridEditor({ value, onChange }: ScheduleGridEditorProps) {
  const t = useTranslations("settings");

  function addBlock(day: Weekday) {
    const blocks = value[day] ?? [];
    const lastEnd = blocks.length > 0 ? blocks[blocks.length - 1].end : "08:30";
    const startIdx = TIME_OPTIONS.indexOf(lastEnd);
    const newStart = startIdx >= 0 && startIdx < TIME_OPTIONS.length - 1
      ? TIME_OPTIONS[startIdx]
      : "09:00";
    const endIdx = TIME_OPTIONS.indexOf(newStart);
    const newEnd = endIdx >= 0 && endIdx + 2 < TIME_OPTIONS.length
      ? TIME_OPTIONS[endIdx + 2]
      : TIME_OPTIONS[TIME_OPTIONS.length - 1];

    onChange({
      ...value,
      [day]: [...blocks, { start: newStart, end: newEnd }],
    });
  }

  function removeBlock(day: Weekday, index: number) {
    const blocks = value[day] ?? [];
    onChange({
      ...value,
      [day]: blocks.filter((_, i) => i !== index),
    });
  }

  function updateBlock(
    day: Weekday,
    index: number,
    field: "start" | "end",
    newValue: string,
  ) {
    const blocks = value[day] ?? [];
    const updated = blocks.map((block, i) =>
      i === index ? { ...block, [field]: newValue } : block,
    );
    onChange({
      ...value,
      [day]: updated,
    });
  }

  return (
    <div className="space-y-3">
      <label
        className="block text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {t("scheduleGrid.title")}
      </label>

      <div className="space-y-2">
        {WEEKDAYS.map((day) => {
          const blocks = value[day] ?? [];

          return (
            <div
              key={day}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <p
                className="mb-2 text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t(`weekdays.${day}`)}
              </p>

              {blocks.length === 0 ? (
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("scheduleGrid.dayOff")}
                  </span>
                  <button
                    type="button"
                    onClick={() => addBlock(day)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
                    style={{ color: "var(--accent)" }}
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    {t("scheduleGrid.addBlock")}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <select
                        value={block.start}
                        onChange={(e) =>
                          updateBlock(day, idx, "start", e.target.value)
                        }
                        className="rounded-md border bg-transparent px-2 py-1 text-sm"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {TIME_OPTIONS.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>

                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        —
                      </span>

                      <select
                        value={block.end}
                        onChange={(e) =>
                          updateBlock(day, idx, "end", e.target.value)
                        }
                        className="rounded-md border bg-transparent px-2 py-1 text-sm"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {TIME_OPTIONS.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => removeBlock(day, idx)}
                        className="rounded-md p-1 transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                        style={{ color: "var(--danger)" }}
                        title={t("scheduleGrid.removeBlock")}
                      >
                        <X className="size-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addBlock(day)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
                    style={{ color: "var(--accent)" }}
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    {t("scheduleGrid.addBlock")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
