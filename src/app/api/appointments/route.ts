import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookAppointmentSchema } from "@/lib/validations/scheduling";
import { createEvent } from "@/services/google-calendar";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return membership.clinic_id as string;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bookAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { professional_id, patient_id, starts_at, ends_at, service_id } =
    parsed.data;
  const admin = createAdminClient();

  // Check for time conflicts
  const { data: conflicts } = await admin
    .from("appointments")
    .select("id")
    .eq("professional_id", professional_id)
    .in("status", ["scheduled", "confirmed"])
    .lt("starts_at", ends_at)
    .gt("ends_at", starts_at)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "Time slot is already booked" },
      { status: 409 },
    );
  }

  // Insert appointment
  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      professional_id,
      patient_id,
      starts_at,
      ends_at,
      service_id: service_id ?? null,
      status: "scheduled",
    })
    .select()
    .single();

  if (insertError || !appointment) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create appointment" },
      { status: 500 },
    );
  }

  // Sync to Google Calendar if professional has tokens
  try {
    const { data: professional } = await admin
      .from("professionals")
      .select("name, google_calendar_id, google_refresh_token")
      .eq("id", professional_id)
      .single();

    if (
      professional?.google_refresh_token &&
      professional?.google_calendar_id
    ) {
      const { data: patient } = await admin
        .from("patients")
        .select("name")
        .eq("id", patient_id)
        .single();

      const { data: clinic } = await admin
        .from("clinics")
        .select("name, timezone")
        .eq("id", clinicId)
        .single();

      const patientName = (patient?.name as string) ?? "Patient";
      const clinicName = (clinic?.name as string) ?? "Clinic";
      const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

      const eventResult = await createEvent(
        professional.google_refresh_token as string,
        professional.google_calendar_id as string,
        {
          summary: `${patientName} — ${clinicName}`,
          startTime: starts_at,
          endTime: ends_at,
          timezone,
        },
      );

      if (eventResult.success && eventResult.eventId) {
        await admin
          .from("appointments")
          .update({ google_event_id: eventResult.eventId })
          .eq("id", appointment.id);
      }
    }
  } catch (err) {
    console.error("[appointments] Google Calendar sync failed:", err);
  }

  return NextResponse.json({ data: appointment }, { status: 201 });
}
