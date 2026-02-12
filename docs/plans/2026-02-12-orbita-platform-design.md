# Orbita Platform — Design Document

**Date:** 2026-02-12
**Status:** Approved
**Author:** Planning session (solo dev + Claude)

---

## Overview

Orbita is an autonomous agent platform via WhatsApp for healthcare SMBs in Brazil. It handles the full patient revenue and retention cycle (scheduling, confirmation, NPS, billing, recall) without human intervention. The client configures it via a web platform and the system runs on its own.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build order | Web platform first, agents second | Proves the SaaS platform before adding AI complexity |
| Web MVP scope | All 6 screens as functional shells | Full structure with real navigation, then deepen incrementally |
| Database strategy | Full schema upfront | All tables designed in one pass to reduce schema churn |
| Onboarding | Step-by-step wizard | Guided linear flow: clinic data, professionals, patients, WhatsApp, modules |
| Authentication | Email + Google OAuth (Supabase Auth) | Google OAuth facilitates Calendar/Gmail integration later |
| Multi-tenancy | clinic_id FK + RLS on every table | Standard Supabase pattern, simple and effective |
| First agent | Basic Support | Simplest agent, entry point for all messages, validates full agent infra |
| Hosting | Vercel | Native Next.js hosting, serverless, auto-scaling |
| Dev pace | Solo dev + Claude | Phases sized for one person to implement and validate |

---

## Phase Plan

### Phase 1: Project Bootstrap

**Goal:** Technical foundation. No features — just a healthy structure to build on.

**Scope:**
- Initialize Next.js 16 (App Router) with TypeScript strict
- Tailwind CSS v4 (CSS-first config, no `tailwind.config.*`)
- Supabase clients: `client.ts` (browser), `server.ts` (SSR), `admin.ts` (service role)
- next-intl configured with `pt-BR` (default), `en`, `es`
- Vitest + React Testing Library configured
- Zod installed
- Folder structure per CLAUDE.md conventions (`src/lib/`, `src/types/`, `src/services/`, `src/contexts/`)
- `proxy.ts` as middleware pattern (Next.js 16)
- First deploy to Vercel (blank app)

**Test criteria:**
- `npm run dev` runs locally without errors
- `npm run build` passes
- `npm run test` executes (even with 0 tests)
- App visible on Vercel with i18n working

**Complexity:** Low

---

### Phase 2: Database Schema + Auth

**Goal:** Complete data model and authentication. After this phase, tenants are isolated and real data exists in Supabase.

**Schema (all tables, all migrations):**

| Domain | Tables |
|--------|--------|
| Tenancy | `clinics`, `clinic_users` (roles: owner, reception) |
| Professionals | `professionals` (specialty, schedule grid, appointment duration) |
| Patients | `patients` (name, phone digits-only, custom fields) |
| Scheduling | `appointments` (professional_id, patient_id, status, datetime) |
| Confirmation | `confirmation_queue` (appointment_id, stage: 48h/24h/2h, status) |
| NPS | `nps_responses` (appointment_id, score, comment, review_sent) |
| Billing | `invoices` (patient_id, amount_cents, status, due_date), `payment_links` |
| Recall | `recall_queue` (patient_id, last_visit, status) |
| Agents | `agents` (clinic_id, type, name, config JSON), `conversations`, `messages`, `message_queue` |
| Modules | `module_configs` (clinic_id, module_type, enabled, settings JSON) |

**Auth:**
- Supabase Auth with email + Google OAuth
- `clinic_users` join table with role (`owner` | `reception`)
- `proxy.ts` protects authenticated routes
- RLS on all tables: `clinic_id` isolation via auth lookup

**Seed data:**
- 1 demo clinic with 2 professionals, 10 patients, mock appointments

**Test criteria:**
- Migrations run without errors on Supabase
- Signup creates user + clinic + clinic_user
- Google OAuth works
- RLS: user A cannot see clinic B's data
- Seed populates data correctly

**Complexity:** Medium

---

### Phase 3: Web Platform Shell + Onboarding

**Goal:** Complete web experience in structure. Real navigation, responsive layout, all screens with functional skeletons and placeholder data.

**Global layout:**
- Sidebar navigation: Dashboard, Inbox, Modules, Reports, Team, Settings
- Header with clinic name, user avatar, locale switcher
- Mobile: sidebar collapses to hamburger menu
- Route groups: `(auth)` for login/signup, `(dashboard)` for protected app

**6 screens (shell):**

| Screen | Shell content |
|--------|--------------|
| Dashboard | Zero-value metric cards, visual funnel placeholder, empty alerts list |
| Inbox | Empty conversation list with filters (status, module), placeholder conversation detail |
| Modules | 6 cards (one per module), on/off toggle, status badge |
| Reports | Period selector, placeholder charts, disabled "Export PDF" button |
| Team | Member list with role badges, "Invite" button |
| Settings | Tabs: Clinic Data, Professionals, Patients, Integrations, WhatsApp |

**Onboarding wizard (after signup):**
1. Clinic data (name, address, hours, insurance plans)
2. Professionals (name, specialty, schedule grid)
3. Patients (manual entry — CSV import comes in Phase 4)
4. Connect WhatsApp (informational screen, real config in Phase 5)
5. Activate modules (toggles with smart defaults)

**i18n:** All strings via `messages/{locale}.json`. No hardcoded text.

**Error handling:** `loading.tsx`, `error.tsx`, `not-found.tsx` in each route group.

**Test criteria:**
- Navigation between all 6 screens works
- Wizard completes and persists data to Supabase
- Responsive: mobile, tablet, desktop
- All 3 locales render correctly
- Build passes with no TypeScript errors

**Complexity:** Medium-High

---

### Phase 4: Settings + Team (Real CRUD)

**Goal:** Transform Settings and Team shells into fully functional screens with real data. After this phase, a clinic can be completely configured via the web.

**Settings — Clinic Data:**
- Edit name, address, phone, operating hours
- Manage accepted insurance plans (CRUD)
- Manage offered services (CRUD)
- Zod validation on all forms

**Settings — Professionals:**
- CRUD for professionals
- Specialty, default appointment duration
- Schedule grid (weekday + start/end time)
- Status: active/inactive

**Settings — Patients:**
- Paginated list with search by name/phone
- CRUD for patients
- Phone normalized (digits-only) on save
- Custom fields (observations, extra data)
- CSV/XLSX import for bulk patient upload

**Settings — Integrations:**
- Connection status display for Google Calendar, Gmail, WhatsApp, Pagar.me
- Connect/disconnect buttons (real implementation comes in agent phases)

**Team:**
- List clinic members with roles
- Invite by email (creates `clinic_users` entry)
- Change role (Owner <-> Reception)
- Remove member
- Enforcement: Reception cannot access Team, Reports, or Modules config

**Modules Config:**
- Toggle on/off per module
- Basic config per module (e.g., fallback attempts, active hours)
- Smart default values (all enabled, 2 fallback attempts)

**Test criteria:**
- Full CRUD works (create, read, edit, delete) for each entity
- Zod validations reject invalid inputs
- Permissions: Reception blocked from restricted screens
- Data persists and reloads correctly
- CSV patient import works with sample file

**Complexity:** Medium

---

### Phase 5: Agent Framework + WhatsApp Integration

**Goal:** The technical heart of the platform. Build the agent infrastructure (no specific agents yet) and WhatsApp integration.

**Agent Framework (per CLAUDE.md architecture):**
- `src/lib/agents/registry/store.ts` — `Map<string, AgentTypeConfig>` + `registerAgentType()`
- `src/lib/agents/registry/types.ts` — interfaces: `AgentTypeConfig`, `ToolCallResult`, `ToolCallContext`
- `src/lib/agents/registry/index.ts` — auto-imports for registration
- `src/lib/agents/context-builder.ts` — system prompt assembly (8-step order), tools, business context
- `src/lib/agents/engine.ts` — `chatWithToolLoop()` with max 5 iterations
- `src/lib/agents/content.ts` — `extractTextContent()` for `string | ContentBlock[]`
- `src/lib/agents/history.ts` — `buildMessages()` with 30-message cap
- `src/lib/agents/router.ts` — LLM Router for module-based dispatch

**WhatsApp Integration:**
- `src/services/whatsapp.ts` — send message, send template, verify signature
- `src/app/api/webhooks/whatsapp/route.ts` — receive messages (HMAC-SHA256 verification)
- Idempotency: deduplicate by external `message_id`
- `message_queue` table: `pending` -> `processing` -> `sent`/`failed` (max 3 attempts)
- `after()` pattern for async processing post-response

**LLM Setup:**
- `ChatOpenAI` from `@langchain/openai`
- Model from `OPENAI_MODEL` env with hardcoded fallback
- Max 2 retries, exponential backoff

**Test criteria:**
- Registry accepts and returns mock agent configs
- `chatWithToolLoop()` executes with mocked LLM and mock tools
- Context builder assembles prompt in correct 8-step order
- WhatsApp webhook validates signatures correctly
- Message received -> conversation created -> response sent (echo test)
- Message queue: retry works after simulated failure

**Complexity:** High — most technically dense phase

---

### Phase 6: Basic Support Agent + Inbox

**Goal:** First real agent in production. Patient sends WhatsApp message, agent answers FAQ, escalates to human when it cannot resolve. Inbox on web shows escalated conversations.

**Basic Support Agent:**
- `src/lib/agents/registry/basic-support.ts`
- **Prompt:** friendly/professional personality, answers clinic FAQ
- **Tools:**
  - `get_clinic_info` — returns clinic data (hours, address, insurance plans, services)
  - `escalate_to_human` — marks conversation for human handling
  - `route_to_module` — directs to another module (e.g., "I want to book" -> Scheduling)
- **Behavior:** uses patient's first name, friendly tone, moderate emoji, max 2 attempts before escalation
- **Instructions:** pt-BR, en, es

**LLM Router (active):**
- Receives message -> classifies intent -> routes to correct module
- Fallback to Basic Support for unknown intent
- Validates target module is active for the clinic

**Inbox (web — real screen):**
- Conversation list with status: `active`, `escalated`, `resolved`
- Filters: by status, by module, by professional
- Conversation detail: full message history
- Actions: "Take over" (human assumes control) and "Hand back" (returns to agent)
- Visual notification for new escalated conversations

**Test criteria:**
- Send real WhatsApp message -> receive agent response
- Ask "what are your hours?" -> response with clinic hours
- Ask something out of scope -> escalates to human after 2 attempts
- Inbox shows escalated conversation in real time
- "Take over" lets human respond via WhatsApp
- "Hand back" reactivates agent on the conversation

**Milestone:** After this phase, the platform has **real functional value** — a clinic can use it for basic WhatsApp support.

**Complexity:** High

---

### Phase 7: Scheduling Agent + Google Calendar

**Goal:** Real appointment booking via WhatsApp with Google Calendar synchronization.

**Scheduling Agent:**
- `src/lib/agents/registry/scheduling.ts`
- **Tools:**
  - `check_availability` — queries free slots by professional/date (Google Calendar + local grid)
  - `book_appointment` — creates appointment (Calendar + DB)
  - `reschedule_appointment` — moves existing appointment
  - `cancel_appointment` — cancels with reason
  - `list_patient_appointments` — shows patient's upcoming appointments
  - `escalate_to_human` — escalates if unresolved
- **Behavior:** offers 2-3 available slots, confirms before booking, sends summary after

**Google Calendar Integration:**
- `src/services/google-calendar.ts`
- OAuth2 flow to connect professional's Calendar
- Event CRUD (create, update, delete)
- Free/busy check for real-time availability
- Bidirectional sync: Orbita appointment <-> Calendar event

**Settings — Integrations (upgrade):**
- Functional "Connect Google Calendar" button
- OAuth consent flow
- Connection status per professional

**Test criteria:**
- "I want to book with Dr. Joao" -> agent offers real free slots
- Patient picks slot -> appointment created in DB + Google Calendar event
- "I want to reschedule" -> agent moves appointment + event
- "I want to cancel" -> appointment cancelled + event removed
- Occupied Calendar slot does not appear as available
- OAuth flow connects Calendar successfully

**Complexity:** High

---

### Phase 8: Confirmation + NPS Agents

**Goal:** Two proactive (outbound) agents — the system initiates contact with the patient.

**Confirmation Agent:**
- `src/lib/agents/registry/confirmation.ts`
- **Trigger:** Appointment booked -> enters `confirmation_queue`
- **Sequence:** 48h before -> 24h before -> 2h before
- **Tools:**
  - `confirm_attendance` — patient confirms presence
  - `reschedule_from_confirmation` — patient wants to reschedule (handoff to Scheduling)
  - `mark_no_show` — detects no-show post-appointment
- **WhatsApp Templates:** Meta-approved template messages (required for outbound >24h)
- **Cron:** batch job scans `confirmation_queue` and fires at correct times (8am-8pm only)

**NPS Agent:**
- `src/lib/agents/registry/nps.ts`
- **Trigger:** Appointment status -> `completed`
- **Tools:**
  - `collect_nps_score` — patient gives score 0-10
  - `collect_nps_comment` — optional comment
  - `redirect_to_google_reviews` — promoters (9-10) receive Google Reviews link
  - `alert_detractor` — detractors (0-6) generate Dashboard alert
- **Flow:** "How was your appointment?" -> score -> comment -> action based on score

**Cron Infrastructure:**
- `src/app/api/cron/confirmations/route.ts` — Vercel Cron
- `src/app/api/cron/nps/route.ts` — triggered after appointment completed
- Rate limiting: max 3 active messages per patient/day
- Priority: Confirmation > Billing > NPS > Recall

**Test criteria:**
- Appointment created -> 3 confirmation messages sent at correct times
- Patient responds "I confirm" -> status updated
- Patient responds "I want to reschedule" -> handoff to Scheduling
- Post-appointment -> NPS sent -> score collected
- Promoter (9-10) -> receives Google Reviews link
- Detractor (0-6) -> alert appears on Dashboard
- Rate limit respected: max 3 msgs/day

**Complexity:** Medium-High

---

### Phase 9: Billing + Recall Agents

**Goal:** The final two agents: payment collection and inactive patient reactivation.

**Billing Agent:**
- `src/lib/agents/registry/billing.ts`
- **Trigger:** Open invoice OR NPS collected
- **Tools:**
  - `create_payment_link` — generates Pix/boleto link via Pagar.me
  - `check_payment_status` — checks if payment was made
  - `send_payment_reminder` — sends reminder (tone adapted by NPS score)
  - `escalate_billing` — escalates to human after attempts exhausted
- **Drip sequence:** gentle reminder -> direct reminder -> urgent reminder (spaced out)
- **Tone adaptation:** promoter = friendly, neutral = professional, detractor = careful

**Pagar.me Integration:**
- `src/services/pagarme.ts`
- Create payment link (Pix + boleto)
- Payment confirmation webhook
- `src/app/api/webhooks/pagarme/route.ts` — signature verification + status update

**Recall Agent:**
- `src/lib/agents/registry/recall.ts`
- **Trigger:** Daily batch scan -> patients without appointment for >90 days
- **Tools:**
  - `send_reactivation_message` — "It's been a while since your last visit!"
  - `route_to_scheduling` — patient wants to book -> handoff
  - `mark_patient_inactive` — patient asks not to be contacted
- **Cron:** `src/app/api/cron/recall/route.ts` — daily scan

**Test criteria:**
- Invoice created -> drip sequence initiated
- Payment link generated via Pagar.me -> patient pays -> status updated
- NPS score influences billing tone
- Patient without appointment for 90+ days -> reactivation message
- Patient responds "I want to book" -> handoff to Scheduling
- Pagar.me webhook processes payment correctly

**Complexity:** Medium-High

---

### Phase 10: Dashboard + Reports

**Goal:** Real data visualization and reports. Everything the agents collected now appears as actionable metrics.

**Dashboard (real data):**
- Visual funnel of the cycle: Scheduling -> Confirmation -> Appointment -> NPS -> Billing
- Daily metric cards: appointments today, pending confirmations, no-shows, average NPS, open invoices
- Alerts list: NPS detractors, delivery failures, escalated conversations
- Filter by period (today, 7d, 30d) and by professional

**Reports:**
- **ROI Report:** cost vs. recovered revenue (avoided no-shows, collected payments, reactivated patients)
- **Module comparison:** performance per module (confirmation rate, average NPS, payment rate, reactivation rate)
- **Professional comparison:** metrics per professional
- Custom period selector
- **PDF export** with clinic branding

**Modules screen (upgrade):**
- Shows real metrics per module (no longer placeholder)
- Message history per module
- Advanced per-module config exposed

**Test criteria:**
- Dashboard reflects real agent data
- Metrics calculated correctly (verify against direct DB queries)
- Period filters work
- PDF exports with correct data and clean formatting
- Performance: dashboard loads in <2s with 1000+ appointments

**Complexity:** Medium

---

## Architecture Summary

```
Patient (WhatsApp)
    |
    v
[WhatsApp Webhook] --> [LLM Router] --> [Agent Registry]
    |                                         |
    |                                    [Agent Type]
    |                                    - Support
    |                                    - Scheduling
    |                                    - Confirmation
    |                                    - NPS
    |                                    - Billing
    |                                    - Recall
    |                                         |
    v                                         v
[Message Queue] <-- [chatWithToolLoop] --> [Tools]
    |                                         |
    v                                         v
[WhatsApp API]                          [Services]
                                        - Google Calendar
                                        - Gmail
                                        - Pagar.me
                                        - Supabase

Clinic Owner (Web)
    |
    v
[Next.js App Router]
    |
    +-- Dashboard (metrics, funnel, alerts)
    +-- Inbox (escalated conversations)
    +-- Modules (toggle, config)
    +-- Reports (ROI, PDF export)
    +-- Team (users, roles)
    +-- Settings (clinic, professionals, patients, integrations)
```

## Tech Stack (from CLAUDE.md)

| Layer | Technology |
|-------|-----------|
| Runtime | Next.js 16 (App Router) |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| AI | LangChain + OpenAI |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Payments | Pagar.me |
| Email | Gmail API + Google Pub/Sub |
| WhatsApp | Meta WhatsApp Business API |
| Calendar | Google Calendar API |
| i18n | next-intl (pt-BR, en, es) |
| Validation | Zod |
| Testing | Vitest + React Testing Library |
| Hosting | Vercel |

## Global Rules

- Active outbound messages: 8am-8pm Mon-Sat only. Responses: 24/7.
- Rate limit: max 3 active messages per patient per day.
- Priority: Confirmation > Billing > NPS > Recall.
- Fallback: every agent escalates to human after N attempts (default: 2).
- Tone: friendly, professional, moderate emoji, patient's first name.
- All tables enforce RLS with clinic_id isolation.
- Phone numbers: digits-only, normalized on write.
- Monetary amounts: always in cents (integer).

---

## Phase Dependencies

```
Phase 1 (Bootstrap)
    |
    v
Phase 2 (DB + Auth)
    |
    v
Phase 3 (Web Shell + Onboarding)
    |
    v
Phase 4 (Settings + Team CRUD)
    |
    v
Phase 5 (Agent Framework + WhatsApp)
    |
    v
Phase 6 (Support + Inbox) -----> FIRST USABLE PRODUCT
    |
    v
Phase 7 (Scheduling + Calendar)
    |
    v
Phase 8 (Confirmation + NPS)
    |
    v
Phase 9 (Billing + Recall)
    |
    v
Phase 10 (Dashboard + Reports) --> FULL PRODUCT
```
