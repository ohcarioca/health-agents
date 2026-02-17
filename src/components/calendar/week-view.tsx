"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AppointmentCard } from "./appointment-card";
import type { CalendarAppointment, ProfessionalOption } from "./types";
import {
  GRID_START_HOUR,
  GRID_END_HOUR,
  getEventPosition,
  isSameDay,
  addDays,
} from "@/lib/calendar/utils";

interface WeekViewProps {
  weekStart: Date;
  appointments: CalendarAppointment[];
  professionals: ProfessionalOption[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function WeekView({
  weekStart,
  appointments,
  professionals,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const t = useTranslations("settings.weekdaysShort");
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const now = new Date();
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach((p) => map.set(p.id, p.color));
    return map;
  }, [professionals]);

  function getAppointmentsForDay(day: Date) {
    return appointments.filter((a) => isSameDay(new Date(a.starts_at), day));
  }

  function handleSlotClick(day: Date, hour: number) {
    const dateStr = day.toISOString().slice(0, 10);
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    onSlotClick(dateStr, timeStr);
  }

  // Now indicator position
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMin = GRID_START_HOUR * 60;
  const gridTotalMin = (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const nowPercent = ((nowMinutes - gridStartMin) / gridTotalMin) * 100;
  const showNowLine = nowPercent >= 0 && nowPercent <= 100;

  return (
    <div className="flex overflow-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* Time column */}
      <div className="sticky left-0 z-10 w-14 shrink-0" style={{ backgroundColor: "var(--background)" }}>
        <div className="h-10" /> {/* header spacer */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="flex h-16 items-start justify-end pr-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid flex-1 grid-cols-7">
        {days.map((day, dayIdx) => {
          const isToday = isSameDay(day, now);
          const dayAppointments = getAppointmentsForDay(day);

          return (
            <div key={dayIdx} className="border-l" style={{ borderColor: "var(--border)" }}>
              {/* Day header */}
              <div
                className={`sticky top-0 z-10 flex h-10 items-center justify-center gap-1 border-b text-xs font-medium`}
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                  color: isToday ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                <span>{t(WEEKDAY_KEYS[dayIdx])}</span>
                <span className={`${isToday ? "rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-white" : ""}`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Time slots */}
              <div className="relative">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="h-16 border-b transition-colors hover:bg-[var(--nav-hover-bg)] cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => handleSlotClick(day, h)}
                  />
                ))}

                {/* Now indicator */}
                {isToday && showNowLine && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 border-t-2"
                    style={{
                      top: `${nowPercent}%`,
                      borderColor: "var(--danger)",
                    }}
                  >
                    <div
                      className="absolute -left-1 -top-1.5 size-3 rounded-full"
                      style={{ backgroundColor: "var(--danger)" }}
                    />
                  </div>
                )}

                {/* Appointments */}
                {dayAppointments.map((appt) => {
                  const start = new Date(appt.starts_at);
                  const end = new Date(appt.ends_at);
                  const { top, height } = getEventPosition(start, end);
                  const profId = appt.professionals?.id ?? "";
                  const color = colorMap.get(profId) ?? "#6366f1";

                  return (
                    <div
                      key={appt.id}
                      className="absolute left-0 right-0 z-10"
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      <AppointmentCard
                        appointment={appt}
                        color={color}
                        compact
                        onClick={() => onAppointmentClick(appt)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
