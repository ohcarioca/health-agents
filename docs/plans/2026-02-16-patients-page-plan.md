# Patients Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated `/patients` page with manual CRUD, batch CSV/XLSX import, and onboarding integration.

**Architecture:** New `/patients` route with Server Component page + Client interactive table. Shared `PatientFormDialog` and `PatientImportDialog` components reused in onboarding step 3. API routes follow existing patterns (`getClinicId()` + admin client + Zod validation). Client-side file parsing with `papaparse` (CSV) and `xlsx` (XLSX), server-side validation and bulk insert.

**Tech Stack:** Next.js App Router, React 19, Supabase, Zod, papaparse, xlsx, next-intl, Tailwind v4

**Design doc:** `docs/plans/2026-02-16-patients-page-design.md`

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install papaparse and xlsx**

```bash
npm install papaparse xlsx
npm install -D @types/papaparse
```

**Step 2: Verify installation**

```bash
npm ls papaparse xlsx
```

Expected: both packages listed without errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse and xlsx dependencies for patient import"
```

---

## Task 2: Zod validation schemas

**Files:**
- Create: `src/lib/validations/patients.ts`

**Step 1: Write the validation schemas**

```ts
import { z } from "zod";

// Brazilian CPF check-digit validation
function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all same digits

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(cpf[10]);
}

export const createPatientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(10).max(11)),
  email: z.string().email().optional().or(z.literal("")),
  date_of_birth: z
    .string()
    .date()
    .refine((d) => new Date(d) < new Date(), { message: "Must be in the past" })
    .optional()
    .or(z.literal("")),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().length(11).refine(isValidCpf, { message: "Invalid CPF" }))
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const updatePatientSchema = createPatientSchema.partial();

export const batchPatientSchema = z.object({
  patients: z.array(createPatientSchema).min(1).max(500),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type BatchPatientInput = z.infer<typeof batchPatientSchema>;
```

**Step 2: Commit**

```bash
git add src/lib/validations/patients.ts
git commit -m "feat: add patient zod validation schemas with CPF check"
```

---

## Task 3: Patient API routes — GET (list) + POST (create)

**Files:**
- Create: `src/app/api/patients/route.ts`

**Reference pattern:** `src/app/api/settings/professionals/route.ts` (same `getClinicId()` + admin client pattern)

**Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPatientSchema } from "@/lib/validations/patients";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return membership.clinic_id as string;
}

const PER_PAGE = 25;

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const q = searchParams.get("q")?.trim();

  const admin = createAdminClient();
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  let query = admin
    .from("patients")
    .select("id, name, phone, email, cpf, date_of_birth, notes, last_visit_at, created_at", {
      count: "exact",
    })
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q && q.length >= 2) {
    const isPhoneSearch = /^\d+$/.test(q);
    if (isPhoneSearch) {
      query = query.like("phone", `${q}%`);
    } else {
      query = query.ilike("name", `%${q}%`);
    }
  }

  const { data: patients, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patients, count });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, phone, email, date_of_birth, cpf, notes } = parsed.data;

  const admin = createAdminClient();
  const { data: patient, error } = await admin
    .from("patients")
    .insert({
      clinic_id: clinicId,
      name,
      phone,
      email: email || null,
      date_of_birth: date_of_birth || null,
      cpf: cpf || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    // Unique constraint violation — duplicate phone
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_phone" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patient }, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/patients/route.ts
git commit -m "feat: add patient list and create API routes"
```

---

## Task 4: Patient API routes — PUT + DELETE

**Files:**
- Create: `src/app/api/patients/[id]/route.ts`

**Reference pattern:** `src/app/api/settings/professionals/[id]/route.ts`

**Step 1: Write the route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePatientSchema } from "@/lib/validations/patients";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return membership.clinic_id as string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updatePatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updateData: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) updateData.name = d.name;
  if (d.phone !== undefined) updateData.phone = d.phone;
  if (d.email !== undefined) updateData.email = d.email || null;
  if (d.date_of_birth !== undefined) updateData.date_of_birth = d.date_of_birth || null;
  if (d.cpf !== undefined) updateData.cpf = d.cpf || null;
  if (d.notes !== undefined) updateData.notes = d.notes || null;

  const admin = createAdminClient();
  const { data: patient, error } = await admin
    .from("patients")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_phone" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patient });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Check if patient has any appointments
  const { count } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "has_appointments", count },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("patients")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id } });
}
```

**Step 2: Commit**

```bash
git add src/app/api/patients/[id]/route.ts
git commit -m "feat: add patient update and delete API routes"
```

---

## Task 5: Batch import API route

**Files:**
- Create: `src/app/api/patients/batch/route.ts`

**Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPatientSchema } from "@/lib/validations/patients";
import { z } from "zod";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return membership.clinic_id as string;
}

const batchRequestSchema = z.object({
  patients: z.array(z.unknown()).min(1).max(500),
});

interface ImportError {
  row: number;
  phone?: string;
  reason: string;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const outerParsed = batchRequestSchema.safeParse(body);
  if (!outerParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: outerParsed.error.flatten() },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate each row individually, collect errors
  const validRows: Array<{
    clinic_id: string;
    name: string;
    phone: string;
    email: string | null;
    date_of_birth: string | null;
    cpf: string | null;
    notes: string | null;
  }> = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < outerParsed.data.patients.length; i++) {
    const parsed = createPatientSchema.safeParse(outerParsed.data.patients[i]);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldErrors = Object.entries(flat.fieldErrors)
        .map(([k, v]) => `${k}: ${v?.[0]}`)
        .join("; ");
      errors.push({
        row: i + 1,
        reason: fieldErrors || "Validation failed",
      });
      continue;
    }

    const { name, phone, email, date_of_birth, cpf, notes } = parsed.data;
    validRows.push({
      clinic_id: clinicId,
      name,
      phone,
      email: email || null,
      date_of_birth: date_of_birth || null,
      cpf: cpf || null,
      notes: notes || null,
    });
  }

  if (validRows.length === 0) {
    return NextResponse.json({
      data: { imported: 0, skipped: [], errors },
    });
  }

  // Fetch existing phones to identify duplicates before insert
  const phones = validRows.map((r) => r.phone);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("patients")
    .select("phone")
    .eq("clinic_id", clinicId)
    .in("phone", phones);

  const existingPhones = new Set((existing ?? []).map((p) => p.phone));

  const toInsert = [];
  const skipped: Array<{ phone: string; reason: string }> = [];

  // Also track phones within the batch to skip intra-batch duplicates
  const seenPhones = new Set<string>();

  for (const row of validRows) {
    if (existingPhones.has(row.phone)) {
      skipped.push({ phone: row.phone, reason: "duplicate" });
    } else if (seenPhones.has(row.phone)) {
      skipped.push({ phone: row.phone, reason: "duplicate_in_batch" });
    } else {
      seenPhones.add(row.phone);
      toInsert.push(row);
    }
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error } = await admin
      .from("patients")
      .insert(toInsert)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    imported = inserted?.length ?? 0;
  }

  return NextResponse.json({
    data: { imported, skipped, errors },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/patients/batch/route.ts
git commit -m "feat: add batch patient import API route"
```

---

## Task 6: i18n translations for patients

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add patients translations to all three locales**

Add the following `"patients"` key at the top level of each locale file, and add `"nav.patients"` to the nav section.

**pt-BR additions:**

In `nav` section, add:
```json
"patients": "Pacientes"
```

New top-level section:
```json
"patients": {
  "title": "Pacientes",
  "add": "Adicionar paciente",
  "edit": "Editar paciente",
  "import": "Importar",
  "count": "{count} pacientes",
  "empty": "Nenhum paciente cadastrado",
  "emptyHint": "Adicione pacientes manualmente ou importe de um arquivo CSV/XLSX.",
  "searchPlaceholder": "Buscar por nome ou telefone...",
  "name": "Nome",
  "phone": "Telefone",
  "email": "Email",
  "dateOfBirth": "Data de nascimento",
  "cpf": "CPF",
  "notes": "Observações",
  "lastVisit": "Última visita",
  "actions": "Ações",
  "deleteConfirm": "Tem certeza que deseja excluir este paciente?",
  "deleteError": "Falha ao excluir paciente",
  "deleteBlocked": "Este paciente possui {count} consultas e não pode ser excluído.",
  "saveError": "Falha ao salvar paciente",
  "saveSuccess": "Paciente salvo",
  "duplicatePhone": "Já existe um paciente com este telefone",
  "invalidCpf": "CPF inválido",
  "import": "Importar",
  "importTitle": "Importar pacientes",
  "importUpload": "Arraste um arquivo CSV ou XLSX aqui",
  "importBrowse": "ou clique para selecionar",
  "importMaxSize": "Máximo 5MB",
  "importMapping": "Mapeamento de colunas",
  "importPreview": "Prévia",
  "importIgnore": "(ignorar)",
  "importRequired": "Mapeie pelo menos Nome e Telefone",
  "importButton": "Importar",
  "importImporting": "Importando...",
  "importResults": "Resultado da importação",
  "importImported": "{count} importados",
  "importSkipped": "{count} ignorados (duplicados)",
  "importErrors": "{count} erros",
  "importDownloadErrors": "Baixar erros (CSV)",
  "importDone": "Concluir",
  "previous": "Anterior",
  "nextPage": "Próxima",
  "page": "Página {page} de {total}"
}
```

Also update `onboarding.step3`:
```json
"step3": {
  "title": "Pacientes",
  "description": "Adicione seus pacientes para começar a usar a plataforma.",
  "importCard": "Importar arquivo",
  "importCardHint": "CSV ou XLSX",
  "addCard": "Adicionar manualmente",
  "addCardHint": "Um por vez",
  "addedCount": "{count} pacientes adicionados",
  "skipHint": "Você pode pular e adicionar depois."
}
```

**en additions:**

In `nav` section, add:
```json
"patients": "Patients"
```

New top-level section:
```json
"patients": {
  "title": "Patients",
  "add": "Add patient",
  "edit": "Edit patient",
  "import": "Import",
  "count": "{count} patients",
  "empty": "No patients registered",
  "emptyHint": "Add patients manually or import from a CSV/XLSX file.",
  "searchPlaceholder": "Search by name or phone...",
  "name": "Name",
  "phone": "Phone",
  "email": "Email",
  "dateOfBirth": "Date of birth",
  "cpf": "CPF",
  "notes": "Notes",
  "lastVisit": "Last visit",
  "actions": "Actions",
  "deleteConfirm": "Are you sure you want to delete this patient?",
  "deleteError": "Failed to delete patient",
  "deleteBlocked": "This patient has {count} appointments and cannot be deleted.",
  "saveError": "Failed to save patient",
  "saveSuccess": "Patient saved",
  "duplicatePhone": "A patient with this phone already exists",
  "invalidCpf": "Invalid CPF",
  "importTitle": "Import patients",
  "importUpload": "Drag a CSV or XLSX file here",
  "importBrowse": "or click to browse",
  "importMaxSize": "Maximum 5MB",
  "importMapping": "Column mapping",
  "importPreview": "Preview",
  "importIgnore": "(ignore)",
  "importRequired": "Map at least Name and Phone",
  "importButton": "Import",
  "importImporting": "Importing...",
  "importResults": "Import results",
  "importImported": "{count} imported",
  "importSkipped": "{count} skipped (duplicates)",
  "importErrors": "{count} errors",
  "importDownloadErrors": "Download errors (CSV)",
  "importDone": "Done",
  "previous": "Previous",
  "nextPage": "Next",
  "page": "Page {page} of {total}"
}
```

Also update `onboarding.step3`:
```json
"step3": {
  "title": "Patients",
  "description": "Add your patients to start using the platform.",
  "importCard": "Import file",
  "importCardHint": "CSV or XLSX",
  "addCard": "Add manually",
  "addCardHint": "One at a time",
  "addedCount": "{count} patients added",
  "skipHint": "You can skip and add later."
}
```

**es additions:**

In `nav` section, add:
```json
"patients": "Pacientes"
```

New top-level section:
```json
"patients": {
  "title": "Pacientes",
  "add": "Agregar paciente",
  "edit": "Editar paciente",
  "import": "Importar",
  "count": "{count} pacientes",
  "empty": "Ningún paciente registrado",
  "emptyHint": "Agregue pacientes manualmente o importe de un archivo CSV/XLSX.",
  "searchPlaceholder": "Buscar por nombre o teléfono...",
  "name": "Nombre",
  "phone": "Teléfono",
  "email": "Email",
  "dateOfBirth": "Fecha de nacimiento",
  "cpf": "CPF",
  "notes": "Observaciones",
  "lastVisit": "Última visita",
  "actions": "Acciones",
  "deleteConfirm": "¿Está seguro que desea eliminar este paciente?",
  "deleteError": "Error al eliminar paciente",
  "deleteBlocked": "Este paciente tiene {count} consultas y no puede ser eliminado.",
  "saveError": "Error al guardar paciente",
  "saveSuccess": "Paciente guardado",
  "duplicatePhone": "Ya existe un paciente con este teléfono",
  "invalidCpf": "CPF inválido",
  "importTitle": "Importar pacientes",
  "importUpload": "Arrastre un archivo CSV o XLSX aquí",
  "importBrowse": "o haga clic para seleccionar",
  "importMaxSize": "Máximo 5MB",
  "importMapping": "Mapeo de columnas",
  "importPreview": "Vista previa",
  "importIgnore": "(ignorar)",
  "importRequired": "Mapee al menos Nombre y Teléfono",
  "importButton": "Importar",
  "importImporting": "Importando...",
  "importResults": "Resultado de importación",
  "importImported": "{count} importados",
  "importSkipped": "{count} ignorados (duplicados)",
  "importErrors": "{count} errores",
  "importDownloadErrors": "Descargar errores (CSV)",
  "importDone": "Listo",
  "previous": "Anterior",
  "nextPage": "Siguiente",
  "page": "Página {page} de {total}"
}
```

Also update `onboarding.step3`:
```json
"step3": {
  "title": "Pacientes",
  "description": "Agregue sus pacientes para comenzar a usar la plataforma.",
  "importCard": "Importar archivo",
  "importCardHint": "CSV o XLSX",
  "addCard": "Agregar manualmente",
  "addCardHint": "Uno a la vez",
  "addedCount": "{count} pacientes agregados",
  "skipHint": "Puede omitir y agregar después."
}
```

**Step 2: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add patient page i18n translations for all locales"
```

---

## Task 7: Sidebar navigation — add Patients item

**Files:**
- Modify: `src/components/layout/sidebar-nav.tsx`

**Step 1: Add the patients nav item**

Add `UserRound` to the lucide-react import (line 7 area). Then add a new entry to `NAV_ITEMS` between calendar (index 2) and modules (index 3):

```ts
{ href: "/patients", icon: UserRound, labelKey: "nav.patients" },
```

The `Users` icon is already imported for `team`. Use `UserRound` for patients to differentiate.

Full updated `NAV_ITEMS`:
```ts
const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/inbox", icon: MessageSquare, labelKey: "nav.inbox" },
  { href: "/calendar", icon: CalendarDays, labelKey: "nav.calendar" },
  { href: "/patients", icon: UserRound, labelKey: "nav.patients" },
  { href: "/modules", icon: Blocks, labelKey: "nav.modules" },
  { href: "/reports", icon: BarChart3, labelKey: "nav.reports" },
  { href: "/team", icon: Users, labelKey: "nav.team" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;
```

**Step 2: Commit**

```bash
git add src/components/layout/sidebar-nav.tsx
git commit -m "feat: add patients to sidebar navigation"
```

---

## Task 8: Patient form dialog (shared component)

**Files:**
- Create: `src/components/patients/patient-form-dialog.tsx`

**Step 1: Write the component**

This is a `"use client"` component that renders a form inside a `Dialog` for both adding and editing patients. It accepts an optional `patient` prop (edit mode) and `onSuccess`/`onCancel` callbacks.

Key behaviors:
- Phone field: strip non-digits on display, show formatted (e.g. `(11) 98765-0001`)
- CPF field: show formatted (e.g. `123.456.789-00`)
- Client-side Zod validation on submit, show per-field errors
- POST to `/api/patients` (add) or PUT to `/api/patients/{id}` (edit)
- Handle 409 duplicate_phone error with specific message
- On success: call `onSuccess()` callback

Props interface:
```ts
interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    date_of_birth: string | null;
    notes: string | null;
  };
  onSuccess: () => void;
}
```

Use `Dialog` with `size="lg"`. Use `Input` component for all fields. Use `Button` for submit.

All user-facing strings via `useTranslations("patients")`.

**Step 2: Commit**

```bash
git add src/components/patients/patient-form-dialog.tsx
git commit -m "feat: add patient form dialog component"
```

---

## Task 9: Patient import dialog (shared component)

**Files:**
- Create: `src/components/patients/patient-import-dialog.tsx`

**Step 1: Write the component**

This is a `"use client"` component with a 3-step flow inside a `Dialog` (size="xl"):

**Step 1 — Upload:**
- Drag-and-drop div with `onDragOver`/`onDrop` + hidden file input
- Accept `.csv` and `.xlsx` only
- Max 5MB check on client
- On file: use `Papa.parse()` for CSV (with `header: true`), `XLSX.read()` for XLSX
- Extract `headers: string[]` and `rows: Record<string, string>[]`
- Move to step 2

**Step 2 — Preview & Map:**
- State: `columnMap: Record<string, string>` mapping file header → patient field
- Patient field options: `name`, `phone`, `email`, `date_of_birth`, `cpf`, `notes`, `""` (ignore)
- Auto-detect: match header names case-insensitively against known patterns:
  - `nome|name|paciente|patient` → `name`
  - `telefone|phone|celular|mobile|whatsapp` → `phone`
  - `email|e-mail` → `email`
  - `nascimento|birth|data_nascimento|date_of_birth|dob` → `date_of_birth`
  - `cpf|documento|document` → `cpf`
  - `notas|notes|observ` → `notes`
- Show dropdowns for each detected column
- Show first 5 rows as preview table below
- "Import" button enabled only if `name` and `phone` are mapped

**Step 3 — Results:**
- Transform rows using column map, POST to `/api/patients/batch`
- Show result: imported, skipped, errors counts
- "Download errors" button: generate CSV from errors + skipped rows
- "Done" button closes dialog

All user-facing strings via `useTranslations("patients")`.

**Step 2: Commit**

```bash
git add src/components/patients/patient-import-dialog.tsx
git commit -m "feat: add patient import dialog with CSV/XLSX support"
```

---

## Task 10: Patients page — Server Component + Client view

**Files:**
- Create: `src/app/(dashboard)/patients/page.tsx`
- Create: `src/app/(dashboard)/patients/loading.tsx`
- Create: `src/app/(dashboard)/patients/error.tsx`
- Create: `src/components/patients/patients-view.tsx`

**Step 1: Write loading.tsx**

Follow calendar loading pattern:
```tsx
export default function PatientsLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );
}
```

**Step 2: Write error.tsx**

Follow calendar error pattern:
```tsx
"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function PatientsError({ reset }: { reset: () => void }) {
  const t = useTranslations("common");

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4">
      <p style={{ color: "var(--text-secondary)" }}>{t("error")}</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}
```

**Step 3: Write patients-view.tsx (Client Component)**

This is the main interactive component. It manages:
- Patient list state (fetched from API)
- Search input (debounced 300ms)
- Pagination (page state, total count from API)
- PatientFormDialog open/close state (add vs edit)
- PatientImportDialog open/close state
- Delete action with confirmation

Layout:
- Top bar: search input (left), Import button + Add button (right)
- Patient count summary
- Table with columns: Name, Phone (formatted), Email, CPF (masked `***.***.XXX-XX`), Last Visit (formatted date or "—"), Actions (edit pencil + delete trash)
- Pagination: Previous / Page X of Y / Next
- Empty state when no patients

Props interface:
```ts
interface PatientsViewProps {
  initialPatients: PatientRow[];
  initialCount: number;
}
```

Where `PatientRow` is:
```ts
interface PatientRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  date_of_birth: string | null;
  notes: string | null;
  last_visit_at: string | null;
  created_at: string;
}
```

Use `useTranslations("patients")` for all strings. Use `Button`, `Card`, `Input` from UI components.

Format phone: `(XX) XXXXX-XXXX` for 11 digits, `(XX) XXXX-XXXX` for 10.
Mask CPF: show only last 6 digits — `***.***.XXX-XX`.

**Step 4: Write page.tsx (Server Component)**

Follow calendar page pattern:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PatientsView } from "@/components/patients/patients-view";

const PER_PAGE = 25;

export default async function PatientsPage() {
  const t = await getTranslations("patients");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/login");
  const clinicId = membership.clinic_id as string;

  const { data: patients, count } = await admin
    .from("patients")
    .select("id, name, phone, email, cpf, date_of_birth, notes, last_visit_at, created_at", {
      count: "exact",
    })
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(0, PER_PAGE - 1);

  return (
    <div>
      <h1
        className="mb-6 text-xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {t("title")}
      </h1>
      <PatientsView
        initialPatients={patients ?? []}
        initialCount={count ?? 0}
      />
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add src/app/(dashboard)/patients/ src/components/patients/patients-view.tsx
git commit -m "feat: add patients page with search, pagination, and CRUD"
```

---

## Task 11: Onboarding step 3 integration

**Files:**
- Modify: `src/app/(onboarding)/setup/page.tsx`

**Step 1: Update onboarding step 3**

Replace the current step 3 placeholder (lines 145-153) with:

1. Import `PatientFormDialog` and `PatientImportDialog` from `@/components/patients/`
2. Add state: `addDialogOpen`, `importDialogOpen`, `addedPatients` (array of `{ name, phone }`)
3. Render two action cards side by side ("Importar arquivo" + "Adicionar manualmente")
4. Below: mini list of patients added this session (name — phone, with remove button)
5. Show added count text
6. Both dialogs use the shared components

The `onSuccess` callback for the form dialog should:
- Fetch the just-created patient from the API (or rely on the form to pass back the data)
- Add to `addedPatients` state
- Close dialog

The `onSuccess` callback for the import dialog should:
- Refresh the `addedPatients` count (fetch total count from API)
- Close dialog

Keep the step optional: "Pular" and "Continuar" both advance to step 4.

**Step 2: Commit**

```bash
git add src/app/(onboarding)/setup/page.tsx
git commit -m "feat: integrate patient add/import into onboarding step 3"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add patients API routes to the table**

In the "Calendar API Routes" section area, add a new section:

```markdown
### Patient API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/patients` | GET | List patients (paginated, searchable) |
| `/api/patients` | POST | Create single patient |
| `/api/patients/[id]` | PUT | Update patient |
| `/api/patients/[id]` | DELETE | Delete patient (if no appointments) |
| `/api/patients/batch` | POST | Bulk create (max 500, skip duplicates) |
```

Add `papaparse` and `xlsx` to the Tech Stack table.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add patient API routes and new dependencies to CLAUDE.md"
```

---

## Task 13: Build verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 2: Fix any type errors or import issues**

If build fails, fix the issues and re-run.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build issues in patients feature"
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Install papaparse + xlsx | package.json |
| 2 | Zod validation schemas | src/lib/validations/patients.ts |
| 3 | GET + POST API routes | src/app/api/patients/route.ts |
| 4 | PUT + DELETE API routes | src/app/api/patients/[id]/route.ts |
| 5 | Batch import API route | src/app/api/patients/batch/route.ts |
| 6 | i18n translations | messages/*.json |
| 7 | Sidebar nav update | sidebar-nav.tsx |
| 8 | Patient form dialog | patient-form-dialog.tsx |
| 9 | Patient import dialog | patient-import-dialog.tsx |
| 10 | Patients page + view | page.tsx, loading, error, patients-view.tsx |
| 11 | Onboarding step 3 | setup/page.tsx |
| 12 | Update CLAUDE.md | CLAUDE.md |
| 13 | Build verification | — |
