import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conversationListQuerySchema } from "@/lib/validations/inbox";

export async function GET(request: NextRequest) {
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

  // Parse and validate query params
  const url = new URL(request.url);
  const parsed = conversationListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    module: url.searchParams.get("module") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { status, module, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  // Build base query for conversations
  let query = admin
    .from("conversations")
    .select(
      "id, status, channel, current_module, created_at, updated_at, patient:patients(id, name, phone), agent:agents(id, name, type)",
      { count: "exact" },
    )
    .eq("clinic_id", membership.clinic_id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (module) {
    query = query.eq("current_module", module);
  }

  const { data: conversations, count, error } = await query;

  if (error) {
    console.error("[inbox/conversations] list error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch last message for each conversation
  const conversationIds = (conversations ?? []).map((c) => c.id);
  let lastMessages: Record<string, { content: string; role: string; created_at: string }> = {};

  if (conversationIds.length > 0) {
    // Get the most recent message per conversation using a single query
    const { data: messages } = await admin
      .from("messages")
      .select("conversation_id, content, role, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    if (messages) {
      for (const msg of messages) {
        // Keep only the first (most recent) message per conversation
        if (!lastMessages[msg.conversation_id]) {
          lastMessages[msg.conversation_id] = {
            content: msg.content,
            role: msg.role,
            created_at: msg.created_at,
          };
        }
      }
    }
  }

  const enriched = (conversations ?? []).map((conv) => ({
    ...conv,
    last_message: lastMessages[conv.id] ?? null,
  }));

  return NextResponse.json({
    data: enriched,
    pagination: {
      page,
      limit,
      total: count ?? 0,
    },
  });
}
