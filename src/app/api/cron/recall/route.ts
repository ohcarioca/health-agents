import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

// ── Constants ──

const DEFAULT_INACTIVE_DAYS = 90;

// ── GET handler ──

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all active clinics
  const { data: clinics, error: clinicsError } = await supabase
    .from("clinics")
    .select("id")
    .eq("is_active", true);

  if (clinicsError || !clinics) {
    return NextResponse.json(
      { error: clinicsError?.message ?? "no clinics found" },
      { status: 500 }
    );
  }

  // Batch-fetch all recall module configs to avoid N+1 per clinic
  const { data: recallConfigs } = await supabase
    .from("module_configs")
    .select("clinic_id, enabled, settings")
    .eq("module_type", "recall");

  const recallConfigMap = new Map(
    (recallConfigs ?? []).map((c) => [c.clinic_id as string, c])
  );

  let enqueued = 0;

  for (const clinic of clinics) {
    const recallConfig = recallConfigMap.get(clinic.id);

    // Skip clinics where recall module is explicitly disabled
    if (recallConfig && recallConfig.enabled === false) continue;

    const settings = (recallConfig?.settings ?? {}) as Record<string, unknown>;
    const inactiveDays =
      typeof settings.inactivity_days === "number" &&
      settings.inactivity_days >= 1
        ? settings.inactivity_days
        : DEFAULT_INACTIVE_DAYS;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
    const cutoff = cutoffDate.toISOString();

    // Get patients whose last visit was more than inactiveDays ago
    const { data: patients } = await supabase
      .from("patients")
      .select("id, last_visit_at")
      .eq("clinic_id", clinic.id)
      .lt("last_visit_at", cutoff)
      .not("last_visit_at", "is", null);

    if (!patients || patients.length === 0) continue;

    for (const patient of patients) {
      // Check if already in recall_queue with an active status
      const { data: existing } = await supabase
        .from("recall_queue")
        .select("id")
        .eq("clinic_id", clinic.id)
        .eq("patient_id", patient.id)
        .in("status", ["pending", "processing", "sent"])
        .maybeSingle();

      if (existing) continue;

      // Insert new recall entry (last_visit_at guaranteed non-null by query filter)
      const { error: insertError } = await supabase
        .from("recall_queue")
        .insert({
          clinic_id: clinic.id,
          patient_id: patient.id,
          last_visit_at: patient.last_visit_at as string,
          status: "pending",
          attempts: 0,
        });

      if (!insertError) enqueued++;
    }
  }

  return NextResponse.json({ enqueued });
}
