# Auto-Billing Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an opt-in auto-billing step to the onboarding wizard that, when enabled, automatically creates invoices and payment links when appointments are booked, and includes payment reminders in confirmation messages.

**Architecture:** Side-effect approach — `handleBookAppointment` creates invoice + payment link as a deterministic business rule (no LLM decision). Configuration stored in `module_configs.settings.auto_billing`. Shared helper `isAutoBillingEnabled()` used by scheduling and confirmation agents.

**Tech Stack:** Next.js 16 App Router, LangChain agents, Supabase, Asaas payments API, next-intl i18n, Zod validation, Vitest

**Design doc:** `docs/plans/2026-02-18-auto-billing-onboarding-design.md`

---

## Task 1: Shared Helper — `isAutoBillingEnabled`

**Files:**
- Create: `src/lib/billing/auto-billing.ts`
- Test: `src/__tests__/lib/billing/auto-billing.test.ts`

**Step 1: Write the failing test**

```ts
// src/__tests__/lib/billing/auto-billing.test.ts
import { describe, it, expect, vi } from "vitest";
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";

describe("isAutoBillingEnabled", () => {
  it("returns true when auto_billing is true in settings", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { settings: { auto_billing: true } },
        error: null,
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(true);
  });

  it("returns false when auto_billing is false", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { settings: { auto_billing: false } },
        error: null,
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(false);
  });

  it("returns false when settings is empty object", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { settings: {} },
        error: null,
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(false);
  });

  it("returns false when module_config not found", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/billing/auto-billing.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```ts
// src/lib/billing/auto-billing.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checks if auto-billing is enabled for a clinic via module_configs.settings.
 * Returns false on any error or missing config (safe default).
 */
export async function isAutoBillingEnabled(
  supabase: SupabaseClient,
  clinicId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", clinicId)
    .eq("module_type", "billing")
    .single();

  const settings = data?.settings as Record<string, unknown> | null;
  return settings?.auto_billing === true;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/billing/auto-billing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/billing/auto-billing.ts src/__tests__/lib/billing/auto-billing.test.ts
git commit -m "feat: add isAutoBillingEnabled helper for module_configs check"
```

---

## Task 2: i18n Keys — Billing Onboarding Step

**Files:**
- Modify: `messages/pt-BR.json` (onboarding section)
- Modify: `messages/en.json` (onboarding section)
- Modify: `messages/es.json` (onboarding section)

**Step 1: Add billing onboarding keys to pt-BR**

Add new key block `onboarding.stepBilling` in `messages/pt-BR.json`, after the existing `onboarding.step2` keys (step2 = Team & Services):

```json
"stepBilling": {
  "title": "Cobrança",
  "subtitle": "Configure a cobrança automática para consultas agendadas",
  "toggleLabel": "Cobrança automática",
  "toggleDescription": "Gera uma cobrança automaticamente para cada consulta agendada, com base no preço do serviço do profissional.",
  "enabledInfo": "Ao agendar, o paciente receberá um link de pagamento. Lembretes serão enviados nas confirmações.",
  "disabledInfo": "Cobranças podem ser criadas manualmente pelo painel de pagamentos."
}
```

**Step 2: Add billing onboarding keys to en**

```json
"stepBilling": {
  "title": "Billing",
  "subtitle": "Configure automatic billing for scheduled appointments",
  "toggleLabel": "Automatic billing",
  "toggleDescription": "Automatically generates an invoice for each scheduled appointment based on the professional's service price.",
  "enabledInfo": "When booking, the patient will receive a payment link. Reminders will be sent with confirmations.",
  "disabledInfo": "Invoices can be created manually from the payments dashboard."
}
```

**Step 3: Add billing onboarding keys to es**

```json
"stepBilling": {
  "title": "Facturación",
  "subtitle": "Configure la facturación automática para citas programadas",
  "toggleLabel": "Facturación automática",
  "toggleDescription": "Genera automáticamente un cobro para cada cita programada, basado en el precio del servicio del profesional.",
  "enabledInfo": "Al agendar, el paciente recibirá un enlace de pago. Se enviarán recordatorios con las confirmaciones.",
  "disabledInfo": "Los cobros pueden crearse manualmente desde el panel de pagos."
}
```

**Step 4: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add i18n keys for billing onboarding step"
```

---

## Task 3: API Endpoint — Update Billing Module Settings

**Files:**
- Create: `src/app/api/settings/modules/billing/route.ts`
- Test: `src/__tests__/api/settings/modules/billing.test.ts`

**Step 1: Write the failing test**

```ts
// src/__tests__/api/settings/modules/billing.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase before imports
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from: mockFrom,
  }),
}));

describe("PUT /api/settings/modules/billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Chain: from().select().eq().eq().single()
    mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle });
  });

  it("updates auto_billing to true", async () => {
    // Mock clinic lookup
    mockSingle.mockResolvedValueOnce({
      data: { clinic_id: "clinic-1" },
      error: null,
    });
    // Mock module_configs update
    mockSingle.mockResolvedValueOnce({
      data: { id: "mc-1", settings: { auto_billing: true } },
      error: null,
    });

    const { PUT } = await import("@/app/api/settings/modules/billing/route");
    const request = new Request("http://localhost/api/settings/modules/billing", {
      method: "PUT",
      body: JSON.stringify({ auto_billing: true }),
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.settings.auto_billing).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/settings/modules/billing.test.ts`
Expected: FAIL — module not found

**Step 3: Write the API route**

```ts
// src/app/api/settings/modules/billing/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateBillingSettingsSchema = z.object({
  auto_billing: z.boolean(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clinicUser } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .single();

  if (!clinicUser) {
    return NextResponse.json({ error: "No clinic found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", clinicUser.clinic_id)
    .eq("module_type", "billing")
    .single();

  if (error) {
    return NextResponse.json({ error: "Module config not found" }, { status: 404 });
  }

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  return NextResponse.json({ data: { auto_billing: settings.auto_billing === true } });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateBillingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: clinicUser } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .single();

  if (!clinicUser) {
    return NextResponse.json({ error: "No clinic found" }, { status: 404 });
  }

  // Read current settings, merge with new value
  const { data: current } = await supabase
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", clinicUser.clinic_id)
    .eq("module_type", "billing")
    .single();

  const currentSettings = (current?.settings ?? {}) as Record<string, unknown>;
  const newSettings = { ...currentSettings, auto_billing: parsed.data.auto_billing };

  const { data, error } = await supabase
    .from("module_configs")
    .update({ settings: newSettings })
    .eq("clinic_id", clinicUser.clinic_id)
    .eq("module_type", "billing")
    .select("id, settings")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/settings/modules/billing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/settings/modules/billing/route.ts src/__tests__/api/settings/modules/billing.test.ts
git commit -m "feat: add API endpoint for billing module settings"
```

---

## Task 4: Signup Route — Initialize Billing Settings

**Files:**
- Modify: `src/app/api/auth/signup/route.ts` (line ~78-92, moduleInserts)

**Step 1: Update module insert to set billing settings**

In `src/app/api/auth/signup/route.ts`, change the `moduleInserts` mapping (~line 78-92) to explicitly set `settings` for the billing module:

```ts
const moduleInserts = moduleTypes.map((type) => ({
  clinic_id: clinic.id,
  module_type: type,
  enabled: true,
  settings: type === "billing" ? { auto_billing: false } : {},
}));
```

This changes only the billing module's initial settings — all others stay `{}`.

**Step 2: Commit**

```bash
git add src/app/api/auth/signup/route.ts
git commit -m "feat: initialize billing module with auto_billing: false on signup"
```

---

## Task 5: Onboarding Wizard — Add Billing Step

**Files:**
- Modify: `src/components/onboarding/setup-wizard.tsx`

This is a UI-heavy task. The wizard currently has 5 steps (TOTAL_STEPS = 5). We insert a new step 4 between "Team & Services" (current step 3) and "WhatsApp" (current step 4 → becomes step 5).

**Step 1: Update constants and step labels**

In `setup-wizard.tsx`:

- Change `TOTAL_STEPS` from `5` to `6` (line 19)
- Add `autoBilling` to the component state
- Update `stepLabels` array to insert billing step at index 3:

```ts
const TOTAL_STEPS = 6;

// Inside component, add state:
const [autoBilling, setAutoBilling] = useState(false);

// Update stepLabels:
const stepLabels = [
  t("step1.title"),        // 1: Clinic
  t("stepHours.title"),    // 2: Hours
  t("step2.title"),        // 3: Team & Services
  t("stepBilling.title"),  // 4: Billing (NEW)
  t("step3.title"),        // 5: WhatsApp (was 4)
  t("step4.title"),        // 6: Google Calendar (was 5)
];
```

**Step 2: Add save function for billing step**

```ts
const saveStepBilling = async () => {
  const res = await fetch("/api/settings/modules/billing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auto_billing: autoBilling }),
  });
  if (!res.ok) throw new Error("Failed to save billing settings");
};
```

**Step 3: Add StepBilling component**

Add inside the wizard file, a new step component:

```tsx
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
      </div>
      <p className="text-sm text-muted-foreground">
        {autoBilling
          ? t("stepBilling.enabledInfo")
          : t("stepBilling.disabledInfo")}
      </p>
    </div>
  );
}
```

**Step 4: Wire billing step into the wizard flow**

Update the step rendering switch/conditional to include step 4 (billing):
- Step 4 renders `<StepBilling autoBilling={autoBilling} setAutoBilling={setAutoBilling} t={t} />`
- `canAdvance` for step 4: always true (toggle has a default)
- `handleNext` for step 4: calls `saveStepBilling()`
- Shift existing step 4 (WhatsApp) to step 5 and step 5 (Calendar) to step 6

**Step 5: Update auto-step detection**

The wizard auto-advances on mount (lines 107-153). Add billing step detection:
- Fetch `GET /api/settings/modules/billing` to check if `auto_billing` was already configured
- If the billing module_configs has been touched (has any non-empty settings), consider step complete

**Step 6: Commit**

```bash
git add src/components/onboarding/setup-wizard.tsx
git commit -m "feat: add billing toggle step to onboarding wizard"
```

---

## Task 6: Scheduling Agent — `save_patient_billing_info` Tool

**Files:**
- Modify: `src/lib/agents/agents/scheduling.ts`

**Step 1: Add the tool definition**

Add after existing tool definitions (around line 230):

```ts
const savePatientBillingInfoTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "save_patient_billing_info",
      cpf: input.cpf,
      email: input.email,
    });
  },
  {
    name: "save_patient_billing_info",
    description:
      "Saves the patient's CPF and/or email for billing purposes. Call this BEFORE book_appointment when the patient is missing CPF or email and auto-billing is enabled.",
    schema: z.object({
      cpf: z
        .string()
        .optional()
        .describe("Patient's CPF (11 digits, numbers only). Only include if the patient provided it."),
      email: z
        .string()
        .email()
        .optional()
        .describe("Patient's email address. Only include if the patient provided it."),
    }),
  }
);
```

**Step 2: Add the handler function**

```ts
async function handleSavePatientBillingInfo(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const cpf = typeof args.cpf === "string" ? args.cpf.replace(/\D/g, "") : undefined;
  const email = typeof args.email === "string" ? args.email.trim() : undefined;

  if (cpf && cpf.length !== 11) {
    return { result: "Invalid CPF. Must be exactly 11 digits." };
  }

  if (!cpf && !email) {
    return { result: "No CPF or email provided. Ask the patient for at least one." };
  }

  const updates: Record<string, string> = {};
  if (cpf) updates.cpf = cpf;
  if (email) updates.email = email;

  const { error } = await context.supabase
    .from("patients")
    .update(updates)
    .eq("id", context.recipientId);

  if (error) {
    console.error("[scheduling] Failed to save billing info:", error);
    return { result: "Failed to save patient billing information. Try again." };
  }

  const saved = [cpf && "CPF", email && "email"].filter(Boolean).join(" and ");
  return { result: `Patient ${saved} saved successfully. You can now proceed with booking.` };
}
```

**Step 3: Register handler in `handleToolCall`**

In the scheduling agent's `handleToolCall` switch statement, add:

```ts
case "save_patient_billing_info":
  return handleSavePatientBillingInfo(toolCall.args, context);
```

**Step 4: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts
git commit -m "feat: add save_patient_billing_info tool to scheduling agent"
```

---

## Task 7: Scheduling Agent — Auto-Invoice in `handleBookAppointment`

**Files:**
- Modify: `src/lib/agents/agents/scheduling.ts` (handleBookAppointment function, ~line 376-529)

**Step 1: Add imports at top of file**

```ts
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";
import {
  createCustomer,
  createCharge,
  getPixQrCode,
} from "@/services/asaas";
```

**Step 2: Add auto-billing logic after appointment creation**

Inside `handleBookAppointment`, after the `enqueueConfirmations()` call (~line 435) and before the Google Calendar sync section, add:

```ts
// --- Auto-billing: create invoice + payment link ---
let billingAppendix = "";
const autoBilling = await isAutoBillingEnabled(context.supabase, context.clinicId);

if (autoBilling && appointment) {
  try {
    // 1. Get price from professional_services (fallback to service base price)
    let priceCents = 0;
    if (serviceId) {
      const { data: profService } = await context.supabase
        .from("professional_services")
        .select("price_cents")
        .eq("professional_id", professionalId)
        .eq("service_id", serviceId)
        .single();

      if (profService?.price_cents) {
        priceCents = profService.price_cents;
      } else {
        // Fallback: service base price
        const { data: service } = await context.supabase
          .from("services")
          .select("base_price_cents")
          .eq("id", serviceId)
          .single();
        priceCents = service?.base_price_cents ?? 0;
      }
    }

    if (priceCents > 0) {
      // 2. Create invoice
      const dueDate = startsAt.split("T")[0]; // YYYY-MM-DD from ISO
      const { data: invoice, error: invError } = await context.supabase
        .from("invoices")
        .insert({
          clinic_id: context.clinicId,
          patient_id: context.recipientId,
          appointment_id: appointment.id,
          amount_cents: priceCents,
          due_date: dueDate,
          status: "pending",
        })
        .select("id")
        .single();

      if (invError || !invoice) {
        console.error("[scheduling] Failed to create auto-invoice:", invError);
      } else {
        // 3. Try to create payment link
        const { data: patient } = await context.supabase
          .from("patients")
          .select("id, name, phone, email, cpf, asaas_customer_id")
          .eq("id", context.recipientId)
          .single();

        if (patient?.cpf) {
          // Ensure Asaas customer
          let customerId = patient.asaas_customer_id;
          if (!customerId) {
            const customerResult = await createCustomer({
              name: patient.name,
              cpfCnpj: patient.cpf,
              phone: patient.phone ?? undefined,
              email: patient.email ?? undefined,
              externalReference: patient.id,
            });
            if (customerResult.success && customerResult.customerId) {
              customerId = customerResult.customerId;
              await context.supabase
                .from("patients")
                .update({ asaas_customer_id: customerId })
                .eq("id", patient.id);
            }
          }

          if (customerId) {
            // Create charge (universal link)
            const chargeResult = await createCharge({
              customerId,
              billingType: "UNDEFINED",
              valueCents: priceCents,
              dueDate,
              description: `Consulta - ${dueDate}`,
              externalReference: invoice.id,
            });

            if (chargeResult.success && chargeResult.chargeId) {
              const paymentUrl = chargeResult.invoiceUrl ?? "";
              let pixPayload: string | undefined;

              // Try to get PIX QR code
              try {
                const pixResult = await getPixQrCode(chargeResult.chargeId);
                if (pixResult.success && pixResult.payload) {
                  pixPayload = pixResult.payload;
                }
              } catch {
                // PIX QR is optional — continue without it
              }

              // Insert payment_links row
              await context.supabase.from("payment_links").insert({
                clinic_id: context.clinicId,
                invoice_id: invoice.id,
                asaas_payment_id: chargeResult.chargeId,
                url: paymentUrl,
                invoice_url: chargeResult.invoiceUrl ?? null,
                method: "link",
                status: "active",
                pix_payload: pixPayload ?? null,
              });

              // Format amount for display
              const amountFormatted = `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;
              billingAppendix = `\n\n💳 Pagamento: ${amountFormatted}\n🔗 Link: ${paymentUrl}`;
              if (pixPayload) {
                billingAppendix += `\n\nPix copia e cola:\n${pixPayload}`;
              }
            }
          }
        }
        // If no CPF or Asaas fails: invoice exists, payment link created later by billing cron/agent
      }
    }
  } catch (err) {
    console.error("[scheduling] Auto-billing error (non-fatal):", err);
    // Non-fatal: appointment was already created successfully
  }
}
```

**Step 3: Include billing appendix in the return**

Modify the existing return statement to include the billing appendix:

```ts
return {
  result: `Appointment booked with ${profName} on ${formattedDate} at ${formattedTime}.`,
  appendToResponse: billingAppendix || undefined,
};
```

**Step 4: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts
git commit -m "feat: auto-create invoice and payment link on booking when auto_billing enabled"
```

---

## Task 8: Scheduling Agent — Conditional Tools and System Prompt

**Files:**
- Modify: `src/lib/agents/agents/scheduling.ts` (getTools + buildSystemPrompt)

**Step 1: Make `getTools` conditionally include billing tool**

The `getTools` method currently returns a fixed array (~line 881-890). Modify it to accept agent options and conditionally include `save_patient_billing_info`:

```ts
getTools(options: AgentToolOptions): StructuredToolInterface[] {
  const tools = [
    checkAvailabilityTool,
    bookAppointmentTool,
    rescheduleAppointmentTool,
    cancelAppointmentTool,
    listPatientAppointmentsTool,
    escalateToHumanTool,
  ];

  // Include billing info tool when auto_billing is active
  if (options.agentConfig?.auto_billing) {
    tools.push(savePatientBillingInfoTool);
  }

  return tools;
}
```

**Step 2: Pass auto_billing flag via agent config**

In `src/lib/agents/process-message.ts`, the `agentConfig_` is read from `agents.config` JSONB (~line 234). We need to also check `module_configs.settings` and pass `auto_billing` into the agent options.

Add after loading the agent row (~line 230-234):

```ts
// Check auto_billing from module_configs
const { data: billingConfig } = await supabase
  .from("module_configs")
  .select("settings")
  .eq("clinic_id", clinicId)
  .eq("module_type", "billing")
  .single();

const autoBilling = (billingConfig?.settings as Record<string, unknown>)?.auto_billing === true;
const agentConfig_ = { ...(agentRow?.config ?? {}), auto_billing: autoBilling };
```

**Step 3: Add billing instructions to system prompt**

In the scheduling agent's `buildSystemPrompt` or `getInstructions`, add conditional billing instructions. In the BASE_PROMPTS for each locale, add a placeholder, then conditionally include it:

For `pt-BR`:
```
IMPORTANT — Cobrança automática:
- Antes de agendar, verifique se o paciente tem CPF e email. Se faltar algum, peça educadamente usando a tool save_patient_billing_info.
- Após o agendamento, uma cobrança e link de pagamento serão gerados automaticamente. NÃO fabrique URLs de pagamento.
- Se o paciente já tem CPF e email, prossiga direto para o agendamento.
```

For `en`:
```
IMPORTANT — Automatic billing:
- Before booking, verify the patient has CPF and email. If either is missing, ask politely and save using the save_patient_billing_info tool.
- After booking, an invoice and payment link will be generated automatically. NEVER fabricate payment URLs.
- If the patient already has CPF and email, proceed directly to booking.
```

For `es`:
```
IMPORTANT — Facturación automática:
- Antes de agendar, verifique que el paciente tenga CPF y email. Si falta alguno, pida amablemente y guarde usando la tool save_patient_billing_info.
- Después de agendar, se generará automáticamente un cobro y enlace de pago. NUNCA fabrique URLs de pago.
- Si el paciente ya tiene CPF y email, proceda directamente al agendamiento.
```

The prompt should only include these instructions when `auto_billing` is active. Read from `params` to decide.

**Step 4: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts src/lib/agents/process-message.ts
git commit -m "feat: conditional billing tools and system prompt in scheduling agent"
```

---

## Task 9: Confirmation Agent — Payment Reminder

**Files:**
- Modify: `src/lib/agents/agents/confirmation.ts` (handleConfirmAttendance function, ~line 153-189)

**Step 1: Add import**

```ts
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";
import { createCustomer, createCharge, getPixQrCode } from "@/services/asaas";
```

**Step 2: Add payment check after attendance confirmation**

In `handleConfirmAttendance`, after updating appointment status and confirmation_queue (~line 189), add:

```ts
// --- Payment reminder if auto-billing enabled ---
let paymentAppendix = "";
const autoBilling = await isAutoBillingEnabled(context.supabase, context.clinicId);

if (autoBilling && appointment) {
  // Check for pending invoice linked to this appointment
  const { data: invoice } = await context.supabase
    .from("invoices")
    .select("id, amount_cents, due_date, status")
    .eq("appointment_id", appointment.id)
    .in("status", ["pending", "overdue"])
    .single();

  if (invoice) {
    // Check for existing active payment link
    const { data: existingLink } = await context.supabase
      .from("payment_links")
      .select("url, pix_payload")
      .eq("invoice_id", invoice.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const amountFormatted = `R$ ${(invoice.amount_cents / 100).toFixed(2).replace(".", ",")}`;

    if (existingLink?.url) {
      paymentAppendix = `\n\n⚠️ Pagamento pendente: ${amountFormatted}\n🔗 Link: ${existingLink.url}`;
      if (existingLink.pix_payload) {
        paymentAppendix += `\n\nPix copia e cola:\n${existingLink.pix_payload}`;
      }
    } else {
      // Try to create payment link if none exists
      try {
        const { data: patient } = await context.supabase
          .from("patients")
          .select("id, name, phone, email, cpf, asaas_customer_id")
          .eq("id", context.recipientId)
          .single();

        if (patient?.cpf) {
          let customerId = patient.asaas_customer_id;
          if (!customerId) {
            const customerResult = await createCustomer({
              name: patient.name,
              cpfCnpj: patient.cpf,
              phone: patient.phone ?? undefined,
              email: patient.email ?? undefined,
              externalReference: patient.id,
            });
            if (customerResult.success && customerResult.customerId) {
              customerId = customerResult.customerId;
              await context.supabase
                .from("patients")
                .update({ asaas_customer_id: customerId })
                .eq("id", patient.id);
            }
          }

          if (customerId) {
            const chargeResult = await createCharge({
              customerId,
              billingType: "UNDEFINED",
              valueCents: invoice.amount_cents,
              dueDate: invoice.due_date,
              description: `Consulta - ${invoice.due_date}`,
              externalReference: invoice.id,
            });

            if (chargeResult.success && chargeResult.chargeId) {
              const paymentUrl = chargeResult.invoiceUrl ?? "";
              let pixPayload: string | undefined;

              try {
                const pixResult = await getPixQrCode(chargeResult.chargeId);
                if (pixResult.success && pixResult.payload) {
                  pixPayload = pixResult.payload;
                }
              } catch { /* optional */ }

              await context.supabase.from("payment_links").insert({
                clinic_id: context.clinicId,
                invoice_id: invoice.id,
                asaas_payment_id: chargeResult.chargeId,
                url: paymentUrl,
                invoice_url: chargeResult.invoiceUrl ?? null,
                method: "link",
                status: "active",
                pix_payload: pixPayload ?? null,
              });

              paymentAppendix = `\n\n⚠️ Pagamento pendente: ${amountFormatted}\n🔗 Link: ${paymentUrl}`;
              if (pixPayload) {
                paymentAppendix += `\n\nPix copia e cola:\n${pixPayload}`;
              }
            }
          }
        }
      } catch (err) {
        console.error("[confirmation] Payment link creation error (non-fatal):", err);
      }
    }
  }
}

return {
  result: "Appointment confirmed successfully. The patient will attend.",
  appendToResponse: paymentAppendix || undefined,
};
```

**Step 3: Commit**

```bash
git add src/lib/agents/agents/confirmation.ts
git commit -m "feat: add payment reminder to confirmation agent when auto_billing enabled"
```

---

## Task 10: Cancel Appointment — Cancel Linked Invoice

**Files:**
- Modify: `src/lib/agents/agents/scheduling.ts` (handleCancelAppointment function, ~line 659-735)

**Step 1: Add invoice cancellation after appointment cancellation**

In `handleCancelAppointment`, after updating appointment status to `cancelled` (~line 689-693), add:

```ts
// Cancel linked invoice if auto-billing created one
const { data: linkedInvoice } = await context.supabase
  .from("invoices")
  .select("id, status")
  .eq("appointment_id", appointmentId)
  .in("status", ["pending", "overdue"])
  .single();

if (linkedInvoice) {
  await context.supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", linkedInvoice.id);

  // Also expire any active payment links
  await context.supabase
    .from("payment_links")
    .update({ status: "expired" })
    .eq("invoice_id", linkedInvoice.id)
    .eq("status", "active");
}
```

**Step 2: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts
git commit -m "feat: cancel linked invoice when appointment is cancelled"
```

---

## Task 11: Reschedule — Cancel Invoice on Reschedule

**Files:**
- Modify: `src/lib/agents/agents/confirmation.ts` (handleRescheduleFromConfirmation)

**Step 1: Add invoice cancellation in reschedule handler**

In `handleRescheduleFromConfirmation`, after cancelling the appointment and before routing to scheduling, add the same invoice cancellation logic:

```ts
// Cancel linked invoice (new one will be created on rebooking if auto_billing enabled)
const { data: linkedInvoice } = await context.supabase
  .from("invoices")
  .select("id, status")
  .eq("appointment_id", appointmentId)
  .in("status", ["pending", "overdue"])
  .single();

if (linkedInvoice) {
  await context.supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", linkedInvoice.id);

  await context.supabase
    .from("payment_links")
    .update({ status: "expired" })
    .eq("invoice_id", linkedInvoice.id)
    .eq("status", "active");
}
```

**Step 2: Commit**

```bash
git add src/lib/agents/agents/confirmation.ts
git commit -m "feat: cancel linked invoice on appointment reschedule"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add documentation for auto-billing**

Add to the Database section:
```
- `module_configs.settings.auto_billing` (boolean): opt-in flag for automatic invoice creation on booking. Stored in billing module's settings JSONB.
```

Add to Settings API Routes:
```
| `/api/settings/modules/billing` | GET, PUT | Billing module auto_billing toggle |
```

Add a note to the Agent Architecture section about the scheduling agent's conditional tools:
```
- `scheduling` agent conditionally includes `save_patient_billing_info` tool when `auto_billing` is enabled
- `handleBookAppointment` auto-creates invoice + payment link when `auto_billing` is enabled
- `handleConfirmAttendance` includes payment reminder when `auto_billing` is enabled and invoice is pending
- Cancel/reschedule auto-cancels linked invoices and expires payment links
```

Update Registered Agent Types table to add `save_patient_billing_info` to scheduling tools.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with auto-billing integration details"
```

---

## Task 13: Integration Testing

**Files:**
- Create: `src/__tests__/lib/agents/scheduling-auto-billing.test.ts`

**Step 1: Write integration tests for the auto-billing flow**

Test the key scenarios:
1. `handleBookAppointment` with `auto_billing = true` → creates invoice + payment link
2. `handleBookAppointment` with `auto_billing = false` → no invoice created
3. `handleBookAppointment` with `auto_billing = true` but no service price → no invoice
4. `handleBookAppointment` with `auto_billing = true` but patient has no CPF → invoice created, no payment link
5. `handleCancelAppointment` → linked invoice cancelled
6. `handleConfirmAttendance` with pending invoice → appendToResponse includes payment URL
7. `handleConfirmAttendance` without pending invoice → no payment appendix

Mock: Supabase client, Asaas service functions.

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/__tests__/lib/agents/scheduling-auto-billing.test.ts
git commit -m "test: add integration tests for auto-billing flow"
```

---

## Task 14: Build Verification

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | `isAutoBillingEnabled` helper | `src/lib/billing/auto-billing.ts` |
| 2 | i18n keys for billing step | `messages/*.json` |
| 3 | API endpoint for billing settings | `src/app/api/settings/modules/billing/route.ts` |
| 4 | Signup init billing settings | `src/app/api/auth/signup/route.ts` |
| 5 | Onboarding wizard billing step | `src/components/onboarding/setup-wizard.tsx` |
| 6 | `save_patient_billing_info` tool | `src/lib/agents/agents/scheduling.ts` |
| 7 | Auto-invoice in `handleBookAppointment` | `src/lib/agents/agents/scheduling.ts` |
| 8 | Conditional tools + prompt | `scheduling.ts` + `process-message.ts` |
| 9 | Confirmation payment reminder | `src/lib/agents/agents/confirmation.ts` |
| 10 | Cancel → cancel invoice | `src/lib/agents/agents/scheduling.ts` |
| 11 | Reschedule → cancel invoice | `src/lib/agents/agents/confirmation.ts` |
| 12 | CLAUDE.md documentation | `CLAUDE.md` |
| 13 | Integration tests | `src/__tests__/lib/agents/` |
| 14 | Build verification | — |
