import { NextResponse } from "next/server";
import crypto from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ── Constants ──

const INACTIVE_DAYS = 90;

// ── Auth ──

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;

  const token = header.replace("Bearer ", "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

// ── GET handler ──

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS);
  const cutoff = cutoffDate.toISOString();

  // Get all clinics
  const { data: clinics, error: clinicsError } = await supabase
    .from("clinics")
    .select("id");

  if (clinicsError || !clinics) {
    return NextResponse.json(
      { error: clinicsError?.message ?? "no clinics found" },
      { status: 500 }
    );
  }

  let enqueued = 0;

  for (const clinic of clinics) {
    // Get patients whose last visit was more than 90 days ago
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
