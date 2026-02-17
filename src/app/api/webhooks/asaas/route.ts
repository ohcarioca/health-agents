import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookToken } from "@/services/asaas";

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

  const supabase = createAdminClient();

  try {
    if (PAID_EVENTS.has(event)) {
      // Idempotency: skip if already paid
      const { data: invoice } = await supabase
        .from("invoices")
        .select("status")
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
    } else if (OVERDUE_EVENTS.has(event)) {
      await supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", invoiceId);

      console.log(`[asaas-webhook] Invoice ${invoiceId} overdue`);
    } else if (REFUND_EVENTS.has(event)) {
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
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas-webhook] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
