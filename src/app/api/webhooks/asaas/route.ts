import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookToken } from "@/services/asaas";

export const dynamic = "force-dynamic";

/** Events that mean the payment was completed. */
const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

export async function POST(request: Request) {
  const token = request.headers.get("asaas-access-token") ?? "";

  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const event = (payload.event as string) ?? "";
  const payment = (payload.payment as Record<string, unknown>) ?? {};
  const invoiceId = (payment.externalReference as string) ?? "";
  const paymentDate = (payment.paymentDate as string) ?? null;

  // Only process payment completion and overdue events
  if (!PAID_EVENTS.has(event) && !OVERDUE_EVENTS.has(event)) {
    return NextResponse.json({ status: "ignored", event });
  }

  if (!invoiceId) {
    console.warn("[asaas-webhook] No externalReference (invoice ID), skipping");
    return NextResponse.json({
      status: "skipped",
      reason: "no_external_reference",
    });
  }

  const supabase = createAdminClient();

  try {
    if (PAID_EVENTS.has(event)) {
      // Mark payment link as paid
      await supabase
        .from("payment_links")
        .update({ status: "paid" })
        .eq("invoice_id", invoiceId);

      // Mark invoice as paid
      await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: paymentDate ?? new Date().toISOString(),
        })
        .eq("id", invoiceId);

      console.log(
        `[asaas-webhook] Invoice ${invoiceId} marked as paid (${event})`
      );
    } else if (OVERDUE_EVENTS.has(event)) {
      // Mark invoice as overdue
      await supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", invoiceId);

      console.log(
        `[asaas-webhook] Invoice ${invoiceId} marked as overdue`
      );
    }

    return NextResponse.json({ status: "ok", invoiceId, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[asaas-webhook] processing error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
