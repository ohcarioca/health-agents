import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron, findOrCreateConversation } from "@/lib/cron";
import {
  sendOutboundMessage,
  isWithinBusinessHours,
} from "@/lib/agents/outbound";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

// ── Constants ──

const HOURS_SINCE_COMPLETION = 24;

// ── Helpers ──

function getFirstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

// ── GET handler ──

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Build a set of clinic IDs where the NPS module is disabled
  const { data: disabledNpsModules } = await supabase
    .from("module_configs")
    .select("clinic_id")
    .eq("module_type", "nps")
    .eq("enabled", false);
  const npsDisabledClinicIds = new Set(
    (disabledNpsModules ?? []).map((m) => m.clinic_id as string)
  );

  // 1. Find completed appointments updated in the last 24 hours
  const cutoff = new Date(
    Date.now() - HOURS_SINCE_COMPLETION * 60 * 60 * 1000
  ).toISOString();

  const { data: completedAppointments, error: queryError } = await supabase
    .from("appointments")
    .select("*")
    .eq("status", "completed")
    .gte("updated_at", cutoff);

  if (queryError) {
    console.error("[cron/nps] query error:", queryError.message);
    return NextResponse.json(
      { error: "failed to query completed appointments" },
      { status: 500 }
    );
  }

  if (!completedAppointments || completedAppointments.length === 0) {
    return NextResponse.json({ data: { processed: 0, sent: 0, skipped: 0 } });
  }

  let sent = 0;
  let skipped = 0;

  for (const appointment of completedAppointments) {
    try {
      // Skip if NPS module is disabled for this clinic
      if (npsDisabledClinicIds.has(appointment.clinic_id)) {
        skipped++;
        continue;
      }

      // 2. Check if NPS response already exists for this appointment
      const { data: existingNps } = await supabase
        .from("nps_responses")
        .select("id")
        .eq("appointment_id", appointment.id)
        .maybeSingle();

      if (existingNps) {
        skipped++;
        continue;
      }

      // 3. Fetch patient
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("id", appointment.patient_id)
        .single();

      if (patientError || !patient) {
        console.error(
          `[cron/nps] patient not found for appointment ${appointment.id}:`,
          patientError?.message
        );
        skipped++;
        continue;
      }

      // 4. Fetch professional name
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

      // 5. Fetch clinic for timezone
      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .select("timezone, whatsapp_phone_number_id, whatsapp_access_token, is_active")
        .eq("id", appointment.clinic_id)
        .single();

      if (clinicError || !clinic) {
        console.error(
          `[cron/nps] clinic not found for appointment ${appointment.id}:`,
          clinicError?.message
        );
        skipped++;
        continue;
      }

      if (!clinic.is_active) {
        console.log(
          `[cron/nps] skipping appointment ${appointment.id}: clinic is not active`
        );
        skipped++;
        continue;
      }

      const timezone = clinic.timezone;

      // 5b. Build WhatsApp credentials
      const credentials: WhatsAppCredentials = {
        phoneNumberId: (clinic.whatsapp_phone_number_id as string) ?? "",
        accessToken: (clinic.whatsapp_access_token as string) ?? "",
      };

      if (!credentials.phoneNumberId || !credentials.accessToken) {
        console.log(
          `[cron/nps] skipping appointment ${appointment.id}: clinic has no WhatsApp credentials`
        );
        skipped++;
        continue;
      }

      // 6. Check business hours
      if (!isWithinBusinessHours(new Date(), timezone)) {
        console.log(
          `[cron/nps] skipping appointment ${appointment.id}: outside business hours`
        );
        continue;
      }

      // 7. Find or create conversation (skip if escalated)
      const conversationId = await findOrCreateConversation(
        supabase,
        appointment.clinic_id,
        patient.id,
        "cron/nps"
      );

      if (conversationId === null) {
        skipped++;
        continue;
      }

      // 8. Create NPS response placeholder
      const { error: npsInsertError } = await supabase
        .from("nps_responses")
        .insert({
          clinic_id: appointment.clinic_id,
          appointment_id: appointment.id,
          patient_id: appointment.patient_id,
          score: null,
          comment: null,
          review_sent: false,
          alert_sent: false,
        });

      if (npsInsertError) {
        console.error(
          `[cron/nps] failed to create nps_responses for appointment ${appointment.id}:`,
          npsInsertError.message
        );
        skipped++;
        continue;
      }

      // 9. Set conversation current_module to "nps"
      await supabase
        .from("conversations")
        .update({ current_module: "nps" })
        .eq("id", conversationId);

      // 10. Send survey message
      const patientFirstName = getFirstName(patient.name);
      const text = `Olá ${patientFirstName}! Como foi sua consulta com ${professionalName}? De uma nota de 0 a 10 para nos ajudar a melhorar o atendimento.`;

      const sendResult = await sendOutboundMessage(supabase, {
        clinicId: appointment.clinic_id,
        patientId: patient.id,
        patientPhone: patient.phone,
        text,
        timezone,
        conversationId,
        credentials,
        skipBusinessHoursCheck: true,
      });

      if (sendResult.success) {
        sent++;
      } else {
        console.error(
          `[cron/nps] send failed for appointment ${appointment.id}:`,
          sendResult.skippedReason
        );
        skipped++;
      }
    } catch (err) {
      console.error(
        `[cron/nps] unexpected error for appointment ${appointment.id}:`,
        err
      );
      skipped++;
    }
  }

  return NextResponse.json({
    data: { processed: completedAppointments.length, sent, skipped },
  });
}

