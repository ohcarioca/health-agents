import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function findOrCreateConversation(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  logPrefix: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .eq("channel", "whatsapp")
    .in("status", ["active", "escalated"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status === "escalated") {
      console.log(
        `[${logPrefix}] skipping patient ${patientId}: conversation ${existing.id} is escalated`
      );
      return null;
    }
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
