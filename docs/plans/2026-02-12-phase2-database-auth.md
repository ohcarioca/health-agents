# Phase 2: Database Schema + Auth — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the complete database schema (16 tables for all 6 modules), RLS policies, Supabase Auth (email + Google OAuth), protected routes, and seed data.

**Architecture:** Supabase PostgreSQL with RLS enforced on every table via `clinic_id` isolation. Auth uses Supabase Auth with email/password and Google OAuth. Signup creates a clinic + clinic_user atomically. `proxy.ts` redirects unauthenticated users to `/login`. TypeScript types auto-generated from the database schema.

**Tech Stack:** Supabase CLI 2.76, PostgreSQL, Supabase Auth, Next.js 16 App Router, Zod for form validation.

---

## Database Schema Overview

16 tables across 6 domains:

```
TENANCY:       clinics, clinic_users, insurance_plans, services
PEOPLE:        professionals, patients
SCHEDULING:    appointments
CONFIRMATION:  confirmation_queue
NPS:           nps_responses
BILLING:       invoices, payment_links
RECALL:        recall_queue
AGENTS:        agents, conversations, messages, message_queue, module_configs
```

Every table has `clinic_id` FK for multi-tenant isolation via RLS.

---

## Task 1: Supabase CLI Init

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)

**Step 1: Initialize Supabase project**

```bash
cd "c:\Users\KABUM\Documents\BALAM SANDBOX\supermvp\health-agents"
npx supabase init
```

This creates `supabase/` directory with `config.toml`.

**Step 2: Link to remote project**

The project ref is `zfeyfnmbozwxagiegdyk` (from the SUPABASE_URL in .env).

```bash
npx supabase link --project-ref zfeyfnmbozwxagiegdyk
```

It will ask for the database password. If prompted, the user must provide it.
If it fails due to missing password, skip the link step and we'll push migrations via the dashboard.

**Step 3: Add to .gitignore**

Add these entries to `.gitignore` if not already present:

```
# Supabase
supabase/.temp/
supabase/.env
```

**Step 4: Commit**

```bash
git add supabase/ .gitignore
git commit -m "init supabase project structure"
```

---

## Task 2: Migration 001 — Core Tables

**Files:**
- Create: `supabase/migrations/001_core_tables.sql`

**Step 1: Create the migration file**

```sql
-- 001_core_tables.sql
-- Core tenancy and people tables for Órbita platform

-- ============================================
-- HELPER: updated_at trigger function
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================
-- CLINICS (tenant table)
-- ============================================
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  logo_url text,
  timezone text not null default 'America/Sao_Paulo',
  operating_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinics_updated_at
  before update on clinics
  for each row execute function update_updated_at();

-- ============================================
-- CLINIC_USERS (user ↔ clinic join with role)
-- ============================================
create table clinic_users (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'reception')),
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

-- ============================================
-- INSURANCE_PLANS
-- ============================================
create table insurance_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================
-- SERVICES
-- ============================================
create table services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  duration_minutes integer not null default 30,
  price_cents integer,
  created_at timestamptz not null default now()
);

-- ============================================
-- PROFESSIONALS
-- ============================================
create table professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  specialty text,
  appointment_duration_minutes integer not null default 30,
  schedule_grid jsonb not null default '{}'::jsonb,
  google_calendar_id text,
  google_refresh_token text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger professionals_updated_at
  before update on professionals
  for each row execute function update_updated_at();

-- ============================================
-- PATIENTS
-- ============================================
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, phone)
);

create trigger patients_updated_at
  before update on patients
  for each row execute function update_updated_at();
```

**Step 2: Commit**

```bash
git add supabase/migrations/001_core_tables.sql
git commit -m "add migration 001: core tables (clinics, users, professionals, patients)"
```

---

## Task 3: Migration 002 — Module Tables

**Files:**
- Create: `supabase/migrations/002_module_tables.sql`

**Step 1: Create the migration file**

```sql
-- 002_module_tables.sql
-- Tables for scheduling, confirmation, NPS, billing, and recall modules

-- ============================================
-- APPOINTMENTS
-- ============================================
create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  professional_id uuid references professionals(id) on delete set null,
  patient_id uuid not null references patients(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  google_event_id text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger appointments_updated_at
  before update on appointments
  for each row execute function update_updated_at();

create index idx_appointments_clinic_starts
  on appointments (clinic_id, starts_at);

create index idx_appointments_patient
  on appointments (patient_id);

create index idx_appointments_professional_starts
  on appointments (professional_id, starts_at)
  where status in ('scheduled', 'confirmed');

-- ============================================
-- CONFIRMATION_QUEUE
-- ============================================
create table confirmation_queue (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  stage text not null check (stage in ('48h', '24h', '2h')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'responded')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  response text,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_confirmation_pending
  on confirmation_queue (scheduled_at)
  where status = 'pending';

-- ============================================
-- NPS_RESPONSES
-- ============================================
create table nps_responses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  score integer check (score >= 0 and score <= 10),
  comment text,
  review_sent boolean not null default false,
  alert_sent boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================
-- INVOICES
-- ============================================
create table invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  amount_cents integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  due_date date not null,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();

create index idx_invoices_patient_status
  on invoices (patient_id, status)
  where status in ('pending', 'overdue');

-- ============================================
-- PAYMENT_LINKS
-- ============================================
create table payment_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  pagarme_link_id text,
  url text not null,
  method text not null check (method in ('pix', 'boleto')),
  status text not null default 'active'
    check (status in ('active', 'paid', 'expired')),
  created_at timestamptz not null default now()
);

-- ============================================
-- RECALL_QUEUE
-- ============================================
create table recall_queue (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  last_visit_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'responded', 'opted_out')),
  sent_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_recall_pending
  on recall_queue (clinic_id)
  where status = 'pending';
```

**Step 2: Commit**

```bash
git add supabase/migrations/002_module_tables.sql
git commit -m "add migration 002: module tables (appointments, nps, billing, recall)"
```

---

## Task 4: Migration 003 — Agent Tables

**Files:**
- Create: `supabase/migrations/003_agent_tables.sql`

**Step 1: Create the migration file**

```sql
-- 003_agent_tables.sql
-- Tables for the agent system: agents, conversations, messages, queue, module config

-- ============================================
-- AGENTS
-- ============================================
create table agents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  type text not null,
  name text not null,
  description text,
  instructions text,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agents_updated_at
  before update on agents
  for each row execute function update_updated_at();

-- ============================================
-- CONVERSATIONS
-- ============================================
create table conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'gmail')),
  status text not null default 'active'
    check (status in ('active', 'escalated', 'resolved')),
  current_module text,
  whatsapp_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();

create index idx_conversations_clinic_status
  on conversations (clinic_id, status);

create index idx_conversations_patient
  on conversations (patient_id);

-- ============================================
-- MESSAGES
-- ============================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Partial unique index for idempotency on external message IDs
create unique index idx_messages_external_id
  on messages (external_id)
  where external_id is not null;

create index idx_messages_conversation_created
  on messages (conversation_id, created_at);

-- ============================================
-- MESSAGE_QUEUE
-- ============================================
create table message_queue (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'gmail')),
  content text not null,
  template_name text,
  template_params jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger message_queue_updated_at
  before update on message_queue
  for each row execute function update_updated_at();

create index idx_message_queue_pending
  on message_queue (created_at)
  where status = 'pending';

-- ============================================
-- MODULE_CONFIGS
-- ============================================
create table module_configs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  module_type text not null
    check (module_type in ('support', 'scheduling', 'confirmation', 'nps', 'billing', 'recall')),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, module_type)
);

create trigger module_configs_updated_at
  before update on module_configs
  for each row execute function update_updated_at();
```

**Step 2: Commit**

```bash
git add supabase/migrations/003_agent_tables.sql
git commit -m "add migration 003: agent tables (conversations, messages, queue)"
```

---

## Task 5: Migration 004 — RLS Policies

**Files:**
- Create: `supabase/migrations/004_rls_policies.sql`

**Step 1: Create the migration file**

Every table must enforce RLS. The pattern: user can only access rows where `clinic_id` matches their clinic(s) via `clinic_users`.

```sql
-- 004_rls_policies.sql
-- Row Level Security policies for all tables
-- Pattern: user can access rows where clinic_id matches their clinic membership

-- Helper function: get clinic IDs for current user
create or replace function get_user_clinic_ids()
returns setof uuid as $$
  select clinic_id from clinic_users where user_id = auth.uid()
$$ language sql security definer stable;

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
alter table clinics enable row level security;
alter table clinic_users enable row level security;
alter table insurance_plans enable row level security;
alter table services enable row level security;
alter table professionals enable row level security;
alter table patients enable row level security;
alter table appointments enable row level security;
alter table confirmation_queue enable row level security;
alter table nps_responses enable row level security;
alter table invoices enable row level security;
alter table payment_links enable row level security;
alter table recall_queue enable row level security;
alter table agents enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table message_queue enable row level security;
alter table module_configs enable row level security;

-- ============================================
-- CLINICS
-- ============================================
create policy "users can view their clinics"
  on clinics for select
  using (id in (select get_user_clinic_ids()));

create policy "owners can update their clinics"
  on clinics for update
  using (id in (
    select clinic_id from clinic_users
    where user_id = auth.uid() and role = 'owner'
  ));

-- Insert handled by signup function (service role)

-- ============================================
-- CLINIC_USERS
-- ============================================
create policy "users can view their clinic members"
  on clinic_users for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "owners can manage clinic members"
  on clinic_users for all
  using (clinic_id in (
    select clinic_id from clinic_users cu
    where cu.user_id = auth.uid() and cu.role = 'owner'
  ));

-- ============================================
-- STANDARD CLINIC-SCOPED POLICIES
-- (same pattern for all remaining tables)
-- ============================================

-- Macro: for each table, SELECT/INSERT/UPDATE/DELETE scoped to user's clinics

-- insurance_plans
create policy "clinic members can view insurance plans"
  on insurance_plans for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage insurance plans"
  on insurance_plans for all
  using (clinic_id in (select get_user_clinic_ids()));

-- services
create policy "clinic members can view services"
  on services for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage services"
  on services for all
  using (clinic_id in (select get_user_clinic_ids()));

-- professionals
create policy "clinic members can view professionals"
  on professionals for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage professionals"
  on professionals for all
  using (clinic_id in (select get_user_clinic_ids()));

-- patients
create policy "clinic members can view patients"
  on patients for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage patients"
  on patients for all
  using (clinic_id in (select get_user_clinic_ids()));

-- appointments
create policy "clinic members can view appointments"
  on appointments for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage appointments"
  on appointments for all
  using (clinic_id in (select get_user_clinic_ids()));

-- confirmation_queue
create policy "clinic members can view confirmation queue"
  on confirmation_queue for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage confirmation queue"
  on confirmation_queue for all
  using (clinic_id in (select get_user_clinic_ids()));

-- nps_responses
create policy "clinic members can view nps responses"
  on nps_responses for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage nps responses"
  on nps_responses for all
  using (clinic_id in (select get_user_clinic_ids()));

-- invoices
create policy "clinic members can view invoices"
  on invoices for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage invoices"
  on invoices for all
  using (clinic_id in (select get_user_clinic_ids()));

-- payment_links
create policy "clinic members can view payment links"
  on payment_links for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage payment links"
  on payment_links for all
  using (clinic_id in (select get_user_clinic_ids()));

-- recall_queue
create policy "clinic members can view recall queue"
  on recall_queue for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage recall queue"
  on recall_queue for all
  using (clinic_id in (select get_user_clinic_ids()));

-- agents
create policy "clinic members can view agents"
  on agents for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage agents"
  on agents for all
  using (clinic_id in (select get_user_clinic_ids()));

-- conversations
create policy "clinic members can view conversations"
  on conversations for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage conversations"
  on conversations for all
  using (clinic_id in (select get_user_clinic_ids()));

-- messages
create policy "clinic members can view messages"
  on messages for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage messages"
  on messages for all
  using (clinic_id in (select get_user_clinic_ids()));

-- message_queue
create policy "clinic members can view message queue"
  on message_queue for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage message queue"
  on message_queue for all
  using (clinic_id in (select get_user_clinic_ids()));

-- module_configs
create policy "clinic members can view module configs"
  on module_configs for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage module configs"
  on module_configs for all
  using (clinic_id in (select get_user_clinic_ids()));
```

**Step 2: Commit**

```bash
git add supabase/migrations/004_rls_policies.sql
git commit -m "add migration 004: RLS policies for all tables"
```

---

## Task 6: Push Migrations to Supabase

**Step 1: Push all migrations**

```bash
npx supabase db push
```

If `supabase link` wasn't done (no database password), run the SQL files manually:
1. Open the Supabase Dashboard → SQL Editor
2. Run each migration file in order: 001, 002, 003, 004

**Step 2: Verify tables exist**

```bash
npx supabase db lint
```

Or check via dashboard that all 16 tables + RLS policies are visible.

No commit needed — this is a remote-only operation.

---

## Task 7: Generate TypeScript Types

**Files:**
- Create: `src/types/database.ts`

**Step 1: Generate types from Supabase**

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

If `supabase link` wasn't done, use the project ID directly:

```bash
npx supabase gen types typescript --project-id zfeyfnmbozwxagiegdyk > src/types/database.ts
```

**Step 2: Remove the `.gitkeep` from `src/types/` if present**

**Step 3: Verify the generated file**

Open `src/types/database.ts` and verify it contains interfaces for all 16 tables.

**Step 4: Create a convenience type export**

Create `src/types/index.ts`:

```ts
export type { Database } from "./database";

// Convenience row types
import type { Database } from "./database";

type Tables = Database["public"]["Tables"];

export type Clinic = Tables["clinics"]["Row"];
export type ClinicInsert = Tables["clinics"]["Insert"];
export type ClinicUpdate = Tables["clinics"]["Update"];

export type ClinicUser = Tables["clinic_users"]["Row"];
export type Professional = Tables["professionals"]["Row"];
export type Patient = Tables["patients"]["Row"];
export type Appointment = Tables["appointments"]["Row"];
export type ConfirmationQueueItem = Tables["confirmation_queue"]["Row"];
export type NpsResponse = Tables["nps_responses"]["Row"];
export type Invoice = Tables["invoices"]["Row"];
export type PaymentLink = Tables["payment_links"]["Row"];
export type RecallQueueItem = Tables["recall_queue"]["Row"];
export type Agent = Tables["agents"]["Row"];
export type Conversation = Tables["conversations"]["Row"];
export type Message = Tables["messages"]["Row"];
export type MessageQueueItem = Tables["message_queue"]["Row"];
export type ModuleConfig = Tables["module_configs"]["Row"];

export type InsurancePlan = Tables["insurance_plans"]["Row"];
export type Service = Tables["services"]["Row"];

// Role type
export type ClinicRole = "owner" | "reception";

// Module type
export type ModuleType = "support" | "scheduling" | "confirmation" | "nps" | "billing" | "recall";

// Appointment status
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

// Conversation status
export type ConversationStatus = "active" | "escalated" | "resolved";
```

**Step 5: Update Supabase clients to use generated types**

Modify `src/lib/supabase/client.ts`:

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return createBrowserClient<Database>(supabaseUrl, publishableKey);
}
```

Apply the same `<Database>` generic to `server.ts` (on `createServerClient<Database>(...)`) and `admin.ts` (on `createClient<Database>(...)`). Import `Database` from `@/types/database` in each.

**Step 6: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 7: Commit**

```bash
git add src/types/ src/lib/supabase/
git commit -m "add generated database types and typed supabase clients"
```

---

## Task 8: Auth — Signup API Route

**Files:**
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/lib/validations/auth.ts`

Signup must atomically: create Supabase auth user → create clinic → create clinic_user (owner).

**Step 1: Create validation schemas**

Create `src/lib/validations/auth.ts`:

```ts
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  clinicName: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

**Step 2: Create signup API route**

Create `src/app/api/auth/signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signupSchema } from "@/lib/validations/auth";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    + "-" + Date.now().toString(36);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, password, clinicName } = parsed.data;
  const supabase = createAdminClient();

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // 2. Create clinic
  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .insert({ name: clinicName, slug: generateSlug(clinicName) })
    .select("id")
    .single();

  if (clinicError) {
    // Rollback: delete the auth user
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: clinicError.message }, { status: 500 });
  }

  // 3. Create clinic_user (owner)
  const { error: memberError } = await supabase
    .from("clinic_users")
    .insert({ clinic_id: clinic.id, user_id: userId, role: "owner" });

  if (memberError) {
    // Rollback: delete clinic and auth user
    await supabase.from("clinics").delete().eq("id", clinic.id);
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // 4. Create default module configs (all enabled)
  const moduleTypes = ["support", "scheduling", "confirmation", "nps", "billing", "recall"] as const;
  const moduleInserts = moduleTypes.map((type) => ({
    clinic_id: clinic.id,
    module_type: type,
    enabled: true,
  }));

  await supabase.from("module_configs").insert(moduleInserts);

  return NextResponse.json(
    { data: { userId, clinicId: clinic.id } },
    { status: 201 }
  );
}
```

**Step 3: Remove `.gitkeep` from `src/lib/validations/` if present**

**Step 4: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 5: Commit**

```bash
git add src/app/api/ src/lib/validations/
git commit -m "add signup api route with clinic creation and validation"
```

---

## Task 9: Auth — Login/Signup Pages

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/(auth)/auth/callback/route.ts`

**Step 1: Create auth layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

**Step 2: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-center"
        style={{ color: "var(--text-primary)" }}
      >
        {t("login.title")}
      </h1>
      <p
        className="mt-2 text-sm text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("login.subtitle")}
      </p>

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("login.email")}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("login.password")}
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-70"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {loading ? t("login.loading") : t("login.submit")}
        </button>
      </form>

      <div className="mt-4">
        <button
          onClick={handleGoogleLogin}
          className="w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {t("login.google")}
        </button>
      </div>

      <p
        className="mt-4 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        {t("login.noAccount")}{" "}
        <a href="/signup" style={{ color: "var(--accent)" }}>
          {t("login.signupLink")}
        </a>
      </p>
    </div>
  );
}
```

**Step 3: Create signup page**

Create `src/app/(auth)/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, clinicName }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || t("common.error"));
      setLoading(false);
      return;
    }

    // Auto-login after signup
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-center"
        style={{ color: "var(--text-primary)" }}
      >
        {t("signup.title")}
      </h1>
      <p
        className="mt-2 text-sm text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("signup.subtitle")}
      </p>

      <form onSubmit={handleSignup} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="clinicName"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("signup.clinicName")}
          </label>
          <input
            id="clinicName"
            type="text"
            required
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("signup.email")}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("signup.password")}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-70"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {loading ? t("signup.loading") : t("signup.submit")}
        </button>
      </form>

      <p
        className="mt-4 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        {t("signup.hasAccount")}{" "}
        <a href="/login" style={{ color: "var(--accent)" }}>
          {t("signup.loginLink")}
        </a>
      </p>
    </div>
  );
}
```

**Step 4: Create OAuth callback route**

Create `src/app/(auth)/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Check if user already has a clinic
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("id")
    .eq("user_id", data.user.id)
    .limit(1)
    .single();

  if (!membership) {
    // First-time OAuth user: create a clinic
    const name = data.user.user_metadata?.full_name || data.user.email || "My Clinic";
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
      + "-" + Date.now().toString(36);

    const { data: clinic } = await admin
      .from("clinics")
      .insert({ name, slug })
      .select("id")
      .single();

    if (clinic) {
      await admin
        .from("clinic_users")
        .insert({ clinic_id: clinic.id, user_id: data.user.id, role: "owner" });

      // Create default module configs
      const moduleTypes = ["support", "scheduling", "confirmation", "nps", "billing", "recall"] as const;
      await admin.from("module_configs").insert(
        moduleTypes.map((type) => ({
          clinic_id: clinic.id,
          module_type: type,
          enabled: true,
        }))
      );
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
```

**Step 5: Add auth translations**

Add to `messages/pt-BR.json`:

```json
{
  "auth": {
    "login": {
      "title": "Entrar",
      "subtitle": "Acesse sua conta",
      "email": "Email",
      "password": "Senha",
      "submit": "Entrar",
      "loading": "Entrando...",
      "google": "Entrar com Google",
      "noAccount": "Não tem conta?",
      "signupLink": "Criar conta"
    },
    "signup": {
      "title": "Criar Conta",
      "subtitle": "Configure sua clínica em minutos",
      "clinicName": "Nome da Clínica",
      "email": "Email",
      "password": "Senha",
      "submit": "Criar Conta",
      "loading": "Criando...",
      "hasAccount": "Já tem conta?",
      "loginLink": "Entrar"
    }
  }
}
```

Add equivalent `auth` keys to `messages/en.json` and `messages/es.json`.

**Step 6: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 7: Commit**

```bash
git add src/app/(auth)/ messages/
git commit -m "add login and signup pages with google oauth callback"
```

---

## Task 10: Update proxy.ts for Route Protection

**Files:**
- Modify: `src/proxy.ts`

**Step 1: Update proxy to redirect unauthenticated users**

Replace the contents of `src/proxy.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated user trying to access protected route → redirect to login
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login/signup → redirect to dashboard
  if (user && isPublicRoute(pathname)) {
    const dashboardUrl = new URL("/", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```

**Step 2: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "add route protection to proxy.ts (redirect unauthenticated to login)"
```

---

## Task 11: Seed Data

**Files:**
- Create: `supabase/seed.sql`

**Step 1: Create seed data file**

```sql
-- seed.sql
-- Development seed data for Órbita platform
-- Run with: npx supabase db reset (applies migrations + seed)
-- Or manually via SQL editor

-- NOTE: This seed requires a user to exist in auth.users.
-- Create a test user via the Supabase dashboard or Auth API first.
-- Then replace the user_id below with the actual UUID.

-- For development, we'll use a placeholder that gets replaced at runtime.
-- The seed script below is designed to be run AFTER creating a test user.

-- Create a demo clinic
insert into clinics (id, name, slug, phone, email, address, city, state, zip_code, timezone, operating_hours)
values (
  '00000000-0000-0000-0000-000000000001',
  'Clínica Demo',
  'clinica-demo',
  '11999999999',
  'demo@orbita.health',
  'Rua Exemplo, 123',
  'São Paulo',
  'SP',
  '01310100',
  'America/Sao_Paulo',
  '{"mon": {"start": "08:00", "end": "18:00"}, "tue": {"start": "08:00", "end": "18:00"}, "wed": {"start": "08:00", "end": "18:00"}, "thu": {"start": "08:00", "end": "18:00"}, "fri": {"start": "08:00", "end": "18:00"}, "sat": {"start": "08:00", "end": "12:00"}}'::jsonb
);

-- Insurance plans
insert into insurance_plans (clinic_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Unimed'),
  ('00000000-0000-0000-0000-000000000001', 'Amil'),
  ('00000000-0000-0000-0000-000000000001', 'SulAmérica'),
  ('00000000-0000-0000-0000-000000000001', 'Particular');

-- Services
insert into services (clinic_id, name, duration_minutes, price_cents) values
  ('00000000-0000-0000-0000-000000000001', 'Consulta Geral', 30, 25000),
  ('00000000-0000-0000-0000-000000000001', 'Retorno', 15, 0),
  ('00000000-0000-0000-0000-000000000001', 'Exame de Rotina', 45, 35000);

-- Professionals
insert into professionals (id, clinic_id, name, specialty, appointment_duration_minutes, schedule_grid) values
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Dr. João Silva',
    'Clínico Geral',
    30,
    '{"mon": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}], "tue": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}], "wed": [{"start": "08:00", "end": "12:00"}], "thu": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}], "fri": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}]}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Dra. Maria Santos',
    'Dermatologista',
    45,
    '{"mon": [{"start": "09:00", "end": "13:00"}], "wed": [{"start": "09:00", "end": "13:00"}], "fri": [{"start": "09:00", "end": "13:00"}]}'::jsonb
  );

-- Patients (10)
insert into patients (clinic_id, name, phone, email) values
  ('00000000-0000-0000-0000-000000000001', 'Ana Costa', '11988880001', 'ana@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Bruno Lima', '11988880002', 'bruno@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Carla Oliveira', '11988880003', 'carla@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Daniel Souza', '11988880004', 'daniel@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Elena Martins', '11988880005', 'elena@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Fernando Alves', '11988880006', 'fernando@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Gabriela Rocha', '11988880007', 'gabriela@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Hugo Pereira', '11988880008', 'hugo@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Isabela Nunes', '11988880009', 'isabela@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'José Mendes', '11988880010', 'jose@email.com');

-- Module configs (all enabled)
insert into module_configs (clinic_id, module_type, enabled) values
  ('00000000-0000-0000-0000-000000000001', 'support', true),
  ('00000000-0000-0000-0000-000000000001', 'scheduling', true),
  ('00000000-0000-0000-0000-000000000001', 'confirmation', true),
  ('00000000-0000-0000-0000-000000000001', 'nps', true),
  ('00000000-0000-0000-0000-000000000001', 'billing', true),
  ('00000000-0000-0000-0000-000000000001', 'recall', true);
```

**Step 2: Commit**

```bash
git add supabase/seed.sql
git commit -m "add development seed data for demo clinic"
```

---

## Task 12: Tests + Final Verification

**Files:**
- Create: `src/__tests__/lib/validations/auth.test.ts`
- Create: `src/__tests__/api/auth/signup.test.ts`

**Step 1: Write validation tests**

Create `src/__tests__/lib/validations/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema } from "@/lib/validations/auth";

describe("signupSchema", () => {
  it("accepts valid input", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "12345678",
      clinicName: "My Clinic",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "12345678",
      clinicName: "My Clinic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "123",
      clinicName: "My Clinic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty clinic name", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "12345678",
      clinicName: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "any",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests**

```bash
npm run test
```

Expected: All tests pass (home smoke test + validation tests).

**Step 3: Run full verification**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

All must pass.

**Step 4: Commit**

```bash
git add src/__tests__/
git commit -m "add auth validation tests"
```

---

## Summary

After completing all tasks:

| What | Status |
|------|--------|
| Supabase CLI initialized | `supabase/` with config |
| 16 database tables | 4 migration files |
| RLS on all tables | `clinic_id` isolation via `get_user_clinic_ids()` |
| TypeScript types | Auto-generated from schema |
| Typed Supabase clients | `Database` generic on all 3 clients |
| Signup API | Creates user + clinic + clinic_user atomically |
| Login page | Email/password + Google OAuth |
| Signup page | Clinic name + email + password |
| OAuth callback | Auto-creates clinic for new Google users |
| Route protection | proxy.ts redirects unauthenticated to /login |
| Seed data | Demo clinic with professionals and patients |
| Validation schemas | Zod schemas for auth inputs |
| Tests | Validation tests + existing smoke test |

**Next phase:** Phase 3 — Web Platform Shell + Onboarding
