# Calendar Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full appointment management calendar page with week/day/month views, CRUD modal, patient search, Google Calendar sync, and professional color coding.

**Architecture:** Custom CSS Grid calendar built with React client components. Server component page shell fetches professionals. API routes handle appointment CRUD with Google Calendar sync and confirmation queue integration. New sidebar nav item at `/calendar`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (admin client), Zod validation, next-intl, Lucide icons, Radix Dialog, CSS Grid

---

### Task 1: DB Migration — Add `insurance_plan_id` to Appointments

**Files:**
- Create: `supabase/migrations/010_appointments_insurance_plan.sql`
- Modify: `src/types/database.ts` — add `insurance_plan_id` field to appointments type

**What to do:**

Create migration file:

```sql
-- 010_appointments_insurance_plan.sql
-- Add optional insurance plan reference to appointments

alter table appointments
  add column insurance_plan_id uuid references insurance_plans(id) on delete set null;
```

Then update `src/types/database.ts` — add `insurance_plan_id: string | null` to the `appointments` table in three places:

1. In `Row`: add `insurance_plan_id: string | null` (alphabetical order, after `id`)
2. In `Insert`: add `insurance_plan_id?: string | null`
3. In `Update`: add `insurance_plan_id?: string | null`
4. In `Relationships` array: add:
```ts
{
  foreignKeyName: "appointments_insurance_plan_id_fkey"
  columns: ["insurance_plan_id"]
  isOneToOne: false
  referencedRelation: "insurance_plans"
  referencedColumns: ["id"]
},
```

**Commit:** `feat: add insurance_plan_id column to appointments table`

---

### Task 2: Validation Schemas for Calendar Appointments

**Files:**
- Modify: `src/lib/validations/settings.ts` — add appointment schemas at the bottom

**What to do:**

Add these schemas at the end of `src/lib/validations/settings.ts`:

```ts
// --- Calendar Appointments ---

export const createAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  insurance_plan_id: z.string().uuid().optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  cancellation_reason: z.string().max(500).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
```

**Commit:** `feat: add appointment validation schemas for calendar CRUD`

---

### Task 3: Translation Keys (All 3 Locales)

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**What to do:**

In all three files:

1. Add `"calendar": "..."` inside the existing `"nav"` object (after `"inbox"`).
2. Add a new top-level `"calendar"` section.

**pt-BR values:**

In `nav` section, add after `"inbox": "Caixa de Entrada"`:
```json
"calendar": "Agenda"
```

Add new top-level `"calendar"` section (add after the `"inbox"` section):
```json
"calendar": {
  "title": "Agenda",
  "today": "Hoje",
  "views": {
    "day": "Dia",
    "week": "Semana",
    "month": "Mês"
  },
  "allProfessionals": "Todos os profissionais",
  "newAppointment": "Novo agendamento",
  "editAppointment": "Editar agendamento",
  "patient": "Paciente",
  "professional": "Profissional",
  "service": "Serviço",
  "date": "Data",
  "startTime": "Horário",
  "endTime": "Término",
  "duration": "Duração",
  "insurancePlan": "Convênio",
  "status": "Status",
  "cancellationReason": "Motivo do cancelamento",
  "searchPatient": "Buscar paciente...",
  "noAppointments": "Nenhum agendamento",
  "appointmentCount": "{count} consultas",
  "saveSuccess": "Agendamento salvo",
  "saveError": "Falha ao salvar agendamento",
  "deleteConfirm": "Excluir este agendamento?",
  "cancelConfirm": "Cancelar este agendamento?",
  "deleteSuccess": "Agendamento excluído",
  "cancelSuccess": "Agendamento cancelado",
  "conflict": "Horário já ocupado",
  "selectPatient": "Selecione um paciente",
  "selectProfessional": "Selecione um profissional",
  "selectService": "Selecione um serviço",
  "minutes": "{count} min",
  "statuses": {
    "scheduled": "Agendado",
    "confirmed": "Confirmado",
    "completed": "Realizado",
    "cancelled": "Cancelado",
    "no_show": "Falta"
  }
}
```

**en values:**

In `nav` section, add after `"inbox": "Inbox"`:
```json
"calendar": "Calendar"
```

Add `"calendar"` section:
```json
"calendar": {
  "title": "Calendar",
  "today": "Today",
  "views": {
    "day": "Day",
    "week": "Week",
    "month": "Month"
  },
  "allProfessionals": "All professionals",
  "newAppointment": "New appointment",
  "editAppointment": "Edit appointment",
  "patient": "Patient",
  "professional": "Professional",
  "service": "Service",
  "date": "Date",
  "startTime": "Start time",
  "endTime": "End time",
  "duration": "Duration",
  "insurancePlan": "Insurance plan",
  "status": "Status",
  "cancellationReason": "Cancellation reason",
  "searchPatient": "Search patient...",
  "noAppointments": "No appointments",
  "appointmentCount": "{count} appointments",
  "saveSuccess": "Appointment saved",
  "saveError": "Failed to save appointment",
  "deleteConfirm": "Delete this appointment?",
  "cancelConfirm": "Cancel this appointment?",
  "deleteSuccess": "Appointment deleted",
  "cancelSuccess": "Appointment cancelled",
  "conflict": "Time slot already taken",
  "selectPatient": "Select a patient",
  "selectProfessional": "Select a professional",
  "selectService": "Select a service",
  "minutes": "{count} min",
  "statuses": {
    "scheduled": "Scheduled",
    "confirmed": "Confirmed",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "no_show": "No show"
  }
}
```

**es values:**

In `nav` section, add after `"inbox": "Bandeja de Entrada"`:
```json
"calendar": "Agenda"
```

Add `"calendar"` section:
```json
"calendar": {
  "title": "Agenda",
  "today": "Hoy",
  "views": {
    "day": "Día",
    "week": "Semana",
    "month": "Mes"
  },
  "allProfessionals": "Todos los profesionales",
  "newAppointment": "Nueva cita",
  "editAppointment": "Editar cita",
  "patient": "Paciente",
  "professional": "Profesional",
  "service": "Servicio",
  "date": "Fecha",
  "startTime": "Hora de inicio",
  "endTime": "Hora de fin",
  "duration": "Duración",
  "insurancePlan": "Seguro",
  "status": "Estado",
  "cancellationReason": "Motivo de cancelación",
  "searchPatient": "Buscar paciente...",
  "noAppointments": "Sin citas",
  "appointmentCount": "{count} citas",
  "saveSuccess": "Cita guardada",
  "saveError": "Error al guardar cita",
  "deleteConfirm": "¿Eliminar esta cita?",
  "cancelConfirm": "¿Cancelar esta cita?",
  "deleteSuccess": "Cita eliminada",
  "cancelSuccess": "Cita cancelada",
  "conflict": "Horario ya ocupado",
  "selectPatient": "Seleccione un paciente",
  "selectProfessional": "Seleccione un profesional",
  "selectService": "Seleccione un servicio",
  "minutes": "{count} min",
  "statuses": {
    "scheduled": "Programada",
    "confirmed": "Confirmada",
    "completed": "Completada",
    "cancelled": "Cancelada",
    "no_show": "No asistió"
  }
}
```

**Commit:** `feat: add calendar page translation keys for all locales`

---

### Task 4: Sidebar Navigation — Add Calendar Item

**Files:**
- Modify: `src/components/layout/sidebar-nav.tsx`

**What to do:**

1. Add `CalendarDays` to the Lucide import:
```ts
import {
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  Blocks,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";
```

2. Add the calendar entry to `NAV_ITEMS` after the inbox entry:
```ts
const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/inbox", icon: MessageSquare, labelKey: "nav.inbox" },
  { href: "/calendar", icon: CalendarDays, labelKey: "nav.calendar" },
  { href: "/modules", icon: Blocks, labelKey: "nav.modules" },
  { href: "/reports", icon: BarChart3, labelKey: "nav.reports" },
  { href: "/team", icon: Users, labelKey: "nav.team" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;
```

**Commit:** `feat: add calendar item to sidebar navigation`

---

### Task 5: API Routes — GET & POST Appointments + Patient Search

**Files:**
- Create: `src/app/api/calendar/appointments/route.ts`
- Create: `src/app/api/calendar/patients/search/route.ts`

**What to do:**

**`src/app/api/calendar/appointments/route.ts`** — follow the exact pattern from `src/app/api/settings/services/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAppointmentSchema } from "@/lib/validations/settings";
import { enqueueConfirmations } from "@/lib/scheduling/enqueue-confirmations";
import { createEvent } from "@/services/google-calendar";

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

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const professionalId = searchParams.get("professional_id");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  let query = admin
    .from("appointments")
    .select(`
      id, starts_at, ends_at, status, cancellation_reason, google_event_id, insurance_plan_id,
      patients!inner(id, name, phone),
      professionals(id, name),
      services(id, name, duration_minutes),
      insurance_plans(id, name)
    `)
    .eq("clinic_id", clinicId)
    .gte("starts_at", start)
    .lte("starts_at", end)
    .order("starts_at", { ascending: true });

  if (professionalId) {
    query = query.eq("professional_id", professionalId);
  }

  const { data: appointments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: appointments });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createAppointmentSchema.safeParse(body);
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

  // Check for time conflicts
  const { data: conflicts } = await admin
    .from("appointments")
    .select("id")
    .eq("professional_id", parsed.data.professional_id)
    .in("status", ["scheduled", "confirmed"])
    .lt("starts_at", parsed.data.ends_at)
    .gt("ends_at", parsed.data.starts_at)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "Time slot conflict" },
      { status: 409 },
    );
  }

  // Insert appointment
  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: parsed.data.patient_id,
      professional_id: parsed.data.professional_id,
      service_id: parsed.data.service_id ?? null,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      insurance_plan_id: parsed.data.insurance_plan_id ?? null,
      status: "scheduled",
    })
    .select()
    .single();

  if (insertError || !appointment) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create appointment" },
      { status: 500 },
    );
  }

  // Enqueue confirmation reminders (fire-and-forget)
  try {
    await enqueueConfirmations(admin, {
      clinicId,
      appointmentId: appointment.id as string,
      startsAt: parsed.data.starts_at,
    });
  } catch (err) {
    console.error("[calendar] failed to enqueue confirmations:", err);
  }

  // Sync to Google Calendar (fire-and-forget)
  try {
    const { data: professional } = await admin
      .from("professionals")
      .select("name, google_calendar_id, google_refresh_token")
      .eq("id", parsed.data.professional_id)
      .single();

    if (professional?.google_refresh_token && professional?.google_calendar_id) {
      const { data: patient } = await admin
        .from("patients")
        .select("name")
        .eq("id", parsed.data.patient_id)
        .single();

      const { data: clinic } = await admin
        .from("clinics")
        .select("name, timezone")
        .eq("id", clinicId)
        .single();

      const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";
      const patientName = (patient?.name as string) ?? "Patient";
      const clinicName = (clinic?.name as string) ?? "Clinic";

      const eventResult = await createEvent(
        professional.google_refresh_token as string,
        professional.google_calendar_id as string,
        {
          summary: `${patientName} — ${clinicName}`,
          startTime: parsed.data.starts_at,
          endTime: parsed.data.ends_at,
          timezone,
        },
      );

      if (eventResult.success && eventResult.eventId) {
        await admin
          .from("appointments")
          .update({ google_event_id: eventResult.eventId })
          .eq("id", appointment.id);
      }
    }
  } catch (err) {
    console.error("[calendar] Google Calendar sync error:", err);
  }

  return NextResponse.json({ data: appointment }, { status: 201 });
}
```

**`src/app/api/calendar/patients/search/route.ts`**:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const admin = createAdminClient();

  // Search by name (ilike) or phone (starts with)
  const isPhoneSearch = /^\d+$/.test(q);

  let query = admin
    .from("patients")
    .select("id, name, phone")
    .eq("clinic_id", clinicId)
    .limit(10);

  if (isPhoneSearch) {
    query = query.like("phone", `${q}%`);
  } else {
    query = query.ilike("name", `%${q}%`);
  }

  const { data: patients, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patients });
}
```

**Commit:** `feat: add calendar appointments and patient search API routes`

---

### Task 6: API Routes — PUT & DELETE Appointments

**Files:**
- Create: `src/app/api/calendar/appointments/[id]/route.ts`

**What to do:**

Follow the pattern from `src/app/api/settings/services/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAppointmentSchema } from "@/lib/validations/settings";
import { updateEvent, deleteEvent } from "@/services/google-calendar";

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

  const parsed = updateAppointmentSchema.safeParse(body);
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

  // If time is changing, check for conflicts
  if (parsed.data.starts_at && parsed.data.ends_at && parsed.data.professional_id) {
    const { data: conflicts } = await admin
      .from("appointments")
      .select("id")
      .eq("professional_id", parsed.data.professional_id)
      .in("status", ["scheduled", "confirmed"])
      .lt("starts_at", parsed.data.ends_at)
      .gt("ends_at", parsed.data.starts_at)
      .neq("id", id)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "Time slot conflict" },
        { status: 409 },
      );
    }
  }

  // Build update data (only include defined fields)
  const updateData: Record<string, unknown> = {};
  if (parsed.data.patient_id !== undefined) updateData.patient_id = parsed.data.patient_id;
  if (parsed.data.professional_id !== undefined) updateData.professional_id = parsed.data.professional_id;
  if (parsed.data.service_id !== undefined) updateData.service_id = parsed.data.service_id;
  if (parsed.data.starts_at !== undefined) updateData.starts_at = parsed.data.starts_at;
  if (parsed.data.ends_at !== undefined) updateData.ends_at = parsed.data.ends_at;
  if (parsed.data.insurance_plan_id !== undefined) updateData.insurance_plan_id = parsed.data.insurance_plan_id;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.cancellation_reason !== undefined) updateData.cancellation_reason = parsed.data.cancellation_reason;

  const { data: appointment, error } = await admin
    .from("appointments")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync time changes to Google Calendar (fire-and-forget)
  if (parsed.data.starts_at || parsed.data.ends_at) {
    try {
      const googleEventId = appointment.google_event_id as string | null;
      const profId = (parsed.data.professional_id ?? appointment.professional_id) as string | null;

      if (googleEventId && profId) {
        const { data: professional } = await admin
          .from("professionals")
          .select("google_calendar_id, google_refresh_token")
          .eq("id", profId)
          .single();

        if (professional?.google_refresh_token && professional?.google_calendar_id) {
          const { data: clinic } = await admin
            .from("clinics")
            .select("timezone")
            .eq("id", clinicId)
            .single();

          const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

          await updateEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            googleEventId,
            {
              startTime: (parsed.data.starts_at ?? appointment.starts_at) as string,
              endTime: (parsed.data.ends_at ?? appointment.ends_at) as string,
              timezone,
            },
          );
        }
      }
    } catch (err) {
      console.error("[calendar] Google Calendar update error:", err);
    }
  }

  return NextResponse.json({ data: appointment });
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

  // Load appointment first for Google Calendar cleanup
  const { data: existing } = await admin
    .from("appointments")
    .select("google_event_id, professional_id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  const { error } = await admin
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Delete from Google Calendar (fire-and-forget)
  if (existing?.google_event_id && existing?.professional_id) {
    try {
      const { data: professional } = await admin
        .from("professionals")
        .select("google_calendar_id, google_refresh_token")
        .eq("id", existing.professional_id as string)
        .single();

      if (professional?.google_refresh_token && professional?.google_calendar_id) {
        await deleteEvent(
          professional.google_refresh_token as string,
          professional.google_calendar_id as string,
          existing.google_event_id as string,
        );
      }
    } catch (err) {
      console.error("[calendar] Google Calendar delete error:", err);
    }
  }

  return NextResponse.json({ data: { id } });
}
```

**Commit:** `feat: add calendar appointment update and delete API routes`

---

### Task 7: Calendar Utility — Professional Colors + Date Helpers

**Files:**
- Create: `src/lib/calendar/utils.ts`

**What to do:**

```ts
// Professional color palette (deterministic by index)
export const PROFESSIONAL_COLORS = [
  "#6366f1", // indigo
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
] as const;

export function getProfessionalColor(index: number): string {
  return PROFESSIONAL_COLORS[index % PROFESSIONAL_COLORS.length];
}

// Date helpers
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  // Monday-based week
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Grid constants
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 21;
export const SLOT_DURATION_MINUTES = 30;
export const TOTAL_SLOTS = (GRID_END_HOUR - GRID_START_HOUR) * (60 / SLOT_DURATION_MINUTES);

// Calculate top position and height for an event in the grid
export function getEventPosition(
  startsAt: Date,
  endsAt: Date,
): { top: number; height: number } {
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
  const gridStartMinutes = GRID_START_HOUR * 60;
  const gridTotalMinutes = (GRID_END_HOUR - GRID_START_HOUR) * 60;

  const top = ((startMinutes - gridStartMinutes) / gridTotalMinutes) * 100;
  const height = ((endMinutes - startMinutes) / gridTotalMinutes) * 100;

  return {
    top: Math.max(0, top),
    height: Math.max(1, Math.min(height, 100 - top)),
  };
}
```

**Commit:** `feat: add calendar utility functions for colors and dates`

---

### Task 8: AppointmentCard Component

**Files:**
- Create: `src/components/calendar/appointment-card.tsx`

**What to do:**

This is the event block rendered inside the calendar grid.

```tsx
"use client";

import type { CalendarAppointment } from "./types";
import { formatTime } from "@/lib/calendar/utils";

interface AppointmentCardProps {
  appointment: CalendarAppointment;
  color: string;
  compact?: boolean;
  onClick: () => void;
}

const STATUS_OPACITY: Record<string, string> = {
  scheduled: "1",
  confirmed: "1",
  completed: "0.6",
  cancelled: "0.35",
  no_show: "0.35",
};

export function AppointmentCard({
  appointment,
  color,
  compact = false,
  onClick,
}: AppointmentCardProps) {
  const start = new Date(appointment.starts_at);
  const opacity = STATUS_OPACITY[appointment.status] ?? "1";
  const isCancelled = appointment.status === "cancelled" || appointment.status === "no_show";

  return (
    <button
      onClick={onClick}
      className="absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs transition-opacity hover:opacity-90"
      style={{
        backgroundColor: `${color}20`,
        borderLeft: `3px solid ${color}`,
        color: "var(--text-primary)",
        opacity,
      }}
    >
      <div className={`font-medium truncate ${isCancelled ? "line-through" : ""}`}>
        {formatTime(start)} {appointment.patient?.name ?? "—"}
      </div>
      {!compact && appointment.service && (
        <div className="truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
          {appointment.service.name}
        </div>
      )}
    </button>
  );
}
```

Also create the shared types file:

**Create: `src/components/calendar/types.ts`**

```ts
export interface CalendarAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_reason: string | null;
  google_event_id: string | null;
  insurance_plan_id: string | null;
  patients: { id: string; name: string; phone: string };
  professionals: { id: string; name: string } | null;
  services: { id: string; name: string; duration_minutes: number } | null;
  insurance_plans: { id: string; name: string } | null;
}

// Flattened version for the modal
export interface AppointmentFormData {
  patient_id: string;
  professional_id: string;
  service_id?: string;
  starts_at: string;
  ends_at: string;
  insurance_plan_id?: string;
}

export interface ProfessionalOption {
  id: string;
  name: string;
  color: string;
}
```

**Commit:** `feat: add appointment card component and calendar types`

---

### Task 9: PatientSearch Component

**Files:**
- Create: `src/components/calendar/patient-search.tsx`

**What to do:**

Debounced autocomplete search input:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

interface PatientResult {
  id: string;
  name: string;
  phone: string;
}

interface PatientSearchProps {
  value: PatientResult | null;
  onChange: (patient: PatientResult | null) => void;
}

export function PatientSearch({ value, onChange }: PatientSearchProps) {
  const t = useTranslations("calendar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/calendar/patients/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.data ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <span style={{ color: "var(--text-primary)" }}>{value.name}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{value.phone}</span>
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(""); }}
          className="ml-auto text-xs hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t("searchPatient")}
          className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--surface)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {open && results.length > 0 && (
        <div
          className="absolute z-10 mt-1 w-full rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
          }}
        >
          {results.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => {
                onChange(patient);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            >
              <span style={{ color: "var(--text-primary)" }}>{patient.name}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{patient.phone}</span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div
          className="absolute z-10 mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {t("noAppointments")}
        </div>
      )}
    </div>
  );
}
```

**Commit:** `feat: add patient search autocomplete component`

---

### Task 10: AppointmentModal Component

**Files:**
- Create: `src/components/calendar/appointment-modal.tsx`

**What to do:**

Modal for creating and editing appointments. Uses `Dialog` from `src/components/ui/dialog.tsx`.

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PatientSearch } from "./patient-search";
import type { CalendarAppointment, ProfessionalOption } from "./types";

interface ServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
}

interface InsurancePlanOption {
  id: string;
  name: string;
}

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: CalendarAppointment | null;
  professionals: ProfessionalOption[];
  prefillDate?: string;
  prefillTime?: string;
  prefillProfessionalId?: string;
  onSave: () => void;
}

const STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;

export function AppointmentModal({
  open,
  onOpenChange,
  appointment,
  professionals,
  prefillDate,
  prefillTime,
  prefillProfessionalId,
  onSave,
}: AppointmentModalProps) {
  const t = useTranslations("calendar");
  const tc = useTranslations("common");
  const isEdit = !!appointment;

  // Form state
  const [patient, setPatient] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [insurancePlanId, setInsurancePlanId] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [cancellationReason, setCancellationReason] = useState("");

  // Options
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [insurancePlans, setInsurancePlans] = useState<InsurancePlanOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return;

    if (appointment) {
      const start = new Date(appointment.starts_at);
      const end = new Date(appointment.ends_at);
      setPatient(appointment.patients ? { id: appointment.patients.id, name: appointment.patients.name, phone: appointment.patients.phone } : null);
      setProfessionalId(appointment.professionals?.id ?? "");
      setServiceId(appointment.services?.id ?? "");
      setDate(start.toISOString().slice(0, 10));
      setStartTime(start.toTimeString().slice(0, 5));
      setEndTime(end.toTimeString().slice(0, 5));
      setInsurancePlanId(appointment.insurance_plans?.id ?? "");
      setStatus(appointment.status);
      setCancellationReason(appointment.cancellation_reason ?? "");
    } else {
      setPatient(null);
      setProfessionalId(prefillProfessionalId ?? "");
      setServiceId("");
      setDate(prefillDate ?? new Date().toISOString().slice(0, 10));
      setStartTime(prefillTime ?? "09:00");
      setEndTime("");
      setInsurancePlanId("");
      setStatus("scheduled");
      setCancellationReason("");
    }
    setError("");
  }, [open, appointment, prefillDate, prefillTime, prefillProfessionalId]);

  // Load services for selected professional
  useEffect(() => {
    if (!professionalId) {
      setServices([]);
      return;
    }

    fetch(`/api/settings/professionals/${professionalId}/services`)
      .then((res) => res.json())
      .then((json) => {
        const svcList = (json.data ?? []).map((ps: { service_id: string; services: ServiceOption }) => ({
          id: ps.service_id,
          name: ps.services?.name ?? "",
          duration_minutes: ps.services?.duration_minutes ?? 30,
        }));
        setServices(svcList);
      })
      .catch(() => setServices([]));
  }, [professionalId]);

  // Load insurance plans
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/insurance-plans")
      .then((res) => res.json())
      .then((json) => setInsurancePlans(json.data ?? []))
      .catch(() => setInsurancePlans([]));
  }, [open]);

  // Auto-calculate end time from service duration
  useEffect(() => {
    if (!serviceId || !startTime) return;
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;

    const [h, m] = startTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + svc.duration_minutes;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
  }, [serviceId, startTime, services]);

  async function handleSave() {
    if (!patient) { setError(t("selectPatient")); return; }
    if (!professionalId) { setError(t("selectProfessional")); return; }
    if (!date || !startTime || !endTime) return;

    setSaving(true);
    setError("");

    const starts_at = new Date(`${date}T${startTime}:00`).toISOString();
    const ends_at = new Date(`${date}T${endTime}:00`).toISOString();

    try {
      const url = isEdit
        ? `/api/calendar/appointments/${appointment.id}`
        : "/api/calendar/appointments";

      const payload: Record<string, unknown> = {
        patient_id: patient.id,
        professional_id: professionalId,
        starts_at,
        ends_at,
      };
      if (serviceId) payload.service_id = serviceId;
      if (insurancePlanId) payload.insurance_plan_id = insurancePlanId;
      if (isEdit) {
        payload.status = status;
        if (status === "cancelled" && cancellationReason) {
          payload.cancellation_reason = cancellationReason;
        }
      }

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        if (res.status === 409) {
          setError(t("conflict"));
        } else {
          setError(json.error ?? t("saveError"));
        }
        return;
      }

      onSave();
      onOpenChange(false);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!appointment || !confirm(t("deleteConfirm"))) return;

    setSaving(true);
    try {
      await fetch(`/api/calendar/appointments/${appointment.id}`, { method: "DELETE" });
      onSave();
      onOpenChange(false);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("editAppointment") : t("newAppointment")}
      size="lg"
    >
      <div className="space-y-4">
        {/* Patient search */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("patient")}
          </label>
          <PatientSearch value={patient} onChange={setPatient} />
        </div>

        {/* Professional */}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("professional")}
          </label>
          <select
            value={professionalId}
            onChange={(e) => { setProfessionalId(e.target.value); setServiceId(""); }}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
          >
            <option value="">{t("selectProfessional")}</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Service */}
        {services.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("service")}
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="">{t("selectService")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes} min)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date + Time row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("date")}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("startTime")}
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("endTime")}
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
        </div>

        {/* Insurance plan */}
        {insurancePlans.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("insurancePlan")}
            </label>
            <select
              value={insurancePlanId}
              onChange={(e) => setInsurancePlanId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="">—</option>
              {insurancePlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Status (edit mode only) */}
        {isEdit && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("status")}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`statuses.${s}`)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cancellation reason */}
        {isEdit && status === "cancelled" && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("cancellationReason")}
            </label>
            <input
              type="text"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
                {tc("delete")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? tc("loading") : tc("save")}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

**Commit:** `feat: add appointment create/edit modal component`

---

### Task 11: WeekView Component

**Files:**
- Create: `src/components/calendar/week-view.tsx`

**What to do:**

The main weekly grid — CSS Grid with time labels on Y and days on X. Events positioned absolutely.

```tsx
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AppointmentCard } from "./appointment-card";
import type { CalendarAppointment, ProfessionalOption } from "./types";
import {
  GRID_START_HOUR,
  GRID_END_HOUR,
  getEventPosition,
  isSameDay,
  addDays,
} from "@/lib/calendar/utils";

interface WeekViewProps {
  weekStart: Date;
  appointments: CalendarAppointment[];
  professionals: ProfessionalOption[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function WeekView({
  weekStart,
  appointments,
  professionals,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const t = useTranslations("settings.weekdaysShort");
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const now = new Date();
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach((p) => map.set(p.id, p.color));
    return map;
  }, [professionals]);

  function getAppointmentsForDay(day: Date) {
    return appointments.filter((a) => isSameDay(new Date(a.starts_at), day));
  }

  function handleSlotClick(day: Date, hour: number) {
    const dateStr = day.toISOString().slice(0, 10);
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    onSlotClick(dateStr, timeStr);
  }

  // Now indicator position
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMin = GRID_START_HOUR * 60;
  const gridTotalMin = (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const nowPercent = ((nowMinutes - gridStartMin) / gridTotalMin) * 100;
  const showNowLine = nowPercent >= 0 && nowPercent <= 100;

  return (
    <div className="flex overflow-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* Time column */}
      <div className="sticky left-0 z-10 w-14 shrink-0" style={{ backgroundColor: "var(--background)" }}>
        <div className="h-10" /> {/* header spacer */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="flex h-16 items-start justify-end pr-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid flex-1 grid-cols-7">
        {days.map((day, dayIdx) => {
          const isToday = isSameDay(day, now);
          const dayAppointments = getAppointmentsForDay(day);

          return (
            <div key={dayIdx} className="border-l" style={{ borderColor: "var(--border)" }}>
              {/* Day header */}
              <div
                className={`sticky top-0 z-10 flex h-10 items-center justify-center gap-1 border-b text-xs font-medium ${
                  isToday ? "text-[var(--accent)]" : ""
                }`}
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                  color: isToday ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                <span>{t(WEEKDAY_KEYS[dayIdx])}</span>
                <span className={`${isToday ? "rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-white" : ""}`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Time slots */}
              <div className="relative">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="h-16 border-b transition-colors hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => handleSlotClick(day, h)}
                  />
                ))}

                {/* Now indicator */}
                {isToday && showNowLine && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 border-t-2"
                    style={{
                      top: `${nowPercent}%`,
                      borderColor: "var(--danger)",
                    }}
                  >
                    <div
                      className="absolute -left-1 -top-1.5 size-3 rounded-full"
                      style={{ backgroundColor: "var(--danger)" }}
                    />
                  </div>
                )}

                {/* Appointments */}
                {dayAppointments.map((appt) => {
                  const start = new Date(appt.starts_at);
                  const end = new Date(appt.ends_at);
                  const { top, height } = getEventPosition(start, end);
                  const profId = appt.professionals?.id ?? "";
                  const color = colorMap.get(profId) ?? "#6366f1";

                  return (
                    <div
                      key={appt.id}
                      className="absolute left-0 right-0 z-10"
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      <AppointmentCard
                        appointment={appt}
                        color={color}
                        compact
                        onClick={() => onAppointmentClick(appt)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Commit:** `feat: add week view calendar component`

---

### Task 12: DayView Component

**Files:**
- Create: `src/components/calendar/day-view.tsx`

**What to do:**

Single day view — same vertical time grid but wider events with more detail.

```tsx
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AppointmentCard } from "./appointment-card";
import type { CalendarAppointment, ProfessionalOption } from "./types";
import {
  GRID_START_HOUR,
  GRID_END_HOUR,
  getEventPosition,
  isSameDay,
} from "@/lib/calendar/utils";

interface DayViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  professionals: ProfessionalOption[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);

export function DayView({
  date,
  appointments,
  professionals,
  onSlotClick,
  onAppointmentClick,
}: DayViewProps) {
  const t = useTranslations("calendar");

  const dayAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.starts_at), date)),
    [appointments, date],
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach((p) => map.set(p.id, p.color));
    return map;
  }, [professionals]);

  const now = new Date();
  const isToday = isSameDay(date, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMin = GRID_START_HOUR * 60;
  const gridTotalMin = (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const nowPercent = ((nowMinutes - gridStartMin) / gridTotalMin) * 100;
  const showNowLine = isToday && nowPercent >= 0 && nowPercent <= 100;

  function handleSlotClick(hour: number) {
    const dateStr = date.toISOString().slice(0, 10);
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    onSlotClick(dateStr, timeStr);
  }

  return (
    <div className="flex overflow-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* Time column */}
      <div className="sticky left-0 z-10 w-14 shrink-0" style={{ backgroundColor: "var(--background)" }}>
        {HOURS.map((h) => (
          <div
            key={h}
            className="flex h-16 items-start justify-end pr-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* Day column */}
      <div className="relative flex-1 border-l" style={{ borderColor: "var(--border)" }}>
        {HOURS.map((h) => (
          <div
            key={h}
            className="h-16 border-b transition-colors hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() => handleSlotClick(h)}
          />
        ))}

        {/* Now indicator */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 border-t-2"
            style={{ top: `${nowPercent}%`, borderColor: "var(--danger)" }}
          >
            <div
              className="absolute -left-1 -top-1.5 size-3 rounded-full"
              style={{ backgroundColor: "var(--danger)" }}
            />
          </div>
        )}

        {/* Appointments */}
        {dayAppointments.map((appt) => {
          const start = new Date(appt.starts_at);
          const end = new Date(appt.ends_at);
          const { top, height } = getEventPosition(start, end);
          const profId = appt.professionals?.id ?? "";
          const color = colorMap.get(profId) ?? "#6366f1";

          return (
            <div
              key={appt.id}
              className="absolute left-0 right-0 z-10 px-1"
              style={{ top: `${top}%`, height: `${height}%` }}
            >
              <AppointmentCard
                appointment={appt}
                color={color}
                compact={false}
                onClick={() => onAppointmentClick(appt)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Commit:** `feat: add day view calendar component`

---

### Task 13: MonthView Component

**Files:**
- Create: `src/components/calendar/month-view.tsx`

**What to do:**

Classic 7x5 month grid. Each cell shows day number and appointment count.

```tsx
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CalendarAppointment } from "./types";
import { isSameDay } from "@/lib/calendar/utils";

interface MonthViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  onDayClick: (date: Date) => void;
}

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function MonthView({ date, appointments, onDayClick }: MonthViewProps) {
  const t = useTranslations("settings.weekdaysShort");
  const now = new Date();

  const { weeks } = useMemo(() => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Find Monday before or on the first day
    let start = new Date(firstDay);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    const weeks: Date[][] = [];
    const current = new Date(start);

    while (current <= lastDay || weeks.length < 5) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) break;
    }

    return { weeks };
  }, [date]);

  // Count appointments per day
  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const appt of appointments) {
      const key = new Date(appt.starts_at).toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [appointments]);

  const currentMonth = date.getMonth();

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-7">
        {WEEKDAY_KEYS.map((key) => (
          <div
            key={key}
            className="py-2 text-center text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {t(key)}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            const isCurrentMonth = day.getMonth() === currentMonth;
            const isToday = isSameDay(day, now);
            const key = day.toISOString().slice(0, 10);
            const count = countMap.get(key) ?? 0;

            return (
              <button
                key={di}
                onClick={() => onDayClick(day)}
                className="flex min-h-20 flex-col items-center border-b border-r p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                style={{
                  borderColor: "var(--border)",
                  opacity: isCurrentMonth ? 1 : 0.35,
                }}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                    isToday ? "bg-[var(--accent)] text-white" : ""
                  }`}
                  style={{ color: isToday ? undefined : "var(--text-primary)" }}
                >
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <span
                    className="mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: "var(--accent-muted)",
                      color: "var(--accent)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

**Commit:** `feat: add month view calendar component`

---

### Task 14: CalendarView — Main Container Component

**Files:**
- Create: `src/components/calendar/calendar-view.tsx`

**What to do:**

Main client component that manages state: current date, view mode, appointments data, filters, and modal.

```tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { AppointmentModal } from "./appointment-modal";
import type { CalendarAppointment, ProfessionalOption } from "./types";
import {
  getWeekRange,
  getDayRange,
  getMonthRange,
  addDays,
} from "@/lib/calendar/utils";

type ViewMode = "day" | "week" | "month";

interface CalendarViewProps {
  professionals: ProfessionalOption[];
}

export function CalendarView({ professionals }: CalendarViewProps) {
  const t = useTranslations("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("week");
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<CalendarAppointment | null>(null);
  const [prefillDate, setPrefillDate] = useState<string>();
  const [prefillTime, setPrefillTime] = useState<string>();

  const dateRange = useMemo(() => {
    switch (view) {
      case "day": return getDayRange(currentDate);
      case "week": return getWeekRange(currentDate);
      case "month": return getMonthRange(currentDate);
    }
  }, [currentDate, view]);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      });
      if (selectedProfessionalId) {
        params.set("professional_id", selectedProfessionalId);
      }

      const res = await fetch(`/api/calendar/appointments?${params}`);
      const json = await res.json();
      setAppointments(json.data ?? []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedProfessionalId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  function navigate(direction: number) {
    const d = new Date(currentDate);
    switch (view) {
      case "day":
        d.setDate(d.getDate() + direction);
        break;
      case "week":
        d.setDate(d.getDate() + direction * 7);
        break;
      case "month":
        d.setMonth(d.getMonth() + direction);
        break;
    }
    setCurrentDate(d);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function handleSlotClick(date: string, time: string) {
    setEditingAppointment(null);
    setPrefillDate(date);
    setPrefillTime(time);
    setModalOpen(true);
  }

  function handleAppointmentClick(appointment: CalendarAppointment) {
    setEditingAppointment(appointment);
    setPrefillDate(undefined);
    setPrefillTime(undefined);
    setModalOpen(true);
  }

  function handleDayClick(day: Date) {
    setCurrentDate(day);
    setView("day");
  }

  function handleNewAppointment() {
    setEditingAppointment(null);
    setPrefillDate(currentDate.toISOString().slice(0, 10));
    setPrefillTime("09:00");
    setModalOpen(true);
  }

  // Format header date
  const headerDate = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions =
      view === "month"
        ? { month: "long", year: "numeric" }
        : view === "week"
          ? { month: "long", year: "numeric" }
          : { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    return currentDate.toLocaleDateString("pt-BR", opts);
  }, [currentDate, view]);

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            {t("today")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <span
          className="text-sm font-semibold capitalize"
          style={{ color: "var(--text-primary)" }}
        >
          {headerDate}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Professional filter */}
          <select
            value={selectedProfessionalId}
            onChange={(e) => setSelectedProfessionalId(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            <option value="">{t("allProfessionals")}</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-[var(--accent)] text-white"
                    : "hover:bg-[rgba(255,255,255,0.04)]"
                }`}
                style={{
                  color: view === v ? undefined : "var(--text-secondary)",
                }}
              >
                {t(`views.${v}`)}
              </button>
            ))}
          </div>

          {/* New appointment */}
          <Button size="sm" onClick={handleNewAppointment}>
            <Plus className="size-4" />
            {t("newAppointment")}
          </Button>
        </div>
      </div>

      {/* Calendar body */}
      <div
        className="rounded-xl border"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        {loading && (
          <div className="flex h-32 items-center justify-center">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("noAppointments")}...
            </span>
          </div>
        )}

        {!loading && view === "week" && (
          <WeekView
            weekStart={getWeekRange(currentDate).start}
            appointments={appointments}
            professionals={professionals}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}

        {!loading && view === "day" && (
          <DayView
            date={currentDate}
            appointments={appointments}
            professionals={professionals}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}

        {!loading && view === "month" && (
          <MonthView
            date={currentDate}
            appointments={appointments}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {/* Professional legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {professionals.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Modal */}
      <AppointmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        appointment={editingAppointment}
        professionals={professionals}
        prefillDate={prefillDate}
        prefillTime={prefillTime}
        onSave={fetchAppointments}
      />
    </div>
  );
}
```

**Commit:** `feat: add calendar view main container component`

---

### Task 15: Calendar Page + Loading/Error States

**Files:**
- Create: `src/app/(dashboard)/calendar/page.tsx`
- Create: `src/app/(dashboard)/calendar/loading.tsx`
- Create: `src/app/(dashboard)/calendar/error.tsx`

**What to do:**

**`src/app/(dashboard)/calendar/page.tsx`** — Server Component that fetches professionals and renders CalendarView:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getProfessionalColor } from "@/lib/calendar/utils";

export default async function CalendarPage() {
  const t = await getTranslations("calendar");

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

  // Fetch active professionals
  const { data: professionals } = await admin
    .from("professionals")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("name");

  const professionalOptions = (professionals ?? []).map((p, i) => ({
    id: p.id as string,
    name: p.name as string,
    color: getProfessionalColor(i),
  }));

  return (
    <div>
      <h1
        className="mb-6 text-xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {t("title")}
      </h1>
      <CalendarView professionals={professionalOptions} />
    </div>
  );
}
```

**`src/app/(dashboard)/calendar/loading.tsx`**:

```tsx
export default function CalendarLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );
}
```

**`src/app/(dashboard)/calendar/error.tsx`**:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function CalendarError({ reset }: { reset: () => void }) {
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

**Commit:** `feat: add calendar page with loading and error states`

---

### Task 16: Update Database Types + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — add calendar API routes documentation
- Verify build with `npx tsc --noEmit`

**What to do:**

1. In `CLAUDE.md`, add calendar API routes to the route table. Find the existing "Settings API Routes" section (or a suitable route table) and add:

```markdown
### Calendar API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/calendar/appointments` | GET | List appointments by date range + optional professional filter |
| `/api/calendar/appointments` | POST | Create appointment (+ Google Calendar sync + confirmation queue) |
| `/api/calendar/appointments/[id]` | PUT | Update appointment (+ Google Calendar sync) |
| `/api/calendar/appointments/[id]` | DELETE | Delete appointment (+ Google Calendar cleanup) |
| `/api/calendar/patients/search` | GET | Search patients by name or phone for autocomplete |
```

2. In the Database section, add:
```markdown
- `appointments.insurance_plan_id` — optional FK to insurance_plans (added migration 010)
```

3. Run `npx tsc --noEmit` to verify no type errors.
4. Run `npm run build` to verify build passes.

**Commit:** `docs: update CLAUDE.md with calendar API routes and insurance_plan_id`

---

## Task Dependency Graph

```
Task 1 (migration) ─────────┐
Task 2 (validation) ─────┐  │
Task 3 (translations) ──┐│  │
Task 4 (sidebar) ──────┐││  │
                       ││││  │
                       ↓↓↓↓  ↓
Task 5 (GET/POST APIs) ←────┘ depends on: 1, 2
Task 6 (PUT/DELETE APIs) ←──── depends on: 1, 2
Task 7 (utils) ──────────┐
                          │
Task 8 (appointment card) ←── depends on: 7
Task 9 (patient search) ←──── depends on: 3
Task 10 (modal) ←──────────── depends on: 8, 9
Task 11 (week view) ←──────── depends on: 7, 8
Task 12 (day view) ←────────── depends on: 7, 8
Task 13 (month view) ←──────── depends on: 7
Task 14 (calendar view) ←───── depends on: 10, 11, 12, 13
Task 15 (page) ←─────────────── depends on: 14, 4
Task 16 (docs + build) ←──────── depends on: all
```

**Parallelizable groups:**
- Group A: Tasks 1, 2, 3, 4 (all independent)
- Group B: Tasks 5, 6, 7 (after Group A)
- Group C: Tasks 8, 9 (after Task 7)
- Group D: Tasks 10, 11, 12, 13 (after Group C)
- Group E: Tasks 14, 15 (sequential, after Group D)
- Group F: Task 16 (after all)
