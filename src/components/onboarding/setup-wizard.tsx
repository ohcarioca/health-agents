"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WizardStepper } from "@/components/onboarding/wizard-stepper";
import { StepSlider } from "@/components/onboarding/step-slider";
import { StepClinic } from "@/components/onboarding/step-clinic";
import { StepHours } from "@/components/onboarding/step-hours";
import { StepProfessional } from "@/components/onboarding/step-professional";
import type { ServiceItem } from "@/components/onboarding/step-professional";
import { StepWhatsapp } from "@/components/onboarding/step-whatsapp";
import { StepCalendar } from "@/components/onboarding/step-calendar";
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

export function SetupWizard() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Navigation
  const initialStep = Number(searchParams.get("step")) || 1;
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Step 1 state — Clinic
  const [clinicName, setClinicName] = useState("");
  const [clinicType, setClinicType] = useState("");
  const [clinicDescription, setClinicDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");

  // Step 2 state — Hours
  const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(EMPTY_SCHEDULE);

  // Step 3 state — Professional + Services
  const [profName, setProfName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [duration, setDuration] = useState(30);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [createdProfId, setCreatedProfId] = useState<string | null>(null);

  // Step 4 state — WhatsApp
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappTestResult, setWhatsappTestResult] = useState<"success" | "failed" | null>(null);
  const [whatsappTesting, setWhatsappTesting] = useState(false);

  // Step 5 state — Google Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // --- Data loading ---

  // Mark onboarding as active so dashboard layout keeps showing the modal
  useEffect(() => {
    document.cookie = "onboarding_active=1; path=/; max-age=86400";
  }, []);

  useEffect(() => {
    async function loadExistingData() {
      try {
        const [clinicRes, profRes, serviceRes] = await Promise.all([
          fetch("/api/settings/clinic"),
          fetch("/api/settings/professionals"),
          fetch("/api/settings/services"),
        ]);

        let autoStep = 1;
        let hasWhatsApp = false;

        if (clinicRes.ok) {
          const { data: clinic } = await clinicRes.json();
          if (clinic) {
            if (clinic.name) setClinicName(clinic.name);
            if (clinic.type) setClinicType(clinic.type);
            if (clinic.description) setClinicDescription(clinic.description);
            if (clinic.phone) setPhone(clinic.phone);
            if (clinic.address) setAddress(clinic.address);
            if (clinic.timezone) setTimezone(clinic.timezone);
            if (clinic.operating_hours) setOperatingHours(clinic.operating_hours);
            if (clinic.whatsapp_phone_number_id) setWhatsappPhoneNumberId(clinic.whatsapp_phone_number_id);
            if (clinic.whatsapp_waba_id) setWhatsappWabaId(clinic.whatsapp_waba_id);
            if (clinic.whatsapp_access_token) setWhatsappAccessToken(clinic.whatsapp_access_token);

            // Auto-step detection
            const hasClinic = clinic.name?.trim().length >= 2 && clinic.phone?.trim().length > 0;
            const hasHours = clinic.operating_hours &&
              Object.values(clinic.operating_hours as Record<string, unknown>).some(
                (day) => Array.isArray(day) && day.length > 0
              );
            hasWhatsApp = Boolean(
              clinic.whatsapp_phone_number_id &&
              clinic.whatsapp_waba_id &&
              clinic.whatsapp_access_token
            );

            if (hasClinic) autoStep = 2;
            if (autoStep >= 2 && hasHours) autoStep = 3;
          }
        }

        let hasProfessional = false;

        if (profRes.ok) {
          const { data: professionals } = await profRes.json();
          if (Array.isArray(professionals) && professionals.length > 0) {
            const prof = professionals[0];
            setCreatedProfId(prof.id);
            if (prof.name) setProfName(prof.name);
            if (prof.specialty) setSpecialty(prof.specialty);
            if (prof.appointment_duration_minutes) setDuration(prof.appointment_duration_minutes);
            if (prof.google_calendar_id) setCalendarConnected(true);
            hasProfessional = prof.name?.trim().length >= 2;
          }
        }

        if (serviceRes.ok) {
          const { data: svcList } = await serviceRes.json();
          if (Array.isArray(svcList) && svcList.length > 0) {
            setServices(
              svcList.map((svc: { name: string; duration_minutes: number; price_cents: number | null }) => ({
                name: svc.name,
                duration_minutes: svc.duration_minutes,
                price: svc.price_cents != null && svc.price_cents > 0
                  ? (svc.price_cents / 100).toFixed(2)
                  : "",
              }))
            );
            if (autoStep >= 3 && hasProfessional && svcList.length > 0) autoStep = 4;
            if (autoStep >= 4 && hasWhatsApp) autoStep = 5;
          }
        }

        // Use auto-detected step when no explicit step param is set
        if (!searchParams.get("step") && autoStep > 1) {
          setStep(autoStep);
        }
      } catch (err) {
        console.error("[setup] failed to load existing data:", err);
      } finally {
        setInitialLoading(false);
      }
    }

    loadExistingData();
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("success") === "calendar_connected") {
      setCalendarConnected(true);
    }
  }, [searchParams]);

  // --- Validation ---

  const canAdvance = useCallback(() => {
    switch (step) {
      case 1:
        return clinicName.trim().length >= 2 && phone.trim().length > 0;
      case 2:
        return true;
      case 3:
        return (
          profName.trim().length >= 2 &&
          services.length > 0 &&
          services.every((s) => parseFloat(s.price || "0") > 0)
        );
      case 4:
        return (
          whatsappPhoneNumberId.trim().length > 0 &&
          whatsappWabaId.trim().length > 0 &&
          whatsappAccessToken.trim().length > 0
        );
      case 5:
        return true;
      default:
        return false;
    }
  }, [step, clinicName, phone, profName, services, whatsappPhoneNumberId, whatsappWabaId, whatsappAccessToken]);

  // --- Save functions ---

  async function saveStep1(): Promise<boolean> {
    const res = await fetch("/api/settings/clinic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clinicName.trim(),
        type: clinicType || "",
        description: clinicDescription || "",
        phone: phone.trim(),
        address: address.trim() || "",
        timezone,
      }),
    });
    return res.ok;
  }

  async function saveStep2(): Promise<boolean> {
    const res = await fetch("/api/settings/clinic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clinicName.trim(),
        operating_hours: operatingHours,
      }),
    });
    return res.ok;
  }

  async function saveStep3(): Promise<boolean> {
    const profPayload = {
      name: profName.trim(),
      specialty: specialty.trim() || "",
      appointment_duration_minutes: duration,
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

    const createdServiceIds: Array<{ service_id: string; price_cents: number }> = [];

    for (const svc of services) {
      const priceCents = Math.round(parseFloat(svc.price || "0") * 100);
      const svcRes = await fetch("/api/settings/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: svc.name,
          duration_minutes: svc.duration_minutes,
          price_cents: priceCents,
        }),
      });
      if (!svcRes.ok) continue;
      const { data: svcData } = await svcRes.json();
      createdServiceIds.push({ service_id: svcData.id, price_cents: priceCents });
    }

    if (profId && createdServiceIds.length > 0) {
      const linkRes = await fetch(`/api/settings/professionals/${profId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: createdServiceIds }),
      });
      if (!linkRes.ok) return false;
    }

    return true;
  }

  async function saveStep4(): Promise<boolean> {
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

  // --- Action handlers ---

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

  async function connectGoogleCalendar() {
    if (!createdProfId) return;
    setCalendarLoading(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_id: createdProfId,
          return_to: "/",
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

  // --- Navigation ---

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
          saved = await saveStep4();
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

  async function handleFinish() {
    setLoading(true);
    try {
      // Clear onboarding cookie so the modal stops showing
      document.cookie = "onboarding_active=; path=/; max-age=0";
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("[setup] finish error:", err);
      setLoading(false);
    }
  }

  // --- Labels for stepper ---

  const stepLabels = [
    t("step1.title"),
    t("stepHours.title"),
    t("step2.title"),
    t("step3.title"),
    t("step4.title"),
  ];

  // --- Render ---

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <StepClinic
            clinicName={clinicName}
            onClinicNameChange={setClinicName}
            clinicType={clinicType}
            onClinicTypeChange={setClinicType}
            clinicDescription={clinicDescription}
            onClinicDescriptionChange={setClinicDescription}
            phone={phone}
            onPhoneChange={setPhone}
            address={address}
            onAddressChange={setAddress}
          />
        );
      case 2:
        return (
          <StepHours
            operatingHours={operatingHours}
            onOperatingHoursChange={setOperatingHours}
          />
        );
      case 3:
        return (
          <StepProfessional
            profName={profName}
            onProfNameChange={setProfName}
            specialty={specialty}
            onSpecialtyChange={setSpecialty}
            duration={duration}
            onDurationChange={setDuration}
            clinicType={clinicType}
            services={services}
            onServicesChange={setServices}
          />
        );
      case 4:
        return (
          <StepWhatsapp
            phoneNumberId={whatsappPhoneNumberId}
            onPhoneNumberIdChange={setWhatsappPhoneNumberId}
            wabaId={whatsappWabaId}
            onWabaIdChange={setWhatsappWabaId}
            accessToken={whatsappAccessToken}
            onAccessTokenChange={setWhatsappAccessToken}
            testResult={whatsappTestResult}
            testing={whatsappTesting}
            onTest={testWhatsapp}
          />
        );
      case 5:
        return (
          <StepCalendar
            profName={profName}
            specialty={specialty}
            hasProfessional={!!createdProfId}
            calendarConnected={calendarConnected}
            calendarLoading={calendarLoading}
            onConnect={connectGoogleCalendar}
          />
        );
      default:
        return null;
    }
  }

  return (
    <>
      <WizardStepper
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        labels={stepLabels}
      />

      <div className="mt-3">
        <StepSlider stepKey={step}>
          {renderStep()}
        </StepSlider>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" onClick={prevStep} disabled={step === 1}>
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
      </div>
    </>
  );
}
