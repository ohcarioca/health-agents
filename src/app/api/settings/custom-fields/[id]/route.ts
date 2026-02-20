import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateCustomFieldSchema } from "@/lib/validations/custom-fields";

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

  const parsed = updateCustomFieldSchema.safeParse(body);
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

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
  if (parsed.data.options !== undefined) updateData.options = parsed.data.options;
  if (parsed.data.required !== undefined) updateData.required = parsed.data.required;
  if (parsed.data.display_order !== undefined) updateData.display_order = parsed.data.display_order;

  const admin = createAdminClient();
  const { data: field, error } = await admin
    .from("patient_custom_fields")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", clinicId)
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

  return NextResponse.json({ data: field });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Remove custom field values from all patients in this clinic
  await admin.rpc("remove_custom_field_from_patients", {
    p_clinic_id: clinicId,
    p_field_id: id,
  });

  // Delete the field definition
  const { error } = await admin
    .from("patient_custom_fields")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id } });
}
