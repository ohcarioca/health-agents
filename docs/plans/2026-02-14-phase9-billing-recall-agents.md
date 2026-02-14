# Phase 9: Billing + Recall Agents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the final two agents — Billing (payment collection via Asaas) and Recall (inactive patient reactivation) — completing the full patient revenue and retention cycle.

**Architecture:** The Billing agent manages invoices and charges via Asaas API (Pix + boleto), sends drip reminders with tone adaptation based on NPS score (promoter=friendly, neutral=professional, detractor=careful), and processes payment confirmations via webhook. Asaas requires a customer-first model (create customer → create charge → get payment URL), so we store `asaas_customer_id` on patients to avoid duplicate creation. The Recall agent runs a daily batch scan for patients without appointments in >90 days and sends reactivation messages. Both agents reuse the existing outbound messaging infrastructure (rate limiting, business hours) from Phase 8.

**Tech Stack:** LangChain + OpenAI, Supabase (invoices + payment_links + recall_queue tables already exist from Phase 2), Asaas API v3 (charges, customers, webhooks), Meta WhatsApp Business API, Vercel Cron, next-intl for i18n.

---

## Asaas API Reference

**Base URLs:**
- Production: `https://api.asaas.com/v3`
- Sandbox: `https://api-sandbox.asaas.com/v3`

**Auth:** API key via header `access_token: $ASAAS_API_KEY`

**Key endpoints used:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v3/customers` | Create customer (required before charging) |
| POST | `/v3/payments` | Create charge (Pix/boleto) |
| GET | `/v3/payments/{id}` | Get charge status |
| GET | `/v3/payments/{id}/pixQrCode` | Get PIX QR code + copia-e-cola |
| GET | `/v3/payments/{id}/identificationField` | Get boleto linha digitável |

**Critical difference from Pagar.me:** Asaas values are in **BRL (reais)**, NOT cents. Our DB stores cents. Always convert: `amount_cents / 100` when sending to Asaas, and `value * 100` when reading from Asaas.

**Webhook auth:** Token-based — Asaas sends configured token in `asaas-access-token` header. Verify with `crypto.timingSafeEqual()`.

**Payment event flow:**
- PIX: `PAYMENT_CREATED` → `PAYMENT_RECEIVED`
- Boleto: `PAYMENT_CREATED` → `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED`
- Overdue: `PAYMENT_CREATED` → `PAYMENT_OVERDUE` → (then confirmed/received when paid)

**Webhook payload:**
```json
{
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_xxx",
    "customer": "cus_xxx",
    "billingType": "PIX",
    "value": 150.00,
    "status": "RECEIVED",
    "invoiceUrl": "https://www.asaas.com/i/xxx",
    "externalReference": "invoice-uuid-here"
  }
}
```

Sources: [Asaas API Docs](https://docs.asaas.com/reference/comece-por-aqui), [Payment Events](https://docs.asaas.com/docs/payment-events), [Webhooks](https://docs.asaas.com/docs/about-webhooks)

---

## Prerequisite Context

**Existing infrastructure you'll use:**
- Agent registry: `src/lib/agents/registry.ts` — `registerAgentType()` / `getAgentType()`
- Agent barrel: `src/lib/agents/index.ts` — side-effect imports auto-register agents
- Agent types: `src/lib/agents/types.ts` — `AgentTypeConfig`, `ToolCallResult`, etc.
- Engine: `src/lib/agents/engine.ts` — `chatWithToolLoop()` (max 5 iterations)
- Outbound: `src/lib/agents/outbound.ts` — `sendOutboundMessage()`, `sendOutboundTemplate()`, `isWithinBusinessHours()`, `canSendToPatient()`
- WhatsApp service: `src/services/whatsapp.ts` — `sendTextMessage()`, `sendTemplateMessage()`
- Process message: `src/lib/agents/process-message.ts` — full orchestration pipeline
- Cron auth pattern: `crypto.timingSafeEqual()` with `CRON_SECRET` (see `src/app/api/cron/confirmations/route.ts`)

**Existing DB tables (already created in Phase 2 migrations):**
- `invoices` — `id, clinic_id, patient_id, appointment_id, amount_cents, status (pending|partial|paid|overdue|cancelled), due_date, paid_at, notes`
- `payment_links` — `id, clinic_id, invoice_id, pagarme_link_id, url, method (pix|boleto), status (active|paid|expired)`
- `recall_queue` — `id, clinic_id, patient_id, last_visit_at, status (pending|processing|sent|responded|opted_out), sent_at, attempts`

**Existing types:** `Invoice`, `PaymentLink`, `RecallQueueItem` already exported from `src/types/index.ts`.

**Existing agent pattern to follow:** `src/lib/agents/agents/confirmation.ts` and `src/lib/agents/agents/nps.ts`. Each agent has: BASE_PROMPTS (3 locales), INSTRUCTIONS (3 locales), tool stubs, handler functions, config object, `registerAgentType()` call.

**Test pattern to follow:** `src/__tests__/lib/agents/confirmation.test.ts` — mock `server-only`, mock `@langchain/openai`, mock Supabase with `createChainable()` / `createMockSupabase()` factory, test registration, tools, prompts, instructions, and tool handlers.

---

## Task 1: DB Migration — Asaas fields on patients + payment_links

The Asaas API requires a customer ID before creating charges. Store `asaas_customer_id` on patients. Also rename `pagarme_link_id` to `asaas_payment_id` on `payment_links` for clarity.

**Files:**
- Create: `supabase/migrations/007_asaas_integration.sql`

**Step 1: Write the migration**

```sql
-- 007_asaas_integration.sql
-- Add Asaas customer ID to patients for charge creation
-- Rename pagarme_link_id to asaas_payment_id on payment_links

-- Patients: store Asaas customer ID to avoid duplicate creation
alter table patients
  add column if not exists asaas_customer_id text;

create unique index if not exists idx_patients_asaas_customer
  on patients (asaas_customer_id)
  where asaas_customer_id is not null;

-- Payment links: rename pagarme_link_id → asaas_payment_id
alter table payment_links
  rename column pagarme_link_id to asaas_payment_id;

-- Payment links: add invoice_url for Asaas universal payment page
alter table payment_links
  add column if not exists invoice_url text;

-- Payment links: add pix_payload for copia-e-cola
alter table payment_links
  add column if not exists pix_payload text;

-- Payment links: add boleto_identification_field for linha digitável
alter table payment_links
  add column if not exists boleto_identification_field text;
```

**Step 2: Apply migration to Supabase**

Run: Apply via Supabase dashboard SQL editor or `supabase db push`.

**Step 3: Update generated types**

Run: `npx supabase gen types typescript --project-id <project_id> > src/types/database.ts` (or update manually to add the new columns).

**Step 4: Commit**

```bash
git add supabase/migrations/007_asaas_integration.sql src/types/database.ts
git commit -m "feat: add Asaas integration columns to patients and payment_links"
```

---

## Task 2: Asaas Service

Build the external service integration for Asaas payment gateway.

**Files:**
- Create: `src/services/asaas.ts`
- Test: `src/__tests__/services/asaas.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/services/asaas.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("server-only", () => ({}));

import {
  createCustomer,
  createCharge,
  getChargeStatus,
  getPixQrCode,
  getBoletoIdentificationField,
  verifyWebhookToken,
} from "@/services/asaas";

describe("asaas service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASAAS_API_KEY = "test-api-key";
    process.env.ASAAS_WEBHOOK_TOKEN = "test-webhook-token";
    process.env.ASAAS_ENV = "sandbox";
  });

  describe("createCustomer", () => {
    it("creates a customer and returns the Asaas ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "cus_abc123",
          name: "João Silva",
          cpfCnpj: "12345678900",
        }),
      });

      const result = await createCustomer({
        name: "João Silva",
        cpfCnpj: "12345678900",
        phone: "5521999998888",
        email: "joao@example.com",
        externalReference: "patient-uuid-1",
      });

      expect(result.success).toBe(true);
      expect(result.customerId).toBe("cus_abc123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api-sandbox.asaas.com/v3/customers",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            access_token: "test-api-key",
          }),
        })
      );
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ errors: [{ description: "Invalid CPF" }] }),
      });

      const result = await createCustomer({
        name: "Test",
        cpfCnpj: "invalid",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("createCharge", () => {
    it("creates a PIX charge and returns invoiceUrl", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pay_abc123",
          status: "PENDING",
          invoiceUrl: "https://www.asaas.com/i/abc123",
          value: 150.0,
          billingType: "PIX",
        }),
      });

      const result = await createCharge({
        customerId: "cus_abc123",
        billingType: "PIX",
        valueCents: 15000,
        dueDate: "2026-02-20",
        description: "Consulta Dr. Maria",
        externalReference: "inv-uuid-1",
      });

      expect(result.success).toBe(true);
      expect(result.chargeId).toBe("pay_abc123");
      expect(result.invoiceUrl).toBe("https://www.asaas.com/i/abc123");

      // Verify value was converted from cents to BRL
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.value).toBe(150.0);
    });

    it("creates a boleto charge", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pay_def456",
          status: "PENDING",
          invoiceUrl: "https://www.asaas.com/i/def456",
          bankSlipUrl: "https://www.asaas.com/b/pdf/def456",
          value: 200.0,
          billingType: "BOLETO",
        }),
      });

      const result = await createCharge({
        customerId: "cus_abc123",
        billingType: "BOLETO",
        valueCents: 20000,
        dueDate: "2026-02-25",
        description: "Tratamento",
        externalReference: "inv-uuid-2",
      });

      expect(result.success).toBe(true);
      expect(result.bankSlipUrl).toBe("https://www.asaas.com/b/pdf/def456");
    });
  });

  describe("getChargeStatus", () => {
    it("returns the current charge status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "pay_abc123",
          status: "RECEIVED",
          paymentDate: "2026-02-14",
          value: 150.0,
        }),
      });

      const result = await getChargeStatus("pay_abc123");

      expect(result.success).toBe(true);
      expect(result.status).toBe("RECEIVED");
      expect(result.paymentDate).toBe("2026-02-14");
    });
  });

  describe("getPixQrCode", () => {
    it("returns pix payload and encoded image", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payload: "00020126580014br.gov.bcb.pix...",
          encodedImage: "iVBORw0KGgoAAAANSUhEUg...",
          expirationDate: "2026-02-20T23:59:59Z",
        }),
      });

      const result = await getPixQrCode("pay_abc123");

      expect(result.success).toBe(true);
      expect(result.payload).toContain("br.gov.bcb.pix");
      expect(result.encodedImage).toBeDefined();
    });
  });

  describe("getBoletoIdentificationField", () => {
    it("returns linha digitável and barcode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identificationField: "00190000090275928800021932978170187890000005000",
          nossoNumero: "6543",
          barCode: "00191878900000050000000002759288002193297817",
        }),
      });

      const result = await getBoletoIdentificationField("pay_def456");

      expect(result.success).toBe(true);
      expect(result.identificationField).toContain("00190000");
    });
  });

  describe("verifyWebhookToken", () => {
    it("returns true for matching token", () => {
      expect(verifyWebhookToken("test-webhook-token")).toBe(true);
    });

    it("returns false for mismatched token", () => {
      expect(verifyWebhookToken("wrong-token")).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/asaas.test.ts`
Expected: FAIL — module `@/services/asaas` does not exist

**Step 3: Write minimal implementation**

Create `src/services/asaas.ts`:

```ts
import "server-only";

import crypto from "crypto";

const ASAAS_URLS = {
  production: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
} as const;

function getBaseUrl(): string {
  const env = process.env.ASAAS_ENV === "production" ? "production" : "sandbox";
  return ASAAS_URLS[env];
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    access_token: process.env.ASAAS_API_KEY ?? "",
  };
}

// ── Types ──

interface AsaasResult {
  success: boolean;
  error?: string;
}

interface CreateCustomerParams {
  name: string;
  cpfCnpj: string;
  phone?: string;
  email?: string;
  externalReference?: string;
}

interface CreateCustomerResult extends AsaasResult {
  customerId?: string;
}

interface CreateChargeParams {
  customerId: string;
  billingType: "PIX" | "BOLETO";
  valueCents: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
}

interface CreateChargeResult extends AsaasResult {
  chargeId?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  status?: string;
}

interface ChargeStatusResult extends AsaasResult {
  status?: string;
  paymentDate?: string;
  valueCents?: number;
}

interface PixQrCodeResult extends AsaasResult {
  payload?: string;
  encodedImage?: string;
  expirationDate?: string;
}

interface BoletoFieldResult extends AsaasResult {
  identificationField?: string;
  nossoNumero?: string;
  barCode?: string;
}

// ── API Functions ──

/**
 * Create a customer in Asaas. Required before creating charges.
 * Asaas requires name + cpfCnpj (CPF or CNPJ).
 */
export async function createCustomer(
  params: CreateCustomerParams
): Promise<CreateCustomerResult> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ASAAS_API_KEY not configured" };
  }

  try {
    const response = await fetch(`${getBaseUrl()}/customers`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name: params.name,
        cpfCnpj: params.cpfCnpj,
        ...(params.phone ? { mobilePhone: params.phone } : {}),
        ...(params.email ? { email: params.email } : {}),
        ...(params.externalReference
          ? { externalReference: params.externalReference }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errors = Array.isArray(errorBody?.errors)
        ? errorBody.errors.map((e: { description?: string }) => e.description).join(", ")
        : `HTTP ${response.status}`;
      console.error("[asaas] createCustomer failed:", errors);
      return { success: false, error: errors };
    }

    const data = await response.json();
    return { success: true, customerId: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas] createCustomer error:", message);
    return { success: false, error: message };
  }
}

/**
 * Create a charge (cobrança) in Asaas.
 * CRITICAL: Asaas expects value in BRL (reais), not cents.
 * This function receives cents and converts automatically.
 */
export async function createCharge(
  params: CreateChargeParams
): Promise<CreateChargeResult> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ASAAS_API_KEY not configured" };
  }

  try {
    const valueBrl = params.valueCents / 100;

    const response = await fetch(`${getBaseUrl()}/payments`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        customer: params.customerId,
        billingType: params.billingType,
        value: valueBrl,
        dueDate: params.dueDate,
        ...(params.description ? { description: params.description } : {}),
        ...(params.externalReference
          ? { externalReference: params.externalReference }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errors = Array.isArray(errorBody?.errors)
        ? errorBody.errors.map((e: { description?: string }) => e.description).join(", ")
        : `HTTP ${response.status}`;
      console.error("[asaas] createCharge failed:", errors);
      return { success: false, error: errors };
    }

    const data = await response.json();
    return {
      success: true,
      chargeId: data.id,
      invoiceUrl: data.invoiceUrl,
      bankSlipUrl: data.bankSlipUrl ?? undefined,
      status: data.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas] createCharge error:", message);
    return { success: false, error: message };
  }
}

/**
 * Get the current status of an Asaas charge.
 */
export async function getChargeStatus(
  chargeId: string
): Promise<ChargeStatusResult> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ASAAS_API_KEY not configured" };
  }

  try {
    const response = await fetch(`${getBaseUrl()}/payments/${chargeId}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      status: data.status,
      paymentDate: data.paymentDate ?? undefined,
      valueCents: data.value ? Math.round(data.value * 100) : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas] getChargeStatus error:", message);
    return { success: false, error: message };
  }
}

/**
 * Get PIX QR code data (copia-e-cola + base64 image) for a charge.
 */
export async function getPixQrCode(
  chargeId: string
): Promise<PixQrCodeResult> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ASAAS_API_KEY not configured" };
  }

  try {
    const response = await fetch(
      `${getBaseUrl()}/payments/${chargeId}/pixQrCode`,
      { headers: getHeaders() }
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      payload: data.payload,
      encodedImage: data.encodedImage,
      expirationDate: data.expirationDate,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas] getPixQrCode error:", message);
    return { success: false, error: message };
  }
}

/**
 * Get boleto identification field (linha digitável) for a charge.
 */
export async function getBoletoIdentificationField(
  chargeId: string
): Promise<BoletoFieldResult> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ASAAS_API_KEY not configured" };
  }

  try {
    const response = await fetch(
      `${getBaseUrl()}/payments/${chargeId}/identificationField`,
      { headers: getHeaders() }
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      identificationField: data.identificationField,
      nossoNumero: data.nossoNumero,
      barCode: data.barCode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas] getBoletoIdentificationField error:", message);
    return { success: false, error: message };
  }
}

/**
 * Verify Asaas webhook token.
 * Asaas sends the configured token in the `asaas-access-token` header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookToken(receivedToken: string): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !receivedToken) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedToken),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/asaas.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/asaas.ts src/__tests__/services/asaas.test.ts
git commit -m "feat: add Asaas service for charges, customers, PIX, boleto, and webhook verification"
```

---

## Task 3: Billing Agent — agent config + registration

Build the Billing agent following the exact pattern of `confirmation.ts`.

**Files:**
- Create: `src/lib/agents/agents/billing.ts`
- Modify: `src/lib/agents/index.ts` (add side-effect import)
- Test: `src/__tests__/lib/agents/billing.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/agents/billing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/services/asaas", () => ({
  createCustomer: vi.fn().mockResolvedValue({ success: true, customerId: "cus_abc" }),
  createCharge: vi.fn().mockResolvedValue({
    success: true,
    chargeId: "pay_abc",
    invoiceUrl: "https://www.asaas.com/i/abc123",
    bankSlipUrl: "https://www.asaas.com/b/pdf/abc123",
  }),
  getChargeStatus: vi.fn().mockResolvedValue({
    success: true,
    status: "RECEIVED",
    paymentDate: "2026-02-14",
  }),
  getPixQrCode: vi.fn().mockResolvedValue({
    success: true,
    payload: "00020126580014br.gov.bcb.pix...",
  }),
  getBoletoIdentificationField: vi.fn().mockResolvedValue({
    success: true,
    identificationField: "00190000090275928800021932978170187890000005000",
  }),
}));

import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext, ToolCallResult } from "@/lib/agents";

// ── Mock Supabase factory ──

type MockChainable = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function createChainable(
  resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }
): MockChainable {
  const chainable: MockChainable = {} as MockChainable;
  chainable.select = vi.fn().mockReturnValue(chainable);
  chainable.insert = vi.fn().mockReturnValue(chainable);
  chainable.update = vi.fn().mockReturnValue(chainable);
  chainable.eq = vi.fn().mockReturnValue(chainable);
  chainable.neq = vi.fn().mockReturnValue(chainable);
  chainable.in = vi.fn().mockReturnValue(chainable);
  chainable.gte = vi.fn().mockReturnValue(chainable);
  chainable.order = vi.fn().mockReturnValue(chainable);
  chainable.limit = vi.fn().mockReturnValue(chainable);
  chainable.single = vi.fn().mockResolvedValue(resolvedValue);
  chainable.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chainable;
}

function createMockSupabase(tableOverrides: Record<string, MockChainable> = {}) {
  const defaultChainable = createChainable();
  return {
    from: vi.fn().mockImplementation((table: string) => tableOverrides[table] ?? defaultChainable),
  };
}

function createToolCallContext(overrides?: Partial<ToolCallContext>): ToolCallContext {
  return {
    supabase: createMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-123",
    recipientId: "patient-456",
    clinicId: "clinic-789",
    ...overrides,
  };
}

describe("billing agent", () => {
  describe("registration", () => {
    it("registers the 'billing' type in the global registry", () => {
      expect(getRegisteredTypes()).toContain("billing");
    });
  });

  describe("config retrieval", () => {
    it("returns a valid config with type 'billing'", () => {
      const config = getAgentType("billing");
      expect(config).toBeDefined();
      expect(config!.type).toBe("billing");
    });

    it("has supportedChannels containing 'whatsapp'", () => {
      expect(getAgentType("billing")!.supportedChannels).toContain("whatsapp");
    });
  });

  describe("getTools", () => {
    it("returns exactly 4 tools", () => {
      const config = getAgentType("billing")!;
      const tools = config.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
      expect(tools).toHaveLength(4);
    });

    it("returns tools with the correct names", () => {
      const config = getAgentType("billing")!;
      const tools = config.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
      const names = tools.map((t) => t.name);
      expect(names).toContain("create_payment_link");
      expect(names).toContain("check_payment_status");
      expect(names).toContain("send_payment_reminder");
      expect(names).toContain("escalate_billing");
    });
  });

  describe("buildSystemPrompt", () => {
    it("returns Portuguese text for pt-BR locale", () => {
      const config = getAgentType("billing")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "pt-BR" });
      expect(prompt.toLowerCase()).toMatch(/pagamento|cobran|fatura/);
    });

    it("returns English text for en locale", () => {
      const config = getAgentType("billing")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "en" });
      expect(prompt.toLowerCase()).toMatch(/payment|billing|invoice/);
    });

    it("returns Spanish text for es locale", () => {
      const config = getAgentType("billing")!;
      const prompt = config.buildSystemPrompt({ agentName: "Test", tone: "professional", locale: "es" });
      expect(prompt.toLowerCase()).toMatch(/pago|cobro|factura/);
    });
  });

  describe("getInstructions", () => {
    it("returns instructions for all 3 locales", () => {
      const config = getAgentType("billing")!;
      expect(config.getInstructions("professional", "pt-BR").length).toBeGreaterThan(0);
      expect(config.getInstructions("professional", "en").length).toBeGreaterThan(0);
      expect(config.getInstructions("professional", "es").length).toBeGreaterThan(0);
    });
  });

  describe("handleToolCall", () => {
    let config: NonNullable<ReturnType<typeof getAgentType>>;

    beforeEach(() => {
      config = getAgentType("billing")!;
      vi.clearAllMocks();
    });

    describe("create_payment_link", () => {
      it("creates a charge via Asaas and returns invoiceUrl in appendToResponse", async () => {
        const invoiceChainable = createChainable({
          data: {
            id: "inv-1",
            amount_cents: 15000,
            patient_id: "patient-456",
            patients: { name: "João Silva", phone: "5521999998888", email: null, cpf: "12345678900", asaas_customer_id: "cus_abc" },
          },
          error: null,
        });
        const paymentLinksChainable = createChainable({
          data: { id: "pl-1" },
          error: null,
        });

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "invoices") return invoiceChainable;
          if (table === "payment_links") return paymentLinksChainable;
          return createChainable();
        });

        const context = createToolCallContext({
          supabase: { from: mockFromFn } as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "create_payment_link", args: { invoice_id: "inv-1", method: "pix" } },
          context
        );

        expect(result.appendToResponse).toContain("https://www.asaas.com/i/abc123");
        expect(result.result).toContain("payment link");
      });
    });

    describe("check_payment_status", () => {
      it("returns the current payment status from Asaas", async () => {
        const linkChainable = createChainable({
          data: { id: "pl-1", asaas_payment_id: "pay_abc", status: "active" },
          error: null,
        });

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "payment_links") return linkChainable;
          return createChainable();
        });

        const context = createToolCallContext({
          supabase: { from: mockFromFn } as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "check_payment_status", args: { invoice_id: "inv-1" } },
          context
        );

        expect(result.result).toContain("RECEIVED");
      });
    });

    describe("send_payment_reminder", () => {
      it("returns a reminder context for the LLM", async () => {
        const invoiceChainable = createChainable({
          data: {
            id: "inv-1",
            amount_cents: 15000,
            due_date: "2026-02-20",
            status: "pending",
          },
          error: null,
        });

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "invoices") return invoiceChainable;
          return createChainable();
        });

        const context = createToolCallContext({
          supabase: { from: mockFromFn } as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "send_payment_reminder", args: { invoice_id: "inv-1", tone: "gentle" } },
          context
        );

        expect(result.result).toBeDefined();
        expect(result.result!).toMatch(/150|reminder|lembrete|pending/i);
      });
    });

    describe("escalate_billing", () => {
      it("marks conversation as escalated", async () => {
        const convChainable = createChainable();
        convChainable.eq = vi.fn().mockResolvedValue({ data: null, error: null });

        const mockFromFn = vi.fn().mockImplementation((table: string) => {
          if (table === "conversations") return convChainable;
          return createChainable();
        });

        const context = createToolCallContext({
          supabase: { from: mockFromFn } as unknown as ToolCallContext["supabase"],
        });

        const result = await config.handleToolCall(
          { name: "escalate_billing", args: { reason: "Patient disputes the amount" } },
          context
        );

        expect(result.result).toContain("escalat");
        expect(result.newConversationStatus).toBe("escalated");
      });
    });

    describe("unknown tool", () => {
      it("returns an empty object", async () => {
        const context = createToolCallContext();
        const result = await config.handleToolCall(
          { name: "nonexistent_tool", args: {} },
          context
        );
        expect(result).toEqual({});
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/agents/billing.test.ts`
Expected: FAIL — `billing` type not registered

**Step 3: Write the Billing agent**

Create `src/lib/agents/agents/billing.ts`:

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import type {
  AgentTypeConfig,
  AgentToolOptions,
  SystemPromptParams,
  RecipientContext,
  ToolCallInput,
  ToolCallContext,
  ToolCallResult,
} from "../types";
import {
  createCustomer,
  createCharge,
  getChargeStatus,
  getPixQrCode,
} from "@/services/asaas";

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e um assistente de cobranca e pagamentos. Seu papel e ajudar pacientes a realizarem pagamentos pendentes de forma educada e eficiente.

Regras:
- Use o primeiro nome do paciente.
- Responda sempre em portugues do Brasil.
- Seja educado e nunca ameacador — cobranca e sobre facilitar, nao pressionar.
- Adapte o tom conforme orientado (gentil, direto ou urgente).
- Quando o paciente quiser pagar, gere o link de pagamento com create_payment_link.
- Quando o paciente perguntar o status, use check_payment_status.
- Se o paciente contestar o valor ou tiver duvidas que voce nao consegue resolver, use escalate_billing.
- Nunca invente URLs. Links de pagamento vem exclusivamente da ferramenta create_payment_link.
- Nao insista mais de 2 vezes na mesma conversa.
- Valores monetarios devem ser exibidos em reais (R$).`,

  en: `You are a billing and payment assistant. Your role is to help patients complete pending payments politely and efficiently.

Rules:
- Use the patient's first name.
- Always respond in English.
- Be polite and never threatening — billing is about facilitating, not pressuring.
- Adapt your tone as instructed (gentle, direct, or urgent).
- When the patient wants to pay, generate the payment link with create_payment_link.
- When the patient asks about status, use check_payment_status.
- If the patient disputes the amount or has questions you cannot resolve, use escalate_billing.
- Never fabricate URLs. Payment links come exclusively from the create_payment_link tool.
- Do not insist more than 2 times in the same conversation.
- Monetary values must be displayed in BRL (R$).`,

  es: `Eres un asistente de cobros y pagos. Tu rol es ayudar a los pacientes a completar pagos pendientes de forma educada y eficiente.

Reglas:
- Usa el primer nombre del paciente.
- Responde siempre en espanol.
- Se educado y nunca amenazante — cobrar es facilitar, no presionar.
- Adapta el tono segun lo indicado (amable, directo o urgente).
- Cuando el paciente quiera pagar, genera el link de pago con create_payment_link.
- Cuando el paciente pregunte por el estado, usa check_payment_status.
- Si el paciente disputa el monto o tiene dudas que no puedes resolver, usa escalate_billing.
- Nunca inventes URLs. Los links de pago vienen exclusivamente de la herramienta create_payment_link.
- No insistas mas de 2 veces en la misma conversacion.
- Los valores monetarios deben mostrarse en reales (R$).`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Envie lembretes de pagamento e gere links via Pix ou boleto (Asaas). Adapte o tom ao perfil do paciente. Escale se o paciente contestar.",
  en: "Send payment reminders and generate payment links via Pix or boleto (Asaas). Adapt tone to patient profile. Escalate if the patient disputes.",
  es: "Envia recordatorios de pago y genera links via Pix o boleto (Asaas). Adapta el tono al perfil del paciente. Escala si el paciente disputa.",
};

// ── Tool Definitions (Stubs) ──

const createPaymentLinkTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "create_payment_link",
      invoice_id: input.invoice_id,
      method: input.method,
    });
  },
  {
    name: "create_payment_link",
    description: "Generates a Pix or boleto payment link for a pending invoice via Asaas. Call this when the patient agrees to pay or when sending a payment reminder. The link will be appended to your response — NEVER fabricate a payment URL yourself.",
    schema: z.object({
      invoice_id: z.string().describe("UUID of the invoice to generate payment for"),
      method: z.enum(["pix", "boleto"]).describe("Payment method: 'pix' for instant QR code, 'boleto' for bank slip"),
    }),
  }
);

const checkPaymentStatusTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "check_payment_status",
      invoice_id: input.invoice_id,
    });
  },
  {
    name: "check_payment_status",
    description: "Checks the current payment status for an invoice via Asaas. Use when the patient asks if their payment was received or to verify before sending a reminder.",
    schema: z.object({
      invoice_id: z.string().describe("UUID of the invoice to check"),
    }),
  }
);

const sendPaymentReminderTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "send_payment_reminder",
      invoice_id: input.invoice_id,
      tone: input.tone,
    });
  },
  {
    name: "send_payment_reminder",
    description: "Retrieves invoice details to compose a payment reminder message. Tone options: 'gentle' (first reminder), 'direct' (second reminder), 'urgent' (final reminder before escalation).",
    schema: z.object({
      invoice_id: z.string().describe("UUID of the invoice to remind about"),
      tone: z.enum(["gentle", "direct", "urgent"]).describe("Reminder tone: gentle (first contact), direct (follow-up), urgent (final notice)"),
    }),
  }
);

const escalateBillingTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "escalate_billing",
      reason: input.reason,
    });
  },
  {
    name: "escalate_billing",
    description: "Escalates a billing issue to a human staff member. Use when the patient disputes the amount, refuses to pay, or has questions you cannot answer.",
    schema: z.object({
      reason: z.string().describe("Brief description of why this is being escalated"),
    }),
  }
);

// ── Helpers ──

function formatBrl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Ensure patient has an Asaas customer ID. Creates one if missing.
 */
async function ensureAsaasCustomer(
  supabase: ToolCallContext["supabase"],
  patient: Record<string, unknown>
): Promise<string | null> {
  const existing = patient.asaas_customer_id as string | null;
  if (existing) return existing;

  const name = (patient.name as string) ?? "Patient";
  const cpf = (patient.cpf as string) ?? "";
  const phone = (patient.phone as string) ?? "";
  const email = (patient.email as string) ?? undefined;
  const patientId = patient.id as string;

  if (!cpf) {
    console.warn("[billing] Patient missing CPF, cannot create Asaas customer");
    return null;
  }

  const result = await createCustomer({
    name,
    cpfCnpj: cpf,
    phone,
    email,
    externalReference: patientId,
  });

  if (!result.success || !result.customerId) return null;

  // Save Asaas customer ID to patient record
  await supabase
    .from("patients")
    .update({ asaas_customer_id: result.customerId })
    .eq("id", patientId);

  return result.customerId;
}

// ── Tool Handlers ──

async function handleCreatePaymentLink(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const invoiceId = typeof args.invoice_id === "string" ? args.invoice_id : "";
  const method = args.method === "boleto" ? "BOLETO" : "PIX";

  if (!invoiceId) {
    return { result: "Error: invoice_id is required." };
  }

  try {
    // Fetch invoice with patient data
    const { data: invoice, error: invoiceError } = await context.supabase
      .from("invoices")
      .select("id, amount_cents, due_date, patient_id, patients!inner(id, name, phone, email, cpf, asaas_customer_id)")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return { result: `Error: Invoice not found (${invoiceId}).` };
    }

    const patient = invoice.patients as Record<string, unknown>;
    const amountCents = invoice.amount_cents as number;
    const dueDate = invoice.due_date as string;

    // Ensure Asaas customer exists
    const customerId = await ensureAsaasCustomer(context.supabase, patient);
    if (!customerId) {
      return { result: "Error: Could not create Asaas customer. Patient may be missing CPF." };
    }

    // Create charge in Asaas
    const chargeResult = await createCharge({
      customerId,
      billingType: method,
      valueCents: amountCents,
      dueDate,
      description: `Fatura ${invoiceId.slice(0, 8)} - ${formatBrl(amountCents)}`,
      externalReference: invoiceId,
    });

    if (!chargeResult.success || !chargeResult.invoiceUrl) {
      return { result: `Error creating charge: ${chargeResult.error ?? "Unknown error"}` };
    }

    // For PIX, also get the copia-e-cola
    let pixPayload: string | undefined;
    if (method === "PIX" && chargeResult.chargeId) {
      const pixResult = await getPixQrCode(chargeResult.chargeId);
      if (pixResult.success) {
        pixPayload = pixResult.payload;
      }
    }

    // Save payment link to DB
    await context.supabase.from("payment_links").insert({
      clinic_id: context.clinicId,
      invoice_id: invoiceId,
      asaas_payment_id: chargeResult.chargeId,
      url: chargeResult.invoiceUrl,
      invoice_url: chargeResult.invoiceUrl,
      method: method === "PIX" ? "pix" : "boleto",
      status: "active",
      ...(pixPayload ? { pix_payload: pixPayload } : {}),
      ...(chargeResult.bankSlipUrl ? { boleto_identification_field: chargeResult.bankSlipUrl } : {}),
    });

    const methodLabel = method === "PIX" ? "Pix" : "boleto";
    let responseText = `\n\nLink de pagamento (${methodLabel}): ${chargeResult.invoiceUrl}`;
    if (pixPayload) {
      responseText += `\n\nPix copia-e-cola:\n${pixPayload}`;
    }

    return {
      result: `Payment link created successfully via ${methodLabel} for ${formatBrl(amountCents)}. The link has been shared with the patient.`,
      appendToResponse: responseText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error creating payment link: ${message}` };
  }
}

async function handleCheckPaymentStatus(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const invoiceId = typeof args.invoice_id === "string" ? args.invoice_id : "";

  if (!invoiceId) {
    return { result: "Error: invoice_id is required." };
  }

  try {
    const { data: link, error: linkError } = await context.supabase
      .from("payment_links")
      .select("id, asaas_payment_id, status")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (linkError || !link || !link.asaas_payment_id) {
      return { result: "No payment link found for this invoice. You may need to create one first." };
    }

    const statusResult = await getChargeStatus(link.asaas_payment_id as string);

    if (!statusResult.success) {
      return { result: `Error checking payment status: ${statusResult.error}` };
    }

    // Asaas statuses: PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, etc.
    const asaasStatus = statusResult.status ?? "UNKNOWN";
    const isPaid = asaasStatus === "RECEIVED" || asaasStatus === "CONFIRMED";

    if (isPaid) {
      await context.supabase
        .from("payment_links")
        .update({ status: "paid" })
        .eq("id", link.id);

      await context.supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: statusResult.paymentDate ?? new Date().toISOString(),
        })
        .eq("id", invoiceId);

      return { result: `Payment confirmed! Status: ${asaasStatus}. The invoice has been marked as paid.${statusResult.paymentDate ? ` Payment date: ${statusResult.paymentDate}.` : ""}` };
    }

    if (asaasStatus === "OVERDUE") {
      await context.supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", invoiceId);
    }

    const statusMessages: Record<string, string> = {
      PENDING: "Payment is pending. The patient has not yet paid.",
      OVERDUE: "Payment is overdue. The due date has passed.",
      REFUNDED: "Payment was refunded.",
    };

    return {
      result: statusMessages[asaasStatus] ?? `Payment status: ${asaasStatus}. The payment has not been completed yet.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error checking payment: ${message}` };
  }
}

async function handleSendPaymentReminder(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const invoiceId = typeof args.invoice_id === "string" ? args.invoice_id : "";
  const tone = typeof args.tone === "string" ? args.tone : "gentle";

  if (!invoiceId) {
    return { result: "Error: invoice_id is required." };
  }

  try {
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id, amount_cents, due_date, status")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) {
      return { result: `Error: Invoice not found (${invoiceId}).` };
    }

    if (invoice.status === "paid") {
      return { result: "This invoice is already paid. No reminder needed." };
    }

    const amountFormatted = formatBrl(invoice.amount_cents as number);
    const dueDate = invoice.due_date as string;

    const toneGuidance: Record<string, string> = {
      gentle: `Gentle reminder: The patient has a pending payment of ${amountFormatted} due on ${dueDate}. Approach kindly and offer to help with payment via Pix or boleto.`,
      direct: `Follow-up reminder: The patient has an outstanding invoice of ${amountFormatted} that was due on ${dueDate}. Be clear and direct, but remain polite. Offer to generate a payment link.`,
      urgent: `Final notice: The patient has an overdue payment of ${amountFormatted} (due date: ${dueDate}). This is the last reminder before escalation. Be firm but professional. Emphasize urgency.`,
    };

    return { result: toneGuidance[tone] ?? toneGuidance.gentle };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error fetching invoice for reminder: ${message}` };
  }
}

async function handleEscalateBilling(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const reason = typeof args.reason === "string" ? args.reason : "No reason provided";

  try {
    await context.supabase
      .from("conversations")
      .update({ status: "escalated" })
      .eq("id", context.conversationId);
  } catch (error) {
    console.error("[billing] escalation update failed:", error);
  }

  return {
    result: `Billing issue escalated to human staff. Reason: ${reason}. Let the patient know that a team member will review their case.`,
    newConversationStatus: "escalated",
  };
}

// ── Agent Config ──

const billingConfig: AgentTypeConfig = {
  type: "billing",

  buildSystemPrompt(params: SystemPromptParams, _recipient?: RecipientContext): string {
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },

  getInstructions(_tone: string, locale: string): string {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },

  getTools(_options: AgentToolOptions) {
    return [createPaymentLinkTool, checkPaymentStatusTool, sendPaymentReminderTool, escalateBillingTool];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "create_payment_link":
        return handleCreatePaymentLink(toolCall.args, context);
      case "check_payment_status":
        return handleCheckPaymentStatus(toolCall.args, context);
      case "send_payment_reminder":
        return handleSendPaymentReminder(toolCall.args, context);
      case "escalate_billing":
        return handleEscalateBilling(toolCall.args, context);
      default:
        console.warn(`[billing] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(billingConfig);
```

**Step 4: Add side-effect import to barrel**

In `src/lib/agents/index.ts`, add:

```ts
import "./agents/billing";
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/agents/billing.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

**Step 7: Commit**

```bash
git add src/lib/agents/agents/billing.ts src/lib/agents/index.ts src/__tests__/lib/agents/billing.test.ts
git commit -m "feat: add billing agent with 4 tools and Asaas integration"
```

---

## Task 4: Asaas Webhook Route

Receives payment event webhooks from Asaas and updates invoice/payment_links status.

**Files:**
- Create: `src/app/api/webhooks/asaas/route.ts`
- Test: `src/__tests__/app/api/webhooks/asaas.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/app/api/webhooks/asaas.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/services/asaas", () => ({
  verifyWebhookToken: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/webhooks/asaas/route";

describe("POST /api/webhooks/asaas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for invalid webhook token", async () => {
    const { verifyWebhookToken } = await import("@/services/asaas");
    (verifyWebhookToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const req = new Request("http://localhost/api/webhooks/asaas", {
      method: "POST",
      headers: { "asaas-access-token": "invalid" },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 for PAYMENT_RECEIVED event and marks invoice as paid", async () => {
    const updateChainable = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockFrom.mockReturnValue(updateChainable);

    const req = new Request("http://localhost/api/webhooks/asaas", {
      method: "POST",
      headers: { "asaas-access-token": "valid-token" },
      body: JSON.stringify({
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_abc123",
          customer: "cus_xyz",
          billingType: "PIX",
          value: 150.0,
          status: "RECEIVED",
          externalReference: "invoice-uuid-1",
          paymentDate: "2026-02-14",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 200 and ignores non-payment events", async () => {
    const req = new Request("http://localhost/api/webhooks/asaas", {
      method: "POST",
      headers: { "asaas-access-token": "valid-token" },
      body: JSON.stringify({
        event: "PAYMENT_CREATED",
        payment: { id: "pay_abc" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ignored");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/app/api/webhooks/asaas.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write the webhook route**

Create `src/app/api/webhooks/asaas/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookToken } from "@/services/asaas";

export const dynamic = "force-dynamic";

/** Events that mean the payment was completed. */
const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

export async function POST(request: Request) {
  const token = request.headers.get("asaas-access-token") ?? "";

  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const event = (payload.event as string) ?? "";
  const payment = (payload.payment as Record<string, unknown>) ?? {};
  const invoiceId = (payment.externalReference as string) ?? "";
  const paymentDate = (payment.paymentDate as string) ?? null;

  // Only process payment completion and overdue events
  if (!PAID_EVENTS.has(event) && !OVERDUE_EVENTS.has(event)) {
    return NextResponse.json({ status: "ignored", event });
  }

  if (!invoiceId) {
    console.warn("[asaas-webhook] No externalReference (invoice ID), skipping");
    return NextResponse.json({ status: "skipped", reason: "no_external_reference" });
  }

  const supabase = createAdminClient();

  try {
    if (PAID_EVENTS.has(event)) {
      // Mark payment link as paid
      await supabase
        .from("payment_links")
        .update({ status: "paid" })
        .eq("invoice_id", invoiceId);

      // Mark invoice as paid
      await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: paymentDate ?? new Date().toISOString(),
        })
        .eq("id", invoiceId);

      console.log(`[asaas-webhook] Invoice ${invoiceId} marked as paid (${event})`);
    } else if (OVERDUE_EVENTS.has(event)) {
      // Mark invoice as overdue
      await supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", invoiceId);

      console.log(`[asaas-webhook] Invoice ${invoiceId} marked as overdue`);
    }

    return NextResponse.json({ status: "ok", invoiceId, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas-webhook] processing error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/app/api/webhooks/asaas.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/webhooks/asaas/route.ts src/__tests__/app/api/webhooks/asaas.test.ts
git commit -m "feat: add Asaas webhook route for payment events"
```

---

## Task 5: Billing Cron Route — drip sequence

Scans for pending/overdue invoices and sends drip reminders (gentle → direct → urgent).

**Files:**
- Create: `src/app/api/cron/billing/route.ts`
- Test: `src/__tests__/app/api/cron/billing.test.ts`
- Modify: `vercel.json` (add billing cron)

**Step 1: Write the failing test**

Create `src/__tests__/app/api/cron/billing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/agents/outbound", () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue({ success: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
  canSendToPatient: vi.fn().mockResolvedValue(true),
}));

import { GET } from "@/app/api/cron/billing/route";

describe("GET /api/cron/billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 without valid CRON_SECRET header", async () => {
    const req = new Request("http://localhost/api/cron/billing", {
      headers: {},
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid CRON_SECRET and no pending invoices", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/cron/billing", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/app/api/cron/billing.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write the cron route**

Create `src/app/api/cron/billing/route.ts`:

```ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOutboundMessage,
  isWithinBusinessHours,
  canSendToPatient,
} from "@/lib/agents/outbound";

export const dynamic = "force-dynamic";

function getReminderTone(attempts: number, dueDate: string): "gentle" | "direct" | "urgent" {
  const daysUntilDue = (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (attempts >= 2 || daysUntilDue < 0) return "urgent";
  if (attempts >= 1 || daysUntilDue <= 3) return "direct";
  return "gentle";
}

function formatBrl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET ?? "";
  const token = authHeader?.replace("Bearer ", "") ?? "";

  if (
    !secret ||
    !token ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(`
      id, clinic_id, patient_id, amount_cents, due_date, status, notes,
      patients!inner ( id, name, phone )
    `)
    .in("status", ["pending", "overdue"])
    .lte("due_date", today);

  if (error) {
    console.error("[cron/billing] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0, total: 0 });
  }

  let processed = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const patient = invoice.patients as Record<string, unknown>;
    if (!patient) continue;

    const patientPhone = (patient.phone as string) ?? "";
    const patientName = ((patient.name as string) ?? "").split(" ")[0];
    const patientId = patient.id as string;

    const { data: clinic } = await supabase
      .from("clinics")
      .select("timezone")
      .eq("id", invoice.clinic_id)
      .single();

    const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

    if (!isWithinBusinessHours(new Date(), timezone)) {
      skipped++;
      continue;
    }

    const canSend = await canSendToPatient(supabase, invoice.clinic_id, patientId, timezone);
    if (!canSend) {
      skipped++;
      continue;
    }

    // Count previous billing messages for this invoice
    const { data: previousMessages } = await supabase
      .from("message_queue")
      .select("id")
      .eq("clinic_id", invoice.clinic_id)
      .eq("patient_id", patientId)
      .eq("source", `billing:${invoice.id}`);

    const attemptCount = previousMessages?.length ?? 0;

    if (attemptCount >= 3) {
      if (invoice.status !== "overdue") {
        await supabase.from("invoices").update({ status: "overdue" }).eq("id", invoice.id);
      }
      skipped++;
      continue;
    }

    const tone = getReminderTone(attemptCount, invoice.due_date);
    const amount = formatBrl(invoice.amount_cents);
    const dueDateFormatted = new Date(invoice.due_date).toLocaleDateString("pt-BR");

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("clinic_id", invoice.clinic_id)
      .eq("patient_id", patientId)
      .eq("channel", "whatsapp")
      .eq("status", "active")
      .maybeSingle();

    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
      await supabase.from("conversations").update({ current_module: "billing" }).eq("id", conversationId);
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ clinic_id: invoice.clinic_id, patient_id: patientId, channel: "whatsapp", status: "active", current_module: "billing" })
        .select("id")
        .single();
      conversationId = newConv?.id ?? "";
    }

    const messages: Record<string, string> = {
      gentle: `Ola ${patientName}! Tudo bem? Identificamos um valor pendente de ${amount} com vencimento em ${dueDateFormatted}. Posso gerar um link de pagamento via Pix ou boleto para facilitar?`,
      direct: `Ola ${patientName}, passando para lembrar do pagamento pendente de ${amount} (vencimento: ${dueDateFormatted}). Deseja que eu gere o link de pagamento?`,
      urgent: `${patientName}, seu pagamento de ${amount} esta em atraso (vencimento: ${dueDateFormatted}). Por favor, regularize para evitar pendencias. Posso ajudar com o link de pagamento agora.`,
    };

    // Queue with source tag for drip tracking
    await supabase.from("message_queue").insert({
      conversation_id: conversationId,
      clinic_id: invoice.clinic_id,
      patient_id: patientId,
      channel: "whatsapp",
      content: messages[tone],
      status: "pending",
      attempts: 0,
      max_attempts: 3,
      source: `billing:${invoice.id}`,
    });

    const sendResult = await sendOutboundMessage(supabase, {
      clinicId: invoice.clinic_id,
      patientId,
      patientPhone,
      text: messages[tone],
      timezone,
      conversationId,
      skipBusinessHoursCheck: true,
    });

    if (sendResult.success) processed++;
    else skipped++;
  }

  return NextResponse.json({ processed, skipped, total: invoices.length });
}
```

**Step 4: Update vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/confirmations", "schedule": "0 8 * * *" },
    { "path": "/api/cron/nps", "schedule": "0 12 * * *" },
    { "path": "/api/cron/billing", "schedule": "0 9,14 * * 1-6" }
  ]
}
```

Billing runs at 9am and 2pm Mon-Sat.

**Step 5: Run test and commit**

Run: `npx vitest run src/__tests__/app/api/cron/billing.test.ts`
Expected: PASS

```bash
git add src/app/api/cron/billing/route.ts src/__tests__/app/api/cron/billing.test.ts vercel.json
git commit -m "feat: add billing cron route with drip reminder sequence"
```

---

## Task 6: Recall Agent — agent config + registration

Build the Recall agent for inactive patient reactivation. This is identical to the previous plan version since Recall does not use payments.

**Files:**
- Create: `src/lib/agents/agents/recall.ts`
- Modify: `src/lib/agents/index.ts` (add side-effect import)
- Test: `src/__tests__/lib/agents/recall.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/agents/recall.test.ts` — same structure as billing test but for recall:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext } from "@/lib/agents";

type MockChainable = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function createChainable(resolvedValue = { data: null, error: null }): MockChainable {
  const c: MockChainable = {} as MockChainable;
  c.select = vi.fn().mockReturnValue(c); c.insert = vi.fn().mockReturnValue(c);
  c.update = vi.fn().mockReturnValue(c); c.eq = vi.fn().mockReturnValue(c);
  c.in = vi.fn().mockReturnValue(c); c.order = vi.fn().mockReturnValue(c);
  c.limit = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(resolvedValue);
  c.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return c;
}

function createMockSupabase(overrides: Record<string, MockChainable> = {}) {
  const def = createChainable();
  return { from: vi.fn().mockImplementation((t: string) => overrides[t] ?? def) };
}

function ctx(overrides?: Partial<ToolCallContext>): ToolCallContext {
  return {
    supabase: createMockSupabase() as unknown as ToolCallContext["supabase"],
    conversationId: "conv-1", recipientId: "patient-1", clinicId: "clinic-1",
    ...overrides,
  };
}

describe("recall agent", () => {
  it("registers 'recall' type", () => {
    expect(getRegisteredTypes()).toContain("recall");
  });

  it("has type 'recall' and whatsapp channel", () => {
    const config = getAgentType("recall")!;
    expect(config.type).toBe("recall");
    expect(config.supportedChannels).toContain("whatsapp");
  });

  it("returns 3 tools", () => {
    const tools = getAgentType("recall")!.getTools({ clinicId: "c", conversationId: "v", locale: "pt-BR" });
    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain("send_reactivation_message");
    expect(names).toContain("route_to_scheduling");
    expect(names).toContain("mark_patient_inactive");
  });

  it("supports 3 locales for prompts", () => {
    const config = getAgentType("recall")!;
    expect(config.buildSystemPrompt({ agentName: "T", tone: "professional", locale: "pt-BR" }).toLowerCase()).toMatch(/reativa|retorno|paciente/);
    expect(config.buildSystemPrompt({ agentName: "T", tone: "professional", locale: "en" }).toLowerCase()).toMatch(/reactivat|return|patient/);
    expect(config.buildSystemPrompt({ agentName: "T", tone: "professional", locale: "es" }).toLowerCase()).toMatch(/reactiv|retorno|paciente/);
  });

  it("route_to_scheduling returns routedTo scheduling", async () => {
    const config = getAgentType("recall")!;
    const result = await config.handleToolCall(
      { name: "route_to_scheduling", args: { recall_id: "r-1" } },
      ctx()
    );
    expect(result.responseData?.routedTo).toBe("scheduling");
  });

  it("mark_patient_inactive returns opt-out message", async () => {
    const recallC = createChainable();
    recallC.eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await getAgentType("recall")!.handleToolCall(
      { name: "mark_patient_inactive", args: { recall_id: "r-1", reason: "Declined" } },
      ctx({ supabase: createMockSupabase({ recall_queue: recallC }) as unknown as ToolCallContext["supabase"] })
    );
    expect(result.result).toContain("opt");
  });

  it("unknown tool returns empty object", async () => {
    const result = await getAgentType("recall")!.handleToolCall({ name: "nope", args: {} }, ctx());
    expect(result).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/agents/recall.test.ts`
Expected: FAIL — `recall` type not registered

**Step 3: Write the Recall agent**

Create `src/lib/agents/agents/recall.ts`:

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import type {
  AgentTypeConfig, AgentToolOptions, SystemPromptParams, RecipientContext,
  ToolCallInput, ToolCallContext, ToolCallResult,
} from "../types";

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e um assistente de reativacao de pacientes. Seu papel e entrar em contato com pacientes que nao visitam a clinica ha mais de 90 dias e incentiva-los a agendar um retorno.

Regras:
- Use o primeiro nome do paciente.
- Responda sempre em portugues do Brasil.
- Seja caloroso e acolhedor — o paciente nao deve sentir pressao.
- Mencione que faz tempo desde a ultima visita sem ser invasivo.
- Quando o paciente quiser agendar, use route_to_scheduling para encaminha-lo ao agendamento.
- Se o paciente pedir para nao ser mais contatado, use mark_patient_inactive para respeitar a preferencia.
- Nao insista mais de 1 vez se o paciente nao demonstrar interesse.
- Nunca mencione dados clinicos ou diagnosticos.`,
  en: `You are a patient reactivation assistant. Your role is to reach out to patients who haven't visited the clinic in over 90 days and encourage them to schedule a return visit.

Rules:
- Use the patient's first name.
- Always respond in English.
- Be warm and welcoming — the patient should not feel pressured.
- Mention it's been a while since their last visit without being intrusive.
- When the patient wants to schedule, use route_to_scheduling to hand off to scheduling.
- If the patient asks not to be contacted again, use mark_patient_inactive to respect their preference.
- Do not insist more than once if the patient shows no interest.
- Never mention clinical data or diagnoses.`,
  es: `Eres un asistente de reactivacion de pacientes. Tu rol es contactar pacientes que no visitan la clinica hace mas de 90 dias e incentivarlos a agendar un retorno.

Reglas:
- Usa el primer nombre del paciente.
- Responde siempre en espanol.
- Se calido y acogedor — el paciente no debe sentir presion.
- Menciona que ha pasado tiempo desde su ultima visita sin ser invasivo.
- Cuando el paciente quiera agendar, usa route_to_scheduling para derivar al agendamiento.
- Si el paciente pide no ser contactado mas, usa mark_patient_inactive para respetar su preferencia.
- No insistas mas de 1 vez si el paciente no demuestra interes.
- Nunca menciones datos clinicos o diagnosticos.`,
};

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Reative pacientes inativos (>90 dias sem consulta). Encaminhe para agendamento ou respeite opt-out.",
  en: "Reactivate inactive patients (>90 days without appointment). Route to scheduling or respect opt-out.",
  es: "Reactiva pacientes inactivos (>90 dias sin cita). Deriva a agendamiento o respeta opt-out.",
};

const sendReactivationMessageTool = tool(
  async (input) => JSON.stringify({ action: "send_reactivation_message", recall_id: input.recall_id }),
  {
    name: "send_reactivation_message",
    description: "Retrieves the patient's last visit info to compose a warm reactivation message.",
    schema: z.object({ recall_id: z.string().describe("UUID of the recall_queue entry") }),
  }
);

const routeToSchedulingTool = tool(
  async (input) => JSON.stringify({ action: "route_to_scheduling", recall_id: input.recall_id }),
  {
    name: "route_to_scheduling",
    description: "Routes the patient to the scheduling module when they want to book an appointment.",
    schema: z.object({ recall_id: z.string().describe("UUID of the recall_queue entry") }),
  }
);

const markPatientInactiveTool = tool(
  async (input) => JSON.stringify({ action: "mark_patient_inactive", recall_id: input.recall_id, reason: input.reason }),
  {
    name: "mark_patient_inactive",
    description: "Marks the patient as opted out of future recall messages.",
    schema: z.object({
      recall_id: z.string().describe("UUID of the recall_queue entry"),
      reason: z.string().describe("Brief reason the patient opted out"),
    }),
  }
);

async function handleSendReactivationMessage(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolCallResult> {
  const recallId = typeof args.recall_id === "string" ? args.recall_id : "";
  if (!recallId) return { result: "Error: recall_id is required." };

  try {
    const { data, error } = await context.supabase
      .from("recall_queue")
      .select("id, last_visit_at, patients!inner(name)")
      .eq("id", recallId)
      .single();

    if (error || !data) return { result: `Error: Recall entry not found (${recallId}).` };

    const patient = data.patients as Record<string, unknown>;
    const patientName = ((patient.name as string) ?? "").split(" ")[0];
    const lastVisit = new Date(data.last_visit_at as string);
    const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));

    return { result: `Patient ${patientName} last visited ${daysSince} days ago (${lastVisit.toLocaleDateString("pt-BR")}). Compose a warm, friendly message inviting them to schedule a return visit. Do not mention specific medical details.` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error: ${msg}` };
  }
}

async function handleRouteToScheduling(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolCallResult> {
  const recallId = typeof args.recall_id === "string" ? args.recall_id : "";
  if (recallId) {
    await context.supabase.from("recall_queue").update({ status: "responded" }).eq("id", recallId).catch(() => {});
  }
  return {
    result: "Patient wants to book an appointment. Routing to the scheduling module.",
    responseData: { routedTo: "scheduling", routeContext: "Patient reactivation — wants to schedule a return visit" },
  };
}

async function handleMarkPatientInactive(args: Record<string, unknown>, context: ToolCallContext): Promise<ToolCallResult> {
  const recallId = typeof args.recall_id === "string" ? args.recall_id : "";
  const reason = typeof args.reason === "string" ? args.reason : "Patient opted out";
  if (!recallId) return { result: "Error: recall_id is required." };

  try {
    await context.supabase.from("recall_queue").update({ status: "opted_out" }).eq("id", recallId);
    return { result: `Patient opt-out recorded. Reason: ${reason}. The patient will not receive further recall messages.` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error: ${msg}` };
  }
}

const recallConfig: AgentTypeConfig = {
  type: "recall",
  buildSystemPrompt(params: SystemPromptParams, _recipient?: RecipientContext) {
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },
  getInstructions(_tone: string, locale: string) {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },
  getTools(_options: AgentToolOptions) {
    return [sendReactivationMessageTool, routeToSchedulingTool, markPatientInactiveTool];
  },
  async handleToolCall(toolCall: ToolCallInput, context: ToolCallContext): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "send_reactivation_message": return handleSendReactivationMessage(toolCall.args, context);
      case "route_to_scheduling": return handleRouteToScheduling(toolCall.args, context);
      case "mark_patient_inactive": return handleMarkPatientInactive(toolCall.args, context);
      default:
        console.warn(`[recall] Unknown tool: ${toolCall.name}`);
        return {};
    }
  },
  supportedChannels: ["whatsapp"],
};

registerAgentType(recallConfig);
```

**Step 4: Add side-effect import to barrel**

In `src/lib/agents/index.ts`, add: `import "./agents/recall";`

**Step 5: Run tests and commit**

Run: `npx vitest run`
Expected: All pass

```bash
git add src/lib/agents/agents/recall.ts src/lib/agents/index.ts src/__tests__/lib/agents/recall.test.ts
git commit -m "feat: add recall agent with 3 tools for patient reactivation"
```

---

## Task 7: Recall Cron Routes (enqueue + send)

Two cron routes: one scans for inactive patients and populates `recall_queue`, the other sends messages from the queue.

**Files:**
- Create: `src/app/api/cron/recall/route.ts` (enqueue scan)
- Create: `src/app/api/cron/recall-send/route.ts` (send from queue)
- Modify: `vercel.json`

The implementation is identical to the previous plan version (Tasks 6+7 from the Pagar.me plan) since recall does not use the payment gateway. Refer to the recall cron code from the earlier plan draft. Key logic:

- **Enqueue** (`/api/cron/recall`): scans patients table, finds those whose most recent appointment is >90 days ago and not already in `recall_queue`, inserts new pending entries.
- **Send** (`/api/cron/recall-send`): fetches pending `recall_queue` entries, sends WhatsApp template via `sendOutboundTemplate()`, updates status.

**vercel.json after this task:**

```json
{
  "crons": [
    { "path": "/api/cron/confirmations", "schedule": "0 8 * * *" },
    { "path": "/api/cron/nps", "schedule": "0 12 * * *" },
    { "path": "/api/cron/billing", "schedule": "0 9,14 * * 1-6" },
    { "path": "/api/cron/recall", "schedule": "0 10 * * 1-5" },
    { "path": "/api/cron/recall-send", "schedule": "30 10 * * 1-5" }
  ]
}
```

**Commit:**

```bash
git add src/app/api/cron/recall/route.ts src/app/api/cron/recall-send/route.ts vercel.json
git commit -m "feat: add recall cron routes for patient reactivation"
```

---

## Task 8: Invoice API Routes — CRUD

Create API routes for managing invoices from the web UI.

**Files:**
- Create: `src/lib/validations/billing.ts`
- Create: `src/app/api/invoices/route.ts` (GET list + POST create)
- Create: `src/app/api/invoices/[id]/route.ts` (GET detail + PATCH update)

**Step 1: Write Zod schemas**

Create `src/lib/validations/billing.ts`:

```ts
import { z } from "zod";

export const createInvoiceSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional(),
  amount_cents: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  notes: z.string().max(500).optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(["pending", "partial", "paid", "overdue", "cancelled"]).optional(),
  amount_cents: z.number().int().positive().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
  paid_at: z.string().datetime().optional(),
});
```

**Step 2: Write the list + create route** (`src/app/api/invoices/route.ts`)

Standard pattern: auth check via `createServerClient()`, get `clinic_id` from `clinic_users`, Zod validation, return `{ data }` or `{ error }`.

**Step 3: Write the detail + update route** (`src/app/api/invoices/[id]/route.ts`)

GET returns invoice with `patients(name, phone)` and `payment_links(*)`. PATCH validates with `updateInvoiceSchema`.

**Step 4: Commit**

```bash
git add src/lib/validations/billing.ts src/app/api/invoices/route.ts src/app/api/invoices/[id]/route.ts
git commit -m "feat: add invoice API routes with Zod validation"
```

---

## Task 9: Asaas Integration UI in Settings

Add Asaas connection status to the Integrations tab.

**Files:**
- Modify: `src/components/settings/integrations-tab.tsx`

Add a card for Asaas showing:
- Connection status (configured via env var)
- Description: "Asaas — Pix and boleto payment charges"
- This is informational — Asaas config happens via env vars, not OAuth

Follow the same card pattern as Google Calendar integration.

**Commit:**

```bash
git add src/components/settings/integrations-tab.tsx
git commit -m "feat: add Asaas integration status to Settings"
```

---

## Task 10: i18n strings for billing and recall modules

**Files:** `messages/pt-BR.json`, `messages/en.json`, `messages/es.json`

Add under `"agents"`:

```json
"billing": { "label": "Cobranca", "description": "Envia lembretes de pagamento e gera links de Pix/boleto" },
"recall": { "label": "Reativacao", "description": "Reativa pacientes inativos ha mais de 90 dias" }
```

(And translations for en/es.)

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add i18n strings for billing and recall agents"
```

---

## Task 11: TypeScript compile check + full test run

Run: `npx tsc --noEmit` — expect 0 errors
Run: `npx vitest run` — expect all pass

---

## Task 12: Update CLAUDE.md and MEMORY.md

**CLAUDE.md additions:**

Agent registry table — add:
| `billing` | `agents/billing.ts` | `create_payment_link`, `check_payment_status`, `send_payment_reminder`, `escalate_billing` | whatsapp |
| `recall` | `agents/recall.ts` | `send_reactivation_message`, `route_to_scheduling`, `mark_patient_inactive` | whatsapp |

Cron routes — add:
| `GET /api/cron/billing` | `0 9,14 * * 1-6` | Drip payment reminders |
| `GET /api/cron/recall` | `0 10 * * 1-5` | Enqueue inactive patients |
| `GET /api/cron/recall-send` | `30 10 * * 1-5` | Send recall messages |

Tech stack update: Payments → Asaas (was Pagar.me)

New env vars:
- `ASAAS_API_KEY` — Asaas API key
- `ASAAS_WEBHOOK_TOKEN` — Asaas webhook auth token
- `ASAAS_ENV` — `sandbox` or `production`

New webhook: `POST /api/webhooks/asaas`

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 9 billing/recall agents and Asaas integration"
```

---

## Summary

| Task | What | Files Created | Files Modified |
|------|------|--------------|---------------|
| 1 | DB migration (Asaas columns) | `007_asaas_integration.sql` | `database.ts` |
| 2 | Asaas service | `asaas.ts`, test | — |
| 3 | Billing agent | `billing.ts`, test | `index.ts` |
| 4 | Asaas webhook | `webhooks/asaas/route.ts`, test | — |
| 5 | Billing cron | `cron/billing/route.ts`, test | `vercel.json` |
| 6 | Recall agent | `recall.ts`, test | `index.ts` |
| 7 | Recall crons (enqueue + send) | 2 route files | `vercel.json` |
| 8 | Invoice API routes | 2 route files + validation | — |
| 9 | Asaas settings UI | — | `integrations-tab.tsx` |
| 10 | i18n strings | — | 3 locale files |
| 11 | Full compile + test | — | — |
| 12 | Update docs | — | `CLAUDE.md` |

## New Environment Variables

| Variable | Purpose |
|----------|---------|
| `ASAAS_API_KEY` | Asaas API authentication |
| `ASAAS_WEBHOOK_TOKEN` | Asaas webhook token verification |
| `ASAAS_ENV` | `sandbox` or `production` (defaults to sandbox) |

## New API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/invoices` | List invoices (with filters) |
| POST | `/api/invoices` | Create invoice |
| GET | `/api/invoices/[id]` | Invoice detail + payment links |
| PATCH | `/api/invoices/[id]` | Update invoice |
| POST | `/api/webhooks/asaas` | Asaas payment event webhook |
| GET | `/api/cron/billing` | Drip payment reminders |
| GET | `/api/cron/recall` | Enqueue inactive patients |
| GET | `/api/cron/recall-send` | Send recall messages |

## Key Asaas vs Pagar.me Differences

| Aspect | Pagar.me (old) | Asaas (new) |
|--------|---------------|-------------|
| Value format | Cents (integer) | BRL reais (float) — convert! |
| Customer model | Optional | **Required** (name + CPF/CNPJ) |
| Auth | Basic auth (API key:) | Header `access_token` |
| Webhook auth | HMAC-SHA256 | Token in `asaas-access-token` header |
| Payment URL | Payment link URL | `invoiceUrl` (universal) |
| PIX data | Inline in response | Separate endpoint: `/pixQrCode` |
| Boleto data | Inline in response | Separate endpoint: `/identificationField` |
