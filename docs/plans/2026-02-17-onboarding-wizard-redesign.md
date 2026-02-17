# Onboarding Wizard Redesign

Date: 2026-02-17

## Goal

Redesign the onboarding setup wizard (`/setup`) with modern, polished UI:
- Slide animations (forward/backward) between steps using Framer Motion
- Visual progress indicator with numbered circles connected by lines
- Extract monolithic 877-line component into modular architecture

## Architecture

### File Structure

```
src/
  components/onboarding/
    wizard-stepper.tsx        # Progress indicator (dots + lines)
    step-slider.tsx           # Framer Motion slide wrapper
    step-clinic.tsx           # Step 1: Clinic info + operating hours
    step-professional.tsx     # Step 2: Professional + service + pricing
    step-whatsapp.tsx         # Step 3: WhatsApp credentials
    step-calendar.tsx         # Step 4: Google Calendar connection
    step-patients.tsx         # Step 5: Patients + requirements checklist
  app/(onboarding)/
    setup/page.tsx            # Orchestrator (state + navigation + save logic)
```

### Component Responsibilities

- **`page.tsx`** — owns all state, save functions, navigation logic. Renders stepper + slider + current step. Steps receive state via props and report changes via callbacks.
- **`wizard-stepper.tsx`** — pure presentational. Receives `currentStep`, `totalSteps`, `labels[]`. Renders numbered circles + connecting lines with proper states.
- **`step-slider.tsx`** — wraps children in Framer Motion `AnimatePresence`. Tracks direction (forward/backward) to determine slide direction. Clips overflow.
- **`step-*.tsx`** — each step is a self-contained form section. Receives relevant state + onChange callbacks as props. No save logic inside steps.

## Progress Indicator Design

```
  (1)━━━━━━(2)━━━━━━(3)━━━━━━(4)━━━━━━(5)
 Clinica   Equipe  WhatsApp  Agenda  Pacientes
```

### Circle States

| State | Circle | Number/Icon | Line (after) |
|-------|--------|-------------|--------------|
| Completed | Accent bg filled | White checkmark icon | Accent color |
| Active | Accent ring border, subtle glow | Accent number | Muted/gray |
| Pending | Muted border | Muted number | Muted/gray |

### Styling Details

- Circle size: `w-10 h-10` (40px)
- Active glow: `box-shadow: 0 0 0 4px var(--accent-muted)`
- Lines: `h-0.5` connecting circles, flex-1 between
- Labels: `text-xs` below circles, hidden below `sm` breakpoint
- Completed line fills with accent via CSS transition (`transition-colors duration-500`)

## Slide Animation

### Framer Motion Config

```tsx
// Direction: 1 = forward, -1 = backward
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
  x: { type: "spring", stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};
```

### AnimatePresence Setup

- `mode="wait"` — exit animation completes before enter starts
- `custom={direction}` — passed to variants for directional slide
- `key={step}` — triggers re-animation on step change
- Container has `overflow-hidden` to clip sliding content

## Layout Changes

- Container width: `max-w-lg` (32rem) → `max-w-2xl` (42rem) for schedule grid comfort
- Stepper sits above the card, independent
- Step title + description rendered inside card as part of animated content
- Navigation buttons pinned at bottom of card, outside the animated area

## Visual Polish

- Card: `variant="glass"` (existing)
- Active circle: subtle glow with `--accent-muted` shadow
- Lines: progressive fill animation on step completion
- Slide transition: spring-based for organic motion
- Loading states: existing Spinner component, no changes needed

## Dependencies

- **Add:** `framer-motion` (~30KB gzipped)
- **No removals** — all existing UI components reused

## Translation Keys

No new translation keys needed. Existing `onboarding.*` keys cover all step titles, descriptions, labels, and buttons. Step labels for the stepper will reuse `onboarding.step{N}.title`.

## Data Flow (Unchanged)

1. Mount → load existing clinic/professionals/services data
2. User fills step → state updates in parent
3. Click "Next" → `handleNext()` saves per-step via API → advance step
4. Click "Back" → `prevStep()` decrements step (no save)
5. Step 5 requirements → fetch from `/api/onboarding/status`
6. "Finish" → `router.push("/")` + `router.refresh()`

## Scope Boundaries

**In scope:**
- Extract steps into separate components
- Add WizardStepper progress indicator
- Add StepSlider with Framer Motion animations
- Widen layout container
- Visual polish (glow, progressive line fill)

**Out of scope:**
- Changing the 5-step flow or step content
- Modifying save logic or API endpoints
- Adding new form fields or validation
- Changing the onboarding layout beyond container width
