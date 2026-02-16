"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PatientSearch } from "./patient-search";
import type { CalendarAppointment, ProfessionalOption } from "./types";

interface ServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
}

interface InsurancePlanOption {
  id: string;
  name: string;
}

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: CalendarAppointment | null;
  professionals: ProfessionalOption[];
  prefillDate?: string;
  prefillTime?: string;
  prefillProfessionalId?: string;
  onSave: () => void;
}

const STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;

export function AppointmentModal({
  open,
  onOpenChange,
  appointment,
  professionals,
  prefillDate,
  prefillTime,
  prefillProfessionalId,
  onSave,
}: AppointmentModalProps) {
  const t = useTranslations("calendar");
  const tc = useTranslations("common");
  const isEdit = !!appointment;

  // Form state
  const [patient, setPatient] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [insurancePlanId, setInsurancePlanId] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [cancellationReason, setCancellationReason] = useState("");

  // Options
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [insurancePlans, setInsurancePlans] = useState<InsurancePlanOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return;

    if (appointment) {
      const start = new Date(appointment.starts_at);
      const end = new Date(appointment.ends_at);
      setPatient(appointment.patients ? { id: appointment.patients.id, name: appointment.patients.name, phone: appointment.patients.phone } : null);
      setProfessionalId(appointment.professionals?.id ?? "");
      setServiceId(appointment.services?.id ?? "");
      setDate(start.toISOString().slice(0, 10));
      setStartTime(start.toTimeString().slice(0, 5));
      setEndTime(end.toTimeString().slice(0, 5));
      setInsurancePlanId(appointment.insurance_plans?.id ?? "");
      setStatus(appointment.status);
      setCancellationReason(appointment.cancellation_reason ?? "");
    } else {
      setPatient(null);
      setProfessionalId(prefillProfessionalId ?? "");
      setServiceId("");
      setDate(prefillDate ?? new Date().toISOString().slice(0, 10));
      setStartTime(prefillTime ?? "09:00");
      setEndTime("");
      setInsurancePlanId("");
      setStatus("scheduled");
      setCancellationReason("");
    }
    setError("");
  }, [open, appointment, prefillDate, prefillTime, prefillProfessionalId]);

  // Load services for selected professional
  useEffect(() => {
    if (!professionalId) {
      setServices([]);
      return;
    }

    fetch(`/api/settings/professionals/${professionalId}/services`)
      .then((res) => res.json())
      .then((json) => {
        const svcList = (json.data ?? []).map((ps: { service_id: string; services: ServiceOption }) => ({
          id: ps.service_id,
          name: ps.services?.name ?? "",
          duration_minutes: ps.services?.duration_minutes ?? 30,
        }));
        setServices(svcList);
      })
      .catch(() => setServices([]));
  }, [professionalId]);

  // Load insurance plans
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/insurance-plans")
      .then((res) => res.json())
      .then((json) => setInsurancePlans(json.data ?? []))
      .catch(() => setInsurancePlans([]));
  }, [open]);

  // Auto-calculate end time from service duration
  useEffect(() => {
    if (!serviceId || !startTime) return;
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;

    const [h, m] = startTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + svc.duration_minutes;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
  }, [serviceId, startTime, services]);

  async function handleSave() {
    if (!patient) { setError(t("selectPatient")); return; }
    if (!professionalId) { setError(t("selectProfessional")); return; }
    if (!date || !startTime || !endTime) return;

    setSaving(true);
    setError("");

    const starts_at = new Date(`${date}T${startTime}:00`).toISOString();
    const ends_at = new Date(`${date}T${endTime}:00`).toISOString();

    try {
      const url = isEdit
        ? `/api/calendar/appointments/${appointment.id}`
        : "/api/calendar/appointments";

      const payload: Record<string, unknown> = {
        patient_id: patient.id,
        professional_id: professionalId,
        starts_at,
        ends_at,
      };
      if (serviceId) payload.service_id = serviceId;
      if (insurancePlanId) payload.insurance_plan_id = insurancePlanId;
      if (isEdit) {
        payload.status = status;
        if (status === "cancelled" && cancellationReason) {
          payload.cancellation_reason = cancellationReason;
        }
      }

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        if (res.status === 409) {
          setError(t("conflict"));
        } else {
          setError(json.error ?? t("saveError"));
        }
        return;
      }

      onSave();
      onOpenChange(false);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!appointment || !confirm(t("deleteConfirm"))) return;

    setSaving(true);
    try {
      await fetch(`/api/calendar/appointments/${appointment.id}`, { method: "DELETE" });
      onSave();
      onOpenChange(false);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("editAppointment") : t("newAppointment")}
      size="lg"
    >
      <div className="space-y-4">
        {/* Patient search */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("patient")}
          </label>
          <PatientSearch value={patient} onChange={setPatient} />
        </div>

        {/* Professional */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("professional")}
          </label>
          <select
            value={professionalId}
            onChange={(e) => { setProfessionalId(e.target.value); setServiceId(""); }}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
          >
            <option value="">{t("selectProfessional")}</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Service */}
        {services.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("service")}
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="">{t("selectService")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes} min)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date + Time row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("date")}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("startTime")}
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("endTime")}
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
        </div>

        {/* Insurance plan */}
        {insurancePlans.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("insurancePlan")}
            </label>
            <select
              value={insurancePlanId}
              onChange={(e) => setInsurancePlanId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="">—</option>
              {insurancePlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Status (edit mode only) */}
        {isEdit && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("status")}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`statuses.${s}`)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cancellation reason */}
        {isEdit && status === "cancelled" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("cancellationReason")}
            </label>
            <input
              type="text"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
                {tc("delete")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? tc("loading") : tc("save")}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
