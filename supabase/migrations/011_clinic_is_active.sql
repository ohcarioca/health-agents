-- Add is_active flag to clinics table
-- false by default — clinic must meet minimum requirements before activation
ALTER TABLE clinics ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;

-- Backward compatibility: mark existing clinics with phone as active
-- (phone was the old onboarding completion marker)
UPDATE clinics SET is_active = true WHERE phone IS NOT NULL AND phone <> '';
