"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";

interface AppointmentRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  patients: { id: string; name: string; phone: string } | null;
  services: { id: string; name: string; duration_minutes: number } | null;
  professionals: { id: string; name: string } | null;
}

const MAX_ROWS = 8;

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "danger" | "accent" | "neutral"> = {
  scheduled: "accent",
  confirmed: "success",
  completed: "neutral",
  cancelled: "danger",
  no_show: "warning",
};

function formatTime(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek === 0 ? 7 : dayOfWeek) - 1) + weekOffset * 7);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function countAppointmentsForDay(appointments: AppointmentRow[], day: Date): number {
  return appointments.filter((apt) => isSameDay(new Date(apt.starts_at), day)).length;
}

export function UpcomingAppointments() {
  const t = useTranslations("dashboard");
  const tCal = useTranslations("calendar");
  const locale = useLocale();
  const [allAppointments, setAllAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const fetchWeekAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const start = weekDays[0].toISOString().split("T")[0];
      const lastDay = new Date(weekDays[6]);
      lastDay.setDate(lastDay.getDate() + 1);
      const end = lastDay.toISOString().split("T")[0];

      const res = await fetch(`/api/calendar/appointments?start=${start}&end=${end}`);
      if (res.ok) {
        const body: { data?: AppointmentRow[] } = await res.json();
        setAllAppointments(body.data ?? []);
      }
    } catch {
      // Supplementary widget — silently handle
    } finally {
      setLoading(false);
    }
  }, [weekDays]);

  useEffect(() => {
    fetchWeekAppointments();
  }, [fetchWeekAppointments]);

  const dayAppointments = useMemo(
    () => allAppointments
      .filter((apt) => isSameDay(new Date(apt.starts_at), selectedDate))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, MAX_ROWS),
    [allAppointments, selectedDate],
  );

  const today = new Date();

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="size-4" style={{ color: "var(--accent)" }} />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("upcomingAppointments")}
          </p>
        </div>
        <a
          href="/calendar"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: "var(--accent)",
            color: "#fff",
          }}
        >
          <Plus className="size-3.5" />
          {t("addNew")}
        </a>
      </div>

      {/* Date Strip */}
      <div className="mt-4 flex items-center gap-1">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex flex-1 justify-between gap-1">
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);
            const count = countAppointmentsForDay(allAppointments, day);
            const weekday = day.toLocaleDateString(locale, { weekday: "short" });
            const dayNum = day.getDate();

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors"
                style={{
                  backgroundColor: isSelected ? "var(--accent-muted)" : "transparent",
                  ...(isSelected ? { borderColor: "var(--accent)" } : {}),
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span
                  className="text-[10px] font-medium uppercase"
                  style={{ color: isSelected ? "var(--accent)" : "var(--text-muted)" }}
                >
                  {weekday}
                </span>
                <span
                  className="flex size-8 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: isToday ? "var(--accent)" : "transparent",
                    color: isToday ? "#fff" : isSelected ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  {dayNum}
                </span>
                {/* Appointment dots */}
                <div className="flex items-center gap-0.5">
                  {count > 0 ? (
                    Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <div
                        key={i}
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: "var(--accent)" }}
                      />
                    ))
                  ) : (
                    <div className="size-1.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Appointment List */}
      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : dayAppointments.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {t("noAppointmentsForDate")}
          </p>
        ) : (
          <div className="space-y-2">
            {dayAppointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors"
                style={{ backgroundColor: "var(--background)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--background)")}
              >
                {/* Time */}
                <div className="w-14 shrink-0 text-right">
                  <span
                    className="font-mono text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatTime(apt.starts_at, locale)}
                  </span>
                </div>

                {/* Accent bar */}
                <div
                  className="h-10 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {apt.patients?.name ?? "\u2014"}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {apt.services?.name ?? "\u2014"}
                    {apt.professionals?.name ? ` \u00B7 ${apt.professionals.name}` : ""}
                  </p>
                </div>

                {/* Status */}
                <Badge variant={STATUS_BADGE_VARIANT[apt.status] ?? "neutral"}>
                  {tCal(`statuses.${apt.status}`)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
