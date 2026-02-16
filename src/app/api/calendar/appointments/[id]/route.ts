import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAppointmentSchema } from "@/lib/validations/settings";
import { updateEvent, deleteEvent } from "@/services/google-calendar";

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const admin = createAdminClient();

  // If time is changing, check for conflicts
  if (parsed.data.starts_at && parsed.data.ends_at && parsed.data.professional_id) {
    const { data: conflicts } = await admin
      .from("appointments")
      .select("id")
      .eq("professional_id", parsed.data.professional_id)
      .in("status", ["scheduled", "confirmed"])
      .lt("starts_at", parsed.data.ends_at)
      .gt("ends_at", parsed.data.starts_at)
      .neq("id", id)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "Time slot conflict" },
        { status: 409 },
      );
    }
  }

  // Build update data (only include defined fields)
  const updateData: Record<string, unknown> = {};
  if (parsed.data.patient_id !== undefined) updateData.patient_id = parsed.data.patient_id;
  if (parsed.data.professional_id !== undefined) updateData.professional_id = parsed.data.professional_id;
  if (parsed.data.service_id !== undefined) updateData.service_id = parsed.data.service_id;
  if (parsed.data.starts_at !== undefined) updateData.starts_at = parsed.data.starts_at;
  if (parsed.data.ends_at !== undefined) updateData.ends_at = parsed.data.ends_at;
  if (parsed.data.insurance_plan_id !== undefined) updateData.insurance_plan_id = parsed.data.insurance_plan_id;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.cancellation_reason !== undefined) updateData.cancellation_reason = parsed.data.cancellation_reason;

  const { data: appointment, error } = await admin
    .from("appointments")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync time changes to Google Calendar (fire-and-forget)
  if (parsed.data.starts_at || parsed.data.ends_at) {
    try {
      const googleEventId = appointment.google_event_id as string | null;
      const profId = (parsed.data.professional_id ?? appointment.professional_id) as string | null;

      if (googleEventId && profId) {
        const { data: professional } = await admin
          .from("professionals")
          .select("google_calendar_id, google_refresh_token")
          .eq("id", profId)
          .single();

        if (professional?.google_refresh_token && professional?.google_calendar_id) {
          const { data: clinic } = await admin
            .from("clinics")
            .select("timezone")
            .eq("id", clinicId)
            .single();

          const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

          await updateEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            googleEventId,
            {
              startTime: (parsed.data.starts_at ?? appointment.starts_at) as string,
              endTime: (parsed.data.ends_at ?? appointment.ends_at) as string,
              timezone,
            },
          );
        }
      }
    } catch (err) {
      console.error("[calendar] Google Calendar update error:", err);
    }
  }

  return NextResponse.json({ data: appointment });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load appointment first for Google Calendar cleanup
  const { data: existing } = await admin
    .from("appointments")
    .select("google_event_id, professional_id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  const { error } = await admin
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Delete from Google Calendar (fire-and-forget)
  if (existing?.google_event_id && existing?.professional_id) {
    try {
      const { data: professional } = await admin
        .from("professionals")
        .select("google_calendar_id, google_refresh_token")
        .eq("id", existing.professional_id as string)
        .single();

      if (professional?.google_refresh_token && professional?.google_calendar_id) {
        await deleteEvent(
          professional.google_refresh_token as string,
          professional.google_calendar_id as string,
          existing.google_event_id as string,
        );
      }
    } catch (err) {
      console.error("[calendar] Google Calendar delete error:", err);
    }
  }

  return NextResponse.json({ data: { id } });
}
