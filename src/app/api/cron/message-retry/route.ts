import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { sendTextMessage } from "@/services/whatsapp";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

// ── Constants ──

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50;

// ── GET handler ──

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch failed messages that haven't exceeded max attempts
  const { data: failedMessages, error } = await supabase
    .from("message_queue")
    .select(
      "id, clinic_id, patient_id, conversation_id, channel, content, attempts"
    )
    .eq("status", "failed")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[cron/message-retry] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!failedMessages || failedMessages.length === 0) {
    return NextResponse.json({
      data: { retried: 0, succeeded: 0, failed: 0 },
    });
  }

  let succeeded = 0;
  let failedCount = 0;

  for (const msg of failedMessages) {
    try {
      // Fetch clinic WhatsApp credentials
      const { data: clinic } = await supabase
        .from("clinics")
        .select(
          "whatsapp_phone_number_id, whatsapp_access_token, is_active"
        )
        .eq("id", msg.clinic_id)
        .single();

      if (!clinic?.is_active) {
        failedCount++;
        continue;
      }

      const credentials: WhatsAppCredentials = {
        phoneNumberId: (clinic.whatsapp_phone_number_id as string) ?? "",
        accessToken: (clinic.whatsapp_access_token as string) ?? "",
      };

      if (!credentials.phoneNumberId || !credentials.accessToken) {
        failedCount++;
        continue;
      }

      // Fetch patient phone
      if (!msg.patient_id) {
        failedCount++;
        continue;
      }

      const { data: patient } = await supabase
        .from("patients")
        .select("phone")
        .eq("id", msg.patient_id)
        .single();

      if (!patient?.phone) {
        failedCount++;
        continue;
      }

      // Mark as processing
      await supabase
        .from("message_queue")
        .update({
          status: "processing",
          attempts: (msg.attempts ?? 0) + 1,
        })
        .eq("id", msg.id);

      // Retry send
      const result = await sendTextMessage(
        patient.phone,
        msg.content,
        credentials
      );

      if (result.success) {
        await supabase
          .from("message_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", msg.id);
        succeeded++;
      } else {
        await supabase
          .from("message_queue")
          .update({ status: "failed", error: result.error ?? null })
          .eq("id", msg.id);
        failedCount++;
      }
    } catch (err) {
      console.error(
        `[cron/message-retry] error retrying message ${msg.id}:`,
        err
      );
      try {
        await supabase
          .from("message_queue")
          .update({
            status: "failed",
            attempts: (msg.attempts ?? 0) + 1,
          })
          .eq("id", msg.id);
      } catch {
        // Best effort — ignore update failure
      }
      failedCount++;
    }
  }

  return NextResponse.json({
    data: {
      retried: failedMessages.length,
      succeeded,
      failed: failedCount,
    },
  });
}
