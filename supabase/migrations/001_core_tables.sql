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
