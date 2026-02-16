import { NextResponse } from "next/server";
import crypto from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOutboundTemplate,
  isWithinBusinessHours,
} from "@/lib/agents/outbound";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

// ── Constants ──

const SKIPPED_STATUSES = ["cancelled", "completed", "no_show"];
const TEMPLATE_NAME = "lembrete_da_sua_consulta";
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

// ── Date formatting ──

function formatDateInTimezone(isoDate: string, timezone: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTimeInTimezone(isoDate: string, timezone: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

  // 1. Query pending entries whose scheduled_at has arrived
  const now = new Date().toISOString();
  const { data: pendingEntries, error: queryError } = await supabase
    .from("confirmation_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now);

  if (queryError) {
    console.error("[cron/confirmations] query error:", queryError.message);
    return NextResponse.json(
      { error: "failed to query confirmation queue" },
      { status: 500 }
    );
  }

  if (!pendingEntries || pendingEntries.length === 0) {
    return NextResponse.json({ data: { processed: 0, sent: 0, failed: 0 } });
  }

  let sent = 0;
  let failed = 0;

  for (const entry of pendingEntries) {
    try {
      // 2. Fetch the appointment
      const { data: appointment, error: apptError } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", entry.appointment_id)
        .single();

      if (apptError || !appointment) {
        console.error(
          `[cron/confirmations] appointment not found for entry ${entry.id}:`,
          apptError?.message
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      // 3. Skip cancelled/completed/no_show appointments
      if (SKIPPED_STATUSES.includes(appointment.status)) {
        console.log(
          `[cron/confirmations] skipping entry ${entry.id}: appointment status is ${appointment.status}`
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      // 4. Fetch patient
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("id", appointment.patient_id)
        .single();

      if (patientError || !patient) {
        console.error(
          `[cron/confirmations] patient not found for entry ${entry.id}:`,
          patientError?.message
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      // 5. Fetch professional (nullable)
      let professionalName = "o profissional";
      if (appointment.professional_id) {
        const { data: professional } = await supabase
          .from("professionals")
          .select("name")
          .eq("id", appointment.professional_id)
          .single();

        if (professional) {
          professionalName = professional.name;
        }
      }

      // 6. Fetch clinic for timezone
      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .select("timezone, whatsapp_phone_number_id, whatsapp_access_token")
        .eq("id", entry.clinic_id)
        .single();

      if (clinicError || !clinic) {
        console.error(
          `[cron/confirmations] clinic not found for entry ${entry.id}:`,
          clinicError?.message
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      const timezone = clinic.timezone;

      // 6b. Build WhatsApp credentials
      const credentials: WhatsAppCredentials = {
        phoneNumberId: (clinic.whatsapp_phone_number_id as string) ?? "",
        accessToken: (clinic.whatsapp_access_token as string) ?? "",
      };

      if (!credentials.phoneNumberId || !credentials.accessToken) {
        console.log(
          `[cron/confirmations] skipping entry ${entry.id}: clinic has no WhatsApp credentials`
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      // 7. Check business hours
      if (!isWithinBusinessHours(new Date(), timezone)) {
        console.log(
          `[cron/confirmations] skipping entry ${entry.id}: outside business hours`
        );
        continue;
      }

      // 8. Mark as processing
      await supabase
        .from("confirmation_queue")
        .update({ status: "processing" })
        .eq("id", entry.id);

      // 9. Find or create conversation
      const conversationId = await findOrCreateConversation(
        supabase,
        entry.clinic_id,
        patient.id
      );

      // 10. Format message params
      const patientFirstName = getFirstName(patient.name);
      const dateFormatted = formatDateInTimezone(appointment.starts_at, timezone);
      const timeFormatted = formatTimeInTimezone(appointment.starts_at, timezone);

      const localBody = `Ola ${patientFirstName}! Lembrete: voce tem consulta com ${professionalName} em ${dateFormatted} as ${timeFormatted}. Pode confirmar sua presenca?`;

      // 11. Send via outbound template
      const sendResult = await sendOutboundTemplate(supabase, {
        clinicId: entry.clinic_id,
        patientId: patient.id,
        patientPhone: patient.phone,
        templateName: TEMPLATE_NAME,
        templateLanguage: TEMPLATE_LANGUAGE,
        templateParams: [
          patientFirstName,
          professionalName,
          dateFormatted,
          timeFormatted,
        ],
        localBody,
        timezone,
        conversationId,
        credentials,
        skipBusinessHoursCheck: true,
      });

      // 12. Set conversation module to confirmation so replies route correctly
      if (sendResult.success) {
        await supabase
          .from("conversations")
          .update({ current_module: "confirmation" })
          .eq("id", conversationId);

        await supabase
          .from("confirmation_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", entry.id);
        sent++;
      } else {
        console.error(
          `[cron/confirmations] send failed for entry ${entry.id}:`,
          sendResult.skippedReason
        );
        await markFailed(supabase, entry.id);
        failed++;
      }
    } catch (err) {
      console.error(
        `[cron/confirmations] unexpected error for entry ${entry.id}:`,
        err
      );
      await markFailed(supabase, entry.id).catch(() => {
        // Ignore — best effort
      });
      failed++;
    }
  }

  return NextResponse.json({
    data: { processed: pendingEntries.length, sent, failed },
  });
}

// ── Helpers ──

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  entryId: string
): Promise<void> {
  await supabase
    .from("confirmation_queue")
    .update({ status: "failed" })
    .eq("id", entryId);
}

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
      "[cron/confirmations] failed to create conversation:",
      createError?.message
    );
    throw new Error("failed to create conversation");
  }

  return newConv.id;
}
