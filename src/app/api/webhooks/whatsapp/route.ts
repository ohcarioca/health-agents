import { NextResponse, after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature } from "@/services/whatsapp";
import { whatsappWebhookSchema } from "@/lib/validations/webhook";
import { processMessage } from "@/lib/agents";

// GET — Meta webhook verification handshake
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// POST — Receive incoming messages
export async function POST(request: Request) {
  // 1. Read raw body for signature verification
  const rawBody = await request.text();

  // 2. Verify HMAC-SHA256 signature
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // 3. Parse and validate payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = whatsappWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const body = parsed.data;

  // 4. Extract messages
  const entry = body.entry[0];
  if (!entry) {
    return NextResponse.json({ status: "ok" });
  }

  const change = entry.changes[0];
  if (!change) {
    return NextResponse.json({ status: "ok" });
  }

  const { value } = change;
  const messages = value.messages ?? [];
  // Use display_phone_number (actual phone) to look up clinic, not phone_number_id (Meta internal ID)
  const displayPhone = value.metadata.display_phone_number.replace(/\D/g, "");
  const contactName = value.contacts?.[0]?.profile?.name;

  // 5. Process each message in after() for async processing
  for (const msg of messages) {
    // Extract message body from text or button replies
    let messageBody: string | null = null;

    if (msg.type === "text" && msg.text) {
      messageBody = msg.text.body;
    } else if (msg.type === "button" && msg.button) {
      messageBody = msg.button.text;
    }

    if (!messageBody) {
      continue;
    }

    const senderPhone = msg.from;
    const messageExternalId = msg.id;

    after(async () => {
      try {
        // Look up clinic by display phone number (digits-only, per DB convention)
        const supabase = createAdminClient();

        const { data: clinic } = await supabase
          .from("clinics")
          .select("id, is_active")
          .eq("phone", displayPhone)
          .maybeSingle();

        if (!clinic) {
          console.error(
            `[webhook/whatsapp] no clinic found for display_phone=${displayPhone}`
          );
          return;
        }

        if (!clinic.is_active) {
          console.log(
            `[webhook/whatsapp] ignoring message: clinic ${clinic.id} is not active`
          );
          return;
        }

        await processMessage({
          phone: senderPhone,
          message: messageBody,
          externalId: messageExternalId,
          clinicId: clinic.id,
          contactName: contactName ?? undefined,
        });
      } catch (err) {
        console.error("[webhook/whatsapp] processing error:", err);
      }
    });
  }

  // 6. Return 200 immediately
  return NextResponse.json({ status: "ok" });
}
