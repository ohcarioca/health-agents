"use client";

import type { CalendarAppointment } from "./types";
import { formatTime } from "@/lib/calendar/utils";

interface AppointmentCardProps {
  appointment: CalendarAppointment;
  color: string;
  compact?: boolean;
  onClick: () => void;
}

const STATUS_OPACITY: Record<string, string> = {
  scheduled: "1",
  confirmed: "1",
  completed: "0.6",
  cancelled: "0.35",
  no_show: "0.35",
};

export function AppointmentCard({
  appointment,
  color,
  compact = false,
  onClick,
}: AppointmentCardProps) {
  const start = new Date(appointment.starts_at);
  const opacity = STATUS_OPACITY[appointment.status] ?? "1";
  const isCancelled =
    appointment.status === "cancelled" || appointment.status === "no_show";

  return (
    <button
      onClick={onClick}
      className="absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs transition-opacity hover:opacity-90"
      style={{
        backgroundColor: `${color}20`,
        borderLeft: `3px solid ${color}`,
        color: "var(--text-primary)",
        opacity,
      }}
    >
      <div
        className={`font-medium truncate ${isCancelled ? "line-through" : ""}`}
      >
        {formatTime(start)} {appointment.patients?.name ?? "\u2014"}
      </div>
      {!compact && appointment.services && (
        <div
          className="truncate text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {appointment.services.name}
        </div>
      )}
    </button>
  );
}
