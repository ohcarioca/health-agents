// eval/fixtures/patient.ts
// CPF 000.000.001-91 passes Luhn checksum and is accepted by Asaas sandbox.
import type { EvalSupabaseClient } from "../supabase";

export async function createTestPatient(
  supabase: EvalSupabaseClient,
  clinicId: string
): Promise<string> {
  const ts = Date.now();

  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      name: "Paciente Avaliação",
      phone: "11999998888",
      email: `eval.${ts}@orbita.test`,
      cpf: "00000000191",
    })
    .select("id")
    .single();

  if (error || !patient) {
    throw new Error(`Failed to create test patient: ${error?.message}`);
  }

  console.log(`  ✓ Patient created: Paciente Avaliação (${patient.id})`);
  return patient.id as string;
}
