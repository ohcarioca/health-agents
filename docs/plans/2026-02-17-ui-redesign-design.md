# UI Redesign — Clean & Minimal

**Date:** 2026-02-17
**Branch:** feature/new-ui
**Scope:** Full page-by-page UI redesign

---

## Design Direction

**Style:** Clean & minimal — white/light base, subtle card borders, lots of whitespace, soft shadows. Dark mode as a clean dark surface.
**Accent:** Violet (#7c3aed light / #8b5cf6 dark) — kept from current brand.
**Inspiration:** Mind Care reference designs (clean admin dashboards with stat cards, tables, subtle shadows).

### What Changes
- Drop glassmorphism entirely (no backdrop-filter blur, no glass tokens)
- Drop atmospheric gradients (no radial glows)
- New shadow-based depth system
- Add top header bar (search + notifications + user)
- Redesign every page layout
- Restyle all UI primitives

### What Stays
- Expandable sidebar (240px/64px)
- Light/dark theme toggle
- All page routes and behaviors
- All API integrations and data fetching
- Locale switcher (pt-BR/en/es)
- Component architecture (server/client split)

---

## 1. Design Tokens

### Light Mode

| Token | Value | Notes |
|-------|-------|-------|
| `--background` | `#f8f9fb` | Off-white base |
| `--surface` | `#ffffff` | White cards |
| `--surface-elevated` | `#ffffff` | Same as surface, differentiated by shadow |
| `--border` | `rgba(0,0,0,0.06)` | Soft borders |
| `--border-strong` | `rgba(0,0,0,0.12)` | Visible borders |
| `--text-primary` | `#1a1a2e` | Soft dark |
| `--text-secondary` | `#6b7280` | Gray-500 |
| `--text-muted` | `#9ca3af` | Gray-400 |
| `--accent` | `#7c3aed` | Violet |
| `--accent-hover` | `#6d28d9` | Deeper violet on hover |
| `--accent-muted` | `rgba(124,58,237,0.10)` | Subtle violet fill |
| `--accent-ring` | `rgba(124,58,237,0.30)` | Focus ring |
| `--success` | `#22c55e` | Green |
| `--warning` | `#f59e0b` | Amber |
| `--danger` | `#ef4444` | Red |
| `--info` | `#3b82f6` | Blue |
| `--sidebar-bg` | `#ffffff` | Solid white |
| `--topbar-bg` | `#ffffff` | Solid white |
| `--nav-active-bg` | `rgba(124,58,237,0.08)` | Violet tint on active nav |
| `--nav-active-text` | `#7c3aed` | Violet text on active nav |
| `--nav-hover-bg` | `rgba(0,0,0,0.04)` | Subtle hover |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Card shadow |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)` | Elevated shadow |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)` | Dialog shadow |

### Dark Mode

| Token | Value |
|-------|-------|
| `--background` | `#0f1117` |
| `--surface` | `#1a1d27` |
| `--surface-elevated` | `#252836` |
| `--border` | `rgba(255,255,255,0.08)` |
| `--border-strong` | `rgba(255,255,255,0.14)` |
| `--text-primary` | `#f0f0f5` |
| `--text-secondary` | `#9ca3af` |
| `--text-muted` | `#6b7280` |
| `--accent` | `#8b5cf6` |
| `--accent-hover` | `#7c3aed` |
| `--sidebar-bg` | `#141720` |
| `--topbar-bg` | `#1a1d27` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.5)` |

### Removed Tokens
- All `--glass-*` tokens
- All `--atmosphere-*` tokens
- `.glass` and `.glass-elevated` utility classes
- `.glow-accent` utility class

### New CSS Utility Classes
- `.card` — `background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-sm);`
- `.card-elevated` — same but `box-shadow: var(--shadow-md);`

---

## 2. Layout Shell

### Top Header Bar (new component)
- Fixed, full-width, `h-16`, `z-40`
- Left: spacer matching sidebar width
- Center-left: search input (rounded, magnifying glass icon, placeholder "Search...")
- Right: notification bell (with unread count dot), user avatar dropdown (name, email, settings link, logout)
- Background: `var(--topbar-bg)` with 1px bottom border
- User menu and locale/theme toggle move here from sidebar

### Sidebar (restyled)
- Width: 240px expanded / 64px collapsed
- Background: `var(--sidebar-bg)` — solid, no blur
- Top: Órbita logo + collapse toggle
- Nav items: icon + text, active = violet bg pill (`rounded-lg`), hover = subtle gray
- No bottom section (user menu, locale, theme all moved to top bar)
- Mobile: slide-over with backdrop, same as current behavior
- Collapsed: icon-only with tooltips (keep current Radix tooltip)

### Main Content
- Offset: `pt-16` (top bar) + `pl-[240px]` (sidebar) on desktop
- Background: `var(--background)`
- Page content: `max-w-7xl mx-auto px-6 py-6`

---

## 3. Dashboard Page

### Row 1 — KPI Stats
- 3-column grid of stat cards
- Each card: colored icon circle (left), metric name (small text), big mono number, delta badge (green/red arrow + percentage)
- Cards: `--surface`, `--shadow-sm`, `rounded-xl`, `p-5`
- Metrics shown:
  1. Appointments Today (violet icon)
  2. NPS Score (blue icon)
  3. Overdue Revenue (red icon)

### Row 2 — Main Content (2/3 + 1/3 grid)
**Left (2/3): Upcoming Appointments**
- Card with title "Upcoming Appointments" + "Add New" button
- Horizontal date picker strip: row of day numbers with colored dots for appointment density
- Appointments table: Service type, Patient name, Date & Time, Status badge, Type icon
- Scrollable, shows today's appointments by default

**Right (1/3): Alerts**
- Card with title "Alerts"
- Stacked alert items: icon, description, action link
- Types: detractors, overdue invoices, escalated conversations, delivery failures
- Uses existing AlertsList data source

### Row 3 — Secondary Stats
- Inline row of compact stat badges: Confirmations sent, No-shows, Escalated count
- Smaller visual weight than Row 1

---

## 4. Other Pages

### Calendar
- Keep Day/Week/Month views
- View toggle: segmented control with rounded pills
- Professional filter: cleaner dropdown with color dots
- Appointment cards: softer shadows, rounder, left color border for professional
- "New Appointment": violet primary button

### Patients
- Table wrapped in a white card with shadow
- Search inside card header with action buttons
- Hover row highlight (subtle gray)
- Rounded pill pagination
- Clean dialog styling for add/edit/import

### Inbox
- Left panel: white card, conversation rows with hover state, selected = violet left border
- Right panel: off-white chat area, clean message bubbles
- Status filter: rounded pill tabs
- Reply input: only when escalated (same behavior)

### Settings
- Tab bar: horizontal rounded pills, active = violet tint
- Content in card wrappers
- Form inputs: h-11, rounded-lg, subtle border, violet focus ring
- Operating hours grid: cleaner spacing

### Reports
- Charts in white card wrappers
- Period selector: rounded pill toggle
- Module stats: clean grid cards

### Modules
- White cards, rounded-xl, soft shadow
- Module icon in colored circle
- 3-column grid on desktop

### Team
- Horizontal member cards (avatar, info, actions)
- Role badges as subtle pills
- Invite button in page header

### Auth (Login/Signup)
- Drop glass card, use white card with shadow on off-white background
- Taller, rounder form inputs
- Violet primary CTA, outlined Google button

### Onboarding
- Same stepper, new card styling
- Violet gradient progress bar
- White card surfaces

---

## 5. UI Primitives Changes

| Component | Changes |
|-----------|---------|
| Button | `rounded-lg`, taller (`h-10`/`h-11`), drop glow, solid colors |
| Card | Drop glass variants, one variant: white surface + shadow + rounded-xl |
| Input | Taller, `rounded-lg`, subtle border, violet focus ring |
| Badge | Softer backgrounds, rounder pills |
| Dialog | Drop glass, white surface + shadow-lg + rounded-2xl |
| Skeleton | Lighter pulse color |
| Avatar | Keep as-is, ensure sizing consistency |
| Spinner | Keep as-is |

---

## 6. Files Affected

### Core (tokens + layout)
- `src/app/globals.css` — full token rewrite
- `src/components/layout/sidebar.tsx` — restyle
- `src/components/layout/sidebar-nav.tsx` — restyle active/hover states
- `src/components/layout/sidebar-user-menu.tsx` — remove (moved to top bar)
- `src/components/layout/top-bar.tsx` — NEW component
- `src/components/layout/page-container.tsx` — adjust spacing
- `src/components/layout/page-header.tsx` — restyle
- `src/app/(dashboard)/layout.tsx` — integrate top bar, adjust offsets
- `src/app/(auth)/layout.tsx` — drop glass, use card styling

### UI Primitives
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/skeleton.tsx`

### Dashboard
- `src/app/(dashboard)/page.tsx` — new layout with KPIs + appointments table + alerts
- `src/components/dashboard/kpi-card.tsx` — restyle
- `src/components/dashboard/alerts-list.tsx` — restyle

### Calendar
- `src/components/calendar/calendar-view.tsx` — restyle toolbar
- `src/components/calendar/appointment-card.tsx` — restyle
- `src/components/calendar/appointment-modal.tsx` — dialog restyle
- `src/components/calendar/week-view.tsx` — restyle
- `src/components/calendar/day-view.tsx` — restyle
- `src/components/calendar/month-view.tsx` — restyle

### Patients
- `src/components/patients/patients-view.tsx` — card wrapper, table restyle
- `src/components/patients/patient-form-dialog.tsx` — dialog restyle
- `src/components/patients/patient-import-dialog.tsx` — dialog restyle

### Inbox
- `src/components/inbox/conversation-list.tsx` — restyle
- `src/components/inbox/conversation-detail.tsx` — restyle
- `src/components/inbox/message-bubble.tsx` — restyle

### Settings
- `src/components/settings/clinic-form.tsx` — form restyle
- `src/components/settings/professionals-list.tsx` — restyle
- `src/components/settings/services-list.tsx` — restyle
- `src/components/settings/insurance-plans-list.tsx` — restyle
- `src/app/(dashboard)/settings/page.tsx` — tab bar restyle

### Reports
- `src/components/reports/appointment-chart.tsx` — card wrapper
- `src/components/reports/nps-chart.tsx` — card wrapper
- `src/components/reports/revenue-chart.tsx` — card wrapper
- `src/components/reports/period-selector.tsx` — pill restyle

### Other pages
- `src/app/(dashboard)/modules/page.tsx` — card restyle
- `src/components/team/team-content.tsx` — layout restyle
- `src/app/(onboarding)/setup/page.tsx` — card/progress restyle
- `src/app/(onboarding)/layout.tsx` — drop atmospheric bg
- `src/app/(auth)/login/page.tsx` — form restyle
- `src/app/(auth)/signup/page.tsx` — form restyle

### Shared
- `src/components/shared/theme-toggle.tsx` — move to top bar context
- `src/components/shared/locale-switcher.tsx` — move to top bar context
