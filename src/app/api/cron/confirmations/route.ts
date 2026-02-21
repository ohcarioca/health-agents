import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron, findOrCreateConversation, getSubscribedClinicIds } from "@/lib/cron";
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
  if (!isAuthorizedCron(request)) {
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

  // ── Batch-fetch all related entities ──
  const appointmentIds = [...new Set(pendingEntries.map((e) => e.appointment_id))];
  const clinicIds = [...new Set(pendingEntries.map((e) => e.clinic_id))];

  const [appointmentsResult, clinicsResult, subscribedClinicIds] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, status, starts_at, patient_id, professional_id")
      .in("id", appointmentIds),
    supabase
      .from("clinics")
      .select("id, timezone, whatsapp_phone_number_id, whatsapp_access_token, is_active")
      .in("id", clinicIds),
    getSubscribedClinicIds(supabase),
  ]);

  const appointmentsMap = new Map(
    (appointmentsResult.data ?? []).map((a) => [a.id, a]),
  );
  const clinicsMap = new Map(
    (clinicsResult.data ?? []).map((c) => [c.id, c]),
  );

  // Collect patient and professional IDs from fetched appointments
  const patientIds = [...new Set(
    (appointmentsResult.data ?? [])
      .map((a) => a.patient_id)
      .filter((id): id is string => !!id),
  )];
  const professionalIds = [...new Set(
    (appointmentsResult.data ?? [])
      .map((a) => a.professional_id)
      .filter((id): id is string => !!id),
  )];

  const [patientsResult, professionalsResult] = await Promise.all([
    patientIds.length > 0
      ? supabase.from("patients").select("id, name, phone").in("id", patientIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string }[] }),
    professionalIds.length > 0
      ? supabase.from("professionals").select("id, name").in("id", professionalIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const patientsMap = new Map(
    (patientsResult.data ?? []).map((p) => [p.id, p]),
  );
  const professionalsMap = new Map(
    (professionalsResult.data ?? []).map((p) => [p.id, p]),
  );

  let sent = 0;
  let failed = 0;

  for (const entry of pendingEntries) {
    try {
      // 2. Look up appointment from batch
      const appointment = appointmentsMap.get(entry.appointment_id);
      if (!appointment) {
        console.error(
          `[cron/confirmations] appointment not found for entry ${entry.id}`
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

      // 4. Look up patient from batch
      const patient = patientsMap.get(appointment.patient_id);
      if (!patient) {
        console.error(
          `[cron/confirmations] patient not found for entry ${entry.id}`
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      // 5. Look up professional name from batch (nullable)
      const professionalName = appointment.professional_id
        ? (professionalsMap.get(appointment.professional_id)?.name ?? "o profissional")
        : "o profissional";

      // 6. Look up clinic from batch
      const clinic = clinicsMap.get(entry.clinic_id);
      if (!clinic || !clinic.is_active) {
        console.log(
          `[cron/confirmations] skipping entry ${entry.id}: clinic not found or inactive`
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      // 6a. Skip clinics without active subscription
      if (!subscribedClinicIds.has(entry.clinic_id)) {
        console.log(
          `[cron/confirmations] skipping entry ${entry.id}: clinic ${entry.clinic_id} has no active subscription`
        );
        await markFailed(supabase, entry.id);
        failed++;
        continue;
      }

      const timezone = clinic.timezone as string;

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
        continue; // Don't mark as failed — will be retried
      }

      // 8. Mark as processing
      await supabase
        .from("confirmation_queue")
        .update({ status: "processing" })
        .eq("id", entry.id);

      // 9. Find or create conversation (skip if escalated — reset to pending for retry)
      const conversationId = await findOrCreateConversation(
        supabase,
        entry.clinic_id,
        patient.id,
        "cron/confirmations"
      );

      if (conversationId === null) {
        await supabase
          .from("confirmation_queue")
          .update({ status: "pending" })
          .eq("id", entry.id);
        continue;
      }

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

