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
