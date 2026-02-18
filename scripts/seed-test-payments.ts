/**
 * Seed test payments for a specific patient
 * Creates invoices in DB + real Asaas charges (PIX, CREDIT_CARD, BOLETO)
 *
 * Usage: npx tsx scripts/seed-test-payments.ts
 *
 * Requires in .env or .env.local:
 *   - ASAAS_API_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// ---------- Config ----------

const PATIENT_ID = "809e2b13-b3ed-4257-b810-c0849cfddc07";

const PAYMENTS = [
  { method: "pix" as const, billingType: "PIX" as const, amountCents: 15000, notes: "Consulta cardiológica - Pix" },
  { method: "credit_card" as const, billingType: "CREDIT_CARD" as const, amountCents: 20000, notes: "Exame laboratorial - Cartão" },
  { method: "boleto" as const, billingType: "BOLETO" as const, amountCents: 10000, notes: "Retorno odontológico - Boleto" },
];

// ---------- Env loader (same pattern as test-asaas.ts) ----------

function loadEnv(filePath: string) {
  try {
    const content = readFileSync(resolve(filePath), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file not found, skip
  }
}
loadEnv(".env.local");
loadEnv(".env");

// ---------- Asaas helpers ----------

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_ENV = process.env.ASAAS_ENV ?? "sandbox";
const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

async function asaasFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...options,
    headers: {
      access_token: ASAAS_API_KEY!,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`Asaas API error (${res.status}):`, JSON.stringify(body, null, 2));
    throw new Error(`Asaas HTTP ${res.status}`);
  }
  return body as T;
}

// ---------- Supabase ----------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- Main ----------

async function main() {
  // Validate env
  if (!ASAAS_API_KEY) { console.error("Missing ASAAS_API_KEY"); process.exit(1); }
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY"); process.exit(1); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`\n=== Seed Test Payments (${ASAAS_ENV}) ===`);
  console.log(`Patient: ${PATIENT_ID}\n`);

  // 1. Look up patient
  console.log("1. Looking up patient...");
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, name, phone, email, cpf, asaas_customer_id, clinic_id")
    .eq("id", PATIENT_ID)
    .single();

  if (patientError || !patient) {
    console.error("Patient not found:", patientError?.message);
    process.exit(1);
  }
  console.log(`   Name: ${patient.name}`);
  console.log(`   Phone: ${patient.phone}`);
  console.log(`   CPF: ${patient.cpf ?? "NOT SET"}`);
  console.log(`   Asaas Customer: ${patient.asaas_customer_id ?? "NOT SET"}`);
  console.log(`   Clinic: ${patient.clinic_id}\n`);

  // 2. Ensure Asaas customer exists
  let customerId = patient.asaas_customer_id;

  if (!customerId) {
    if (!patient.cpf) {
      console.error("Patient has no CPF — required for Asaas customer creation.");
      console.error("Update the patient first: UPDATE patients SET cpf = '...' WHERE id = '...'");
      process.exit(1);
    }

    console.log("2. Creating Asaas customer...");
    const customer = await asaasFetch<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: patient.name,
        cpfCnpj: patient.cpf,
        phone: patient.phone,
        email: patient.email,
        externalReference: patient.id,
      }),
    });
    customerId = customer.id;

    await supabase
      .from("patients")
      .update({ asaas_customer_id: customerId })
      .eq("id", PATIENT_ID);

    console.log(`   Created: ${customerId}\n`);
  } else {
    console.log(`2. Asaas customer already exists: ${customerId}\n`);
  }

  // 3. Create invoices + Asaas charges
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().split("T")[0];

  const results: Array<{
    method: string;
    invoiceId: string;
    chargeId: string;
    invoiceUrl: string;
    amountBrl: string;
  }> = [];

  for (let i = 0; i < PAYMENTS.length; i++) {
    const p = PAYMENTS[i];
    const step = i + 3;
    const amountBrl = (p.amountCents / 100).toFixed(2);

    console.log(`${step}. Creating ${p.billingType} — R$ ${amountBrl}...`);

    // Insert invoice in DB
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .insert({
        clinic_id: patient.clinic_id,
        patient_id: PATIENT_ID,
        amount_cents: p.amountCents,
        status: "pending",
        due_date: dueDateStr,
        notes: p.notes,
      })
      .select("id")
      .single();

    if (invError || !invoice) {
      console.error(`   Failed to create invoice:`, invError?.message);
      continue;
    }
    console.log(`   Invoice: ${invoice.id}`);

    // Create Asaas charge
    const charge = await asaasFetch<{
      id: string;
      invoiceUrl?: string;
      bankSlipUrl?: string;
      status?: string;
    }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: p.billingType,
        value: p.amountCents / 100,
        dueDate: dueDateStr,
        description: p.notes,
        externalReference: invoice.id,
      }),
    });
    console.log(`   Asaas charge: ${charge.id} (${charge.status})`);
    console.log(`   Invoice URL: ${charge.invoiceUrl}`);

    // For Pix, fetch QR code
    let pixPayload: string | null = null;
    if (p.billingType === "PIX") {
      try {
        const pix = await asaasFetch<{ payload: string }>(`/payments/${charge.id}/pixQrCode`);
        pixPayload = pix.payload;
        console.log(`   Pix payload: ${pixPayload?.substring(0, 50)}...`);
      } catch {
        console.log(`   Pix QR not yet available`);
      }
    }

    // For Boleto, fetch identification field
    let boletoField: string | null = null;
    if (p.billingType === "BOLETO") {
      try {
        const boleto = await asaasFetch<{ identificationField: string }>(`/payments/${charge.id}/identificationField`);
        boletoField = boleto.identificationField;
        console.log(`   Boleto linha digitável: ${boletoField}`);
      } catch {
        console.log(`   Boleto info not yet available`);
      }
    }

    // Insert payment_link in DB
    const { error: linkError } = await supabase
      .from("payment_links")
      .insert({
        clinic_id: patient.clinic_id,
        invoice_id: invoice.id,
        asaas_payment_id: charge.id,
        url: charge.invoiceUrl ?? "",
        invoice_url: charge.invoiceUrl,
        method: p.method,
        status: "active",
        pix_payload: pixPayload,
        boleto_identification_field: boletoField,
      });

    if (linkError) {
      console.error(`   Failed to create payment_link:`, linkError.message);
    } else {
      console.log(`   Payment link saved`);
    }

    results.push({
      method: p.billingType,
      invoiceId: invoice.id,
      chargeId: charge.id,
      invoiceUrl: charge.invoiceUrl ?? "",
      amountBrl: `R$ ${amountBrl}`,
    });
    console.log();
  }

  // Summary
  console.log("=== SUMMARY ===\n");
  console.log("Patient:", patient.name);
  console.log("Asaas Customer:", customerId);
  console.log("Due date:", dueDateStr);
  console.log();

  for (const r of results) {
    console.log(`${r.method} (${r.amountBrl}):`);
    console.log(`  Invoice ID: ${r.invoiceId}`);
    console.log(`  Charge ID:  ${r.chargeId}`);
    console.log(`  Pay URL:    ${r.invoiceUrl}`);
    console.log();
  }

  console.log("Next steps:");
  console.log("1. Go to Asaas sandbox → Cobranças → find these charges");
  console.log("2. Force payment (Simular recebimento) for each");
  console.log("3. Asaas will send webhook to your /api/webhooks/asaas endpoint");
  console.log("4. Check invoices table for status updates (pending → paid)\n");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
