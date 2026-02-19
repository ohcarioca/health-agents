-- Enforce at most one open (active or escalated) conversation per patient per clinic per channel.
--
-- Step 1: Resolve existing duplicates — keep the newest open conversation,
--         mark older open conversations as resolved.
with ranked as (
  select
    id,
    row_number() over (
      partition by clinic_id, patient_id, channel
      order by created_at desc
    ) as rn
  from conversations
  where status in ('active', 'escalated')
)
update conversations
set status = 'resolved', updated_at = now()
where id in (
  select id from ranked where rn > 1
);

-- Step 2: Add partial unique index — prevents creating a second open conversation
--         for the same patient in the same clinic/channel at the DB level.
create unique index conversations_one_open_per_patient
  on conversations (clinic_id, patient_id, channel)
  where status in ('active', 'escalated');
