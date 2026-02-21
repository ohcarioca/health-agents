# Platform Subscriptions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SaaS subscription billing so clinics pay monthly via Asaas recurring credit card, with tiered plans, 30-day trial, and enforcement of professional/message limits.

**Architecture:** New `plans` and `subscriptions` tables. Asaas Subscriptions API for recurring credit card. `proxy.ts` expanded for subscription gating. New `/api/subscriptions/*` routes. New Settings tab "Assinatura" with plan selector, card form, and management UI. Cron for trial/payment expiry.

**Tech Stack:** Asaas Subscriptions API, Supabase, Zod, next-intl, Recharts (usage bars), Lucide icons

---

## Task 1: Database Migration — Plans & Subscriptions Tables

**Files:**
- Create: `supabase/migrations/020_platform_subscriptions.sql`
- Modify: `src/types/database.ts` (add plans + subscriptions + clinics.messages_used_month types)

**Step 1: Write the migration SQL**

```sql
-- 020_platform_subscriptions.sql
-- Platform subscription billing: plans, subscriptions, message counter

-- ============================================
-- PLANS (static plan definitions)
-- ============================================
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  price_cents integer not null,
  max_professionals integer,          -- null = unlimited
  max_messages_month integer,         -- null = unlimited
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_updated_at
  before update on plans
  for each row execute function update_updated_at();

-- ============================================
-- SUBSCRIPTIONS (one active per clinic)
-- ============================================
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  plan_id uuid references plans(id),  -- null during trial
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  asaas_subscription_id text,
  asaas_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One subscription row per clinic
create unique index subscriptions_clinic_unique on subscriptions(clinic_id);

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function update_updated_at();

-- ============================================
-- CLINICS: monthly message counter
-- ============================================
alter table clinics add column messages_used_month integer not null default 0;

-- ============================================
-- SEED: initial plans
-- ============================================
insert into plans (name, slug, price_cents, max_professionals, max_messages_month, description, display_order)
values
  ('Starter', 'starter', 19900, 3, 500, 'Para clínicas pequenas começando a automatizar', 1),
  ('Pro', 'pro', 39900, 10, 2000, 'Para clínicas em crescimento com múltiplos profissionais', 2),
  ('Enterprise', 'enterprise', 69900, null, null, 'Para grandes clínicas sem limites', 3);

-- ============================================
-- SEED: subscription for existing clinics (trial)
-- ============================================
insert into subscriptions (clinic_id, status, trial_ends_at)
select id, 'trialing', now() + interval '30 days'
from clinics
where id not in (select clinic_id from subscriptions);

-- ============================================
-- RLS
-- ============================================
alter table plans enable row level security;
alter table subscriptions enable row level security;

-- Plans: anyone can read (public pricing page)
create policy "plans_read_all" on plans for select using (true);

-- Subscriptions: users can read their own clinic's subscription
create policy "subscriptions_read_own" on subscriptions for select
  using (clinic_id in (select get_user_clinic_ids()));
```

**Step 2: Add TypeScript types for new tables**

Add to `src/types/database.ts` inside the `Tables` interface:

```typescript
// In the Tables section, add:
plans: {
  Row: {
    id: string
    name: string
    slug: string
    price_cents: number
    max_professionals: number | null
    max_messages_month: number | null
    description: string | null
    display_order: number
    is_active: boolean
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    name: string
    slug: string
    price_cents: number
    max_professionals?: number | null
    max_messages_month?: number | null
    description?: string | null
    display_order?: number
    is_active?: boolean
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    name?: string
    slug?: string
    price_cents?: number
    max_professionals?: number | null
    max_messages_month?: number | null
    description?: string | null
    display_order?: number
    is_active?: boolean
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
subscriptions: {
  Row: {
    id: string
    clinic_id: string
    plan_id: string | null
    status: string
    asaas_subscription_id: string | null
    asaas_customer_id: string | null
    current_period_start: string | null
    current_period_end: string | null
    trial_ends_at: string | null
    cancelled_at: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    clinic_id: string
    plan_id?: string | null
    status?: string
    asaas_subscription_id?: string | null
    asaas_customer_id?: string | null
    current_period_start?: string | null
    current_period_end?: string | null
    trial_ends_at?: string | null
    cancelled_at?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    clinic_id?: string
    plan_id?: string | null
    status?: string
    asaas_subscription_id?: string | null
    asaas_customer_id?: string | null
    current_period_start?: string | null
    current_period_end?: string | null
    trial_ends_at?: string | null
    cancelled_at?: string | null
    created_at?: string
    updated_at?: string
  }
  Relationships: [
    { foreignKeyName: "subscriptions_clinic_id_fkey"; columns: ["clinic_id"]; referencedRelation: "clinics"; referencedColumns: ["id"] },
    { foreignKeyName: "subscriptions_plan_id_fkey"; columns: ["plan_id"]; referencedRelation: "plans"; referencedColumns: ["id"] }
  ]
}
```

Also add `messages_used_month: number` to the `clinics` Row/Insert/Update types.

**Step 3: Run migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 4: Commit**

```bash
git add supabase/migrations/020_platform_subscriptions.sql src/types/database.ts
git commit -m "feat: add plans and subscriptions tables for platform billing"
```

---

## Task 2: Asaas Subscription Service Functions

**Files:**
- Modify: `src/services/asaas.ts` (add subscription-related functions)

**Step 1: Add interfaces for subscription operations**

Add after the existing interfaces (around line 131):

```typescript
// --- Subscription Interfaces ---

interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone?: string;
  mobilePhone?: string;
  addressComplement?: string;
}

interface CreateSubscriptionParams {
  customerId: string;
  valueCents: number;
  nextDueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  creditCard: CreditCardData;
  creditCardHolderInfo: CreditCardHolderInfo;
}

interface CreateSubscriptionResult {
  success: boolean;
  subscriptionId?: string;
  status?: string;
  error?: string;
}

interface UpdateSubscriptionParams {
  subscriptionId: string;
  valueCents?: number;
  nextDueDate?: string;
  status?: string;
}

interface UpdateSubscriptionResult {
  success: boolean;
  error?: string;
}

interface CancelSubscriptionResult {
  success: boolean;
  error?: string;
}

interface GetSubscriptionResult {
  success: boolean;
  status?: string;
  nextDueDate?: string;
  valueCents?: number;
  error?: string;
}

interface TokenizeCreditCardParams {
  customerId: string;
  creditCard: CreditCardData;
  creditCardHolderInfo: CreditCardHolderInfo;
}

interface TokenizeCreditCardResult {
  success: boolean;
  creditCardToken?: string;
  creditCardNumber?: string; // last 4 digits
  creditCardBrand?: string;
  error?: string;
}

// Asaas response shapes
interface AsaasSubscriptionResponse {
  id: string;
  status: string;
  nextDueDate?: string;
  value?: number;
}

interface AsaasTokenizeResponse {
  creditCardToken: string;
  creditCardNumber: string;
  creditCardBrand: string;
}
```

**Step 2: Add subscription functions**

Add after `getBoletoIdentificationField()` (around line 280):

```typescript
// --- Subscription Functions ---

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResult> {
  const valueBrl = params.valueCents / 100;

  const body: Record<string, unknown> = {
    customer: params.customerId,
    billingType: "CREDIT_CARD",
    value: valueBrl,
    nextDueDate: params.nextDueDate,
    cycle: "MONTHLY",
    creditCard: params.creditCard,
    creditCardHolderInfo: params.creditCardHolderInfo,
  };

  if (params.description) body.description = params.description;
  if (params.externalReference) body.externalReference = params.externalReference;

  const result = await asaasFetch<AsaasSubscriptionResponse>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    subscriptionId: result.data.id,
    status: result.data.status,
  };
}

export async function updateSubscription(
  params: UpdateSubscriptionParams
): Promise<UpdateSubscriptionResult> {
  const body: Record<string, unknown> = {};
  if (params.valueCents !== undefined) body.value = params.valueCents / 100;
  if (params.nextDueDate) body.nextDueDate = params.nextDueDate;
  if (params.status) body.status = params.status;

  const result = await asaasFetch<AsaasSubscriptionResponse>(
    `/subscriptions/${params.subscriptionId}`,
    { method: "PUT", body: JSON.stringify(body) }
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<CancelSubscriptionResult> {
  const result = await asaasFetch<unknown>(
    `/subscriptions/${subscriptionId}`,
    { method: "DELETE" }
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

export async function getSubscriptionStatus(
  subscriptionId: string
): Promise<GetSubscriptionResult> {
  const result = await asaasFetch<AsaasSubscriptionResponse>(
    `/subscriptions/${subscriptionId}`
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    status: result.data.status,
    nextDueDate: result.data.nextDueDate,
    valueCents: result.data.value ? Math.round(result.data.value * 100) : undefined,
  };
}

export async function tokenizeCreditCard(
  params: TokenizeCreditCardParams
): Promise<TokenizeCreditCardResult> {
  const body = {
    customer: params.customerId,
    creditCard: params.creditCard,
    creditCardHolderInfo: params.creditCardHolderInfo,
  };

  const result = await asaasFetch<AsaasTokenizeResponse>("/creditCard/tokenize", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    creditCardToken: result.data.creditCardToken,
    creditCardNumber: result.data.creditCardNumber,
    creditCardBrand: result.data.creditCardBrand,
  };
}
```

**Step 3: Update type exports at bottom of file**

Add to existing exports:

```typescript
export type {
  // ... existing exports ...
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  UpdateSubscriptionParams,
  UpdateSubscriptionResult,
  CancelSubscriptionResult,
  GetSubscriptionResult,
  TokenizeCreditCardParams,
  TokenizeCreditCardResult,
  CreditCardData,
  CreditCardHolderInfo,
};
```

**Step 4: Commit**

```bash
git add src/services/asaas.ts
git commit -m "feat: add Asaas subscription API functions"
```

---

## Task 3: Validation Schemas for Subscriptions

**Files:**
- Create: `src/lib/validations/subscriptions.ts`

**Step 1: Write validation schemas**

```typescript
import { z } from "zod";

const creditCardSchema = z.object({
  holderName: z.string().min(3).max(100),
  number: z.string().regex(/^\d{13,19}$/, "Invalid card number"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "MM format"),
  expiryYear: z.string().regex(/^\d{4}$/, "YYYY format"),
  ccv: z.string().regex(/^\d{3,4}$/, "3-4 digits"),
});

const creditCardHolderInfoSchema = z.object({
  name: z.string().min(3).max(100),
  email: z.string().email(),
  cpfCnpj: z.string().min(11).max(18),
  postalCode: z.string().regex(/^\d{8}$/, "8 digits, no dash"),
  addressNumber: z.string().min(1).max(10),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  addressComplement: z.string().max(100).optional(),
});

export const createSubscriptionSchema = z.object({
  planSlug: z.string().min(1),
  creditCard: creditCardSchema,
  creditCardHolderInfo: creditCardHolderInfoSchema,
});

export const upgradeSubscriptionSchema = z.object({
  planSlug: z.string().min(1),
});

export const updateCardSchema = z.object({
  creditCard: creditCardSchema,
  creditCardHolderInfo: creditCardHolderInfoSchema,
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpgradeSubscriptionInput = z.infer<typeof upgradeSubscriptionSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
```

**Step 2: Commit**

```bash
git add src/lib/validations/subscriptions.ts
git commit -m "feat: add Zod validation schemas for subscriptions"
```

---

## Task 4: Subscription Helper Utility

**Files:**
- Create: `src/lib/subscriptions/index.ts`

**Step 1: Write subscription helpers**

```typescript
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";

/** Active statuses that allow full platform usage */
const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due"];

/**
 * Get the current subscription for a clinic.
 * Returns null if no subscription exists.
 */
export async function getClinicSubscription(clinicId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("clinic_id", clinicId)
    .single();
  return data;
}

/**
 * Check if a clinic has an active subscription (trialing, active, or past_due).
 */
export async function isSubscriptionActive(clinicId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("clinic_id", clinicId)
    .single();

  if (!data) return false;
  return ACTIVE_STATUSES.includes(data.status as SubscriptionStatus);
}

/**
 * Check if the clinic can add more professionals based on plan limits.
 * Returns { allowed: true } or { allowed: false, limit, current }.
 */
export async function canAddProfessional(clinicId: string): Promise<{
  allowed: boolean;
  limit?: number | null;
  current?: number;
}> {
  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id, status, plans(max_professionals)")
    .eq("clinic_id", clinicId)
    .single();

  // Trial = unlimited
  if (!sub || sub.status === "trialing") return { allowed: true };

  const plan = sub.plans as { max_professionals: number | null } | null;
  if (!plan || plan.max_professionals === null) return { allowed: true };

  const { count } = await supabase
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  const current = count ?? 0;
  return {
    allowed: current < plan.max_professionals,
    limit: plan.max_professionals,
    current,
  };
}

/**
 * Increment the monthly message counter for a clinic.
 * Returns the new count and whether the clinic is over its plan limit.
 */
export async function incrementMessageCount(clinicId: string): Promise<{
  count: number;
  limit: number | null;
  overLimit: boolean;
  warningThreshold: boolean; // true when >= 80% of limit
}> {
  const supabase = createAdminClient();

  // Increment counter
  const { data: clinic } = await supabase
    .rpc("increment_messages_used_month" as never, { p_clinic_id: clinicId } as never);

  // Fallback: manual increment if RPC doesn't exist
  const { data: clinicData } = await supabase
    .from("clinics")
    .select("messages_used_month")
    .eq("id", clinicId)
    .single();

  const currentCount = (clinicData?.messages_used_month ?? 0) + 1;

  await supabase
    .from("clinics")
    .update({ messages_used_month: currentCount })
    .eq("id", clinicId);

  // Get plan limit
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, plans(max_messages_month)")
    .eq("clinic_id", clinicId)
    .single();

  if (!sub || sub.status === "trialing") {
    return { count: currentCount, limit: null, overLimit: false, warningThreshold: false };
  }

  const plan = sub.plans as { max_messages_month: number | null } | null;
  const limit = plan?.max_messages_month ?? null;

  if (limit === null) {
    return { count: currentCount, limit: null, overLimit: false, warningThreshold: false };
  }

  return {
    count: currentCount,
    limit,
    overLimit: currentCount >= limit,
    warningThreshold: currentCount >= Math.floor(limit * 0.8),
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/subscriptions/index.ts
git commit -m "feat: add subscription helper utilities"
```

---

## Task 5: Signup Flow — Create Subscription on Signup

**Files:**
- Modify: `src/app/api/auth/signup/route.ts` (add subscription creation after agents)

**Step 1: Add subscription creation after agent inserts (after line 113)**

After the existing `await supabase.from("agents").insert(agentInserts);` add:

```typescript
  // 6. Create trial subscription
  await supabase.from("subscriptions").insert({
    clinic_id: clinic.id,
    status: "trialing",
    trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
```

**Step 2: Commit**

```bash
git add src/app/api/auth/signup/route.ts
git commit -m "feat: create trial subscription on clinic signup"
```

---

## Task 6: Plans API Route (Public)

**Files:**
- Create: `src/app/api/plans/route.ts`

**Step 1: Write the plans list endpoint**

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("plans")
    .select("id, name, slug, price_cents, max_professionals, max_messages_month, description, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
```

**Step 2: Commit**

```bash
git add src/app/api/plans/route.ts
git commit -m "feat: add public plans listing API route"
```

---

## Task 7: Subscriptions API Routes

**Files:**
- Create: `src/app/api/subscriptions/route.ts` (GET + POST)
- Create: `src/app/api/subscriptions/upgrade/route.ts`
- Create: `src/app/api/subscriptions/cancel/route.ts`
- Create: `src/app/api/subscriptions/update-card/route.ts`
- Create: `src/app/api/subscriptions/invoices/route.ts`

**Step 1: GET + POST subscription**

`src/app/api/subscriptions/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSubscriptionSchema } from "@/lib/validations/subscriptions";
import {
  createCustomer,
  createSubscription as createAsaasSubscription,
} from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get subscription with plan details
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("clinic_id", clinicId)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "no subscription found" }, { status: 404 });
  }

  // Get current usage
  const [profCount, clinicData] = await Promise.all([
    supabase
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId),
    supabase
      .from("clinics")
      .select("messages_used_month")
      .eq("id", clinicId)
      .single(),
  ]);

  return NextResponse.json({
    data: {
      ...subscription,
      usage: {
        professionals: profCount.count ?? 0,
        messages_used_month: clinicData.data?.messages_used_month ?? 0,
      },
    },
  });
}

export async function POST(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planSlug, creditCard, creditCardHolderInfo } = parsed.data;
  const supabase = createAdminClient();

  // 1. Get plan
  const { data: plan } = await supabase
    .from("plans")
    .select("id, price_cents, name")
    .eq("slug", planSlug)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan not found" }, { status: 404 });
  }

  // 2. Get current subscription
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("id, status, asaas_customer_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!existingSub) {
    return NextResponse.json({ error: "no subscription record" }, { status: 404 });
  }

  if (existingSub.status === "active") {
    return NextResponse.json({ error: "already subscribed, use upgrade" }, { status: 409 });
  }

  // 3. Get or create Asaas customer
  let asaasCustomerId = existingSub.asaas_customer_id;

  if (!asaasCustomerId) {
    const customerResult = await createCustomer({
      name: creditCardHolderInfo.name,
      cpfCnpj: creditCardHolderInfo.cpfCnpj,
      email: creditCardHolderInfo.email,
      phone: creditCardHolderInfo.phone,
      externalReference: clinicId,
    });

    if (!customerResult.success) {
      return NextResponse.json(
        { error: `Asaas customer creation failed: ${customerResult.error}` },
        { status: 502 }
      );
    }

    asaasCustomerId = customerResult.customerId!;
  }

  // 4. Create Asaas subscription
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDueDate = tomorrow.toISOString().split("T")[0];

  const subResult = await createAsaasSubscription({
    customerId: asaasCustomerId,
    valueCents: plan.price_cents,
    nextDueDate,
    description: `Órbita - Plano ${plan.name}`,
    externalReference: `sub:${existingSub.id}`,
    creditCard,
    creditCardHolderInfo,
  });

  if (!subResult.success) {
    return NextResponse.json(
      { error: `Subscription creation failed: ${subResult.error}` },
      { status: 502 }
    );
  }

  // 5. Update local subscription
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await supabase
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      status: "active",
      asaas_subscription_id: subResult.subscriptionId,
      asaas_customer_id: asaasCustomerId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq("id", existingSub.id);

  return NextResponse.json({
    data: { subscriptionId: existingSub.id, status: "active", planSlug },
  }, { status: 201 });
}
```

**Step 2: Upgrade route**

`src/app/api/subscriptions/upgrade/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { upgradeSubscriptionSchema } from "@/lib/validations/subscriptions";
import { updateSubscription } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = upgradeSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get current subscription
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, asaas_subscription_id, status")
    .eq("clinic_id", clinicId)
    .single();

  if (!sub || !sub.asaas_subscription_id || sub.status !== "active") {
    return NextResponse.json({ error: "no active subscription" }, { status: 400 });
  }

  // Get new plan
  const { data: newPlan } = await supabase
    .from("plans")
    .select("id, price_cents, name")
    .eq("slug", parsed.data.planSlug)
    .eq("is_active", true)
    .single();

  if (!newPlan) {
    return NextResponse.json({ error: "plan not found" }, { status: 404 });
  }

  // Update Asaas subscription value
  const result = await updateSubscription({
    subscriptionId: sub.asaas_subscription_id,
    valueCents: newPlan.price_cents,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: `Upgrade failed: ${result.error}` },
      { status: 502 }
    );
  }

  // Update local
  await supabase
    .from("subscriptions")
    .update({ plan_id: newPlan.id })
    .eq("id", sub.id);

  return NextResponse.json({ data: { planSlug: parsed.data.planSlug, status: "active" } });
}
```

**Step 3: Cancel route**

`src/app/api/subscriptions/cancel/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { cancelSubscription } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, asaas_subscription_id, status, current_period_end")
    .eq("clinic_id", clinicId)
    .single();

  if (!sub || !sub.asaas_subscription_id) {
    return NextResponse.json({ error: "no active subscription" }, { status: 400 });
  }

  if (sub.status === "cancelled") {
    return NextResponse.json({ error: "already cancelled" }, { status: 409 });
  }

  const result = await cancelSubscription(sub.asaas_subscription_id);

  if (!result.success) {
    return NextResponse.json(
      { error: `Cancellation failed: ${result.error}` },
      { status: 502 }
    );
  }

  // Mark as cancelled — access continues until current_period_end
  await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  return NextResponse.json({
    data: {
      status: "cancelled",
      accessUntil: sub.current_period_end,
    },
  });
}
```

**Step 4: Update card route**

`src/app/api/subscriptions/update-card/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateCardSchema } from "@/lib/validations/subscriptions";
import { tokenizeCreditCard } from "@/services/asaas";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("asaas_customer_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!sub?.asaas_customer_id) {
    return NextResponse.json({ error: "no subscription customer" }, { status: 400 });
  }

  const result = await tokenizeCreditCard({
    customerId: sub.asaas_customer_id,
    creditCard: parsed.data.creditCard,
    creditCardHolderInfo: parsed.data.creditCardHolderInfo,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: `Card update failed: ${result.error}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    data: {
      lastFourDigits: result.creditCardNumber,
      brand: result.creditCardBrand,
    },
  });
}
```

**Step 5: Invoices (platform) route**

`src/app/api/subscriptions/invoices/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get subscription to find Asaas subscription ID
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("asaas_subscription_id")
    .eq("clinic_id", clinicId)
    .single();

  if (!sub?.asaas_subscription_id) {
    return NextResponse.json({ data: [] });
  }

  // Fetch charges from Asaas for this subscription
  // Note: For MVP, we fetch directly from Asaas API
  // Future improvement: cache in local table
  const { getSubscriptionPayments } = await import("@/services/asaas");

  const result = await getSubscriptionPayments(sub.asaas_subscription_id);
  return NextResponse.json({ data: result.success ? result.payments : [] });
}
```

Note: `getSubscriptionPayments` needs to be added to the Asaas service — add this function alongside the others:

```typescript
interface SubscriptionPayment {
  id: string;
  value: number;
  dueDate: string;
  status: string;
  paymentDate?: string;
  invoiceUrl?: string;
}

interface GetSubscriptionPaymentsResult {
  success: boolean;
  payments?: SubscriptionPayment[];
  error?: string;
}

export async function getSubscriptionPayments(
  subscriptionId: string
): Promise<GetSubscriptionPaymentsResult> {
  const result = await asaasFetch<{ data: SubscriptionPayment[] }>(
    `/subscriptions/${subscriptionId}/payments`
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    payments: result.data.data.map((p) => ({
      ...p,
      value: Math.round(p.value * 100), // convert to cents
    })),
  };
}
```

**Step 6: Commit**

```bash
git add src/app/api/subscriptions/ src/app/api/plans/ src/services/asaas.ts
git commit -m "feat: add subscription API routes (create, upgrade, cancel, update-card, invoices)"
```

---

## Task 8: Webhook Expansion — Platform Subscription Events

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`

**Step 1: Add subscription charge handling**

At the top of the POST handler, after extracting `invoiceId` (line 30), add logic to detect subscription charges:

```typescript
  // Detect platform subscription charges by externalReference prefix
  const isSubscriptionCharge = invoiceId.startsWith("sub:");

  if (isSubscriptionCharge) {
    return handleSubscriptionWebhook(event, invoiceId.replace("sub:", ""), paymentDate);
  }

  // ... existing patient invoice logic continues below ...
```

Add the handler function at the bottom of the file:

```typescript
async function handleSubscriptionWebhook(
  event: string,
  subscriptionLocalId: string,
  paymentDate: string | null
): Promise<NextResponse> {
  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, status, current_period_end")
    .eq("id", subscriptionLocalId)
    .single();

  if (!sub) {
    console.warn(`[asaas-webhook] Subscription ${subscriptionLocalId} not found`);
    return NextResponse.json({ status: "skipped", reason: "subscription_not_found" });
  }

  if (PAID_EVENTS.has(event)) {
    // Renew period
    const newPeriodEnd = new Date(sub.current_period_end ?? new Date());
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: paymentDate ?? new Date().toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
      })
      .eq("id", sub.id);

    console.log(`[asaas-webhook] Subscription ${sub.id} renewed until ${newPeriodEnd.toISOString()}`);
  } else if (OVERDUE_EVENTS.has(event)) {
    if (sub.status !== "past_due") {
      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", sub.id);
      console.log(`[asaas-webhook] Subscription ${sub.id} marked past_due`);
    }
  }

  return NextResponse.json({ status: "ok", subscriptionId: sub.id, event });
}
```

**Step 2: Commit**

```bash
git add src/app/api/webhooks/asaas/route.ts
git commit -m "feat: expand Asaas webhook to handle platform subscription charges"
```

---

## Task 9: Subscription Check Cron

**Files:**
- Create: `src/app/api/cron/subscription-check/route.ts`
- Modify: `vercel.json` (add cron entry)

**Step 1: Write the cron route**

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let expiredTrials = 0;
  let expiredPastDue = 0;
  let resetMessages = 0;

  // 1. Expire trials that have passed trial_ends_at
  const { data: expiredTrialSubs } = await supabase
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "trialing")
    .lt("trial_ends_at", now)
    .select("id");

  expiredTrials = expiredTrialSubs?.length ?? 0;

  // 2. Expire past_due subscriptions older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiredPastDueSubs } = await supabase
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "past_due")
    .lt("updated_at", sevenDaysAgo)
    .select("id");

  expiredPastDue = expiredPastDueSubs?.length ?? 0;

  // 3. Reset monthly message counters for clinics whose billing cycle just rolled over
  // Find active subscriptions where current_period_end has passed
  const { data: rolledOver } = await supabase
    .from("subscriptions")
    .select("clinic_id")
    .eq("status", "active")
    .lt("current_period_end", now);

  if (rolledOver && rolledOver.length > 0) {
    const clinicIds = rolledOver.map((s) => s.clinic_id);
    await supabase
      .from("clinics")
      .update({ messages_used_month: 0 })
      .in("id", clinicIds);
    resetMessages = clinicIds.length;
  }

  console.log(
    `[cron/subscription-check] expired trials=${expiredTrials}, expired past_due=${expiredPastDue}, reset messages=${resetMessages}`
  );

  return NextResponse.json({
    status: "ok",
    expiredTrials,
    expiredPastDue,
    resetMessages,
  });
}
```

**Step 2: Add cron entry to vercel.json**

Add to the `crons` array:

```json
{ "path": "/api/cron/subscription-check", "schedule": "0 3 * * *" }
```

(Runs daily at 3am UTC — early morning in Brazil)

**Step 3: Commit**

```bash
git add src/app/api/cron/subscription-check/route.ts vercel.json
git commit -m "feat: add subscription-check cron for trial expiry and message reset"
```

---

## Task 10: Subscription Gating in proxy.ts

**Files:**
- Modify: `src/proxy.ts`

**Step 1: Add subscription check after auth check**

The proxy currently handles auth-only routing. Expand it to check subscription status for authenticated users on dashboard routes.

After the auth redirect logic (around line 64), add subscription gating:

```typescript
  // Subscription gating for dashboard routes (mutating API calls)
  if (user && !isPublicRoute(pathname) && !isAuthRoute(pathname)) {
    // Check subscription status for API mutations
    if (
      pathname.startsWith("/api/") &&
      request.method !== "GET" &&
      !pathname.startsWith("/api/auth") &&
      !pathname.startsWith("/api/subscriptions") &&
      !pathname.startsWith("/api/plans") &&
      !pathname.startsWith("/api/webhooks") &&
      !pathname.startsWith("/api/cron")
    ) {
      // Check subscription via header (set by middleware or fetched)
      const subscriptionStatus = await getSubscriptionStatusForUser(supabase, user.id);
      if (subscriptionStatus === "expired" || subscriptionStatus === "cancelled") {
        return NextResponse.json(
          { error: "subscription_required" },
          { status: 403 }
        );
      }
    }
  }
```

Note: The `getSubscriptionStatusForUser` helper needs to be inline in proxy.ts since it runs at the Edge and cannot import server-only modules. Use a lightweight Supabase query:

```typescript
async function getSubscriptionStatusForUser(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string | null> {
  // Get clinic ID for this user
  const { data: clinicUser } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (!clinicUser) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("clinic_id", clinicUser.clinic_id)
    .single();

  return sub?.status ?? null;
}
```

**Important:** This adds latency to every API mutation. Consider caching the subscription status in a short-lived cookie or header to avoid repeated DB queries. For MVP, the direct query is acceptable.

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: add subscription gating to proxy for API mutations"
```

---

## Task 11: Enforcement — Professional Limit

**Files:**
- Modify: `src/app/api/settings/professionals/route.ts` (POST handler)

**Step 1: Add professional limit check**

At the beginning of the POST handler, before creating the professional:

```typescript
import { canAddProfessional } from "@/lib/subscriptions";

// In POST handler, before insert:
const profCheck = await canAddProfessional(clinicId);
if (!profCheck.allowed) {
  return NextResponse.json(
    {
      error: "professional_limit_reached",
      limit: profCheck.limit,
      current: profCheck.current,
    },
    { status: 403 }
  );
}
```

**Step 2: Commit**

```bash
git add src/app/api/settings/professionals/route.ts
git commit -m "feat: enforce professional limit based on subscription plan"
```

---

## Task 12: Enforcement — Message Counter

**Files:**
- Modify: `src/lib/agents/outbound.ts` (add message counting)

**Step 1: Increment message counter in sendOutboundMessage**

After a successful message send, call:

```typescript
import { incrementMessageCount } from "@/lib/subscriptions";

// After successful send in sendOutboundMessage():
const msgStats = await incrementMessageCount(clinicId);
if (msgStats.warningThreshold && !msgStats.overLimit) {
  console.log(`[outbound] Clinic ${clinicId} at ${msgStats.count}/${msgStats.limit} messages (warning threshold)`);
}
if (msgStats.overLimit) {
  console.warn(`[outbound] Clinic ${clinicId} over message limit: ${msgStats.count}/${msgStats.limit}`);
}
```

**Step 2: Also add to WhatsApp webhook processing**

In `src/app/api/webhooks/whatsapp/route.ts`, after successfully processing a response (outbound reply), increment the counter.

**Step 3: Commit**

```bash
git add src/lib/agents/outbound.ts src/app/api/webhooks/whatsapp/route.ts
git commit -m "feat: track monthly message usage against plan limits"
```

---

## Task 13: i18n — Subscription Strings

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add subscription strings to all locales**

Add a `"subscription"` section to each locale file with keys for:

- `subscription.title` — "Assinatura"
- `subscription.trial.banner` — "Seu trial gratuito de 30 dias começou! Restam {days} dias."
- `subscription.trial.expired` — "Seu trial expirou"
- `subscription.active.banner` — "Plano {plan} — Próxima cobrança: {date}"
- `subscription.pastDue.banner` — "Falha no pagamento — {amount} pendente"
- `subscription.usage.professionals` — "{current} / {limit} profissionais"
- `subscription.usage.messages` — "{current} / {limit} mensagens"
- `subscription.actions.choosePlan` — "Escolher plano"
- `subscription.actions.subscribe` — "Assinar — {price}/mês"
- `subscription.actions.upgrade` — "Trocar plano"
- `subscription.actions.updateCard` — "Atualizar cartão"
- `subscription.actions.cancel` — "Cancelar assinatura"
- `subscription.card.title` — "Dados do cartão"
- `subscription.card.holderName` — "Nome no cartão"
- `subscription.card.number` — "Número do cartão"
- `subscription.card.expiry` — "Validade"
- `subscription.card.cvv` — "CVV"
- `subscription.holder.title` — "Dados do titular"
- `subscription.holder.name` — "Nome completo"
- `subscription.holder.cpfCnpj` — "CPF/CNPJ"
- `subscription.holder.email` — "Email"
- `subscription.holder.phone` — "Telefone"
- `subscription.holder.postalCode` — "CEP"
- `subscription.holder.addressNumber` — "Número"
- `subscription.invoices.title` — "Histórico de Faturas"
- `subscription.invoices.date` — "Data"
- `subscription.invoices.amount` — "Valor"
- `subscription.invoices.status` — "Status"
- `subscription.readOnly.title` — "Funcionalidades travadas"
- `subscription.readOnly.description` — "Assine para voltar a usar agendamento, mensagens e todas as funcionalidades."
- Settings tab: `settings.tabs.subscription` — "Assinatura"

Also add equivalent English and Spanish translations.

**Step 2: Commit**

```bash
git add messages/
git commit -m "feat: add i18n strings for subscription management"
```

---

## Task 14: UI — Subscription Banner Component

**Files:**
- Create: `src/components/subscription/subscription-banner.tsx`

**Step 1: Create the banner component**

A client component that fetches subscription status and renders the appropriate banner:

- **Trialing:** Blue banner with days remaining + CTA to subscribe
- **Active:** Subtle info bar with plan name + next billing date + usage
- **Past due:** Yellow/orange warning with CTA to update card
- **Expired/Cancelled:** Red banner with CTA to subscribe

Fetches from `GET /api/subscriptions` on mount. Auto-refreshes every 60 seconds.

Shows progress bars for professional and message usage.

**Step 2: Commit**

```bash
git add src/components/subscription/subscription-banner.tsx
git commit -m "feat: add subscription banner component with trial/active/expired states"
```

---

## Task 15: UI — Plan Selector Component

**Files:**
- Create: `src/components/subscription/plan-selector.tsx`

**Step 1: Create the plan selector**

A client component that:
- Fetches plans from `GET /api/plans`
- Renders plan cards in a responsive grid (1 col mobile, 3 cols desktop)
- Each card shows: name, price, limits (professionals, messages), description
- Current plan highlighted with badge
- "Assinar" or "Trocar plano" button per card
- Clicking opens the credit card form dialog

**Step 2: Commit**

```bash
git add src/components/subscription/plan-selector.tsx
git commit -m "feat: add plan selector component with comparison cards"
```

---

## Task 16: UI — Credit Card Form Component

**Files:**
- Create: `src/components/subscription/credit-card-form.tsx`

**Step 1: Create the card form dialog**

A client component rendered inside a Dialog (`size="lg"`) that:
- Shows selected plan name + price
- Two sections: "Dados do titular" + "Dados do cartão"
- All fields from `createSubscriptionSchema`
- Card number formatting (groups of 4)
- Expiry as MM/YY
- Submit calls `POST /api/subscriptions` (new) or `PUT /api/subscriptions/update-card` (update)
- Loading state + error display + success toast (sonner)
- Never stores card data locally

**Step 2: Commit**

```bash
git add src/components/subscription/credit-card-form.tsx
git commit -m "feat: add credit card form component for subscription payment"
```

---

## Task 17: UI — Subscription Manager Component

**Files:**
- Create: `src/components/subscription/subscription-manager.tsx`

**Step 1: Create the subscription manager**

The main component for the Settings "Assinatura" tab. Contains:

1. **Current Plan Card** — plan name, price, period dates, usage bars (professionals + messages)
2. **Actions Row** — "Trocar plano", "Atualizar cartão", "Cancelar assinatura" buttons
3. **Invoice History** — table fetched from `GET /api/subscriptions/invoices` with date, amount, status, receipt link

Handles:
- Upgrade: opens PlanSelector
- Cancel: confirmation dialog → `POST /api/subscriptions/cancel`
- Update card: opens CreditCardForm in update mode

**Step 2: Commit**

```bash
git add src/components/subscription/subscription-manager.tsx
git commit -m "feat: add subscription manager component for settings tab"
```

---

## Task 18: UI — Integrate into Settings Page + Dashboard

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx` (add Assinatura tab)
- Modify: `src/app/(dashboard)/dashboard/page.tsx` (add SubscriptionBanner)

**Step 1: Add Assinatura tab to settings**

In `src/app/(dashboard)/settings/page.tsx`:

1. Add `"tabs.subscription"` to `TAB_KEYS` array
2. Add `subscription: 8` to `TAB_PARAM_MAP`
3. Import `SubscriptionManager`
4. Add `{activeTab === 8 && <SubscriptionManager />}` in the render

**Step 2: Add banner to dashboard**

In `src/app/(dashboard)/dashboard/page.tsx`:

Import `SubscriptionBanner` (client component) and render it at the top of the page, before the KPI cards.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: integrate subscription tab in settings and banner in dashboard"
```

---

## Task 19: UI — Upgrade Prompt (Blocked Action Modal)

**Files:**
- Create: `src/components/subscription/upgrade-prompt.tsx`

**Step 1: Create upgrade prompt modal**

A client component that shows when a user tries to perform a blocked action (e.g., add professional over limit, action while expired). Triggered by:
- 403 response with `error: "subscription_required"` or `error: "professional_limit_reached"`
- Client-side guard components

Shows plan options with CTA to subscribe/upgrade.

**Step 2: Commit**

```bash
git add src/components/subscription/upgrade-prompt.tsx
git commit -m "feat: add upgrade prompt modal for blocked actions"
```

---

## Task 20: WhatsApp Agent Gating

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts`

**Step 1: Add subscription check alongside is_active check**

In the `after()` block where messages are processed (around line 105), after checking `clinic.is_active`, add:

```typescript
// Check subscription status
const { data: subscription } = await supabase
  .from("subscriptions")
  .select("status")
  .eq("clinic_id", clinic.id)
  .single();

const subStatus = subscription?.status;
if (subStatus !== "trialing" && subStatus !== "active" && subStatus !== "past_due") {
  console.log(
    `[webhook/whatsapp] ignoring message: clinic ${clinic.id} subscription ${subStatus}`
  );
  return;
}
```

**Step 2: Commit**

```bash
git add src/app/api/webhooks/whatsapp/route.ts
git commit -m "feat: gate WhatsApp agent responses by subscription status"
```

---

## Task 21: Cron Gating

**Files:**
- Modify: All 6 cron routes to skip clinics without active subscriptions

**Step 1: Update each cron to join with subscriptions**

For each cron route that queries clinics, add a filter to only process clinics with `subscription.status IN ('trialing', 'active', 'past_due')`.

The simplest approach: when querying clinics or clinic-related data, join with `subscriptions` table:

```typescript
// Instead of just checking is_active, also check subscription
// Example for billing cron:
const { data: clinics } = await supabase
  .from("clinics")
  .select("id, ..., subscriptions!inner(status)")
  .eq("is_active", true)
  .in("subscriptions.status", ["trialing", "active", "past_due"]);
```

Apply to: confirmations, nps, billing, recall, recall-send, message-retry.

**Step 2: Commit**

```bash
git add src/app/api/cron/
git commit -m "feat: gate all cron routes by subscription status"
```

---

## Task 22: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add subscription documentation**

Add sections for:
- New tables: `plans`, `subscriptions`
- New column: `clinics.messages_used_month`
- New API routes: `/api/plans`, `/api/subscriptions/*`
- New cron: `/api/cron/subscription-check`
- Subscription status flow
- Enforcement rules
- Settings tab update (9 tabs)

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with subscription billing documentation"
```

---

## Task Dependency Graph

```
Task 1 (DB migration)
  ├── Task 2 (Asaas service)
  │     └── Task 7 (API routes) ──── Task 8 (webhook expansion)
  ├── Task 3 (validations)
  │     └── Task 7
  ├── Task 4 (subscription helpers)
  │     ├── Task 10 (proxy gating)
  │     ├── Task 11 (professional limit)
  │     └── Task 12 (message counter)
  ├── Task 5 (signup flow)
  ├── Task 6 (plans API)
  └── Task 9 (cron)

Task 13 (i18n) ─── independent, do early

Task 14-19 (UI) ─── depend on API routes (Task 7)
  Task 14 (banner)
  Task 15 (plan selector)
  Task 16 (card form)
  Task 17 (subscription manager)
  Task 18 (settings + dashboard integration)
  Task 19 (upgrade prompt)

Task 20 (WhatsApp gating) ─── depends on Task 1
Task 21 (cron gating) ─── depends on Task 1
Task 22 (CLAUDE.md) ─── last
```

**Recommended execution order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22

**Parallel opportunities:** Tasks 2+3+4+5+6 can run in parallel after Task 1. Tasks 14-19 can be partially parallelized. Tasks 20+21 can run in parallel.
