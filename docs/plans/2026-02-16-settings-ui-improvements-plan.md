# Settings UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add services CRUD, insurance plans CRUD, clinic operating hours, professional-service pricing, and replace the oversized schedule grid with a compact weekly visual grid.

**Architecture:** Extend the existing settings page tabs (replace Patients placeholder, add Convênios tab). New `professional_services` junction table for per-professional pricing. Shared compact schedule grid component used by both clinic operating hours and professional schedule. Professional form gets internal subtabs (Dados | Horário | Serviços & Preços).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod validation, Supabase (admin client for API routes), next-intl (pt-BR/en/es), Tailwind CSS v4, Radix UI Dialog.

---

### Task 1: Database Migration — `professional_services` junction table

**Files:**
- Create: `supabase/migrations/009_professional_services.sql`

**Step 1: Write the migration**

```sql
-- 009_professional_services.sql
-- Junction table: which services each professional offers and at what price

create table professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  price_cents integer not null,
  created_at timestamptz not null default now(),
  unique (professional_id, service_id)
);

-- RLS
alter table professional_services enable row level security;

create policy "Users can manage professional_services for their clinic"
  on professional_services for all
  using (
    exists (
      select 1 from professionals p
      join clinic_users cu on cu.clinic_id = p.clinic_id
      where p.id = professional_services.professional_id
        and cu.user_id = auth.uid()
    )
  );

-- Also add RLS policies for services and insurance_plans (missing from original migration)
alter table services enable row level security;

create policy "Users can manage services for their clinic"
  on services for all
  using (
    exists (
      select 1 from clinic_users cu
      where cu.clinic_id = services.clinic_id
        and cu.user_id = auth.uid()
    )
  );

alter table insurance_plans enable row level security;

create policy "Users can manage insurance_plans for their clinic"
  on insurance_plans for all
  using (
    exists (
      select 1 from clinic_users cu
      where cu.clinic_id = insurance_plans.clinic_id
        and cu.user_id = auth.uid()
    )
  );
```

**Step 2: Update database types**

Add `professional_services` to `src/types/database.ts`. Find the `public.Tables` section and add after `professionals`:

```typescript
professional_services: {
  Row: {
    id: string
    professional_id: string
    service_id: string
    price_cents: number
    created_at: string
  }
  Insert: {
    id?: string
    professional_id: string
    service_id: string
    price_cents: number
    created_at?: string
  }
  Update: {
    id?: string
    professional_id?: string
    service_id?: string
    price_cents?: number
    created_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "professional_services_professional_id_fkey"
      columns: ["professional_id"]
      isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "professional_services_service_id_fkey"
      columns: ["service_id"]
      isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },
  ]
}
```

**Step 3: Add type export**

In `src/types/index.ts`, add:

```typescript
export type ProfessionalService = Tables["professional_services"]["Row"];
```

**Step 4: Commit**

```bash
git add supabase/migrations/009_professional_services.sql src/types/database.ts src/types/index.ts
git commit -m "feat: add professional_services junction table and RLS policies"
```

---

### Task 2: Validation Schemas — services, insurance plans, professional services

**Files:**
- Modify: `src/lib/validations/settings.ts`

**Step 1: Add new schemas at the bottom of the file**

After the existing `updateProfessionalSchema`, add:

```typescript
// --- Services ---

export const createServiceSchema = z.object({
  name: z.string().min(2).max(100),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  price_cents: z.number().int().min(0).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  price_cents: z.number().int().min(0).optional().nullable(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// --- Insurance Plans ---

export const createInsurancePlanSchema = z.object({
  name: z.string().min(2).max(100),
});

export type CreateInsurancePlanInput = z.infer<typeof createInsurancePlanSchema>;

// --- Professional Services (upsert) ---

export const upsertProfessionalServicesSchema = z.object({
  services: z.array(
    z.object({
      service_id: z.string().uuid(),
      price_cents: z.number().int().min(0),
    })
  ),
});

export type UpsertProfessionalServicesInput = z.infer<typeof upsertProfessionalServicesSchema>;

// --- Operating Hours (reuse ScheduleGrid for clinic hours) ---

export const operatingHoursSchema = scheduleGridSchema;
export type OperatingHours = ScheduleGrid;
```

**Step 2: Update clinic settings schema to accept operating_hours**

In the existing `clinicSettingsSchema`, add:

```typescript
operating_hours: scheduleGridSchema.optional(),
```

**Step 3: Commit**

```bash
git add src/lib/validations/settings.ts
git commit -m "feat: add validation schemas for services, insurance plans, professional services"
```

---

### Task 3: API Routes — Services CRUD

**Files:**
- Create: `src/app/api/settings/services/route.ts`
- Create: `src/app/api/settings/services/[id]/route.ts`

**Step 1: Create services list/create route**

File: `src/app/api/settings/services/route.ts`

Follow the exact same pattern as `src/app/api/settings/professionals/route.ts`:
- `getClinicId()` helper (copy from professionals route)
- `GET`: list all services for the clinic, ordered by `created_at` ascending
- `POST`: validate with `createServiceSchema`, insert with `clinic_id`
- Empty string price → null
- Return `{ data }` on success, `{ error }` on failure

```typescript
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServiceSchema } from "@/lib/validations/settings";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: services, error } = await admin
    .from("services")
    .select("id, name, duration_minutes, price_cents, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: services });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createServiceSchema.safeParse(body);
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

  const admin = createAdminClient();
  const { data: service, error } = await admin
    .from("services")
    .insert({
      clinic_id: clinicId,
      name: parsed.data.name,
      duration_minutes: parsed.data.duration_minutes,
      price_cents: parsed.data.price_cents ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: service }, { status: 201 });
}
```

**Step 2: Create services update/delete route**

File: `src/app/api/settings/services/[id]/route.ts`

Follow the exact pattern of `src/app/api/settings/professionals/[id]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateServiceSchema } from "@/lib/validations/settings";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const parsed = updateServiceSchema.safeParse(body);
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
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.duration_minutes !== undefined)
    updateData.duration_minutes = parsed.data.duration_minutes;
  if (parsed.data.price_cents !== undefined)
    updateData.price_cents = parsed.data.price_cents;

  const admin = createAdminClient();
  const { data: service, error } = await admin
    .from("services")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: service });
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
  const { error } = await admin
    .from("services")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id } });
}
```

**Step 3: Commit**

```bash
git add src/app/api/settings/services/
git commit -m "feat: add services CRUD API routes"
```

---

### Task 4: API Routes — Insurance Plans CRUD

**Files:**
- Create: `src/app/api/settings/insurance-plans/route.ts`
- Create: `src/app/api/settings/insurance-plans/[id]/route.ts`

**Step 1: Create insurance plans list/create route**

File: `src/app/api/settings/insurance-plans/route.ts`

Same `getClinicId()` pattern. GET lists all, POST creates one:

```typescript
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInsurancePlanSchema } from "@/lib/validations/settings";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: plans, error } = await admin
    .from("insurance_plans")
    .select("id, name, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: plans });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createInsurancePlanSchema.safeParse(body);
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

  const admin = createAdminClient();
  const { data: plan, error } = await admin
    .from("insurance_plans")
    .insert({
      clinic_id: clinicId,
      name: parsed.data.name,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: plan }, { status: 201 });
}
```

**Step 2: Create insurance plans delete route**

File: `src/app/api/settings/insurance-plans/[id]/route.ts`

DELETE only (no PUT since insurance plans only have a name — user deletes and recreates):

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const { error } = await admin
    .from("insurance_plans")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id } });
}
```

**Step 3: Commit**

```bash
git add src/app/api/settings/insurance-plans/
git commit -m "feat: add insurance plans CRUD API routes"
```

---

### Task 5: API Route — Professional Services (GET/PUT)

**Files:**
- Create: `src/app/api/settings/professionals/[id]/services/route.ts`

**Step 1: Create the route**

GET returns all services for a professional (with price_cents). PUT does an upsert (delete all existing, insert new set):

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertProfessionalServicesSchema } from "@/lib/validations/settings";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify professional belongs to this clinic
  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("professionals")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!prof) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: profServices, error } = await admin
    .from("professional_services")
    .select("id, service_id, price_cents, created_at")
    .eq("professional_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: profServices });
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

  const parsed = upsertProfessionalServicesSchema.safeParse(body);
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

  const admin = createAdminClient();

  // Verify professional belongs to this clinic
  const { data: prof } = await admin
    .from("professionals")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!prof) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete existing assignments, then insert new ones
  const { error: deleteError } = await admin
    .from("professional_services")
    .delete()
    .eq("professional_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (parsed.data.services.length > 0) {
    const rows = parsed.data.services.map((s) => ({
      professional_id: id,
      service_id: s.service_id,
      price_cents: s.price_cents,
    }));

    const { error: insertError } = await admin
      .from("professional_services")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Return the updated list
  const { data: updated } = await admin
    .from("professional_services")
    .select("id, service_id, price_cents, created_at")
    .eq("professional_id", id);

  return NextResponse.json({ data: updated });
}
```

**Step 2: Commit**

```bash
git add src/app/api/settings/professionals/[id]/services/
git commit -m "feat: add professional services assignment API route"
```

---

### Task 6: Translation Keys — all 3 locales

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add new keys to the `settings` section in pt-BR.json**

Replace the existing `settings.tabs` and add new sections. Add these keys inside the `"settings"` object:

Update `settings.tabs`:
```json
"tabs": {
  "clinic": "Clínica",
  "professionals": "Profissionais",
  "services": "Serviços",
  "insurancePlans": "Convênios",
  "integrations": "Integrações",
  "whatsapp": "WhatsApp"
}
```

Add to `settings.clinic`:
```json
"operatingHours": "Horário de funcionamento"
```

Add new `settings.services` section:
```json
"services": {
  "add": "Adicionar serviço",
  "edit": "Editar serviço",
  "name": "Nome do serviço",
  "duration": "Duração (min)",
  "price": "Preço (R$)",
  "priceOptional": "Preço base (opcional)",
  "empty": "Nenhum serviço adicionado",
  "deleteConfirm": "Tem certeza que deseja excluir este serviço?",
  "saveError": "Falha ao salvar serviço"
}
```

Add new `settings.insurancePlans` section:
```json
"insurancePlans": {
  "add": "Adicionar",
  "placeholder": "Nome do convênio",
  "empty": "Nenhum convênio adicionado",
  "deleteConfirm": "Tem certeza que deseja excluir este convênio?"
}
```

Add new `settings.professionalForm` section:
```json
"professionalForm": {
  "tabData": "Dados",
  "tabSchedule": "Horário",
  "tabServices": "Serviços & Preços",
  "noServices": "Nenhum serviço cadastrado. Adicione serviços na aba Serviços primeiro.",
  "priceRequired": "Defina o preço para cada serviço selecionado"
}
```

Add new `settings.compactGrid` section:
```json
"compactGrid": {
  "copyToAll": "Copiar seg. para todos",
  "clearAll": "Limpar tudo"
}
```

Add shortened weekday labels:
```json
"weekdaysShort": {
  "monday": "Seg",
  "tuesday": "Ter",
  "wednesday": "Qua",
  "thursday": "Qui",
  "friday": "Sex",
  "saturday": "Sáb",
  "sunday": "Dom"
}
```

**Step 2: Add equivalent keys to en.json**

Same structure but in English:
- tabs: "Clinic", "Professionals", "Services", "Insurance Plans", "Integrations", "WhatsApp"
- services: "Add service", "Edit service", "Service name", "Duration (min)", "Price ($)", "Base price (optional)", "No services added", "Are you sure you want to delete this service?", "Failed to save service"
- insurancePlans: "Add", "Insurance plan name", "No insurance plans added", "Are you sure you want to delete this plan?"
- professionalForm: "Details", "Schedule", "Services & Pricing", "No services registered. Add services in the Services tab first.", "Set the price for each selected service"
- compactGrid: "Copy Mon to all", "Clear all"
- weekdaysShort: "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
- clinic.operatingHours: "Operating hours"

**Step 3: Add equivalent keys to es.json**

Same structure in Spanish:
- tabs: "Clínica", "Profesionales", "Servicios", "Convenios", "Integraciones", "WhatsApp"
- services: "Agregar servicio", "Editar servicio", "Nombre del servicio", "Duración (min)", "Precio ($)", "Precio base (opcional)", "Ningún servicio agregado", "¿Está seguro que desea eliminar este servicio?", "Error al guardar servicio"
- insurancePlans: "Agregar", "Nombre del convenio", "Ningún convenio agregado", "¿Está seguro que desea eliminar este convenio?"
- professionalForm: "Datos", "Horario", "Servicios y Precios", "Ningún servicio registrado. Agregue servicios en la pestaña Servicios primero.", "Defina el precio para cada servicio seleccionado"
- compactGrid: "Copiar lun. a todos", "Limpiar todo"
- weekdaysShort: "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"
- clinic.operatingHours: "Horario de funcionamiento"

**Step 4: Commit**

```bash
git add messages/
git commit -m "feat: add translation keys for services, insurance plans, and schedule grid"
```

---

### Task 7: Compact Schedule Grid Component

**Files:**
- Create: `src/components/settings/compact-schedule-grid.tsx`

**Step 1: Build the compact visual grid**

This is the core UI improvement. The component replaces the verbose per-day schedule editor with a visual weekly grid. Each cell represents a 30-minute slot. Users click/drag to toggle availability.

The component must:
- Accept the same `ScheduleGrid` type (backward compatible with existing data)
- Convert between `ScheduleGrid` (time-block ranges) and a flat boolean grid (for rendering)
- Show days on the Y axis (Mon-Sun), hours on the X axis (06:00-22:00)
- Click toggles a single cell, mousedown+mousemove selects a range
- "Copy Mon to all" and "Clear all" shortcut buttons
- Mobile: horizontal scroll with sticky day labels
- Use CSS variables: `var(--accent)` for active cells, `var(--surface)` for inactive

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface CompactScheduleGridProps {
  value: ScheduleGrid;
  onChange: (grid: ScheduleGrid) => void;
}

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

// Hours from 06:00 to 21:30 — 32 slots of 30 min each
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21
const SLOTS_PER_HOUR = 2;
const TOTAL_SLOTS = HOURS.length * SLOTS_PER_HOUR; // 32

function slotToTime(slot: number): string {
  const hour = HOURS[0] + Math.floor(slot / SLOTS_PER_HOUR);
  const min = (slot % SLOTS_PER_HOUR) * 30;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToSlot(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - HOURS[0]) * SLOTS_PER_HOUR + Math.floor(m / 30);
}

/** Convert ScheduleGrid blocks → flat boolean array per day */
function gridToBooleans(grid: ScheduleGrid): Record<Weekday, boolean[]> {
  const result = {} as Record<Weekday, boolean[]>;
  for (const day of WEEKDAYS) {
    const arr = new Array(TOTAL_SLOTS).fill(false);
    const blocks = grid[day] ?? [];
    for (const block of blocks) {
      const start = timeToSlot(block.start);
      const end = timeToSlot(block.end);
      for (let i = start; i < end && i < TOTAL_SLOTS; i++) {
        arr[i] = true;
      }
    }
    result[day] = arr;
  }
  return result;
}

/** Convert flat boolean array back → ScheduleGrid blocks */
function booleansToGrid(booleans: Record<Weekday, boolean[]>): ScheduleGrid {
  const grid = {} as Record<Weekday, { start: string; end: string }[]>;
  for (const day of WEEKDAYS) {
    const blocks: { start: string; end: string }[] = [];
    const arr = booleans[day];
    let i = 0;
    while (i < arr.length) {
      if (arr[i]) {
        const start = i;
        while (i < arr.length && arr[i]) i++;
        blocks.push({ start: slotToTime(start), end: slotToTime(i) });
      } else {
        i++;
      }
    }
    grid[day] = blocks;
  }
  return grid as ScheduleGrid;
}

export function CompactScheduleGrid({ value, onChange }: CompactScheduleGridProps) {
  const t = useTranslations("settings");
  const [booleans, setBooleans] = useState(() => gridToBooleans(value));
  const dragging = useRef(false);
  const dragValue = useRef(false);
  const dragDay = useRef<Weekday | null>(null);

  const commit = useCallback(
    (next: Record<Weekday, boolean[]>) => {
      setBooleans(next);
      onChange(booleansToGrid(next));
    },
    [onChange],
  );

  function handleMouseDown(day: Weekday, slot: number) {
    dragging.current = true;
    dragDay.current = day;
    dragValue.current = !booleans[day][slot];
    const next = { ...booleans, [day]: [...booleans[day]] };
    next[day][slot] = dragValue.current;
    commit(next);
  }

  function handleMouseEnter(day: Weekday, slot: number) {
    if (!dragging.current || dragDay.current !== day) return;
    const next = { ...booleans, [day]: [...booleans[day]] };
    next[day][slot] = dragValue.current;
    commit(next);
  }

  function handleMouseUp() {
    dragging.current = false;
    dragDay.current = null;
  }

  function copyMondayToAll() {
    const next = { ...booleans };
    for (const day of WEEKDAYS) {
      if (day !== "monday") {
        next[day] = [...booleans.monday];
      }
    }
    commit(next);
  }

  function clearAll() {
    const next = {} as Record<Weekday, boolean[]>;
    for (const day of WEEKDAYS) {
      next[day] = new Array(TOTAL_SLOTS).fill(false);
    }
    commit(next);
  }

  return (
    <div className="space-y-2" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Shortcut buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyMondayToAll}
          className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          {t("compactGrid.copyToAll")}
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          {t("compactGrid.clearAll")}
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          {/* Hour headers */}
          <div className="flex">
            <div className="w-10 shrink-0" />
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px]"
                style={{ color: "var(--text-muted)", minWidth: "28px" }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Day rows */}
          {WEEKDAYS.map((day) => (
            <div key={day} className="flex items-center gap-0.5 py-0.5">
              <div
                className="w-10 shrink-0 text-[11px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {t(`weekdaysShort.${day}`)}
              </div>
              <div className="flex flex-1 gap-px">
                {booleans[day].map((active, slot) => (
                  <button
                    key={slot}
                    type="button"
                    onMouseDown={() => handleMouseDown(day, slot)}
                    onMouseEnter={() => handleMouseEnter(day, slot)}
                    className="h-6 flex-1 rounded-sm transition-colors"
                    style={{
                      backgroundColor: active
                        ? "var(--accent)"
                        : "var(--surface-elevated)",
                      minWidth: "12px",
                      opacity: active ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/settings/compact-schedule-grid.tsx
git commit -m "feat: add compact weekly schedule grid component"
```

---

### Task 8: Services List Component (UI)

**Files:**
- Create: `src/components/settings/services-list.tsx`

**Step 1: Build the services CRUD list**

Follow the exact same pattern as `src/components/settings/professionals-list.tsx`:
- Fetch from `/api/settings/services` on mount
- Card list showing name, duration, formatted price
- Dialog for add/edit (using `Dialog` from `@/components/ui/dialog`)
- Delete with `window.confirm`
- Loading spinner

The form inside the dialog has 3 fields: name (Input), duration (Input type=number), price (Input type=number with R$ formatting — store as cents, display as reais).

Price display helper: `(priceCents / 100).toFixed(2)` for display, `Math.round(parseFloat(value) * 100)` on input.

```typescript
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createServiceSchema } from "@/lib/validations/settings";

interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
  created_at: string;
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function ServicesList() {
  const t = useTranslations("settings.services");

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | undefined>();

  // Form state
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [priceDisplay, setPriceDisplay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchList() {
    try {
      const res = await fetch("/api/settings/services");
      if (res.ok) {
        const json = await res.json();
        setServices(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  function openAdd() {
    setEditing(undefined);
    setName("");
    setDuration(30);
    setPriceDisplay("");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(svc: ServiceRow) {
    setEditing(svc);
    setName(svc.name);
    setDuration(svc.duration_minutes);
    setPriceDisplay(svc.price_cents !== null ? (svc.price_cents / 100).toFixed(2) : "");
    setError("");
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const priceCents = priceDisplay
      ? Math.round(parseFloat(priceDisplay) * 100)
      : undefined;

    const data = {
      name,
      duration_minutes: duration,
      price_cents: priceCents,
    };

    const parsed = createServiceSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError = Object.values(flat.fieldErrors).flat()[0];
      setError(firstError ?? t("saveError"));
      return;
    }

    setSaving(true);
    try {
      const url = editing
        ? `/api/settings/services/${editing.id}`
        : "/api/settings/services";

      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("saveError"));
        return;
      }

      setDialogOpen(false);
      setLoading(true);
      fetchList();
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(svc: ServiceRow) {
    if (!window.confirm(t("deleteConfirm"))) return;

    const res = await fetch(`/api/settings/services/${svc.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setServices((prev) => prev.filter((s) => s.id !== svc.id));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus className="size-4" strokeWidth={1.75} />
          {t("add")}
        </Button>
      </div>

      {services.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => (
            <Card key={svc.id} variant="glass">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {svc.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {svc.duration_minutes}min · {formatPrice(svc.price_cents)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(svc)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Pencil className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => handleDelete(svc)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? t("edit") : t("add")}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="serviceName"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            id="serviceDuration"
            label={t("duration")}
            type="number"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={5}
            max={480}
          />
          <Input
            id="servicePrice"
            label={t("priceOptional")}
            type="number"
            step="0.01"
            min="0"
            value={priceDisplay}
            onChange={(e) => setPriceDisplay(e.target.value)}
            placeholder="0,00"
          />

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("name") === "Nome do serviço" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "..." : editing ? t("edit") : t("add")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/settings/services-list.tsx
git commit -m "feat: add services list CRUD component"
```

---

### Task 9: Insurance Plans List Component (UI)

**Files:**
- Create: `src/components/settings/insurance-plans-list.tsx`

**Step 1: Build the inline insurance plans list**

Simpler than services — no dialog. Inline input + add button, list of badges with delete.

```typescript
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface InsurancePlanRow {
  id: string;
  name: string;
  created_at: string;
}

export function InsurancePlansList() {
  const t = useTranslations("settings.insurancePlans");

  const [plans, setPlans] = useState<InsurancePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function fetchList() {
    try {
      const res = await fetch("/api/settings/insurance-plans");
      if (res.ok) {
        const json = await res.json();
        setPlans(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim().length < 2) return;

    setAdding(true);
    try {
      const res = await fetch("/api/settings/insurance-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (res.ok) {
        const json = await res.json();
        setPlans((prev) => [...prev, json.data]);
        setNewName("");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(plan: InsurancePlanRow) {
    if (!window.confirm(t("deleteConfirm"))) return;

    const res = await fetch(`/api/settings/insurance-plans/${plan.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Inline add form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="flex-1">
          <Input
            id="newPlanName"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("placeholder")}
          />
        </div>
        <Button type="submit" size="sm" disabled={adding || !newName.trim()}>
          <Plus className="size-4" strokeWidth={1.75} />
          {t("add")}
        </Button>
      </form>

      {/* Plans list */}
      {plans.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
              style={{
                backgroundColor: "var(--accent-muted)",
                color: "var(--text-primary)",
              }}
            >
              {plan.name}
              <button
                onClick={() => handleDelete(plan)}
                className="rounded-full p-0.5 transition-colors hover:bg-[rgba(239,68,68,0.2)]"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/settings/insurance-plans-list.tsx
git commit -m "feat: add insurance plans inline CRUD component"
```

---

### Task 10: Professional Services Form (subtab component)

**Files:**
- Create: `src/components/settings/professional-services-form.tsx`

**Step 1: Build the checkbox + price list for a professional's services**

This component:
- Fetches all clinic services from `/api/settings/services`
- Fetches existing professional services from `/api/settings/professionals/{id}/services`
- Shows checkbox list with price input per checked service
- Saves via PUT to `/api/settings/professionals/{id}/services`

```typescript
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
}

interface ProfServiceRow {
  service_id: string;
  price_cents: number;
}

interface ProfessionalServicesFormProps {
  professionalId: string;
}

export function ProfessionalServicesForm({
  professionalId,
}: ProfessionalServicesFormProps) {
  const t = useTranslations("settings.professionalForm");

  const [allServices, setAllServices] = useState<ServiceRow[]>([]);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [svcRes, profSvcRes] = await Promise.all([
          fetch("/api/settings/services"),
          fetch(`/api/settings/professionals/${professionalId}/services`),
        ]);

        if (svcRes.ok) {
          const svcJson = await svcRes.json();
          setAllServices(svcJson.data ?? []);
        }

        if (profSvcRes.ok) {
          const profSvcJson = await profSvcRes.json();
          const map = new Map<string, number>();
          for (const ps of (profSvcJson.data ?? []) as ProfServiceRow[]) {
            map.set(ps.service_id, ps.price_cents);
          }
          setSelected(map);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [professionalId]);

  function toggleService(serviceId: string, defaultPrice: number | null) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.set(serviceId, defaultPrice ?? 0);
      }
      return next;
    });
  }

  function updatePrice(serviceId: string, priceDisplay: string) {
    const cents = Math.round(parseFloat(priceDisplay || "0") * 100);
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(serviceId, cents);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    const services = Array.from(selected.entries()).map(
      ([service_id, price_cents]) => ({ service_id, price_cents }),
    );

    try {
      const res = await fetch(
        `/api/settings/professionals/${professionalId}/services`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services }),
        },
      );

      if (res.ok) {
        setFeedback({ type: "success", message: "Salvo" });
      } else {
        const json = await res.json();
        setFeedback({ type: "error", message: json.error ?? "Erro" });
      }
    } catch {
      setFeedback({ type: "error", message: "Erro" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  if (allServices.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        {t("noServices")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {allServices.map((svc) => {
        const isChecked = selected.has(svc.id);
        const priceCents = selected.get(svc.id) ?? 0;

        return (
          <div
            key={svc.id}
            className="flex items-center gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggleService(svc.id, svc.price_cents)}
              className="size-4 rounded accent-[var(--accent)]"
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {svc.name}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {svc.duration_minutes}min
              </p>
            </div>
            {isChecked && (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(priceCents / 100).toFixed(2)}
                  onChange={(e) => updatePrice(svc.id, e.target.value)}
                  className="w-24 rounded-md border bg-transparent px-2 py-1 text-sm text-right"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {feedback && (
        <p
          className="text-sm"
          style={{
            color:
              feedback.type === "success" ? "var(--success)" : "var(--danger)",
          }}
        >
          {feedback.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/settings/professional-services-form.tsx
git commit -m "feat: add professional services pricing form component"
```

---

### Task 11: Update Professional Form — subtabs (Dados | Horário | Serviços & Preços)

**Files:**
- Modify: `src/components/settings/professional-form.tsx`

**Step 1: Refactor to add internal subtabs**

Replace the current flat form with 3 subtabs. The "Dados" tab keeps the existing fields (name, specialty, duration). The "Horário" tab uses the new `CompactScheduleGrid`. The "Serviços & Preços" tab uses `ProfessionalServicesForm` (only shown when editing, not when creating a new professional).

Key changes:
- Add `activeSubTab` state (0, 1, 2)
- Subtab bar at top of form inside dialog
- Import `CompactScheduleGrid` instead of `ScheduleGridEditor`
- Import `ProfessionalServicesForm`
- Services tab only visible when `isEditing` (need the professional ID)

Replace the entire component body. The form `onSubmit` only handles Dados + Horário (the "Serviços" tab saves independently via its own button).

```typescript
"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CompactScheduleGrid } from "./compact-schedule-grid";
import { ProfessionalServicesForm } from "./professional-services-form";
import { createProfessionalSchema } from "@/lib/validations/settings";
import type { ScheduleGrid } from "@/lib/validations/settings";

const DEFAULT_GRID: ScheduleGrid = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

interface ProfessionalFormProps {
  professional?: {
    id: string;
    name: string;
    specialty: string | null;
    appointment_duration_minutes: number;
    schedule_grid?: Record<string, { start: string; end: string }[]>;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

const SUBTAB_KEYS = ["tabData", "tabSchedule", "tabServices"] as const;

export function ProfessionalForm({
  professional,
  onSuccess,
  onCancel,
}: ProfessionalFormProps) {
  const t = useTranslations("settings.professionals");
  const tf = useTranslations("settings.professionalForm");
  const isEditing = !!professional;

  const [activeSubTab, setActiveSubTab] = useState(0);
  const [name, setName] = useState(professional?.name ?? "");
  const [specialty, setSpecialty] = useState(professional?.specialty ?? "");
  const [duration, setDuration] = useState(
    professional?.appointment_duration_minutes ?? 30,
  );
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleGrid>(
    (professional?.schedule_grid as ScheduleGrid | undefined) ?? DEFAULT_GRID,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const data = {
      name,
      specialty,
      appointment_duration_minutes: duration,
      schedule_grid: scheduleGrid,
    };

    const parsed = createProfessionalSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError = Object.values(flat.fieldErrors).flat()[0];
      setError(firstError ?? t("saveError"));
      return;
    }

    setLoading(true);
    try {
      const url = isEditing
        ? `/api/settings/professionals/${professional.id}`
        : "/api/settings/professionals";

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("saveError"));
        return;
      }

      onSuccess();
    } catch {
      setError(t("saveError"));
    } finally {
      setLoading(false);
    }
  }

  // Subtabs available: always show Dados + Horário. Only show Serviços when editing.
  const subtabs = isEditing
    ? SUBTAB_KEYS
    : SUBTAB_KEYS.slice(0, 2);

  return (
    <div className="space-y-4">
      {/* Subtab bar */}
      <div
        className="flex gap-1 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {subtabs.map((key, i) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSubTab(i)}
            className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-colors ${
              i === activeSubTab
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tf(key)}
          </button>
        ))}
      </div>

      {/* Subtab content */}
      {activeSubTab === 0 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="profName"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            id="specialty"
            label={t("specialty")}
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          />
          <Input
            id="duration"
            label={t("duration")}
            type="number"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={5}
            max={480}
          />

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("name") === "Nome" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? "..."
                : isEditing
                  ? t("edit")
                  : t("add")}
            </Button>
          </div>
        </form>
      )}

      {activeSubTab === 1 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <CompactScheduleGrid value={scheduleGrid} onChange={setScheduleGrid} />

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("name") === "Nome" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : t("name") === "Nome" ? "Salvar" : "Save"}
            </Button>
          </div>
        </form>
      )}

      {activeSubTab === 2 && isEditing && (
        <ProfessionalServicesForm professionalId={professional.id} />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/settings/professional-form.tsx
git commit -m "feat: add subtabs to professional form (data, schedule, services)"
```

---

### Task 12: Update Clinic Form — Operating Hours

**Files:**
- Modify: `src/components/settings/clinic-form.tsx`

**Step 1: Add operating hours section**

Below the existing grid of clinic fields, add a section title "Horário de Funcionamento" and the `CompactScheduleGrid` component. The operating hours data saves to the `operating_hours` JSONB column (already exists in the `clinics` table).

Changes:
- Import `CompactScheduleGrid`
- Add `operatingHours` state initialized from `clinic.operating_hours`
- Include `operating_hours` in the form submit data
- Add the grid below the form fields, above the feedback/submit button

Add state:
```typescript
const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(
  (clinic.operating_hours as ScheduleGrid | undefined) ?? {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: [],
  },
);
```

Add to `handleSubmit` data:
```typescript
operating_hours: operatingHours,
```

Add to the JSX, between the grid closing `</div>` and the feedback `{feedback && ...}`:
```tsx
{/* Operating Hours */}
<div className="space-y-2">
  <h3
    className="text-sm font-medium"
    style={{ color: "var(--text-primary)" }}
  >
    {t("operatingHours")}
  </h3>
  <CompactScheduleGrid value={operatingHours} onChange={setOperatingHours} />
</div>
```

**Step 2: Commit**

```bash
git add src/components/settings/clinic-form.tsx
git commit -m "feat: add operating hours to clinic settings form"
```

---

### Task 13: Update Settings Page — new tabs

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Update tab structure**

Replace `TAB_KEYS` and `TAB_PARAM_MAP` to match new tab order:
```
Clínica | Profissionais | Serviços | Convênios | Integrações | WhatsApp
```

Changes:
- Replace `PatientsPlaceholder` import with `ServicesList` and `InsurancePlansList`
- Update `TAB_KEYS` array
- Update `TAB_PARAM_MAP`
- Update tab content rendering

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Spinner } from "@/components/ui/spinner";
import { ClinicForm } from "@/components/settings/clinic-form";
import { ProfessionalsList } from "@/components/settings/professionals-list";
import { ServicesList } from "@/components/settings/services-list";
import { InsurancePlansList } from "@/components/settings/insurance-plans-list";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { WhatsAppConfig } from "@/components/settings/whatsapp-placeholder";
import type { Clinic } from "@/types";

const TAB_KEYS = [
  "tabs.clinic",
  "tabs.professionals",
  "tabs.services",
  "tabs.insurancePlans",
  "tabs.integrations",
  "tabs.whatsapp",
] as const;

const TAB_PARAM_MAP: Record<string, number> = {
  clinic: 0,
  professionals: 1,
  services: 2,
  "insurance-plans": 3,
  integrations: 4,
  whatsapp: 5,
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    (tabParam && TAB_PARAM_MAP[tabParam]) ?? 0,
  );
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClinic() {
      try {
        const res = await fetch("/api/settings/clinic");
        if (!res.ok) {
          console.error("[settings] failed to fetch clinic:", res.status);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) setClinic(json.data);
      } catch (err) {
        console.error("[settings] fetch clinic error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchClinic();
  }, []);

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 space-y-6">
        {/* Tab bar */}
        <div
          className="flex gap-1 overflow-x-auto border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {TAB_KEYS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                i === activeTab
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            {activeTab === 0 && clinic && <ClinicForm clinic={clinic} />}
            {activeTab === 1 && <ProfessionalsList />}
            {activeTab === 2 && <ServicesList />}
            {activeTab === 3 && <InsurancePlansList />}
            {activeTab === 4 && <IntegrationsTab />}
            {activeTab === 5 && <WhatsAppConfig />}
          </>
        )}
      </div>
    </PageContainer>
  );
}
```

**Step 2: Delete the patients placeholder** (no longer used)

```bash
rm src/components/settings/patients-placeholder.tsx
```

**Step 3: Verify the old `ScheduleGridEditor` is no longer imported anywhere**

If no other file imports it, delete it too:
```bash
# Check for imports
grep -r "schedule-grid-editor" src/
# If no results, delete it
rm src/components/settings/schedule-grid-editor.tsx
```

**Step 4: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx src/components/settings/
git commit -m "feat: update settings page tabs — add services, insurance plans, remove patients placeholder"
```

---

### Task 14: Widen Professional Dialog for compact grid

**Files:**
- Modify: `src/components/settings/professionals-list.tsx`

**Step 1: Pass wider max-width to Dialog**

The compact grid needs more width than the default `max-w-md` dialog. Update the Dialog usage in `professionals-list.tsx` to use a wider variant. Since the Dialog component only supports `max-w-md`, we need to either:

Option A: Add a `size` prop to Dialog. This is simpler.

First modify `src/components/ui/dialog.tsx` to accept an optional `size` prop:

```typescript
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizeClasses = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Dialog({ open, onOpenChange, title, children, size = "md" }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className={`fixed left-1/2 top-1/2 z-50 w-full ${sizeClasses[size]} -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 glass-elevated max-h-[85vh] overflow-y-auto`}>
          <div className="mb-4 flex items-center justify-between">
            <DialogPrimitive.Title
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-lg p-1 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="size-5" strokeWidth={1.75} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

Then in `professionals-list.tsx`, update the Dialog usage to `size="xl"`:

```tsx
<Dialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  title={editing ? t("edit") : t("add")}
  size="xl"
>
```

**Step 2: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/settings/professionals-list.tsx
git commit -m "feat: widen professional dialog for compact schedule grid"
```

---

### Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update documentation**

Add the new API routes to the settings section, new migration reference, and the `professional_services` table to the database section.

In the API Routes / Dashboard section, add:

```markdown
| `/api/settings/services` | GET, POST | Services CRUD |
| `/api/settings/services/[id]` | PUT, DELETE | Service update/delete |
| `/api/settings/insurance-plans` | GET, POST | Insurance plans CRUD |
| `/api/settings/insurance-plans/[id]` | DELETE | Insurance plan delete |
| `/api/settings/professionals/[id]/services` | GET, PUT | Professional service assignments |
```

In the Database section, mention:
- `professional_services` junction table (professional_id, service_id, price_cents) with cascade deletes
- `clinics.operating_hours` (JSONB, same ScheduleGrid format)

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with services, insurance plans, and professional services"
```

---

### Task 16: Build verification

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds. If there are errors, fix them before committing.

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build errors from settings UI improvements"
```

---

## Task Summary

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | DB migration + types | migration, database.ts, index.ts | Backend |
| 2 | Validation schemas | settings.ts | Backend |
| 3 | Services API routes | 2 route files | Backend |
| 4 | Insurance plans API routes | 2 route files | Backend |
| 5 | Professional services API route | 1 route file | Backend |
| 6 | Translation keys | 3 locale files | i18n |
| 7 | Compact schedule grid component | 1 new component | Frontend |
| 8 | Services list component | 1 new component | Frontend |
| 9 | Insurance plans list component | 1 new component | Frontend |
| 10 | Professional services form component | 1 new component | Frontend |
| 11 | Professional form subtabs | 1 modified component | Frontend |
| 12 | Clinic form operating hours | 1 modified component | Frontend |
| 13 | Settings page tab update | 1 modified page + deletions | Frontend |
| 14 | Dialog width + scroll | 2 modified components | Frontend |
| 15 | CLAUDE.md update | 1 doc | Docs |
| 16 | Build verification | — | QA |
