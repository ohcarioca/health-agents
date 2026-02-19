# Dashboard Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 issues in the dashboard: revenue KPI showing wrong data, missing "confirm appointment" button, "add appointment" navigating away instead of opening modal, and appointment rows not opening edit modal.

**Architecture:** All changes are confined to `upcoming-appointments.tsx` (client component) and the dashboard server page. The `AppointmentModal` already exists in the calendar — we reuse it directly on the dashboard widget. No new components or API routes needed.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript strict, Tailwind v4, existing `AppointmentModal` + `CalendarAppointment` types.

---

## Task 1: Fix Revenue KPI

The dashboard page queries only `status = "overdue"` invoices and shows their total as "Receita". This means the card is red and shows debt, not revenue. Fix: query all statuses, use `calculateRevenueMetrics`, show paid revenue.

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Update the invoice query**

In `page.tsx`, find the `invoicesData` query (around line 81). Remove the `.eq("status", "overdue")` filter so it fetches all invoice statuses:

```ts
// BEFORE:
admin
  .from("invoices")
  .select("amount_cents, status")
  .eq("clinic_id", clinicId)
  .eq("status", "overdue"),

// AFTER:
admin
  .from("invoices")
  .select("amount_cents, status")
  .eq("clinic_id", clinicId),
```

**Step 2: Update the import and revenue calculation**

Replace the `overdueTotal` manual reduce with `calculateRevenueMetrics`:

```ts
// BEFORE import line:
import { calculateNPS, formatCents } from "@/lib/analytics/kpis";

// AFTER:
import { calculateNPS, formatCents, calculateRevenueMetrics } from "@/lib/analytics/kpis";
```

```ts
// BEFORE (lines 99-102):
const overdueTotal = (invoicesData.data || []).reduce(
  (sum: number, inv: { amount_cents: number }) => sum + inv.amount_cents,
  0,
);

// AFTER:
const revenue = calculateRevenueMetrics(
  (invoicesData.data || []).map((inv: { amount_cents: number; status: string }) => ({
    amount_cents: inv.amount_cents,
    status: inv.status,
  }))
);
```

**Step 3: Update the KPI card rendering**

```tsx
// BEFORE:
<KpiCard
  label={t("kpi.revenue")}
  value={overdueTotal > 0 ? formatCents(overdueTotal) : "\u2014"}
  icon={DollarSign}
  iconBg="rgba(239,68,68,0.15)"
  iconColor="var(--danger)"
  subtitle={overdueTotal > 0 ? "overdue" : undefined}
/>

// AFTER:
<KpiCard
  label={t("kpi.revenue")}
  value={revenue.paidCents > 0 ? formatCents(revenue.paidCents) : "\u2014"}
  icon={DollarSign}
  iconBg="rgba(16,185,129,0.15)"
  iconColor="var(--success)"
  subtitle={revenue.overdueCount > 0 ? `${revenue.overdueCount} em atraso` : undefined}
/>
```

**Step 4: Verify build compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "fix: show paid revenue on dashboard KPI instead of overdue total"
```

---

## Task 2: "Confirmar atendimento" button in appointment rows

Show a small "Confirmar" button on each appointment row **only after** `starts_at` has passed and the status is `scheduled` or `confirmed`. Clicking calls `POST /api/appointments/{id}/complete` and refreshes the list.

**Files:**
- Modify: `src/components/dashboard/upcoming-appointments.tsx`

**Step 1: Add state and imports**

At the top of the file, add `CheckCircle2` to the lucide import:

```ts
// BEFORE:
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";

// AFTER:
import { Calendar, ChevronLeft, ChevronRight, Plus, CheckCircle2 } from "lucide-react";
```

Inside the `UpcomingAppointments` component, add the `completing` state after the existing state declarations:

```ts
const [completing, setCompleting] = useState<Set<string>>(new Set());
```

**Step 2: Add the `handleComplete` function**

Add this function inside the component, before the `return`:

```ts
const handleComplete = useCallback(async (id: string, e: React.MouseEvent) => {
  e.stopPropagation();
  setCompleting((prev) => new Set(prev).add(id));
  try {
    await fetch(`/api/appointments/${id}/complete`, { method: "POST" });
    await fetchWeekAppointments();
  } finally {
    setCompleting((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
}, [fetchWeekAppointments]);
```

**Step 3: Add the confirm button inside the appointment row**

The row currently ends with a `<Badge>`. Add the confirm button **before** the Badge, with a `now` constant at the top of the component body (near `const today = new Date()`):

```ts
// After: const today = new Date();
const now = new Date();
```

Then inside the `.map((apt) => ...)` render, add the button between the content div and the Badge:

```tsx
{/* Confirm button — only visible after starts_at, for active statuses */}
{new Date(apt.starts_at) < now &&
  (apt.status === "scheduled" || apt.status === "confirmed") && (
  <button
    onClick={(e) => handleComplete(apt.id, e)}
    disabled={completing.has(apt.id)}
    title="Confirmar atendimento"
    className="shrink-0 rounded-full p-1 transition-colors"
    style={{ color: "var(--success)" }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(16,185,129,0.1)")}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
  >
    <CheckCircle2 className="size-4" />
  </button>
)}
```

**Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/dashboard/upcoming-appointments.tsx
git commit -m "feat: add confirm appointment button to dashboard upcoming list"
```

---

## Task 3: Embed AppointmentModal in dashboard widget (create + edit)

Replace the "Add New" link to `/calendar` with an inline modal. Also make each appointment row clickable to open the edit modal — same UX as the calendar page.

**Files:**
- Modify: `src/components/dashboard/upcoming-appointments.tsx`

### Step 1: Update imports

```ts
// Add to existing lucide import (already has Plus):
// (no change needed for lucide)

// Add after existing imports:
import { AppointmentModal } from "@/components/calendar/appointment-modal";
import { getProfessionalColor } from "@/lib/calendar/utils";
import type { CalendarAppointment, ProfessionalOption } from "@/components/calendar/types";
```

### Step 2: Replace local `AppointmentRow` interface with `CalendarAppointment`

Remove the entire `AppointmentRow` interface (lines 9-17). It's now replaced by `CalendarAppointment` imported from the types file.

Update every reference to `AppointmentRow` in the file to `CalendarAppointment`:
- `useState<AppointmentRow[]>` → `useState<CalendarAppointment[]>`
- `body: { data?: AppointmentRow[] }` → `body: { data?: CalendarAppointment[] }`
- The `countAppointmentsForDay` parameter type
- The `dayAppointments` useMemo type
- The `.map((apt) => ...)` callback parameter

### Step 3: Add modal state

Inside `UpcomingAppointments`, after the existing state declarations, add:

```ts
const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
const [modalOpen, setModalOpen] = useState(false);
const [editingAppointment, setEditingAppointment] = useState<CalendarAppointment | null>(null);
const [prefillDate, setPrefillDate] = useState<string | undefined>(undefined);
```

### Step 4: Add `fetchProfessionals` and call it on mount

```ts
const fetchProfessionals = useCallback(async () => {
  try {
    const res = await fetch("/api/settings/professionals");
    if (res.ok) {
      const body: { data?: { id: string; name: string }[] } = await res.json();
      setProfessionals(
        (body.data ?? []).map((p, i) => ({
          id: p.id,
          name: p.name,
          color: getProfessionalColor(i),
        }))
      );
    }
  } catch {
    // Supplementary — silently handle
  }
}, []);

useEffect(() => {
  fetchProfessionals();
}, [fetchProfessionals]);
```

### Step 5: Add modal handler functions

```ts
const handleNewAppointment = useCallback(() => {
  setEditingAppointment(null);
  setPrefillDate(selectedDate.toISOString().split("T")[0]);
  setModalOpen(true);
}, [selectedDate]);

const handleAppointmentClick = useCallback((apt: CalendarAppointment) => {
  setEditingAppointment(apt);
  setPrefillDate(undefined);
  setModalOpen(true);
}, []);
```

### Step 6: Replace "Add New" link with button

```tsx
// BEFORE:
<a
  href="/calendar"
  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
  style={{
    backgroundColor: "var(--accent)",
    color: "#fff",
  }}
>
  <Plus className="size-3.5" />
  {t("addNew")}
</a>

// AFTER:
<button
  onClick={handleNewAppointment}
  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
  style={{
    backgroundColor: "var(--accent)",
    color: "#fff",
  }}
>
  <Plus className="size-3.5" />
  {t("addNew")}
</button>
```

### Step 7: Make appointment rows clickable

The appointment row `<div>` currently has mouse hover handlers. Add `onClick` and `cursor-pointer`:

```tsx
// BEFORE:
<div
  key={apt.id}
  className="flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors"
  style={{ backgroundColor: "var(--background)" }}
  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--background)")}
>

// AFTER:
<div
  key={apt.id}
  onClick={() => handleAppointmentClick(apt)}
  className="flex cursor-pointer items-center gap-4 rounded-lg px-3 py-2.5 transition-colors"
  style={{ backgroundColor: "var(--background)" }}
  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--nav-hover-bg)")}
  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--background)")}
>
```

### Step 8: Render `AppointmentModal` at the bottom of the component

Add the modal just before the final closing `</div>` of the component return:

```tsx
<AppointmentModal
  open={modalOpen}
  onOpenChange={setModalOpen}
  appointment={editingAppointment}
  professionals={professionals}
  prefillDate={prefillDate}
  onSave={fetchWeekAppointments}
/>
```

### Step 9: Verify no TypeScript errors

```bash
npx tsc --noEmit
```
Expected: no errors.

### Step 10: Commit

```bash
git add src/components/dashboard/upcoming-appointments.tsx
git commit -m "feat: open appointment modal inline from dashboard widget"
```

---

## Final Verification

Run the dev server and manually verify all 4 changes:

```bash
npm run dev
```

Checklist:
- [ ] Revenue KPI shows green, displays paid amount (or "—" if no paid invoices), subtitle shows overdue count if any
- [ ] Past appointments with `scheduled`/`confirmed` status show a green ✓ button
- [ ] Clicking "Adicionar" on dashboard opens the appointment creation modal (not redirects)
- [ ] Clicking an appointment row opens the edit modal (same as calendar page)
- [ ] After saving/completing, the appointment list refreshes automatically
- [ ] No TypeScript errors (`npx tsc --noEmit`)
