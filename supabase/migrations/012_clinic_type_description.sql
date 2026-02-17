-- Add clinic type and description for onboarding templates
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS description text;
