// eval/fixtures/professional.ts
import type { EvalSupabaseClient } from "../supabase";

export interface ProfessionalFixture {
  professionalId: string;
  serviceId: string;
}

const SCHEDULE_GRID = {
  monday: [{ start: "09:00", end: "18:00" }],
  tuesday: [{ start: "09:00", end: "18:00" }],
  wednesday: [{ start: "09:00", end: "18:00" }],
  thursday: [{ start: "09:00", end: "18:00" }],
  friday: [{ start: "09:00", end: "18:00" }],
  saturday: [{ start: "09:00", end: "13:00" }],
  sunday: [],
};

export async function createTestProfessional(
  supabase: EvalSupabaseClient,
  clinicId: string
): Promise<ProfessionalFixture> {
  // Create service
  const { data: service, error: svcError } = await supabase
    .from("services")
    .insert({
      clinic_id: clinicId,
      name: "Consulta Geral",
      duration_minutes: 60,
      price_cents: 20000,
    })
    .select("id")
    .single();

  if (svcError || !service) {
    throw new Error(`Failed to create test service: ${svcError?.message}`);
  }

  // Create professional
  const { data: professional, error: profError } = await supabase
    .from("professionals")
    .insert({
      clinic_id: clinicId,
      name: "Dr. Avaliação",
      specialty: "Clínica Geral",
      active: true,
      schedule_grid: SCHEDULE_GRID,
    })
    .select("id")
    .single();

  if (profError || !professional) {
    throw new Error(
      `Failed to create test professional: ${profError?.message}`
    );
  }

  // Link professional to service via junction table
  await supabase.from("professional_services").insert({
    professional_id: professional.id as string,
    service_id: service.id as string,
    price_cents: 20000,
  });

  console.log(`  ✓ Professional created: Dr. Avaliação (${professional.id})`);
  console.log(`  ✓ Service created: Consulta Geral (${service.id})`);

  return {
    professionalId: professional.id as string,
    serviceId: service.id as string,
  };
}
