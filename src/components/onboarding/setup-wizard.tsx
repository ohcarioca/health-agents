"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WizardStepper } from "@/components/onboarding/wizard-stepper";
import { StepSlider } from "@/components/onboarding/step-slider";
import { StepClinic } from "@/components/onboarding/step-clinic";
import { StepHours } from "@/components/onboarding/step-hours";
import { StepServices } from "@/components/onboarding/step-services";
import type { ServiceItem } from "@/components/onboarding/step-services";
import { StepWhatsapp } from "@/components/onboarding/step-whatsapp";
import { StepCompletion } from "@/components/onboarding/step-completion";
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
  const searchParams = useSearchParams();

  // Navigation
  const initialStep = Number(searchParams.get("step")) || 1;
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Step 1 state — Clinic
  const [clinicName, setClinicName] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [clinicType, setClinicType] = useState("");
  const [clinicDescription, setClinicDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");

  // Step 2 state — Hours
  const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(EMPTY_SCHEDULE);

  // Step 3 state — Services
  const [services, setServices] = useState<ServiceItem[]>([]);

  // Step 4 state — Billing
  const [autoBilling, setAutoBilling] = useState(false);

  // Step 5 state — WhatsApp
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappTestResult, setWhatsappTestResult] = useState<"success" | "failed" | null>(null);
  const [whatsappTesting, setWhatsappTesting] = useState(false);

  // Completion state
  const [showCompletion, setShowCompletion] = useState(false);

  // --- Data loading ---

  // Mark onboarding as active so dashboard layout keeps showing the modal
  useEffect(() => {
    document.cookie = "onboarding_active=1; path=/; max-age=86400";
  }, []);

  useEffect(() => {
    async function loadExistingData() {
      try {
        const [clinicRes, serviceRes, billingRes] = await Promise.all([
          fetch("/api/settings/clinic"),
          fetch("/api/settings/services"),
          fetch("/api/settings/modules/billing"),
        ]);

        let autoStep = 1;

        if (clinicRes.ok) {
          const { data: clinic } = await clinicRes.json();
          if (clinic) {
            if (clinic.name) setClinicName(clinic.name);
            if (clinic.assistant_name) setAssistantName(clinic.assistant_name);
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
            if (hasClinic) autoStep = 2;
            if (autoStep >= 2 && hasHours) autoStep = 3;
          }
        }

        if (serviceRes.ok) {
          const { data: svcList } = await serviceRes.json();
          if (Array.isArray(svcList) && svcList.length > 0) {
            setServices(
              svcList.map((svc: { name: string; duration_minutes: number; price_cents: number | null; modality?: string }) => ({
                name: svc.name,
                duration_minutes: svc.duration_minutes,
                price: svc.price_cents != null && svc.price_cents > 0
                  ? (svc.price_cents / 100).toFixed(2)
                  : "",
                modality: (svc.modality ?? "both") as ServiceItem["modality"],
              }))
            );
            if (autoStep >= 3 && svcList.length > 0 && svcList.some((s: { price_cents: number | null }) => s.price_cents != null && s.price_cents > 0)) autoStep = 4;
          }
        }

        // Billing auto-step detection
        let hasBilling = false;
        if (billingRes.ok) {
          const { data: billingData } = await billingRes.json();
          if (billingData?.auto_billing) {
            setAutoBilling(true);
            hasBilling = true;
          }
        }
        if (autoStep >= 4 && hasBilling) autoStep = 5;

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

  // --- Validation ---

  const canAdvance = useCallback(() => {
    switch (step) {
      case 1:
        return clinicName.trim().length >= 2 && phone.trim().length > 0;
      case 2:
        return true;
      case 3: // Services
        return (
          services.length > 0 &&
          services.every((s) => parseFloat(s.price || "0") > 0)
        );
      case 4: // Billing
        return true;
      case 5: // WhatsApp
        return (
          whatsappPhoneNumberId.trim().length > 0 &&
          whatsappWabaId.trim().length > 0 &&
          whatsappAccessToken.trim().length > 0
        );
      default:
        return false;
    }
  }, [step, clinicName, phone, services, whatsappPhoneNumberId, whatsappWabaId, whatsappAccessToken]);

  // --- Save functions ---

  async function saveStep1(): Promise<boolean> {
    const res = await fetch("/api/settings/clinic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clinicName.trim(),
        assistant_name: assistantName.trim() || "",
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
    for (const svc of services) {
      const priceCents = Math.round(parseFloat(svc.price || "0") * 100);
      const res = await fetch("/api/settings/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: svc.name,
          duration_minutes: svc.duration_minutes,
          price_cents: priceCents,
          modality: svc.modality ?? "both",
        }),
      });
      if (!res.ok) continue;
    }
    return true;
  }

  async function saveStepBilling(): Promise<boolean> {
    const res = await fetch("/api/settings/modules/billing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_billing: autoBilling }),
    });
    return res.ok;
  }

  async function saveStep5(): Promise<boolean> {
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
          saved = await saveStepBilling();
          break;
        case 5:
          saved = await saveStep5();
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
    if (!canAdvance()) return;
    setLoading(true);
    try {
      // Save the last step before showing completion
      switch (step) {
        case 5:
          await saveStep5();
          break;
      }
    } catch (err) {
      console.error("[setup] save error:", err);
    } finally {
      setLoading(false);
    }
    setShowCompletion(true);
  }

  // --- Labels for stepper ---

  const stepLabels = [
    t("step1.title"),           // 1: Clinic
    t("stepHours.title"),       // 2: Hours
    t("stepServices.title"),    // 3: Services
    t("stepBilling.title"),     // 4: Billing
    t("step3.title"),           // 5: WhatsApp
  ];

  // --- Render ---

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (showCompletion) {
    return <StepCompletion />;
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <StepClinic
            clinicName={clinicName}
            onClinicNameChange={setClinicName}
            assistantName={assistantName}
            onAssistantNameChange={setAssistantName}
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
          <StepServices
            clinicType={clinicType}
            services={services}
            onServicesChange={setServices}
          />
        );
      case 4:
        return (
          <StepBilling
            autoBilling={autoBilling}
            setAutoBilling={setAutoBilling}
            t={t}
          />
        );
      case 5:
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

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StepSlider stepKey={step}>
            {renderStep()}
          </StepSlider>
        </div>

        <div className="mt-5 flex shrink-0 items-center justify-between">
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

// --- Billing Step Component ---

function StepBilling({
  autoBilling,
  setAutoBilling,
  t,
}: {
  autoBilling: boolean;
  setAutoBilling: (v: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t("stepBilling.subtitle")}</h3>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-1">
          <p className="font-medium">{t("stepBilling.toggleLabel")}</p>
          <p className="text-sm text-muted-foreground">
            {t("stepBilling.toggleDescription")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoBilling}
          onClick={() => setAutoBilling(!autoBilling)}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
          style={{
            backgroundColor: autoBilling
              ? "var(--text-muted)"
              : "var(--surface-elevated)",
          }}
        >
          <span
            className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
              autoBilling ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {autoBilling
          ? t("stepBilling.enabledInfo")
          : t("stepBilling.disabledInfo")}
      </p>
    </div>
  );
}
