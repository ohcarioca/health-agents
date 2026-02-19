-- 017_clinic_google_calendar.sql
-- Allows connecting a Google Calendar at the clinic level (separate from per-professional).

alter table clinics
  add column google_calendar_id text,
  add column google_refresh_token text;
