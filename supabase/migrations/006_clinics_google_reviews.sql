-- 006_clinics_google_reviews.sql
-- Add google_reviews_url for NPS promoter redirect

alter table clinics
  add column if not exists google_reviews_url text;
