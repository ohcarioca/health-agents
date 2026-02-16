-- 010_appointments_insurance_plan.sql
-- Add optional insurance plan reference to appointments

alter table appointments
  add column insurance_plan_id uuid references insurance_plans(id) on delete set null;
