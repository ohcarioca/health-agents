# Onboarding & Clinic Activation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the onboarding wizard to validate minimum clinic requirements and add a self-service activate/deactivate toggle in the sidebar.

**Architecture:** New DB column `is_active` on `clinics` table. Wizard rewritten to 5 focused steps that save data per-step. `ClinicStatusToggle` component in the sidebar calls `PUT /api/onboarding/activate` which validates 5 requirements before allowing activation. Webhook and cron guards check `is_active` before processing.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Supabase, Tailwind v4, next-intl, Zod

**Design doc:** `docs/plans/2026-02-17-onboarding-activation-design.md`

---

## Task 1: Database Migration — `is_active` Column

**Files:**
- Create: `supabase/migrations/011_clinic_is_active.sql`

**Step 1: Write the migration**

```sql
-- Add is_active flag to clinics table
-- false by default — clinic must meet minimum requirements before activation
ALTER TABLE clinics ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
```

**Step 2: Commit**

```bash
git add supabase/migrations/011_clinic_is_active.sql
git commit -m "feat: add is_active column to clinics table"
```

---

## Task 2: Onboarding Validation Schema

**Files:**
- Modify: `src/lib/validations/settings.ts` (append new schema)

**Step 1: Add the activate schema**

Append after the existing `operatingHoursSchema` export (line 103):

```ts
// --- Onboarding Activation ---

export const activateClinicSchema = z.object({
  active: z.boolean(),
});

export type ActivateClinicInput = z.infer<typeof activateClinicSchema>;
```

**Step 2: Commit**

```bash
git add src/lib/validations/settings.ts
git commit -m "feat: add activate clinic validation schema"
```

---

## Task 3: `GET /api/onboarding/status` Route

**Files:**
- Create: `src/app/api/onboarding/status/route.ts`

**Step 1: Write the test**

Create `src/__tests__/api/onboarding/status.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockGte = vi.fn();
const mockNot = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      mockFrom(table);
      return {
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return {
            eq: (...eqArgs: unknown[]) => {
              mockEq(...eqArgs);
              return {
                limit: () => ({ single: () => mockSingle() }),
                single: () => mockSingle(),
                eq: (...eqArgs2: unknown[]) => {
                  mockEq(...eqArgs2);
                  return {
                    not: (...notArgs: unknown[]) => {
                      mockNot(...notArgs);
                      return { gte: () => ({ maybeSingle: () => mockMaybeSingle() }) };
                    },
                    gte: (...gteArgs: unknown[]) => {
                      mockGte(...gteArgs);
                      return { maybeSingle: () => mockMaybeSingle() };
                    },
                    limit: () => ({ single: () => mockSingle() }),
                    maybeSingle: () => mockMaybeSingle(),
                  };
                },
                maybeSingle: () => mockMaybeSingle(),
              };
            },
          };
        },
      };
    },
  })),
}));

describe("GET /api/onboarding/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { GET } = await import("@/app/api/onboarding/status/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns requirements status for authenticated user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    // clinic_users lookup
    mockSingle
      .mockResolvedValueOnce({
        data: { clinic_id: "clinic-1", role: "owner" },
      })
      // clinic data
      .mockResolvedValueOnce({
        data: {
          is_active: false,
          operating_hours: { monday: [{ start: "08:00", end: "18:00" }] },
          whatsapp_phone_number_id: null,
          whatsapp_waba_id: null,
          whatsapp_access_token: null,
        },
      });

    // professional with schedule
    mockMaybeSingle.mockResolvedValueOnce({ data: null }); // no professional
    mockMaybeSingle.mockResolvedValueOnce({ data: null }); // no service
    mockMaybeSingle.mockResolvedValueOnce({ data: null }); // no google calendar

    const { GET } = await import("@/app/api/onboarding/status/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.is_active).toBe(false);
    expect(json.data.requirements).toHaveProperty("operating_hours");
    expect(json.data.requirements).toHaveProperty("whatsapp");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/onboarding/status.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the route**

Create `src/app/api/onboarding/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleGrid } from "@/lib/validations/settings";

function hasTimeBlocks(grid: unknown): boolean {
  if (!grid || typeof grid !== "object") return false;
  const scheduleGrid = grid as Record<string, unknown>;
  for (const day of Object.values(scheduleGrid)) {
    if (Array.isArray(day) && day.length > 0) return true;
  }
  return false;
}

async function getClinicContext() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return { clinicId: membership.clinic_id as string, admin };
}

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clinicId, admin } = ctx;

  // Fetch clinic
  const { data: clinic } = await admin
    .from("clinics")
    .select("is_active, operating_hours, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token")
    .eq("id", clinicId)
    .single();

  if (!clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  // Check 1: Operating hours
  const operatingHours = hasTimeBlocks(clinic.operating_hours);

  // Check 2: Professional with schedule
  const { data: profWithSchedule } = await admin
    .from("professionals")
    .select("id, schedule_grid")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const professionalSchedule = profWithSchedule !== null && hasTimeBlocks(profWithSchedule?.schedule_grid);

  // Check 3: Service with price linked to professional
  let serviceWithPrice = false;
  if (profWithSchedule) {
    const { data: profService } = await admin
      .from("professional_services")
      .select("price_cents")
      .eq("professional_id", profWithSchedule.id)
      .gt("price_cents", 0)
      .limit(1)
      .maybeSingle();

    serviceWithPrice = profService !== null;
  }

  // Check 4: WhatsApp configured
  const whatsapp = Boolean(
    clinic.whatsapp_phone_number_id &&
    clinic.whatsapp_waba_id &&
    clinic.whatsapp_access_token
  );

  // Check 5: Google Calendar connected
  const { data: profWithCalendar } = await admin
    .from("professionals")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .not("google_calendar_id", "is", null)
    .limit(1)
    .maybeSingle();

  const googleCalendar = profWithCalendar !== null;

  return NextResponse.json({
    data: {
      is_active: clinic.is_active as boolean,
      requirements: {
        operating_hours: operatingHours,
        professional_schedule: professionalSchedule,
        service_with_price: serviceWithPrice,
        whatsapp,
        google_calendar: googleCalendar,
      },
    },
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/onboarding/status.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/onboarding/status/route.ts src/__tests__/api/onboarding/status.test.ts
git commit -m "feat: add GET /api/onboarding/status route"
```

---

## Task 4: `PUT /api/onboarding/activate` Route

**Files:**
- Create: `src/app/api/onboarding/activate/route.ts`

**Step 1: Write the test**

Create `src/__tests__/api/onboarding/activate.test.ts` — test two scenarios:
1. Activation fails when requirements not met (returns 400 with `missing` array)
2. Deactivation always succeeds

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/onboarding/activate.test.ts`
Expected: FAIL

**Step 3: Write the route**

Create `src/app/api/onboarding/activate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClinicSchema } from "@/lib/validations/settings";

function hasTimeBlocks(grid: unknown): boolean {
  if (!grid || typeof grid !== "object") return false;
  const scheduleGrid = grid as Record<string, unknown>;
  for (const day of Object.values(scheduleGrid)) {
    if (Array.isArray(day) && day.length > 0) return true;
  }
  return false;
}

async function getClinicContext() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return { clinicId: membership.clinic_id as string, role: membership.role as string, admin };
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = activateClinicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can activate/deactivate the clinic" },
      { status: 403 },
    );
  }

  const { clinicId, admin } = ctx;
  const { active } = parsed.data;

  // Deactivation — no validation needed
  if (!active) {
    await admin
      .from("clinics")
      .update({ is_active: false })
      .eq("id", clinicId);

    return NextResponse.json({ data: { active: false } });
  }

  // Activation — validate all 5 requirements
  const missing: string[] = [];

  // 1. Clinic operating hours
  const { data: clinic } = await admin
    .from("clinics")
    .select("operating_hours, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token")
    .eq("id", clinicId)
    .single();

  if (!clinic || !hasTimeBlocks(clinic.operating_hours)) {
    missing.push("operating_hours");
  }

  // 2. Professional with schedule
  const { data: profWithSchedule } = await admin
    .from("professionals")
    .select("id, schedule_grid")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!profWithSchedule || !hasTimeBlocks(profWithSchedule.schedule_grid)) {
    missing.push("professional_schedule");
  }

  // 3. Service with price
  if (profWithSchedule) {
    const { data: profService } = await admin
      .from("professional_services")
      .select("price_cents")
      .eq("professional_id", profWithSchedule.id)
      .gt("price_cents", 0)
      .limit(1)
      .maybeSingle();

    if (!profService) {
      missing.push("service_with_price");
    }
  } else {
    missing.push("service_with_price");
  }

  // 4. WhatsApp
  if (
    !clinic?.whatsapp_phone_number_id ||
    !clinic?.whatsapp_waba_id ||
    !clinic?.whatsapp_access_token
  ) {
    missing.push("whatsapp");
  }

  // 5. Google Calendar
  const { data: profWithCalendar } = await admin
    .from("professionals")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .not("google_calendar_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!profWithCalendar) {
    missing.push("google_calendar");
  }

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "requirements_not_met", missing },
      { status: 400 },
    );
  }

  // All requirements met — activate
  await admin
    .from("clinics")
    .update({ is_active: true })
    .eq("id", clinicId);

  return NextResponse.json({ data: { active: true } });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/onboarding/activate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/onboarding/activate/route.ts src/__tests__/api/onboarding/activate.test.ts
git commit -m "feat: add PUT /api/onboarding/activate route"
```

---

## Task 5: `POST /api/integrations/whatsapp/test` Route

**Files:**
- Create: `src/app/api/integrations/whatsapp/test/route.ts`

**Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

const testWhatsappSchema = z.object({
  phone_number_id: z.string().min(1),
  access_token: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = testWhatsappSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { phone_number_id, access_token } = parsed.data;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phone_number_id}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: { valid: true } });
  } catch {
    return NextResponse.json(
      { error: "connection_failed" },
      { status: 500 },
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/integrations/whatsapp/test/route.ts
git commit -m "feat: add POST /api/integrations/whatsapp/test route"
```

---

## Task 6: i18n — New Onboarding Keys

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Replace the `onboarding` block in all 3 locale files**

**pt-BR.json** — replace lines 438-475 (the `"onboarding": { ... }` block):

```json
  "onboarding": {
    "step1": {
      "title": "Clínica e Horários",
      "description": "Configure os dados da clínica e o horário de funcionamento.",
      "clinicName": "Nome da Clínica",
      "phone": "Telefone",
      "address": "Endereço",
      "timezone": "Fuso Horário",
      "operatingHours": "Horário de Funcionamento",
      "operatingHoursHint": "Clique e arraste para definir os horários."
    },
    "step2": {
      "title": "Profissional e Serviço",
      "description": "Adicione o primeiro profissional, configure sua agenda e crie um serviço.",
      "profSection": "Profissional",
      "name": "Nome",
      "specialty": "Especialidade",
      "duration": "Duração da consulta (min)",
      "schedule": "Agenda do Profissional",
      "scheduleHint": "Clique e arraste para definir os horários de atendimento.",
      "serviceSection": "Serviço",
      "serviceName": "Nome do Serviço",
      "serviceDuration": "Duração (min)",
      "servicePrice": "Preço (R$)",
      "servicePriceHint": "Em reais. Ex: 150,00"
    },
    "step3": {
      "title": "WhatsApp",
      "description": "Conecte o WhatsApp Business para seus agentes receberem mensagens.",
      "phoneNumberId": "Phone Number ID",
      "wabaId": "WABA ID",
      "accessToken": "Access Token",
      "testConnection": "Testar Conexão",
      "testSuccess": "Conexão válida!",
      "testFailed": "Credenciais inválidas. Verifique os dados.",
      "testLoading": "Testando...",
      "helpText": "Encontre esses valores no Meta Business Manager."
    },
    "step4": {
      "title": "Google Calendar",
      "description": "Conecte o Google Calendar do profissional para sincronizar agendamentos.",
      "connectFor": "Conectar para {name}",
      "connected": "Conectado",
      "notConnected": "Não conectado",
      "connect": "Conectar Google Calendar",
      "waitingCallback": "Aguardando autorização..."
    },
    "step5": {
      "title": "Pacientes e Revisão",
      "description": "Adicione pacientes (opcional) e revise os requisitos.",
      "patientsSection": "Pacientes",
      "patientsOptional": "Opcional — você pode adicionar depois.",
      "importCard": "Importar arquivo",
      "importCardHint": "CSV ou XLSX",
      "addCard": "Adicionar manualmente",
      "addCardHint": "Um por vez",
      "addedCount": "{count} pacientes adicionados",
      "checklistSection": "Requisitos para Ativação",
      "requirement": {
        "operating_hours": "Horário de funcionamento",
        "professional_schedule": "Profissional com agenda",
        "service_with_price": "Serviço com preço",
        "whatsapp": "WhatsApp configurado",
        "google_calendar": "Google Calendar conectado"
      },
      "allMet": "Todos os requisitos atendidos!",
      "pending": "requisitos pendentes"
    },
    "back": "Voltar",
    "next": "Próximo",
    "finish": "Concluir",
    "finishing": "Concluindo..."
  },
  "activation": {
    "active": "Ativo",
    "inactive": "Inativo",
    "activate": "Ativar",
    "deactivate": "Desativar",
    "confirmDeactivate": "Seus agentes vão parar de responder. Tem certeza?",
    "confirmDeactivateTitle": "Desativar Clínica",
    "cancel": "Cancelar",
    "confirm": "Desativar",
    "activationFailed": "Não foi possível ativar. Requisitos pendentes:",
    "requirement": {
      "operating_hours": "Horário de funcionamento da clínica",
      "professional_schedule": "Profissional com agenda configurada",
      "service_with_price": "Serviço vinculado com preço",
      "whatsapp": "WhatsApp Business configurado",
      "google_calendar": "Google Calendar conectado"
    },
    "tooltip": {
      "active": "Agentes respondendo",
      "inactive": "Agentes pausados"
    }
  }
```

**en.json** — same structure, English translations:

```json
  "onboarding": {
    "step1": {
      "title": "Clinic & Hours",
      "description": "Set up your clinic details and operating hours.",
      "clinicName": "Clinic Name",
      "phone": "Phone",
      "address": "Address",
      "timezone": "Timezone",
      "operatingHours": "Operating Hours",
      "operatingHoursHint": "Click and drag to set hours."
    },
    "step2": {
      "title": "Professional & Service",
      "description": "Add your first professional, set their schedule, and create a service.",
      "profSection": "Professional",
      "name": "Name",
      "specialty": "Specialty",
      "duration": "Appointment duration (min)",
      "schedule": "Professional Schedule",
      "scheduleHint": "Click and drag to set availability.",
      "serviceSection": "Service",
      "serviceName": "Service Name",
      "serviceDuration": "Duration (min)",
      "servicePrice": "Price",
      "servicePriceHint": "In your currency. E.g.: 150.00"
    },
    "step3": {
      "title": "WhatsApp",
      "description": "Connect WhatsApp Business so your agents can receive messages.",
      "phoneNumberId": "Phone Number ID",
      "wabaId": "WABA ID",
      "accessToken": "Access Token",
      "testConnection": "Test Connection",
      "testSuccess": "Connection valid!",
      "testFailed": "Invalid credentials. Check your details.",
      "testLoading": "Testing...",
      "helpText": "Find these values in Meta Business Manager."
    },
    "step4": {
      "title": "Google Calendar",
      "description": "Connect Google Calendar for the professional to sync appointments.",
      "connectFor": "Connect for {name}",
      "connected": "Connected",
      "notConnected": "Not connected",
      "connect": "Connect Google Calendar",
      "waitingCallback": "Waiting for authorization..."
    },
    "step5": {
      "title": "Patients & Review",
      "description": "Add patients (optional) and review requirements.",
      "patientsSection": "Patients",
      "patientsOptional": "Optional — you can add later.",
      "importCard": "Import file",
      "importCardHint": "CSV or XLSX",
      "addCard": "Add manually",
      "addCardHint": "One at a time",
      "addedCount": "{count} patients added",
      "checklistSection": "Activation Requirements",
      "requirement": {
        "operating_hours": "Operating hours",
        "professional_schedule": "Professional with schedule",
        "service_with_price": "Service with price",
        "whatsapp": "WhatsApp configured",
        "google_calendar": "Google Calendar connected"
      },
      "allMet": "All requirements met!",
      "pending": "requirements pending"
    },
    "back": "Back",
    "next": "Next",
    "finish": "Finish",
    "finishing": "Finishing..."
  },
  "activation": {
    "active": "Active",
    "inactive": "Inactive",
    "activate": "Activate",
    "deactivate": "Deactivate",
    "confirmDeactivate": "Your agents will stop responding. Are you sure?",
    "confirmDeactivateTitle": "Deactivate Clinic",
    "cancel": "Cancel",
    "confirm": "Deactivate",
    "activationFailed": "Cannot activate. Pending requirements:",
    "requirement": {
      "operating_hours": "Clinic operating hours",
      "professional_schedule": "Professional with schedule configured",
      "service_with_price": "Service linked with price",
      "whatsapp": "WhatsApp Business configured",
      "google_calendar": "Google Calendar connected"
    },
    "tooltip": {
      "active": "Agents responding",
      "inactive": "Agents paused"
    }
  }
```

**es.json** — same structure, Spanish translations:

```json
  "onboarding": {
    "step1": {
      "title": "Clínica y Horarios",
      "description": "Configure los datos de la clínica y el horario de atención.",
      "clinicName": "Nombre de la Clínica",
      "phone": "Teléfono",
      "address": "Dirección",
      "timezone": "Zona Horaria",
      "operatingHours": "Horario de Atención",
      "operatingHoursHint": "Haga clic y arrastre para definir los horarios."
    },
    "step2": {
      "title": "Profesional y Servicio",
      "description": "Agregue el primer profesional, configure su agenda y cree un servicio.",
      "profSection": "Profesional",
      "name": "Nombre",
      "specialty": "Especialidad",
      "duration": "Duración de la consulta (min)",
      "schedule": "Agenda del Profesional",
      "scheduleHint": "Haga clic y arrastre para definir los horarios de atención.",
      "serviceSection": "Servicio",
      "serviceName": "Nombre del Servicio",
      "serviceDuration": "Duración (min)",
      "servicePrice": "Precio",
      "servicePriceHint": "En su moneda. Ej: 150,00"
    },
    "step3": {
      "title": "WhatsApp",
      "description": "Conecte WhatsApp Business para que sus agentes reciban mensajes.",
      "phoneNumberId": "Phone Number ID",
      "wabaId": "WABA ID",
      "accessToken": "Access Token",
      "testConnection": "Probar Conexión",
      "testSuccess": "¡Conexión válida!",
      "testFailed": "Credenciales inválidas. Verifique los datos.",
      "testLoading": "Probando...",
      "helpText": "Encuentre estos valores en Meta Business Manager."
    },
    "step4": {
      "title": "Google Calendar",
      "description": "Conecte Google Calendar del profesional para sincronizar citas.",
      "connectFor": "Conectar para {name}",
      "connected": "Conectado",
      "notConnected": "No conectado",
      "connect": "Conectar Google Calendar",
      "waitingCallback": "Esperando autorización..."
    },
    "step5": {
      "title": "Pacientes y Revisión",
      "description": "Agregue pacientes (opcional) y revise los requisitos.",
      "patientsSection": "Pacientes",
      "patientsOptional": "Opcional — puede agregar después.",
      "importCard": "Importar archivo",
      "importCardHint": "CSV o XLSX",
      "addCard": "Agregar manualmente",
      "addCardHint": "Uno a la vez",
      "addedCount": "{count} pacientes agregados",
      "checklistSection": "Requisitos para Activación",
      "requirement": {
        "operating_hours": "Horario de atención",
        "professional_schedule": "Profesional con agenda",
        "service_with_price": "Servicio con precio",
        "whatsapp": "WhatsApp configurado",
        "google_calendar": "Google Calendar conectado"
      },
      "allMet": "¡Todos los requisitos cumplidos!",
      "pending": "requisitos pendientes"
    },
    "back": "Volver",
    "next": "Siguiente",
    "finish": "Finalizar",
    "finishing": "Finalizando..."
  },
  "activation": {
    "active": "Activo",
    "inactive": "Inactivo",
    "activate": "Activar",
    "deactivate": "Desactivar",
    "confirmDeactivate": "Sus agentes dejarán de responder. ¿Está seguro?",
    "confirmDeactivateTitle": "Desactivar Clínica",
    "cancel": "Cancelar",
    "confirm": "Desactivar",
    "activationFailed": "No se puede activar. Requisitos pendientes:",
    "requirement": {
      "operating_hours": "Horario de atención de la clínica",
      "professional_schedule": "Profesional con agenda configurada",
      "service_with_price": "Servicio vinculado con precio",
      "whatsapp": "WhatsApp Business configurado",
      "google_calendar": "Google Calendar conectado"
    },
    "tooltip": {
      "active": "Agentes respondiendo",
      "inactive": "Agentes pausados"
    }
  }
```

**Step 2: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add i18n keys for onboarding wizard and activation toggle"
```

---

## Task 7: `ClinicStatusToggle` Component

**Files:**
- Create: `src/components/layout/clinic-status-toggle.tsx`
- Modify: `src/components/layout/sidebar.tsx` (add toggle)
- Modify: `src/app/(dashboard)/layout.tsx` (pass `isActive` prop)

**Step 1: Create the component**

Create `src/components/layout/clinic-status-toggle.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Tooltip from "@radix-ui/react-tooltip";

interface ClinicStatusToggleProps {
  initialActive: boolean;
  collapsed: boolean;
}

const REQUIREMENT_KEYS = [
  "operating_hours",
  "professional_schedule",
  "service_with_price",
  "whatsapp",
  "google_calendar",
] as const;

export function ClinicStatusToggle({ initialActive, collapsed }: ClinicStatusToggleProps) {
  const t = useTranslations("activation");
  const [active, setActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [missingRequirements, setMissingRequirements] = useState<string[]>([]);

  async function handleToggle() {
    if (active) {
      // Deactivate — show confirmation
      setShowConfirm(true);
      return;
    }

    // Activate — call API
    setLoading(true);
    setMissingRequirements([]);
    try {
      const res = await fetch("/api/onboarding/activate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });

      if (res.ok) {
        setActive(true);
      } else {
        const json = await res.json();
        if (json.missing && Array.isArray(json.missing)) {
          setMissingRequirements(json.missing);
        }
      }
    } catch {
      // Silent — keep current state
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeactivate() {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/activate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });

      if (res.ok) {
        setActive(false);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }

  const dotColor = active ? "var(--status-success)" : "var(--text-muted)";

  // Collapsed: just a dot with tooltip
  if (collapsed) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="flex justify-center px-2 py-3">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--surface-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {active ? t("tooltip.active") : t("tooltip.inactive")}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* Toggle row */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
        style={{ color: "var(--text-secondary)" }}
      >
        <div
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span className="flex-1 text-left text-xs font-medium">
          {active ? t("active") : t("inactive")}
        </span>
        {/* Toggle switch */}
        <div
          className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
          style={{
            backgroundColor: active ? "var(--accent)" : "var(--surface-elevated)",
          }}
        >
          <div
            className="absolute top-0.5 size-4 rounded-full transition-transform"
            style={{
              backgroundColor: "white",
              transform: active ? "translateX(16px)" : "translateX(2px)",
            }}
          />
        </div>
      </button>

      {/* Missing requirements toast */}
      {missingRequirements.length > 0 && (
        <div
          className="mt-2 rounded-lg p-2.5 text-xs"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--status-danger)",
          }}
        >
          <p className="mb-1 font-medium">{t("activationFailed")}</p>
          <ul className="space-y-0.5 pl-3">
            {missingRequirements.map((key) => (
              <li key={key}>• {t(`requirement.${key}`)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Deactivation confirmation dialog */}
      {showConfirm && (
        <div
          className="mt-2 rounded-lg border p-3"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <p
            className="mb-2 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("confirmDeactivate")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmDeactivate}
              disabled={loading}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--status-danger)" }}
            >
              {t("confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Modify `sidebar.tsx` — add toggle between nav and bottom**

In `src/components/layout/sidebar.tsx`, add the import and pass `isActive` prop:

Add import at top:
```ts
import { ClinicStatusToggle } from "./clinic-status-toggle";
```

Update the `SidebarProps` interface:
```ts
interface SidebarProps {
  clinicName: string;
  userName: string;
  userEmail: string;
  isActive: boolean;
}
```

Update the function signature:
```ts
export function Sidebar({ clinicName, userName, userEmail, isActive }: SidebarProps) {
```

Add the toggle between nav and bottom section. Replace:
```tsx
        {/* Bottom: locale + theme + user */}
        <div className="space-y-2">
```

With:
```tsx
        {/* Activation toggle */}
        <div
          className="border-t"
          style={{ borderColor: "var(--glass-border)" }}
        >
          <ClinicStatusToggle initialActive={isActive} collapsed={collapsed} />
        </div>

        {/* Bottom: locale + theme + user */}
        <div className="space-y-2">
```

**Step 3: Modify `layout.tsx` — pass `isActive` to Sidebar**

In `src/app/(dashboard)/layout.tsx`, update the clinic query to include `is_active`:

Change line 24:
```ts
    .select("clinic_id, role, clinics(name, phone)")
```
To:
```ts
    .select("clinic_id, role, clinics(name, phone, is_active)")
```

Update the type cast on line 30:
```ts
  const clinic = membership?.clinics as { name: string; phone: string | null; is_active: boolean } | null;
```

Add before the return:
```ts
  const isActive = clinic?.is_active ?? false;
```

Add prop to Sidebar:
```tsx
      <Sidebar
        clinicName={clinicName}
        userName={userName}
        userEmail={userEmail}
        isActive={isActive}
      />
```

**Step 4: Commit**

```bash
git add src/components/layout/clinic-status-toggle.tsx src/components/layout/sidebar.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add ClinicStatusToggle to sidebar"
```

---

## Task 8: Rewrite Onboarding Wizard

**Files:**
- Rewrite: `src/app/(onboarding)/setup/page.tsx`
- Modify: `src/app/api/onboarding/route.ts` (delete or simplify — wizard now saves per-step)

**Step 1: Delete the old onboarding API route**

The old `POST /api/onboarding` route saved everything at the end. The new wizard saves per-step via existing `/api/settings/*` routes. Delete the file:

`src/app/api/onboarding/route.ts` — delete this file entirely. The wizard will use:
- `PUT /api/settings/clinic` (step 1, step 3)
- `POST /api/settings/professionals` (step 2)
- `POST /api/settings/services` (step 2)
- `PUT /api/settings/professionals/[id]/services` (step 2)
- `POST /api/integrations/google-calendar/connect` (step 4)

**Step 2: Rewrite `setup/page.tsx`**

This is the largest component. Key behaviors:

- 5 steps, saves per-step
- On mount, fetches existing clinic/professional data to pre-fill (resume support)
- Step 1: clinic info + `CompactScheduleGrid` for operating_hours
- Step 2: professional + schedule + service creation
- Step 3: WhatsApp credentials + test button
- Step 4: Google Calendar OAuth connect
- Step 5: patients (optional) + requirements checklist

Create `src/app/(onboarding)/setup/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CompactScheduleGrid } from "@/components/settings/compact-schedule-grid";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { PatientImportDialog } from "@/components/patients/patient-import-dialog";
import { Upload, UserPlus, X, Check, Circle, CalendarDays } from "lucide-react";
import type { ScheduleGrid } from "@/lib/validations/settings";

const TOTAL_STEPS = 5;

const EMPTY_SCHEDULE: ScheduleGrid = {
  monday: [], tuesday: [], wednesday: [], thursday: [],
  friday: [], saturday: [], sunday: [],
};

interface RequirementsStatus {
  operating_hours: boolean;
  professional_schedule: boolean;
  service_with_price: boolean;
  whatsapp: boolean;
  google_calendar: boolean;
}

export default function SetupPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Support returning to a specific step (e.g., after Google Calendar OAuth callback)
  const initialStep = Number(searchParams.get("step")) || 1;
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Step 1: Clinic data
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(EMPTY_SCHEDULE);

  // Step 2: Professional + Service
  const [profName, setProfName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [duration, setDuration] = useState(30);
  const [profSchedule, setProfSchedule] = useState<ScheduleGrid>(EMPTY_SCHEDULE);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState(30);
  const [servicePrice, setServicePrice] = useState("");
  const [createdProfId, setCreatedProfId] = useState<string | null>(null);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);

  // Step 3: WhatsApp
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappTestResult, setWhatsappTestResult] = useState<"success" | "failed" | null>(null);
  const [whatsappTesting, setWhatsappTesting] = useState(false);

  // Step 4: Google Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Step 5: Patients + Checklist
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [addedPatients, setAddedPatients] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [requirements, setRequirements] = useState<RequirementsStatus | null>(null);

  // Load existing data on mount (resume support)
  useEffect(() => {
    async function loadExisting() {
      try {
        // Load clinic data
        const clinicRes = await fetch("/api/settings/clinic");
        if (clinicRes.ok) {
          const { data } = await clinicRes.json();
          if (data) {
            if (data.name) setClinicName(data.name);
            if (data.phone) setPhone(data.phone);
            if (data.address) setAddress(data.address);
            if (data.timezone) setTimezone(data.timezone);
            if (data.operating_hours) setOperatingHours(data.operating_hours);
            if (data.whatsapp_phone_number_id) setWhatsappPhoneNumberId(data.whatsapp_phone_number_id);
            if (data.whatsapp_waba_id) setWhatsappWabaId(data.whatsapp_waba_id);
            if (data.whatsapp_access_token) setWhatsappAccessToken(data.whatsapp_access_token);
          }
        }

        // Load professionals
        const profRes = await fetch("/api/settings/professionals");
        if (profRes.ok) {
          const { data } = await profRes.json();
          if (data && Array.isArray(data) && data.length > 0) {
            const prof = data[0];
            setProfName(prof.name);
            setSpecialty(prof.specialty || "");
            setDuration(prof.appointment_duration_minutes || 30);
            if (prof.schedule_grid) setProfSchedule(prof.schedule_grid);
            setCreatedProfId(prof.id);
            if (prof.google_calendar_id) setCalendarConnected(true);
          }
        }

        // Load services
        const svcRes = await fetch("/api/settings/services");
        if (svcRes.ok) {
          const { data } = await svcRes.json();
          if (data && Array.isArray(data) && data.length > 0) {
            const svc = data[0];
            setServiceName(svc.name);
            setServiceDuration(svc.duration_minutes || 30);
            if (svc.price_cents) setServicePrice(String(svc.price_cents / 100));
            setCreatedServiceId(svc.id);
          }
        }

        // Check calendar callback success
        if (searchParams.get("success") === "calendar_connected") {
          setCalendarConnected(true);
        }
      } catch {
        // Silent — start fresh
      } finally {
        setInitialLoading(false);
      }
    }

    loadExisting();
  }, [searchParams]);

  // Fetch requirements when entering step 5
  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/status");
      if (res.ok) {
        const { data } = await res.json();
        setRequirements(data.requirements);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (step === 5) {
      fetchRequirements();
    }
  }, [step, fetchRequirements]);

  // --- Step handlers ---

  async function saveStep1() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clinicName,
          phone,
          address,
          timezone,
          operating_hours: operatingHours,
        }),
      });
      if (res.ok) setStep(2);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  async function saveStep2() {
    setLoading(true);
    try {
      let profId = createdProfId;
      let svcId = createdServiceId;

      // Create or update professional
      if (!profId) {
        const profRes = await fetch("/api/settings/professionals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profName,
            specialty,
            appointment_duration_minutes: duration,
            schedule_grid: profSchedule,
          }),
        });
        if (profRes.ok) {
          const { data } = await profRes.json();
          profId = data.id;
          setCreatedProfId(profId);
        } else {
          return;
        }
      } else {
        // Update existing professional
        await fetch(`/api/settings/professionals/${profId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profName,
            specialty,
            appointment_duration_minutes: duration,
            schedule_grid: profSchedule,
          }),
        });
      }

      // Create or update service
      const priceCents = Math.round(parseFloat(servicePrice || "0") * 100);
      if (!svcId) {
        const svcRes = await fetch("/api/settings/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: serviceName,
            duration_minutes: serviceDuration,
            price_cents: priceCents,
          }),
        });
        if (svcRes.ok) {
          const { data } = await svcRes.json();
          svcId = data.id;
          setCreatedServiceId(svcId);
        } else {
          return;
        }
      } else {
        await fetch(`/api/settings/services/${svcId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: serviceName,
            duration_minutes: serviceDuration,
            price_cents: priceCents,
          }),
        });
      }

      // Link service to professional
      if (profId && svcId) {
        await fetch(`/api/settings/professionals/${profId}/services`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            services: [{ service_id: svcId, price_cents: priceCents }],
          }),
        });
      }

      setStep(3);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  async function saveStep3() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clinicName,
          whatsapp_phone_number_id: whatsappPhoneNumberId,
          whatsapp_waba_id: whatsappWabaId,
          whatsapp_access_token: whatsappAccessToken,
        }),
      });
      if (res.ok) setStep(4);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  async function testWhatsapp() {
    setWhatsappTesting(true);
    setWhatsappTestResult(null);
    try {
      const res = await fetch("/api/integrations/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: whatsappPhoneNumberId,
          access_token: whatsappAccessToken,
        }),
      });
      setWhatsappTestResult(res.ok ? "success" : "failed");
    } catch {
      setWhatsappTestResult("failed");
    } finally {
      setWhatsappTesting(false);
    }
  }

  async function connectCalendar() {
    if (!createdProfId) return;
    setCalendarLoading(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professional_id: createdProfId }),
      });
      if (res.ok) {
        const { data } = await res.json();
        if (data?.url) {
          // Redirect to Google OAuth — callback will return to /setup?step=4&success=calendar_connected
          window.location.href = data.url;
        }
      }
    } catch {
      // Silent
    } finally {
      setCalendarLoading(false);
    }
  }

  async function handlePatientAdded() {
    try {
      const res = await fetch("/api/patients?page=1");
      if (res.ok) {
        const json = await res.json();
        setAddedPatients(
          (json.data ?? []).slice(0, 10).map((p: { id: string; name: string; phone: string }) => ({
            id: p.id, name: p.name, phone: p.phone,
          }))
        );
      }
    } catch {
      // Silent
    }
    setAddDialogOpen(false);
  }

  function handleImportDone() {
    handlePatientAdded();
    setImportDialogOpen(false);
  }

  async function removePatient(id: string) {
    const res = await fetch(`/api/patients/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAddedPatients((prev) => prev.filter((p) => p.id !== id));
    }
  }

  function handleComplete() {
    router.push("/");
    router.refresh();
  }

  function handleNext() {
    switch (step) {
      case 1: saveStep1(); break;
      case 2: saveStep2(); break;
      case 3: saveStep3(); break;
      case 4: setStep(5); break;
      case 5: handleComplete(); break;
    }
  }

  function prevStep() {
    if (step > 1) setStep(step - 1);
  }

  const stepTitles = [
    t("step1.title"),
    t("step2.title"),
    t("step3.title"),
    t("step4.title"),
    t("step5.title"),
  ];

  const canAdvance = (() => {
    switch (step) {
      case 1: return clinicName.trim().length >= 2 && phone.trim().length > 0;
      case 2: return profName.trim().length >= 2 && serviceName.trim().length >= 2 && parseFloat(servicePrice || "0") > 0;
      case 3: return whatsappPhoneNumberId.trim().length > 0 && whatsappWabaId.trim().length > 0 && whatsappAccessToken.trim().length > 0;
      case 4: return true; // Can skip or advance after connecting
      case 5: return true;
      default: return true;
    }
  })();

  if (initialLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {stepTitles[step - 1]}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {step}/{TOTAL_STEPS}
          </span>
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <div
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: "var(--accent)",
              width: `${(step / TOTAL_STEPS) * 100}%`,
            }}
          />
        </div>
      </div>

      <Card variant="glass">
        {/* Step 1: Clinic + Operating Hours */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step1.description")}
            </p>
            <Input
              id="clinicName"
              label={t("step1.clinicName")}
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              required
            />
            <Input
              id="phone"
              label={t("step1.phone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Input
              id="address"
              label={t("step1.address")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Input
              id="timezone"
              label={t("step1.timezone")}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("step1.operatingHours")}
              </label>
              <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {t("step1.operatingHoursHint")}
              </p>
              <CompactScheduleGrid value={operatingHours} onChange={setOperatingHours} />
            </div>
          </div>
        )}

        {/* Step 2: Professional + Schedule + Service */}
        {step === 2 && (
          <div className="space-y-6">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step2.description")}
            </p>

            {/* Professional section */}
            <div className="space-y-3">
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t("step2.profSection")}
              </h3>
              <Input
                id="profName"
                label={t("step2.name")}
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                required
              />
              <Input
                id="specialty"
                label={t("step2.specialty")}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              />
              <Input
                id="duration"
                label={t("step2.duration")}
                type="number"
                value={String(duration)}
                onChange={(e) => setDuration(Number(e.target.value) || 30)}
              />
              <div>
                <label
                  className="mb-2 block text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("step2.schedule")}
                </label>
                <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("step2.scheduleHint")}
                </p>
                <CompactScheduleGrid value={profSchedule} onChange={setProfSchedule} />
              </div>
            </div>

            {/* Service section */}
            <div
              className="space-y-3 border-t pt-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t("step2.serviceSection")}
              </h3>
              <Input
                id="serviceName"
                label={t("step2.serviceName")}
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="serviceDuration"
                  label={t("step2.serviceDuration")}
                  type="number"
                  value={String(serviceDuration)}
                  onChange={(e) => setServiceDuration(Number(e.target.value) || 30)}
                />
                <div>
                  <Input
                    id="servicePrice"
                    label={t("step2.servicePrice")}
                    type="number"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("step2.servicePriceHint")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: WhatsApp */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step3.description")}
            </p>
            <Input
              id="whatsappPhoneNumberId"
              label={t("step3.phoneNumberId")}
              value={whatsappPhoneNumberId}
              onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
              required
            />
            <Input
              id="whatsappWabaId"
              label={t("step3.wabaId")}
              value={whatsappWabaId}
              onChange={(e) => setWhatsappWabaId(e.target.value)}
              required
            />
            <Input
              id="whatsappAccessToken"
              label={t("step3.accessToken")}
              value={whatsappAccessToken}
              onChange={(e) => setWhatsappAccessToken(e.target.value)}
              required
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step3.helpText")}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={testWhatsapp}
                disabled={whatsappTesting || !whatsappPhoneNumberId || !whatsappAccessToken}
              >
                {whatsappTesting ? t("step3.testLoading") : t("step3.testConnection")}
              </Button>
              {whatsappTestResult === "success" && (
                <span className="text-xs font-medium" style={{ color: "var(--status-success)" }}>
                  {t("step3.testSuccess")}
                </span>
              )}
              {whatsappTestResult === "failed" && (
                <span className="text-xs font-medium" style={{ color: "var(--status-danger)" }}>
                  {t("step3.testFailed")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Google Calendar */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step4.description")}
            </p>

            {createdProfId && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.02)" }}
              >
                <CalendarDays
                  className="size-5"
                  strokeWidth={1.75}
                  style={{ color: "var(--accent)" }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {profName}
                  </p>
                  {specialty && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {specialty}
                    </p>
                  )}
                </div>
                <Badge variant={calendarConnected ? "success" : "neutral"}>
                  {calendarConnected ? t("step4.connected") : t("step4.notConnected")}
                </Badge>
                {!calendarConnected && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={connectCalendar}
                    disabled={calendarLoading}
                  >
                    {calendarLoading ? <Spinner size="sm" /> : t("step4.connect")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Patients (optional) + Checklist */}
        {step === 5 && (
          <div className="space-y-6">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step5.description")}
            </p>

            {/* Patients section */}
            <div className="space-y-3">
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t("step5.patientsSection")}
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("step5.patientsOptional")}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setImportDialogOpen(true)}
                  className="flex flex-col items-center gap-2 rounded-xl border p-6 transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
                >
                  <Upload className="size-8" style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t("step5.importCard")}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("step5.importCardHint")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAddDialogOpen(true)}
                  className="flex flex-col items-center gap-2 rounded-xl border p-6 transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
                >
                  <UserPlus className="size-8" style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t("step5.addCard")}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("step5.addCardHint")}
                  </span>
                </button>
              </div>

              {addedPatients.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    {t("step5.addedCount", { count: addedPatients.length })}
                  </p>
                  <div className="space-y-1">
                    {addedPatients.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                        style={{ backgroundColor: "var(--surface)" }}
                      >
                        <span style={{ color: "var(--text-primary)" }}>
                          {p.name} — <span style={{ color: "var(--text-muted)" }}>{p.phone}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removePatient(p.id)}
                          className="rounded p-1 transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <PatientFormDialog
                open={addDialogOpen}
                onOpenChange={setAddDialogOpen}
                onSuccess={handlePatientAdded}
              />
              <PatientImportDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                onSuccess={handleImportDone}
              />
            </div>

            {/* Requirements checklist */}
            <div
              className="space-y-3 border-t pt-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {t("step5.checklistSection")}
              </h3>
              {requirements && (
                <div className="space-y-2">
                  {(Object.entries(requirements) as [string, boolean][]).map(([key, met]) => (
                    <div key={key} className="flex items-center gap-2">
                      {met ? (
                        <Check
                          className="size-4"
                          strokeWidth={2}
                          style={{ color: "var(--status-success)" }}
                        />
                      ) : (
                        <Circle
                          className="size-4"
                          strokeWidth={1.5}
                          style={{ color: "var(--text-muted)" }}
                        />
                      )}
                      <span
                        className="text-sm"
                        style={{ color: met ? "var(--text-primary)" : "var(--text-muted)" }}
                      >
                        {t(`step5.requirement.${key}`)}
                      </span>
                    </div>
                  ))}

                  {Object.values(requirements).every(Boolean) ? (
                    <p
                      className="mt-2 text-xs font-medium"
                      style={{ color: "var(--status-success)" }}
                    >
                      {t("step5.allMet")}
                    </p>
                  ) : (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {Object.values(requirements).filter((v) => !v).length} {t("step5.pending")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={step === 1}
          >
            {t("back")}
          </Button>
          <Button
            onClick={handleNext}
            disabled={loading || !canAdvance}
          >
            {loading ? <Spinner size="sm" /> : step === TOTAL_STEPS ? t("finish") : t("next")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

**Step 3: Delete the old onboarding API route**

Delete: `src/app/api/onboarding/route.ts`

**Step 4: Commit**

```bash
git rm src/app/api/onboarding/route.ts
git add src/app/\(onboarding\)/setup/page.tsx
git commit -m "feat: rewrite onboarding wizard with 5 requirement-focused steps"
```

---

## Task 9: Google Calendar Callback — Support Returning to Setup

**Files:**
- Modify: `src/app/api/integrations/google-calendar/callback/route.ts`

**Step 1: Modify callback to support `return_to` parameter**

The callback currently always redirects to `/settings?tab=integrations`. We need it to also support redirecting back to `/setup?step=4` when called from the onboarding wizard.

In `src/app/api/integrations/google-calendar/connect/route.ts`, the `state` parameter is currently just the `professional_id`. Update it to encode both `professional_id` and `return_to`:

Actually, a simpler approach: modify the callback to check if there's a `return_to` cookie or query param. But the simplest approach is: the wizard uses the existing OAuth flow, and on success the callback redirects to `/settings?tab=integrations&success=calendar_connected`. We just need the wizard to detect this on mount.

Alternative simpler approach: encode the return URL in the state parameter as `professionalId::returnTo`.

In `src/app/api/integrations/google-calendar/connect/route.ts`, update to accept an optional `return_to` in the body and encode it in state:

```ts
// In the POST handler, after getting professional_id:
const returnTo = typeof body.return_to === "string" ? body.return_to : null;
const stateValue = returnTo ? `${professionalId}::${returnTo}` : professionalId;
// Pass stateValue to getConsentUrl
```

In `src/app/api/integrations/google-calendar/callback/route.ts`, decode the state:

```ts
// After getting state from searchParams:
let professionalId = state;
let returnTo = "/settings?tab=integrations";

if (state.includes("::")) {
  const [profId, returnPath] = state.split("::");
  professionalId = profId;
  returnTo = returnPath;
}

// On success, redirect to returnTo + "&success=calendar_connected"
```

The wizard will call connect with `return_to: "/setup?step=4"`.

**Step 2: Commit**

```bash
git add src/app/api/integrations/google-calendar/connect/route.ts src/app/api/integrations/google-calendar/callback/route.ts
git commit -m "feat: support return_to redirect in google calendar oauth flow"
```

---

## Task 10: WhatsApp Webhook Guard

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts`

**Step 1: Add `is_active` check**

In the `after()` callback (line 86-114), after the clinic lookup (line 91-95), add the guard:

After line 95 (`maybeSingle()`), update the clinic query to include `is_active` and add the check:

Change:
```ts
        const { data: clinic } = await supabase
          .from("clinics")
          .select("id")
          .eq("phone", displayPhone)
          .maybeSingle();

        if (!clinic) {
```

To:
```ts
        const { data: clinic } = await supabase
          .from("clinics")
          .select("id, is_active")
          .eq("phone", displayPhone)
          .maybeSingle();

        if (!clinic) {
          console.error(
            `[webhook/whatsapp] no clinic found for display_phone=${displayPhone}`
          );
          return;
        }

        if (!clinic.is_active) {
          console.log(
            `[webhook/whatsapp] ignoring message: clinic ${clinic.id} is not active`
          );
          return;
        }
```

Note: Remove the duplicate error log that was already there after the `if (!clinic)` block.

**Step 2: Commit**

```bash
git add src/app/api/webhooks/whatsapp/route.ts
git commit -m "feat: add is_active guard to whatsapp webhook"
```

---

## Task 11: Cron Job Guards

**Files:**
- Modify: `src/app/api/cron/confirmations/route.ts`
- Modify: `src/app/api/cron/nps/route.ts`
- Modify: `src/app/api/cron/billing/route.ts`
- Modify: `src/app/api/cron/recall/route.ts`
- Modify: `src/app/api/cron/recall-send/route.ts`

**Step 1: Add `is_active` check to each cron route**

The approach differs by route:

**`/cron/confirmations`** — Add `is_active` to the clinic fetch (line 158-162). After fetching clinic, add check:

Change the clinic select to include `is_active`:
```ts
        .select("timezone, is_active, whatsapp_phone_number_id, whatsapp_access_token")
```

Add after the clinic null check (after line 172):
```ts
      if (!clinic.is_active) {
        console.log(`[cron/confirmations] skipping entry ${entry.id}: clinic is not active`);
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }
```

**`/cron/nps`** — Same pattern: add `is_active` to clinic select, skip if inactive.

**`/cron/billing`** — Same pattern: add `is_active` to clinic select, skip if inactive.

**`/cron/recall`** — Filter at the top-level query. Change:
```ts
    .from("clinics")
    .select("id")
```
To:
```ts
    .from("clinics")
    .select("id")
    .eq("is_active", true)
```

**`/cron/recall-send`** — Add `is_active` to clinic select, skip if inactive.

**Step 2: Commit**

```bash
git add src/app/api/cron/confirmations/route.ts src/app/api/cron/nps/route.ts src/app/api/cron/billing/route.ts src/app/api/cron/recall/route.ts src/app/api/cron/recall-send/route.ts
git commit -m "feat: add is_active guard to all cron routes"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add new routes to CLAUDE.md**

Add to the "Patient API Routes" section (or create an "Onboarding API Routes" section):

```markdown
### Onboarding API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/onboarding/status` | GET | Check clinic activation requirements status |
| `/api/onboarding/activate` | PUT | Activate/deactivate clinic (validates 5 requirements for activation) |
| `/api/integrations/whatsapp/test` | POST | Test WhatsApp credentials against Meta API |
```

Update the Database section to mention `is_active`:
```markdown
- `clinics.is_active` (boolean, default false): controls whether agents respond. Requires 5 minimum requirements to activate.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with onboarding activation routes"
```

---

## Task 13: Build & Smoke Test

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Run dev build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Fix any issues found**

If there are type errors or test failures, fix them and commit:

```bash
git add -A
git commit -m "fix: address build/test issues in onboarding activation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database migration — `is_active` | 1 new |
| 2 | Validation schema | 1 modified |
| 3 | `GET /api/onboarding/status` | 2 new (route + test) |
| 4 | `PUT /api/onboarding/activate` | 2 new (route + test) |
| 5 | `POST /api/integrations/whatsapp/test` | 1 new |
| 6 | i18n keys | 3 modified |
| 7 | `ClinicStatusToggle` + sidebar | 3 files (1 new, 2 modified) |
| 8 | Wizard rewrite | 1 rewritten, 1 deleted |
| 9 | Google Calendar callback redirect | 2 modified |
| 10 | WhatsApp webhook guard | 1 modified |
| 11 | Cron job guards | 5 modified |
| 12 | CLAUDE.md update | 1 modified |
| 13 | Build & smoke test | 0 files |

**Total: ~13 commits, ~24 files touched**
