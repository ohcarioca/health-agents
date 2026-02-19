# Phone Input — Flag Inside the Field

**Date:** 2026-02-19
**Scope:** Onboarding step-clinic + Settings clinic tab
**Goal:** Make both phone fields use `react-phone-number-input` with the country flag visually *inside* the input container (not floating to the left as a separate element).

---

## Current State

| Location | Component | Flag |
|----------|-----------|------|
| Onboarding `step-clinic.tsx` | `PhoneInput` from `react-phone-number-input` | Outside (left of input, separate) |
| Settings `clinic-form.tsx` | Plain `<Input>` | None |

The current CSS in `globals.css` styles `.PhoneInputInput` with its own border, making the flag/country selector float as a completely separate element beside the input box.

---

## Target Visual

Both fields should render as a **single bordered container** with the flag inline on the left:

```
┌─────────────────────────────────────────┐
│ 🇧🇷 ▼ │ (11) 98765-4321                │
└─────────────────────────────────────────┘
```

- Single border wraps the entire control
- Flag + dropdown arrow on the left, separated by a vertical divider
- Input text fills the rest of the container
- Focus ring on the outer container, not the inner input

---

## Implementation Plan

### Step 1 — Reusable `PhoneInputField` component

Create `src/components/ui/phone-input-field.tsx`:

```tsx
"use client";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface PhoneInputFieldProps {
  label?: string;
  value: string;            // digits-only from DB (e.g. "5511988280512")
  onChange: (digits: string) => void;
  error?: string;
  id?: string;
}
```

- Convert digits → E.164 on init: `"5511988280512"` → `"+5511988280512"`
- Convert E.164 → digits on change: `"+5511988280512"` → `"5511988280512"` (strip `+`, keep digits only — consistent with existing DB convention and Zod schema)
- `defaultCountry="BR"`, no country selector hidden
- Wraps with label + error display matching `Input` component style

### Step 2 — CSS: flag inside the container (`globals.css`)

Replace the current Phone input section with:

```css
/* Phone input — unified container with flag inside */
.PhoneInput {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  transition: border-color 0.15s, outline 0.15s;
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.PhoneInput:focus-within {
  border-color: var(--accent);
  outline-color: var(--accent-ring);
}

.PhoneInput--error {
  border-color: var(--danger);
}

.PhoneInputCountry {
  display: flex;
  align-items: center;
  padding: 0 0.5rem 0 0.75rem;
  border-right: 1px solid var(--border);
  height: 100%;
}

.PhoneInputCountryIcon {
  width: 1.25rem;
  height: auto;
}

.PhoneInputCountrySelectArrow {
  margin-left: 0.25rem;
  color: var(--text-muted);
}

.PhoneInputCountrySelect {
  /* invisible overlay for click area — flag and arrow are the visual */
  position: absolute;
  opacity: 0;
  cursor: pointer;
  inset: 0;
}

.PhoneInputInput {
  flex: 1;
  border: none !important;
  background: transparent !important;
  color: var(--text-primary) !important;
  padding: 0.625rem 0.75rem !important;
  font-size: 0.875rem !important;
  outline: none !important;
  border-radius: 0 0.5rem 0.5rem 0;
}

.PhoneInputInput::placeholder {
  color: var(--text-muted);
}
```

Remove the `.phone-input-wrapper` class from step-clinic.tsx (unused after this).

### Step 3 — Update `step-clinic.tsx` (onboarding)

Replace direct `<PhoneInput>` usage with the new `<PhoneInputField>` component:
- Remove `import PhoneInput from "react-phone-number-input"`
- Remove `import "react-phone-number-input/style.css"` (moved to the component)
- Add `import { PhoneInputField } from "@/components/ui/phone-input-field"`
- Replace the phone block with `<PhoneInputField label={t("step1.phone")} value={phone} onChange={onPhoneChange} />`

No logic changes — `onPhoneChange` already receives the raw value.

### Step 4 — Update `clinic-form.tsx` (settings)

Replace the plain `<Input>` phone field with `<PhoneInputField>`:
- The `phone` state is already digits-only (loaded from `clinic.phone`)
- `setPhone` already receives digits
- `PhoneInputField` does the E.164 ↔ digits conversion internally
- `fieldErrors.phone` passed as `error` prop

The existing Zod schema (`phone: z.string().transform((v) => v.replace(/\D/g, ""))`) stays unchanged — it's already stripping non-digits.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/phone-input-field.tsx` | **New** — reusable wrapper component |
| `src/app/globals.css` | Update Phone input CSS section |
| `src/components/onboarding/step-clinic.tsx` | Use `PhoneInputField`, remove direct imports |
| `src/components/settings/clinic-form.tsx` | Replace `<Input>` phone with `<PhoneInputField>` |

No DB changes, no migrations, no API changes.

---

## Edge Cases

- **Empty value**: `PhoneInputField` receives `""` → passes `undefined` to `PhoneInput` → renders empty with BR flag selected
- **Existing digits-only DB value**: `"5511988280512"` → prepend `+` → `PhoneInput` parses correctly
- **User removes country code via select**: `onChange` fires with new E.164 → strip digits → DB saves correctly
- **Validation error**: passes `error` prop → `PhoneInput` wrapper gets `PhoneInput--error` CSS class → red border
