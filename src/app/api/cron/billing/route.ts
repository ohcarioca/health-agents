import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import {
  sendOutboundMessage,
  isWithinBusinessHours,
  canSendToPatient,
} from "@/lib/agents/outbound";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

// ── Drip Tone Logic ──

function getReminderTone(
  attempts: number,
  dueDate: string
): "gentle" | "direct" | "urgent" {
  const daysUntilDue =
    (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  if (attempts >= 2 || daysUntilDue < 0) return "urgent";
  if (attempts >= 1 || daysUntilDue <= 3) return "direct";
  return "gentle";
}

// ── Formatting ──

function formatBrl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// ── GET Handler ──

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(`
      id, clinic_id, patient_id, amount_cents, due_date, status, notes,
      patients!inner ( id, name, phone )
    `)
    .in("status", ["pending", "overdue"])
    .lte("due_date", today);

  if (error) {
    console.error("[cron/billing] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0, total: 0 });
  }

  let processed = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const patient = invoice.patients as Record<string, unknown>;
    if (!patient) continue;

    const patientPhone = (patient.phone as string) ?? "";
    const patientName = ((patient.name as string) ?? "").split(" ")[0];
    const patientId = patient.id as string;

    const { data: clinic } = await supabase
      .from("clinics")
      .select("timezone, whatsapp_phone_number_id, whatsapp_access_token, is_active")
      .eq("id", invoice.clinic_id)
      .single();

    if (clinic && !clinic.is_active) {
      console.log(
        `[cron/billing] skipping invoice ${invoice.id}: clinic is not active`
      );
      skipped++;
      continue;
    }

    const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

    // Build WhatsApp credentials
    const credentials: WhatsAppCredentials = {
      phoneNumberId: (clinic?.whatsapp_phone_number_id as string) ?? "",
      accessToken: (clinic?.whatsapp_access_token as string) ?? "",
    };

    if (!credentials.phoneNumberId || !credentials.accessToken) {
      console.log(
        `[cron/billing] skipping invoice ${invoice.id}: clinic has no WhatsApp credentials`
      );
      skipped++;
      continue;
    }

    if (!isWithinBusinessHours(new Date(), timezone)) {
      skipped++;
      continue;
    }

    const canSend = await canSendToPatient(
      supabase,
      invoice.clinic_id,
      patientId,
      timezone
    );
    if (!canSend) {
      skipped++;
      continue;
    }

    // Count previous billing messages for this invoice
    const { data: previousMessages } = await supabase
      .from("message_queue")
      .select("id")
      .eq("clinic_id", invoice.clinic_id)
      .eq("patient_id", patientId)
      .eq("source", `billing:${invoice.id}`);

    const attemptCount = previousMessages?.length ?? 0;

    if (attemptCount >= 3) {
      if (invoice.status !== "overdue") {
        await supabase
          .from("invoices")
          .update({ status: "overdue" })
          .eq("id", invoice.id);
      }
      skipped++;
      continue;
    }

    const tone = getReminderTone(attemptCount, invoice.due_date);
    const amount = formatBrl(invoice.amount_cents);
    const dueDateFormatted = new Date(invoice.due_date).toLocaleDateString(
      "pt-BR"
    );

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("clinic_id", invoice.clinic_id)
      .eq("patient_id", patientId)
      .eq("channel", "whatsapp")
      .eq("status", "active")
      .maybeSingle();

    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
      await supabase
        .from("conversations")
        .update({ current_module: "billing" })
        .eq("id", conversationId);
    } else {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          clinic_id: invoice.clinic_id,
          patient_id: patientId,
          channel: "whatsapp",
          status: "active",
          current_module: "billing",
        })
        .select("id")
        .single();
      conversationId = newConv?.id ?? "";
    }

    const messages: Record<string, string> = {
      gentle: `Ola ${patientName}! Tudo bem? Identificamos um valor pendente de ${amount} com vencimento em ${dueDateFormatted}. Posso gerar um link de pagamento via Pix ou boleto para facilitar?`,
      direct: `Ola ${patientName}, passando para lembrar do pagamento pendente de ${amount} (vencimento: ${dueDateFormatted}). Deseja que eu gere o link de pagamento?`,
      urgent: `${patientName}, seu pagamento de ${amount} esta em atraso (vencimento: ${dueDateFormatted}). Por favor, regularize para evitar pendencias. Posso ajudar com o link de pagamento agora.`,
    };

    // Queue with source tag for drip tracking
    await supabase.from("message_queue").insert({
      conversation_id: conversationId,
      clinic_id: invoice.clinic_id,
      patient_id: patientId,
      channel: "whatsapp",
      content: messages[tone],
      status: "pending",
      attempts: 0,
      max_attempts: 3,
      source: `billing:${invoice.id}`,
    });

    const sendResult = await sendOutboundMessage(supabase, {
      clinicId: invoice.clinic_id,
      patientId,
      patientPhone,
      text: messages[tone],
      timezone,
      conversationId,
      credentials,
      skipBusinessHoursCheck: true,
    });

    if (sendResult.success) processed++;
    else skipped++;
  }

  return NextResponse.json({ processed, skipped, total: invoices.length });
}
