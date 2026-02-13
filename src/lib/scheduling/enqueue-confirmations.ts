import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

interface ConfirmationEntry {
  clinic_id: string;
  appointment_id: string;
  stage: string;
  status: string;
  scheduled_at: string;
  attempts: number;
}

interface EnqueueParams {
  clinicId: string;
  appointmentId: string;
  startsAt: string;
}

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const STAGES: Array<{ label: string; hoursBeforeAppointment: number }> = [
  { label: "48h", hoursBeforeAppointment: 48 },
  { label: "24h", hoursBeforeAppointment: 24 },
  { label: "2h", hoursBeforeAppointment: 2 },
];

const MS_PER_HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Pure function — no DB access, easy to test
// ---------------------------------------------------------------------

/**
 * Builds confirmation queue entries for an appointment.
 * Only includes entries whose scheduled time is still in the future.
 */
export function buildConfirmationEntries(
  params: EnqueueParams,
): ConfirmationEntry[] {
  const appointmentMs = new Date(params.startsAt).getTime();
  const now = Date.now();

  const entries: ConfirmationEntry[] = [];

  for (const stage of STAGES) {
    const scheduledAtMs = appointmentMs - stage.hoursBeforeAppointment * MS_PER_HOUR;

    if (scheduledAtMs > now) {
      entries.push({
        clinic_id: params.clinicId,
        appointment_id: params.appointmentId,
        stage: stage.label,
        status: "pending",
        scheduled_at: new Date(scheduledAtMs).toISOString(),
        attempts: 0,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------
// DB insertion
// ---------------------------------------------------------------------

/**
 * Builds and inserts confirmation queue entries for the given appointment.
 * Skips stages already in the past. If no entries qualify, does nothing.
 */
export async function enqueueConfirmations(
  supabase: SupabaseClient,
  params: EnqueueParams,
): Promise<void> {
  const entries = buildConfirmationEntries(params);

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("confirmation_queue")
    .insert(entries);

  if (error) {
    throw new Error(`Failed to enqueue confirmations: ${error.message}`);
  }
}
