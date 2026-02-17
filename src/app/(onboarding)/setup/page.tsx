"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CompactScheduleGrid } from "@/components/settings/compact-schedule-grid";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { PatientImportDialog } from "@/components/patients/patient-import-dialog";
import { Upload, UserPlus, X, Check, Circle, CalendarDays } from "lucide-react";
import type { ScheduleGrid } from "@/lib/validations/settings";

const TOTAL_STEPS = 5;

const EMPTY_SCHEDULE: ScheduleGrid = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

interface RequirementsStatus {
  is_active: boolean;
  requirements: {
    operating_hours: boolean;
    professional_schedule: boolean;
    service_with_price: boolean;
    whatsapp: boolean;
    google_calendar: boolean;
  };
}

const REQUIREMENT_KEYS = [
  "operating_hours",
  "professional_schedule",
  "service_with_price",
  "whatsapp",
  "google_calendar",
] as const;

export default function SetupPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Navigation
  const initialStep = Number(searchParams.get("step")) || 1;
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Step 1: Clinic + Operating Hours
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(EMPTY_SCHEDULE);

  // Step 2: Professional + Schedule + Service
  const [profName, setProfName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [duration, setDuration] = useState(30);
  const [profSchedule, setProfSchedule] = useState<ScheduleGrid>(EMPTY_SCHEDULE);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState(30);
  const [servicePrice, setServicePrice] = useState("");
  const [createdProfId, setCreatedProfId] = useState<string | null>(null);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);

  // Step 3: WhatsApp
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappTestResult, setWhatsappTestResult] = useState<"success" | "failed" | null>(null);
  const [whatsappTesting, setWhatsappTesting] = useState(false);

  // Step 4: Google Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Step 5: Patients + Requirements
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [addedPatients, setAddedPatients] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [requirements, setRequirements] = useState<RequirementsStatus | null>(null);

  // Resume: load existing data on mount
  useEffect(() => {
    async function loadExistingData() {
      try {
        const [clinicRes, profRes, serviceRes] = await Promise.all([
          fetch("/api/settings/clinic"),
          fetch("/api/settings/professionals"),
          fetch("/api/settings/services"),
        ]);

        if (clinicRes.ok) {
          const { data: clinic } = await clinicRes.json();
          if (clinic) {
            if (clinic.name) setClinicName(clinic.name);
            if (clinic.phone) setPhone(clinic.phone);
            if (clinic.address) setAddress(clinic.address);
            if (clinic.timezone) setTimezone(clinic.timezone);
            if (clinic.operating_hours) setOperatingHours(clinic.operating_hours);
            if (clinic.whatsapp_phone_number_id) setWhatsappPhoneNumberId(clinic.whatsapp_phone_number_id);
            if (clinic.whatsapp_waba_id) setWhatsappWabaId(clinic.whatsapp_waba_id);
            if (clinic.whatsapp_access_token) setWhatsappAccessToken(clinic.whatsapp_access_token);
          }
        }

        if (profRes.ok) {
          const { data: professionals } = await profRes.json();
          if (Array.isArray(professionals) && professionals.length > 0) {
            const prof = professionals[0];
            setCreatedProfId(prof.id);
            if (prof.name) setProfName(prof.name);
            if (prof.specialty) setSpecialty(prof.specialty);
            if (prof.appointment_duration_minutes) setDuration(prof.appointment_duration_minutes);
            if (prof.schedule_grid) setProfSchedule(prof.schedule_grid);
            if (prof.google_calendar_id) setCalendarConnected(true);
          }
        }

        if (serviceRes.ok) {
          const { data: services } = await serviceRes.json();
          if (Array.isArray(services) && services.length > 0) {
            const svc = services[0];
            setCreatedServiceId(svc.id);
            if (svc.name) setServiceName(svc.name);
            if (svc.duration_minutes) setServiceDuration(svc.duration_minutes);
            if (svc.price_cents != null && svc.price_cents > 0) {
              setServicePrice((svc.price_cents / 100).toFixed(2));
            }
          }
        }
      } catch (err) {
        console.error("[setup] failed to load existing data:", err);
      } finally {
        setInitialLoading(false);
      }
    }

    loadExistingData();
  }, []);

  // Detect calendar callback
  useEffect(() => {
    if (searchParams.get("success") === "calendar_connected") {
      setCalendarConnected(true);
    }
  }, [searchParams]);

  // canAdvance logic per step
  const canAdvance = useCallback(() => {
    switch (step) {
      case 1:
        return clinicName.trim().length >= 2 && phone.trim().length > 0;
      case 2:
        return (
          profName.trim().length >= 2 &&
          serviceName.trim().length >= 2 &&
          parseFloat(servicePrice || "0") > 0
        );
      case 3:
        return (
          whatsappPhoneNumberId.trim().length > 0 &&
          whatsappWabaId.trim().length > 0 &&
          whatsappAccessToken.trim().length > 0
        );
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  }, [step, clinicName, phone, profName, serviceName, servicePrice, whatsappPhoneNumberId, whatsappWabaId, whatsappAccessToken]);

  // Save Step 1: Clinic + Operating Hours
  async function saveStep1(): Promise<boolean> {
    const res = await fetch("/api/settings/clinic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clinicName.trim(),
        phone: phone.trim(),
        address: address.trim() || "",
        timezone,
        operating_hours: operatingHours,
      }),
    });
    return res.ok;
  }

  // Save Step 2: Professional + Schedule + Service + Link
  async function saveStep2(): Promise<boolean> {
    // Create or update professional
    const profPayload = {
      name: profName.trim(),
      specialty: specialty.trim() || "",
      appointment_duration_minutes: duration,
      schedule_grid: profSchedule,
    };

    let profId = createdProfId;

    if (profId) {
      const res = await fetch(`/api/settings/professionals/${profId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profPayload),
      });
      if (!res.ok) return false;
    } else {
      const res = await fetch("/api/settings/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profPayload),
      });
      if (!res.ok) return false;
      const { data } = await res.json();
      profId = data.id;
      setCreatedProfId(profId);
    }

    // Create or update service
    const priceCents = Math.round(parseFloat(servicePrice || "0") * 100);
    const svcPayload = {
      name: serviceName.trim(),
      duration_minutes: serviceDuration,
      price_cents: priceCents,
    };

    let svcId = createdServiceId;

    if (svcId) {
      const res = await fetch(`/api/settings/services/${svcId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(svcPayload),
      });
      if (!res.ok) return false;
    } else {
      const res = await fetch("/api/settings/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(svcPayload),
      });
      if (!res.ok) return false;
      const { data } = await res.json();
      svcId = data.id;
      setCreatedServiceId(svcId);
    }

    // Link professional to service
    if (profId && svcId) {
      const linkRes = await fetch(`/api/settings/professionals/${profId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: [{ service_id: svcId, price_cents: priceCents }],
        }),
      });
      if (!linkRes.ok) return false;
    }

    return true;
  }

  // Save Step 3: WhatsApp credentials
  async function saveStep3(): Promise<boolean> {
    const res = await fetch("/api/settings/clinic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clinicName.trim(),
        whatsapp_phone_number_id: whatsappPhoneNumberId.trim(),
        whatsapp_waba_id: whatsappWabaId.trim(),
        whatsapp_access_token: whatsappAccessToken.trim(),
      }),
    });
    return res.ok;
  }

  // Test WhatsApp connection
  async function testWhatsapp() {
    setWhatsappTesting(true);
    setWhatsappTestResult(null);
    try {
      const res = await fetch("/api/integrations/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: whatsappPhoneNumberId.trim(),
          access_token: whatsappAccessToken.trim(),
        }),
      });
      setWhatsappTestResult(res.ok ? "success" : "failed");
    } catch {
      setWhatsappTestResult("failed");
    } finally {
      setWhatsappTesting(false);
    }
  }

  // Connect Google Calendar
  async function connectGoogleCalendar() {
    if (!createdProfId) return;
    setCalendarLoading(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_id: createdProfId,
          return_to: "/setup?step=4",
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
      }
    } catch (err) {
      console.error("[setup] google calendar connect error:", err);
    } finally {
      setCalendarLoading(false);
    }
  }

  // Fetch requirements for step 5
  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/status");
      if (res.ok) {
        const { data } = await res.json();
        setRequirements(data);
      }
    } catch (err) {
      console.error("[setup] failed to fetch requirements:", err);
    }
  }, []);

  // Load requirements when entering step 5
  useEffect(() => {
    if (step === 5) {
      fetchRequirements();
    }
  }, [step, fetchRequirements]);

  // Handle next step with per-step save
  async function handleNext() {
    if (!canAdvance()) return;
    setLoading(true);

    try {
      let saved = true;
      switch (step) {
        case 1:
          saved = await saveStep1();
          break;
        case 2:
          saved = await saveStep2();
          break;
        case 3:
          saved = await saveStep3();
          break;
        case 4:
          // No save needed — calendar is optional
          break;
      }

      if (saved && step < TOTAL_STEPS) {
        setStep(step + 1);
      }
    } catch (err) {
      console.error("[setup] save error:", err);
    } finally {
      setLoading(false);
    }
  }

  function prevStep() {
    if (step > 1) setStep(step - 1);
  }

  // Handle finish
  async function handleFinish() {
    setLoading(true);
    try {
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("[setup] finish error:", err);
      setLoading(false);
    }
  }

  // Patient handlers
  async function handlePatientAdded() {
    try {
      const res = await fetch("/api/patients?page=1");
      if (res.ok) {
        const json = await res.json();
        setAddedPatients(
          (json.data ?? []).slice(0, 10).map((p: { id: string; name: string; phone: string }) => ({
            id: p.id,
            name: p.name,
            phone: p.phone,
          }))
        );
      }
    } catch {
      // silent fail
    }
    setAddDialogOpen(false);
  }

  function handleImportDone() {
    handlePatientAdded();
    setImportDialogOpen(false);
  }

  async function removePatient(id: string) {
    const res = await fetch(`/api/patients/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAddedPatients((prev) => prev.filter((p) => p.id !== id));
    }
  }

  const stepTitles = [
    t("step1.title"),
    t("step2.title"),
    t("step3.title"),
    t("step4.title"),
    t("step5.title"),
  ];

  // Initial loading state
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {stepTitles[step - 1]}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {step}/{TOTAL_STEPS}
          </span>
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <div
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: "var(--accent)",
              width: `${(step / TOTAL_STEPS) * 100}%`,
            }}
          />
        </div>
      </div>

      <Card variant="glass">
        {/* Step 1: Clinic + Operating Hours */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step1.description")}
            </p>
            <Input
              id="clinicName"
              label={t("step1.clinicName")}
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              required
            />
            <Input
              id="phone"
              label={t("step1.phone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Input
              id="address"
              label={t("step1.address")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Input
              id="timezone"
              label={t("step1.timezone")}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />

            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {t("step1.operatingHours")}
              </label>
              <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {t("step1.operatingHoursHint")}
              </p>
              <CompactScheduleGrid value={operatingHours} onChange={setOperatingHours} />
            </div>
          </div>
        )}

        {/* Step 2: Professional + Schedule + Service */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step2.description")}
            </p>

            {/* Professional section */}
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("step2.profSection")}
            </h3>
            <Input
              id="profName"
              label={t("step2.name")}
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
              required
            />
            <Input
              id="specialty"
              label={t("step2.specialty")}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
            <Input
              id="duration"
              label={t("step2.duration")}
              type="number"
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
            />

            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {t("step2.schedule")}
              </label>
              <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {t("step2.scheduleHint")}
              </p>
              <CompactScheduleGrid value={profSchedule} onChange={setProfSchedule} />
            </div>

            {/* Service section */}
            <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("step2.serviceSection")}
              </h3>
              <Input
                id="serviceName"
                label={t("step2.serviceName")}
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                required
              />
              <Input
                id="serviceDuration"
                label={t("step2.serviceDuration")}
                type="number"
                min={5}
                max={480}
                value={serviceDuration}
                onChange={(e) => setServiceDuration(Number(e.target.value) || 30)}
              />
              <div>
                <Input
                  id="servicePrice"
                  label={t("step2.servicePrice")}
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  placeholder="150.00"
                  required
                />
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("step2.servicePriceHint")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: WhatsApp */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step3.description")}
            </p>
            <Input
              id="whatsappPhoneNumberId"
              label={t("step3.phoneNumberId")}
              value={whatsappPhoneNumberId}
              onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
              required
            />
            <Input
              id="whatsappWabaId"
              label={t("step3.wabaId")}
              value={whatsappWabaId}
              onChange={(e) => setWhatsappWabaId(e.target.value)}
              required
            />
            <Input
              id="whatsappAccessToken"
              label={t("step3.accessToken")}
              type="password"
              value={whatsappAccessToken}
              onChange={(e) => setWhatsappAccessToken(e.target.value)}
              required
            />

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={testWhatsapp}
                disabled={
                  whatsappTesting ||
                  !whatsappPhoneNumberId.trim() ||
                  !whatsappAccessToken.trim()
                }
              >
                {whatsappTesting ? t("step3.testLoading") : t("step3.testConnection")}
              </Button>
              {whatsappTestResult === "success" && (
                <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
                  {t("step3.testSuccess")}
                </span>
              )}
              {whatsappTestResult === "failed" && (
                <span className="text-xs font-medium" style={{ color: "var(--danger)" }}>
                  {t("step3.testFailed")}
                </span>
              )}
            </div>

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step3.helpText")}
            </p>
          </div>
        )}

        {/* Step 4: Google Calendar */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step4.description")}
            </p>

            {createdProfId && profName && (
              <div
                className="flex items-center justify-between rounded-lg border px-4 py-3"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className="size-5" style={{ color: "var(--accent)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {profName}
                    </p>
                    {specialty && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {specialty}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant={calendarConnected ? "success" : "neutral"}>
                  {calendarConnected ? t("step4.connected") : t("step4.notConnected")}
                </Badge>
              </div>
            )}

            {!calendarConnected && createdProfId && (
              <Button
                variant="outline"
                onClick={connectGoogleCalendar}
                disabled={calendarLoading}
              >
                {calendarLoading ? t("step4.waitingCallback") : t("step4.connect")}
              </Button>
            )}

            {!createdProfId && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("step2.description")}
              </p>
            )}
          </div>
        )}

        {/* Step 5: Patients + Requirements Checklist */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step5.description")}
            </p>

            {/* Patients section */}
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("step5.patientsSection")}
            </h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step5.patientsOptional")}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setImportDialogOpen(true)}
                className="flex flex-col items-center gap-2 rounded-xl border p-6 transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <Upload className="size-8" style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {t("step5.importCard")}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("step5.importCardHint")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAddDialogOpen(true)}
                className="flex flex-col items-center gap-2 rounded-xl border p-6 transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <UserPlus className="size-8" style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {t("step5.addCard")}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("step5.addCardHint")}
                </span>
              </button>
            </div>

            {/* Mini list of added patients */}
            {addedPatients.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("step5.addedCount", { count: addedPatients.length })}
                </p>
                <div className="space-y-1">
                  {addedPatients.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                      style={{ backgroundColor: "var(--surface)" }}
                    >
                      <span style={{ color: "var(--text-primary)" }}>
                        {p.name} — <span style={{ color: "var(--text-muted)" }}>{p.phone}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removePatient(p.id)}
                        className="rounded p-1 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requirements checklist */}
            <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("step5.checklistSection")}
              </h3>

              {requirements ? (
                <>
                  <div className="space-y-2">
                    {REQUIREMENT_KEYS.map((key) => {
                      const met = requirements.requirements[key];
                      return (
                        <div key={key} className="flex items-center gap-2">
                          {met ? (
                            <Check className="size-4" style={{ color: "var(--success)" }} />
                          ) : (
                            <Circle className="size-4" style={{ color: "var(--text-muted)" }} />
                          )}
                          <span
                            className="text-sm"
                            style={{ color: met ? "var(--text-primary)" : "var(--text-muted)" }}
                          >
                            {t(`step5.requirement.${key}`)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {REQUIREMENT_KEYS.every((k) => requirements.requirements[k]) ? (
                    <p className="text-xs font-medium" style={{ color: "var(--success)" }}>
                      {t("step5.allMet")}
                    </p>
                  ) : (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {REQUIREMENT_KEYS.filter((k) => !requirements.requirements[k]).length}{" "}
                      {t("step5.pending")}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex justify-center py-2">
                  <Spinner size="sm" />
                </div>
              )}
            </div>

            {/* Dialogs */}
            <PatientFormDialog
              open={addDialogOpen}
              onOpenChange={setAddDialogOpen}
              onSuccess={handlePatientAdded}
            />
            <PatientImportDialog
              open={importDialogOpen}
              onOpenChange={setImportDialogOpen}
              onSuccess={handleImportDone}
            />
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={step === 1}
          >
            {t("back")}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={handleNext} disabled={loading || !canAdvance()}>
              {loading ? <Spinner size="sm" /> : t("next")}
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={loading}>
              {loading ? t("finishing") : t("finish")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
