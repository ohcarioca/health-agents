-- 009_professional_services.sql
-- Junction table: which services each professional offers and at what price

create table professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  price_cents integer not null,
  created_at timestamptz not null default now(),
  unique (professional_id, service_id)
);

-- RLS
alter table professional_services enable row level security;

create policy "Users can manage professional_services for their clinic"
  on professional_services for all
  using (
    exists (
      select 1 from professionals p
      join clinic_users cu on cu.clinic_id = p.clinic_id
      where p.id = professional_services.professional_id
        and cu.user_id = auth.uid()
    )
  );

-- Also add RLS policies for services and insurance_plans (missing from original migration)
alter table services enable row level security;

create policy "Users can manage services for their clinic"
  on services for all
  using (
    exists (
      select 1 from clinic_users cu
      where cu.clinic_id = services.clinic_id
        and cu.user_id = auth.uid()
    )
  );

alter table insurance_plans enable row level security;

create policy "Users can manage insurance_plans for their clinic"
  on insurance_plans for all
  using (
    exists (
      select 1 from clinic_users cu
      where cu.clinic_id = insurance_plans.clinic_id
        and cu.user_id = auth.uid()
    )
  );
