-- 005_message_queue_outbound.sql
-- Add patient_id and source columns for outbound message tracking

alter table message_queue
  add column if not exists patient_id uuid references patients(id) on delete set null;

alter table message_queue
  add column if not exists source text;

-- Index for rate-limit query: count messages per patient per day
create index if not exists idx_message_queue_patient_day
  on message_queue (clinic_id, patient_id, created_at)
  where status in ('sent', 'pending', 'processing');
