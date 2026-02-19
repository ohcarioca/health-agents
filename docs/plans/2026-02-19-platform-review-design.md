# Platform Review — Security, Performance, Usability

**Date:** 2026-02-19
**Approach:** Critical Sweep — fix only critical/high items from all 3 areas in one sprint.

---

## Audit Summary

| Area | Issues Found | Critical | High | Medium |
|------|-------------|----------|------|--------|
| Security | 15 | 2 | 3 | 5 |
| Performance | 30 | 4 | 6 | 15 |
| Usability | 35+ | 3 | 4 | 15+ |

---

## Section 1: Security Fixes

### 1.1 Rate Limiting (Critical)

**Problem:** Zero rate limiting on any endpoint. Healthcare data = high-value target.

**Solution:** Upstash Redis via `@upstash/ratelimit`.

- New file: `src/lib/rate-limit.ts`
- Two tiers:
  - **Standard** (authenticated routes): 60 req/min per user ID
  - **Strict** (auth/signup, payment links): 10 req/min per IP
- Inline check at top of each POST/PUT/DELETE route handler
- No middleware — explicit per-route, skippable for cron/webhook routes

### 1.2 Sensitive Data Exposure (Critical)

| File | Issue | Fix |
|------|-------|-----|
| `api/public/clinics/[slug]/route.ts` | Exposes `whatsapp_phone_number_id` | Remove from response |
| `api/invoices/route.ts` | Unmasked CPF in list | Mask to `***.***.***-XX` |
| `api/invoices/[id]/route.ts` | Unmasked CPF + `asaas_customer_id` | Mask CPF, remove Asaas ID |

### 1.3 Server-Only Guard (Medium)

Add `import "server-only"` to `src/lib/supabase/server.ts` line 1.

### 1.4 Security Headers (Medium)

Add to `next.config.ts` `headers()`:
- `Content-Security-Policy`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 1.5 Google Calendar State Signing (Medium)

- Sign OAuth `state` with HMAC-SHA256 using server secret before redirect
- Verify signature on callback, reject if tampered

---

## Section 2: Performance Fixes

### 2.1 Batch Cron Queries (Critical)

**Problem:** Confirmations cron = 4 queries per entry. 100 entries = 400+ queries.

**Solution:** Refactor `/api/cron/confirmations/route.ts`:
1. Fetch all pending entries in one query
2. Collect unique IDs
3. Batch-fetch appointments, patients, professionals, clinics in 4 parallel queries
4. Match in memory via `Map<id, entity>`

Same pattern for `/api/cron/recall/route.ts`.

**Impact:** 400+ queries → 5 queries per cron run.

### 2.2 Cache Headers on Dashboard/Reports (Critical)

| Route | Cache-Control |
|-------|--------------|
| `/api/dashboard/kpis` | `private, max-age=60` |
| `/api/reports/overview` | `private, max-age=300` |
| `/api/dashboard/alerts` | `private, max-age=30` |

### 2.3 Async Calendar Sync (Critical)

Move Google Calendar sync into `after()` in both appointment POST routes:
- `api/calendar/appointments/route.ts`
- `api/appointments/route.ts`

Return DB-created appointment immediately, sync calendar in background.

### 2.4 Extract Shared `getClinicId()` (High)

Create `src/lib/auth/get-clinic-id.ts`:
- Returns `{ clinicId }` on success, `{ error: Response }` on failure
- Replace 15+ duplicate inline definitions

### 2.5 Selective Field Fetching (High)

Add explicit `.select()` to heaviest queries:
- Invoice list/detail
- Calendar appointments
- Inbox conversations

---

## Section 3: Usability Fixes

### 3.1 Missing Error Boundaries (Critical)

Add `error.tsx` to 7 routes:
- `(dashboard)/inbox`
- `(dashboard)/modules`
- `(dashboard)/payments`
- `(dashboard)/reports`
- `(dashboard)/settings`
- `(dashboard)/team`
- `(dashboard)/public-page`

Follow existing pattern from `(dashboard)/error.tsx`.

### 3.2 Hardcoded Portuguese Strings (Critical)

**23+ instances across 8 components.** Affected files:
- `patients/patients-view.tsx` (4)
- `payments/invoice-detail-panel.tsx` (1)
- `payments/payments-view.tsx` (1)
- `settings/insurance-plans-list.tsx` (2)
- `settings/professional-form.tsx` (2 — locale ternary anti-pattern)
- `settings/professionals-list.tsx` (2)
- `settings/services-list.tsx` (3 — locale ternary anti-pattern)
- `team/team-content.tsx` (1)

**Fix:** Add `common` namespace keys to all 3 locale files. Replace all hardcoded strings and kill the `t("name") === "Nome"` pattern.

### 3.3 Toast Notification System (High)

Install `sonner` (~3KB):
- Add `<Toaster />` to root layout
- Replace all `alert()` with `toast.error()` / `toast.success()`
- Add success toasts to forms that close silently

### 3.4 Form Submit Button Spinners (High)

Update all submit buttons to use existing `<Button loading={saving}>` prop instead of `"..."` text.

---

## Out of Scope (Medium — Future Sprint)

- Accessibility: aria-labels, combobox roles, Dialog focus management
- Virtualization: react-window for calendar large lists
- React.memo on list item components
- Suspense boundaries for granular loading
- Column sorting in data tables
- Mobile card view fallback for tables
- Skeleton screens
- Breadcrumb navigation
- Debounce on rapid form submissions
