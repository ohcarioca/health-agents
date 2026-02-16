import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPatientSchema } from "@/lib/validations/patients";

const PER_PAGE = 25;

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

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const q = searchParams.get("q")?.trim() || "";

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const admin = createAdminClient();
  let query = admin
    .from("patients")
    .select(
      "id, name, phone, email, cpf, date_of_birth, notes, last_visit_at, created_at",
      { count: "exact" },
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (q.length >= 2) {
    const isDigits = /^\d+$/.test(q);
    if (isDigits) {
      query = query.like("phone", q + "%");
    } else {
      query = query.ilike("name", "%" + q + "%");
    }
  }

  query = query.range(from, to);

  const { data: patients, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patients, count });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPatientSchema.safeParse(body);
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

  const { name, phone, email, date_of_birth, cpf, notes } = parsed.data;

  const admin = createAdminClient();
  const { data: patient, error } = await admin
    .from("patients")
    .insert({
      clinic_id: clinicId,
      name,
      phone,
      email: email || null,
      date_of_birth: date_of_birth || null,
      cpf: cpf || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_phone" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patient }, { status: 201 });
}
