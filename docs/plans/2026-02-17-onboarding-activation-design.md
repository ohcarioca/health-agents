# Onboarding & Clinic Activation Design

**Date:** 2026-02-17
**Branch:** feature/onboarding
**Status:** Approved

---

## Problem

The current onboarding wizard is shallow — WhatsApp and modules steps are placeholders, there's no validation of minimum requirements, and no concept of "clinic is live." Clinics go straight from signup to dashboard without verifying they can actually operate.

## Goal

Minimum viable onboarding that ensures a clinic has everything configured to receive and process WhatsApp messages before going live. A self-service activate/deactivate toggle in the sidebar controls whether agents respond.

---

## Requirements (5 Minimum)

A clinic can only activate when ALL of these are met:

1. **Clinic operating hours** — `operating_hours` JSONB has at least 1 day with time blocks
2. **1 professional with schedule** — active professional with non-empty `schedule_grid`
3. **1 service with price** — `professional_services` row with `price_cents > 0` linked to that professional
4. **WhatsApp configured** — `whatsapp_phone_number_id`, `whatsapp_waba_id`, and `whatsapp_access_token` all set on `clinics`
5. **Google Calendar connected** — at least 1 professional with `google_calendar_id` set

---

## Database

### Migration

```sql
ALTER TABLE clinics ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
```

- `false` on signup (default)
- Can only be set `true` via API after all 5 requirements pass
- Can be set `false` at any time (no validation needed to deactivate)
- Independent from `phone` field (which marks onboarding wizard as completed)

---

## Wizard Restructure

Replace current 5-step wizard with 5 new steps focused on minimum requirements.

### Step 1 — Clinic + Operating Hours

- Fields: name, phone (required), address, timezone
- `CompactScheduleGrid` component for `operating_hours`
- Saves via `PUT /api/settings/clinic`
- Phone being set marks onboarding as "complete" (existing behavior for dashboard redirect)

### Step 2 — Professional + Schedule + Service

- Professional fields: name, specialty, appointment duration (minutes)
- `CompactScheduleGrid` for professional's `schedule_grid`
- Inline service creation: name, duration, price (in cents)
- Auto-links service to professional via `professional_services` with the given price
- All in one step because the data is interdependent
- Saves via:
  - `POST /api/settings/professionals`
  - `POST /api/settings/services`
  - `PUT /api/settings/professionals/[id]/services`

### Step 3 — WhatsApp

- 3 fields: Phone Number ID, WABA ID, Access Token
- "Test connection" button → `POST /api/integrations/whatsapp/test` (new route)
- Saves via `PUT /api/settings/clinic`

### Step 4 — Google Calendar

- Shows the professional created in Step 2
- "Connect Google Calendar" button — reuses existing OAuth flow
- After OAuth callback, returns to `/setup?step=4` with success indicator
- Reuses `POST /api/integrations/google-calendar/connect` (existing)

### Step 5 — Patients (Optional) + Review

- Import/add patients — reuses `PatientFormDialog` and `PatientImportDialog`
- Marked as optional
- Visual checklist showing status of each requirement (calls `GET /api/onboarding/status`)
- "Finish" button → redirects to dashboard

### Key Change: Step-by-Step Persistence

Each step saves immediately via API (not all at the end). If the user leaves mid-flow, progress is preserved. The wizard detects existing data and pre-fills on return.

### Removed

- Modules step (placeholder) — modules are auto-created on signup, configurable in Settings later

---

## Sidebar — ClinicStatusToggle

### Position

Between `SidebarNav` and the locale/theme/user block at the bottom.

```
┌─────────────────┐
│  Clinic Name    │  header
├─────────────────┤
│  Dashboard      │
│  Inbox          │
│  Calendar       │  SidebarNav
│  Patients       │
│  ...            │
│  Settings       │
├─────────────────┤
│ ● Active  [══] │  ClinicStatusToggle (NEW)
├─────────────────┤
│  PT  theme      │  locale + theme
│  User Menu      │  SidebarUserMenu
└─────────────────┘
```

### Behavior

- **Inactive:** red/gray indicator + "Inactive" text + toggle off
- **Active:** green indicator + "Active" text + toggle on
- **Sidebar collapsed:** colored dot only, tooltip shows status

### Toggle Actions

- **ON (activate):** `PUT /api/onboarding/activate { active: true }` — backend validates 5 requirements. If missing, returns `400` with `missing[]`. Frontend shows toast listing what's pending.
- **OFF (deactivate):** confirmation dialog ("Your agents will stop responding. Are you sure?") → `PUT /api/onboarding/activate { active: false }`. No prerequisites.

### Data Flow

`DashboardLayout` already queries clinic info → add `is_active` to the query → pass as prop to `Sidebar` → `Sidebar` passes to `ClinicStatusToggle`.

---

## New API Routes

### `PUT /api/onboarding/activate`

**Request:** `{ "active": true | false }`

**For `active: true`** — validates all 5 requirements:

1. `clinic.operating_hours` has at least 1 day with blocks
2. EXISTS active professional with non-empty `schedule_grid`
3. EXISTS `professional_services` with `price_cents > 0` for that professional
4. `clinic.whatsapp_phone_number_id` AND `whatsapp_waba_id` AND `whatsapp_access_token` all non-null/non-empty
5. EXISTS professional with `google_calendar_id` non-null

All pass → `UPDATE clinics SET is_active = true` → `{ data: { active: true } }`

Any fail → `400`:
```json
{
  "error": "requirements_not_met",
  "missing": ["whatsapp", "google_calendar"]
}
```

**For `active: false`** — no validation, sets directly.

### `GET /api/onboarding/status`

Returns requirement status without modifying anything. Used by wizard checklist and `ClinicStatusToggle`.

```json
{
  "data": {
    "is_active": false,
    "requirements": {
      "operating_hours": true,
      "professional_schedule": true,
      "service_with_price": false,
      "whatsapp": false,
      "google_calendar": true
    }
  }
}
```

### `POST /api/integrations/whatsapp/test`

Tests WhatsApp credentials by calling the Meta API. Returns success/failure.

**Request:** `{ "phone_number_id": "...", "access_token": "..." }`

**Response:** `{ "data": { "valid": true } }` or `{ "error": "invalid_credentials" }`

---

## Guards

### WhatsApp Webhook

After resolving `clinic_id` from `phone_number_id`, check `is_active`:
- `false` → `return NextResponse.json({ status: "ok" })` without processing
- `true` → continue normal flow

### Cron Jobs

Add `WHERE clinics.is_active = true` to queries that fetch records to process. Applies to:
- `/api/cron/confirmations`
- `/api/cron/nps`
- `/api/cron/billing`
- `/api/cron/recall`
- `/api/cron/recall-send`

---

## Reused Components

| Component | Used In |
|-----------|---------|
| `CompactScheduleGrid` | Step 1 (operating hours), Step 2 (professional schedule) |
| `PatientFormDialog` | Step 5 |
| `PatientImportDialog` | Step 5 |
| Google Calendar OAuth flow | Step 4 |

## New Components

| Component | Location |
|-----------|----------|
| `ClinicStatusToggle` | `src/components/layout/clinic-status-toggle.tsx` |
| Wizard `page.tsx` | `src/app/(onboarding)/setup/page.tsx` (rewrite) |

## i18n

New keys in `messages/{pt-BR,en,es}.json`:
- Onboarding steps (titles, descriptions, labels for new fields)
- Checklist requirement labels
- Activation toggle labels and messages
- WhatsApp test connection messages
- Confirmation dialog for deactivation
