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
