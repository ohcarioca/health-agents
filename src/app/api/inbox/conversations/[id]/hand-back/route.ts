import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
    return NextResponse.json({ error: "No clinic found" }, { status: 404 });
  }

  // Verify conversation belongs to this clinic
  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .select("id, status")
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  // Update conversation status to active
  const { data: updated, error: updateError } = await admin
    .from("conversations")
    .update({ status: "active" })
    .eq("id", id)
    .select(
      "id, status, channel, current_module, created_at, updated_at, patient:patients(id, name, phone), agent:agents(id, name, type)",
    )
    .single();

  if (updateError) {
    console.error("[inbox/hand-back] update error:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Insert system message
  const { error: msgError } = await admin.from("messages").insert({
    conversation_id: id,
    clinic_id: membership.clinic_id,
    role: "system",
    content: "Conversation handed back to agent.",
    metadata: { sent_by: user.id, action: "hand_back" },
  });

  if (msgError) {
    console.error("[inbox/hand-back] system message error:", msgError.message);
  }

  return NextResponse.json({ data: updated });
}
