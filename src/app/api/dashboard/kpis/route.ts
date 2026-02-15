import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardPeriodSchema } from "@/lib/validations/dashboard";
import { calculateNPS, calculateRevenueMetrics } from "@/lib/analytics/kpis";

// ---------------------------------------------------------------------------
// Date range helper
// ---------------------------------------------------------------------------

function getDateRange(
  period: string,
  timezone: string,
): { start: string; end: string } {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );

  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);

  const start = new Date(now);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (period === "30d") {
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/kpis?period=today|7d|30d|90d
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // ── Auth ──
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const clinicId = membership.clinic_id as string;

  // ── Validate period param ──
  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period") ?? "today";
  const parsed = dashboardPeriodSchema.safeParse(rawPeriod);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid period. Must be: today, 7d, 30d, or 90d" },
      { status: 400 },
    );
  }

  const period = parsed.data;

  // ── Fetch clinic timezone ──
  const { data: clinic } = await admin
    .from("clinics")
    .select("timezone")
    .eq("id", clinicId)
    .single();

  const timezone = clinic?.timezone ?? "America/Sao_Paulo";
  const { start, end } = getDateRange(period, timezone);

  // ── Fetch all KPI data in parallel ──
  const [
    appointmentsResult,
    noShowsResult,
    confirmationsResult,
    npsResult,
    invoicesResult,
    escalatedResult,
  ] = await Promise.all([
    // 1. Appointments count in period
    admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .gte("starts_at", start)
      .lt("starts_at", end),

    // 2. No-shows count in period
    admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "no_show")
      .gte("starts_at", start)
      .lt("starts_at", end),

    // 3. Pending confirmations (sent but not yet responded)
    admin
      .from("confirmation_queue")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "sent"),

    // 4. NPS scores in period
    admin
      .from("nps_responses")
      .select("score")
      .eq("clinic_id", clinicId)
      .gte("created_at", start)
      .lt("created_at", end)
      .not("score", "is", null),

    // 5. Invoices in period
    admin
      .from("invoices")
      .select("amount_cents, status")
      .eq("clinic_id", clinicId)
      .gte("created_at", start)
      .lt("created_at", end),

    // 6. Escalated conversations count
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "escalated"),
  ]);

  // ── Compute NPS ──
  const scores = (npsResult.data ?? [])
    .map((r) => r.score)
    .filter((s): s is number => s !== null);
  const nps = calculateNPS(scores);

  // ── Compute revenue metrics ──
  const invoices = (invoicesResult.data ?? []).map((inv) => ({
    amount_cents: inv.amount_cents,
    status: inv.status,
  }));
  const revenue = calculateRevenueMetrics(invoices);

  return NextResponse.json({
    data: {
      appointments: appointmentsResult.count ?? 0,
      noShows: noShowsResult.count ?? 0,
      confirmations: confirmationsResult.count ?? 0,
      nps,
      revenue,
      escalated: escalatedResult.count ?? 0,
      period,
    },
  });
}
