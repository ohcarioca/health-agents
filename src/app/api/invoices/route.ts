import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvoiceSchema } from "@/lib/validations/billing";

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

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
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
      "*, patients!inner(id, name, phone, cpf, email, asaas_customer_id), payment_links(*)",
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

  return NextResponse.json({ data, count });
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
