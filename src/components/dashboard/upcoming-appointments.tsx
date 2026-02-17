"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Calendar, Plus } from "lucide-react";

interface AppointmentRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  patients: { id: string; name: string; phone: string } | null;
  services: { id: string; name: string; duration_minutes: number } | null;
}

const MAX_ROWS = 8;

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "danger" | "accent" | "neutral"> = {
  scheduled: "accent",
  confirmed: "success",
  completed: "neutral",
  cancelled: "danger",
  no_show: "warning",
};

function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} - ${fmt(end)}`;
}

export function UpcomingAppointments() {
  const t = useTranslations("dashboard");
  const tCal = useTranslations("calendar");
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAppointments() {
      try {
        const today = new Date();
        const start = today.toISOString().split("T")[0];
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const end = tomorrow.toISOString().split("T")[0];

        const res = await fetch(
          `/api/calendar/appointments?start=${start}&end=${end}`,
        );
        if (res.ok) {
          const body: { data?: AppointmentRow[] } = await res.json();
          setAppointments((body.data ?? []).slice(0, MAX_ROWS));
        }
      } catch {
        // Supplementary widget — silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchAppointments();
  }, []);

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
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

      {loading ? (
        <div className="mt-4 flex justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : appointments.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("noAppointments")}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                <th className="pb-2 pr-4 font-medium">{t("service")}</th>
                <th className="pb-2 pr-4 font-medium">{t("patient")}</th>
                <th className="pb-2 pr-4 font-medium">{t("dateTime")}</th>
                <th className="pb-2 font-medium">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt) => (
                <tr
                  key={apt.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td
                    className="py-2.5 pr-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {apt.services?.name ?? "\u2014"}
                  </td>
                  <td
                    className="py-2.5 pr-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {apt.patients?.name ?? "\u2014"}
                  </td>
                  <td
                    className="py-2.5 pr-4 font-mono text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatTimeRange(apt.starts_at, apt.ends_at)}
                  </td>
                  <td className="py-2.5">
                    <Badge variant={STATUS_BADGE_VARIANT[apt.status] ?? "neutral"}>
                      {tCal(`statuses.${apt.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
