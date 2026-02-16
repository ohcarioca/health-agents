"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface CompactScheduleGridProps {
  value: ScheduleGrid;
  onChange: (grid: ScheduleGrid) => void;
}

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

// Hours from 06:00 to 21:30 — 32 slots of 30 min each
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21
const SLOTS_PER_HOUR = 2;
const TOTAL_SLOTS = HOURS.length * SLOTS_PER_HOUR; // 32

function slotToTime(slot: number): string {
  const hour = HOURS[0] + Math.floor(slot / SLOTS_PER_HOUR);
  const min = (slot % SLOTS_PER_HOUR) * 30;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToSlot(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - HOURS[0]) * SLOTS_PER_HOUR + Math.floor(m / 30);
}

/** Convert ScheduleGrid blocks to flat boolean array per day */
function gridToBooleans(grid: ScheduleGrid): Record<Weekday, boolean[]> {
  const result = {} as Record<Weekday, boolean[]>;
  for (const day of WEEKDAYS) {
    const arr = new Array(TOTAL_SLOTS).fill(false) as boolean[];
    const blocks = grid[day] ?? [];
    for (const block of blocks) {
      const start = timeToSlot(block.start);
      const end = timeToSlot(block.end);
      for (let i = start; i < end && i < TOTAL_SLOTS; i++) {
        arr[i] = true;
      }
    }
    result[day] = arr;
  }
  return result;
}

/** Convert flat boolean array back to ScheduleGrid blocks */
function booleansToGrid(booleans: Record<Weekday, boolean[]>): ScheduleGrid {
  const grid = {} as Record<Weekday, { start: string; end: string }[]>;
  for (const day of WEEKDAYS) {
    const blocks: { start: string; end: string }[] = [];
    const arr = booleans[day];
    let i = 0;
    while (i < arr.length) {
      if (arr[i]) {
        const start = i;
        while (i < arr.length && arr[i]) i++;
        blocks.push({ start: slotToTime(start), end: slotToTime(i) });
      } else {
        i++;
      }
    }
    grid[day] = blocks;
  }
  return grid as ScheduleGrid;
}

export function CompactScheduleGrid({ value, onChange }: CompactScheduleGridProps) {
  const t = useTranslations("settings");
  const [booleans, setBooleans] = useState(() => gridToBooleans(value));
  const dragging = useRef(false);
  const dragValue = useRef(false);
  const dragDay = useRef<Weekday | null>(null);

  const commit = useCallback(
    (next: Record<Weekday, boolean[]>) => {
      setBooleans(next);
      onChange(booleansToGrid(next));
    },
    [onChange],
  );

  function handleMouseDown(day: Weekday, slot: number) {
    dragging.current = true;
    dragDay.current = day;
    dragValue.current = !booleans[day][slot];
    const next = { ...booleans, [day]: [...booleans[day]] };
    next[day][slot] = dragValue.current;
    commit(next);
  }

  function handleMouseEnter(day: Weekday, slot: number) {
    if (!dragging.current || dragDay.current !== day) return;
    const next = { ...booleans, [day]: [...booleans[day]] };
    next[day][slot] = dragValue.current;
    commit(next);
  }

  function handleMouseUp() {
    dragging.current = false;
    dragDay.current = null;
  }

  function copyMondayToAll() {
    const next = { ...booleans };
    for (const day of WEEKDAYS) {
      if (day !== "monday") {
        next[day] = [...booleans.monday];
      }
    }
    commit(next);
  }

  function clearAll() {
    const next = {} as Record<Weekday, boolean[]>;
    for (const day of WEEKDAYS) {
      next[day] = new Array(TOTAL_SLOTS).fill(false) as boolean[];
    }
    commit(next);
  }

  return (
    <div className="space-y-2" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Shortcut buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyMondayToAll}
          className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          {t("compactGrid.copyToAll")}
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          {t("compactGrid.clearAll")}
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          {/* Hour headers */}
          <div className="flex">
            <div className="w-10 shrink-0" />
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px]"
                style={{ color: "var(--text-muted)", minWidth: "28px" }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Day rows */}
          {WEEKDAYS.map((day) => (
            <div key={day} className="flex items-center gap-0.5 py-0.5">
              <div
                className="w-10 shrink-0 text-[11px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {t(`weekdaysShort.${day}`)}
              </div>
              <div className="flex flex-1 gap-px">
                {booleans[day].map((active, slot) => (
                  <button
                    key={slot}
                    type="button"
                    onMouseDown={() => handleMouseDown(day, slot)}
                    onMouseEnter={() => handleMouseEnter(day, slot)}
                    className="h-6 flex-1 rounded-sm transition-colors"
                    style={{
                      backgroundColor: active
                        ? "var(--accent)"
                        : "var(--surface-elevated)",
                      minWidth: "12px",
                      opacity: active ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
