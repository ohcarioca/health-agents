import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvalScenario } from "./types";
import { randomUUID } from "node:crypto";

export interface SeededData {
  clinicId: string;
  patientId: string;
  agentId: string;
  /** Maps scenario fixture IDs (e.g. "eval-prof-1") to real UUIDs */
  idMap: Record<string, string>;
}

/** Insert helper that throws on Supabase errors */
async function insertRow(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from(table).insert(row);
  if (error) {
    throw new Error(`[eval-fixtures] insert into "${table}" failed: ${error.message}`);
  }
}

/** Map a scenario fixture ID to a real UUID, caching in idMap */
function resolveId(idMap: Record<string, string>, fixtureId: string): string {
  if (!idMap[fixtureId]) {
    idMap[fixtureId] = randomUUID();
  }
  return idMap[fixtureId];
}

export async function seedFixtures(
  supabase: SupabaseClient,
  scenario: EvalScenario
): Promise<SeededData> {
  const clinicId = randomUUID();
  const patientId = randomUUID();
  const agentId = randomUUID();
  const idMap: Record<string, string> = {};

  // 1. Create eval clinic (slug is required, no user_id column)
  const slug = `eval-${scenario.id}-${clinicId.slice(0, 8)}`;
  await insertRow(supabase, "clinics", {
    id: clinicId,
    name: `Eval Clinic — ${scenario.id}`,
    slug,
    phone: "11999990000",
    address: "Rua Eval, 123",
    timezone: "America/Sao_Paulo",
  });

  // 2. Create patient from persona
  const normalizedPhone = scenario.persona.phone.replace(/\D/g, "");
  await insertRow(supabase, "patients", {
    id: patientId,
    clinic_id: clinicId,
    name: scenario.persona.name,
    phone: normalizedPhone,
    notes: scenario.persona.notes ?? null,
    custom_fields: scenario.persona.custom_fields ?? {},
  });

  // 3. Create agent row (required by processMessage step 8)
  const agentConfig = {
    tone: "professional",
    locale: scenario.locale,
  };

  await insertRow(supabase, "agents", {
    id: agentId,
    clinic_id: clinicId,
    type: scenario.agent,
    name: `Eval ${scenario.agent}`,
    description: `Eval agent for ${scenario.id}`,
    instructions: "",
    config: agentConfig,
    active: true,
  });

  // 4. Seed fixture data
  if (scenario.fixtures?.professionals) {
    for (const prof of scenario.fixtures.professionals) {
      const profId = resolveId(idMap, prof.id);
      await insertRow(supabase, "professionals", {
        id: profId,
        clinic_id: clinicId,
        name: prof.name,
        specialty: prof.specialty ?? null,
        appointment_duration_minutes: prof.appointment_duration_minutes ?? 30,
        schedule_grid: prof.schedule_grid ?? null,
        google_calendar_id: prof.google_calendar_id ?? null,
        google_refresh_token: prof.google_refresh_token ?? null,
        active: true,
      });
    }
  }

  if (scenario.fixtures?.services) {
    for (const svc of scenario.fixtures.services) {
      const svcId = resolveId(idMap, svc.id);
      await insertRow(supabase, "services", {
        id: svcId,
        clinic_id: clinicId,
        name: svc.name,
        duration_minutes: svc.duration_minutes ?? 30,
      });
    }
  }

  if (scenario.fixtures?.insurance_plans) {
    for (const plan of scenario.fixtures.insurance_plans) {
      const planId = resolveId(idMap, plan.id);
      await insertRow(supabase, "insurance_plans", {
        id: planId,
        clinic_id: clinicId,
        name: plan.name,
      });
    }
  }

  if (scenario.fixtures?.appointments) {
    for (const appt of scenario.fixtures.appointments) {
      const apptId = resolveId(idMap, appt.id);
      const profId = resolveId(idMap, appt.professional_id);
      const apptPatientId = appt.patient_id
        ? resolveId(idMap, appt.patient_id)
        : patientId;
      const svcId = appt.service_id ? resolveId(idMap, appt.service_id) : null;

      await insertRow(supabase, "appointments", {
        id: apptId,
        clinic_id: clinicId,
        professional_id: profId,
        patient_id: apptPatientId,
        service_id: svcId,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        status: appt.status ?? "scheduled",
      });
    }
  }

  return { clinicId, patientId, agentId, idMap };
}

export async function cleanupFixtures(
  supabase: SupabaseClient,
  clinicId: string
): Promise<void> {
  // Delete in reverse dependency order
  const tables = [
    "recall_queue",
    "nps_responses",
    "confirmation_queue",
    "message_queue",
    "messages",
    "conversations",
    "appointments",
    "insurance_plans",
    "services",
    "professionals",
    "agents",
    "patients",
    "clinics",
  ];

  for (const table of tables) {
    if (table === "clinics") {
      await supabase.from(table).delete().eq("id", clinicId);
    } else {
      await supabase.from(table).delete().eq("clinic_id", clinicId);
    }
  }
}
