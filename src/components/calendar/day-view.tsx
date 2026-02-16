"use client";

import { useMemo } from "react";
import { AppointmentCard } from "./appointment-card";
import type { CalendarAppointment, ProfessionalOption } from "./types";
import {
  GRID_START_HOUR,
  GRID_END_HOUR,
  getEventPosition,
  isSameDay,
} from "@/lib/calendar/utils";

interface DayViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  professionals: ProfessionalOption[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);

export function DayView({
  date,
  appointments,
  professionals,
  onSlotClick,
  onAppointmentClick,
}: DayViewProps) {
  const dayAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.starts_at), date)),
    [appointments, date],
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach((p) => map.set(p.id, p.color));
    return map;
  }, [professionals]);

  const now = new Date();
  const isToday = isSameDay(date, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMin = GRID_START_HOUR * 60;
  const gridTotalMin = (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const nowPercent = ((nowMinutes - gridStartMin) / gridTotalMin) * 100;
  const showNowLine = isToday && nowPercent >= 0 && nowPercent <= 100;

  function handleSlotClick(hour: number) {
    const dateStr = date.toISOString().slice(0, 10);
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    onSlotClick(dateStr, timeStr);
  }

  return (
    <div className="flex overflow-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* Time column */}
      <div className="sticky left-0 z-10 w-14 shrink-0" style={{ backgroundColor: "var(--background)" }}>
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

      {/* Day column */}
      <div className="relative flex-1 border-l" style={{ borderColor: "var(--border)" }}>
        {HOURS.map((h) => (
          <div
            key={h}
            className="h-16 border-b transition-colors hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() => handleSlotClick(h)}
          />
        ))}

        {/* Now indicator */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 border-t-2"
            style={{ top: `${nowPercent}%`, borderColor: "var(--danger)" }}
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
              className="absolute left-0 right-0 z-10 px-1"
              style={{ top: `${top}%`, height: `${height}%` }}
            >
              <AppointmentCard
                appointment={appt}
                color={color}
                compact={false}
                onClick={() => onAppointmentClick(appt)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
