-- 016_service_modality.sql
-- Add modality column to services table.
-- 'in_person' = only in-clinic, 'online' = only remote, 'both' = patient chooses.

alter table services
  add column modality text not null default 'both'
    check (modality in ('in_person', 'online', 'both'));
