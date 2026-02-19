import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportPeriodSchema } from "@/lib/validations/dashboard";
import { calculateNPS, calculateRevenueMetrics } from "@/lib/analytics/kpis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPeriodDays(period: string): number {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  return 90;
}

// ---------------------------------------------------------------------------
// GET /api/reports/overview?period=7d|30d|90d&professionalId=uuid
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
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

  // ── Parse query params ──
  const { searchParams } = new URL(request.url);
  const parsed = reportPeriodSchema.safeParse({
    period: searchParams.get("period") || "30d",
    professionalId: searchParams.get("professionalId") || undefined,
  });

  const period = parsed.success ? parsed.data.period : "30d";
  const professionalId = parsed.success
    ? parsed.data.professionalId
    : undefined;

  const days = getPeriodDays(period);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const start = startDate.toISOString();

  // ── Build appointment query with optional professional filter ──
  let appointmentQuery = admin
    .from("appointments")
    .select("id, starts_at, status, professional_id")
    .eq("clinic_id", clinicId)
    .gte("starts_at", start)
    .order("starts_at", { ascending: true });

  if (professionalId) {
    appointmentQuery = appointmentQuery.eq("professional_id", professionalId);
  }

  // ── Fetch all data in parallel ──
  const [appointmentsResult, npsResult, invoicesResult, conversationsResult] =
    await Promise.all([
      appointmentQuery,
      admin
        .from("nps_responses")
        .select("score, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start)
        .order("created_at", { ascending: true }),
      admin
        .from("invoices")
        .select("amount_cents, status, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start)
        .order("created_at", { ascending: true }),
      admin
        .from("conversations")
        .select("id, status, current_module, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start)
        .order("created_at", { ascending: true }),
    ]);

  // ── Process appointment trends ──
  const appointments = appointmentsResult.data ?? [];
  const appointmentsByDate = new Map<
    string,
    {
      total: number;
      confirmed: number;
      completed: number;
      noShow: number;
      cancelled: number;
    }
  >();

  for (const apt of appointments) {
    const date = String(apt.starts_at).slice(0, 10);
    const entry = appointmentsByDate.get(date) ?? {
      total: 0,
      confirmed: 0,
      completed: 0,
      noShow: 0,
      cancelled: 0,
    };
    entry.total++;
    if (apt.status === "confirmed") entry.confirmed++;
    if (apt.status === "completed") entry.completed++;
    if (apt.status === "no_show") entry.noShow++;
    if (apt.status === "cancelled") entry.cancelled++;
    appointmentsByDate.set(date, entry);
  }

  const appointmentTrend = Array.from(appointmentsByDate.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Appointment summary ──
  const appointmentSummary = {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    noShow: appointments.filter((a) => a.status === "no_show").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
  };

  // ── Process NPS ──
  const npsRows = npsResult.data ?? [];
  const npsScores = npsRows
    .map((r) => r.score)
    .filter((s): s is number => s !== null);
  const nps = calculateNPS(npsScores);

  const npsByDate = new Map<string, number[]>();
  for (const r of npsRows) {
    if (r.score === null) continue;
    const date = String(r.created_at).slice(0, 10);
    const scores = npsByDate.get(date) ?? [];
    scores.push(r.score);
    npsByDate.set(date, scores);
  }

  const npsTrend = Array.from(npsByDate.entries())
    .map(([date, scores]) => ({
      date,
      average: Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      ),
      count: scores.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Process Revenue ──
  const invoiceRows = invoicesResult.data ?? [];
  const invoices = invoiceRows.map((inv) => ({
    amount_cents: inv.amount_cents,
    status: inv.status,
  }));
  const revenue = calculateRevenueMetrics(invoices);

  const revenueByDate = new Map<string, { paid: number; pending: number }>();
  for (const inv of invoiceRows) {
    const date = String(inv.created_at).slice(0, 10);
    const entry = revenueByDate.get(date) ?? { paid: 0, pending: 0 };
    if (inv.status === "paid") {
      entry.paid += inv.amount_cents;
    } else {
      entry.pending += inv.amount_cents;
    }
    revenueByDate.set(date, entry);
  }

  const revenueTrend = Array.from(revenueByDate.entries())
    .map(([date, amounts]) => ({ date, ...amounts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Process conversation stats by module ──
  const conversations = conversationsResult.data ?? [];
  const moduleStats = new Map<
    string,
    { total: number; escalated: number; resolved: number }
  >();

  for (const conv of conversations) {
    const convModule = (conv.current_module as string) || "support";
    const entry = moduleStats.get(convModule) ?? {
      total: 0,
      escalated: 0,
      resolved: 0,
    };
    entry.total++;
    if (conv.status === "escalated") entry.escalated++;
    if (conv.status === "resolved") entry.resolved++;
    moduleStats.set(convModule, entry);
  }

  return NextResponse.json(
    {
      data: {
        period,
        appointmentTrend,
        appointmentSummary,
        nps,
        npsTrend,
        revenue,
        revenueTrend,
        moduleStats: Object.fromEntries(moduleStats),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
