import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCustomFieldSchema } from "@/lib/validations/custom-fields";
import { checkRateLimit } from "@/lib/rate-limit";

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

export async function GET() {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: fields, error } = await admin
    .from("patient_custom_fields")
    .select("id, name, type, options, required, display_order, created_at, updated_at")
    .eq("clinic_id", clinicId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: fields });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createCustomFieldSchema.safeParse(body);
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
  const { data: field, error } = await admin
    .from("patient_custom_fields")
    .insert({
      clinic_id: clinicId,
      name: parsed.data.name,
      type: parsed.data.type,
      options: parsed.data.options,
      required: parsed.data.required,
      display_order: parsed.data.display_order,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_name" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: field }, { status: 201 });
}
