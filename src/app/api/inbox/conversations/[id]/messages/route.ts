import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageSchema } from "@/lib/validations/inbox";
import { sendTextMessage, type WhatsAppCredentials } from "@/services/whatsapp";

export async function POST(
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

  const parsed = sendMessageSchema.safeParse(body);
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

  // Verify conversation exists and belongs to this clinic, get patient phone
  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .select("id, channel, patient:patients(id, phone)")
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const { content } = parsed.data;

  // Save message with human metadata
  const { data: savedMessage, error: saveError } = await admin
    .from("messages")
    .insert({
      conversation_id: id,
      clinic_id: membership.clinic_id,
      role: "assistant",
      content,
      metadata: { sent_by: user.id, sent_by_human: true },
    })
    .select("id, role, content, metadata, created_at")
    .single();

  if (saveError) {
    console.error("[inbox/messages] save error:", saveError.message);
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  // Queue in message_queue (pending, max_attempts: 3)
  const { data: queueEntry, error: queueError } = await admin
    .from("message_queue")
    .insert({
      conversation_id: id,
      clinic_id: membership.clinic_id,
      channel: conversation.channel,
      content,
      status: "pending",
      max_attempts: 3,
    })
    .select("id")
    .single();

  if (queueError) {
    console.error("[inbox/messages] queue error:", queueError.message);
    // Message saved but queue failed — still return the message
    return NextResponse.json({
      data: savedMessage,
      sent: false,
      error: "Failed to queue message for delivery",
    });
  }

  // Send via WhatsApp
  // Extract phone from patient join — Supabase returns single FK joins as object
  const patient = conversation.patient as unknown as { id: string; phone: string } | null;
  const patientPhone = patient?.phone;

  // Fetch clinic WhatsApp credentials
  const { data: clinic } = await admin
    .from("clinics")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", membership.clinic_id)
    .single();

  const credentials: WhatsAppCredentials = {
    phoneNumberId: (clinic?.whatsapp_phone_number_id as string) ?? "",
    accessToken: (clinic?.whatsapp_access_token as string) ?? "",
  };

  let sent = false;

  if (patientPhone) {
    const result = await sendTextMessage(patientPhone, content, credentials);
    sent = result.success;

    // Update queue status
    if (result.success) {
      await admin
        .from("message_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: 1,
        })
        .eq("id", queueEntry.id);
    } else {
      await admin
        .from("message_queue")
        .update({
          status: "failed",
          error: result.error ?? "Unknown error",
          attempts: 1,
        })
        .eq("id", queueEntry.id);

      console.error("[inbox/messages] whatsapp send failed:", result.error);
    }
  } else {
    console.error("[inbox/messages] no patient phone for conversation:", id);
    await admin
      .from("message_queue")
      .update({
        status: "failed",
        error: "No patient phone number",
        attempts: 1,
      })
      .eq("id", queueEntry.id);
  }

  return NextResponse.json({
    data: savedMessage,
    sent,
  });
}
