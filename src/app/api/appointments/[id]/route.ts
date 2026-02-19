import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAppointmentSchema } from "@/lib/validations/scheduling";
import { updateEvent, deleteEvent } from "@/services/google-calendar";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateAppointmentSchema.safeParse(body);
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

  const { id } = await params;
  const admin = createAdminClient();

  // Verify appointment belongs to clinic
  const { data: existing, error: fetchError } = await admin
    .from("appointments")
    .select("id, clinic_id, google_event_id, professional_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 },
    );
  }

  if (existing.clinic_id !== clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updateData = parsed.data;

  // Update appointment in DB
  const { data: updated, error: updateError } = await admin
    .from("appointments")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update appointment" },
      { status: 500 },
    );
  }

  // Sync changes to Google Calendar if google_event_id exists
  if (existing.google_event_id && existing.professional_id) {
    try {
      const { data: professional } = await admin
        .from("professionals")
        .select("google_calendar_id, google_refresh_token")
        .eq("id", existing.professional_id)
        .single();

      if (
        professional?.google_refresh_token &&
        professional?.google_calendar_id
      ) {
        const refreshToken = professional.google_refresh_token as string;
        const calendarId = professional.google_calendar_id as string;
        const eventId = existing.google_event_id as string;

        if (updateData.status === "cancelled") {
          await deleteEvent(refreshToken, calendarId, eventId);
        } else if (updateData.starts_at || updateData.ends_at) {
          const { data: clinic } = await admin
            .from("clinics")
            .select("timezone")
            .eq("id", clinicId)
            .single();

          const timezone =
            (clinic?.timezone as string) || "America/Sao_Paulo";

          await updateEvent(refreshToken, calendarId, eventId, {
            startTime: updateData.starts_at ?? undefined,
            endTime: updateData.ends_at ?? undefined,
            timezone,
          });
        }
      }
    } catch (err) {
      console.error("[appointments] Google Calendar sync failed:", err);
    }
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Verify appointment belongs to clinic
  const { data: existing, error: fetchError } = await admin
    .from("appointments")
    .select("id, clinic_id, google_event_id, professional_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 },
    );
  }

  if (existing.clinic_id !== clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Soft-delete: set status to cancelled
  const { error: cancelError } = await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (cancelError) {
    return NextResponse.json(
      { error: cancelError.message },
      { status: 500 },
    );
  }

  // Delete Google Calendar event if it exists
  if (existing.google_event_id && existing.professional_id) {
    try {
      const { data: professional } = await admin
        .from("professionals")
        .select("google_calendar_id, google_refresh_token")
        .eq("id", existing.professional_id)
        .single();

      if (
        professional?.google_refresh_token &&
        professional?.google_calendar_id
      ) {
        await deleteEvent(
          professional.google_refresh_token as string,
          professional.google_calendar_id as string,
          existing.google_event_id as string,
        );
      }
    } catch (err) {
      console.error("[appointments] Google Calendar delete failed:", err);
    }
  }

  return NextResponse.json({ data: { cancelled: true } });
}
