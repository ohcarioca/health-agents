import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvoiceSchema } from "@/lib/validations/billing";
import { maskCPF } from "@/lib/utils/mask";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // KPI mode: return only amount_cents + status without pagination
  if (searchParams.get("kpi") === "true") {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("invoices")
      .select("amount_cents, status")
      .eq("clinic_id", clinicId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  }

  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const period = searchParams.get("period");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = 25;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = createAdminClient();

  let query = admin
    .from("invoices")
    .select(
      "id, status, amount_cents, due_date, notes, paid_at, created_at, patient_id, patients!inner(id, name, phone, cpf, email), payment_links(id, url, invoice_url, pix_payload, boleto_identification_field, method, status, amount_cents, created_at)",
      { count: "exact" },
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search && search.trim().length >= 2) {
    query = query.ilike("patients.name", `%${search.trim()}%`);
  }

  if (period) {
    const now = new Date();
    let startDate: string | undefined;
    if (period === "this-month") {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    } else if (period === "30d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split("T")[0];
    } else if (period === "90d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      startDate = d.toISOString().split("T")[0];
    }
    if (startDate) {
      query = query.gte("due_date", startDate);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sanitized = (data ?? []).map((inv: Record<string, unknown>) => ({
    ...inv,
    patients: inv.patients
      ? {
          ...(inv.patients as Record<string, unknown>),
          cpf: maskCPF((inv.patients as Record<string, unknown>).cpf as string),
        }
      : null,
  }));

  return NextResponse.json({ data: sanitized, count });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createInvoiceSchema.safeParse(body);
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
  const { data, error } = await admin
    .from("invoices")
    .insert({ ...parsed.data, clinic_id: clinicId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
