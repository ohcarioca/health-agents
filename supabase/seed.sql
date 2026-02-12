-- seed.sql
-- Development seed data for Órbita platform
-- Run with: npx supabase db reset (applies migrations + seed)
-- Or manually via SQL editor

-- NOTE: This seed requires a user to exist in auth.users.
-- Create a test user via the Supabase dashboard or Auth API first.
-- Then replace the user_id below with the actual UUID.

-- For development, we'll use a placeholder that gets replaced at runtime.
-- The seed script below is designed to be run AFTER creating a test user.

-- Create a demo clinic
insert into clinics (id, name, slug, phone, email, address, city, state, zip_code, timezone, operating_hours)
values (
  '00000000-0000-0000-0000-000000000001',
  'Clínica Demo',
  'clinica-demo',
  '11999999999',
  'demo@orbita.health',
  'Rua Exemplo, 123',
  'São Paulo',
  'SP',
  '01310100',
  'America/Sao_Paulo',
  '{"mon": {"start": "08:00", "end": "18:00"}, "tue": {"start": "08:00", "end": "18:00"}, "wed": {"start": "08:00", "end": "18:00"}, "thu": {"start": "08:00", "end": "18:00"}, "fri": {"start": "08:00", "end": "18:00"}, "sat": {"start": "08:00", "end": "12:00"}}'::jsonb
);

-- Insurance plans
insert into insurance_plans (clinic_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Unimed'),
  ('00000000-0000-0000-0000-000000000001', 'Amil'),
  ('00000000-0000-0000-0000-000000000001', 'SulAmérica'),
  ('00000000-0000-0000-0000-000000000001', 'Particular');

-- Services
insert into services (clinic_id, name, duration_minutes, price_cents) values
  ('00000000-0000-0000-0000-000000000001', 'Consulta Geral', 30, 25000),
  ('00000000-0000-0000-0000-000000000001', 'Retorno', 15, 0),
  ('00000000-0000-0000-0000-000000000001', 'Exame de Rotina', 45, 35000);

-- Professionals
insert into professionals (id, clinic_id, name, specialty, appointment_duration_minutes, schedule_grid) values
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Dr. João Silva',
    'Clínico Geral',
    30,
    '{"mon": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}], "tue": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}], "wed": [{"start": "08:00", "end": "12:00"}], "thu": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}], "fri": [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}]}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Dra. Maria Santos',
    'Dermatologista',
    45,
    '{"mon": [{"start": "09:00", "end": "13:00"}], "wed": [{"start": "09:00", "end": "13:00"}], "fri": [{"start": "09:00", "end": "13:00"}]}'::jsonb
  );

-- Patients (10)
insert into patients (clinic_id, name, phone, email) values
  ('00000000-0000-0000-0000-000000000001', 'Ana Costa', '11988880001', 'ana@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Bruno Lima', '11988880002', 'bruno@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Carla Oliveira', '11988880003', 'carla@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Daniel Souza', '11988880004', 'daniel@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Elena Martins', '11988880005', 'elena@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Fernando Alves', '11988880006', 'fernando@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Gabriela Rocha', '11988880007', 'gabriela@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Hugo Pereira', '11988880008', 'hugo@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'Isabela Nunes', '11988880009', 'isabela@email.com'),
  ('00000000-0000-0000-0000-000000000001', 'José Mendes', '11988880010', 'jose@email.com');

-- Module configs (all enabled)
insert into module_configs (clinic_id, module_type, enabled) values
  ('00000000-0000-0000-0000-000000000001', 'support', true),
  ('00000000-0000-0000-0000-000000000001', 'scheduling', true),
  ('00000000-0000-0000-0000-000000000001', 'confirmation', true),
  ('00000000-0000-0000-0000-000000000001', 'nps', true),
  ('00000000-0000-0000-0000-000000000001', 'billing', true),
  ('00000000-0000-0000-0000-000000000001', 'recall', true);
