/**
 * Create a single universal payment link (billingType: UNDEFINED)
 * Usage: npx tsx scripts/create-universal-link.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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
    // skip
  }
}
loadEnv(".env.local");
loadEnv(".env");

const PATIENT_ID = "809e2b13-b3ed-4257-b810-c0849cfddc07";
const API_KEY = process.env.ASAAS_API_KEY!;
const BASE = "https://api-sandbox.asaas.com/v3";

async function main() {
  if (!API_KEY) { console.error("Missing ASAAS_API_KEY"); process.exit(1); }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env vars"); process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Look up patient
  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .select("id, name, asaas_customer_id, clinic_id")
    .eq("id", PATIENT_ID)
    .single();

  if (pErr || !patient) { console.error("Patient not found:", pErr?.message); process.exit(1); }
  console.log(`Patient: ${patient.name} | Asaas: ${patient.asaas_customer_id}`);

  // 2. Create invoice
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().split("T")[0];

  const { data: invoice, error: iErr } = await supabase
    .from("invoices")
    .insert({
      clinic_id: patient.clinic_id,
      patient_id: PATIENT_ID,
      amount_cents: 17500,
      status: "pending",
      due_date: dueDateStr,
      notes: "Consulta geral - Link universal",
    })
    .select("id")
    .single();

  if (iErr || !invoice) { console.error("Invoice error:", iErr?.message); process.exit(1); }
  console.log(`Invoice: ${invoice.id}`);

  // 3. Create UNDEFINED charge in Asaas
  const res = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: { access_token: API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: patient.asaas_customer_id,
      billingType: "UNDEFINED",
      value: 175.00,
      dueDate: dueDateStr,
      description: "Consulta geral - Link universal",
      externalReference: invoice.id,
    }),
  });

  const charge = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error("Asaas error:", JSON.stringify(charge, null, 2));
    process.exit(1);
  }

  console.log(`Charge: ${charge.id} | Status: ${charge.status}`);

  // 4. Save payment_link with method='link'
  const { error: lErr } = await supabase.from("payment_links").insert({
    clinic_id: patient.clinic_id,
    invoice_id: invoice.id,
    asaas_payment_id: charge.id,
    url: (charge.invoiceUrl as string) ?? "",
    invoice_url: (charge.invoiceUrl as string) ?? "",
    method: "link",
    status: "active",
  });

  if (lErr) { console.error("Payment link error:", lErr.message); process.exit(1); }

  console.log(`\n=== LINK UNIVERSAL (R$ 175,00) ===`);
  console.log(charge.invoiceUrl);
}

main().catch((err) => { console.error("Failed:", err.message); process.exit(1); });
