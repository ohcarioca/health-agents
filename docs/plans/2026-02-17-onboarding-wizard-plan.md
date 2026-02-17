# Onboarding Wizard Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the 5-step onboarding wizard with Framer Motion slide animations, a numbered-circle progress indicator, and modular component architecture.

**Architecture:** Extract the monolithic 877-line `setup/page.tsx` into 7 focused components. The page remains the state owner and orchestrator. A `WizardStepper` renders the progress indicator. A `StepSlider` wraps each step in directional Framer Motion transitions. Five `step-*.tsx` files receive state via props and report changes via callbacks.

**Tech Stack:** React 19, Framer Motion, Tailwind CSS v4, next-intl, lucide-react

---

### Task 1: Install Framer Motion

**Step 1: Install the dependency**

Run: `npm install framer-motion`

**Step 2: Verify installation**

Run: `npm ls framer-motion`
Expected: `framer-motion@` version displayed, no errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add framer-motion dependency"
```

---

### Task 2: Create WizardStepper Component

**Files:**
- Create: `src/components/onboarding/wizard-stepper.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { Check } from "lucide-react";

interface WizardStepperProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export function WizardStepper({ currentStep, totalSteps, labels }: WizardStepperProps) {
  return (
    <div className="mb-8 px-2">
      <div className="flex items-center">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={stepNum} className="flex flex-1 items-center last:flex-none">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex size-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : isActive
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border-strong)] text-[var(--text-muted)]"
                  }`}
                  style={
                    isActive
                      ? { boxShadow: "0 0 0 4px var(--accent-muted)" }
                      : undefined
                  }
                >
                  {isCompleted ? <Check className="size-5" strokeWidth={2.5} /> : stepNum}
                </div>
                {/* Label — hidden on small screens */}
                <span
                  className="mt-2 hidden text-center text-xs font-medium sm:block"
                  style={{
                    color: isActive
                      ? "var(--text-primary)"
                      : isCompleted
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    maxWidth: "5rem",
                  }}
                >
                  {labels[i]}
                </span>
              </div>

              {/* Connecting line (not after last step) */}
              {stepNum < totalSteps && (
                <div className="mx-2 h-0.5 flex-1 rounded-full transition-colors duration-500"
                  style={{
                    backgroundColor: isCompleted
                      ? "var(--accent)"
                      : "var(--border-strong)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/wizard-stepper.tsx
git commit -m "feat: add WizardStepper progress indicator component"
```

---

### Task 3: Create StepSlider Component

**Files:**
- Create: `src/components/onboarding/step-slider.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface StepSliderProps {
  stepKey: number;
  children: ReactNode;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

const transition = {
  x: { type: "spring" as const, stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

export function StepSlider({ stepKey, children }: StepSliderProps) {
  const prevStep = useRef(stepKey);
  const [direction, setDirection] = useState(1);

  if (stepKey !== prevStep.current) {
    setDirection(stepKey > prevStep.current ? 1 : -1);
    prevStep.current = stepKey;
  }

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={stepKey}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/step-slider.tsx
git commit -m "feat: add StepSlider with Framer Motion directional transitions"
```

---

### Task 4: Extract StepClinic Component

**Files:**
- Create: `src/components/onboarding/step-clinic.tsx`

Extract Step 1 JSX (lines 482-524 of current `page.tsx`) into a standalone component.

**Step 1: Create the component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { CompactScheduleGrid } from "@/components/settings/compact-schedule-grid";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface StepClinicProps {
  clinicName: string;
  onClinicNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  address: string;
  onAddressChange: (value: string) => void;
  timezone: string;
  onTimezoneChange: (value: string) => void;
  operatingHours: ScheduleGrid;
  onOperatingHoursChange: (value: ScheduleGrid) => void;
}

export function StepClinic({
  clinicName,
  onClinicNameChange,
  phone,
  onPhoneChange,
  address,
  onAddressChange,
  timezone,
  onTimezoneChange,
  operatingHours,
  onOperatingHoursChange,
}: StepClinicProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step1.description")}
      </p>
      <Input
        id="clinicName"
        label={t("step1.clinicName")}
        value={clinicName}
        onChange={(e) => onClinicNameChange(e.target.value)}
        required
      />
      <Input
        id="phone"
        label={t("step1.phone")}
        value={phone}
        onChange={(e) => onPhoneChange(e.target.value)}
        required
      />
      <Input
        id="address"
        label={t("step1.address")}
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
      />
      <Input
        id="timezone"
        label={t("step1.timezone")}
        value={timezone}
        onChange={(e) => onTimezoneChange(e.target.value)}
      />
      <div>
        <label
          className="mb-2 block text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("step1.operatingHours")}
        </label>
        <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {t("step1.operatingHoursHint")}
        </p>
        <CompactScheduleGrid value={operatingHours} onChange={onOperatingHoursChange} />
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/step-clinic.tsx
git commit -m "feat: extract StepClinic onboarding component"
```

---

### Task 5: Extract StepProfessional Component

**Files:**
- Create: `src/components/onboarding/step-professional.tsx`

Extract Step 2 JSX (lines 527-606 of current `page.tsx`).

**Step 1: Create the component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { CompactScheduleGrid } from "@/components/settings/compact-schedule-grid";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface StepProfessionalProps {
  profName: string;
  onProfNameChange: (value: string) => void;
  specialty: string;
  onSpecialtyChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  profSchedule: ScheduleGrid;
  onProfScheduleChange: (value: ScheduleGrid) => void;
  serviceName: string;
  onServiceNameChange: (value: string) => void;
  serviceDuration: number;
  onServiceDurationChange: (value: number) => void;
  servicePrice: string;
  onServicePriceChange: (value: string) => void;
}

export function StepProfessional({
  profName,
  onProfNameChange,
  specialty,
  onSpecialtyChange,
  duration,
  onDurationChange,
  profSchedule,
  onProfScheduleChange,
  serviceName,
  onServiceNameChange,
  serviceDuration,
  onServiceDurationChange,
  servicePrice,
  onServicePriceChange,
}: StepProfessionalProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step2.description")}
      </p>

      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {t("step2.profSection")}
      </h3>
      <Input
        id="profName"
        label={t("step2.name")}
        value={profName}
        onChange={(e) => onProfNameChange(e.target.value)}
        required
      />
      <Input
        id="specialty"
        label={t("step2.specialty")}
        value={specialty}
        onChange={(e) => onSpecialtyChange(e.target.value)}
      />
      <Input
        id="duration"
        label={t("step2.duration")}
        type="number"
        min={5}
        max={480}
        value={duration}
        onChange={(e) => onDurationChange(Number(e.target.value) || 30)}
      />

      <div>
        <label
          className="mb-2 block text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("step2.schedule")}
        </label>
        <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {t("step2.scheduleHint")}
        </p>
        <CompactScheduleGrid value={profSchedule} onChange={onProfScheduleChange} />
      </div>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("step2.serviceSection")}
        </h3>
        <Input
          id="serviceName"
          label={t("step2.serviceName")}
          value={serviceName}
          onChange={(e) => onServiceNameChange(e.target.value)}
          required
        />
        <Input
          id="serviceDuration"
          label={t("step2.serviceDuration")}
          type="number"
          min={5}
          max={480}
          value={serviceDuration}
          onChange={(e) => onServiceDurationChange(Number(e.target.value) || 30)}
        />
        <div>
          <Input
            id="servicePrice"
            label={t("step2.servicePrice")}
            value={servicePrice}
            onChange={(e) => onServicePriceChange(e.target.value)}
            placeholder="150.00"
            required
          />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {t("step2.servicePriceHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/step-professional.tsx
git commit -m "feat: extract StepProfessional onboarding component"
```

---

### Task 6: Extract StepWhatsapp Component

**Files:**
- Create: `src/components/onboarding/step-whatsapp.tsx`

Extract Step 3 JSX (lines 609-666 of current `page.tsx`).

**Step 1: Create the component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface StepWhatsappProps {
  phoneNumberId: string;
  onPhoneNumberIdChange: (value: string) => void;
  wabaId: string;
  onWabaIdChange: (value: string) => void;
  accessToken: string;
  onAccessTokenChange: (value: string) => void;
  testResult: "success" | "failed" | null;
  testing: boolean;
  onTest: () => void;
}

export function StepWhatsapp({
  phoneNumberId,
  onPhoneNumberIdChange,
  wabaId,
  onWabaIdChange,
  accessToken,
  onAccessTokenChange,
  testResult,
  testing,
  onTest,
}: StepWhatsappProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step3.description")}
      </p>
      <Input
        id="whatsappPhoneNumberId"
        label={t("step3.phoneNumberId")}
        value={phoneNumberId}
        onChange={(e) => onPhoneNumberIdChange(e.target.value)}
        required
      />
      <Input
        id="whatsappWabaId"
        label={t("step3.wabaId")}
        value={wabaId}
        onChange={(e) => onWabaIdChange(e.target.value)}
        required
      />
      <Input
        id="whatsappAccessToken"
        label={t("step3.accessToken")}
        type="password"
        value={accessToken}
        onChange={(e) => onAccessTokenChange(e.target.value)}
        required
      />

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={testing || !phoneNumberId.trim() || !accessToken.trim()}
        >
          {testing ? t("step3.testLoading") : t("step3.testConnection")}
        </Button>
        {testResult === "success" && (
          <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
            {t("step3.testSuccess")}
          </span>
        )}
        {testResult === "failed" && (
          <span className="text-xs font-medium" style={{ color: "var(--danger)" }}>
            {t("step3.testFailed")}
          </span>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("step3.helpText")}
      </p>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/step-whatsapp.tsx
git commit -m "feat: extract StepWhatsapp onboarding component"
```

---

### Task 7: Extract StepCalendar Component

**Files:**
- Create: `src/components/onboarding/step-calendar.tsx`

Extract Step 4 JSX (lines 669-715 of current `page.tsx`).

**Step 1: Create the component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

interface StepCalendarProps {
  profName: string;
  specialty: string;
  hasProfessional: boolean;
  calendarConnected: boolean;
  calendarLoading: boolean;
  onConnect: () => void;
}

export function StepCalendar({
  profName,
  specialty,
  hasProfessional,
  calendarConnected,
  calendarLoading,
  onConnect,
}: StepCalendarProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step4.description")}
      </p>

      {hasProfessional && profName && (
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

      {!calendarConnected && hasProfessional && (
        <Button variant="outline" onClick={onConnect} disabled={calendarLoading}>
          {calendarLoading ? t("step4.waitingCallback") : t("step4.connect")}
        </Button>
      )}

      {!hasProfessional && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("step2.description")}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/step-calendar.tsx
git commit -m "feat: extract StepCalendar onboarding component"
```

---

### Task 8: Extract StepPatients Component

**Files:**
- Create: `src/components/onboarding/step-patients.tsx`

Extract Step 5 JSX (lines 718-853 of current `page.tsx`). This is the most complex step — it includes patients list, import/add dialogs, and requirements checklist.

**Step 1: Create the component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { PatientImportDialog } from "@/components/patients/patient-import-dialog";
import { Upload, UserPlus, X, Check, Circle } from "lucide-react";

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

interface StepPatientsProps {
  addDialogOpen: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
  importDialogOpen: boolean;
  onImportDialogOpenChange: (open: boolean) => void;
  addedPatients: Array<{ id: string; name: string; phone: string }>;
  requirements: RequirementsStatus | null;
  onPatientAdded: () => void;
  onImportDone: () => void;
  onRemovePatient: (id: string) => void;
}

export function StepPatients({
  addDialogOpen,
  onAddDialogOpenChange,
  importDialogOpen,
  onImportDialogOpenChange,
  addedPatients,
  requirements,
  onPatientAdded,
  onImportDone,
  onRemovePatient,
}: StepPatientsProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step5.description")}
      </p>

      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {t("step5.patientsSection")}
      </h3>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("step5.patientsOptional")}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onImportDialogOpenChange(true)}
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
          onClick={() => onAddDialogOpenChange(true)}
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
                  onClick={() => onRemovePatient(p.id)}
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

      <PatientFormDialog
        open={addDialogOpen}
        onOpenChange={onAddDialogOpenChange}
        onSuccess={onPatientAdded}
      />
      <PatientImportDialog
        open={importDialogOpen}
        onOpenChange={onImportDialogOpenChange}
        onSuccess={onImportDone}
      />
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/onboarding/step-patients.tsx
git commit -m "feat: extract StepPatients onboarding component"
```

---

### Task 9: Rewrite SetupPage as Orchestrator

**Files:**
- Modify: `src/app/(onboarding)/setup/page.tsx` (full rewrite)

This is the core task. Replace the monolithic component with the orchestrator that uses `WizardStepper`, `StepSlider`, and the 5 extracted step components. All state and save logic stays here — the steps are pure presentational.

**Step 1: Rewrite `page.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { WizardStepper } from "@/components/onboarding/wizard-stepper";
import { StepSlider } from "@/components/onboarding/step-slider";
import { StepClinic } from "@/components/onboarding/step-clinic";
import { StepProfessional } from "@/components/onboarding/step-professional";
import { StepWhatsapp } from "@/components/onboarding/step-whatsapp";
import { StepCalendar } from "@/components/onboarding/step-calendar";
import { StepPatients } from "@/components/onboarding/step-patients";
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

export default function SetupPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Navigation
  const initialStep = Number(searchParams.get("step")) || 1;
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Step 1 state
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(EMPTY_SCHEDULE);

  // Step 2 state
  const [profName, setProfName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [duration, setDuration] = useState(30);
  const [profSchedule, setProfSchedule] = useState<ScheduleGrid>(EMPTY_SCHEDULE);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState(30);
  const [servicePrice, setServicePrice] = useState("");
  const [createdProfId, setCreatedProfId] = useState<string | null>(null);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);

  // Step 3 state
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappTestResult, setWhatsappTestResult] = useState<"success" | "failed" | null>(null);
  const [whatsappTesting, setWhatsappTesting] = useState(false);

  // Step 4 state
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Step 5 state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [addedPatients, setAddedPatients] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [requirements, setRequirements] = useState<RequirementsStatus | null>(null);

  // --- Data loading (unchanged) ---

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

  // --- Save functions (unchanged) ---

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

  async function saveStep2(): Promise<boolean> {
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

  useEffect(() => {
    if (step === 5) {
      fetchRequirements();
    }
  }, [step, fetchRequirements]);

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
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("[setup] finish error:", err);
      setLoading(false);
    }
  }

  // --- Patient handlers ---

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

  // --- Labels for stepper ---

  const stepLabels = [
    t("step1.title"),
    t("step2.title"),
    t("step3.title"),
    t("step4.title"),
    t("step5.title"),
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
            phone={phone}
            onPhoneChange={setPhone}
            address={address}
            onAddressChange={setAddress}
            timezone={timezone}
            onTimezoneChange={setTimezone}
            operatingHours={operatingHours}
            onOperatingHoursChange={setOperatingHours}
          />
        );
      case 2:
        return (
          <StepProfessional
            profName={profName}
            onProfNameChange={setProfName}
            specialty={specialty}
            onSpecialtyChange={setSpecialty}
            duration={duration}
            onDurationChange={setDuration}
            profSchedule={profSchedule}
            onProfScheduleChange={setProfSchedule}
            serviceName={serviceName}
            onServiceNameChange={setServiceName}
            serviceDuration={serviceDuration}
            onServiceDurationChange={setServiceDuration}
            servicePrice={servicePrice}
            onServicePriceChange={setServicePrice}
          />
        );
      case 3:
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
      case 4:
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
      case 5:
        return (
          <StepPatients
            addDialogOpen={addDialogOpen}
            onAddDialogOpenChange={setAddDialogOpen}
            importDialogOpen={importDialogOpen}
            onImportDialogOpenChange={setImportDialogOpen}
            addedPatients={addedPatients}
            requirements={requirements}
            onPatientAdded={handlePatientAdded}
            onImportDone={handleImportDone}
            onRemovePatient={removePatient}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div>
      <WizardStepper
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        labels={stepLabels}
      />

      <Card variant="glass">
        <StepSlider stepKey={step}>
          {renderStep()}
        </StepSlider>

        {/* Navigation buttons — outside the slider so they don't animate */}
        <div className="mt-6 flex items-center justify-between">
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
      </Card>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/(onboarding)/setup/page.tsx
git commit -m "refactor: rewrite setup page as orchestrator with wizard components"
```

---

### Task 10: Widen Onboarding Layout

**Files:**
- Modify: `src/app/(onboarding)/layout.tsx`

**Step 1: Change `max-w-lg` to `max-w-2xl`**

In `src/app/(onboarding)/layout.tsx`, change:

```tsx
<div className="w-full max-w-lg">{children}</div>
```

to:

```tsx
<div className="w-full max-w-2xl">{children}</div>
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/(onboarding)/layout.tsx
git commit -m "style: widen onboarding layout to max-w-2xl"
```

---

### Task 11: Visual Verification and Final Build

**Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run dev server**

Run: `npm run dev`
Expected: Server starts without errors

**Step 3: Manual verification checklist**

Open `http://localhost:3000/setup` and verify:
- [ ] Numbered circles progress indicator renders with 5 steps
- [ ] Active step has accent glow, completed steps show checkmarks
- [ ] Step labels appear below circles on desktop, hidden on mobile
- [ ] Connecting lines show accent color for completed steps
- [ ] Clicking "Next" slides content left, new step slides in from right
- [ ] Clicking "Back" slides content right, new step slides in from left
- [ ] Animation feels smooth (spring physics, ~300ms)
- [ ] All form fields work correctly in each step
- [ ] Schedule grid renders properly in wider container
- [ ] Navigation buttons stay fixed (don't animate with step content)
- [ ] Loading spinner shows during saves
- [ ] Step 5 requirements checklist loads correctly

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete onboarding wizard redesign with animations and stepper"
```
