-- 007_asaas_integration.sql
-- Add Asaas customer ID to patients for charge creation
-- Add CPF field to patients (required by Asaas)
-- Rename pagarme_link_id to asaas_payment_id on payment_links

-- Patients: add CPF (required by Asaas to create customer)
alter table patients
  add column if not exists cpf text;

-- Patients: store Asaas customer ID to avoid duplicate creation
alter table patients
  add column if not exists asaas_customer_id text;

create unique index if not exists idx_patients_asaas_customer
  on patients (asaas_customer_id)
  where asaas_customer_id is not null;

-- Payment links: rename pagarme_link_id → asaas_payment_id
alter table payment_links
  rename column pagarme_link_id to asaas_payment_id;

-- Payment links: add invoice_url for Asaas universal payment page
alter table payment_links
  add column if not exists invoice_url text;

-- Payment links: add pix_payload for copia-e-cola
alter table payment_links
  add column if not exists pix_payload text;

-- Payment links: add boleto_identification_field for linha digitável
alter table payment_links
  add column if not exists boleto_identification_field text;
