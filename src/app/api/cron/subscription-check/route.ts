import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let expiredTrials = 0;
  let expiredPastDue = 0;
  let resetMessages = 0;

  // 1. Expire trials that have passed trial_ends_at
  const { data: expiredTrialSubs } = await supabase
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "trialing")
    .lt("trial_ends_at", now)
    .select("id");

  expiredTrials = expiredTrialSubs?.length ?? 0;

  // 2. Expire past_due subscriptions older than 7 days
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: expiredPastDueSubs } = await supabase
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "past_due")
    .lt("updated_at", sevenDaysAgo)
    .select("id");

  expiredPastDue = expiredPastDueSubs?.length ?? 0;

  // 3. Reset monthly message counters for clinics whose billing cycle just rolled over
  const { data: rolledOver } = await supabase
    .from("subscriptions")
    .select("clinic_id")
    .eq("status", "active")
    .lt("current_period_end", now);

  if (rolledOver && rolledOver.length > 0) {
    const clinicIds = rolledOver.map((s) => s.clinic_id);
    await supabase
      .from("clinics")
      .update({ messages_used_month: 0 })
      .in("id", clinicIds);
    resetMessages = clinicIds.length;
  }

  console.log(
    `[cron/subscription-check] expired trials=${expiredTrials}, expired past_due=${expiredPastDue}, reset messages=${resetMessages}`
  );

  return NextResponse.json({
    status: "ok",
    expiredTrials,
    expiredPastDue,
    resetMessages,
  });
}
