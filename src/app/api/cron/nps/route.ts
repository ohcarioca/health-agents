import { NextResponse } from "next/server";
import crypto from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOutboundMessage,
  isWithinBusinessHours,
} from "@/lib/agents/outbound";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

// ── Constants ──

const HOURS_SINCE_COMPLETION = 24;

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

// ── Helpers ──

function getFirstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

// ── GET handler ──

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

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
        .select("timezone, whatsapp_phone_number_id, whatsapp_access_token")
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

      // 7. Create NPS response placeholder
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

      // 8. Find or create conversation
      const conversationId = await findOrCreateConversation(
        supabase,
        appointment.clinic_id,
        patient.id
      );

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
      "[cron/nps] failed to create conversation:",
      createError?.message
    );
    throw new Error("failed to create conversation");
  }

  return newConv.id;
}
