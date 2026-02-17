-- Add is_active flag to clinics table
-- false by default — clinic must meet minimum requirements before activation
ALTER TABLE clinics ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
