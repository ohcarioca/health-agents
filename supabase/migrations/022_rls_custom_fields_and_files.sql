-- 022_rls_custom_fields_and_files.sql
-- Enable RLS on patient_custom_fields and patient_files tables
-- These were missed in 004_rls_policies.sql when created in migration 019

-- ============================================
-- ENABLE RLS
-- ============================================
alter table patient_custom_fields enable row level security;
alter table patient_files enable row level security;

-- ============================================
-- PATIENT_CUSTOM_FIELDS
-- ============================================
create policy "clinic members can view custom fields"
  on patient_custom_fields for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage custom fields"
  on patient_custom_fields for all
  using (clinic_id in (select get_user_clinic_ids()));

-- ============================================
-- PATIENT_FILES
-- ============================================
create policy "clinic members can view patient files"
  on patient_files for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage patient files"
  on patient_files for all
  using (clinic_id in (select get_user_clinic_ids()));
