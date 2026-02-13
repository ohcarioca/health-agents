import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, getPrimaryCalendarId } from "@/services/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=calendar_denied", request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(
        "/settings?tab=integrations&error=calendar_missing_params",
        request.url
      )
    );
  }

  const professionalId = state;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=unauthorized", request.url)
    );
  }

  const exchangeResult = await exchangeCode(code);
  if (!exchangeResult.success || !exchangeResult.refreshToken) {
    console.error(
      "[google-calendar/callback] code exchange failed:",
      exchangeResult.error
    );
    return NextResponse.redirect(
      new URL(
        "/settings?tab=integrations&error=calendar_exchange_failed",
        request.url
      )
    );
  }

  const calendarResult = await getPrimaryCalendarId(
    exchangeResult.refreshToken
  );
  if (!calendarResult.success || !calendarResult.calendarId) {
    console.error(
      "[google-calendar/callback] calendar ID fetch failed:",
      calendarResult.error
    );
    return NextResponse.redirect(
      new URL(
        "/settings?tab=integrations&error=calendar_id_failed",
        request.url
      )
    );
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=unauthorized", request.url)
    );
  }

  const { data: professional } = await admin
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("clinic_id", membership.clinic_id)
    .limit(1)
    .single();

  if (!professional) {
    return NextResponse.redirect(
      new URL(
        "/settings?tab=integrations&error=professional_not_found",
        request.url
      )
    );
  }

  const { error: updateError } = await admin
    .from("professionals")
    .update({
      google_refresh_token: exchangeResult.refreshToken,
      google_calendar_id: calendarResult.calendarId,
    })
    .eq("id", professionalId);

  if (updateError) {
    console.error(
      "[google-calendar/callback] update professional failed:",
      updateError.message
    );
    return NextResponse.redirect(
      new URL(
        "/settings?tab=integrations&error=calendar_save_failed",
        request.url
      )
    );
  }

  return NextResponse.redirect(
    new URL(
      "/settings?tab=integrations&success=calendar_connected",
      request.url
    )
  );
}
