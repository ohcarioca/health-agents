-- 008_whatsapp_per_clinic.sql
-- Add WhatsApp credentials per clinic (multi-tenant support)

alter table clinics add column whatsapp_phone_number_id text;
alter table clinics add column whatsapp_waba_id text;
alter table clinics add column whatsapp_access_token text;
