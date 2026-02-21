-- Add CNPJ to clinics (optional)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cnpj text;

-- Add registration number to professionals (optional, e.g., CRM, CRO)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS registration_number text;
