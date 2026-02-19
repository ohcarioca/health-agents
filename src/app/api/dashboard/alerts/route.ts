import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Alert {
  id: string;
  type: "detractor" | "overdue" | "escalated" | "failure";
  title: string;
  description: string;
  createdAt: string;
  entityId: string;
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/alerts
// ---------------------------------------------------------------------------

export async function GET() {
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

  // ── 24h cutoff for failed messages ──
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // ── Fetch all alert sources in parallel ──
  const [detractorsResult, overdueResult, escalatedResult, failuresResult] =
    await Promise.all([
      // 1. NPS detractors (score <= 6)
      admin
        .from("nps_responses")
        .select("id, score, comment, created_at, patient_id, patients(name)")
        .eq("clinic_id", clinicId)
        .lte("score", 6)
        .order("created_at", { ascending: false })
        .limit(10),

      // 2. Overdue invoices
      admin
        .from("invoices")
        .select("id, amount_cents, due_date, created_at, patient_id, patients(name)")
        .eq("clinic_id", clinicId)
        .eq("status", "overdue")
        .order("due_date", { ascending: true })
        .limit(10),

      // 3. Escalated conversations
      admin
        .from("conversations")
        .select("id, created_at, updated_at, patient_id, patients(name)")
        .eq("clinic_id", clinicId)
        .eq("status", "escalated")
        .order("updated_at", { ascending: false })
        .limit(10),

      // 4. Failed message deliveries (last 24h)
      admin
        .from("message_queue")
        .select(
          "id, created_at, conversation_id, conversations!inner(patient_id, patients!inner(name))",
        )
        .eq("clinic_id", clinicId)
        .eq("status", "failed")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  // ── Map detractors to alerts ──
  const detractorAlerts: Alert[] = (detractorsResult.data ?? []).map((nps) => {
    const patientName =
      nps.patients && !Array.isArray(nps.patients)
        ? (nps.patients as { name: string }).name
        : "Unknown";
    const comment = nps.comment ? `: ${nps.comment}` : "";
    return {
      id: `detractor-${nps.id}`,
      type: "detractor",
      title: patientName,
      description: `NPS ${nps.score ?? 0}${comment}`,
      createdAt: nps.created_at,
      entityId: nps.id,
    };
  });

  // ── Map overdue invoices to alerts ──
  const overdueAlerts: Alert[] = (overdueResult.data ?? []).map((inv) => {
    const patientName =
      inv.patients && !Array.isArray(inv.patients)
        ? (inv.patients as { name: string }).name
        : "Unknown";
    const amount = (inv.amount_cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    return {
      id: `overdue-${inv.id}`,
      type: "overdue",
      title: patientName,
      description: `${amount} overdue since ${inv.due_date}`,
      createdAt: inv.created_at,
      entityId: inv.id,
    };
  });

  // ── Map escalated conversations to alerts ──
  const escalatedAlerts: Alert[] = (escalatedResult.data ?? []).map((conv) => {
    const patientName =
      conv.patients && !Array.isArray(conv.patients)
        ? (conv.patients as { name: string }).name
        : "Unknown";
    return {
      id: `escalated-${conv.id}`,
      type: "escalated",
      title: patientName,
      description: "Conversation escalated to human",
      createdAt: conv.updated_at,
      entityId: conv.id,
    };
  });

  // ── Map failed messages to alerts ──
  const failureAlerts: Alert[] = (failuresResult.data ?? []).map((msg) => {
    const conv = msg.conversations as unknown as {
      patient_id: string;
      patients: { name: string };
    } | null;
    const patientName = conv?.patients?.name ?? "Unknown";
    return {
      id: `failure-${msg.id}`,
      type: "failure",
      title: patientName,
      description: "Message delivery failed",
      createdAt: msg.created_at,
      entityId: msg.conversation_id,
    };
  });

  // ── Combine, sort by date descending, return first 20 ──
  const allAlerts = [
    ...detractorAlerts,
    ...overdueAlerts,
    ...escalatedAlerts,
    ...failureAlerts,
  ]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 20);

  return NextResponse.json({ data: allAlerts });
}
