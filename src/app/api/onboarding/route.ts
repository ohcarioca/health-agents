import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clinicName, phone, address, profName, specialty } = body as Record<
    string,
    string
  >;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get membership
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 404 });
  }

  // Update clinic — phone being set marks onboarding as complete
  const updateData: Record<string, unknown> = {
    phone: phone || "",
    address: address || null,
  };
  if (clinicName) {
    updateData.name = clinicName;
  }

  const { error: clinicError } = await admin
    .from("clinics")
    .update(updateData)
    .eq("id", membership.clinic_id);

  if (clinicError) {
    return NextResponse.json({ error: clinicError.message }, { status: 500 });
  }

  // Add professional if entered
  if (profName) {
    await admin.from("professionals").insert({
      clinic_id: membership.clinic_id,
      name: profName,
      specialty: specialty || null,
    });
  }

  return NextResponse.json({ data: { clinicId: membership.clinic_id } });
}
