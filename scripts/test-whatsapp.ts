/**
 * scripts/test-whatsapp.ts
 *
 * WhatsApp E2E integration test.
 * Simulates signed webhook payloads, sends them to the running server,
 * and polls the DB for agent responses — printing a clean conversation log.
 *
 * Setup:
 *   1. Run the app:  npm run dev
 *   2. Add to .env:  TEST_CLINIC_PHONE=<digits-only phone matching clinics.phone>
 *   3. The clinic must have is_active = true in the DB
 *
 * Usage:
 *   npx tsx scripts/test-whatsapp.ts --scenario scheduling
 *   npx tsx scripts/test-whatsapp.ts --all
 *   npx tsx scripts/test-whatsapp.ts "Oi, quero marcar uma consulta"
 *   BASE_URL=https://your-app.vercel.app npx tsx scripts/test-whatsapp.ts --scenario billing
 *
 * Scenarios: support | scheduling | billing | reschedule | cancellation | escalation
 *
 * Optional env:
 *   TEST_PATIENT_PHONE  — fake patient phone (auto-created, default: 5511900099001)
 *   BASE_URL            — server base URL (default: http://localhost:3000)
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createHmac, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

// ── Load .env / .env.local ────────────────────────────────────────────────────
function loadEnv(path: string) {
  try {
    for (const line of readFileSync(resolve(path), "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim()
        .replace(/\s+#.*$/, "")      // strip inline comments (e.g. KEY=value # comment)
        .replace(/^["']|["']$/g, ""); // strip surrounding quotes
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(".env");
loadEnv(".env.local");

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";
const CLINIC_PHONE = process.env.TEST_CLINIC_PHONE ?? "";        // digits-only
const PATIENT_PHONE = process.env.TEST_PATIENT_PHONE ?? "5511900099001"; // fake test number

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

// ── Utilities ─────────────────────────────────────────────────────────────────
const sign = (body: string) =>
  "sha256=" + createHmac("sha256", META_APP_SECRET).update(body).digest("hex");

const wamid = () => "wamid.test." + randomBytes(12).toString("hex");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildPayload(text: string, msgId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_TEST",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: CLINIC_PHONE,
                phone_number_id: "PHONE_ID_TEST",
              },
              contacts: [{ profile: { name: "Paciente Teste" }, wa_id: PATIENT_PHONE }],
              messages: [
                {
                  from: PATIENT_PHONE,
                  id: msgId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// ── DB polling ────────────────────────────────────────────────────────────────
async function getPatientId(): Promise<string | null> {
  const phone = PATIENT_PHONE.replace(/\D/g, "");
  // Include variant without 9th digit for compatibility
  const variants = [phone];
  if (/^55\d{2}9\d{8}$/.test(phone)) {
    variants.push(phone.slice(0, 4) + phone.slice(5));
  }
  const { data } = await supabase
    .from("patients")
    .select("id")
    .in("phone", variants)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function pollResponse(sentAt: string, timeoutMs = 60_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let patientId: string | null = null;

  while (Date.now() < deadline) {
    patientId = await getPatientId();
    if (patientId) break;
    await sleep(1000);
  }
  if (!patientId) return "⏱ timeout: patient not found in DB";

  while (Date.now() < deadline) {
    await sleep(1500);

    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("patient_id", patientId)
      .in("status", ["active", "escalated", "resolved"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) continue;

    const { data: msgs } = await supabase
      .from("messages")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("role", "assistant")
      .gte("created_at", sentAt)
      .order("created_at", { ascending: false })
      .limit(1);

    if (msgs?.length) return msgs[0].content as string;
  }
  return "⏱ timeout: agent did not respond within 60s";
}

// ── Core: send + wait ─────────────────────────────────────────────────────────
async function say(text: string): Promise<string> {
  const msgId = wamid();
  const payload = buildPayload(text, msgId);
  const body = JSON.stringify(payload);
  const sentAt = new Date().toISOString();

  process.stdout.write(`\n  💬 Paciente: "${text}"\n`);

  const res = await fetch(`${BASE_URL}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": sign(body),
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Webhook ${res.status}: ${await res.text()}`);
  }

  const response = await pollResponse(sentAt);
  const preview = response.length > 400 ? response.slice(0, 400) + "…" : response;
  process.stdout.write(`  🤖 Agente:  "${preview}"\n`);
  return response;
}

// Close active conversation between scenarios so each starts fresh
async function resetConversation(): Promise<void> {
  const patientId = await getPatientId();
  if (!patientId) return;
  await supabase
    .from("conversations")
    .update({ status: "resolved" })
    .eq("patient_id", patientId)
    .eq("status", "active");
  await sleep(500);
}

// ── Scenarios ─────────────────────────────────────────────────────────────────
function banner(title: string, emoji: string) {
  console.log(`\n${emoji} Cenário: ${title}`);
  console.log("─".repeat(50));
}

async function scenarioSupport() {
  banner("Suporte Geral", "🔵");
  await say("Oi, qual o endereço da clínica?");
  await say("Vocês aceitam plano de saúde Unimed?");
  await say("Qual o horário de funcionamento?");
}

async function scenarioScheduling() {
  banner("Agendamento Completo", "🟢");
  await say("Oi, queria marcar uma consulta");
  await say("Pode ser qualquer dia da semana, de preferência manhã");
  await say("Pode marcar no primeiro horário disponível por favor");
}

async function scenarioBilling() {
  banner("Cobrança e Pagamento", "🟡");
  await say("Olá, recebi uma mensagem sobre uma fatura em aberto");
  await say("Pode me mandar o link de pagamento?");
  await say("Acabei de pagar, pode verificar o status?");
}

async function scenarioReschedule() {
  banner("Remarcação de Consulta", "🟠");
  await say("Preciso remarcar minha consulta");
  await say("Pode ser na próxima quarta-feira de manhã?");
  await say("Confirma o primeiro horário disponível");
}

async function scenarioCancellation() {
  banner("Cancelamento de Consulta", "🔴");
  await say("Preciso cancelar minha consulta");
  await say("Sim, confirmo o cancelamento");
}

async function scenarioEscalation() {
  banner("Escalada para Humano", "⚫");
  await say("Quero falar com um atendente urgente");
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  support: scenarioSupport,
  scheduling: scenarioScheduling,
  billing: scenarioBilling,
  reschedule: scenarioReschedule,
  cancellation: scenarioCancellation,
  escalation: scenarioEscalation,
};

// ── Preflight checks ─────────────────────────────────────────────────────────
async function preflight(): Promise<boolean> {
  let ok = true;

  // 1. Server reachable?
  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=ping&hub.challenge=test`, {
      signal: AbortSignal.timeout(5000),
    });
    // 200 or 403 both mean the server is up
    if (res.status >= 500) {
      console.error(`❌ Servidor retornou ${res.status}. Verifique se o app está rodando em ${BASE_URL}`);
      ok = false;
    } else {
      console.log(`   ✓ Servidor OK (${BASE_URL})`);
    }
  } catch {
    console.error(`❌ Servidor não responde em ${BASE_URL}`);
    console.error(`   Execute: npm run dev`);
    ok = false;
  }

  // 2. Clinic exists and is_active?
  const { data: clinic, error } = await supabase
    .from("clinics")
    .select("id, name, is_active")
    .eq("phone", CLINIC_PHONE.replace(/\D/g, ""))
    .maybeSingle();

  if (error || !clinic) {
    console.error(`❌ Clínica com phone="${CLINIC_PHONE}" não encontrada no DB`);
    console.error(`   Verifique TEST_CLINIC_PHONE no .env`);
    ok = false;
  } else if (!clinic.is_active) {
    console.error(`❌ Clínica "${clinic.name}" encontrada mas is_active = false`);
    console.error(`   Ative em: Dashboard → Integrações → Ativar clínica`);
    console.error(`   Ou via SQL: UPDATE clinics SET is_active = true WHERE id = '${clinic.id}';`);
    ok = false;
  } else {
    console.log(`   ✓ Clínica "${clinic.name}" ativa`);
  }

  return ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const missing: string[] = [];
  if (!META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!CLINIC_PHONE) missing.push("TEST_CLINIC_PHONE");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.error("❌ Env vars ausentes:", missing.join(", "));
    console.error("   Adicione no .env ou .env.local");
    process.exit(1);
  }

  console.log("\n📱 WhatsApp E2E Test");
  console.log(`   Server:  ${BASE_URL}`);
  console.log(`   Clinic:  ${CLINIC_PHONE}`);
  console.log(`   Patient: ${PATIENT_PHONE} (criado automaticamente se não existir)`);

  const ready = await preflight();
  if (!ready) process.exit(1);

  const args = process.argv.slice(2);
  const scenarioIdx = args.indexOf("--scenario");
  const runAll = args.includes("--all");

  if (runAll) {
    for (const [name, fn] of Object.entries(SCENARIOS)) {
      try {
        await fn();
      } catch (err) {
        console.error(`\n❌ Cenário "${name}" falhou:`, err);
      }
      await resetConversation();
      await sleep(2000);
    }
    return;
  }

  if (scenarioIdx !== -1) {
    const name = args[scenarioIdx + 1];
    const fn = SCENARIOS[name];
    if (!fn) {
      console.error(`❌ Cenário desconhecido: "${name}"`);
      console.error(`   Disponíveis: ${Object.keys(SCENARIOS).join(", ")}`);
      process.exit(1);
    }
    await fn();
    return;
  }

  // Single message mode
  const text = args.filter((a) => !a.startsWith("--")).join(" ");
  if (text) {
    await say(text);
    return;
  }

  console.log("\nUso:");
  console.log("  npx tsx scripts/test-whatsapp.ts --scenario scheduling");
  console.log("  npx tsx scripts/test-whatsapp.ts --all");
  console.log(`  npx tsx scripts/test-whatsapp.ts "Oi, quero marcar uma consulta"`);
  console.log(`\nCenários: ${Object.keys(SCENARIOS).join(" | ")}`);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
