# Onboarding Wizard UX Revamp

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve onboarding wizard UX with better schedule picker, services-only step (no professional creation), neutral billing toggle, fixed stepper spacing, and consistent modal size.

**Architecture:** Reduce wizard from 6 steps to 5 by removing professional creation (moved to settings) and Google Calendar (requires a professional). Replace the compact 32-slot drag grid with a day-by-day schedule picker with presets. Fix layout issues (stepper spacing, modal height consistency).

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, next-intl, Framer Motion

---

## Summary of Changes

| # | Change | Reason |
|---|--------|--------|
| 1 | Fixed modal height | Modal resizes on each step — jarring |
| 2 | Fix stepper spacing | Uneven gap between step indicators |
| 3 | Neutral billing toggle | Toggle uses colored `bg-primary` when active — too loud |
| 4 | New schedule picker | Current 32-slot drag grid is confusing for onboarding |
| 5 | Services-only step | Remove professional creation from onboarding |
| 6 | Remove Google Calendar step | Depends on professional — move to settings |
| 7 | Update translations | New keys for services step and schedule presets |

## New Step Flow (5 steps)

```
Step 1: Clínica       → clinic info
Step 2: Horários      → NEW schedule picker with presets
Step 3: Serviços      → services only (no professional fields)
Step 4: Cobrança      → billing toggle (neutral colors)
Step 5: WhatsApp      → credentials
→ Completion screen   → activation checklist (unchanged)
```

---

### Task 1: Fix Modal to Consistent Height

**Files:**
- Modify: `src/components/onboarding/onboarding-modal.tsx`

The modal currently uses `max-h-[90vh]` with auto height, causing it to resize per step. Fix by adding a fixed height so content scrolls within a stable container.

**Step 1: Edit the modal card container**

In `src/components/onboarding/onboarding-modal.tsx`, change the modal card div (line 16):

```tsx
// BEFORE
<div
  className="relative z-10 mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-5"
  style={{
    backgroundColor: "var(--surface)",
    borderColor: "var(--border-strong)",
    boxShadow: "var(--shadow-lg)",
  }}
>

// AFTER
<div
  className="relative z-10 mx-4 flex w-full max-w-2xl flex-col rounded-2xl border p-5"
  style={{
    backgroundColor: "var(--surface)",
    borderColor: "var(--border-strong)",
    boxShadow: "var(--shadow-lg)",
    height: "min(640px, 90vh)",
  }}
>
```

Key changes:
- Add `flex flex-col` to enable flex layout
- Replace `max-h-[90vh] overflow-y-auto` with fixed `height: min(640px, 90vh)`
- The `SetupWizard` will handle internal scrolling

**Step 2: Add scrollable content area in SetupWizard**

In `src/components/onboarding/setup-wizard.tsx`, wrap the step content in a scrollable flex container. Change the return block (lines 523-551):

```tsx
// BEFORE (line 531)
<div className="mt-3">
  <StepSlider stepKey={step}>
    {renderStep()}
  </StepSlider>

  <div className="mt-5 flex items-center justify-between">
    ...buttons...
  </div>
</div>

// AFTER
<div className="mt-3 flex min-h-0 flex-1 flex-col">
  <div className="min-h-0 flex-1 overflow-y-auto">
    <StepSlider stepKey={step}>
      {renderStep()}
    </StepSlider>
  </div>

  <div className="mt-5 flex shrink-0 items-center justify-between">
    ...buttons...
  </div>
</div>
```

Key changes:
- Outer div becomes `flex flex-1 flex-col min-h-0` — fills remaining modal space
- Content area becomes `flex-1 overflow-y-auto min-h-0` — scrollable content
- Nav buttons become `shrink-0` — always pinned at bottom

**Step 3: Verify visually**

Run: `npm run dev`
Navigate to onboarding. Confirm:
- Modal stays same height across all steps
- Content scrolls within the modal when needed
- Back/Next buttons are always visible at the bottom

**Step 4: Commit**

```bash
git add src/components/onboarding/onboarding-modal.tsx src/components/onboarding/setup-wizard.tsx
git commit -m "fix: consistent modal height in onboarding wizard"
```

---

### Task 2: Fix Stepper Spacing

**Files:**
- Modify: `src/components/onboarding/wizard-stepper.tsx`

The issue: connecting lines between step circles have inconsistent spacing. The `mx-1.5` margin creates uneven gaps especially as step count changes. Also, labels with `maxWidth: 5.5rem` can cause crowding.

**Step 1: Improve stepper layout**

Replace entire `wizard-stepper.tsx` content:

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
    <div className="mb-5">
      <div className="flex items-center">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={stepNum} className="flex flex-1 items-center last:flex-none">
              {/* Circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300 ${
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
                  {isCompleted ? <Check className="size-4" strokeWidth={2.5} /> : stepNum}
                </div>
                {/* Label — hidden on small screens */}
                <span
                  className="hidden text-center text-[10px] font-medium leading-tight sm:block"
                  style={{
                    color: isActive
                      ? "var(--text-primary)"
                      : isCompleted
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  {labels[i]}
                </span>
              </div>

              {/* Connecting line — vertically centered with circle */}
              {stepNum < totalSteps && (
                <div
                  className="mx-2 mb-5 h-0.5 flex-1 rounded-full transition-colors duration-500 sm:mb-5"
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

Key changes:
- `items-start` → `items-center` on the main flex container, so connecting lines align to circle centers naturally
- Removed `px-2` from container — padding comes from modal's `p-5`
- `mt-[17px]` magic number replaced with `mb-5` offset on the line to center it with circles while accounting for labels below
- `mx-1.5` → `mx-2` for slightly more breathing room
- `gap-1.5` for consistent circle-to-label spacing
- Removed `maxWidth: 5.5rem` — let text flow naturally with proper flex layout

**Step 2: Verify visually**

Run dev server. Check:
- Step circles are evenly spaced with consistent connecting lines
- Lines align at the vertical center of circles
- Labels are centered below each circle
- Looks correct with 5 steps (not 6)

**Step 3: Commit**

```bash
git add src/components/onboarding/wizard-stepper.tsx
git commit -m "fix: even spacing between onboarding stepper indicators"
```

---

### Task 3: Neutral Billing Toggle

**Files:**
- Modify: `src/components/onboarding/setup-wizard.tsx` (lines 557-601, `StepBilling` component)

The toggle currently uses `bg-primary` (purple) when active. Change to a neutral appearance.

**Step 1: Update toggle styling**

In `setup-wizard.tsx`, update the `StepBilling` component's toggle button (lines 578-592):

```tsx
// BEFORE
<button
  type="button"
  role="switch"
  aria-checked={autoBilling}
  onClick={() => setAutoBilling(!autoBilling)}
  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
    autoBilling ? "bg-primary" : "bg-muted"
  }`}
>
  <span
    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
      autoBilling ? "translate-x-5" : "translate-x-0"
    }`}
  />
</button>

// AFTER
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
```

Key changes:
- `bg-primary` (purple) → `var(--text-muted)` (neutral gray) when ON
- `bg-muted` → `var(--surface-elevated)` when OFF
- Uses inline `style` with CSS variables for consistency with the codebase's theming approach

**Step 2: Verify visually**

Run dev server. Navigate to step 4 (billing). Confirm:
- Toggle uses neutral gray when ON
- Toggle uses darker background when OFF
- Knob (white circle) still moves correctly
- No colored/purple accent visible on the toggle

**Step 3: Commit**

```bash
git add src/components/onboarding/setup-wizard.tsx
git commit -m "fix: use neutral colors for billing toggle in onboarding"
```

---

### Task 4: New Friendly Schedule Picker

**Files:**
- Create: `src/components/onboarding/schedule-picker.tsx`
- Modify: `src/components/onboarding/step-hours.tsx`

Replace the compact 32-slot drag grid with a day-by-day picker that has:
1. Quick presets (common clinic schedules)
2. Per-day toggle (open/closed) + start/end time selectors
3. "Copy to all weekdays" shortcut

**Step 1: Create the schedule picker component**

Create `src/components/onboarding/schedule-picker.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface SchedulePickerProps {
  value: ScheduleGrid;
  onChange: (grid: ScheduleGrid) => void;
}

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

// Generate time options from 06:00 to 22:00 in 30-min increments
const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
  }
}

interface DayConfig {
  enabled: boolean;
  start: string;
  end: string;
}

type WeekConfig = Record<Weekday, DayConfig>;

const PRESETS = {
  commercial: {
    monday: { enabled: true, start: "08:00", end: "18:00" },
    tuesday: { enabled: true, start: "08:00", end: "18:00" },
    wednesday: { enabled: true, start: "08:00", end: "18:00" },
    thursday: { enabled: true, start: "08:00", end: "18:00" },
    friday: { enabled: true, start: "08:00", end: "18:00" },
    saturday: { enabled: false, start: "08:00", end: "13:00" },
    sunday: { enabled: false, start: "08:00", end: "12:00" },
  } satisfies WeekConfig,
  commercialSaturday: {
    monday: { enabled: true, start: "08:00", end: "18:00" },
    tuesday: { enabled: true, start: "08:00", end: "18:00" },
    wednesday: { enabled: true, start: "08:00", end: "18:00" },
    thursday: { enabled: true, start: "08:00", end: "18:00" },
    friday: { enabled: true, start: "08:00", end: "18:00" },
    saturday: { enabled: true, start: "08:00", end: "13:00" },
    sunday: { enabled: false, start: "08:00", end: "12:00" },
  } satisfies WeekConfig,
  extended: {
    monday: { enabled: true, start: "07:00", end: "20:00" },
    tuesday: { enabled: true, start: "07:00", end: "20:00" },
    wednesday: { enabled: true, start: "07:00", end: "20:00" },
    thursday: { enabled: true, start: "07:00", end: "20:00" },
    friday: { enabled: true, start: "07:00", end: "20:00" },
    saturday: { enabled: true, start: "08:00", end: "14:00" },
    sunday: { enabled: false, start: "08:00", end: "12:00" },
  } satisfies WeekConfig,
} as const;

type PresetKey = keyof typeof PRESETS | "custom";

function gridToConfig(grid: ScheduleGrid): WeekConfig {
  const config = {} as WeekConfig;
  for (const day of WEEKDAYS) {
    const blocks = grid[day] ?? [];
    if (blocks.length === 0) {
      config[day] = { enabled: false, start: "08:00", end: "18:00" };
    } else {
      config[day] = {
        enabled: true,
        start: blocks[0].start,
        end: blocks[blocks.length - 1].end,
      };
    }
  }
  return config;
}

function configToGrid(config: WeekConfig): ScheduleGrid {
  const grid = {} as Record<Weekday, { start: string; end: string }[]>;
  for (const day of WEEKDAYS) {
    const dc = config[day];
    grid[day] = dc.enabled ? [{ start: dc.start, end: dc.end }] : [];
  }
  return grid as ScheduleGrid;
}

function detectPreset(config: WeekConfig): PresetKey {
  for (const [key, preset] of Object.entries(PRESETS)) {
    let match = true;
    for (const day of WEEKDAYS) {
      const c = config[day];
      const p = preset[day];
      if (c.enabled !== p.enabled) { match = false; break; }
      if (c.enabled && (c.start !== p.start || c.end !== p.end)) { match = false; break; }
    }
    if (match) return key as PresetKey;
  }
  return "custom";
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const t = useTranslations("onboarding.scheduleGrid");
  const tDays = useTranslations("settings.weekdaysShort");

  const [config, setConfig] = useState<WeekConfig>(() => gridToConfig(value));
  const [activePreset, setActivePreset] = useState<PresetKey>(() =>
    detectPreset(gridToConfig(value))
  );

  const commit = useCallback(
    (next: WeekConfig) => {
      setConfig(next);
      setActivePreset(detectPreset(next));
      onChange(configToGrid(next));
    },
    [onChange],
  );

  function applyPreset(key: PresetKey) {
    if (key === "custom") return;
    const preset = PRESETS[key];
    const next = {} as WeekConfig;
    for (const day of WEEKDAYS) {
      next[day] = { ...preset[day] };
    }
    setActivePreset(key);
    commit(next);
  }

  function toggleDay(day: Weekday) {
    const next = { ...config, [day]: { ...config[day], enabled: !config[day].enabled } };
    commit(next);
  }

  function updateTime(day: Weekday, field: "start" | "end", value: string) {
    const next = { ...config, [day]: { ...config[day], [field]: value } };
    commit(next);
  }

  function copyMondayToWeekdays() {
    const mon = config.monday;
    const next = { ...config };
    for (const day of WEEKDAYS) {
      if (day !== "saturday" && day !== "sunday") {
        next[day] = { ...mon };
      }
    }
    commit(next);
  }

  const presetOptions: { key: PresetKey; label: string }[] = [
    { key: "commercial", label: t("presetCommercial") },
    { key: "commercialSaturday", label: t("presetCommercialSat") },
    { key: "extended", label: t("presetExtended") },
    { key: "custom", label: t("presetCustom") },
  ];

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presetOptions.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => key !== "custom" && applyPreset(key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              activePreset === key ? "" : ""
            }`}
            style={{
              borderColor: activePreset === key ? "var(--accent)" : "var(--border)",
              backgroundColor: activePreset === key ? "var(--accent-muted)" : "transparent",
              color: activePreset === key ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Day rows */}
      <div className="space-y-1.5">
        {WEEKDAYS.map((day) => {
          const dc = config[day];
          const isWeekend = day === "saturday" || day === "sunday";

          return (
            <div
              key={day}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              style={{
                borderColor: dc.enabled ? "var(--border)" : "var(--border)",
                opacity: dc.enabled ? 1 : 0.6,
              }}
            >
              {/* Day toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={dc.enabled}
                onClick={() => toggleDay(day)}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={{
                  backgroundColor: dc.enabled
                    ? "var(--accent)"
                    : "var(--surface-elevated)",
                }}
              >
                <span
                  className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    dc.enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>

              {/* Day name */}
              <span
                className="w-10 text-xs font-medium"
                style={{
                  color: dc.enabled ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {tDays(day)}
              </span>

              {/* Time selectors */}
              {dc.enabled ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={dc.start}
                    onChange={(e) => updateTime(day, "start", e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                  <select
                    value={dc.end}
                    onChange={(e) => updateTime(day, "end", e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {TIME_OPTIONS.filter((t) => t > dc.start).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("closed")}
                </span>
              )}

              {/* Weekend badge */}
              {isWeekend && (
                <span
                  className="ml-auto rounded px-1.5 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    color: "var(--text-muted)",
                  }}
                >
                  {t("weekend")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Copy shortcut */}
      <button
        type="button"
        onClick={copyMondayToWeekdays}
        className="text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--accent)" }}
      >
        {t("copyMondayToWeekdays")}
      </button>
    </div>
  );
}
```

**Step 2: Update step-hours to use the new picker**

Replace `src/components/onboarding/step-hours.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { SchedulePicker } from "@/components/onboarding/schedule-picker";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface StepHoursProps {
  operatingHours: ScheduleGrid;
  onOperatingHoursChange: (value: ScheduleGrid) => void;
}

export function StepHours({ operatingHours, onOperatingHoursChange }: StepHoursProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("stepHours.description")}
      </p>
      <SchedulePicker value={operatingHours} onChange={onOperatingHoursChange} />
    </div>
  );
}
```

**Step 3: Add translation keys**

Add to `messages/pt-BR.json` inside `"onboarding"`:

```json
"scheduleGrid": {
  "presetCommercial": "Comercial",
  "presetCommercialSat": "Comercial + Sábado",
  "presetExtended": "Horário estendido",
  "presetCustom": "Personalizado",
  "closed": "Fechado",
  "weekend": "Fim de semana",
  "copyMondayToWeekdays": "Copiar segunda para dias úteis"
}
```

Add to `messages/en.json` inside `"onboarding"`:

```json
"scheduleGrid": {
  "presetCommercial": "Business hours",
  "presetCommercialSat": "Business + Saturday",
  "presetExtended": "Extended hours",
  "presetCustom": "Custom",
  "closed": "Closed",
  "weekend": "Weekend",
  "copyMondayToWeekdays": "Copy Monday to weekdays"
}
```

Add to `messages/es.json` inside `"onboarding"`:

```json
"scheduleGrid": {
  "presetCommercial": "Comercial",
  "presetCommercialSat": "Comercial + Sábado",
  "presetExtended": "Horario extendido",
  "presetCustom": "Personalizado",
  "closed": "Cerrado",
  "weekend": "Fin de semana",
  "copyMondayToWeekdays": "Copiar lunes a días laborales"
}
```

Also update `stepHours.description` in all locales to remove the drag instruction:
- pt-BR: `"Defina o horário de funcionamento da clínica."`
- en: `"Set your clinic's operating hours."`
- es: `"Define el horario de atención de la clínica."`

**Step 4: Verify visually**

Run dev server. Navigate to step 2 (hours). Confirm:
- Preset buttons show and highlight correctly
- Clicking a preset fills all day rows with correct times
- Toggle per day enables/disables with time selectors
- End time dropdown only shows times after start time
- "Copy Monday to weekdays" works
- Data converts correctly to ScheduleGrid format

**Step 5: Commit**

```bash
git add src/components/onboarding/schedule-picker.tsx src/components/onboarding/step-hours.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: replace drag grid with day-by-day schedule picker in onboarding"
```

---

### Task 5: Services-Only Step (Remove Professional Creation)

**Files:**
- Create: `src/components/onboarding/step-services.tsx`
- Delete: `src/components/onboarding/step-professional.tsx`
- Modify: `src/components/onboarding/setup-wizard.tsx`

This is the most invasive change. We remove:
- Professional fields (name, specialty, duration) from step 3
- Google Calendar step (step 6) — requires a professional
- All professional-related state from SetupWizard
- Save function for professional creation

We keep:
- Service creation with templates and custom input
- Service prices and durations
- The ServiceItem type (move it to step-services.tsx)

**Step 1: Create step-services.tsx**

Create `src/components/onboarding/step-services.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { SERVICE_TEMPLATES } from "@/lib/onboarding/clinic-templates";
import { Plus, X } from "lucide-react";

export interface ServiceItem {
  name: string;
  duration_minutes: number;
  price: string;
}

interface StepServicesProps {
  clinicType: string;
  services: ServiceItem[];
  onServicesChange: (services: ServiceItem[]) => void;
}

export function StepServices({
  clinicType,
  services,
  onServicesChange,
}: StepServicesProps) {
  const t = useTranslations("onboarding");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState("");

  const templates = SERVICE_TEMPLATES[clinicType] ?? [];

  function handleSelectTemplate(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (!value) return;

    if (value === "__custom__") {
      setShowCustomInput(true);
      e.target.value = "";
      return;
    }

    const tmpl = templates.find((t) => t.name === value);
    if (tmpl) {
      onServicesChange([
        ...services,
        { name: tmpl.name, duration_minutes: tmpl.duration_minutes, price: "" },
      ]);
    }
    e.target.value = "";
  }

  function addCustomService() {
    if (customName.trim().length < 2) return;
    onServicesChange([
      ...services,
      { name: customName.trim(), duration_minutes: 30, price: "" },
    ]);
    setCustomName("");
    setShowCustomInput(false);
  }

  function removeService(index: number) {
    onServicesChange(services.filter((_, i) => i !== index));
  }

  function updateService(index: number, field: keyof ServiceItem, value: string | number) {
    const updated = services.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    onServicesChange(updated);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("stepServices.description")}
      </p>

      {/* Service dropdown */}
      <div>
        <select
          onChange={handleSelectTemplate}
          defaultValue=""
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:outline-[var(--accent-ring)]"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          <option value="">{t("stepServices.selectService")}</option>
          {templates.map((tmpl) => (
            <option key={tmpl.name} value={tmpl.name}>
              {tmpl.name} ({tmpl.duration_minutes}min)
            </option>
          ))}
          <option value="__custom__">{t("stepServices.customService")}</option>
        </select>
      </div>

      {/* Custom service input */}
      {showCustomInput && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="customServiceName"
              label={t("stepServices.customServiceName")}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={t("stepServices.customServiceName")}
            />
          </div>
          <button
            type="button"
            onClick={addCustomService}
            disabled={customName.trim().length < 2}
            className="mb-0.5 flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-foreground)",
            }}
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => { setShowCustomInput(false); setCustomName(""); }}
            className="mb-0.5 rounded-lg px-2 py-2.5 text-sm transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Services list */}
      {services.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("stepServices.noServices")}
        </p>
      ) : (
        <div className="space-y-2">
          {services.map((svc, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border p-3"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--surface)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {svc.name}
              </span>
              <input
                type="number"
                min={5}
                max={480}
                value={svc.duration_minutes}
                onChange={(e) =>
                  updateService(index, "duration_minutes", Number(e.target.value) || 30)
                }
                className="w-16 rounded border px-2 py-1 text-center text-xs"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
                title={t("stepServices.serviceDuration")}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                min
              </span>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  R$
                </span>
                <input
                  type="text"
                  value={svc.price}
                  onChange={(e) => updateService(index, "price", e.target.value)}
                  placeholder="0,00"
                  className="w-24 rounded border py-1 pl-7 pr-2 text-right text-xs"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                  title={t("stepServices.servicePrice")}
                />
              </div>
              <button
                type="button"
                onClick={() => removeService(index)}
                className="rounded p-1 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                style={{ color: "var(--text-muted)" }}
                title={t("stepServices.removeService")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Rewrite setup-wizard.tsx**

Major changes to `src/components/onboarding/setup-wizard.tsx`:

1. **Imports** — Replace `StepProfessional`/`ServiceItem` with `StepServices`/`ServiceItem`. Remove `StepCalendar`.

```tsx
// REMOVE these imports:
import { StepProfessional } from "@/components/onboarding/step-professional";
import type { ServiceItem } from "@/components/onboarding/step-professional";
import { StepCalendar } from "@/components/onboarding/step-calendar";

// ADD this import:
import { StepServices } from "@/components/onboarding/step-services";
import type { ServiceItem } from "@/components/onboarding/step-services";
```

2. **Constants** — Change `TOTAL_STEPS` from 6 to 5:

```tsx
const TOTAL_STEPS = 5;
```

3. **State** — Remove professional and calendar state variables (lines 52-57, 69-71):

```tsx
// REMOVE all of these:
const [profName, setProfName] = useState("");
const [specialty, setSpecialty] = useState("");
const [duration, setDuration] = useState(30);
const [createdProfId, setCreatedProfId] = useState<string | null>(null);
const [calendarConnected, setCalendarConnected] = useState(false);
const [calendarLoading, setCalendarLoading] = useState(false);
```

4. **Data loading** (lines 83-182) — Remove professional data loading and calendar detection. Remove auto-step logic for professional. Keep services loading:

Remove from `loadExistingData`:
- The `profRes` fetch and processing (lines 127-139)
- `hasProfessional` variable
- The `autoStep >= 3 && hasProfessional` check (line 154)
- Calendar callback detection (lines 184-188)

Change auto-step logic:
- Step 1 done → autoStep 2 (has clinic)
- Step 2 done → autoStep 3 (has hours)
- Step 3 done → autoStep 4 (has services with prices)
- Step 4 done → autoStep 5 (has billing setting)

5. **Validation** (`canAdvance`, lines 192-217) — Update cases:

```tsx
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
```

6. **Save functions** — Replace `saveStep3` (lines 249-305) with services-only save:

```tsx
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
      }),
    });
    if (!res.ok) continue;
  }
  return true;
}
```

Remove `connectGoogleCalendar` function entirely (lines 352-376).

7. **handleNext** — Update the save mapping. Step 4 saves billing, step 5 saves WhatsApp:

```tsx
async function handleNext() {
  if (!canAdvance()) return;
  setLoading(true);
  try {
    let saved = true;
    switch (step) {
      case 1: saved = await saveStep1(); break;
      case 2: saved = await saveStep2(); break;
      case 3: saved = await saveStep3(); break;
      case 4: saved = await saveStepBilling(); break;
      case 5: saved = await saveStep5(); break;
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
```

8. **Step labels** — Update to 5 labels:

```tsx
const stepLabels = [
  t("step1.title"),           // 1: Clínica
  t("stepHours.title"),       // 2: Horários
  t("stepServices.title"),    // 3: Serviços
  t("stepBilling.title"),     // 4: Cobrança
  t("step3.title"),           // 5: WhatsApp
];
```

9. **renderStep** — Remove case 6 (calendar), update case 3 to StepServices:

```tsx
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
```

**Step 3: Delete the old professional component**

Delete: `src/components/onboarding/step-professional.tsx`

**Step 4: Add translation keys for stepServices**

In all 3 locale files, add `"stepServices"` block inside `"onboarding"`:

pt-BR:
```json
"stepServices": {
  "title": "Serviços",
  "description": "Adicione os serviços oferecidos pela sua clínica.",
  "selectService": "Selecionar serviço...",
  "customService": "Outro (personalizado)",
  "customServiceName": "Nome do serviço",
  "serviceDuration": "Duração (min)",
  "servicePrice": "Preço (R$)",
  "noServices": "Adicione pelo menos um serviço.",
  "removeService": "Remover"
}
```

en:
```json
"stepServices": {
  "title": "Services",
  "description": "Add the services offered by your clinic.",
  "selectService": "Select service...",
  "customService": "Other (custom)",
  "customServiceName": "Service name",
  "serviceDuration": "Duration (min)",
  "servicePrice": "Price",
  "noServices": "Add at least one service.",
  "removeService": "Remove"
}
```

es:
```json
"stepServices": {
  "title": "Servicios",
  "description": "Agregue los servicios ofrecidos por su clínica.",
  "selectService": "Seleccionar servicio...",
  "customService": "Otro (personalizado)",
  "customServiceName": "Nombre del servicio",
  "serviceDuration": "Duración (min)",
  "servicePrice": "Precio",
  "noServices": "Agregue al menos un servicio.",
  "removeService": "Eliminar"
}
```

**Step 5: Verify**

Run: `npm run dev`
Confirm:
- Step 3 shows only services (no professional fields)
- Step 4 is billing, step 5 is WhatsApp
- There is no step 6 (Google Calendar)
- Stepper shows 5 steps with correct labels
- Services can be added from templates and custom input
- Services save with correct prices
- Completion screen still shows all requirements (including professional_schedule and google_calendar — user will complete these in settings)

**Step 6: Commit**

```bash
git add src/components/onboarding/step-services.tsx src/components/onboarding/setup-wizard.tsx messages/pt-BR.json messages/en.json messages/es.json
git rm src/components/onboarding/step-professional.tsx
git commit -m "feat: replace professional+services step with services-only in onboarding"
```

---

### Task 6: Update Translation Keys (Cleanup)

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

Remove the old `"step2"` translation block (which was for "Equipe e Serviços") from all 3 locale files. The old keys under `"step2"` (profSection, name, specialty, duration, serviceSection, etc.) are replaced by `"stepServices"`.

Also remove the `"step4"` block (Google Calendar) since that step is no longer in onboarding — keep it only if referenced elsewhere (check `step-calendar.tsx` references).

Note: Keep `"step3"` (WhatsApp) and `"step4"` (Google Calendar) keys if they're referenced by settings pages. Search for usage before deleting.

**Step 1: Verify translation key usage**

Run: `grep -r "step2\." src/components/onboarding/` to confirm no remaining references.
Run: `grep -r "step4\." src/components/onboarding/` to check calendar references.

**Step 2: Clean up unused keys**

Remove `"step2"` block if only referenced by the deleted `step-professional.tsx`.
Keep `"step4"` if `step-calendar.tsx` still exists (it does, just unused in onboarding — might be used in settings).

**Step 3: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "chore: remove unused onboarding translation keys"
```

---

### Task 7: Run Tests and Verify

**Step 1: Run existing tests**

```bash
npx vitest run --reporter=verbose 2>&1 | head -80
```

Fix any import errors caused by deleting `step-professional.tsx` or changing exports.

**Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Fix any TypeScript errors.

**Step 3: Manual verification checklist**

- [ ] Modal stays same height on all 5 steps
- [ ] Stepper shows 5 evenly-spaced circles with labels
- [ ] Step 2 shows preset buttons + day-by-day schedule picker
- [ ] Step 3 shows services only (no professional fields)
- [ ] Step 4 billing toggle uses neutral gray colors
- [ ] Step 5 is WhatsApp (no step 6)
- [ ] Completion screen shows all requirements
- [ ] Back/Next navigation works across all steps

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test and type errors after onboarding revamp"
```

---

## Notes

- **Google Calendar** and **Professional creation** are now settings-only tasks. The completion screen still checks `professional_schedule` and `google_calendar` requirements — users complete these in Settings after onboarding.
- The new `SchedulePicker` is onboarding-specific. The existing `CompactScheduleGrid` in settings remains untouched.
- The `ServiceItem` type is now exported from `step-services.tsx` instead of `step-professional.tsx`.
