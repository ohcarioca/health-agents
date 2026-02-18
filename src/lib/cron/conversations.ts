import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function findOrCreateConversation(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  logPrefix: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .eq("channel", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: newConv, error: createError } = await supabase
    .from("conversations")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !newConv) {
    console.error(
      `[${logPrefix}] failed to create conversation:`,
      createError?.message
    );
    throw new Error("failed to create conversation");
  }

  return newConv.id;
}
