# WhatsApp Per-Clinic + Agents Active by Default

**Date:** 2026-02-16
**Status:** Approved

## Problem

1. WhatsApp credentials (`WHATSAPP_TOKEN`, `TEST_WHATSAPP_PHONE_NUMBER_ID`) are global env vars — only one clinic can send messages. Multi-tenant doesn't work.
2. Signup creates `module_configs` (6 rows) but not `agents` rows. Routing queries `agents` table → new clinics throw "no registered agents" on first message.

## Solution

### 1. WhatsApp Per-Clinic Credentials

#### Database

Migration `008_whatsapp_per_clinic.sql` adds 3 nullable columns to `clinics`:

- `whatsapp_phone_number_id text` — Meta Phone Number ID
- `whatsapp_waba_id text` — WhatsApp Business Account ID
- `whatsapp_access_token text` — Permanent access token

Stored as plain text (consistent with `google_refresh_token` pattern). RLS protects access.

#### WhatsApp Service

`sendTextMessage` and `sendTemplateMessage` receive credentials as parameter instead of reading env vars:

```ts
interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

sendTextMessage(to, text, credentials)
sendTemplateMessage(to, templateName, language, params, credentials)
```

If credentials are missing, return `{ success: false, error: "whatsapp not configured" }`.

#### Callers Updated

- **`process-message.ts`**: Add WhatsApp columns to existing `clinics` select query (line 199). Pass credentials to `sendTextMessage`.
- **`outbound.ts`**: `sendOutboundMessage` and `sendOutboundTemplate` receive `WhatsAppCredentials` as parameter. Callers responsible for fetching.
- **5 cron routes** (confirmations, nps, billing, recall, recall-send): Fetch clinic WhatsApp credentials in existing query. Skip clinics without credentials.

#### What Doesn't Change

- **Webhook reception** (`POST /api/webhooks/whatsapp`): No change. Clinic lookup by `display_phone_number` → `clinics.phone` remains.
- **Signature verification** (`verifySignature`): Stays global (`META_APP_SECRET`). Signature is per-app, not per-number.
- **Router, engine, agent configs**: Zero changes.

#### UI — Settings WhatsApp Tab

Replace `WhatsAppPlaceholder` with `WhatsAppConfig` client component:

- 3 text inputs: Phone Number ID, WABA ID, Access Token
- Status badge: "Connected" (green) or "Not connected" (neutral)
- Save button
- Token partially masked when saved: `EAA...***`

Uses existing `PATCH /api/settings/clinic` endpoint. Add 3 fields to settings validation schema.

No "test connection" button (YAGNI). Failed sends appear in dashboard alerts.

### 2. Agents Active by Default

In `POST /api/auth/signup`, after creating `module_configs`, insert 6 rows in `agents` table:

| type | name | active |
|------|------|--------|
| support | Suporte | true |
| scheduling | Agendamento | true |
| confirmation | Confirmação | true |
| nps | Pesquisa NPS | true |
| billing | Financeiro | true |
| recall | Reativação | true |

All with `config: {}`, no custom instructions. Clinic works immediately after signup.

## Files Affected

| File | Change |
|------|--------|
| `supabase/migrations/008_whatsapp_per_clinic.sql` | New migration |
| `src/services/whatsapp.ts` | Accept credentials parameter |
| `src/lib/agents/process-message.ts` | Fetch + pass credentials |
| `src/lib/agents/outbound.ts` | Accept credentials parameter |
| `src/app/api/cron/confirmations/route.ts` | Fetch + pass credentials |
| `src/app/api/cron/nps/route.ts` | Fetch + pass credentials |
| `src/app/api/cron/billing/route.ts` | Fetch + pass credentials |
| `src/app/api/cron/recall/route.ts` | No change (doesn't send) |
| `src/app/api/cron/recall-send/route.ts` | Fetch + pass credentials |
| `src/app/api/auth/signup/route.ts` | Create 6 agent rows |
| `src/components/settings/whatsapp-placeholder.tsx` | Replace with WhatsAppConfig |
| `src/lib/validations/settings.ts` | Add 3 WhatsApp fields |
| `src/types/database.ts` | Regenerate (new columns) |

## Env Vars

- `WHATSAPP_TOKEN` — No longer read by code. Can be removed.
- `TEST_WHATSAPP_PHONE_NUMBER_ID` — No longer read by code. Can be removed.
- `META_APP_SECRET` — Unchanged (global, used for webhook signature).
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — Unchanged (global, used for Meta handshake).
