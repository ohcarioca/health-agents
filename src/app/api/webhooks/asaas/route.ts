import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookToken } from "@/services/asaas";
import { sendTextMessage, type WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

/** Events that mean the payment was completed. */
const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);
const REFUND_EVENTS = new Set(["PAYMENT_REFUNDED"]);

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const receivedToken = request.headers.get("asaas-access-token") ?? "";
  if (!verifyWebhookToken(receivedToken)) {
    console.warn("[asaas-webhook] Invalid or missing webhook token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const event = (payload.event as string) ?? "";
  const payment = (payload.payment as Record<string, unknown>) ?? {};
  const invoiceId = (payment.externalReference as string) ?? "";
  const paymentDate = (payment.paymentDate as string) ?? null;

  // Only process payment completion, overdue, and refund events
  if (
    !PAID_EVENTS.has(event) &&
    !OVERDUE_EVENTS.has(event) &&
    !REFUND_EVENTS.has(event)
  ) {
    return NextResponse.json({ status: "ignored", event });
  }

  if (!invoiceId) {
    console.warn("[asaas-webhook] No externalReference, skipping");
    return NextResponse.json({
      status: "skipped",
      reason: "no_external_reference",
    });
  }

  // Detect platform subscription charges by externalReference prefix
  const isSubscriptionCharge = invoiceId.startsWith("sub:");

  if (isSubscriptionCharge) {
    return handleSubscriptionWebhook(event, invoiceId.replace("sub:", ""), paymentDate);
  }

  const supabase = createAdminClient();

  try {
    if (PAID_EVENTS.has(event)) {
      // Idempotency: skip if already paid
      const { data: invoice } = await supabase
        .from("invoices")
        .select("status, patient_id, clinic_id, amount_cents")
        .eq("id", invoiceId)
        .single();

      if (invoice?.status === "paid") {
        console.log(
          `[asaas-webhook] Invoice ${invoiceId} already paid, skipping`
        );
        return NextResponse.json({
          status: "already_processed",
          invoiceId,
          event,
        });
      }

      await supabase
        .from("payment_links")
        .update({ status: "paid" })
        .eq("invoice_id", invoiceId);

      await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: paymentDate ?? new Date().toISOString(),
        })
        .eq("id", invoiceId);

      console.log(`[asaas-webhook] Invoice ${invoiceId} paid (${event})`);

      // Send WhatsApp payment confirmation to patient
      if (invoice?.patient_id && invoice?.clinic_id) {
        after(async () => {
          await sendPaymentConfirmation(
            invoice.patient_id as string,
            invoice.clinic_id as string,
            (invoice.amount_cents as number) ?? 0
          );
        });
      }
    } else if (OVERDUE_EVENTS.has(event)) {
      await supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", invoiceId);

      console.log(`[asaas-webhook] Invoice ${invoiceId} overdue`);
    } else if (REFUND_EVENTS.has(event)) {
      // Idempotency: skip if not currently paid
      const { data: refundInvoice } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", invoiceId)
        .single();

      if (refundInvoice?.status !== "paid") {
        console.log(
          `[asaas-webhook] Invoice ${invoiceId} not paid, skipping refund`
        );
        return NextResponse.json({
          status: "already_processed",
          invoiceId,
          event,
        });
      }

      await supabase
        .from("payment_links")
        .update({ status: "active" })
        .eq("invoice_id", invoiceId);

      await supabase
        .from("invoices")
        .update({ status: "pending", paid_at: null })
        .eq("id", invoiceId);

      console.log(`[asaas-webhook] Invoice ${invoiceId} refunded (${event})`);
    }

    return NextResponse.json({ status: "ok", invoiceId, event });
  } catch (error) {
    console.error("[asaas-webhook] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── Platform subscription webhook handler ──

async function handleSubscriptionWebhook(
  event: string,
  subscriptionLocalId: string,
  paymentDate: string | null
): Promise<NextResponse> {
  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, status, current_period_end")
    .eq("id", subscriptionLocalId)
    .single();

  if (!sub) {
    console.warn(`[asaas-webhook] Subscription ${subscriptionLocalId} not found`);
    return NextResponse.json({ status: "skipped", reason: "subscription_not_found" });
  }

  if (PAID_EVENTS.has(event)) {
    // Idempotency: if already active and period_end is in the future, skip
    const now = new Date();
    const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    if (sub.status === "active" && currentEnd && currentEnd > now) {
      console.log(`[asaas-webhook] Subscription ${sub.id} already active until ${currentEnd.toISOString()}, skipping`);
      return NextResponse.json({ status: "already_processed", subscriptionId: sub.id, event });
    }

    // Renew period
    const newPeriodEnd = new Date(currentEnd ?? now);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: paymentDate ?? now.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
      })
      .eq("id", sub.id);

    console.log(`[asaas-webhook] Subscription ${sub.id} renewed until ${newPeriodEnd.toISOString()}`);
  } else if (OVERDUE_EVENTS.has(event)) {
    if (sub.status !== "past_due") {
      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", sub.id);
      console.log(`[asaas-webhook] Subscription ${sub.id} marked past_due`);
    }
  }

  return NextResponse.json({ status: "ok", subscriptionId: sub.id, event });
}

// ── Payment confirmation via WhatsApp ──

async function sendPaymentConfirmation(
  patientId: string,
  clinicId: string,
  amountCents: number
): Promise<void> {
  try {
    const supabase = createAdminClient();

    const [patientResult, clinicResult] = await Promise.all([
      supabase
        .from("patients")
        .select("name, phone")
        .eq("id", patientId)
        .single(),
      supabase
        .from("clinics")
        .select(
          "name, whatsapp_phone_number_id, whatsapp_access_token"
        )
        .eq("id", clinicId)
        .single(),
    ]);

    const patient = patientResult.data;
    const clinic = clinicResult.data;

    if (!patient?.phone || !clinic?.whatsapp_phone_number_id || !clinic?.whatsapp_access_token) {
      console.warn("[asaas-webhook] Missing patient phone or clinic WhatsApp credentials for payment confirmation");
      return;
    }

    const credentials: WhatsAppCredentials = {
      phoneNumberId: clinic.whatsapp_phone_number_id as string,
      accessToken: clinic.whatsapp_access_token as string,
    };

    const firstName = (patient.name as string).split(" ")[0];
    const amountFormatted = `R$ ${(amountCents / 100).toFixed(2).replace(".", ",")}`;

    const message =
      `${firstName}, seu pagamento de ${amountFormatted} foi confirmado! ` +
      `Obrigado. Caso tenha alguma duvida, estamos a disposicao.`;

    const result = await sendTextMessage(
      patient.phone as string,
      message,
      credentials
    );

    if (result.success) {
      console.log(`[asaas-webhook] Payment confirmation sent to ${patientId}`);

      // Save the confirmation message to message_queue for tracking
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          clinic_id: clinicId,
          content: message,
          role: "assistant",
        });

        await supabase.from("message_queue").insert({
          clinic_id: clinicId,
          patient_id: patientId,
          conversation_id: conversation.id,
          channel: "whatsapp",
          content: message,
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: 1,
          max_attempts: 3,
          source: "asaas_webhook",
        });
      }
    } else {
      console.error("[asaas-webhook] Payment confirmation send failed:", result.error);
    }
  } catch (error) {
    console.error("[asaas-webhook] Payment confirmation error:", error);
  }
}
