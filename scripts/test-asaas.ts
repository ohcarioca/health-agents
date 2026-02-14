/**
 * Asaas sandbox integration test
 * Usage: npx tsx scripts/test-asaas.ts
 *
 * Requires: ASAAS_API_KEY in .env or .env.local
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually (no dotenv dependency)
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
      // Remove surrounding quotes
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

const API_KEY = process.env.ASAAS_API_KEY;
const ENV = process.env.ASAAS_ENV ?? "sandbox";
const BASE_URL =
  ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

if (!API_KEY) {
  console.error("ASAAS_API_KEY not found in .env or .env.local");
  process.exit(1);
}

console.log(`\n=== Asaas Integration Test (${ENV}) ===`);
console.log(`Base URL: ${BASE_URL}\n`);

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      access_token: API_KEY!,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    console.error(`API error (${res.status}):`, JSON.stringify(body, null, 2));
    throw new Error(`HTTP ${res.status}`);
  }

  return body;
}

async function main() {
  // Step 1: Create test customer
  console.log("1. Creating test customer...");
  const customer = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: "Paciente Teste Orbita",
      cpfCnpj: "24971563792", // CPF valido para sandbox
      phone: "5521999990000",
      externalReference: "test-patient-001",
    }),
  });
  console.log(`   Customer created: ${customer.id}`);
  console.log(`   Name: ${customer.name}\n`);

  // Step 2: Create PIX charge
  console.log("2. Creating PIX charge (R$ 150.00)...");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = tomorrow.toISOString().split("T")[0];

  const charge = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      billingType: "PIX",
      value: 150.0,
      dueDate,
      description: "Consulta medica - Teste Orbita",
      externalReference: "test-invoice-001",
    }),
  });
  console.log(`   Charge created: ${charge.id}`);
  console.log(`   Status: ${charge.status}`);
  console.log(`   Invoice URL: ${charge.invoiceUrl}\n`);

  // Step 3: Get PIX QR Code
  console.log("3. Fetching PIX QR code...");
  try {
    const pix = await asaasFetch(`/payments/${charge.id}/pixQrCode`);
    console.log(`   Payload (copia e cola): ${pix.payload?.substring(0, 60)}...`);
    console.log(`   Expiration: ${pix.expirationDate}\n`);
  } catch {
    console.log("   PIX QR code not yet available (may take a few seconds)\n");
  }

  // Step 4: Check charge status
  console.log("4. Checking charge status...");
  const status = await asaasFetch(`/payments/${charge.id}`);
  console.log(`   Status: ${status.status}`);
  console.log(`   Value: R$ ${status.value}`);
  console.log(`   Due date: ${status.dueDate}\n`);

  // Step 5: Create BOLETO charge
  console.log("5. Creating BOLETO charge (R$ 75.50)...");
  const boleto = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      billingType: "BOLETO",
      value: 75.5,
      dueDate,
      description: "Exame laboratorial - Teste Orbita",
      externalReference: "test-invoice-002",
    }),
  });
  console.log(`   Charge created: ${boleto.id}`);
  console.log(`   Status: ${boleto.status}`);
  console.log(`   Invoice URL: ${boleto.invoiceUrl}`);
  console.log(`   Bank Slip URL: ${boleto.bankSlipUrl}\n`);

  // Step 6: Get boleto identification field
  console.log("6. Fetching boleto identification field...");
  try {
    const boletoInfo = await asaasFetch(
      `/payments/${boleto.id}/identificationField`
    );
    console.log(`   Linha digitavel: ${boletoInfo.identificationField}`);
    console.log(`   Nosso numero: ${boletoInfo.nossoNumero}\n`);
  } catch {
    console.log("   Boleto info not yet available\n");
  }

  console.log("=== Test complete ===\n");
  console.log("Summary:");
  console.log(`  Customer ID: ${customer.id}`);
  console.log(`  PIX charge ID: ${charge.id}`);
  console.log(`  Boleto charge ID: ${boleto.id}`);
  console.log(`  Invoice URL (PIX): ${charge.invoiceUrl}`);
  console.log(`  Invoice URL (Boleto): ${boleto.invoiceUrl}`);
}

main().catch((err) => {
  console.error("\nTest failed:", err.message);
  process.exit(1);
});
