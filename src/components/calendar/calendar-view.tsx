"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { AppointmentModal } from "./appointment-modal";
import type { CalendarAppointment, ProfessionalOption } from "./types";
import {
  getWeekRange,
  getDayRange,
  getMonthRange,
} from "@/lib/calendar/utils";

type ViewMode = "day" | "week" | "month";

interface CalendarViewProps {
  professionals: ProfessionalOption[];
}

export function CalendarView({ professionals }: CalendarViewProps) {
  const t = useTranslations("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("week");
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<CalendarAppointment | null>(null);
  const [prefillDate, setPrefillDate] = useState<string>();
  const [prefillTime, setPrefillTime] = useState<string>();

  const dateRange = useMemo(() => {
    switch (view) {
      case "day": return getDayRange(currentDate);
      case "week": return getWeekRange(currentDate);
      case "month": return getMonthRange(currentDate);
    }
  }, [currentDate, view]);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      });
      if (selectedProfessionalId) {
        params.set("professional_id", selectedProfessionalId);
      }

      const res = await fetch(`/api/calendar/appointments?${params}`);
      const json = await res.json();
      setAppointments(json.data ?? []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedProfessionalId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  function navigate(direction: number) {
    const d = new Date(currentDate);
    switch (view) {
      case "day":
        d.setDate(d.getDate() + direction);
        break;
      case "week":
        d.setDate(d.getDate() + direction * 7);
        break;
      case "month":
        d.setMonth(d.getMonth() + direction);
        break;
    }
    setCurrentDate(d);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function handleSlotClick(date: string, time: string) {
    setEditingAppointment(null);
    setPrefillDate(date);
    setPrefillTime(time);
    setModalOpen(true);
  }

  function handleAppointmentClick(appointment: CalendarAppointment) {
    setEditingAppointment(appointment);
    setPrefillDate(undefined);
    setPrefillTime(undefined);
    setModalOpen(true);
  }

  function handleDayClick(day: Date) {
    setCurrentDate(day);
    setView("day");
  }

  function handleNewAppointment() {
    setEditingAppointment(null);
    setPrefillDate(currentDate.toISOString().slice(0, 10));
    setPrefillTime("09:00");
    setModalOpen(true);
  }

  // Format header date
  const headerDate = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions =
      view === "month"
        ? { month: "long", year: "numeric" }
        : view === "week"
          ? { month: "long", year: "numeric" }
          : { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    return currentDate.toLocaleDateString(undefined, opts);
  }, [currentDate, view]);

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            {t("today")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <span
          className="text-sm font-semibold capitalize"
          style={{ color: "var(--text-primary)" }}
        >
          {headerDate}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Professional filter */}
          <select
            value={selectedProfessionalId}
            onChange={(e) => setSelectedProfessionalId(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            <option value="">{t("allProfessionals")}</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* View toggle */}
          <div className="rounded-lg p-1" style={{ backgroundColor: "var(--background)" }}>
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-[var(--accent)] text-white"
                    : "hover:text-[var(--text-primary)]"
                }`}
                style={{
                  color: view === v ? undefined : "var(--text-secondary)",
                }}
              >
                {t(`views.${v}`)}
              </button>
            ))}
          </div>

          {/* New appointment */}
          <Button size="sm" onClick={handleNewAppointment}>
            <Plus className="size-4" />
            {t("newAppointment")}
          </Button>
        </div>
      </div>

      {/* Calendar body */}
      <div
        className="rounded-xl border"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--surface)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {loading && (
          <div className="flex h-32 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        )}

        {!loading && view === "week" && (
          <WeekView
            weekStart={getWeekRange(currentDate).start}
            appointments={appointments}
            professionals={professionals}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}

        {!loading && view === "day" && (
          <DayView
            date={currentDate}
            appointments={appointments}
            professionals={professionals}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}

        {!loading && view === "month" && (
          <MonthView
            date={currentDate}
            appointments={appointments}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {/* Professional legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {professionals.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Modal */}
      <AppointmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        appointment={editingAppointment}
        professionals={professionals}
        prefillDate={prefillDate}
        prefillTime={prefillTime}
        prefillProfessionalId={selectedProfessionalId || undefined}
        onSave={fetchAppointments}
      />
    </div>
  );
}
