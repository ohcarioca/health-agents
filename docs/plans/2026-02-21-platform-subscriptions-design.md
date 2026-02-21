# Platform Subscriptions — Design Document

**Date:** 2026-02-21
**Status:** Approved
**Approach:** Asaas Subscriptions API (recurring credit card)

---

## Overview

Add SaaS subscription billing to the Órbita platform. Clinics subscribe to tiered plans with limits on professionals and messages. Payment is via recurring credit card through Asaas Subscriptions API.

Currently, Asaas is used exclusively for patient-to-clinic payments. This feature adds a second billing dimension: platform-to-clinic subscriptions.

---

## Pricing Model

- **2-3 tiered plans** (e.g., Starter / Pro / Enterprise)
- All plans include all 6 modules (support, scheduling, confirmation, NPS, billing, recall)
- Plans differ by:
  - **Max professionals** (hard limit — blocks registration beyond limit)
  - **Max messages per month** (soft limit — warns at 80%, degrades at 100%)
- Plans are defined in a `plans` database table (admin-managed, not hardcoded)

## Trial

- **30 days free** — all features unlocked, no card required
- On signup, a `subscriptions` row is created with `status: trialing`, `trial_ends_at: now + 30d`
- After 30 days without subscribing → `status: expired` → **read-only mode**

## Read-Only Mode (Expired / Cancelled)

When subscription is expired or cancelled:
- **Allowed:** View dashboard, reports, calendar, patient list, settings, all data
- **Blocked:** Create/edit appointments, register patients, send messages (WhatsApp agents don't respond), crons skip this clinic
- **Settings remain editable** (so clinic can configure before re-subscribing)
- Prominent banner with CTA to subscribe

## Payment Method

- **Credit card only** (recurring via Asaas)
- Card data captured in internal form (HTTPS required — Vercel guarantees this)
- Card data sent to Asaas API, never stored locally
- Tokenization for future card updates

## Grace Period

- On payment failure → `status: past_due`
- **7 days grace** — platform continues working
- After 7 days overdue → `status: expired` → read-only mode
- Email notification on payment failure

---

## Database Schema

### Table: `plans`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `name` | text NOT NULL | Display name (e.g., "Pro") |
| `slug` | text UNIQUE NOT NULL | URL-safe key (e.g., "pro") |
| `price_cents` | integer NOT NULL | Monthly price in cents (e.g., 39900 = R$399) |
| `max_professionals` | integer | NULL = unlimited |
| `max_messages_month` | integer | NULL = unlimited |
| `description` | text | Marketing description |
| `display_order` | integer DEFAULT 0 | Sort order for display |
| `is_active` | boolean DEFAULT true | Available for new subscriptions |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Table: `subscriptions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `clinic_id` | uuid FK → clinics UNIQUE | One active subscription per clinic |
| `plan_id` | uuid FK → plans | Current plan (NULL during trial) |
| `status` | text CHECK | `trialing`, `active`, `past_due`, `cancelled`, `expired` |
| `asaas_subscription_id` | text | Asaas subscription ID (e.g., `sub_xxx`) |
| `asaas_customer_id` | text | Asaas customer ID for the clinic owner |
| `current_period_start` | timestamptz | Current billing cycle start |
| `current_period_end` | timestamptz | Current billing cycle end |
| `trial_ends_at` | timestamptz | Trial expiration (30 days after signup) |
| `cancelled_at` | timestamptz | When subscription was cancelled |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Additional column on `clinics`

- `messages_used_month` (integer, DEFAULT 0) — monthly message counter, reset by cron

### Subscription Status Flow

```
signup → trialing (30 days)
              ↓ subscribes
            active ←→ past_due (payment failure)
              ↓                    ↓ (7 days)
          cancelled            expired

trialing → expired (didn't subscribe in 30 days)
```

---

## Asaas Integration

### New Functions in `src/services/asaas.ts`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `createSubscription()` | `POST /v3/subscriptions` | Create subscription with credit card |
| `updateSubscription()` | `PUT /v3/subscriptions/{id}` | Change value (upgrade/downgrade) |
| `cancelSubscription()` | `DELETE /v3/subscriptions/{id}` | Cancel subscription |
| `getSubscription()` | `GET /v3/subscriptions/{id}` | Check status |
| `tokenizeCreditCard()` | `POST /v3/creditCard/tokenize` | Tokenize card for future updates |

### Subscription Creation Flow

1. Owner selects plan → fills credit card form
2. Backend creates Asaas customer with owner's CPF/CNPJ (if not exists)
3. Backend calls `createSubscription()` with: `customer`, `billingType: CREDIT_CARD`, `value` (BRL), `cycle: MONTHLY`, `nextDueDate`, `creditCard` + `creditCardHolderInfo`
4. Asaas validates card → returns `sub_xxx`
5. Backend saves `subscriptions` row with `status: active`
6. Asaas generates charges automatically each month

### Webhook Expansion

The existing `/api/webhooks/asaas` will be expanded to distinguish between patient charges and platform subscription charges.

**Discrimination:** `externalReference` prefix:
- `sub:{subscription_id}` → platform subscription charge
- UUID (no prefix) → patient invoice charge (existing flow)

**Platform charge events:**
- `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` → `subscription.status = active`, update `current_period_end`
- `PAYMENT_OVERDUE` → `subscription.status = past_due`, send warning email
- After 7 days overdue (checked by cron) → `subscription.status = expired`

---

## Enforcement

### Where Limits Are Checked

| Check | Where | Behavior |
|-------|-------|----------|
| **Professionals** | `POST /api/settings/professionals` | Hard block: reject if `count >= plan.max_professionals` |
| **Messages** | Outbound messaging (`sendOutboundMessage`) | Soft: increment counter, warn at 80%/100% |
| **Trial expired** | `middleware.ts` (Edge) | Redirect to `/settings/billing` for mutating requests |
| **Subscription expired** | `middleware.ts` (Edge) | Read-only: block POST/PUT/DELETE on protected routes |
| **Crons** | Each cron route | Skip clinics without active/trialing subscription |
| **WhatsApp agents** | Webhook processing | Don't respond if subscription != active/trialing |

### Middleware — Subscription Gate

```
Request → auth check → subscription check → route

Subscription check:
  GET requests → always allow (read-only mode)
  POST/PUT/DELETE on /api/*:
    trialing or active → allow
    past_due (< 7 days) → allow + warning header
    expired / cancelled → 403 { error: "subscription_required" }
  Exempt routes: /api/auth/*, /settings/billing, /api/subscriptions/*, /api/plans
```

### Monthly Message Reset

New cron `GET /api/cron/subscription-check`:
- Runs daily at midnight
- Resets `clinics.messages_used_month = 0` when billing cycle rolls over
- Expires trials past 30 days
- Expires past_due subscriptions older than 7 days

---

## API Routes

### New Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/subscriptions` | GET | Current subscription + plan + usage |
| `/api/subscriptions` | POST | Create subscription (plan + card data) |
| `/api/subscriptions/upgrade` | PUT | Change plan (upgrade/downgrade) |
| `/api/subscriptions/cancel` | POST | Cancel subscription (continues until cycle end) |
| `/api/subscriptions/update-card` | PUT | Update credit card (tokenization) |
| `/api/subscriptions/invoices` | GET | Platform invoice history |
| `/api/plans` | GET | List available plans (public, no auth) |

### New Cron

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/subscription-check` | `0 0 * * *` | Trial expiry, past_due expiry, message counter reset |

---

## UI Components

### New Tab in Settings

9th tab: **Assinatura** (after Equipe)

### Components

| Component | Type | Location |
|-----------|------|----------|
| `SubscriptionBanner` | Client | Dashboard header — trial countdown / usage / warnings |
| `PlanSelector` | Client | `/settings/billing` — plan comparison cards |
| `CreditCardForm` | Client | Dialog inside PlanSelector — card input form |
| `SubscriptionManager` | Client | `/settings/billing` — current plan, usage bars, actions |
| `InvoiceHistory` | Client | Sub-section — platform charge history |
| `UpgradePrompt` | Client | Modal on blocked action — CTA to subscribe |

### User Flows

1. **Signup** → Dashboard with trial banner (30 days countdown)
2. **Choose plan** → Plan cards with comparison → Card form dialog → Subscribe
3. **Active** → Dashboard banner shows plan + usage (professionals X/Y, messages X/Y)
4. **Trial expires** → Full-screen banner + read-only mode
5. **Manage** → Settings > Assinatura tab: plan details, usage bars, invoice history, upgrade/downgrade/cancel/update card
6. **Payment fails** → Warning banner + email → 7 days grace → read-only

---

## Migration

### `020_platform_subscriptions.sql`

1. Create `plans` table
2. Create `subscriptions` table with unique constraint on `clinic_id`
3. Add `messages_used_month` to `clinics`
4. Seed initial plans (Starter, Pro, Enterprise with placeholder values)
5. Create `subscriptions` row for all existing clinics with `status: trialing`, `trial_ends_at: now + 30d`

---

## Security Considerations

- Credit card data never stored locally — sent directly to Asaas API
- HTTPS enforced (Vercel)
- Subscription status checked server-side (middleware + API routes) — never trust client
- Rate limit subscription creation (strict tier: 10/min)
- CPF/CNPJ validated before Asaas customer creation
- Webhook auth: same token-based verification as existing Asaas webhook
