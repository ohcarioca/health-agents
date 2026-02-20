"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface AppointmentRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_reason: string | null;
  professionals: { id: string; name: string } | null;
  services: { id: string; name: string } | null;
}

interface PatientAppointmentsTabProps {
  patientId: string;
  locale: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: "var(--surface-elevated)", color: "var(--text-secondary)" },
  confirmed: { bg: "rgba(34,197,94,0.1)", color: "var(--success, #22c55e)" },
  completed: { bg: "rgba(34,197,94,0.1)", color: "var(--success, #22c55e)" },
  cancelled: { bg: "var(--surface-elevated)", color: "var(--text-muted)" },
  no_show: { bg: "rgba(245,158,11,0.1)", color: "var(--warning, #f59e0b)" },
};

export function PatientAppointmentsTab({ patientId, locale }: PatientAppointmentsTabProps) {
  const t = useTranslations("patients.detail");
  const ts = useTranslations("calendar.statuses");

  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/patients/${patientId}/appointments`);
        if (res.ok) {
          const json = await res.json();
          setAppointments(json.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Calendar className="size-8" strokeWidth={1} style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("noAppointments")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map((appt) => {
        const date = new Date(appt.starts_at);
        const statusStyle = STATUS_STYLES[appt.status] ?? STATUS_STYLES.scheduled;

        return (
          <div
            key={appt.id}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {date.toLocaleDateString(locale)}{" "}
                  {date.toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.color,
                  }}
                >
                  {ts(appt.status)}
                </span>
              </div>
              <div className="flex gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                {appt.professionals && (
                  <span>{t("professional")}: {appt.professionals.name}</span>
                )}
                {appt.services && (
                  <span>{t("service")}: {appt.services.name}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
