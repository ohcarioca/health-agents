# Patients Page — Design Document

**Date:** 2026-02-16
**Status:** Approved

## Overview

Add a dedicated `/patients` page for manual patient management (add, edit, delete) and batch import (CSV/XLSX). Integrate the same functionality into onboarding step 3.

## Decisions

- **Navigation:** New sidebar item between Calendar and Modules (`Users` icon)
- **Required fields:** Name + Phone only (email, DOB, CPF, notes optional)
- **Import columns:** All DB fields supported (name*, phone*, email, date_of_birth, cpf, notes)
- **Duplicate handling:** Skip duplicates (by phone per clinic), report in summary
- **Onboarding:** Replace step 3 placeholder with import + manual entry using shared components

## Page Structure

**Route:** `/patients` (inside `(dashboard)` layout)

**Components:**
- Server Component page: fetches initial paginated patient list
- Client Component `PatientsView`: interactive table with search, pagination, actions
- `PatientFormDialog`: add/edit dialog (shared with onboarding)
- `PatientImportDialog`: batch import dialog (shared with onboarding)

**Table columns:** Name, Phone (formatted), Email, CPF (masked), Last Visit, Actions (edit/delete)

**Pagination:** Server-side, 25 per page, via Supabase `.range()` + `{ count: 'exact' }`

**Search:** Debounced input, filters by name (`ilike`) or phone (`starts with`)

**Empty state:** Illustration + "No patients yet" + CTA for add/import

## Manual Add/Edit

**Dialog:** `Dialog` size="lg"

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Nome | text | yes | min 2 chars, max 200 |
| Telefone | text + mask | yes | digits-only, 10-11 chars |
| Email | text | no | valid email format |
| Data de nascimento | date | no | must be in the past |
| CPF | text + mask | no | 11 digits, valid check digits |
| Observações | textarea | no | max 1000 chars |

**Add:** POST `/api/patients`
**Edit:** PUT `/api/patients/[id]`
**Delete:** DELETE `/api/patients/[id]` — blocked if patient has appointments (409)

## Batch Import

**Dialog:** `Dialog` size="xl", three-step flow inside:

### Step 1 — Upload
- Drag-and-drop zone + browse button
- Accepts `.csv` and `.xlsx`, max 5MB
- Client-side parsing: `papaparse` (CSV), `xlsx` (XLSX)

### Step 2 — Preview & Map
- Dropdown per detected column: map to patient field or ignore
- Auto-detect by column header name
- Preview first 5 rows
- Nome and Telefone must be mapped to enable Import

### Step 3 — Results
- POST `/api/patients/batch` (max 500 rows)
- Summary: imported count, skipped (duplicates), errors (validation)
- "Download errors" CSV for failed/skipped rows

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/patients` | GET | List patients (paginated, searchable) |
| `/api/patients` | POST | Create single patient |
| `/api/patients/[id]` | PUT | Update patient |
| `/api/patients/[id]` | DELETE | Delete patient (if no appointments) |
| `/api/patients/batch` | POST | Bulk create (max 500, skip duplicates) |

## Validation

Shared Zod schema in `src/lib/validations/patients.ts`:

```
patientSchema: name (2-200), phone (10-11 digits), email?, date_of_birth?, cpf? (11 digits + check), notes? (max 1000)
patientBatchSchema: { patients: patientSchema[], min 1, max 500 }
```

Phone normalized to digits-only on client, re-stripped on server.

## Onboarding Integration

Replace step 3 placeholder with:
- Two action cards: "Importar arquivo" + "Adicionar manualmente"
- Each opens the shared dialog component
- Mini list of patients added during session
- Step remains optional (Pular / Continuar both advance)

## New Dependencies

- `papaparse` — CSV parsing
- `xlsx` — XLSX parsing (SheetJS community edition)

## Files Created/Modified

**New files:**
- `src/app/(dashboard)/patients/page.tsx` — Server Component page
- `src/app/(dashboard)/patients/loading.tsx` — Loading state
- `src/app/(dashboard)/patients/error.tsx` — Error boundary
- `src/components/patients/patients-view.tsx` — Client interactive table
- `src/components/patients/patient-form-dialog.tsx` — Add/edit dialog
- `src/components/patients/patient-import-dialog.tsx` — Batch import dialog
- `src/app/api/patients/route.ts` — GET (list) + POST (create)
- `src/app/api/patients/[id]/route.ts` — PUT + DELETE
- `src/app/api/patients/batch/route.ts` — POST bulk create
- `src/lib/validations/patients.ts` — Zod schemas

**Modified files:**
- `src/components/layout/sidebar-nav.tsx` — Add patients nav item
- `src/app/(onboarding)/setup/page.tsx` — Replace step 3
- `messages/pt-BR.json` — Add patients translations
- `messages/en.json` — Add patients translations
- `messages/es.json` — Add patients translations
