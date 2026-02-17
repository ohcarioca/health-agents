-- Public clinic page configuration
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS public_page_enabled boolean DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#0EA5E9';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS show_prices boolean DEFAULT true;
