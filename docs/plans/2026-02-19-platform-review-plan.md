# Platform Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical security, performance, and usability issues across the platform in one focused sprint.

**Architecture:** Inline fixes across API routes, cron routes, locale files, and components. New shared utilities for rate limiting and clinic ID auth. Toast notification system via sonner. Security headers via next.config.ts.

**Tech Stack:** @upstash/ratelimit + @upstash/redis (rate limiting), sonner (toast notifications), next.config.ts headers (security headers)

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install @upstash/ratelimit, @upstash/redis, and sonner**

```bash
npm install @upstash/ratelimit @upstash/redis sonner
```

**Step 2: Verify installation**

```bash
npm ls @upstash/ratelimit @upstash/redis sonner
```

Expected: all three packages listed with versions.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @upstash/ratelimit, @upstash/redis, sonner"
```

---

## Task 2: Add server-only Guard to Supabase Server Client

**Files:**
- Modify: `src/lib/supabase/server.ts:1`

**Step 1: Add import**

Add `import "server-only";` as the very first line of `src/lib/supabase/server.ts`, before the existing line 1 (`import { createServerClient } from "@supabase/ssr";`).

**Step 2: Verify build**

```bash
npx next build 2>&1 | head -20
```

Expected: No errors. The `server-only` guard only triggers if accidentally imported in a client component.

**Step 3: Commit**

```bash
git add src/lib/supabase/server.ts
git commit -m "security: add server-only guard to supabase server client"
```

---

## Task 3: Create Shared Rate Limiter Utility

**Files:**
- Create: `src/lib/rate-limit.ts`

**Step 1: Create the rate limiter**

Create `src/lib/rate-limit.ts`:

```typescript
import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** Standard: 60 req/min per user — for authenticated mutating endpoints */
export const standardRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "@orbita/standard",
});

/** Strict: 10 req/min per identifier — for auth/signup and payment link creation */
export const strictRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "@orbita/strict",
});

/**
 * Check rate limit and return a 429 Response if exceeded.
 * Returns null if within limit.
 *
 * Usage in API routes:
 * ```
 * const limited = await checkRateLimit(userId);
 * if (limited) return limited;
 * ```
 */
export async function checkRateLimit(
  identifier: string,
  type: "standard" | "strict" = "standard",
): Promise<Response | null> {
  // Skip in development or if Redis is not configured
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const limiter = type === "strict" ? strictRateLimit : standardRateLimit;
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset),
        "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
      },
    });
  }

  return null;
}
```

**Step 2: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat: add upstash rate limiter utility with standard and strict tiers"
```

---

## Task 4: Apply Rate Limiting to Critical API Routes

**Files:**
- Modify: `src/app/api/patients/route.ts` (POST handler)
- Modify: `src/app/api/patients/batch/route.ts` (POST handler)
- Modify: `src/app/api/invoices/route.ts` (POST handler)
- Modify: `src/app/api/invoices/[id]/payment-link/route.ts` (POST handler)
- Modify: `src/app/api/calendar/appointments/route.ts` (POST handler)
- Modify: `src/app/api/settings/clinic/route.ts` (PUT handler)
- Modify: `src/app/api/settings/professionals/route.ts` (POST handler)
- Modify: `src/app/api/settings/services/route.ts` (POST handler)

**Step 1: Add rate limit checks to each POST/PUT handler**

For each route above, add after the `getClinicId()` auth check:

```typescript
import { checkRateLimit } from "@/lib/rate-limit";

// Inside the handler, right after clinicId validation:
const limited = await checkRateLimit(clinicId);
if (limited) return limited;
```

For `invoices/[id]/payment-link/route.ts`, use strict rate limiting:

```typescript
const limited = await checkRateLimit(clinicId, "strict");
if (limited) return limited;
```

**Step 2: Verify type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/patients/route.ts src/app/api/patients/batch/route.ts src/app/api/invoices/route.ts src/app/api/invoices/[id]/payment-link/route.ts src/app/api/calendar/appointments/route.ts src/app/api/settings/clinic/route.ts src/app/api/settings/professionals/route.ts src/app/api/settings/services/route.ts
git commit -m "security: apply rate limiting to critical mutating API routes"
```

---

## Task 5: Remove Sensitive Data from API Responses

**Files:**
- Modify: `src/app/api/public/clinics/[slug]/route.ts:86`
- Modify: `src/app/api/invoices/route.ts:60`
- Modify: `src/app/api/invoices/[id]/route.ts:39-40`

**Step 1: Remove whatsapp_phone from public clinic response**

In `src/app/api/public/clinics/[slug]/route.ts`, line 86, change:

```typescript
// Before:
whatsapp_phone: clinic.whatsapp_phone_number_id ? clinic.phone : null,
// After:
has_whatsapp: !!clinic.whatsapp_phone_number_id,
```

This tells the frontend WhatsApp is available without exposing the phone number. Also remove `whatsapp_phone_number_id` from the `.select()` on line 19 — replace it with just checking existence. Actually, since we need to know if it's configured, keep it in the select but don't expose it.

**Step 2: Create CPF masking utility**

Add to `src/lib/utils/phone.ts` (or create `src/lib/utils/mask.ts`):

```typescript
/** Mask CPF: 123.456.789-00 → ***.***.*89-00 */
export function maskCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf; // don't mask invalid CPFs
  return `***.***.*${digits.slice(7, 9)}-${digits.slice(9)}`;
}
```

**Step 3: Mask CPF and remove asaas_customer_id from invoice list**

In `src/app/api/invoices/route.ts`, after the query (around line 90), map the results to mask CPF and remove asaas_customer_id:

```typescript
const sanitizedData = (data ?? []).map((inv) => ({
  ...inv,
  patients: inv.patients
    ? {
        id: inv.patients.id,
        name: inv.patients.name,
        phone: inv.patients.phone,
        cpf: maskCPF(inv.patients.cpf),
        email: inv.patients.email,
      }
    : null,
}));
```

Import `maskCPF` from the utility file. Do the same in `src/app/api/invoices/[id]/route.ts`.

**Step 4: Verify type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add src/app/api/public/clinics/[slug]/route.ts src/app/api/invoices/route.ts src/app/api/invoices/[id]/route.ts src/lib/utils/mask.ts
git commit -m "security: mask CPF, remove asaas_customer_id, hide whatsapp phone from public route"
```

---

## Task 6: Add Security Headers to next.config.ts

**Files:**
- Modify: `next.config.ts`

**Step 1: Add headers configuration**

Replace the empty config object in `next.config.ts`:

```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
```

Note: CSP is intentionally omitted for now — it requires careful tuning for inline styles (Tailwind) and scripts (Next.js). The other headers are safe to add immediately.

**Step 2: Verify build**

```bash
npx next build 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add next.config.ts
git commit -m "security: add HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers"
```

---

## Task 7: Extract Shared getClinicId() Utility

**Files:**
- Modify: `src/lib/supabase/server.ts` (already has it — just export properly)
- Modify: 10+ API routes to import from `@/lib/supabase/server` instead of defining locally

**Step 1: Verify server.ts already exports getClinicId()**

`src/lib/supabase/server.ts` already exports `getClinicId()` at lines 6-23. It's already the canonical implementation.

**Step 2: Replace inline definitions in API routes**

For each of these files, remove the local `getClinicId()` function and replace with an import:

```typescript
import { getClinicId } from "@/lib/supabase/server";
```

Files to update (remove local `async function getClinicId()` block):
1. `src/app/api/invoices/route.ts` (lines 6-23)
2. `src/app/api/invoices/[id]/route.ts`
3. `src/app/api/invoices/[id]/payment-link/route.ts`
4. `src/app/api/calendar/appointments/route.ts` (lines 8-25)
5. `src/app/api/calendar/appointments/[id]/route.ts`
6. `src/app/api/calendar/patients/search/route.ts`
7. `src/app/api/patients/route.ts`
8. `src/app/api/patients/[id]/route.ts`
9. `src/app/api/patients/batch/route.ts`
10. `src/app/api/appointments/route.ts`
11. `src/app/api/appointments/[id]/route.ts`
12. `src/app/api/appointments/available-slots/route.ts`

Each file currently imports `createServerSupabaseClient` and `createAdminClient` to build its own `getClinicId`. After replacing, each file only needs `getClinicId` from the import — remove unused imports of `createServerSupabaseClient` if it's only used by the local getClinicId.

**Step 3: Verify type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/lib/supabase/server.ts src/app/api/invoices/ src/app/api/calendar/ src/app/api/patients/ src/app/api/appointments/
git commit -m "refactor: deduplicate getClinicId — import from shared server utility"
```

---

## Task 8: Batch Cron Queries — Confirmations

**Files:**
- Modify: `src/app/api/cron/confirmations/route.ts` (lines 77-267)

**Step 1: Refactor the sequential loop to batched queries**

Replace the for-loop (lines 77-267) with a batched approach. After fetching `pendingEntries` (line 56), add:

```typescript
// Batch-fetch all related entities
const appointmentIds = [...new Set(pendingEntries.map((e) => e.appointment_id))];
const clinicIds = [...new Set(pendingEntries.map((e) => e.clinic_id))];

const [appointmentsResult, clinicsResult] = await Promise.all([
  supabase
    .from("appointments")
    .select("id, status, starts_at, patient_id, professional_id")
    .in("id", appointmentIds),
  supabase
    .from("clinics")
    .select("id, timezone, whatsapp_phone_number_id, whatsapp_access_token, is_active")
    .in("id", clinicIds),
]);

const appointmentsMap = new Map(
  (appointmentsResult.data ?? []).map((a) => [a.id, a]),
);
const clinicsMap = new Map(
  (clinicsResult.data ?? []).map((c) => [c.id, c]),
);

// Collect patient and professional IDs from appointments
const patientIds = [...new Set(
  (appointmentsResult.data ?? [])
    .map((a) => a.patient_id)
    .filter(Boolean),
)];
const professionalIds = [...new Set(
  (appointmentsResult.data ?? [])
    .map((a) => a.professional_id)
    .filter(Boolean),
)];

const [patientsResult, professionalsResult] = await Promise.all([
  patientIds.length > 0
    ? supabase.from("patients").select("id, name, phone").in("id", patientIds)
    : { data: [] },
  professionalIds.length > 0
    ? supabase.from("professionals").select("id, name").in("id", professionalIds)
    : { data: [] },
]);

const patientsMap = new Map(
  (patientsResult.data ?? []).map((p) => [p.id, p]),
);
const professionalsMap = new Map(
  (professionalsResult.data ?? []).map((p) => [p.id, p]),
);
```

Then replace the inner loop to use map lookups instead of individual queries:

```typescript
for (const entry of pendingEntries) {
  try {
    const appointment = appointmentsMap.get(entry.appointment_id);
    if (!appointment) {
      await markFailed(supabase, entry.id);
      failed++;
      continue;
    }

    if (SKIPPED_STATUSES.includes(appointment.status)) {
      await markFailed(supabase, entry.id);
      failed++;
      continue;
    }

    const patient = patientsMap.get(appointment.patient_id);
    if (!patient) {
      await markFailed(supabase, entry.id);
      failed++;
      continue;
    }

    const professionalName = appointment.professional_id
      ? (professionalsMap.get(appointment.professional_id)?.name ?? "o profissional")
      : "o profissional";

    const clinic = clinicsMap.get(entry.clinic_id);
    if (!clinic || !clinic.is_active) {
      await markFailed(supabase, entry.id);
      failed++;
      continue;
    }

    // ... rest of the logic (business hours check, send template) stays the same
  }
}
```

**Step 2: Verify build**

```bash
npx next build 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/app/api/cron/confirmations/route.ts
git commit -m "perf: batch-fetch entities in confirmations cron (400+ queries → 5)"
```

---

## Task 9: Batch Cron Queries — Recall

**Files:**
- Modify: `src/app/api/cron/recall/route.ts`

**Step 1: Refactor to batch recall_queue existence check**

Read the current file. Find the inner loop that checks `recall_queue` for each patient. Replace with a single batch query:

```typescript
// Before the loop, fetch all existing recall entries for this clinic
const { data: existingRecalls } = await supabase
  .from("recall_queue")
  .select("patient_id")
  .eq("clinic_id", clinicId)
  .in("status", ["pending", "sent"]);

const existingPatientIds = new Set(
  (existingRecalls ?? []).map((r) => r.patient_id),
);

// Then in the loop:
if (existingPatientIds.has(patient.id)) continue; // Already queued
```

**Step 2: Commit**

```bash
git add src/app/api/cron/recall/route.ts
git commit -m "perf: batch recall queue existence check (N queries → 1)"
```

---

## Task 10: Add Cache Headers to Dashboard & Reports APIs

**Files:**
- Modify: `src/app/api/dashboard/kpis/route.ts:162`
- Modify: `src/app/api/reports/overview/route.ts` (final return statement)
- Modify: `src/app/api/dashboard/alerts/route.ts` (final return statement)

**Step 1: Add cache headers to KPIs response**

In `src/app/api/dashboard/kpis/route.ts`, change the final `return` (line 162) from:

```typescript
return NextResponse.json({ data: { ... } });
```

To:

```typescript
return NextResponse.json(
  { data: { ... } },
  {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  },
);
```

**Step 2: Add cache headers to reports overview**

In `src/app/api/reports/overview/route.ts`, same pattern:

```typescript
headers: { "Cache-Control": "private, max-age=300" },
```

**Step 3: Add cache headers to alerts**

In `src/app/api/dashboard/alerts/route.ts`:

```typescript
headers: { "Cache-Control": "private, max-age=30" },
```

**Step 4: Commit**

```bash
git add src/app/api/dashboard/kpis/route.ts src/app/api/reports/overview/route.ts src/app/api/dashboard/alerts/route.ts
git commit -m "perf: add cache headers to dashboard KPIs (60s), reports (300s), alerts (30s)"
```

---

## Task 11: Move Google Calendar Sync to after()

**Files:**
- Modify: `src/app/api/calendar/appointments/route.ts:148-195`

**Step 1: Wrap calendar sync in after()**

In `src/app/api/calendar/appointments/route.ts`, the current code (lines 148-193) does Google Calendar sync synchronously before returning. Wrap it with `after()`:

```typescript
import { after } from "next/server";

// ... after appointment insert and enqueueConfirmations ...

// Move the Google Calendar sync to after() — non-blocking
after(async () => {
  try {
    const admin = createAdminClient();
    const { data: professional } = await admin
      .from("professionals")
      .select("name, google_calendar_id, google_refresh_token")
      .eq("id", parsed.data.professional_id)
      .single();

    if (professional?.google_refresh_token && professional?.google_calendar_id) {
      const { data: patient } = await admin
        .from("patients")
        .select("name")
        .eq("id", parsed.data.patient_id)
        .single();

      const { data: clinic } = await admin
        .from("clinics")
        .select("name, timezone")
        .eq("id", clinicId)
        .single();

      const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";
      const patientName = (patient?.name as string) ?? "Patient";
      const clinicName = (clinic?.name as string) ?? "Clinic";

      const eventResult = await createEvent(
        professional.google_refresh_token as string,
        professional.google_calendar_id as string,
        {
          summary: `${patientName} — ${clinicName}`,
          startTime: parsed.data.starts_at,
          endTime: parsed.data.ends_at,
          timezone,
        },
      );

      if (eventResult.success && eventResult.eventId) {
        await admin
          .from("appointments")
          .update({ google_event_id: eventResult.eventId })
          .eq("id", appointment.id);
      }
    }
  } catch (err) {
    console.error("[calendar] Google Calendar sync error:", err);
  }
});

return NextResponse.json({ data: appointment }, { status: 201 });
```

**Step 2: Apply same pattern to `src/app/api/appointments/route.ts`**

If that route also has synchronous Google Calendar sync, apply the same `after()` pattern.

**Step 3: Verify build**

```bash
npx next build 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/app/api/calendar/appointments/route.ts src/app/api/appointments/route.ts
git commit -m "perf: defer google calendar sync to after() — 3-5s faster appointment creation"
```

---

## Task 12: Add Missing error.tsx Files

**Files:**
- Create: `src/app/(dashboard)/inbox/error.tsx`
- Create: `src/app/(dashboard)/modules/error.tsx`
- Create: `src/app/(dashboard)/payments/error.tsx`
- Create: `src/app/(dashboard)/reports/error.tsx`
- Create: `src/app/(dashboard)/settings/error.tsx`
- Create: `src/app/(dashboard)/team/error.tsx`
- Create: `src/app/(dashboard)/public-page/error.tsx`

**Step 1: Create error.tsx for each route**

All 7 files use the exact same content (matching the existing pattern at `src/app/(dashboard)/error.tsx`):

```typescript
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          {t("error")}
        </p>
        <Button variant="secondary" onClick={reset}>
          {t("tryAgain")}
        </Button>
      </div>
    </PageContainer>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/inbox/error.tsx src/app/(dashboard)/modules/error.tsx src/app/(dashboard)/payments/error.tsx src/app/(dashboard)/reports/error.tsx src/app/(dashboard)/settings/error.tsx src/app/(dashboard)/team/error.tsx src/app/(dashboard)/public-page/error.tsx
git commit -m "ux: add error.tsx to 7 missing dashboard routes"
```

---

## Task 13: Fix Hardcoded Portuguese Strings

**Files:**
- Modify: `src/components/patients/patients-view.tsx` (4 instances)
- Modify: `src/components/payments/payments-view.tsx` (1 instance)
- Modify: `src/components/payments/invoice-detail-panel.tsx` (1 instance)
- Modify: `src/components/settings/insurance-plans-list.tsx` (2 instances)
- Modify: `src/components/settings/professional-form.tsx` (2 instances — locale ternary)
- Modify: `src/components/settings/professionals-list.tsx` (2 instances)
- Modify: `src/components/settings/services-list.tsx` (3 instances — locale ternary)
- Modify: `src/components/team/team-content.tsx` (1 instance)

**Step 1: Add common keys to locale files (if missing)**

The `common` namespace in `messages/pt-BR.json`, `messages/en.json`, `messages/es.json` already has: `save`, `cancel`, `delete`, `edit`, `loading`, `error`, `success`, `tryAgain`.

Add missing keys if needed:

```json
"common": {
  // ... existing keys ...
  "confirm": "Confirmar",
  "attention": "Atenção",
  "deleteConfirm": "Tem certeza?"
}
```

(Check each locale file for equivalent translations.)

**Step 2: Replace hardcoded strings in each file**

For each file, find hardcoded `"Excluir"`, `"Cancelar"`, `"Salvar"`, `"Atenção"` and replace with `t("common.cancel")`, `t("common.delete")`, `t("common.save")`, etc.

The key anti-patterns to kill:

In `professional-form.tsx` and `services-list.tsx`, replace:
```typescript
// BEFORE (anti-pattern):
{t("name") === "Nome" ? "Cancelar" : "Cancel"}
// AFTER:
{tc("cancel")}
```

Where `tc` is `useTranslations("common")`. Each component already calls `useTranslations()` — add a second call:

```typescript
const t = useTranslations("settings");
const tc = useTranslations("common");
```

Then use `tc("cancel")`, `tc("delete")`, `tc("save")` everywhere.

**Step 3: Verify type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/patients/patients-view.tsx src/components/payments/payments-view.tsx src/components/payments/invoice-detail-panel.tsx src/components/settings/insurance-plans-list.tsx src/components/settings/professional-form.tsx src/components/settings/professionals-list.tsx src/components/settings/services-list.tsx src/components/team/team-content.tsx messages/
git commit -m "i18n: replace 23 hardcoded portuguese strings with t() calls, kill locale ternary anti-pattern"
```

---

## Task 14: Add Toast Notification System (sonner)

**Files:**
- Modify: `src/app/layout.tsx:43` (add Toaster)
- Modify: `src/components/payments/payments-view.tsx` (replace alert())
- Modify: other components with silent form closes

**Step 1: Add Toaster to root layout**

In `src/app/layout.tsx`, add the Toaster component. Since this is a Server Component layout and `Toaster` is a client component, import it directly:

```typescript
import { Toaster } from "sonner";

// In the JSX, after ThemeProvider:
<ThemeProvider>
  {children}
  <Toaster position="top-right" richColors closeButton />
</ThemeProvider>
```

Note: `sonner`'s `Toaster` is a client component but can be placed in a server layout — it handles the "use client" boundary internally.

**Step 2: Replace alert() calls**

In `src/components/payments/payments-view.tsx`, find `alert(t("errors.updateError"))` and replace with:

```typescript
import { toast } from "sonner";

// Replace:
alert(t("errors.updateError"));
// With:
toast.error(t("errors.updateError"));
```

**Step 3: Add success toasts to silent form saves**

In components that call `onSuccess()` without feedback (e.g., `patient-form-dialog.tsx`), add:

```typescript
import { toast } from "sonner";

// Before onSuccess():
toast.success(tc("success"));
onSuccess();
```

Apply to:
- `src/components/patients/patient-form-dialog.tsx`
- `src/components/settings/professional-form.tsx`
- `src/components/settings/services-list.tsx`

**Step 4: Verify build**

```bash
npx next build 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/payments/payments-view.tsx src/components/patients/patient-form-dialog.tsx src/components/settings/professional-form.tsx src/components/settings/services-list.tsx
git commit -m "ux: add sonner toast system, replace alert() calls, add success feedback to forms"
```

---

## Task 15: Fix Form Submit Button Spinners

**Files:**
- Modify: `src/components/settings/professional-form.tsx`
- Modify: any other forms using `"..."` instead of `<Button loading>`

**Step 1: Replace "..." with loading prop**

In `src/components/settings/professional-form.tsx`, find:

```typescript
// BEFORE:
{loading ? "..." : effectiveId ? t("edit") : t("add")}
// AFTER — use the Button's loading prop:
<Button type="submit" loading={loading}>
  {effectiveId ? t("edit") : t("add")}
</Button>
```

The `Button` component (at `src/components/ui/button.tsx:44`) already renders a `Loader2` spinner when `loading={true}` and disables the button. This means you can also remove any manual `disabled={loading}` since the Button handles it.

**Step 2: Apply to all submit buttons with "..." pattern**

Search for `"..."` in component files and replace each with the `loading` prop.

**Step 3: Commit**

```bash
git add src/components/settings/professional-form.tsx
git commit -m "ux: use Button loading prop instead of '...' text on form submits"
```

---

## Task 16: Selective Field Fetching on Heavy Queries

**Files:**
- Modify: `src/app/api/invoices/route.ts:59-60`

**Step 1: Optimize invoice list select**

In `src/app/api/invoices/route.ts`, replace:

```typescript
// BEFORE:
.select(
  "*, patients!inner(id, name, phone, cpf, email, asaas_customer_id), payment_links(*)",
  { count: "exact" },
)
// AFTER:
.select(
  "id, status, amount_cents, due_date, notes, created_at, patient_id, patients!inner(id, name, phone, cpf, email), payment_links(id, url, method, status, amount_cents)",
  { count: "exact" },
)
```

Note: `asaas_customer_id` is already removed in Task 5. This step further reduces the `*` wildcard to only needed fields.

**Step 2: Verify the frontend still works**

Check that the payments page only uses the fields listed above. If it references additional fields like `updated_at`, add them to the select.

**Step 3: Commit**

```bash
git add src/app/api/invoices/route.ts
git commit -m "perf: optimize invoice list query — select only needed fields"
```

---

## Task 17: Final Verification

**Step 1: Run type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Run tests**

```bash
npm run test
```

Expected: All tests pass.

**Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 4: Update CLAUDE.md**

Add new env vars section for Upstash:
- `UPSTASH_REDIS_REST_URL` — Upstash Redis URL for rate limiting
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis token

Add to dependencies table:
- `sonner` — Toast notifications

Note in security section that rate limiting is now active via `checkRateLimit()`.

**Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with rate limiting env vars and sonner dependency"
```
