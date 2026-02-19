// eval/fixtures/clinic.ts
import type { EvalSupabaseClient } from "../supabase";

const MODULE_TYPES = [
  "support",
  "scheduling",
  "confirmation",
  "nps",
  "billing",
  "recall",
] as const;

export async function createTestClinic(
  supabase: EvalSupabaseClient
): Promise<string> {
  const ts = Date.now();
  const name = `Clínica Eval ${ts}`;
  const slug = `eval-${ts}`;

  const { data: clinic, error } = await supabase
    .from("clinics")
    .insert({
      name,
      slug,
      phone: "11999998888",
      timezone: "America/Sao_Paulo",
      is_active: true,
      operating_hours: {
        monday: [{ start: "08:00", end: "20:00" }],
        tuesday: [{ start: "08:00", end: "20:00" }],
        wednesday: [{ start: "08:00", end: "20:00" }],
        thursday: [{ start: "08:00", end: "20:00" }],
        friday: [{ start: "08:00", end: "20:00" }],
        saturday: [{ start: "08:00", end: "20:00" }],
        sunday: [],
      },
      // Fake WhatsApp credentials — sends will fail gracefully at Meta API level
      whatsapp_phone_number_id: "eval-fake-phone-id",
      whatsapp_waba_id: "eval-fake-waba-id",
      whatsapp_access_token: "eval-fake-token",
    })
    .select("id")
    .single();

  if (error || !clinic) {
    throw new Error(`Failed to create test clinic: ${error?.message}`);
  }

  const clinicId = clinic.id as string;

  // Create 6 module_configs (all enabled)
  await supabase.from("module_configs").insert(
    MODULE_TYPES.map((type) => ({
      clinic_id: clinicId,
      module_type: type,
      enabled: true,
      settings: {},
    }))
  );

  // Create 6 agents (all active)
  await supabase.from("agents").insert(
    MODULE_TYPES.map((type) => ({
      clinic_id: clinicId,
      type,
      name: `Agente ${type}`,
      active: true,
      config: { tone: "professional", locale: "pt-BR" },
    }))
  );

  console.log(`  ✓ Clinic created: ${name} (${clinicId})`);
  return clinicId;
}
