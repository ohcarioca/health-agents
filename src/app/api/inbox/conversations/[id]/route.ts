import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
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

  // Fetch conversation with patient and agent joins
  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .select(
      "id, status, channel, current_module, created_at, updated_at, whatsapp_thread_id, patient:patients(id, name, phone, email), agent:agents(id, name, type)",
    )
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  // Fetch all messages ordered by created_at ascending
  const { data: messages, error: msgError } = await admin
    .from("messages")
    .select("id, role, content, metadata, external_id, created_at")
    .eq("conversation_id", id)
    .eq("clinic_id", membership.clinic_id)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("[inbox/conversations/detail] messages error:", msgError.message);
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      ...conversation,
      messages: messages ?? [],
    },
  });
}
