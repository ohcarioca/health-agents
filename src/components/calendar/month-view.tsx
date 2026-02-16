"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CalendarAppointment } from "./types";
import { isSameDay } from "@/lib/calendar/utils";

interface MonthViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  onDayClick: (date: Date) => void;
}

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function MonthView({ date, appointments, onDayClick }: MonthViewProps) {
  const t = useTranslations("settings.weekdaysShort");
  const now = new Date();

  const { weeks } = useMemo(() => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Find Monday before or on the first day
    const start = new Date(firstDay);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    const weeks: Date[][] = [];
    const current = new Date(start);

    while (current <= lastDay || weeks.length < 5) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) break;
    }

    return { weeks };
  }, [date]);

  // Count appointments per day
  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const appt of appointments) {
      const key = new Date(appt.starts_at).toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [appointments]);

  const currentMonth = date.getMonth();

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-7">
        {WEEKDAY_KEYS.map((key) => (
          <div
            key={key}
            className="py-2 text-center text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {t(key)}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            const isCurrentMonth = day.getMonth() === currentMonth;
            const isToday = isSameDay(day, now);
            const key = day.toISOString().slice(0, 10);
            const count = countMap.get(key) ?? 0;

            return (
              <button
                key={di}
                onClick={() => onDayClick(day)}
                className="flex min-h-20 flex-col items-center border-b border-r p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                style={{
                  borderColor: "var(--border)",
                  opacity: isCurrentMonth ? 1 : 0.35,
                }}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                    isToday ? "bg-[var(--accent)] text-white" : ""
                  }`}
                  style={{ color: isToday ? undefined : "var(--text-primary)" }}
                >
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <span
                    className="mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: "var(--accent-muted)",
                      color: "var(--accent)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
