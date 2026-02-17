# Mind Care Polish — Design Document

**Date:** 2026-02-17
**Scope:** 2 targeted improvements inspired by the Mind Care reference panel

---

## 1. Dashboard: Date Picker Strip (Upcoming Schedule)

**Current:** `UpcomingAppointments` renders a plain HTML table of today's appointments.

**Target:** Replace with a Mind Care-style "Upcoming Schedule" section:

### Date Strip
- Horizontal row of 7 days (current week, Mon–Sun)
- Each date cell: short weekday label (Mon, Tue…) + day number
- Today highlighted with accent background circle
- Small colored dots below each date representing appointment count
- Left/right chevron arrows to navigate between weeks
- Clicking a date selects it and filters the appointment list below

### Appointment List
- Card-style rows replacing the table:
  - **Left:** Time in bold mono font
  - **Center:** Patient name + service name
  - **Right:** Professional name with small colored dot
  - Status indicator (subtle colored dot or badge)
- Empty state: "No appointments for this date" message

### Technical Details
- **File modified:** `src/components/dashboard/upcoming-appointments.tsx`
- State: `selectedDate` (defaults to today), `weekOffset` (for navigating weeks)
- API: same `/api/calendar/appointments` endpoint, just change `start`/`end` params to selected date
- Weekday labels: use `Intl.DateTimeFormat` (locale-aware, no new i18n keys needed)
- New i18n key: `dashboard.noAppointmentsForDate`

---

## 2. Calendar: Cleaner Toolbar Pills

**Current:** The calendar toolbar has basic buttons for view toggle (day/week/month) and navigation.

**Target:** Restyle to match Mind Care's polished pill-style controls.

### View Toggle (day/week/month)
- Pill-shaped segmented control with `rounded-full` container
- Container: subtle border, surface background
- Active tab: solid accent background, white text, `rounded-full`
- Inactive tabs: transparent background, muted text, subtle hover bg

### Navigation (prev/today/next)
- Prev/Next: ghost `rounded-full` icon buttons with subtle hover
- "Today" button: outlined pill with `rounded-full`, accent text, accent border

### Professional Filter
- Cleaner select with subtle border, `rounded-lg`, consistent height

### Technical Details
- **File modified:** `src/components/calendar/calendar-view.tsx`
- No new components — pure CSS/className changes to existing inline toolbar
- No i18n changes needed — all labels already exist
- No API changes

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/dashboard/upcoming-appointments.tsx` | Rewrite: date strip + appointment list |
| `src/components/calendar/calendar-view.tsx` | Restyle: toolbar buttons and view toggle |
| `messages/en.json` | Add: `dashboard.noAppointmentsForDate` |
| `messages/pt-BR.json` | Add: `dashboard.noAppointmentsForDate` |
| `messages/es.json` | Add: `dashboard.noAppointmentsForDate` |

**Total: 5 files, 2 logical changes**
