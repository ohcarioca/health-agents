import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const COMPLETABLE_STATUSES = ["scheduled", "confirmed"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Verify appointment exists and belongs to this clinic
  const { data: appointment, error: fetchError } = await admin
    .from("appointments")
    .select("id, status")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (fetchError || !appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 },
    );
  }

  // Only scheduled or confirmed appointments can be completed
  if (!COMPLETABLE_STATUSES.includes(appointment.status)) {
    return NextResponse.json(
      { error: `Cannot complete appointment with status "${appointment.status}"` },
      { status: 400 },
    );
  }

  // Update status to completed
  const { error: updateError } = await admin
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { id, status: "completed" } });
}
