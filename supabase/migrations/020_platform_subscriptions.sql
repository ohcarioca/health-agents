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
