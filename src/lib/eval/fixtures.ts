import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvalScenario } from "./types";
import { randomUUID } from "node:crypto";

export interface SeededData {
  clinicId: string;
  patientId: string;
  agentId: string;
  userId: string;
}

const EVAL_CLINIC_PREFIX = "eval-";

export async function seedFixtures(
  supabase: SupabaseClient,
  scenario: EvalScenario
): Promise<SeededData> {
  const clinicId = `${EVAL_CLINIC_PREFIX}${randomUUID()}`;
  const patientId = randomUUID();
  const agentId = randomUUID();
  const userId = randomUUID();

  // 1. Create eval clinic
  await supabase.from("clinics").insert({
    id: clinicId,
    name: `Eval Clinic — ${scenario.id}`,
    phone: "11999990000",
    address: "Rua Eval, 123",
    timezone: "America/Sao_Paulo",
    user_id: userId,
  });

  // 2. Create patient from persona
  const normalizedPhone = scenario.persona.phone.replace(/\D/g, "");
  await supabase.from("patients").insert({
    id: patientId,
    clinic_id: clinicId,
    name: scenario.persona.name,
    phone: normalizedPhone,
    notes: scenario.persona.notes ?? null,
    custom_fields: scenario.persona.custom_fields ?? null,
  });

  // 3. Create agent row (required by processMessage step 8)
  const agentConfig = {
    tone: "professional",
    locale: scenario.locale,
  };

  await supabase.from("agents").insert({
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
      await supabase.from("professionals").insert({
        id: prof.id,
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
      await supabase.from("services").insert({
        id: svc.id,
        clinic_id: clinicId,
        name: svc.name,
        duration_minutes: svc.duration_minutes ?? 30,
        active: true,
      });
    }
  }

  if (scenario.fixtures?.insurance_plans) {
    for (const plan of scenario.fixtures.insurance_plans) {
      await supabase.from("insurance_plans").insert({
        id: plan.id,
        clinic_id: clinicId,
        name: plan.name,
      });
    }
  }

  if (scenario.fixtures?.appointments) {
    for (const appt of scenario.fixtures.appointments) {
      await supabase.from("appointments").insert({
        id: appt.id,
        clinic_id: clinicId,
        professional_id: appt.professional_id,
        patient_id: appt.patient_id ?? patientId,
        service_id: appt.service_id ?? null,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        status: appt.status ?? "scheduled",
      });
    }
  }

  return { clinicId, patientId, agentId, userId };
}

export async function cleanupFixtures(
  supabase: SupabaseClient,
  clinicId: string
): Promise<void> {
  // Delete in reverse dependency order
  const tables = [
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
