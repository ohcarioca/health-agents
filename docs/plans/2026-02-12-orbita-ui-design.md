# Orbita UI — Design Specification

**Date:** 2026-02-12
**Status:** Approved
**Author:** Planning session (solo dev + Claude)

---

## Design Decisions

| Decision | Choice |
|----------|--------|
| Visual mood | Dark by default + light mode toggle |
| Primary accent | Vibrant violet (violet-500/600) |
| Typography | Geist Sans + Geist Mono |
| Sidebar | Icon-only collapse (expanded/collapsed/mobile overlay) |
| Modal primitives | Radix UI (unstyled) + Tailwind |
| Charts | Recharts |
| Background effect | Subtle violet radial glow (top-left corner) |
| Icons | Lucide-react, outline, 1.75 stroke |

**Dependencies added by this spec:**
- `lucide-react` — icon set
- `@radix-ui/react-dialog` — modal/dialog primitives
- `@radix-ui/react-dropdown-menu` — dropdown menus
- `@radix-ui/react-popover` — popovers
- `@radix-ui/react-tooltip` — tooltips (collapsed sidebar)
- `recharts` — charting (Phase 10, install later)

---

## 1. Design Foundation — Color System

Semantic CSS variables in `globals.css` using Tailwind v4 `@theme inline`. Two layers: base palette + semantic tokens.

### Dark Mode (Default)

```css
:root {
  --background:         #09090b;    /* zinc-950 */
  --surface:            #18181b;    /* zinc-900 */
  --surface-elevated:   #27272a;    /* zinc-800 */
  --border:             rgba(255, 255, 255, 0.06);
  --border-strong:      rgba(255, 255, 255, 0.12);

  --text-primary:       #fafafa;    /* zinc-50 */
  --text-secondary:     #a1a1aa;    /* zinc-400 */
  --text-muted:         #71717a;    /* zinc-500 */

  --accent:             #8b5cf6;    /* violet-500 */
  --accent-hover:       #7c3aed;    /* violet-600 */
  --accent-muted:       rgba(139, 92, 246, 0.15);
  --accent-ring:        rgba(139, 92, 246, 0.40);

  --success:            #22c55e;    /* green-500 */
  --warning:            #f59e0b;    /* amber-500 */
  --danger:             #ef4444;    /* red-500 */
  --info:               #3b82f6;    /* blue-500 */
}
```

### Light Mode

```css
.light {
  --background:         #ffffff;
  --surface:            #f4f4f5;    /* zinc-100 */
  --surface-elevated:   #ffffff;
  --border:             rgba(0, 0, 0, 0.08);
  --border-strong:      rgba(0, 0, 0, 0.15);

  --text-primary:       #09090b;    /* zinc-950 */
  --text-secondary:     #52525b;    /* zinc-600 */
  --text-muted:         #a1a1aa;    /* zinc-400 */

  --accent:             #7c3aed;    /* violet-600 — darker for white bg contrast */
  --accent-hover:       #6d28d9;    /* violet-700 */
  --accent-muted:       rgba(124, 58, 237, 0.10);
  --accent-ring:        rgba(124, 58, 237, 0.30);

  /* Status colors remain the same */
}
```

### Opacity Convention

| Pattern | Dark mode | Light mode | Use |
|---------|-----------|------------|-----|
| Subtle background | `white/[0.04]` | `black/[0.03]` | Hover states |
| Border | `white/[0.06]` | `black/[0.08]` | Default borders |
| Strong border | `white/[0.12]` | `black/[0.15]` | Active/focus borders |
| Accent background | `accent/[0.15]` | `accent/[0.10]` | Status badges, active nav |
| Focus ring | `accent/[0.40]` | `accent/[0.30]` | Focus-visible rings |

### Theme Toggle

- Class `dark` (default) or `light` on `<html>`.
- Persisted to `localStorage` key `theme`.
- Initial value: respect `prefers-color-scheme`, then `localStorage` override.
- Toggle location: company menu dropdown in sidebar.

---

## 2. Typography

### Font Stack

```css
--font-sans: "Geist Sans", system-ui, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;
```

Loaded via `next/font/local` for zero CLS and automatic subsetting.

### Type Scale

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `text-xs` | 0.75rem (12px) | 400 | Badges, captions, timestamps |
| `text-sm` | 0.875rem (14px) | 400 | Body text, table cells, form labels |
| `text-base` | 1rem (16px) | 400 | Primary body, descriptions |
| `text-lg` | 1.125rem (18px) | 500 | Section titles, card headers |
| `text-xl` | 1.25rem (20px) | 600 | Page subtitles |
| `text-2xl` | 1.5rem (24px) | 600 | Page titles |
| `text-3xl` | 1.875rem (30px) | 700 | KPI numbers, hero statistics |

### Font Usage

- **Geist Sans:** all UI text (headings, body, labels, buttons).
- **Geist Mono:** monetary values (`R$ 1.500,00`), dates/times, IDs, counters, phone numbers.

### Letter Spacing

- Headings (`text-2xl`+): `-0.025em` (tighter)
- Body: `0` (default)
- Captions/badges (`text-xs`): `0.025em` (wider)

---

## 3. Icons

**Library:** `lucide-react`

| Size | Pixels | Tailwind | Use |
|------|--------|----------|-----|
| Small | 16px | `size-4` | Inline, badges, input icons |
| Default | 20px | `size-5` | Sidebar nav, buttons, table actions |
| Large | 24px | `size-6` | Empty states, feature cards |

- **Stroke width:** `1.75` (slightly thinner than default 2, more elegant)
- **Color:** inherits `currentColor` — follows `text-secondary` by default
- Active/selected icons use `text-accent`

### Import Pattern

```tsx
import { Calendar, Users, Settings } from "lucide-react";
<Calendar className="size-5 text-[var(--text-secondary)]" strokeWidth={1.75} />
```

### Navigation Icons

| Screen | Icon |
|--------|------|
| Dashboard | `LayoutDashboard` |
| Inbox | `MessageSquare` |
| Modules | `Blocks` |
| Reports | `BarChart3` |
| Team | `Users` |
| Settings | `Settings` |

---

## 4. Sidebar

### Three Modes

| Mode | Width | Trigger | Behavior |
|------|-------|---------|----------|
| Expanded | 14%–380px (min 220px) | Default on `lg+` | Icon + label, drag to resize |
| Collapsed | 64px | Toggle button or narrow `lg` | Icon only, tooltip on hover |
| Mobile overlay | 280px | `< lg` breakpoint | Full overlay with backdrop blur, swipe to dismiss |

### Layout (top to bottom)

1. **Company menu (top)**
   - Clinic logo/avatar + clinic name
   - Click opens dropdown: switch clinic (future), clinic settings shortcut, theme toggle (dark/light)

2. **Navigation items**
   - 6 fixed items (see icon table above)
   - Inbox: badge count of escalated conversations
   - **Active state:** `bg-accent-muted` + `text-accent` + 3px violet left border
   - Active detection: pathname match

3. **Locale switcher**
   - Flag emoji + code (BR / EN / ES)
   - Compact dropdown with 3 options
   - Visible only in expanded mode; in collapsed mode, accessible via company menu dropdown

4. **User menu (bottom)**
   - Avatar + name + role badge (`Owner` / `Reception`)
   - Click opens dropdown: profile, keyboard shortcuts, logout

### Resize Behavior

- Invisible drag handle on right edge (6px hitbox)
- Cursor: `col-resize` on hover
- Width persisted to `localStorage` key `sidebar-width`
- Transition: `width 200ms ease` on collapse/expand toggle
- Min width: 220px. Max width: 380px. Below min: snaps to collapsed (64px).

### Collapsed Mode

- Icons centered in 64px strip
- Hover on any icon shows Radix Tooltip with label
- Inbox badge count becomes dot indicator (red circle)
- Company menu: only logo/avatar visible
- User menu: only avatar visible

### Mobile Overlay

- Trigger: hamburger button in top-left of main content header
- Backdrop: `bg-black/60 backdrop-blur-sm`
- Sidebar slides in from left (300ms ease-out)
- Swipe left to dismiss
- All items visible as in expanded mode

---

## 5. Layout Structure

### App Shell

```
┌──────────────────────────────────────────────┐
│ [Sidebar]  │  [Main Content Area]            │
│            │                                  │
│  Logo      │  ┌─────────────────────────┐    │
│  ────────  │  │  Page Header            │    │
│  Dashboard │  │  Title + Actions        │    │
│  Inbox     │  ├─────────────────────────┤    │
│  Modules   │  │                         │    │
│  Reports   │  │  Page Content           │    │
│  Team      │  │  (scrollable)           │    │
│  Settings  │  │                         │    │
│  ────────  │  │                         │    │
│  🌐 BR     │  │                         │    │
│  ────────  │  └─────────────────────────┘    │
│  👤 User   │                                  │
└──────────────────────────────────────────────┘
```

### Background

Main content area background:
```css
background: var(--background);
background-image: radial-gradient(
  ellipse at 0% 0%,
  rgba(139, 92, 246, 0.04) 0%,
  transparent 50%
);
```

Subtle violet radial glow in top-left corner. Gives depth without distraction.

### Page Container Pattern

```tsx
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
  <PageHeader title={t("dashboard.title")} actions={...} />
  <div className="mt-6 space-y-6">
    {/* Page content */}
  </div>
</div>
```

- `max-w-7xl` (1280px) container with responsive horizontal padding
- Main content scrolls; sidebar and page header are fixed

### Page Header

- Title: `text-2xl font-semibold tracking-tight`
- Optional subtitle: `text-secondary text-sm`
- Right side: action buttons (primary + secondary)
- Optional bottom: tabs or breadcrumb navigation

### Route Groups

```
src/app/
├── (auth)/
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── layout.tsx              (centered, no sidebar)
├── (dashboard)/
│   ├── layout.tsx              (sidebar + main content shell)
│   ├── page.tsx                (dashboard home)
│   ├── inbox/page.tsx
│   ├── modules/page.tsx
│   ├── reports/page.tsx
│   ├── team/page.tsx
│   └── settings/page.tsx
└── (onboarding)/
    ├── layout.tsx              (centered, progress bar, no sidebar)
    └── setup/page.tsx
```

Each route group includes: `loading.tsx`, `error.tsx`, `not-found.tsx`.

---

## 6. Component Patterns

### Cards

```
Base card:
  bg-[var(--surface)]
  border border-[var(--border)]
  rounded-xl
  p-5

Interactive card (hover):
  hover:border-[var(--border-strong)]
  transition-colors
```

### KPI Cards

```
┌──────────────────────┐
│  📊 Label      +12%  │  ← text-sm text-secondary + trend badge
│  R$ 45.200     ▲     │  ← text-3xl font-mono font-bold
│  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  │  ← sparkline (Recharts, 48px height)
└──────────────────────┘
```

- Trend badge: `text-success` (positive), `text-danger` (negative), `text-muted` (neutral)
- Sparkline: 7-day mini chart using accent or status color
- Value: Geist Mono for numbers

### Buttons

| Variant | Style | Use |
|---------|-------|-----|
| Primary | `bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]` | Main actions (Save, Create) |
| Secondary | `bg-white/[0.06] text-[var(--text-primary)] hover:bg-white/[0.10]` | Secondary actions (Cancel, Back) |
| Ghost | `bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]` | Tertiary (icon buttons, nav items) |
| Danger | `bg-[var(--danger)]/[0.15] text-[var(--danger)] hover:bg-[var(--danger)]/[0.25]` | Destructive (Delete, Remove) |

**Common styles (all variants):**
```
rounded-lg px-4 py-2 text-sm font-medium transition-colors
focus-visible:ring-2 ring-[var(--accent-ring)] ring-offset-2 ring-offset-[var(--background)]
```

**Sizes:**
- `sm`: `px-3 py-1.5 text-xs`
- `md`: `px-4 py-2 text-sm` (default)
- `lg`: `px-6 py-3 text-base`

### Inputs

```
bg-[var(--surface)]
border border-[var(--border)]
rounded-lg
px-3 py-2
text-sm
placeholder:text-[var(--text-muted)]

focus:
  border-[var(--accent)]
  ring-2 ring-[var(--accent-ring)]
```

- Label: above the input, `text-sm font-medium text-[var(--text-primary)]`
- Error message: below the input, `text-xs text-[var(--danger)]`
- Required indicator: `*` in `text-danger` after label

### Status Badges

```
inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
```

| Status | Style |
|--------|-------|
| Active / Sent | `bg-[var(--success)]/[0.15] text-[var(--success)]` |
| Pending / Processing | `bg-[var(--warning)]/[0.15] text-[var(--warning)]` |
| Failed / Error | `bg-[var(--danger)]/[0.15] text-[var(--danger)]` |
| Escalated / Accent | `bg-[var(--accent)]/[0.15] text-[var(--accent)]` |
| Neutral / Inactive | `bg-white/[0.06] text-[var(--text-muted)]` |

### Avatars

- Shape: `rounded-full`
- Sizes: `size-8` (compact), `size-10` (default), `size-12` (profile)
- Fallback (no image): initials with `bg-[var(--accent-muted)] text-[var(--accent)]`
- Online indicator: `ring-2 ring-[var(--success)]` (optional)

---

## 7. Modals & Dialogs

**Primitive:** Radix UI `Dialog`

### Backdrop

```
bg-black/60 backdrop-blur-sm
```

### Responsive Animations

| Breakpoint | Animation | Duration |
|------------|-----------|----------|
| Desktop (`sm+`) | Scale-in: opacity 0→1, scale 0.95→1 | 200ms ease-out |
| Mobile (`< sm`) | Slide-up: opacity 0→1, translateY 100%→0 | 300ms ease-out |

### Modal Sizes

| Size | Max width | Use |
|------|-----------|-----|
| `sm` | 400px | Confirmations, simple forms |
| `md` | 500px | Standard forms, detail views |
| `lg` | 640px | Complex forms, data tables |
| `full` | 100% (mobile) | Bottom sheet on mobile |

### Modal Structure

```
┌─────────────────────────────────┐
│  Title                     ✕    │  ← header with close button
├─────────────────────────────────┤
│                                 │
│  Content (scrollable)           │  ← body
│                                 │
├─────────────────────────────────┤
│           [Cancel]  [Save]      │  ← footer with actions
└─────────────────────────────────┘
```

### Keyboard Support

- `Escape`: closes modal
- Focus trap: active while modal is open
- Initial focus: first interactive element
- Return focus: to trigger element on close

---

## 8. Loading States

### Spinner

```
animate-spin rounded-full
border-2 border-[var(--border)] border-t-[var(--accent)]
```

| Size | Tailwind | Use |
|------|----------|-----|
| Inline | `size-4` | Inside text, table cells |
| Button | `size-5` | Button loading state |
| Page | `size-8` | Full page loading |

### Skeleton Shimmer

```css
.skeleton {
  background: var(--surface);
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.04) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 0.375rem;
}
```

Used for: cards, table rows, KPI numbers, avatar placeholders, text blocks.

### Button Loading

- Spinner replaces icon (or appears left of label)
- `opacity-70 pointer-events-none` during loading
- Label changes to action-in-progress (i18n: "Salvando...", "Saving...")
- Disabled state: no hover effects

---

## 9. Feedback Messages

### Inline Banners

```
rounded-lg border px-4 py-3 text-sm
flex items-center gap-3
```

| Type | Style |
|------|-------|
| Success | `bg-[var(--success)]/[0.10] border-[var(--success)]/[0.20] text-[var(--success)]` |
| Error | `bg-[var(--danger)]/[0.10] border-[var(--danger)]/[0.20] text-[var(--danger)]` |
| Warning | `bg-[var(--warning)]/[0.10] border-[var(--warning)]/[0.20] text-[var(--warning)]` |
| Info | `bg-[var(--info)]/[0.10] border-[var(--info)]/[0.20] text-[var(--info)]` |

### Placement

- **Form feedback:** inline below submit button
- **Page-level:** top of page content area
- **Success:** auto-dismiss after 5 seconds
- **Error:** persistent until dismissed or corrected

### Icon per Type

- Success: `CheckCircle2`
- Error: `XCircle`
- Warning: `AlertTriangle`
- Info: `Info`

---

## 10. Custom Scrollbar

```css
/* Thin 6px scrollbar, almost invisible until hover */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}
```

Applied globally. Minimal visual presence, functional on hover.

---

## 11. Spacing & Grid

### Spacing Tokens

| Token | Value | Use |
|-------|-------|-----|
| `gap-1` / `p-1` | 4px | Tight: between badge text and icon |
| `gap-2` / `p-2` | 8px | Compact: between inline form elements |
| `gap-3` / `p-3` | 12px | Default: between list items |
| `gap-4` / `p-4` | 16px | Card internal padding (compact) |
| `gap-5` / `p-5` | 20px | Card padding (preferred) |
| `gap-6` / `space-y-6` | 24px | Between page sections |
| `gap-8` / `py-8` | 32px | Page top/bottom padding |

**Rule:** prefer `gap-*` (flexbox/grid) over `space-y-*`. Use `space-y-*` only for simple stack layouts.

### Responsive Grid Patterns

```tsx
// KPI cards row
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

// Content + side panel
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">{/* Main content */}</div>
  <div>{/* Side panel */}</div>
</div>

// Settings form (2 columns on tablet+)
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// Full-width single column
<div className="space-y-6">
```

### Breakpoints

| Name | Width | Key change |
|------|-------|------------|
| `sm` | 640px | Mobile landscape, 2-col grids |
| `md` | 768px | Tablet, form columns |
| `lg` | 1024px | Sidebar collapse, major layout shifts |
| `xl` | 1280px | Wide desktop, extra breathing room |

### Container

`max-w-7xl` (1280px) with `px-4 sm:px-6 lg:px-8` responsive horizontal padding.

---

## 12. i18n

### File Structure

```
messages/
├── pt-BR.json    (default locale)
├── en.json
└── es.json
```

### Organization by Domain

```json
{
  "common": {
    "save": "Salvar",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "edit": "Editar",
    "loading": "Carregando...",
    "error": "Algo deu errado"
  },
  "dashboard": {
    "title": "Painel",
    "kpi.appointments": "Consultas hoje",
    "kpi.confirmations": "Confirmacoes pendentes",
    "kpi.noShows": "Faltas",
    "kpi.nps": "NPS medio"
  },
  "inbox": { "title": "Caixa de Entrada" },
  "modules": { "title": "Modulos" },
  "reports": { "title": "Relatorios" },
  "team": { "title": "Equipe" },
  "settings": { "title": "Configuracoes" },
  "onboarding": {
    "step1.title": "Dados da Clinica",
    "step2.title": "Profissionais",
    "step3.title": "Pacientes",
    "step4.title": "WhatsApp",
    "step5.title": "Modulos"
  },
  "validation": {
    "required": "Campo obrigatorio",
    "invalidEmail": "Email invalido",
    "invalidPhone": "Telefone invalido"
  }
}
```

### Locale Switcher

- Location: sidebar (expanded mode), company menu dropdown (collapsed mode)
- Display: flag emoji + locale code (BR / EN / ES)
- Behavior: changes `locale` cookie, triggers server-side redirect
- Compact dropdown with 3 options

### Localized Formatting

| Format | pt-BR | en | es |
|--------|-------|----|----|
| Currency | R$ 1.500,00 | $1,500.00 | $1.500,00 |
| Date | 12/02/2026 | 02/12/2026 | 12/02/2026 |
| Thousands | 1.000 | 1,000 | 1.000 |

Use `Intl.DateTimeFormat` and `Intl.NumberFormat` via next-intl helpers. Never format manually.

---

## Component File Map

Planned component locations (created incrementally per phase):

```
src/components/
├── ui/                     # Primitive UI components
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   ├── avatar.tsx
│   ├── modal.tsx           # Radix Dialog wrapper
│   ├── dropdown.tsx        # Radix DropdownMenu wrapper
│   ├── tooltip.tsx         # Radix Tooltip wrapper
│   ├── spinner.tsx
│   ├── skeleton.tsx
│   └── banner.tsx          # Feedback banners
├── layout/
│   ├── sidebar.tsx
│   ├── sidebar-nav.tsx
│   ├── sidebar-company-menu.tsx
│   ├── sidebar-user-menu.tsx
│   ├── page-header.tsx
│   └── page-container.tsx
├── dashboard/
│   ├── kpi-card.tsx
│   ├── funnel-chart.tsx
│   └── alerts-list.tsx
└── shared/
    ├── locale-switcher.tsx
    └── theme-toggle.tsx
```

---

## Implementation Notes

- All colors via CSS variables — never hardcode hex in components.
- All user-facing strings via `useTranslations()` from next-intl.
- Components are Server Components by default. Add `"use client"` only when needed.
- One component per file. Props interface named `{ComponentName}Props`.
- Extract repeated patterns into components, not `@apply` abstractions.
- Mobile-first responsive: start with mobile, add `sm:`, `md:`, `lg:` overrides.
