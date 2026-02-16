import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertProfessionalServicesSchema } from "@/lib/validations/settings";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify professional belongs to this clinic
  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("professionals")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!prof) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: profServices, error } = await admin
    .from("professional_services")
    .select("id, service_id, price_cents, created_at")
    .eq("professional_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: profServices });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = upsertProfessionalServicesSchema.safeParse(body);
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

  // Verify professional belongs to this clinic
  const { data: prof } = await admin
    .from("professionals")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!prof) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete existing assignments, then insert new ones
  const { error: deleteError } = await admin
    .from("professional_services")
    .delete()
    .eq("professional_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (parsed.data.services.length > 0) {
    const rows = parsed.data.services.map((s) => ({
      professional_id: id,
      service_id: s.service_id,
      price_cents: s.price_cents,
    }));

    const { error: insertError } = await admin
      .from("professional_services")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 },
      );
    }
  }

  // Return the updated list
  const { data: updated } = await admin
    .from("professional_services")
    .select("id, service_id, price_cents, created_at")
    .eq("professional_id", id);

  return NextResponse.json({ data: updated });
}
