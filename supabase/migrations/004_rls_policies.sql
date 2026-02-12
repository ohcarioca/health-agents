-- 004_rls_policies.sql
-- Row Level Security policies for all tables
-- Pattern: user can access rows where clinic_id matches their clinic membership

-- Helper function: get clinic IDs for current user
create or replace function get_user_clinic_ids()
returns setof uuid as $$
  select clinic_id from clinic_users where user_id = auth.uid()
$$ language sql security definer stable;

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
alter table clinics enable row level security;
alter table clinic_users enable row level security;
alter table insurance_plans enable row level security;
alter table services enable row level security;
alter table professionals enable row level security;
alter table patients enable row level security;
alter table appointments enable row level security;
alter table confirmation_queue enable row level security;
alter table nps_responses enable row level security;
alter table invoices enable row level security;
alter table payment_links enable row level security;
alter table recall_queue enable row level security;
alter table agents enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table message_queue enable row level security;
alter table module_configs enable row level security;

-- ============================================
-- CLINICS
-- ============================================
create policy "users can view their clinics"
  on clinics for select
  using (id in (select get_user_clinic_ids()));

create policy "owners can update their clinics"
  on clinics for update
  using (id in (
    select clinic_id from clinic_users
    where user_id = auth.uid() and role = 'owner'
  ));

-- Insert handled by signup function (service role)

-- ============================================
-- CLINIC_USERS
-- ============================================
create policy "users can view their clinic members"
  on clinic_users for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "owners can manage clinic members"
  on clinic_users for all
  using (clinic_id in (
    select clinic_id from clinic_users cu
    where cu.user_id = auth.uid() and cu.role = 'owner'
  ));

-- ============================================
-- STANDARD CLINIC-SCOPED POLICIES
-- (same pattern for all remaining tables)
-- ============================================

-- insurance_plans
create policy "clinic members can view insurance plans"
  on insurance_plans for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage insurance plans"
  on insurance_plans for all
  using (clinic_id in (select get_user_clinic_ids()));

-- services
create policy "clinic members can view services"
  on services for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage services"
  on services for all
  using (clinic_id in (select get_user_clinic_ids()));

-- professionals
create policy "clinic members can view professionals"
  on professionals for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage professionals"
  on professionals for all
  using (clinic_id in (select get_user_clinic_ids()));

-- patients
create policy "clinic members can view patients"
  on patients for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage patients"
  on patients for all
  using (clinic_id in (select get_user_clinic_ids()));

-- appointments
create policy "clinic members can view appointments"
  on appointments for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage appointments"
  on appointments for all
  using (clinic_id in (select get_user_clinic_ids()));

-- confirmation_queue
create policy "clinic members can view confirmation queue"
  on confirmation_queue for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage confirmation queue"
  on confirmation_queue for all
  using (clinic_id in (select get_user_clinic_ids()));

-- nps_responses
create policy "clinic members can view nps responses"
  on nps_responses for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage nps responses"
  on nps_responses for all
  using (clinic_id in (select get_user_clinic_ids()));

-- invoices
create policy "clinic members can view invoices"
  on invoices for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage invoices"
  on invoices for all
  using (clinic_id in (select get_user_clinic_ids()));

-- payment_links
create policy "clinic members can view payment links"
  on payment_links for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage payment links"
  on payment_links for all
  using (clinic_id in (select get_user_clinic_ids()));

-- recall_queue
create policy "clinic members can view recall queue"
  on recall_queue for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage recall queue"
  on recall_queue for all
  using (clinic_id in (select get_user_clinic_ids()));

-- agents
create policy "clinic members can view agents"
  on agents for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage agents"
  on agents for all
  using (clinic_id in (select get_user_clinic_ids()));

-- conversations
create policy "clinic members can view conversations"
  on conversations for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage conversations"
  on conversations for all
  using (clinic_id in (select get_user_clinic_ids()));

-- messages
create policy "clinic members can view messages"
  on messages for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage messages"
  on messages for all
  using (clinic_id in (select get_user_clinic_ids()));

-- message_queue
create policy "clinic members can view message queue"
  on message_queue for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage message queue"
  on message_queue for all
  using (clinic_id in (select get_user_clinic_ids()));

-- module_configs
create policy "clinic members can view module configs"
  on module_configs for select
  using (clinic_id in (select get_user_clinic_ids()));

create policy "clinic members can manage module configs"
  on module_configs for all
  using (clinic_id in (select get_user_clinic_ids()));
