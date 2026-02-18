# Payments Page Design

## Overview

Full management page for clinic owners to view, create, and manage invoices and payment links. Accessible at `/payments` in the authenticated dashboard.

## Approach

Single client component pattern (matches PatientsView). Server Component page fetches initial data, passes to `PaymentsView` client component that manages KPIs, filters, table, slide-over panel, and create dialog.

## Page Layout

### KPI Cards (top)

4 cards using existing `calculateRevenueMetrics()` from `kpis.ts`:

| Card | Value | Icon | Color |
|------|-------|------|-------|
| Pendente | Sum pending (formatCents) | Clock | accent |
| Vencido | Sum overdue (formatCents) | AlertTriangle | danger |
| Recebido | Sum paid this month (formatCents) | CheckCircle | success |
| Taxa de conversão | paid/(paid+pending+overdue) % | TrendingUp | accent |

### Filters

- **Search:** patient name, debounced 300ms
- **Status:** All / Pending / Overdue / Paid / Cancelled
- **Period:** This month / Last 30 days / Last 90 days / All time

### Table Columns

| Column | Content |
|--------|---------|
| Patient | Name + phone |
| Amount | `formatCents(amount_cents)` |
| Due Date | Formatted, red if overdue |
| Status | Badge (pending=warning, overdue=danger, paid=success, cancelled=neutral) |
| Payment Method | Pix/Boleto/Card icon from payment_links |
| Actions | Menu: view, send link, mark paid, cancel |

Pagination: 25 per page.

### Slide-over Detail Panel

Right-side panel on row click:

1. **Invoice info** — patient, amount, due date, status, notes
2. **Payment links** — existing links (method, status, date, copyable URL)
3. **Actions** — generate Pix/Boleto/Card link, mark paid, cancel
4. **Activity timeline** — message_queue entries + status changes

### Create Invoice Dialog

Modal with fields:
- Patient (searchable autocomplete via `/api/calendar/patients/search`)
- Amount (currency input, stored as cents)
- Due date (date picker)
- Notes (optional, max 500 chars)
- Appointment (optional link)

## API Changes

### Enhanced: `GET /api/invoices`

- Add `search` param (patient name join)
- Add `period` param (date range filter)
- Return patient name + phone (join)
- Return payment_links (join)
- Return pagination (count)

### New: `GET /api/invoices/[id]`

Single invoice with payment links and related message_queue entries.

### New: `PUT /api/invoices/[id]`

Update status (mark paid, cancel), amount, due date, notes.

### New: `POST /api/invoices/[id]/payment-link`

Generate Asaas payment link for specific method (pix/boleto/credit_card).

## File Structure

```
src/app/(dashboard)/payments/
  page.tsx                          # Server Component

src/components/payments/
  payments-view.tsx                 # Main client component
  invoice-detail-panel.tsx          # Slide-over panel
  create-invoice-dialog.tsx         # Modal form
  invoice-status-badge.tsx          # Status badge
  payment-method-icon.tsx           # Pix/Boleto/Card icon

src/app/api/invoices/
  route.ts                          # Enhanced GET + existing POST
  [id]/
    route.ts                        # GET + PUT
    payment-link/
      route.ts                      # POST

messages/{locale}.json              # New "payments" namespace
```

## Navigation

New sidebar item between "Patients" and "Modules":
- Icon: `CreditCard` from lucide-react
- Label key: `nav.payments`
- Route: `/payments`
