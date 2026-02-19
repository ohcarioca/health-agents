import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentLinkSchema } from "@/lib/validations/billing";
import {
  createCustomer,
  createCharge,
  getPixQrCode,
  getBoletoIdentificationField,
} from "@/services/asaas";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPaymentLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId, "strict");
  if (limited) return limited;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: invoice, error: invError } = await admin
    .from("invoices")
    .select(
      "*, patients!inner(id, name, phone, email, cpf, asaas_customer_id)",
    )
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (invError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const patient = invoice.patients as {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    asaas_customer_id: string | null;
  };

  let asaasCustomerId = patient.asaas_customer_id;
  if (!asaasCustomerId) {
    if (!patient.cpf) {
      return NextResponse.json(
        { error: "Patient has no CPF registered (required for billing)" },
        { status: 422 },
      );
    }

    const customerResult = await createCustomer({
      name: patient.name,
      cpfCnpj: patient.cpf,
      phone: patient.phone,
      email: patient.email ?? undefined,
      externalReference: patient.id,
    });

    if (!customerResult.success || !customerResult.customerId) {
      return NextResponse.json(
        { error: customerResult.error ?? "Failed to create Asaas customer" },
        { status: 500 },
      );
    }

    asaasCustomerId = customerResult.customerId;

    await admin
      .from("patients")
      .update({ asaas_customer_id: asaasCustomerId })
      .eq("id", patient.id);
  }

  const billingTypeMap = {
    pix: "PIX" as const,
    boleto: "BOLETO" as const,
    credit_card: "CREDIT_CARD" as const,
    link: "UNDEFINED" as const,
  };

  const chargeResult = await createCharge({
    customerId: asaasCustomerId,
    billingType: billingTypeMap[parsed.data.method],
    valueCents: invoice.amount_cents,
    dueDate: invoice.due_date,
    description: `Invoice ${invoice.id}`,
    externalReference: invoice.id,
  });

  if (!chargeResult.success || !chargeResult.chargeId) {
    return NextResponse.json(
      { error: chargeResult.error ?? "Failed to create charge" },
      { status: 500 },
    );
  }

  let pixPayload: string | null = null;
  let boletoField: string | null = null;

  if (parsed.data.method === "pix") {
    const pixResult = await getPixQrCode(chargeResult.chargeId);
    if (pixResult.success) pixPayload = pixResult.payload ?? null;
  } else if (parsed.data.method === "boleto") {
    const boletoResult = await getBoletoIdentificationField(
      chargeResult.chargeId,
    );
    if (boletoResult.success)
      boletoField = boletoResult.identificationField ?? null;
  }

  const { data: link, error: linkError } = await admin
    .from("payment_links")
    .insert({
      clinic_id: clinicId,
      invoice_id: invoice.id,
      asaas_payment_id: chargeResult.chargeId,
      url: chargeResult.invoiceUrl ?? "",
      invoice_url: chargeResult.invoiceUrl ?? null,
      method: parsed.data.method,
      status: "active",
      pix_payload: pixPayload,
      boleto_identification_field: boletoField,
    })
    .select()
    .single();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ data: link }, { status: 201 });
}
