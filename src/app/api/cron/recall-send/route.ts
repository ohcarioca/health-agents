import { NextResponse } from "next/server";
import crypto from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOutboundTemplate,
  isWithinBusinessHours,
  canSendToPatient,
} from "@/lib/agents/outbound";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

// ── Constants ──

const MAX_RECALL_ATTEMPTS = 3;
const TEMPLATE_NAME = "reativacao_paciente";
const TEMPLATE_LANGUAGE = "pt_BR";

// ── Auth ──

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;

  const token = header.replace("Bearer ", "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

function getFirstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

// ── GET handler ──

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch pending recall entries with patient data
  const { data: entries, error } = await supabase
    .from("recall_queue")
    .select(`
      id, clinic_id, patient_id, attempts, last_visit_at,
      patients!inner ( id, name, phone )
    `)
    .eq("status", "pending")
    .limit(50);

  if (error) {
    console.error("[cron/recall-send] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, total: 0 });
  }

  let sent = 0;
  let skipped = 0;

  for (const entry of entries) {
    try {
      const patient = entry.patients as unknown as Record<string, unknown>;
      if (!patient) {
        skipped++;
        continue;
      }

      const patientName = getFirstName((patient.name as string) ?? "");
      const patientPhone = (patient.phone as string) ?? "";
      const patientId = patient.id as string;

      // Max attempts reached — mark as sent and skip
      if (entry.attempts >= MAX_RECALL_ATTEMPTS) {
        await supabase
          .from("recall_queue")
          .update({ status: "sent" })
          .eq("id", entry.id);
        skipped++;
        continue;
      }

      // Fetch clinic for timezone and name
      const { data: clinic } = await supabase
        .from("clinics")
        .select("timezone, name, whatsapp_phone_number_id, whatsapp_access_token")
        .eq("id", entry.clinic_id)
        .single();

      const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";
      const clinicName = (clinic?.name as string) || "a clinica";

      // Build WhatsApp credentials
      const credentials: WhatsAppCredentials = {
        phoneNumberId: (clinic?.whatsapp_phone_number_id as string) ?? "",
        accessToken: (clinic?.whatsapp_access_token as string) ?? "",
      };

      if (!credentials.phoneNumberId || !credentials.accessToken) {
        console.log(
          `[cron/recall-send] skipping entry ${entry.id}: clinic has no WhatsApp credentials`
        );
        skipped++;
        continue;
      }

      // Check business hours
      if (!isWithinBusinessHours(new Date(), timezone)) {
        skipped++;
        continue;
      }

      // Check daily rate limit
      const canSend = await canSendToPatient(
        supabase,
        entry.clinic_id,
        patientId,
        timezone
      );
      if (!canSend) {
        skipped++;
        continue;
      }

      // Mark as processing
      await supabase
        .from("recall_queue")
        .update({ status: "processing" })
        .eq("id", entry.id);

      // Find or create conversation for outbound template
      const conversationId = await findOrCreateConversation(
        supabase,
        entry.clinic_id,
        patientId
      );

      const localBody = `Ola ${patientName}! Faz tempo desde sua ultima visita em ${clinicName}. Gostariam de agendar um retorno? Estamos a disposicao!`;

      const result = await sendOutboundTemplate(supabase, {
        clinicId: entry.clinic_id,
        patientId,
        patientPhone,
        templateName: TEMPLATE_NAME,
        templateLanguage: TEMPLATE_LANGUAGE,
        templateParams: [patientName, clinicName],
        localBody,
        timezone,
        conversationId,
        credentials,
        skipBusinessHoursCheck: true,
      });

      if (result.success) {
        await supabase
          .from("recall_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempts: entry.attempts + 1,
          })
          .eq("id", entry.id);
        sent++;
      } else {
        console.error(
          `[cron/recall-send] send failed for entry ${entry.id}:`,
          result.skippedReason
        );
        await supabase
          .from("recall_queue")
          .update({
            status: "pending",
            attempts: entry.attempts + 1,
          })
          .eq("id", entry.id);
        skipped++;
      }
    } catch (err) {
      console.error(
        `[cron/recall-send] unexpected error for entry ${entry.id}:`,
        err
      );
      await supabase
        .from("recall_queue")
        .update({
          status: "pending",
          attempts: entry.attempts + 1,
        })
        .eq("id", entry.id);
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, total: entries.length });
}

// ── Helpers ──

async function findOrCreateConversation(
  supabase: ReturnType<typeof createAdminClient>,
  clinicId: string,
  patientId: string
): Promise<string> {
  // Try to find an existing active WhatsApp conversation
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .eq("channel", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  // Create a new conversation
  const { data: newConv, error: createError } = await supabase
    .from("conversations")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !newConv) {
    console.error(
      "[cron/recall-send] failed to create conversation:",
      createError?.message
    );
    throw new Error("failed to create conversation");
  }

  return newConv.id;
}
