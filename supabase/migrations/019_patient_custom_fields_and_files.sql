-- 019_patient_custom_fields_and_files.sql
-- Custom field definitions per clinic and file attachment metadata per patient

-- ============================================
-- PATIENT_CUSTOM_FIELDS (field schema definitions)
-- ============================================
create table patient_custom_fields (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'select')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create trigger patient_custom_fields_updated_at
  before update on patient_custom_fields
  for each row execute function update_updated_at();

-- ============================================
-- PATIENT_FILES (file attachment metadata)
-- ============================================
create table patient_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  file_name text not null,
  file_size integer not null,
  mime_type text not null,
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index patient_files_patient_id_idx on patient_files(patient_id);

-- ============================================
-- HELPER: remove custom field values from patients when a field definition is deleted
-- ============================================
create or replace function remove_custom_field_from_patients(
  p_clinic_id uuid,
  p_field_id text
) returns void as $$
begin
  update patients
  set custom_fields = custom_fields - p_field_id
  where clinic_id = p_clinic_id
    and custom_fields ? p_field_id;
end;
$$ language plpgsql security definer;
