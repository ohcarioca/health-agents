import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Checks whether a schedule grid (JSONB) contains at least one day
 * with one or more time blocks.
 */
export function hasTimeBlocks(grid: unknown): boolean {
  if (!grid || typeof grid !== "object") return false;
  const scheduleGrid = grid as Record<string, unknown>;
  for (const day of Object.values(scheduleGrid)) {
    if (Array.isArray(day) && day.length > 0) return true;
  }
  return false;
}

export interface RequirementsResult {
  is_active: boolean;
  requirements: {
    operating_hours: boolean;
    professional_schedule: boolean;
    service_with_price: boolean;
    whatsapp: boolean;
    google_calendar: boolean;
  };
}

/**
 * Checks all 5 minimum requirements for clinic activation.
 *
 * 1. operating_hours — clinic has at least 1 day with time blocks
 * 2. professional_schedule — active professional with non-empty schedule_grid
 * 3. service_with_price — professional_services or services row with price_cents > 0
 * 4. whatsapp — all 3 WhatsApp credentials non-null/non-empty
 * 5. google_calendar — active professional with google_calendar_id set
 */
export async function checkRequirements(
  clinicId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<RequirementsResult> {
  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "is_active, operating_hours, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token"
    )
    .eq("id", clinicId)
    .single();

  if (!clinic) {
    return {
      is_active: false,
      requirements: {
        operating_hours: false,
        professional_schedule: false,
        service_with_price: false,
        whatsapp: false,
        google_calendar: false,
      },
    };
  }

  // Check 1: Operating hours have at least 1 day with time blocks
  const operatingHours = hasTimeBlocks(clinic.operating_hours);

  // Check 2: Active professional with a non-empty schedule_grid
  const { data: profWithSchedule } = await admin
    .from("professionals")
    .select("id, schedule_grid")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const professionalSchedule =
    profWithSchedule !== null && hasTimeBlocks(profWithSchedule?.schedule_grid);

  // Check 3: service with price > 0 (via professional_services or directly in services table)
  let serviceWithPrice = false;
  if (profWithSchedule) {
    const { data: profService } = await admin
      .from("professional_services")
      .select("price_cents")
      .eq("professional_id", profWithSchedule.id)
      .gt("price_cents", 0)
      .limit(1)
      .maybeSingle();
    serviceWithPrice = profService !== null;
  }
  if (!serviceWithPrice) {
    const { data: directService } = await admin
      .from("services")
      .select("id")
      .eq("clinic_id", clinicId)
      .gt("price_cents", 0)
      .limit(1)
      .maybeSingle();
    serviceWithPrice = directService !== null;
  }

  // Check 4: All 3 WhatsApp credentials present
  const whatsapp = Boolean(
    clinic.whatsapp_phone_number_id &&
      clinic.whatsapp_waba_id &&
      clinic.whatsapp_access_token
  );

  // Check 5: Active professional with google_calendar_id set
  const { data: profWithCalendar } = await admin
    .from("professionals")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .not("google_calendar_id", "is", null)
    .limit(1)
    .maybeSingle();

  const googleCalendar = profWithCalendar !== null;

  return {
    is_active: clinic.is_active as boolean,
    requirements: {
      operating_hours: operatingHours,
      professional_schedule: professionalSchedule,
      service_with_price: serviceWithPrice,
      whatsapp,
      google_calendar: googleCalendar,
    },
  };
}
