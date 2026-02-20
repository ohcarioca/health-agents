-- 018_clinic_assistant_name.sql
-- Add assistant_name to clinics for unified agent identity across all modules

alter table clinics
  add column assistant_name text;

comment on column clinics.assistant_name is
  'Optional unified name for the AI assistant. When set, all modules use this name instead of individual agent names.';
