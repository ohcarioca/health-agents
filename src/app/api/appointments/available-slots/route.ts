import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { availableSlotsQuerySchema } from "@/lib/validations/scheduling";
import { getAvailableSlots } from "@/lib/scheduling/availability";
import { getFreeBusy } from "@/services/google-calendar";
import type { ScheduleGrid } from "@/lib/validations/settings";

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

export async function GET(request: NextRequest) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const rawParams = {
    professional_id: searchParams.get("professional_id") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    service_id: searchParams.get("service_id") ?? undefined,
  };

  const parsed = availableSlotsQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { professional_id, date, service_id } = parsed.data;
  const admin = createAdminClient();

  // Load professional
  const { data: professional, error: profError } = await admin
    .from("professionals")
    .select(
      "schedule_grid, appointment_duration_minutes, google_calendar_id, google_refresh_token",
    )
    .eq("id", professional_id)
    .eq("clinic_id", clinicId)
    .single();

  if (profError || !professional) {
    return NextResponse.json(
      { error: "Professional not found" },
      { status: 404 },
    );
  }

  // Determine duration: service override or professional default
  let durationMinutes = professional.appointment_duration_minutes as number;

  if (service_id) {
    const { data: service } = await admin
      .from("services")
      .select("duration_minutes")
      .eq("id", service_id)
      .eq("clinic_id", clinicId)
      .single();

    if (service?.duration_minutes) {
      durationMinutes = service.duration_minutes as number;
    }
  }

  // Load existing appointments for the professional on that date
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: appointments } = await admin
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("professional_id", professional_id)
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd);

  // Load clinic timezone
  const { data: clinic } = await admin
    .from("clinics")
    .select("timezone")
    .eq("id", clinicId)
    .single();

  const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

  // Optionally fetch Google Calendar free/busy
  let busyBlocks: Array<{ start: string; end: string }> | undefined;

  if (professional.google_refresh_token && professional.google_calendar_id) {
    const freeBusyResult = await getFreeBusy(
      professional.google_refresh_token as string,
      professional.google_calendar_id as string,
      dayStart,
      dayEnd,
    );

    if (freeBusyResult.success && freeBusyResult.busyBlocks) {
      busyBlocks = freeBusyResult.busyBlocks;
    }
  }

  const scheduleGrid = professional.schedule_grid as ScheduleGrid;
  const existingAppointments = (appointments ?? []).map((a) => ({
    starts_at: a.starts_at as string,
    ends_at: a.ends_at as string,
  }));

  const slots = getAvailableSlots(
    date,
    scheduleGrid,
    durationMinutes,
    existingAppointments,
    timezone,
    busyBlocks,
  );

  return NextResponse.json({ data: slots });
}
