# Add Credit Card Support + Webhook Hardening — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Asaas payment integration to accept credit/debit cards alongside PIX and boleto, and harden the webhook handler to properly verify, deduplicate, and update payment statuses.

**Architecture:** The Asaas API supports `billingType: "CREDIT_CARD"` which creates a hosted checkout page (`invoiceUrl`) where patients enter card details securely. This is the same flow as PIX/boleto — create charge, send link, patient pays, webhook notifies us. No card details pass through our backend. When `billingType` is `CREDIT_CARD`, the Asaas checkout page also enables debit card payments automatically.

**Tech Stack:** Asaas REST API, Supabase (PostgreSQL + RLS), LangChain tools, Vitest

---

## Summary of Changes

| Area | What Changes |
|------|-------------|
| DB Migration | Expand `payment_links.method` CHECK to include `'credit_card'` |
| Service | Add `"CREDIT_CARD"` to `billingType` union |
| Billing Agent | Add `"credit_card"` to tool schema, update prompts |
| Webhook | Add token verification, idempotency, refund handling |
| Bug Fix | Fix `description` → `notes` column reference in billing agent |
| Tests | Cover all new paths |
| CLAUDE.md | Document new payment method |

---

## Task 1: Database Migration — Expand `payment_links.method` Constraint

**Files:**
- Create: `supabase/migrations/011_add_credit_card_method.sql`

**Step 1: Write the migration**

```sql
-- 011_add_credit_card_method.sql
-- Expand payment_links.method CHECK constraint to include credit_card

ALTER TABLE payment_links
  DROP CONSTRAINT IF EXISTS payment_links_method_check;

ALTER TABLE payment_links
  ADD CONSTRAINT payment_links_method_check
  CHECK (method IN ('pix', 'boleto', 'credit_card'));
```

**Step 2: Commit**

```bash
git add supabase/migrations/011_add_credit_card_method.sql
git commit -m "feat: add credit_card to payment_links method constraint"
```

---

## Task 2: Service Layer — Add CREDIT_CARD Billing Type

**Files:**
- Modify: `src/services/asaas.ts` (lines 91-98)

**Step 1: Write the failing test**

Add to `src/__tests__/services/asaas.test.ts` inside the `createCharge` describe block:

```ts
it("creates CREDIT_CARD charge", async () => {
  global.fetch = mockFetchSuccess({
    id: "pay_card_003",
    invoiceUrl: "https://asaas.com/i/pay_card_003",
    status: "PENDING",
  });

  const result = await createCharge({
    customerId: "cus_abc123",
    billingType: "CREDIT_CARD",
    valueCents: 30000,
    dueDate: "2026-03-20",
    description: "Consulta cardiologia",
  });

  expect(result).toEqual({
    success: true,
    chargeId: "pay_card_003",
    invoiceUrl: "https://asaas.com/i/pay_card_003",
    bankSlipUrl: undefined,
    status: "PENDING",
  });

  const callBody = JSON.parse(
    (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
  );
  expect(callBody.value).toBe(300);
  expect(callBody.billingType).toBe("CREDIT_CARD");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/asaas.test.ts`
Expected: FAIL — TypeScript error: `"CREDIT_CARD"` is not assignable to `"PIX" | "BOLETO"`.

**Step 3: Update the service — add CREDIT_CARD to billingType**

In `src/services/asaas.ts`, change line 93:

```ts
// Before:
billingType: "PIX" | "BOLETO";

// After:
billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/asaas.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/asaas.ts src/__tests__/services/asaas.test.ts
git commit -m "feat: add CREDIT_CARD billing type to asaas service"
```

---

## Task 3: Billing Agent — Add Credit Card to Tool Schema + Handler

**Files:**
- Modify: `src/lib/agents/agents/billing.ts` (multiple locations)
- Modify: `src/__tests__/lib/agents/billing.test.ts`

### Step 1: Write the failing test

Add to `src/__tests__/lib/agents/billing.test.ts` inside `describe("create_payment_link")`:

```ts
it("creates a credit card payment link and returns URL", async () => {
  const { createCharge: mockCreateCharge } = await import("@/services/asaas");

  const mockSupabase = createBillingMockSupabase();
  const context = createToolCallContext({
    supabase: mockSupabase as unknown as ToolCallContext["supabase"],
  });

  const result: ToolCallResult = await config.handleToolCall(
    {
      name: "create_payment_link",
      args: { invoice_id: "inv-123", method: "credit_card" },
    },
    context
  );

  expect(result.result).toBeDefined();
  expect(result.result).toContain("Payment link created");
  expect(result.result).toContain("CREDIT_CARD");
  expect(result.appendToResponse).toBeDefined();
  expect(result.appendToResponse).toContain("https://www.asaas.com/i/abc123");

  // Should NOT call getPixQrCode for credit card
  const { getPixQrCode: mockGetPixQrCode } = await import("@/services/asaas");
  expect(mockGetPixQrCode).not.toHaveBeenCalled();

  // Verify billingType passed to createCharge
  expect(mockCreateCharge).toHaveBeenCalledWith(
    expect.objectContaining({ billingType: "CREDIT_CARD" })
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/agents/billing.test.ts`
Expected: FAIL — `"credit_card"` is not accepted by the tool schema.

### Step 3: Update the tool schema

In `src/lib/agents/agents/billing.ts`, update the `createPaymentLinkTool` schema (around line 125-133):

```ts
// Before:
schema: z.object({
  invoice_id: z
    .string()
    .describe("The ID of the invoice to generate a payment link for"),
  method: z
    .enum(["pix", "boleto"])
    .describe("The payment method: 'pix' for instant Pix payment or 'boleto' for bank slip"),
}),

// After:
schema: z.object({
  invoice_id: z
    .string()
    .describe("The ID of the invoice to generate a payment link for"),
  method: z
    .enum(["pix", "boleto", "credit_card"])
    .describe("The payment method: 'pix' for instant Pix payment, 'boleto' for bank slip, or 'credit_card' for credit/debit card"),
}),
```

### Step 4: Update the tool description

```ts
// Before:
description:
  "Generates a payment link for a specific invoice. Call this when the patient needs a link to pay via Pix or boleto.",

// After:
description:
  "Generates a payment link for a specific invoice. Call this when the patient needs a link to pay via Pix, boleto, or credit/debit card.",
```

### Step 5: Update handleCreatePaymentLink — billingType mapping

In `src/lib/agents/agents/billing.ts`, update the billingType mapping in `handleCreatePaymentLink` (around line 341):

```ts
// Before:
const billingType = method === "pix" ? "PIX" : "BOLETO";
const chargeResult = await createCharge({
  customerId,
  billingType: billingType as "PIX" | "BOLETO",
  ...
});

// After:
const BILLING_TYPE_MAP: Record<string, "PIX" | "BOLETO" | "CREDIT_CARD"> = {
  pix: "PIX",
  boleto: "BOLETO",
  credit_card: "CREDIT_CARD",
};
const billingType = BILLING_TYPE_MAP[method] ?? "PIX";
const chargeResult = await createCharge({
  customerId,
  billingType,
  ...
});
```

### Step 6: Fix the `description` → `notes` bug

In `src/lib/agents/agents/billing.ts`, update the query around line 309-311:

```ts
// Before:
.select(
  "id, amount_cents, due_date, description, clinic_id, patients!inner(id, name, phone, email, cpf, asaas_customer_id)"
)

// After:
.select(
  "id, amount_cents, due_date, notes, clinic_id, patients!inner(id, name, phone, email, cpf, asaas_customer_id)"
)
```

And update the reference from `invoice.description` to `invoice.notes` around line 347:

```ts
// Before:
description: (invoice.description as string) ?? undefined,

// After:
description: (invoice.notes as string) ?? undefined,
```

### Step 7: Run tests to verify they pass

Run: `npx vitest run src/__tests__/lib/agents/billing.test.ts`
Expected: PASS (all tests including the new credit_card test)

### Step 8: Commit

```bash
git add src/lib/agents/agents/billing.ts src/__tests__/lib/agents/billing.test.ts
git commit -m "feat: add credit card support to billing agent tool"
```

---

## Task 4: Update Billing Agent System Prompts

**Files:**
- Modify: `src/lib/agents/agents/billing.ts` (BASE_PROMPTS + INSTRUCTIONS)

### Step 1: Update pt-BR prompt

In `BASE_PROMPTS["pt-BR"]`, update references from "Pix ou boleto" to include credit card:

```ts
// Line ~28: change
"3. Pergunte apenas o metodo de pagamento (Pix ou boleto) se o paciente ainda nao informou."
// To:
"3. Pergunte apenas o metodo de pagamento (Pix, boleto ou cartao de credito/debito) se o paciente ainda nao informou."
```

### Step 2: Update en prompt

In `BASE_PROMPTS["en"]`, update similarly:

```ts
// Line ~50: change
"3. Only ask for the payment method (Pix or boleto) if the patient hasn't specified it yet."
// To:
"3. Only ask for the payment method (Pix, boleto, or credit/debit card) if the patient hasn't specified it yet."
```

### Step 3: Update es prompt

In `BASE_PROMPTS["es"]`, update similarly:

```ts
// Line ~72: change
"3. Solo pregunta el metodo de pago (Pix o boleto) si el paciente aun no lo informo."
// To:
"3. Solo pregunta el metodo de pago (Pix, boleto o tarjeta de credito/debito) si el paciente aun no lo informo."
```

### Step 4: Update INSTRUCTIONS

```ts
// Before:
const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Gerencie cobrancas e pagamentos via Pix e boleto, envie lembretes...",
  en: "Manage billing and payments via Pix and boleto, send reminders...",
  es: "Gestiona cobros y pagos via Pix y boleto, envia recordatorios...",
};

// After:
const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Gerencie cobrancas e pagamentos via Pix, boleto e cartao de credito/debito, envie lembretes com tom adaptado e processe confirmacoes de pagamento.",
  en: "Manage billing and payments via Pix, boleto, and credit/debit card, send reminders with adapted tone, and process payment confirmations.",
  es: "Gestiona cobros y pagos via Pix, boleto y tarjeta de credito/debito, envia recordatorios con tono adaptado y procesa confirmaciones de pago.",
};
```

### Step 5: Run the prompt tests

Run: `npx vitest run src/__tests__/lib/agents/billing.test.ts`
Expected: PASS — prompt tests check for keywords like "pagamento", "payment", "pago" which still exist.

### Step 6: Commit

```bash
git add src/lib/agents/agents/billing.ts
git commit -m "feat: update billing agent prompts for credit card support"
```

---

## Task 5: Webhook Hardening — Token Verification

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`
- Modify: `src/__tests__/app/api/webhooks/asaas.test.ts`

### Step 1: Write the failing tests

Add to `src/__tests__/app/api/webhooks/asaas.test.ts`:

```ts
// Add mock for verifyWebhookToken
vi.mock("@/services/asaas", () => ({
  verifyWebhookToken: vi.fn().mockReturnValue(true),
}));

// After imports:
import { verifyWebhookToken } from "@/services/asaas";
const mockVerifyWebhookToken = vi.mocked(verifyWebhookToken);
```

Add new test cases:

```ts
it("returns 401 when webhook token is invalid", async () => {
  mockVerifyWebhookToken.mockReturnValueOnce(false);

  const req = new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": "wrong_token",
    },
    body: JSON.stringify({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_abc", externalReference: "inv-1" },
    }),
  });

  const res = await POST(req);
  expect(res.status).toBe(401);
});

it("accepts request when webhook token is valid", async () => {
  mockVerifyWebhookToken.mockReturnValueOnce(true);

  const req = createRequest({
    event: "PAYMENT_RECEIVED",
    payment: {
      id: "pay_abc123",
      externalReference: "invoice-uuid-1",
      paymentDate: "2026-02-14",
    },
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.status).toBe("ok");
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run src/__tests__/app/api/webhooks/asaas.test.ts`
Expected: FAIL — no token verification in the route.

### Step 3: Add token verification to the webhook route

Update `src/app/api/webhooks/asaas/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookToken } from "@/services/asaas";

export const dynamic = "force-dynamic";

const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

export async function POST(request: Request) {
  // Verify webhook token
  const receivedToken = request.headers.get("asaas-access-token") ?? "";
  if (!verifyWebhookToken(receivedToken)) {
    console.warn("[asaas-webhook] Invalid or missing webhook token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ... rest of handler unchanged
```

### Step 4: Update existing tests to include the mock

Update `beforeEach` to reset the mock, and update `createRequest` helper so existing tests still pass (since mock returns `true` by default).

### Step 5: Run tests to verify they pass

Run: `npx vitest run src/__tests__/app/api/webhooks/asaas.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add src/app/api/webhooks/asaas/route.ts src/__tests__/app/api/webhooks/asaas.test.ts
git commit -m "fix: add webhook token verification to asaas handler"
```

---

## Task 6: Webhook Hardening — Idempotency + Refund Handling

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`
- Modify: `src/__tests__/app/api/webhooks/asaas.test.ts`

### Step 1: Write the failing tests

Add to `src/__tests__/app/api/webhooks/asaas.test.ts`:

```ts
it("skips duplicate paid event when invoice is already paid", async () => {
  // Mock: invoice already has status "paid"
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { status: "paid" },
      error: null,
    }),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === "invoices") return selectChain;
    return { update: mockUpdate, eq: mockEq };
  });

  const req = createRequest({
    event: "PAYMENT_RECEIVED",
    payment: {
      id: "pay_dup",
      externalReference: "invoice-already-paid",
      paymentDate: "2026-02-14",
    },
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.status).toBe("already_processed");
});

it("handles PAYMENT_REFUNDED by updating invoice status", async () => {
  const req = createRequest({
    event: "PAYMENT_REFUNDED",
    payment: {
      id: "pay_refund_001",
      externalReference: "invoice-uuid-4",
    },
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.status).toBe("ok");
  expect(json.event).toBe("PAYMENT_REFUNDED");

  expect(mockFrom).toHaveBeenCalledWith("invoices");
  expect(mockFrom).toHaveBeenCalledWith("payment_links");
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run src/__tests__/app/api/webhooks/asaas.test.ts`
Expected: FAIL — no idempotency check, PAYMENT_REFUNDED is ignored.

### Step 3: Update the webhook handler

In `src/app/api/webhooks/asaas/route.ts`, add refund events and idempotency:

```ts
const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);
const REFUND_EVENTS = new Set(["PAYMENT_REFUNDED"]);

// Inside POST handler, after extracting invoiceId:

// Only process known events
if (!PAID_EVENTS.has(event) && !OVERDUE_EVENTS.has(event) && !REFUND_EVENTS.has(event)) {
  return NextResponse.json({ status: "ignored", event });
}

// ... after creating supabase client:

// Idempotency: check current invoice status before updating
if (PAID_EVENTS.has(event)) {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .single();

  if (invoice?.status === "paid") {
    console.log(`[asaas-webhook] Invoice ${invoiceId} already paid, skipping`);
    return NextResponse.json({ status: "already_processed", invoiceId, event });
  }

  // Update payment_links and invoices...
}

// Handle refund events
if (REFUND_EVENTS.has(event)) {
  await supabase
    .from("payment_links")
    .update({ status: "active" })
    .eq("invoice_id", invoiceId);

  await supabase
    .from("invoices")
    .update({ status: "pending", paid_at: null })
    .eq("id", invoiceId);

  console.log(`[asaas-webhook] Invoice ${invoiceId} refunded`);
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run src/__tests__/app/api/webhooks/asaas.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/app/api/webhooks/asaas/route.ts src/__tests__/app/api/webhooks/asaas.test.ts
git commit -m "fix: add idempotency and refund handling to asaas webhook"
```

---

## Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Update the Payments section

In the tech stack or billing agent documentation, ensure credit card is mentioned alongside PIX and boleto.

In the billing agent tools table, the `create_payment_link` tool description should reflect the new methods.

### Step 2: Commit

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for credit card support"
```

---

## Task 8: Run All Tests + Type Check

### Step 1: Run full test suite

Run: `npx vitest run`
Expected: ALL PASS

### Step 2: Run TypeScript type check

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Final commit if any fixes needed

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Asaas might not return `invoiceUrl` for `CREDIT_CARD` charges without card details | Confirmed by Asaas docs: hosted checkout works for all billing types |
| Token verification breaks existing webhooks if env var not set | `verifyWebhookToken()` already handles missing env var — returns `false` and logs |
| DB migration breaks existing data | `DROP CONSTRAINT IF EXISTS` + new constraint is additive — existing `pix`/`boleto` values remain valid |
| Debit card not explicitly listed | Asaas enables debit card automatically on the checkout page when `billingType` is `CREDIT_CARD` |

## Key Design Decisions

1. **Hosted checkout only** — No card details pass through our backend. Patients enter card info on Asaas's secure page. This avoids PCI compliance requirements.
2. **`CREDIT_CARD` not `UNDEFINED`** — Using explicit billing type gives us control. `UNDEFINED` would also work but is less intentional.
3. **Debit card via same method** — Asaas automatically enables debit on the checkout page for `CREDIT_CARD` type. No separate `debit_card` method needed.
4. **Refund handling** — Reverts invoice to `pending` (not a new `refunded` status) to keep the schema unchanged and allow re-payment.
