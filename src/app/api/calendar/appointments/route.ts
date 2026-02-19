import { after, NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAppointmentSchema } from "@/lib/validations/settings";
import { enqueueConfirmations } from "@/lib/scheduling/enqueue-confirmations";
import { createEvent } from "@/services/google-calendar";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const professionalId = searchParams.get("professional_id");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  let query = admin
    .from("appointments")
    .select(`
      id, starts_at, ends_at, status, cancellation_reason, google_event_id, insurance_plan_id,
      patients!inner(id, name, phone),
      professionals(id, name),
      services(id, name, duration_minutes),
      insurance_plans(id, name)
    `)
    .eq("clinic_id", clinicId)
    .gte("starts_at", start)
    .lte("starts_at", end)
    .order("starts_at", { ascending: true });

  if (professionalId) {
    query = query.eq("professional_id", professionalId);
  }

  const { data: appointments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: appointments });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createAppointmentSchema.safeParse(body);
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

  const limited = await checkRateLimit(clinicId);
  if (limited) return limited;

  const admin = createAdminClient();

  // Check for time conflicts
  const { data: conflicts } = await admin
    .from("appointments")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("professional_id", parsed.data.professional_id)
    .in("status", ["scheduled", "confirmed"])
    .lt("starts_at", parsed.data.ends_at)
    .gt("ends_at", parsed.data.starts_at)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "Time slot conflict" },
      { status: 409 },
    );
  }

  // Insert appointment
  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: parsed.data.patient_id,
      professional_id: parsed.data.professional_id,
      service_id: parsed.data.service_id ?? null,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      insurance_plan_id: parsed.data.insurance_plan_id ?? null,
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

  // Enqueue confirmation reminders (fire-and-forget)
  try {
    await enqueueConfirmations(admin, {
      clinicId,
      appointmentId: appointment.id as string,
      startsAt: parsed.data.starts_at,
    });
  } catch (err) {
    console.error("[calendar] failed to enqueue confirmations:", err);
  }

  // Return immediately
  const response = NextResponse.json({ data: appointment }, { status: 201 });

  // Sync to Google Calendar in the background (non-blocking)
  after(async () => {
    try {
      const bg = createAdminClient();
      const { data: professional } = await bg
        .from("professionals")
        .select("name, google_calendar_id, google_refresh_token")
        .eq("id", parsed.data.professional_id)
        .single();

      if (professional?.google_refresh_token && professional?.google_calendar_id) {
        const { data: patient } = await bg
          .from("patients")
          .select("name")
          .eq("id", parsed.data.patient_id)
          .single();

        const { data: clinic } = await bg
          .from("clinics")
          .select("name, timezone")
          .eq("id", clinicId)
          .single();

        const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";
        const patientName = (patient?.name as string) ?? "Patient";
        const clinicName = (clinic?.name as string) ?? "Clinic";

        const eventResult = await createEvent(
          professional.google_refresh_token as string,
          professional.google_calendar_id as string,
          {
            summary: `${patientName} — ${clinicName}`,
            startTime: parsed.data.starts_at,
            endTime: parsed.data.ends_at,
            timezone,
          },
        );

        if (eventResult.success && eventResult.eventId) {
          await bg
            .from("appointments")
            .update({ google_event_id: eventResult.eventId })
            .eq("id", appointment.id);
        }
      }
    } catch (err) {
      console.error("[calendar] Google Calendar sync error:", err);
    }
  });

  return response;
}
