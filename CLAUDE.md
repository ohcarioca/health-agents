# CLAUDE.md

Engineering standards for this repository.
Follow strictly when generating, modifying, or reviewing code.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Next.js 16 (App Router) — `proxy.ts` replaces middleware * |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first config — no `tailwind.config.*`) |
| AI | LangChain + OpenAI |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Payments | Asaas (Pix + boleto + credit/debit card + universal link) |
| Email | Gmail API + Google Pub/Sub |
| WhatsApp | Meta WhatsApp Business API |
| Calendar | Google Calendar API |
| i18n | next-intl (`pt-BR`, `en`, `es`) — default: `pt-BR` |
| Validation | Zod |
| Testing | Vitest + React Testing Library |
| Charts | Recharts |
| File parsing | papaparse (CSV) + xlsx (XLSX) |
| Rate Limiting | @upstash/ratelimit + @upstash/redis |
| Notifications | sonner (toast) |

No alternative libraries without explicit approval.

---

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `AgentCard.tsx` |
| Hooks | camelCase + `use` prefix | `useAgentStatus.ts` |
| Utilities | camelCase | `formatCurrency.ts` |
| Types/Interfaces | PascalCase | `AgentConfig` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Files/folders | kebab-case | `agent-card.tsx` |
| Route groups | `(feature)` | `(dashboard)` |
| API routes | kebab-case | `api/agent-status/route.ts` |
| Path alias | `@/*` → `./src/*` | `@/lib/utils` |

---

## TypeScript

- `strict` mode is mandatory.
- **Never use `any`.** Use `unknown` and narrow explicitly.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Shared types live in `src/types/`. One file per domain.
- **Runtime validation** at all system boundaries using Zod: API inputs, form submissions, webhook payloads.
- Never use `as unknown as` casts. Use Supabase generated types or narrow properly.
- Avoid type assertions (`as`) — prefer type guards and discriminated unions.
- Export types from the module that owns them. Re-export from `src/types/` only for cross-cutting concerns.

---

## Components & Rendering#

- **Server Components by default.** Add `"use client"` only when the component uses state, effects, event handlers, or browser APIs.
- Props interface: `{ComponentName}Props`.
- **Never hardcode user-facing strings** — always `useTranslations()` from `next-intl`.
- One component per file. Co-locate component-specific types in the same file.
- Avoid prop drilling beyond 2 levels — use composition or context.
- Prefer composition over configuration: small, focused components over large ones with many props.

---

## Styling

- Tailwind v4 utilities only. Theme config via CSS variables in `globals.css` (`@theme inline`).
- No `tailwind.config.*` file. No CSS modules. No styled-components.
- Mobile-first: `sm`, `md`, `lg`.
- Extract repeated UI patterns into components, not `@apply` abstractions.
- Use semantic CSS variables for colors — never hardcode hex values in components.

---

## Data & State Management

- **Server-side data fetching first.** Only fetch on the client when real-time or user interaction requires it.
- Client state: local → `useState`/`useReducer`, shared UI → React Context (`src/contexts/`).
- No global state library. If you need one, ask first.
- Supabase clients (three files, never mix):
  - `client.ts` → browser only (`"use client"`)
  - `server.ts` → SSR (reads cookies/session, `import "server-only"`). Exports shared `getClinicId()` — import from here, never redefine locally.
  - `admin.ts` → service role (webhooks, cron — `import "server-only"`)
- Environment variables: `NEXT_PUBLIC_*` → client. Everything else → server only. Never leak server secrets to the client.

---

## API Routes

- Wrap `request.json()` in `try/catch` → return `400` on invalid JSON.
- **Validate all inputs with Zod.** Schemas live in `src/lib/validations/`.
- Apply rate limiting to all mutating endpoints.
- Secret comparison: `crypto.timingSafeEqual()` — never `===`.
- Return consistent response shapes: `{ data }` on success, `{ error }` on failure.
- Use appropriate HTTP status codes. Don't return `200` for errors.

### Webhook Routes

- Always use `createAdminClient()` — never session-based auth.
- Verify signatures cryptographically (HMAC-SHA256 for WhatsApp, token-based for Asaas, OIDC for Gmail).
- Implement idempotency: deduplicate by external message ID before processing.
- Return `200` for success or known skip only. `5xx` triggers provider retry.
- Use `after()` from `next/server` for async work that must complete after the HTTP response.

### `after()` Pattern

```ts
import { after } from "next/server";

after(async () => {
  const supabase = createAdminClient();
  await processAsync(supabase, params);
});
return NextResponse.json({ status: "ok" });
```

---

## Services Layer

- All external API integrations live in `src/services/`. One file per integration.
- Services log their own errors. Callers decide retry/fallback/user messaging.
- Fire-and-forget async calls must `.catch()` and log — never leave unhandled promises.
- Queue tables follow the pattern: `pending` → `processing` → `sent`/`failed`, with max 3 attempts.
- Never throw from a service that sends messages (email/WhatsApp). Return a result type instead.
- Asaas subscription functions (`src/services/asaas.ts`): `createSubscription()`, `updateSubscription()`, `cancelSubscription()`, `getSubscriptionStatus()`, `tokenizeCreditCard()`, `getSubscriptionPayments()`. Uses existing `ASAAS_API_KEY` env var — no new env vars needed.

---

## Database

- **All tables enforce RLS.** Users can only access rows where `user_id = auth.uid()`.
- Migrations are sequential, numbered with zero-padded prefix (`001_`, `002_`, etc.).
- Phone numbers: always stored digits-only. Normalize on write.
- Monetary amounts: always in **cents** (integer). `15000` = R$150.00.
- Use `created_at` and `updated_at` with triggers for audit trails.
- Prefer partial unique indexes over application-level uniqueness checks.
- Use `agent_id` as nullable FK — module-based flows may not have a linked agent.
- Foreign keys should cascade deletes only when the child has no independent meaning.
- WhatsApp credentials (`whatsapp_phone_number_id`, `whatsapp_waba_id`, `whatsapp_access_token`) are stored per clinic in `clinics` table — NOT in env vars.
- Signup creates 6 `module_configs` (all enabled) AND 6 `agents` rows (all active). Both are required for routing to work.
- `professional_services` junction table: links professionals to services with per-professional `price_cents`. Cascade deletes on both FKs. Unique constraint on `(professional_id, service_id)`.
- `clinics.operating_hours` (JSONB): same `ScheduleGrid` format as `professionals.schedule_grid`.
- `appointments.insurance_plan_id` (nullable FK to `insurance_plans`) — optional insurance plan per appointment.
- `conversations`: partial unique index `conversations_one_open_per_patient` on `(clinic_id, patient_id, channel) WHERE status IN ('active', 'escalated')` — enforces at most one open conversation per patient per clinic per channel.
- `clinics.is_active` (boolean, default false): controls whether agents respond to WhatsApp messages and crons process the clinic. Requires 5 minimum requirements to activate via `PUT /api/onboarding/activate`.
- `clinics.public_page_enabled` (boolean, default false): toggles public clinic page visibility at `/c/{slug}`.
- `clinics.accent_color` (text, default `#0EA5E9`): hex color for public page branding.
- `clinics.social_links` (JSONB, default `[]`): array of `{ type, url, label }` for Linktree-style links.
- `clinics.show_prices` (boolean, default true): toggles service price display on public page.
- `clinics.assistant_name` (text, nullable): unified AI assistant name across all modules. When set, overrides per-agent `agents.name` in system prompts. Priority: `clinic.assistant_name` > `agent.name` > module type fallback.
- `payment_links.method`: `'pix'`, `'boleto'`, `'credit_card'`, or `'link'` (universal). Default `'link'` uses Asaas `UNDEFINED` billingType — patient chooses method on checkout page.
- `module_configs.settings.auto_billing` (boolean): opt-in flag for automatic invoice creation on booking. Stored in billing module's settings JSONB.
- `patient_custom_fields`: clinic-level schema definitions for dynamic patient fields. Types: `text`, `select` (with `options` JSONB array). Unique constraint on `(clinic_id, name)`. RPC `remove_custom_field_from_patients()` cleans up values on field deletion.
- `patients.custom_fields` (JSONB): stores custom field values keyed by `patient_custom_fields.id`. Schema defined at clinic level, values per patient.
- `patient_files`: metadata for patient file attachments. Actual files stored in Supabase Storage bucket `patient-files` (private). Storage path: `{clinic_id}/{patient_id}/{uuid}.{ext}`. Max 20 files per patient, 10MB each, PDF/JPG/PNG only.
- `plans`: platform subscription plans. Columns: `id`, `name`, `slug`, `price_cents`, `max_professionals`, `max_messages_month`, `description`, `display_order`, `is_active`. Seeded with Starter/Pro/Enterprise. RLS: public read for active plans.
- `subscriptions`: one per clinic (unique constraint on `clinic_id`). Columns: `clinic_id` (FK), `plan_id` (FK), `status` (`trialing`/`active`/`past_due`/`cancelled`/`expired`), `asaas_subscription_id` (nullable, links to Asaas recurring charge), `trial_ends_at`, `current_period_start`, `current_period_end`, `cancelled_at`. Signup creates a `trialing` subscription with 30-day trial. RLS: clinic owner only.
- `clinics.messages_used_month` (integer, default 0): monthly WhatsApp message counter. Reset to 0 by `subscription-check` cron on the 1st of each month.

### Subscription Status Flow

```
signup → trialing (30 days) → active (subscribed) ←→ past_due (payment failure, 7-day grace) → expired
trialing → expired (didn't subscribe)
active → cancelled (user cancelled, access until period end)
```

---

## AI / LLM — General Rules

- Use `ChatOpenAI` from `@langchain/openai`. Model from env `OPENAI_MODEL` with hardcoded fallback.
- Retry: max 2 retries, exponential backoff.
- Tool loop: max 5 iterations. If the LLM hasn't resolved after 5 tool calls, stop.
- History cap: feed at most 30 messages to the LLM for context.
- **The LLM must never fabricate URLs.** Payment links, calendar links — always from tools.
- System prompt construction follows a strict, documented order. Don't skip steps.
- Handle LLM content as `string | ContentBlock[]` — always extract text before using.

---

## Agent Architecture (LangChain)

### Core Concepts

The agent system is built on three layers:

1. **Registry** — a `Map<string, AgentTypeConfig>` where each agent type auto-registers on import.
2. **Context Builder** — assembles system prompt + tools + business context for a given agent + recipient.
3. **Execution Engine** — `chatWithToolLoop()` drives the multi-turn LLM ↔ tool cycle.

### Agent Type Contract (`AgentTypeConfig`)

Every agent type **must** implement this interface. No partial implementations.

```ts
interface AgentTypeConfig {
  type: string;                          // Unique key: "billing", "intake", etc.

  // --- Prompt ---
  buildSystemPrompt(params, recipient?): string;
  getInstructions(tone, locale): string;

  // --- Tools ---
  getTools(agentOptions): StructuredToolInterface[];
  handleToolCall(toolCall, context): Promise<ToolCallResult>;

  // --- Metadata ---
  supportedChannels: ('gmail' | 'whatsapp')[];
  whatsappTemplate?: WhatsAppTemplateConfig;
}
```

**Rules:**
- `buildSystemPrompt` must follow the prompt assembly order (see below).
- `getTools` returns an empty array `[]` if the agent has no tools — never `undefined`.
- `handleToolCall` must handle unknown tool names gracefully (log + return empty result).
- `getInstructions` must support all three locales (`pt-BR`, `en`, `es`) and at least `professional` tone.

### Registering a New Agent

```ts
// src/lib/agents/registry/my-agent.ts
import { registerAgentType } from "./store";
import type { AgentTypeConfig } from "./types";

const config: AgentTypeConfig = {
  type: "my-agent",
  buildSystemPrompt(params, recipient) { /* ... */ },
  getTools(options) { return []; },
  handleToolCall(toolCall, context) { return {}; },
  getInstructions(tone, locale) { return "..."; },
  supportedChannels: ["whatsapp"],
};

registerAgentType(config);
```

Then import it in `src/lib/agents/registry/index.ts` so it auto-registers.

**Rules:**
- One file per agent type. File name = agent type key in kebab-case.
- Never register two agents with the same `type` key.
- Keep agent configs declarative. Business logic belongs in tool handlers, not in the config.

### System Prompt Assembly Order

Build the prompt in this exact order. Each section is optional but the order is not.

1. **Base prompt** — agent-type-specific personality and behavior rules.
2. **Agent name** — `Your name is "{name}".`
3. **Description** — `About you: {description}`
4. **Custom instructions** — `Specific instructions:\n{instructions}`
5. **Success criteria** — from `success_integration` (free text or parsed config).
6. **Tool instructions** — explicit rules for each tool (e.g., "never fabricate URLs").
7. **Business context** — from `business_profiles` table (company, hours, tone, etc.).
8. **Recipient context** — who the agent is talking to (name, observations, custom fields).

**Rules:**
- Never skip the tool instructions section if the agent has tools.
- Business context is injected by the context builder, not by the agent config.
- Recipient context must always be last — it's the most specific and most likely to change.

### Defining Tools

Use the `tool()` factory from `@langchain/core/tools` with a Zod schema:

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const myTool = tool(
  async (input) => {
    // Return a JSON string describing the ACTION to take.
    // Do NOT execute side effects here — that happens in handleToolCall.
    return JSON.stringify({
      action: "my_action",
      value: input.value,
    });
  },
  {
    name: "my_tool",
    description: "Clear, specific description of what this tool does and WHEN the LLM should use it.",
    schema: z.object({
      value: z.string().describe("What this parameter means to the LLM."),
    }),
  }
);
```

**Rules:**
- The tool function is a **stub** — it returns a serialized intent, not a side effect. The real work happens in `handleToolCall`.
- Every parameter must have a `.describe()` — this is the LLM's documentation.
- Tool names use `snake_case`. Tool descriptions are written for the LLM, not for developers.
- Monetary values are always `z.number().int().positive()` (cents).
- Dates are always ISO 8601 with timezone.
- Never define a tool that returns a URL the LLM should present to the user. Use `appendToResponse` instead.

### Handling Tool Calls

```ts
handleToolCall: async (toolCall, context) => {
  switch (toolCall.name) {
    case "my_tool":
      return handleMyTool(toolCall.args, context);
    default:
      console.warn(`[my-agent] Unknown tool: ${toolCall.name}`);
      return {};
  }
}
```

Each handler returns a `ToolCallResult`:

```ts
interface ToolCallResult {
  result?: string;                    // Feedback text for the LLM
  appendToResponse?: string;          // Appended to the final message (links, etc.)
  newConversationStatus?: string;     // Updates conversation.status in DB
  responseData?: Record<string, unknown>;
}
```

**Rules:**
- `result` is what the LLM sees. Write it as if briefing the agent: "Payment link created successfully for R$150.00."
- `appendToResponse` is what the **user** sees appended after the LLM response. Use it for URLs and structured data the LLM must not hallucinate.
- `newConversationStatus` is applied **after** the entire tool loop finishes — last non-null value wins.
- Tool handlers receive a `ToolCallContext` with `supabase` (admin client), `conversationId`, `recipientId`, `userId`. Use it for all DB operations.
- Never throw from a tool handler. Return a descriptive `result` string on failure so the LLM can inform the user.

### The Tool Loop (`chatWithToolLoop`)

```
User message
    ↓
┌─────────────────────────────┐
│  LLM invocation (with tools)│ ← max 5 iterations
│         ↓                   │
│  Tool calls? ──No──→ Return │
│         │ Yes               │
│         ↓                   │
│  Execute each tool          │
│  Collect side effects       │
│  Feed ToolMessage back      │
│         ↓                   │
│  Loop ──────────────────────│
└─────────────────────────────┘
```

**Rules:**
- Max 5 iterations is a hard limit. If the LLM is looping, the prompt is ambiguous — fix the prompt, don't raise the limit.
- Side effects (`appendToResponse`, `newConversationStatus`, `responseData`) accumulate across all iterations. Last `newConversationStatus` wins. `appendToResponse` strings concatenate.
- Apply side effects to the database **after** the loop finishes, not inside it.
- The tool resolver callback bridges `chatWithToolLoop` to `AgentTypeConfig.handleToolCall`. Keep it thin.

### Content Extraction

LLM responses can be `string` or `ContentBlock[]`. Always normalize:

```ts
function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("");
  }
  return String(content);
}
```

Never assume `content` is a string. Always extract.

### LLM Router (Module-Based Dispatch)

For multi-module systems, use an LLM classifier to route inbound messages:

```ts
interface RouterResult {
  module: string;   // Target module key
  reason: string;   // Brief classification reason (for logging)
}
```

**Rules:**
- The router is a **separate, lightweight LLM call** — low `max_tokens` (100), no tools.
- Provide the router with patient/user state (appointments, invoices, scores) so it can make informed decisions.
- Always define a fallback module (e.g., `intake`) for parse failures or unknown intents.
- Validate that the returned module is in the list of active modules. Reject and fallback otherwise.
- Strip markdown fences and extract JSON defensively — LLMs often wrap JSON in code blocks.

### Message History

```ts
function buildMessages(systemPrompt, history, userMessage) {
  return [
    new SystemMessage(systemPrompt),
    ...history.map((m) =>
      m.role === "user" ? new HumanMessage(m.content)
      : m.role === "assistant" ? new AIMessage(m.content)
      : new SystemMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];
}
```

**Rules:**
- Cap at 30 messages. Trim from the oldest, keep the system message and latest user message.
- Map `role` to LangChain message types explicitly. Don't use a generic `BaseMessage`.
- Never include raw tool call/result messages in the history sent to the LLM — only `user`, `assistant`, and `system`.

### Message Delivery (Never Throws)

The message sender (`sendAndQueueEmail`, `sendAndQueueWhatsApp`) must **never throw**:

- On success: queue row with status `sent`.
- On failure: queue row with status `pending` for retry (max 3 attempts).
- Return the status — let the caller decide what to do.

### Multi-Channel WhatsApp Templates

For proactive outreach via WhatsApp, agents can define a template config:

```ts
whatsappTemplate: {
  templateName: "appointment_reminder",
  templateLanguage: "pt_BR",
  getTemplateParams(recipient, agentName) {
    return [recipient.firstName, agentName];
  },
  getTemplateBody(recipient, agentName) {
    return `Olá ${recipient.firstName}, ...`;
  },
}
```

**Rules:**
- Template names must match exactly what's registered in Meta Business Manager.
- Template params are positional — order matters.
- Always provide a `getTemplateBody` for local preview/logging even though Meta renders the actual template.

### Agent Checklist (New Agent Type)

Before shipping a new agent type, verify:

- [ ] Config implements all required `AgentTypeConfig` methods
- [ ] Registered in `registry/index.ts` (auto-import)
- [ ] `buildSystemPrompt` follows the 8-step assembly order
- [ ] All tools have Zod schemas with `.describe()` on every param
- [ ] Tool handlers never throw — return descriptive error strings
- [ ] `handleToolCall` handles unknown tool names with a warning
- [ ] Instructions support all 3 locales and at least `professional` tone
- [ ] WhatsApp template (if any) matches Meta registration
- [ ] Conversation status transitions are documented
- [ ] Integration test covers the tool loop with mocked LLM responses

### Registered Agent Types

| Type | File | Tools | Channel |
|------|------|-------|---------|
| `support` | `agents/basic-support.ts` | `get_clinic_info`, `escalate_to_human`, `route_to_module` | whatsapp |
| `scheduling` | `agents/scheduling.ts` | `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `list_patient_appointments`, `save_patient_billing_info` (conditional), `escalate_to_human` | whatsapp |
| `confirmation` | `agents/confirmation.ts` | `confirm_attendance`, `reschedule_from_confirmation`, `mark_no_show` | whatsapp |
| `nps` | `agents/nps.ts` | `collect_nps_score`, `collect_nps_comment`, `redirect_to_google_reviews`, `alert_detractor` | whatsapp |
| `billing` | `agents/billing.ts` | `list_patient_invoices`, `create_payment_link` (default: universal link), `check_payment_status`, `send_payment_reminder`, `escalate_billing` | whatsapp |
| `recall` | `agents/recall.ts` | `send_reactivation_message`, `route_to_scheduling`, `mark_patient_inactive` | whatsapp |

### Auto-Billing Integration

When `module_configs.settings.auto_billing = true` for a clinic:

- **Scheduling agent**: `handleBookAppointment` auto-creates invoice + Asaas payment link. `save_patient_billing_info` tool conditionally included to collect CPF/email before booking.
- **Confirmation agent**: `handleConfirmAttendance` appends payment reminder with link if invoice is pending.
- **Cancel/Reschedule**: Auto-cancels linked invoices and expires payment links.
- **Onboarding**: Step 4 in wizard allows opt-in via toggle.

Helper: `src/lib/billing/auto-billing.ts` → `isAutoBillingEnabled(supabase, clinicId)`

### Outbound Messaging (`src/lib/agents/outbound.ts`)

Shared utility for proactive (system-initiated) messages:
- **Business hours:** 8am-8pm Mon-Sat in the clinic's timezone. Sunday = no outbound.
- **Rate limit:** Max 3 messages per patient per day.
- `sendOutboundMessage()` — text messages (for within 24h window).
- `sendOutboundTemplate()` — WhatsApp template messages (for >24h window).

### Cron Routes

| Route | Schedule | Purpose |
|-------|----------|---------|
| `GET /api/cron/confirmations` | `*/15 8-19 * * 1-6` | Scans `confirmation_queue`, sends reminders (every 15min Mon-Sat) |
| `GET /api/cron/nps` | `0 12,16,19 * * *` | Surveys patients after completed appointments (3x/day) |
| `GET /api/cron/billing` | `0 9,14 * * 1-6` | Drip payment reminders (2x/day Mon-Sat) |
| `GET /api/cron/recall` | `0 10 * * 1-5` | Enqueue inactive patients (Mon-Fri) — uses per-clinic `inactivity_days` from `module_configs.settings` (default 90), skips disabled clinics |
| `GET /api/cron/recall-send` | `30 10,15 * * 1-5` | Send recall messages from queue (2x/day Mon-Fri) |
| `GET /api/cron/message-retry` | `*/30 8-20 * * 1-6` | Retry failed WhatsApp sends (every 30min Mon-Sat) |
| `GET /api/cron/subscription-check` | `0 3 * * *` | Daily at 3am UTC: expire ended trials, expire 7-day past_due subscriptions, reset `clinics.messages_used_month` on 1st of month |

Auth: `Authorization: Bearer {CRON_SECRET}` (verified with `crypto.timingSafeEqual()`). Shared auth helper: `src/lib/cron/auth.ts`.

**Auto-enqueue:** When `book_appointment` creates an appointment, it auto-inserts 48h/24h/2h entries into `confirmation_queue` via `enqueueConfirmations()`.

### Settings API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settings/clinic` | GET, PUT | Clinic info + operating hours |
| `/api/settings/professionals` | GET, POST | Professionals list/create |
| `/api/settings/professionals/[id]` | PUT, DELETE | Professional update/delete |
| `/api/settings/professionals/[id]/services` | GET, PUT | Professional service assignments with pricing |
| `/api/settings/services` | GET, POST | Services CRUD (list/create) |
| `/api/settings/services/[id]` | PUT, DELETE | Service update/delete |
| `/api/settings/insurance-plans` | GET, POST | Insurance plans CRUD (list/create) |
| `/api/settings/insurance-plans/[id]` | DELETE | Insurance plan delete |
| `/api/settings/public-page` | GET, PUT | Public page config (accent color, links, toggle) |
| `/api/settings/modules/billing` | GET, PUT | Billing module auto_billing toggle (legacy) |
| `/api/settings/modules/[type]` | GET, PUT | Generic module settings: enabled toggle + per-type settings (billing, nps, recall, support) |
| `/api/settings/custom-fields` | GET, POST | Custom field definitions CRUD (list/create) |
| `/api/settings/custom-fields/[id]` | PUT, DELETE | Custom field definition update/delete (delete cleans up patient values via RPC) |

### Settings UI

9 tabs: Clinica | Profissionais | Servicos | Convenios | Campos | Integracoes | WhatsApp | Equipe | Assinatura

### Public API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/public/clinics/[slug]` | GET | Public clinic data + services (no auth, admin client, cached 5min) |

### Calendar API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/calendar/appointments` | GET | List appointments by date range + optional professional filter |
| `/api/calendar/appointments` | POST | Create appointment (+ Google Calendar sync + enqueue confirmations) |
| `/api/calendar/appointments/[id]` | PUT | Update appointment (+ Google Calendar sync) |
| `/api/calendar/appointments/[id]` | DELETE | Delete appointment (+ Google Calendar delete) |
| `/api/calendar/patients/search` | GET | Search patients by name or phone (autocomplete, limit 10) |

### Onboarding API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/onboarding/status` | GET | Check clinic activation requirements status (5 checks) |
| `/api/onboarding/activate` | PUT | Activate/deactivate clinic (validates 5 requirements for activation) |
| `/api/integrations/whatsapp/test` | POST | Test WhatsApp credentials against Meta Graph API |

### Patient API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/patients` | GET | List patients (paginated, searchable) |
| `/api/patients` | POST | Create single patient |
| `/api/patients/[id]` | GET | Patient detail + custom field definitions |
| `/api/patients/[id]` | PUT | Update patient (including custom_fields) |
| `/api/patients/[id]` | DELETE | Delete patient (if no appointments) |
| `/api/patients/[id]/files` | GET, POST | Patient files list/upload (multipart, max 10MB, PDF/JPG/PNG) |
| `/api/patients/[id]/files/[fileId]` | GET, DELETE | Signed download URL (5min) / delete file |
| `/api/patients/[id]/appointments` | GET | Patient appointment history (limit 50) |
| `/api/patients/[id]/invoices` | GET | Patient invoice history (limit 50) |
| `/api/patients/batch` | POST | Bulk create (max 500, skip duplicates, supports custom_fields) |

### Payments API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/invoices` | GET | List invoices (paginated, filterable by status/period/search) |
| `/api/invoices` | POST | Create invoice |
| `/api/invoices/[id]` | GET | Invoice detail with payment links |
| `/api/invoices/[id]` | PUT | Update invoice (status, amount, notes) |
| `/api/invoices/[id]/payment-link` | POST | Generate Asaas payment link (Pix/boleto/card) |

### Subscriptions & Plans API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/plans` | GET | List available plans (public, no auth) |
| `/api/subscriptions` | GET | Current subscription + plan + usage |
| `/api/subscriptions` | POST | Create subscription (plan + card data via Asaas tokenization) |
| `/api/subscriptions/upgrade` | PUT | Change plan (upgrade/downgrade) |
| `/api/subscriptions/cancel` | POST | Cancel subscription (access until period end) |
| `/api/subscriptions/update-card` | PUT | Update credit card (tokenization) |
| `/api/subscriptions/invoices` | GET | Platform invoice history from Asaas |

### Dashboard & Reports API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/dashboard/kpis` | GET | Today's KPI metrics (appointments, NPS, revenue, escalated) |
| `/api/dashboard/alerts` | GET | Actionable alerts (detractors, overdue invoices, escalated convos, delivery failures) |
| `/api/reports/overview` | GET | Time-series data for reports (appointment trends, NPS, revenue, module stats) |

### Analytics Utilities

- `src/lib/analytics/kpis.ts` — Pure functions: `calculateNPS()`, `calculateRevenueMetrics()`, `calculateConfirmationRate()`, `formatCents()`, `groupByDate()`

---

## Error Handling

- Catch errors at service boundaries. Let UI errors propagate to error boundaries (`error.tsx`).
- Log with context: operation name, entity IDs, sanitized inputs. Never log secrets or PII.
- UI errors: translated via `next-intl`, user-friendly, no stack traces exposed.
- Webhooks: `5xx` → provider retries. `200` → success or known skip only.
- Every page group should include `loading.tsx`, `not-found.tsx`, and `error.tsx`.

---

## Security

- Never commit secrets or `.env` files.
- Validate and sanitize all external input at the boundary (Zod).
- Server secrets must never use `NEXT_PUBLIC_*` prefix.
- Secret comparison: `crypto.timingSafeEqual()` — never `===`.
- Webhook auth: cryptographic signature verification. Never trust unverified payloads.
- Rate limit all public-facing and mutating endpoints via `checkRateLimit()` from `src/lib/rate-limit.ts` (Upstash Redis). Two tiers: `standard` (60/min) for authenticated routes, `strict` (10/min) for payment/auth.
- Use parameterized queries (Supabase client handles this). Never concatenate SQL.
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) configured in `next.config.ts`.
- Never expose CPF unmasked in API responses — use `maskCPF()` from `src/lib/utils/mask.ts`.
- Never expose internal provider IDs (asaas_customer_id, whatsapp_phone_number_id) in public API responses.

---

## Subscription Enforcement

- `proxy.ts` gates POST/PUT/DELETE on `/api/*` when subscription status is `expired` or `cancelled` (returns `403`). Exempt routes: auth, subscriptions, plans, webhooks, cron.
- **Professional limit**: hard block via `canAddProfessional()` check in `POST /api/settings/professionals`. Compares current count against `plans.max_professionals`.
- **Message counter**: soft limit via `incrementMessageCount()` in `outbound.ts` and WhatsApp webhook. Increments `clinics.messages_used_month` and warns when approaching `plans.max_messages_month`.
- **WhatsApp agents**: do not respond when clinic subscription status is not `trialing`, `active`, or `past_due`.
- **Crons**: skip clinics without active subscriptions via `getSubscribedClinicIds()` shared helper.

---

## Testing

- Runner: Vitest. UI: React Testing Library.
- File pattern: `src/__tests__/{path}/{name}.test.ts(x)`
- Test: business logic, data transformations, validations, API route handlers.
- Do not test: styling, framework internals, trivial getters/setters.
- Tests must be isolated and deterministic. No shared mutable state between tests.
- Mock external services (Supabase, OpenAI, etc.). Never call real APIs in tests.
- Prefer integration tests for API routes. Prefer unit tests for pure functions.

---

## Agent Evaluation System (`eval/`)

End-to-end eval suite that tests all 6 production agents against real Supabase + real OpenAI. Uses Claude as judge (`ANTHROPIC_API_KEY` + `CLAUDE_MODEL`).

### Scripts

| Script | What it runs |
|--------|-------------|
| `npm run eval` | All 19 unit cases + 4 E2E flows |
| `npm run eval:unit` | Unit cases only |
| `npm run eval:flows` | E2E flows only |
| `npm run eval:agent -- --agent <type>` | Single agent (e.g. `nps`) |

### Structure

```
eval/
  cases/          # 19 unit cases (one file per agent)
  flows/          # 4 E2E flow definitions
  fixtures/       # create/teardown test clinic + patient + appointments
  stubs/          # server-only no-op (bypasses Next.js guard)
  agent-executor.ts   # runs agents via chatWithToolLoop directly
  evaluator.ts        # Claude-as-judge (6 criteria, 0-10)
  patient-simulator.ts # LLM patient for E2E turns
  report.ts           # colorful console + JSON output
  runner.ts           # main orchestrator
  supabase.ts         # eval-specific Supabase admin client
  types.ts            # shared types
eval-results/     # JSON reports (git-ignored)
tsconfig.eval.json
```

### How it works

1. Fixtures are created fresh each run (clinic + patient + professional + appointments) and torn down in `finally`.
2. `agent-executor.ts` imports all 6 agents via side-effects and calls `chatWithToolLoop()` directly, bypassing Next.js.
3. `server-only` is stubbed to a no-op so agent code compiles outside Next.js.
4. WhatsApp sends use fake credentials — Meta returns 4xx, services log gracefully.
5. Claude evaluates each response on 6 criteria (Corretude, Tom, Completude, Uso de ferramentas, Fluidez, Segurança).
6. **Pass threshold**: avg score ≥ 7.0. **Critical fail**: Segurança < 5 → exit code 1.

### Required env vars

```
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_MODEL=claude-sonnet-4-6   # evaluator model
OPENAI_API_KEY=...               # agent model (same as production)
OPENAI_MODEL=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Git

- Commit messages: imperative, lowercase, max 72 characters.
- Branches: `feature/short-description`, `fix/short-description`.
- One logical change per commit. Don't mix refactoring with features.
- English only for code, comments, commits, logs, and documentation.
- User-facing text lives exclusively in `messages/{locale}.json`.

---

## Code Quality Principles

1. **No over-engineering.** Only build what is needed now. Three similar lines are better than a premature abstraction.
2. **No dead code.** If it's unused, delete it. Don't comment it out "for later."
3. **No magic values.** Extract into named constants or config.
4. **Fail fast.** Validate inputs early. Return errors immediately — don't nest deep.
5. **Single responsibility.** Each function, component, and file does one thing.
6. **Explicit over implicit.** Prefer verbose clarity over clever brevity.
7. **Colocation.** Keep related code together. Don't scatter a feature across 10 folders.
8. **Boundaries matter.** Validate at system edges (API routes, webhooks, form submissions). Trust internal code.
9. **Composition over inheritance.** Always.
10. **Consistency over preference.** Follow existing patterns in the codebase, even if you'd do it differently.

---

## Self-Maintenance

This file must stay in sync with the codebase. Update CLAUDE.md in the same commit as any change that affects:

- Project structure (new/removed files or folders)
- Database schema (new migrations)
- API routes (new/removed endpoints)
- Dependencies or tech stack changes
- Environment variables
- Architectural patterns or conventions
- Agent types in the registry

Keep it concise and factual. Document what exists, not what might exist.
