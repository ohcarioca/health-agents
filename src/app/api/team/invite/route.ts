import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteMemberSchema } from "@/lib/validations/team";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can invite members" },
      { status: 403 },
    );
  }

  const { email, role } = parsed.data;
  const admin = createAdminClient();

  // Check if user already exists in auth
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  let invitedUserId: string;

  if (existingUser) {
    // Check if already a member of this clinic
    const { data: existingMember } = await admin
      .from("clinic_users")
      .select("id")
      .eq("clinic_id", membership.clinic_id)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this clinic" },
        { status: 409 },
      );
    }
    invitedUserId = existingUser.id;
  } else {
    // Invite new user via Supabase auth
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message },
        { status: 500 },
      );
    }
    invitedUserId = inviteData.user.id;
  }

  // Create clinic_users row
  const { data: newMember, error: memberError } = await admin
    .from("clinic_users")
    .insert({
      clinic_id: membership.clinic_id,
      user_id: invitedUserId,
      role,
    })
    .select()
    .single();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ data: newMember }, { status: 201 });
}
