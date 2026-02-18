import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checks if auto-billing is enabled for a clinic via module_configs.settings.
 * Returns false on any error or missing config (safe default).
 */
export async function isAutoBillingEnabled(
  supabase: SupabaseClient,
  clinicId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", clinicId)
    .eq("module_type", "billing")
    .single();

  const settings = data?.settings as Record<string, unknown> | null;
  return settings?.auto_billing === true;
}
