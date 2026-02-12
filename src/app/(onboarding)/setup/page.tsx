"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const TOTAL_STEPS = 5;

export default function SetupPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Clinic data
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Step 2: Professionals
  const [profName, setProfName] = useState("");
  const [specialty, setSpecialty] = useState("");

  function nextStep() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function prevStep() {
    if (step > 1) setStep(step - 1);
  }

  async function handleComplete() {
    setLoading(true);
    // Save clinic data via Supabase client
    const supabase = createClient();

    // Update clinic if we have data
    if (clinicName) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from("clinic_users")
          .select("clinic_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (membership) {
          await supabase
            .from("clinics")
            .update({ name: clinicName, phone, address })
            .eq("id", membership.clinic_id);

          // Add professional if entered
          if (profName) {
            await supabase.from("professionals").insert({
              clinic_id: membership.clinic_id,
              name: profName,
              specialty: specialty || null,
            });
          }
        }
      }
    }

    router.push("/");
    router.refresh();
  }

  const stepTitles = [
    t("step1.title"),
    t("step2.title"),
    t("step3.title"),
    t("step4.title"),
    t("step5.title"),
  ];

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
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

      <Card>
        {/* Step 1: Clinic Data */}
        {step === 1 && (
          <div className="space-y-4">
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
            />
            <Input
              id="address"
              label={t("step1.address")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}

        {/* Step 2: Professionals */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step2.description")}
            </p>
            <Input
              id="profName"
              label={t("step2.name")}
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
            />
            <Input
              id="specialty"
              label={t("step2.specialty")}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
          </div>
        )}

        {/* Step 3: Patients */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step3.description")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step3.skipHint")}
            </p>
          </div>
        )}

        {/* Step 4: WhatsApp */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step4.description")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step4.comingSoon")}
            </p>
          </div>
        )}

        {/* Step 5: Modules */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step5.description")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step5.allEnabled")}
            </p>
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
            <Button onClick={nextStep}>{t("next")}</Button>
          ) : (
            <Button onClick={handleComplete} disabled={loading}>
              {loading ? t("finishing") : t("finish")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
