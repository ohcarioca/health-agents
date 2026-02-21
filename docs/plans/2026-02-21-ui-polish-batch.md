# UI Polish Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Four small UI improvements — remove Asaas card from integrations, add loading spinners to auth buttons, pre-populate insurance plans, add optional CNPJ/registration fields.

**Architecture:** All changes are UI/form-level. Two require a DB migration (new nullable columns). No new API routes — only modifications to existing forms, validations, and settings endpoints.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, Zod, next-intl, Supabase

---

### Task 1: Remove Asaas card from Integrations tab

**Files:**
- Modify: `src/components/settings/integrations-tab.tsx`

**Step 1: Delete the Asaas card**

In `src/components/settings/integrations-tab.tsx`, find the second card in the Gmail/Asaas grid (the one containing "Asaas" title). Delete the entire `<div>` for the Asaas card. The Gmail+Asaas section uses a 2-column grid — after removing Asaas, change it to a single card (no grid needed) or keep grid with just Gmail.

The Asaas card is the second child inside the grid `div` that contains both Gmail and Asaas cards. It starts with a `div` containing the terminal/monitor icon (`<rect>`) and "Asaas" text.

Remove only the Asaas card `<div>`. If the wrapping `<div>` uses `grid grid-cols-1 md:grid-cols-2`, simplify to `grid grid-cols-1` or just remove the grid wrapper since only Gmail remains.

**Step 2: Remove i18n keys**

In `messages/pt-BR.json`, `messages/en.json`, and `messages/es.json`, inside `settings.integrations`, remove these keys:
- `"asaas"`
- `"asaasDescription"`
- `"configuredViaEnv"`

**Step 3: Commit**

```bash
git add src/components/settings/integrations-tab.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "fix: remove Asaas card from integrations settings tab"
```

---

### Task 2: Add loading spinner to Login and Signup buttons

The login and signup pages use raw `<button>` elements instead of the `<Button>` component which already supports a `loading` prop with a `Loader2` spinner.

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

**Step 1: Update Login page**

In `src/app/(auth)/login/page.tsx`:

1. Add import: `import { Button } from "@/components/ui/button";`
2. Replace the submit `<button>` (lines 111-118) with:
```tsx
<Button
  type="submit"
  loading={loading}
  className="w-full"
  size="lg"
>
  {t("login.submit")}
</Button>
```
Note: Remove the ternary `{loading ? t("login.loading") : t("login.submit")}` — the `Button` component handles the spinner automatically.

3. Replace the Google OAuth `<button>` (lines 122-131) with:
```tsx
<Button
  type="button"
  variant="outline"
  onClick={handleGoogleLogin}
  className="w-full"
  size="lg"
>
  {t("login.google")}
</Button>
```

**Step 2: Update Signup page**

In `src/app/(auth)/signup/page.tsx`:

1. Add import: `import { Button } from "@/components/ui/button";`
2. Replace the submit `<button>` (lines 143-150) with:
```tsx
<Button
  type="submit"
  loading={loading}
  className="w-full"
  size="lg"
>
  {t("signup.submit")}
</Button>
```

**Step 3: Commit**

```bash
git add src/app/(auth)/login/page.tsx src/app/(auth)/signup/page.tsx
git commit -m "fix: add loading spinner to login and signup buttons"
```

---

### Task 3: Pre-populate insurance plans with common Brazilian plans

The current insurance plans tab (`Convênios`) starts empty and requires manual entry. Change it to show a predefined list of the most common Brazilian health insurance plans as toggleable chips. The user simply checks/unchecks which ones they accept, with the option to add custom ones.

**Files:**
- Modify: `src/components/settings/insurance-plans-list.tsx`
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Define the common plans list**

Add a constant array at the top of `insurance-plans-list.tsx` (after imports, before the component):

```tsx
const COMMON_PLANS = [
  "Unimed",
  "Bradesco Saúde",
  "SulAmérica",
  "Amil",
  "NotreDame Intermédica",
  "Hapvida",
  "Porto Seguro Saúde",
  "Cassi",
  "Prevent Senior",
  "São Cristóvão Saúde",
  "Golden Cross",
  "MedSênior",
  "Particular",
] as const;
```

**Step 2: Redesign the component**

Replace the current inline add form + badge list with a two-section layout:

**Section A — Common plans (toggleable chips):**
Show all `COMMON_PLANS` as chips. Each chip is either selected (accent background) or unselected (muted/outline). Clicking toggles it. Compare against `plans` state — a plan is "selected" if its name exists in the fetched list.

When user clicks an unselected common plan → `POST /api/settings/insurance-plans` with `{ name }`.
When user clicks a selected common plan → `DELETE /api/settings/insurance-plans/{id}`.

**Section B — Custom plans:**
Below the common plans, show any plans that are NOT in `COMMON_PLANS` as removable badges (same as current). Keep the inline input + "Adicionar" button for adding custom plans.

Here's the component structure:

```tsx
export function InsurancePlansList() {
  const t = useTranslations("settings.insurancePlans");
  const tc = useTranslations("common");

  const [plans, setPlans] = useState<InsurancePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingPlan, setTogglingPlan] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState<InsurancePlanRow | null>(null);

  // ... fetchList, handleAdd, handleDelete, executeDelete (keep same) ...

  // Set of selected plan names for quick lookup
  const selectedNames = new Set(plans.map((p) => p.name));

  // Custom plans = plans not in COMMON_PLANS
  const customPlans = plans.filter(
    (p) => !COMMON_PLANS.includes(p.name as typeof COMMON_PLANS[number])
  );

  async function toggleCommonPlan(name: string) {
    setTogglingPlan(name);
    try {
      if (selectedNames.has(name)) {
        // Remove
        const plan = plans.find((p) => p.name === name);
        if (plan) {
          const res = await fetch(`/api/settings/insurance-plans/${plan.id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setPlans((prev) => prev.filter((p) => p.id !== plan.id));
          }
        }
      } else {
        // Add
        const res = await fetch("/api/settings/insurance-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          const json = await res.json();
          setPlans((prev) => [...prev, json.data]);
        }
      }
    } finally {
      setTogglingPlan(null);
    }
  }

  // Render:
  // 1. Common plans grid (toggleable chips)
  // 2. Separator
  // 3. Custom plans (removable badges + add form)
}
```

For the common plan chips, use this visual pattern:
- **Selected:** `backgroundColor: "var(--accent-muted)"`, `borderColor: "var(--accent)"`, `color: "var(--accent)"`, border-2, with a `Check` icon
- **Unselected:** `backgroundColor: "var(--surface)"`, `borderColor: "var(--border)"`, `color: "var(--text-secondary)"`, border

Each chip shows the plan name. When `togglingPlan === name`, show a small spinner instead of check/nothing.

**Step 3: Add i18n keys**

In `messages/pt-BR.json`, add to `settings.insurancePlans`:
```json
"commonTitle": "Convênios populares",
"customTitle": "Outros convênios",
"customPlaceholder": "Adicionar outro convênio"
```

Same structure in `en.json`:
```json
"commonTitle": "Popular insurance plans",
"customTitle": "Other plans",
"customPlaceholder": "Add another plan"
```

And `es.json`:
```json
"commonTitle": "Planes populares",
"customTitle": "Otros planes",
"customPlaceholder": "Agregar otro plan"
```

**Step 4: Commit**

```bash
git add src/components/settings/insurance-plans-list.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: show common insurance plans as toggleable chips in settings"
```

---

### Task 4: Add CNPJ to clinic settings + registration number to professionals

**Files:**
- Create: `supabase/migrations/021_clinic_cnpj_professional_registration.sql`
- Modify: `src/types/database.ts`
- Modify: `src/lib/validations/settings.ts`
- Modify: `src/components/settings/clinic-form.tsx`
- Modify: `src/components/settings/professional-form.tsx`
- Modify: `src/app/api/settings/clinic/route.ts` (if needed — likely already passes through all validated fields)
- Modify: `src/app/api/settings/professionals/route.ts` (same)
- Modify: `messages/pt-BR.json`, `messages/en.json`, `messages/es.json`

**Step 1: Create migration**

Create `supabase/migrations/021_clinic_cnpj_professional_registration.sql`:

```sql
-- Add CNPJ to clinics (optional)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cnpj text;

-- Add registration number to professionals (optional, e.g., CRM, CRO)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS registration_number text;
```

Both columns are nullable (optional).

**Step 2: Update database types**

In `src/types/database.ts`, find the `clinics` table `Row` type and add:
```ts
cnpj: string | null
```

Find the `clinics` `Insert` and `Update` types and add:
```ts
cnpj?: string | null
```

Find the `professionals` table `Row` type and add:
```ts
registration_number: string | null
```

Find the `professionals` `Insert` and `Update` types and add:
```ts
registration_number?: string | null
```

**Step 3: Update validation schemas**

In `src/lib/validations/settings.ts`:

Add to `clinicSettingsSchema`:
```ts
cnpj: z.string().regex(/^\d{14}$/, "CNPJ must be 14 digits").optional().or(z.literal("")),
```

Add to `createProfessionalSchema`:
```ts
registration_number: z.string().max(30).optional().or(z.literal("")),
```

Add to `updateProfessionalSchema`:
```ts
registration_number: z.string().max(30).optional().or(z.literal("")),
```

**Step 4: Add CNPJ field to clinic form**

In `src/components/settings/clinic-form.tsx`:

1. Add state for `cnpj` field, initialized from `clinic.cnpj ?? ""`
2. Add a CNPJ input formatting function:
```tsx
function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length > 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  if (digits.length > 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  if (digits.length > 5)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length > 2)
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return digits;
}
```
3. Add a new `Input` field in the form grid, after the Name field (or after Phone, depending on visual preference). Use:
```tsx
<Input
  id="cnpj"
  label={t("cnpj")}
  value={cnpj}
  onChange={(e) => setCnpj(formatCnpj(e.target.value))}
  placeholder="00.000.000/0000-00"
  inputMode="numeric"
/>
```
4. Include `cnpj: cnpj.replace(/\D/g, "") || undefined` in the form data sent on save.

**Step 5: Add registration number to professional form**

In `src/components/settings/professional-form.tsx`:

1. Add state: `const [registrationNumber, setRegistrationNumber] = useState(professional?.registration_number ?? "");`
2. Add an `Input` field in Tab 0 (Dados), after the Specialty combobox:
```tsx
<Input
  id="registration_number"
  label={t("registrationNumber")}
  value={registrationNumber}
  onChange={(e) => setRegistrationNumber(e.target.value)}
  placeholder={t("registrationNumberPlaceholder")}
/>
```
3. Include `registration_number: registrationNumber || undefined` in the form data sent on save.

**Step 6: Add i18n keys**

In `messages/pt-BR.json`:

Add to `settings.clinic`:
```json
"cnpj": "CNPJ",
```

Add to `settings.professionals` (or `settings.professionalForm`):
```json
"registrationNumber": "Registro profissional",
"registrationNumberPlaceholder": "Ex: CRM 12345/SP"
```

In `messages/en.json`:
```json
"cnpj": "Tax ID (CNPJ)",
"registrationNumber": "Professional registration",
"registrationNumberPlaceholder": "e.g., CRM 12345/SP"
```

In `messages/es.json`:
```json
"cnpj": "CNPJ",
"registrationNumber": "Registro profesional",
"registrationNumberPlaceholder": "Ej: CRM 12345/SP"
```

**Step 7: Verify API routes pass through new fields**

Check `src/app/api/settings/clinic/route.ts` PUT handler — it should already use `clinicSettingsSchema.safeParse(body)` and spread the parsed data into the Supabase update. If so, `cnpj` will pass through automatically. Same for professionals.

If either route cherry-picks specific fields instead of spreading, add the new fields explicitly.

**Step 8: Commit**

```bash
git add supabase/migrations/021_clinic_cnpj_professional_registration.sql \
  src/types/database.ts \
  src/lib/validations/settings.ts \
  src/components/settings/clinic-form.tsx \
  src/components/settings/professional-form.tsx \
  messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add optional CNPJ to clinic settings and registration number to professionals"
```

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Add under DB Conventions:
- `clinics.cnpj` (text, nullable): optional CNPJ for the clinic.
- `professionals.registration_number` (text, nullable): optional professional registration (e.g., CRM, CRO).

**Commit:**
```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with cnpj and registration_number columns"
```
