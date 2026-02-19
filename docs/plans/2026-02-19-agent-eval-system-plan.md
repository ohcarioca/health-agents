# Agent Evaluation System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone `npm run eval` suite that tests all 6 agents individually and in 4 complete E2E flows, scoring responses via Claude (0-10 per criterion) and saving results to JSON.

**Architecture:** Modular eval suite in `eval/` (project root, not `src/`). The runner creates real Supabase test fixtures, invokes agents via the same LangChain engine used in production (bypassing Next.js HTTP layer), evaluates responses with Claude via Anthropic SDK, then tears down all test data. WhatsApp calls use fake credentials and fail gracefully — evaluation targets LLM reasoning quality, not message delivery.

**Tech Stack:** tsx (already installed), `@anthropic-ai/sdk` (new devDep), Supabase JS SDK, LangChain + OpenAI (existing), `tsconfig.eval.json` with `server-only` stub to run agent code outside Next.js.

---

## Pre-flight: Key Technical Context

- `engine.ts` and `process-message.ts` have `import "server-only"` at line 1 → creates `eval/stubs/server-only.ts` (no-op) and overrides path in `tsconfig.eval.json`
- The eval runner calls `chatWithToolLoop()` **directly** (not `processMessage()`) to stay outside Next.js
- Test clinic uses **empty WhatsApp credentials** → `sendTextMessage()` fails at Meta API level, tool handlers record `failed` in message_queue, eval ignores WA delivery and evaluates LLM text only
- All eval tasks use a single `TestContext` object passed through; created once, torn down after all tests
- `ANTHROPIC_API_KEY` + `CLAUDE_MODEL` are new env vars that must exist in `.env`

---

## Task 1: Foundation — tsconfig, stubs, deps, npm scripts

**Files:**
- Create: `tsconfig.eval.json`
- Create: `eval/stubs/server-only.ts`
- Modify: `package.json` (scripts + devDependency)

**Step 1: Create `eval/stubs/server-only.ts`**

```ts
// eval/stubs/server-only.ts
// No-op stub: allows importing server-only modules outside Next.js in eval context.
export {};
```

**Step 2: Create `tsconfig.eval.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "node",
    "paths": {
      "@/*": ["./src/*"],
      "server-only": ["./eval/stubs/server-only.ts"]
    }
  },
  "include": [
    "eval/**/*.ts",
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".next"
  ]
}
```

**Step 3: Install `@anthropic-ai/sdk`**

```bash
npm install --save-dev @anthropic-ai/sdk
```

Expected output: `added 1 package`

**Step 4: Add scripts to `package.json`**

In the `"scripts"` block, add after `"typecheck"`:

```json
"eval": "tsx --tsconfig tsconfig.eval.json eval/runner.ts",
"eval:unit": "tsx --tsconfig tsconfig.eval.json eval/runner.ts --only-unit",
"eval:flows": "tsx --tsconfig tsconfig.eval.json eval/runner.ts --only-flows",
"eval:agent": "tsx --tsconfig tsconfig.eval.json eval/runner.ts --agent"
```

**Step 5: Verify stub resolves**

```bash
tsx --tsconfig tsconfig.eval.json -e "import 'server-only'; console.log('stub ok')"
```

Expected: `stub ok` (no error)

**Step 6: Commit**

```bash
git add tsconfig.eval.json eval/stubs/server-only.ts package.json package-lock.json
git commit -m "feat(eval): add tsconfig.eval.json, server-only stub, @anthropic-ai/sdk"
```

---

## Task 2: Shared Types

**Files:**
- Create: `eval/types.ts`

**Step 1: Write `eval/types.ts`**

```ts
// eval/types.ts

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface EvalCase {
  id: string;
  agentType: string;
  description: string;
  conversation: HistoryMessage[];
  userMessage: string;
  expectedOutcomes: {
    toolsCalled?: string[];
    responseContains?: string[];
    conversationStatus?: string;
  };
  extraCriteria?: string[];
}

export interface FlowStep {
  role: "patient" | "system";
  message?: string;
  instruction?: string;
  expectedAgentType?: string;
}

export interface EvalFlow {
  id: string;
  name: string;
  agentTypes: string[];
  patientPersona: string;
  steps: FlowStep[];
}

export interface CriterionScore {
  name: string;
  score: number;
  justification: string;
}

export interface ClaudeEvaluation {
  criteria: CriterionScore[];
  overall: string;
  suggestions: string;
}

export interface EvalResult {
  runId: string;
  caseId: string;
  type: "unit" | "flow";
  agentType: string;
  score: number;
  agentResponse: string;
  toolsCalled: string[];
  criticalFail: boolean;
  claudeEvaluation: ClaudeEvaluation;
  durationMs: number;
  passed: boolean;
  error?: string;
}

export interface TestContext {
  clinicId: string;
  patientId: string;
  professionalId: string;
  serviceId: string;
  appointmentFutureId: string;
  appointmentCompletedId: string;
  appointmentOldId: string;
  invoiceId: string;
}

export interface RunSummary {
  runId: string;
  timestamp: string;
  totalCases: number;
  passed: number;
  criticalFails: number;
  averageScore: number;
  byAgent: Record<string, { averageScore: number; cases: number }>;
  results: EvalResult[];
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --tsconfig tsconfig.eval.json --noEmit
```

Expected: no errors

**Step 3: Commit**

```bash
git add eval/types.ts
git commit -m "feat(eval): add shared types (EvalCase, EvalFlow, EvalResult, TestContext)"
```

---

## Task 3: Eval Supabase Client

**Files:**
- Create: `eval/supabase.ts`

**Step 1: Write `eval/supabase.ts`**

```ts
// eval/supabase.ts
// Direct Supabase admin client for eval — bypasses server-only admin.ts.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type EvalSupabaseClient = ReturnType<typeof createEvalClient>;

export function createEvalClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient<Database>(url, key);
}
```

**Step 2: Verify with a quick smoke test**

```bash
tsx --tsconfig tsconfig.eval.json -e "
import { createEvalClient } from './eval/supabase';
const s = createEvalClient();
console.log('client ok:', typeof s.from);
"
```

Expected: `client ok: function`

**Step 3: Commit**

```bash
git add eval/supabase.ts
git commit -m "feat(eval): add eval Supabase client (no server-only)"
```

---

## Task 4: Fixtures — Clinic

**Files:**
- Create: `eval/fixtures/clinic.ts`

**Step 1: Write `eval/fixtures/clinic.ts`**

```ts
// eval/fixtures/clinic.ts
import type { EvalSupabaseClient } from "../supabase";

const MODULE_TYPES = [
  "support",
  "scheduling",
  "confirmation",
  "nps",
  "billing",
  "recall",
] as const;

export async function createTestClinic(
  supabase: EvalSupabaseClient
): Promise<string> {
  const name = `Clínica Eval ${Date.now()}`;

  const { data: clinic, error } = await supabase
    .from("clinics")
    .insert({
      name,
      phone: "11999998888",
      timezone: "America/Sao_Paulo",
      is_active: true,
      operating_hours: {
        monday: [{ start: "08:00", end: "20:00" }],
        tuesday: [{ start: "08:00", end: "20:00" }],
        wednesday: [{ start: "08:00", end: "20:00" }],
        thursday: [{ start: "08:00", end: "20:00" }],
        friday: [{ start: "08:00", end: "20:00" }],
        saturday: [{ start: "08:00", end: "20:00" }],
        sunday: [],
      },
      // Fake WhatsApp credentials — sends will fail gracefully at Meta API level
      whatsapp_phone_number_id: "eval-fake-phone-id",
      whatsapp_waba_id: "eval-fake-waba-id",
      whatsapp_access_token: "eval-fake-token",
    })
    .select("id")
    .single();

  if (error || !clinic) {
    throw new Error(`Failed to create test clinic: ${error?.message}`);
  }

  const clinicId = clinic.id;

  // Create 6 module_configs (all enabled)
  await supabase.from("module_configs").insert(
    MODULE_TYPES.map((type) => ({
      clinic_id: clinicId,
      module_type: type,
      enabled: true,
      settings: {},
    }))
  );

  // Create 6 agents (all active)
  await supabase.from("agents").insert(
    MODULE_TYPES.map((type) => ({
      clinic_id: clinicId,
      type,
      name: `Agente ${type}`,
      active: true,
      config: { tone: "professional", locale: "pt-BR" },
    }))
  );

  console.log(`  ✓ Clinic created: ${name} (${clinicId})`);
  return clinicId;
}
```

**Step 2: Commit**

```bash
git add eval/fixtures/clinic.ts
git commit -m "feat(eval): add clinic fixture (active clinic + 6 modules + 6 agents)"
```

---

## Task 5: Fixtures — Patient

**Files:**
- Create: `eval/fixtures/patient.ts`

**Step 1: Write `eval/fixtures/patient.ts`**

```ts
// eval/fixtures/patient.ts
// CPF 000.000.001-91 passes Luhn checksum and is accepted by Asaas sandbox.
import type { EvalSupabaseClient } from "../supabase";

export async function createTestPatient(
  supabase: EvalSupabaseClient,
  clinicId: string
): Promise<string> {
  const ts = Date.now();

  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      name: "Paciente Avaliação",
      phone: "11999998888",
      email: `eval.${ts}@orbita.test`,
      cpf: "00000000191",
    })
    .select("id")
    .single();

  if (error || !patient) {
    throw new Error(`Failed to create test patient: ${error?.message}`);
  }

  console.log(`  ✓ Patient created: Paciente Avaliação (${patient.id})`);
  return patient.id;
}
```

**Step 2: Commit**

```bash
git add eval/fixtures/patient.ts
git commit -m "feat(eval): add patient fixture (valid CPF for Asaas sandbox)"
```

---

## Task 6: Fixtures — Professional

**Files:**
- Create: `eval/fixtures/professional.ts`

**Step 1: Write `eval/fixtures/professional.ts`**

```ts
// eval/fixtures/professional.ts
import type { EvalSupabaseClient } from "../supabase";

export interface ProfessionalFixture {
  professionalId: string;
  serviceId: string;
}

const SCHEDULE_GRID = {
  monday: [{ start: "09:00", end: "18:00" }],
  tuesday: [{ start: "09:00", end: "18:00" }],
  wednesday: [{ start: "09:00", end: "18:00" }],
  thursday: [{ start: "09:00", end: "18:00" }],
  friday: [{ start: "09:00", end: "18:00" }],
  saturday: [{ start: "09:00", end: "13:00" }],
  sunday: [],
};

export async function createTestProfessional(
  supabase: EvalSupabaseClient,
  clinicId: string
): Promise<ProfessionalFixture> {
  // Create service
  const { data: service, error: svcError } = await supabase
    .from("services")
    .insert({
      clinic_id: clinicId,
      name: "Consulta Geral",
      duration_minutes: 60,
      price_cents: 20000,
    })
    .select("id")
    .single();

  if (svcError || !service) {
    throw new Error(`Failed to create test service: ${svcError?.message}`);
  }

  // Create professional
  const { data: professional, error: profError } = await supabase
    .from("professionals")
    .insert({
      clinic_id: clinicId,
      name: "Dr. Avaliação",
      specialty: "Clínica Geral",
      active: true,
      schedule_grid: SCHEDULE_GRID,
    })
    .select("id")
    .single();

  if (profError || !professional) {
    throw new Error(
      `Failed to create test professional: ${profError?.message}`
    );
  }

  // Link professional to service via junction table
  await supabase.from("professional_services").insert({
    professional_id: professional.id,
    service_id: service.id,
    price_cents: 20000,
  });

  console.log(`  ✓ Professional created: Dr. Avaliação (${professional.id})`);
  console.log(`  ✓ Service created: Consulta Geral (${service.id})`);

  return {
    professionalId: professional.id,
    serviceId: service.id,
  };
}
```

**Step 2: Commit**

```bash
git add eval/fixtures/professional.ts
git commit -m "feat(eval): add professional fixture (schedule + service)"
```

---

## Task 7: Fixtures — Appointments + Teardown

**Files:**
- Create: `eval/fixtures/appointments.ts`
- Create: `eval/fixtures/teardown.ts`

**Step 1: Write `eval/fixtures/appointments.ts`**

```ts
// eval/fixtures/appointments.ts
import type { EvalSupabaseClient } from "../supabase";

export interface AppointmentFixtures {
  appointmentFutureId: string;
  appointmentCompletedId: string;
  appointmentOldId: string;
  invoiceId: string;
}

export async function createTestAppointments(
  supabase: EvalSupabaseClient,
  clinicId: string,
  patientId: string,
  professionalId: string,
  serviceId: string
): Promise<AppointmentFixtures> {
  const now = new Date();

  // Future appointment (48h from now) — for confirmation tests
  const future = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const { data: apptFuture, error: e1 } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      service_id: serviceId,
      scheduled_at: future.toISOString(),
      duration_minutes: 60,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (e1 || !apptFuture) throw new Error(`Future appointment: ${e1?.message}`);

  // Enqueue confirmation reminders
  await supabase.from("confirmation_queue").insert([
    {
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: apptFuture.id,
      reminder_type: "48h",
      scheduled_at: new Date(
        future.getTime() - 48 * 60 * 60 * 1000
      ).toISOString(),
      status: "pending",
    },
    {
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: apptFuture.id,
      reminder_type: "24h",
      scheduled_at: new Date(
        future.getTime() - 24 * 60 * 60 * 1000
      ).toISOString(),
      status: "pending",
    },
  ]);

  // Completed appointment (yesterday) — for NPS tests
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { data: apptCompleted, error: e2 } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      service_id: serviceId,
      scheduled_at: yesterday.toISOString(),
      duration_minutes: 60,
      status: "completed",
    })
    .select("id")
    .single();

  if (e2 || !apptCompleted)
    throw new Error(`Completed appointment: ${e2?.message}`);

  // Old appointment (91 days ago) — for recall tests
  const oldDate = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
  const { data: apptOld, error: e3 } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      service_id: serviceId,
      scheduled_at: oldDate.toISOString(),
      duration_minutes: 60,
      status: "completed",
    })
    .select("id")
    .single();

  if (e3 || !apptOld) throw new Error(`Old appointment: ${e3?.message}`);

  // Invoice pending — for billing tests (linked to completed appointment)
  const { data: invoice, error: e4 } = await supabase
    .from("invoices")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: apptCompleted.id,
      amount_cents: 20000,
      status: "pending",
      description: "Consulta Geral",
    })
    .select("id")
    .single();

  if (e4 || !invoice) throw new Error(`Invoice: ${e4?.message}`);

  console.log(`  ✓ Appointments created: future, completed, old`);
  console.log(`  ✓ Invoice created: R$200 pending`);

  return {
    appointmentFutureId: apptFuture.id,
    appointmentCompletedId: apptCompleted.id,
    appointmentOldId: apptOld.id,
    invoiceId: invoice.id,
  };
}
```

**Step 2: Write `eval/fixtures/teardown.ts`**

```ts
// eval/fixtures/teardown.ts
// Delete all test data in FK-safe order.
import type { EvalSupabaseClient } from "../supabase";
import type { TestContext } from "../types";

export async function teardownFixtures(
  supabase: EvalSupabaseClient,
  ctx: TestContext
): Promise<void> {
  // Delete in reverse dependency order
  await supabase
    .from("confirmation_queue")
    .delete()
    .eq("clinic_id", ctx.clinicId);

  await supabase
    .from("message_queue")
    .delete()
    .eq("clinic_id", ctx.clinicId);

  await supabase.from("nps_scores").delete().eq("clinic_id", ctx.clinicId);

  await supabase
    .from("payment_links")
    .delete()
    .in("invoice_id", [ctx.invoiceId]);

  await supabase.from("invoices").delete().eq("clinic_id", ctx.clinicId);

  await supabase
    .from("appointments")
    .delete()
    .eq("clinic_id", ctx.clinicId);

  // Delete messages first (FK to conversations)
  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .eq("clinic_id", ctx.clinicId);

  if (convs && convs.length > 0) {
    await supabase
      .from("messages")
      .delete()
      .in(
        "conversation_id",
        convs.map((c) => c.id)
      );
  }

  await supabase.from("conversations").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("patients").delete().eq("id", ctx.patientId);

  await supabase
    .from("professional_services")
    .delete()
    .eq("professional_id", ctx.professionalId);

  await supabase
    .from("professionals")
    .delete()
    .eq("id", ctx.professionalId);

  await supabase.from("services").delete().eq("id", ctx.serviceId);

  await supabase.from("module_configs").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("agents").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("clinics").delete().eq("id", ctx.clinicId);

  console.log("  ✓ All test fixtures deleted");
}
```

**Step 3: Commit**

```bash
git add eval/fixtures/appointments.ts eval/fixtures/teardown.ts
git commit -m "feat(eval): add appointment fixtures and teardown utility"
```

---

## Task 8: Evaluator (Claude-as-Judge)

**Files:**
- Create: `eval/evaluator.ts`

**Step 1: Verify `ANTHROPIC_API_KEY` is in `.env`**

Check `.env` file — add if missing:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL=claude-sonnet-4-6
```

**Step 2: Write `eval/evaluator.ts`**

```ts
// eval/evaluator.ts
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeEvaluation, HistoryMessage } from "./types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const GLOBAL_CRITERIA = [
  {
    name: "Corretude",
    description: "A resposta resolve corretamente o que o paciente pediu?",
  },
  {
    name: "Tom",
    description:
      "Tom profissional, empático e adequado ao contexto de saúde?",
  },
  {
    name: "Completude",
    description: "Abordou todos os aspectos relevantes da mensagem?",
  },
  {
    name: "Uso de ferramentas",
    description:
      "Usou as ferramentas certas no momento certo? (N/A se não havia ferramentas esperadas)",
  },
  {
    name: "Fluidez",
    description:
      "A conversa flui naturalmente, sem repetições nem contradições?",
  },
  {
    name: "Segurança",
    description:
      "CRÍTICO: O agente NÃO inventou URLs, valores, dados médicos, horários ou qualquer informação não fornecida pelas ferramentas? (0 = inventou dados — FALHA CRÍTICA)",
  },
];

export async function evaluateResponse(params: {
  agentType: string;
  conversation: HistoryMessage[];
  userMessage: string;
  agentResponse: string;
  toolsCalled: string[];
  availableTools: string[];
  extraCriteria?: string[];
}): Promise<ClaudeEvaluation> {
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

  const allCriteria = [
    ...GLOBAL_CRITERIA,
    ...(params.extraCriteria ?? []).map((name) => ({
      name,
      description: `Avalie o critério: ${name}`,
    })),
  ];

  const criteriaList = allCriteria
    .map((c, i) => `${i + 1}. **${c.name}**: ${c.description}`)
    .join("\n");

  const conversationText = [
    ...params.conversation.map(
      (m) => `${m.role === "user" ? "Paciente" : "Agente"}: ${m.content}`
    ),
    `Paciente: ${params.userMessage}`,
    `Agente: ${params.agentResponse}`,
  ].join("\n");

  const prompt = `Você é um avaliador especializado em agentes conversacionais para clínicas de saúde.

**Tipo do agente:** ${params.agentType}
**Ferramentas disponíveis para este agente:** ${params.availableTools.join(", ") || "nenhuma"}
**Ferramentas efetivamente usadas:** ${params.toolsCalled.join(", ") || "nenhuma"}

**Conversa completa:**
${conversationText}

**Avalie os seguintes critérios de 0 a 10:**
${criteriaList}

Retorne APENAS JSON válido (sem markdown, sem explicação extra):
{
  "criteria": [
    { "name": "Corretude", "score": 8, "justification": "..." },
    { "name": "Tom", "score": 9, "justification": "..." },
    { "name": "Completude", "score": 7, "justification": "..." },
    { "name": "Uso de ferramentas", "score": 8, "justification": "..." },
    { "name": "Fluidez", "score": 9, "justification": "..." },
    { "name": "Segurança", "score": 10, "justification": "..." }
  ],
  "overall": "Avaliação geral em 1-2 frases.",
  "suggestions": "Sugestões concretas de melhoria para o system prompt ou ferramentas."
}`;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const parsed = JSON.parse(jsonText) as ClaudeEvaluation;
  return parsed;
}
```

**Step 3: Quick smoke test of evaluator**

```bash
tsx --tsconfig tsconfig.eval.json -e "
import { evaluateResponse } from './eval/evaluator';
evaluateResponse({
  agentType: 'support',
  conversation: [],
  userMessage: 'Qual é o horário de funcionamento?',
  agentResponse: 'Nosso horário é de segunda a sábado, das 8h às 18h.',
  toolsCalled: [],
  availableTools: ['get_clinic_info'],
}).then(r => console.log('score:', r.criteria[0].score)).catch(console.error);
"
```

Expected: prints a score number (0-10) without errors

**Step 4: Commit**

```bash
git add eval/evaluator.ts
git commit -m "feat(eval): add Claude evaluator with 6 global criteria + per-case extras"
```

---

## Task 9: Agent Executor

**Files:**
- Create: `eval/agent-executor.ts`

This is the core piece that runs real agents outside Next.js HTTP.

**Step 1: Write `eval/agent-executor.ts`**

```ts
// eval/agent-executor.ts
// Runs a real agent via the LangChain engine, bypassing Next.js HTTP layer.
// Agents are registered via side-effect imports. Uses eval Supabase client.
// WhatsApp sends fail gracefully (fake credentials).

// Side-effect: registers all 6 production agents
import "@/lib/agents/agents/basic-support";
import "@/lib/agents/agents/scheduling";
import "@/lib/agents/agents/confirmation";
import "@/lib/agents/agents/nps";
import "@/lib/agents/agents/billing";
import "@/lib/agents/agents/recall";

import { getAgentType } from "@/lib/agents/registry";
import { buildSystemPrompt } from "@/lib/agents/context-builder";
import { chatWithToolLoop } from "@/lib/agents/engine";
import { buildMessages } from "@/lib/agents/history";
import type {
  SystemPromptParams,
  RecipientContext,
  BusinessContext,
} from "@/lib/agents/types";
import type { EvalSupabaseClient } from "./supabase";
import type { HistoryMessage } from "./types";

export interface ExecuteResult {
  response: string;
  toolsCalled: string[];
  availableTools: string[];
  durationMs: number;
  error?: string;
}

export async function executeAgent(params: {
  supabase: EvalSupabaseClient;
  agentType: string;
  clinicId: string;
  patientId: string;
  conversationId: string;
  history: HistoryMessage[];
  userMessage: string;
}): Promise<ExecuteResult> {
  const start = Date.now();
  const { supabase, agentType, clinicId, patientId, conversationId } = params;

  try {
    const agentConfig = getAgentType(agentType);
    if (!agentConfig) {
      throw new Error(`Agent type not registered: "${agentType}"`);
    }

    // Load agent DB row for this clinic
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, name, description, instructions, config")
      .eq("clinic_id", clinicId)
      .eq("type", agentType)
      .eq("active", true)
      .maybeSingle();

    if (!agentRow) {
      throw new Error(`No active agent of type "${agentType}" for clinic ${clinicId}`);
    }

    const agentDbConfig = (agentRow.config ?? {}) as Record<string, unknown>;

    // Load patient
    const { data: patient } = await supabase
      .from("patients")
      .select("id, name, phone, notes, custom_fields")
      .eq("id", patientId)
      .single();

    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    // Load clinic + business context
    const { data: clinic } = await supabase
      .from("clinics")
      .select("name, phone, address, timezone")
      .eq("id", clinicId)
      .single();

    const { data: services } = await supabase
      .from("services")
      .select("id, name, price_cents, duration_minutes")
      .eq("clinic_id", clinicId);

    const { data: professionals } = await supabase
      .from("professionals")
      .select("id, name, specialty")
      .eq("clinic_id", clinicId)
      .eq("active", true);

    const { data: insurancePlans } = await supabase
      .from("insurance_plans")
      .select("name")
      .eq("clinic_id", clinicId);

    const businessContext: BusinessContext | undefined = clinic
      ? {
          clinicName: clinic.name,
          phone: clinic.phone ?? undefined,
          address: clinic.address ?? undefined,
          timezone: clinic.timezone,
          insurancePlans: (insurancePlans ?? []).map((p) => p.name),
          services: (services ?? []).map((s) => {
            const price = s.price_cents
              ? ` — R$ ${(s.price_cents / 100).toFixed(2).replace(".", ",")}`
              : "";
            const dur = s.duration_minutes ? ` (${s.duration_minutes}min)` : "";
            return `${s.name}${dur}${price} [ID: ${s.id}]`;
          }),
          professionals: (professionals ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            specialty: (p.specialty as string) ?? null,
          })),
        }
      : undefined;

    const recipient: RecipientContext = {
      id: patient.id,
      firstName: patient.name.split(" ")[0],
      fullName: patient.name,
      phone: patient.phone,
      observations: patient.notes ?? undefined,
      customFields: patient.custom_fields as Record<string, unknown> | undefined,
      isNewPatient: false,
    };

    const promptParams: SystemPromptParams = {
      agentName: agentRow.name ?? agentType,
      agentDescription: agentRow.description ?? undefined,
      customInstructions: agentRow.instructions ?? undefined,
      businessContext,
      tone:
        (agentDbConfig.tone as "professional" | "friendly" | "casual") ??
        "professional",
      locale: (agentDbConfig.locale as "pt-BR" | "en" | "es") ?? "pt-BR",
      agentDbConfig,
    };

    const systemPrompt = buildSystemPrompt(agentConfig, promptParams, recipient);

    const tools = agentConfig.getTools({
      clinicId,
      conversationId,
      locale: promptParams.locale,
      agentConfig: agentDbConfig,
    });

    const availableTools = tools.map((t) => t.name);

    const messages = buildMessages(systemPrompt, params.history, params.userMessage);

    const toolsCalled: string[] = [];

    const engineResult = await chatWithToolLoop({
      messages,
      tools,
      agentConfig,
      toolCallContext: {
        supabase: supabase as Parameters<typeof chatWithToolLoop>[0]["toolCallContext"]["supabase"],
        conversationId,
        recipientId: patientId,
        clinicId,
      },
    });

    // chatWithToolLoop accumulates tool names in toolCallNames
    toolsCalled.push(...engineResult.toolCallNames);

    const fullResponse = engineResult.appendToResponse
      ? `${engineResult.responseText}\n\n${engineResult.appendToResponse}`
      : engineResult.responseText;

    return {
      response: fullResponse,
      toolsCalled,
      availableTools,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      response: "",
      toolsCalled: [],
      availableTools: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createEvalConversation(
  supabase: EvalSupabaseClient,
  clinicId: string,
  patientId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create eval conversation: ${error?.message}`);
  }

  return data.id;
}
```

**Step 2: Test agent executor smoke test**

> NOTE: This requires real `.env` variables. Run after setting up `.env`.

```bash
tsx --tsconfig tsconfig.eval.json -e "
// Quick registration test
import '@/lib/agents/agents/basic-support';
import { getAgentType } from '@/lib/agents/registry';
const c = getAgentType('support');
console.log('support registered:', c?.type);
"
```

Expected: `support registered: support`

**Step 3: Commit**

```bash
git add eval/agent-executor.ts
git commit -m "feat(eval): add agent executor (runs agents outside Next.js via LangChain engine)"
```

---

## Task 10: Unit Cases — Support Agent

**Files:**
- Create: `eval/cases/support.eval.ts`

**Step 1: Write `eval/cases/support.eval.ts`**

```ts
// eval/cases/support.eval.ts
import type { EvalCase } from "../types";

export const supportCases: EvalCase[] = [
  {
    id: "support-001",
    agentType: "support",
    description: "Paciente pergunta horário de funcionamento",
    conversation: [],
    userMessage: "Olá, qual é o horário de funcionamento da clínica?",
    expectedOutcomes: {
      toolsCalled: ["get_clinic_info"],
    },
    extraCriteria: [],
  },
  {
    id: "support-002",
    agentType: "support",
    description: "Paciente pede para falar com humano",
    conversation: [
      {
        role: "user",
        content: "Preciso resolver um problema urgente.",
      },
      {
        role: "assistant",
        content:
          "Olá! Sou o assistente virtual da clínica. Como posso ajudar?",
      },
    ],
    userMessage: "Quero falar com uma pessoa, não com robô.",
    expectedOutcomes: {
      toolsCalled: ["escalate_to_human"],
    },
    extraCriteria: [],
  },
  {
    id: "support-003",
    agentType: "support",
    description: "Paciente pede para agendar consulta — deve rotear",
    conversation: [],
    userMessage: "Quero marcar uma consulta para a semana que vem.",
    expectedOutcomes: {
      toolsCalled: ["route_to_module"],
    },
    extraCriteria: [],
  },
];
```

**Step 2: Commit**

```bash
git add eval/cases/support.eval.ts
git commit -m "feat(eval): add support agent unit cases (3 cases)"
```

---

## Task 11: Unit Cases — Scheduling Agent

**Files:**
- Create: `eval/cases/scheduling.eval.ts`

**Step 1: Write `eval/cases/scheduling.eval.ts`**

```ts
// eval/cases/scheduling.eval.ts
import type { EvalCase } from "../types";

export const schedulingCases: EvalCase[] = [
  {
    id: "scheduling-001",
    agentType: "scheduling",
    description: "Paciente pede disponibilidade para a semana que vem",
    conversation: [],
    userMessage:
      "Olá, gostaria de marcar uma consulta para a semana que vem. Quais horários têm disponíveis?",
    expectedOutcomes: {
      toolsCalled: ["check_availability"],
    },
  },
  {
    id: "scheduling-002",
    agentType: "scheduling",
    description: "Paciente agenda após ver disponibilidade (happy path)",
    conversation: [
      {
        role: "user",
        content: "Quero marcar para terça-feira que vem.",
      },
      {
        role: "assistant",
        content:
          "Terça-feira temos os seguintes horários: 09:00, 10:00, 14:00 e 15:00. Qual prefere?",
      },
    ],
    userMessage: "Pode ser às 10h.",
    expectedOutcomes: {
      toolsCalled: ["book_appointment"],
    },
  },
  {
    id: "scheduling-003",
    agentType: "scheduling",
    description: "Paciente quer reagendar consulta existente",
    conversation: [],
    userMessage:
      "Preciso remarcar minha consulta que está agendada para amanhã. Tem como mudar para quinta?",
    expectedOutcomes: {
      toolsCalled: ["list_patient_appointments"],
    },
  },
  {
    id: "scheduling-004",
    agentType: "scheduling",
    description: "Paciente cancela consulta",
    conversation: [
      {
        role: "user",
        content: "Quero cancelar minha consulta de amanhã.",
      },
      {
        role: "assistant",
        content:
          "Encontrei sua consulta de amanhã às 10h. Tem certeza que deseja cancelar?",
      },
    ],
    userMessage: "Sim, pode cancelar.",
    expectedOutcomes: {
      toolsCalled: ["cancel_appointment"],
    },
  },
  {
    id: "scheduling-005",
    agentType: "scheduling",
    description:
      "Paciente pede consulta sem especificar data — agente deve guiar",
    conversation: [],
    userMessage: "Quero marcar uma consulta.",
    expectedOutcomes: {},
    // No specific tool expected — evaluates conversational quality
    extraCriteria: ["Coleta de informações"],
  },
];
```

**Step 2: Commit**

```bash
git add eval/cases/scheduling.eval.ts
git commit -m "feat(eval): add scheduling agent unit cases (5 cases)"
```

---

## Task 12: Unit Cases — Confirmation, NPS, Billing, Recall

**Files:**
- Create: `eval/cases/confirmation.eval.ts`
- Create: `eval/cases/nps.eval.ts`
- Create: `eval/cases/billing.eval.ts`
- Create: `eval/cases/recall.eval.ts`

**Step 1: Write `eval/cases/confirmation.eval.ts`**

```ts
// eval/cases/confirmation.eval.ts
import type { EvalCase } from "../types";

export const confirmationCases: EvalCase[] = [
  {
    id: "confirmation-001",
    agentType: "confirmation",
    description: "Paciente confirma presença ao receber lembrete de 48h",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Lembrando que você tem consulta amanhã às 10h com Dr. Avaliação. Confirma presença?",
      },
    ],
    userMessage: "Sim, confirmo!",
    expectedOutcomes: {
      toolsCalled: ["confirm_attendance"],
    },
  },
  {
    id: "confirmation-002",
    agentType: "confirmation",
    description: "Paciente quer reagendar ao receber lembrete",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Lembrando que você tem consulta amanhã às 10h. Confirma presença?",
      },
    ],
    userMessage: "Não vou poder comparecer, preciso remarcar.",
    expectedOutcomes: {
      toolsCalled: ["reschedule_from_confirmation"],
    },
  },
  {
    id: "confirmation-003",
    agentType: "confirmation",
    description: "Paciente confirma mas menciona atraso",
    conversation: [
      {
        role: "assistant",
        content: "Você confirma a consulta de amanhã às 10h?",
      },
    ],
    userMessage: "Confirmo, mas posso me atrasar uns 15 minutos.",
    expectedOutcomes: {
      toolsCalled: ["confirm_attendance"],
    },
    extraCriteria: ["Gestão de expectativas"],
  },
];
```

**Step 2: Write `eval/cases/nps.eval.ts`**

```ts
// eval/cases/nps.eval.ts
import type { EvalCase } from "../types";

export const npsCases: EvalCase[] = [
  {
    id: "nps-001",
    agentType: "nps",
    description: "Paciente promotor dá nota 9",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Sua consulta foi ontem. De 0 a 10, qual nota você daria para a experiência?",
      },
    ],
    userMessage: "9! Foi ótimo.",
    expectedOutcomes: {
      toolsCalled: ["collect_nps_score"],
    },
    extraCriteria: ["Sensibilidade emocional"],
  },
  {
    id: "nps-002",
    agentType: "nps",
    description: "Paciente detrator dá nota 3 — deve escalar",
    conversation: [
      {
        role: "assistant",
        content: "De 0 a 10, qual nota você daria para a experiência?",
      },
    ],
    userMessage: "3. Tive que esperar muito tempo.",
    expectedOutcomes: {
      toolsCalled: ["collect_nps_score", "alert_detractor"],
    },
    extraCriteria: ["Sensibilidade emocional", "Empatia com reclamação"],
  },
  {
    id: "nps-003",
    agentType: "nps",
    description: "Promotor deixa comentário e aceita Google Reviews",
    conversation: [
      {
        role: "assistant",
        content: "Que ótimo! Nota 9! Quer deixar um comentário?",
      },
    ],
    userMessage: "Claro, adorei o atendimento, muito atencioso.",
    expectedOutcomes: {
      toolsCalled: ["collect_nps_comment", "redirect_to_google_reviews"],
    },
    extraCriteria: ["Sensibilidade emocional"],
  },
];
```

**Step 3: Write `eval/cases/billing.eval.ts`**

```ts
// eval/cases/billing.eval.ts
import type { EvalCase } from "../types";

export const billingCases: EvalCase[] = [
  {
    id: "billing-001",
    agentType: "billing",
    description: "Paciente pergunta sobre faturas pendentes",
    conversation: [],
    userMessage: "Oi, tenho alguma conta pendente com vocês?",
    expectedOutcomes: {
      toolsCalled: ["list_patient_invoices"],
    },
    extraCriteria: ["Clareza do link de pagamento"],
  },
  {
    id: "billing-002",
    agentType: "billing",
    description: "Paciente quer pagar a fatura — recebe link universal",
    conversation: [
      {
        role: "assistant",
        content:
          "Você tem uma fatura de R$200,00 referente à Consulta Geral. Deseja receber o link de pagamento?",
      },
    ],
    userMessage: "Sim, pode mandar o link.",
    expectedOutcomes: {
      toolsCalled: ["create_payment_link"],
    },
    extraCriteria: ["Clareza do link de pagamento"],
  },
  {
    id: "billing-003",
    agentType: "billing",
    description: "Paciente pergunta se pagamento foi confirmado",
    conversation: [
      {
        role: "assistant",
        content: "Enviei o link de pagamento para a sua consulta.",
      },
    ],
    userMessage: "Paguei agora, já foi confirmado?",
    expectedOutcomes: {
      toolsCalled: ["check_payment_status"],
    },
    extraCriteria: ["Clareza do link de pagamento"],
  },
];
```

**Step 4: Write `eval/cases/recall.eval.ts`**

```ts
// eval/cases/recall.eval.ts
import type { EvalCase } from "../types";

export const recallCases: EvalCase[] = [
  {
    id: "recall-001",
    agentType: "recall",
    description: "Agente inicia reativação de paciente inativo (>90 dias)",
    conversation: [],
    userMessage:
      "Oii, vi que recebi uma mensagem de vocês. O que aconteceu?",
    expectedOutcomes: {
      toolsCalled: ["send_reactivation_message"],
    },
    extraCriteria: ["Motivação para retorno"],
  },
  {
    id: "recall-002",
    agentType: "recall",
    description: "Paciente responde positivamente ao recall — roteado para scheduling",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Notamos que faz mais de 3 meses desde sua última consulta. Que tal agendar uma revisão?",
      },
    ],
    userMessage: "Boa ideia, quero marcar uma consulta.",
    expectedOutcomes: {
      toolsCalled: ["route_to_scheduling"],
    },
    extraCriteria: ["Motivação para retorno"],
  },
];
```

**Step 5: Commit all cases**

```bash
git add eval/cases/confirmation.eval.ts eval/cases/nps.eval.ts eval/cases/billing.eval.ts eval/cases/recall.eval.ts
git commit -m "feat(eval): add unit cases for confirmation, nps, billing, recall agents"
```

---

## Task 13: Patient Simulator (for E2E flows)

**Files:**
- Create: `eval/patient-simulator.ts`

**Step 1: Write `eval/patient-simulator.ts`**

```ts
// eval/patient-simulator.ts
// LLM-based patient simulator for E2E flows.
// Uses OPENAI_MODEL to simulate realistic patient responses.
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  temperature: 0.7,
  maxRetries: 2,
});

export interface SimulatedMessage {
  content: string;
}

export async function simulatePatientResponse(params: {
  persona: string;
  instruction: string;
  conversationHistory: Array<{ role: "patient" | "agent"; content: string }>;
}): Promise<SimulatedMessage> {
  const systemPrompt = `Você é ${params.persona}.

Você está conversando com o assistente virtual de uma clínica de saúde via WhatsApp.
Responda de forma natural e realista ao contexto brasileiro.
Mantenha-se no personagem — não quebre o fluxo da conversa.
Suas mensagens devem ser curtas (1-3 frases), como numa conversa real de WhatsApp.
Não use markdown, não use emojis em excesso.`;

  const messages = [
    new SystemMessage(systemPrompt),
    ...params.conversationHistory.map((m) =>
      m.role === "patient"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    ),
    new HumanMessage(`Instrução (não repita isso na resposta): ${params.instruction}`),
  ];

  const response = await llm.invoke(messages);
  const content =
    typeof response.content === "string"
      ? response.content
      : String(response.content);

  return { content };
}
```

**Step 2: Commit**

```bash
git add eval/patient-simulator.ts
git commit -m "feat(eval): add LLM patient simulator for E2E flows"
```

---

## Task 14: E2E Flows

**Files:**
- Create: `eval/flows/scheduling-complete.flow.ts`
- Create: `eval/flows/billing-complete.flow.ts`
- Create: `eval/flows/recall-scheduling.flow.ts`
- Create: `eval/flows/nps-post-appointment.flow.ts`

**Step 1: Write `eval/flows/scheduling-complete.flow.ts`**

```ts
// eval/flows/scheduling-complete.flow.ts
import type { EvalFlow } from "../types";

export const schedulingCompleteFlow: EvalFlow = {
  id: "flow-scheduling-complete",
  name: "Agendamento Completo",
  agentTypes: ["scheduling", "confirmation"],
  patientPersona:
    "Paciente adulto, educado, chamado João. Quer marcar uma consulta de rotina para a semana que vem. Responde de forma objetiva e confirma rapidamente quando solicitado.",
  steps: [
    {
      role: "patient",
      instruction:
        "Cumprimente a clínica e pergunte sobre disponibilidade para a próxima semana.",
    },
    {
      role: "patient",
      instruction:
        "Escolha um dos horários disponíveis mencionados pelo agente e confirme que quer agendar naquele horário.",
      expectedAgentType: "scheduling",
    },
    {
      role: "patient",
      instruction:
        "Responda à confirmação de agendamento com uma mensagem de agradecimento.",
      expectedAgentType: "scheduling",
    },
  ],
};
```

**Step 2: Write `eval/flows/billing-complete.flow.ts`**

```ts
// eval/flows/billing-complete.flow.ts
import type { EvalFlow } from "../types";

export const billingCompleteFlow: EvalFlow = {
  id: "flow-billing-complete",
  name: "Cobrança Completa",
  agentTypes: ["billing"],
  patientPersona:
    "Paciente chamado Maria, tem uma fatura pendente de R$200. Inicialmente estava esquecida do pagamento, mas é boa pagadora e quer regularizar a situação quando lembrada educadamente.",
  steps: [
    {
      role: "patient",
      instruction:
        "Responda à mensagem de cobrança mostrando que estava esquecida e pergunte mais detalhes sobre a fatura.",
    },
    {
      role: "patient",
      instruction:
        "Após ver os detalhes da fatura, peça o link para pagamento.",
      expectedAgentType: "billing",
    },
    {
      role: "patient",
      instruction:
        "Informe que acabou de realizar o pagamento e pergunte se já foi confirmado.",
      expectedAgentType: "billing",
    },
  ],
};
```

**Step 3: Write `eval/flows/recall-scheduling.flow.ts`**

```ts
// eval/flows/recall-scheduling.flow.ts
import type { EvalFlow } from "../types";

export const recallSchedulingFlow: EvalFlow = {
  id: "flow-recall-scheduling",
  name: "Recall + Agendamento",
  agentTypes: ["recall", "scheduling"],
  patientPersona:
    "Paciente chamado Carlos, inativo há 3 meses. Ficou surpreso com a mensagem mas é receptivo. Aceita o convite para retornar quando o agente apresenta boas razões.",
  steps: [
    {
      role: "patient",
      instruction:
        "Responda à mensagem de reativação com curiosidade — pergunte o que a clínica tem para oferecer.",
    },
    {
      role: "patient",
      instruction:
        "Após ouvir os benefícios, demonstre interesse em agendar uma consulta de retorno.",
      expectedAgentType: "recall",
    },
    {
      role: "patient",
      instruction:
        "Pergunte qual é o horário mais próximo disponível para agendar.",
      expectedAgentType: "scheduling",
    },
  ],
};
```

**Step 4: Write `eval/flows/nps-post-appointment.flow.ts`**

```ts
// eval/flows/nps-post-appointment.flow.ts
import type { EvalFlow } from "../types";

export const npsPostAppointmentFlow: EvalFlow = {
  id: "flow-nps-post-appointment",
  name: "NPS pós-consulta",
  agentTypes: ["nps"],
  patientPersona:
    "Paciente chamado Ana, teve uma consulta ontem. Ficou muito satisfeita com o atendimento. É uma promotora nata — nota 9-10 — e adora deixar avaliações online quando incentivada.",
  steps: [
    {
      role: "patient",
      instruction:
        "Responda à pesquisa de satisfação com uma nota alta (9 ou 10) e um comentário positivo.",
    },
    {
      role: "patient",
      instruction:
        "Quando o agente pedir um comentário ou oferecer avaliação no Google, aceite com entusiasmo.",
      expectedAgentType: "nps",
    },
  ],
};
```

**Step 5: Commit**

```bash
git add eval/flows/
git commit -m "feat(eval): add 4 E2E flow definitions (scheduling, billing, recall, nps)"
```

---

## Task 15: Report Generator

**Files:**
- Create: `eval/report.ts`

**Step 1: Write `eval/report.ts`**

```ts
// eval/report.ts
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { EvalResult, RunSummary } from "./types";

const PASS_THRESHOLD = 7.0;
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function color(text: string, c: string): string {
  return `${c}${text}${RESET}`;
}

export function buildSummary(
  runId: string,
  results: EvalResult[]
): RunSummary {
  const totalCases = results.length;
  const passed = results.filter((r) => r.passed).length;
  const criticalFails = results.filter((r) => r.criticalFail).length;
  const averageScore =
    totalCases > 0
      ? Math.round(
          (results.reduce((sum, r) => sum + r.score, 0) / totalCases) * 10
        ) / 10
      : 0;

  const byAgent: RunSummary["byAgent"] = {};
  for (const result of results) {
    if (!byAgent[result.agentType]) {
      byAgent[result.agentType] = { averageScore: 0, cases: 0 };
    }
    const entry = byAgent[result.agentType];
    entry.cases++;
    entry.averageScore =
      Math.round(
        ((entry.averageScore * (entry.cases - 1) + result.score) /
          entry.cases) *
          10
      ) / 10;
  }

  return {
    runId,
    timestamp: new Date().toISOString(),
    totalCases,
    passed,
    criticalFails,
    averageScore,
    byAgent,
    results,
  };
}

export function saveReport(summary: RunSummary): string {
  mkdirSync("eval-results", { recursive: true });
  const filename = `eval-results/${summary.runId}.json`;
  writeFileSync(filename, JSON.stringify(summary, null, 2), "utf-8");
  return filename;
}

export function printConsoleReport(summary: RunSummary): void {
  const line = "═".repeat(60);
  const thin = "─".repeat(60);

  console.log(`\n${color(line, BOLD)}`);
  console.log(
    color(`  ÓRBITA EVAL SUITE — ${summary.timestamp.slice(0, 19).replace("T", " ")}`, BOLD)
  );
  console.log(color(line, BOLD));
  console.log();

  // Unit cases
  const unitResults = summary.results.filter((r) => r.type === "unit");
  if (unitResults.length > 0) {
    console.log(color(`📋 TESTES UNITÁRIOS (${unitResults.length} casos)`, BOLD));

    const agentGroups = new Map<string, EvalResult[]>();
    for (const r of unitResults) {
      if (!agentGroups.has(r.agentType)) agentGroups.set(r.agentType, []);
      agentGroups.get(r.agentType)!.push(r);
    }

    for (const [agentType, results] of agentGroups) {
      const avg =
        Math.round(
          (results.reduce((s, r) => s + r.score, 0) / results.length) * 10
        ) / 10;
      const avgMs = Math.round(
        results.reduce((s, r) => s + r.durationMs, 0) / results.length / 100
      ) / 10;
      const icon = avg >= PASS_THRESHOLD ? color("✅", GREEN) : color("⚠️ ", YELLOW);
      const scoreStr =
        avg >= PASS_THRESHOLD
          ? color(`${avg}/10`, GREEN)
          : color(`${avg}/10`, YELLOW);
      const warning = avg < PASS_THRESHOLD ? color("  ← abaixo de 7.0", YELLOW) : "";
      console.log(
        `  ${icon} ${agentType.padEnd(16)} ${scoreStr}  ${results.length} caso${results.length > 1 ? "s" : ""}   avg ${avgMs}s${warning}`
      );
    }
    console.log();
  }

  // E2E flows
  const flowResults = summary.results.filter((r) => r.type === "flow");
  if (flowResults.length > 0) {
    console.log(color(`🔄 FLUXOS E2E (${flowResults.length} fluxos)`, BOLD));
    for (const r of flowResults) {
      const icon = r.passed ? color("✅", GREEN) : color("⚠️ ", YELLOW);
      const scoreStr = r.passed
        ? color(`${r.score}/10`, GREEN)
        : color(`${r.score}/10`, YELLOW);
      const secs = Math.round(r.durationMs / 100) / 10;
      const warning = !r.passed ? color("  ← abaixo de 7.0", YELLOW) : "";
      console.log(`  ${icon} ${r.caseId.padEnd(36)} ${scoreStr}  ${secs}s${warning}`);
    }
    console.log();
  }

  // Cases below threshold
  const failing = summary.results.filter((r) => !r.passed && !r.error);
  if (failing.length > 0) {
    console.log(color(`⚠️  CASOS ABAIXO DO LIMIAR (score < ${PASS_THRESHOLD}):`, YELLOW));
    for (const r of failing) {
      console.log(
        `  ${color(r.caseId, YELLOW)} [${r.score}/10] ${r.claudeEvaluation.overall}`
      );
      if (r.claudeEvaluation.suggestions) {
        console.log(
          color(
            `    💡 ${r.claudeEvaluation.suggestions.split("\n")[0]}`,
            DIM
          )
        );
      }
    }
    console.log();
  }

  // Critical fails
  const critical = summary.results.filter((r) => r.criticalFail);
  if (critical.length > 0) {
    console.log(color(`🚨 FALHAS CRÍTICAS DE SEGURANÇA:`, RED));
    for (const r of critical) {
      console.log(color(`  ${r.caseId} — agente inventou dados`, RED));
    }
    console.log();
  }

  // Errors
  const errors = summary.results.filter((r) => r.error);
  if (errors.length > 0) {
    console.log(color(`❌ ERROS DE EXECUÇÃO:`, RED));
    for (const r of errors) {
      console.log(color(`  ${r.caseId}: ${r.error}`, RED));
    }
    console.log();
  }

  console.log(thin);
  const overallColor = summary.averageScore >= PASS_THRESHOLD ? GREEN : YELLOW;
  console.log(
    `  SCORE GERAL: ${color(`${summary.averageScore}/10`, overallColor)}  |  ${summary.passed}/${summary.totalCases} casos ≥ ${PASS_THRESHOLD}`
  );
  console.log(color(line, BOLD));
  console.log();
}
```

**Step 2: Commit**

```bash
git add eval/report.ts
git commit -m "feat(eval): add report generator (JSON file + colorful console output)"
```

---

## Task 16: Main Runner

**Files:**
- Create: `eval/runner.ts`

**Step 1: Write `eval/runner.ts`**

```ts
// eval/runner.ts
// Load env vars first (before any other import)
import { config } from "fs";
import { readFileSync } from "fs";
import { join } from "path";

// Manual .env loading (Next.js doesn't run here)
function loadEnv() {
  try {
    const envPath = join(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env file not found — rely on actual environment variables
  }
}

loadEnv();

import { createEvalClient } from "./supabase";
import { createTestClinic } from "./fixtures/clinic";
import { createTestPatient } from "./fixtures/patient";
import { createTestProfessional } from "./fixtures/professional";
import { createTestAppointments } from "./fixtures/appointments";
import { teardownFixtures } from "./fixtures/teardown";
import { executeAgent, createEvalConversation } from "./agent-executor";
import { evaluateResponse } from "./evaluator";
import { simulatePatientResponse } from "./patient-simulator";
import { buildSummary, saveReport, printConsoleReport } from "./report";
import type { EvalResult, TestContext, EvalCase, EvalFlow } from "./types";

// Import all cases
import { supportCases } from "./cases/support.eval";
import { schedulingCases } from "./cases/scheduling.eval";
import { confirmationCases } from "./cases/confirmation.eval";
import { npsCases } from "./cases/nps.eval";
import { billingCases } from "./cases/billing.eval";
import { recallCases } from "./cases/recall.eval";

// Import all flows
import { schedulingCompleteFlow } from "./flows/scheduling-complete.flow";
import { billingCompleteFlow } from "./flows/billing-complete.flow";
import { recallSchedulingFlow } from "./flows/recall-scheduling.flow";
import { npsPostAppointmentFlow } from "./flows/nps-post-appointment.flow";

const ALL_CASES: EvalCase[] = [
  ...supportCases,
  ...schedulingCases,
  ...confirmationCases,
  ...npsCases,
  ...billingCases,
  ...recallCases,
];

const ALL_FLOWS: EvalFlow[] = [
  schedulingCompleteFlow,
  billingCompleteFlow,
  recallSchedulingFlow,
  npsPostAppointmentFlow,
];

// CLI args
const args = process.argv.slice(2);
const onlyUnit = args.includes("--only-unit");
const onlyFlows = args.includes("--only-flows");
const agentFilter = args.includes("--agent")
  ? args[args.indexOf("--agent") + 1]
  : null;

async function runUnitCase(
  evalCase: EvalCase,
  ctx: TestContext,
  runId: string
): Promise<EvalResult> {
  const supabase = createEvalClient();
  const conversationId = await createEvalConversation(
    supabase,
    ctx.clinicId,
    ctx.patientId
  );

  const execResult = await executeAgent({
    supabase,
    agentType: evalCase.agentType,
    clinicId: ctx.clinicId,
    patientId: ctx.patientId,
    conversationId,
    history: evalCase.conversation,
    userMessage: evalCase.userMessage,
  });

  let score = 0;
  let claudeEvaluation = {
    criteria: [] as Array<{ name: string; score: number; justification: string }>,
    overall: "Erro na avaliação",
    suggestions: "",
  };

  if (!execResult.error) {
    try {
      claudeEvaluation = await evaluateResponse({
        agentType: evalCase.agentType,
        conversation: evalCase.conversation,
        userMessage: evalCase.userMessage,
        agentResponse: execResult.response,
        toolsCalled: execResult.toolsCalled,
        availableTools: execResult.availableTools,
        extraCriteria: evalCase.extraCriteria,
      });

      score =
        claudeEvaluation.criteria.length > 0
          ? Math.round(
              (claudeEvaluation.criteria.reduce((s, c) => s + c.score, 0) /
                claudeEvaluation.criteria.length) *
                10
            ) / 10
          : 0;
    } catch (evalError) {
      claudeEvaluation.overall = `Erro no avaliador: ${evalError instanceof Error ? evalError.message : String(evalError)}`;
    }
  }

  const safetyScore = claudeEvaluation.criteria.find(
    (c) => c.name === "Segurança"
  )?.score ?? 10;

  return {
    runId,
    caseId: evalCase.id,
    type: "unit",
    agentType: evalCase.agentType,
    score,
    agentResponse: execResult.response,
    toolsCalled: execResult.toolsCalled,
    criticalFail: safetyScore < 5,
    claudeEvaluation,
    durationMs: execResult.durationMs,
    passed: score >= 7.0 && !execResult.error,
    error: execResult.error,
  };
}

async function runE2EFlow(
  flow: EvalFlow,
  ctx: TestContext,
  runId: string
): Promise<EvalResult> {
  const supabase = createEvalClient();
  const conversationId = await createEvalConversation(
    supabase,
    ctx.clinicId,
    ctx.patientId
  );

  const start = Date.now();
  const conversationHistory: Array<{ role: "patient" | "agent"; content: string }> = [];
  let currentAgentTypeIdx = 0;
  const toolsCalledAll: string[] = [];
  let lastAgentResponse = "";

  try {
    for (const step of flow.steps) {
      const agentType =
        step.expectedAgentType ?? flow.agentTypes[currentAgentTypeIdx];

      let patientMessage: string;

      if (step.role === "system") {
        // System-injected message (e.g., cron trigger simulation)
        patientMessage = step.message ?? "[system step]";
      } else {
        // LLM patient generates the message
        const simResult = await simulatePatientResponse({
          persona: flow.patientPersona,
          instruction: step.instruction ?? "Continue the conversation naturally.",
          conversationHistory,
        });
        patientMessage = simResult.content;
      }

      conversationHistory.push({ role: "patient", content: patientMessage });

      const history = conversationHistory
        .slice(0, -1)
        .map((m) => ({
          role: m.role === "patient" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));

      const execResult = await executeAgent({
        supabase,
        agentType,
        clinicId: ctx.clinicId,
        patientId: ctx.patientId,
        conversationId,
        history,
        userMessage: patientMessage,
      });

      if (execResult.error) {
        throw new Error(`Step failed (${agentType}): ${execResult.error}`);
      }

      conversationHistory.push({ role: "agent", content: execResult.response });
      toolsCalledAll.push(...execResult.toolsCalled);
      lastAgentResponse = execResult.response;

      if (
        step.expectedAgentType &&
        step.expectedAgentType !== flow.agentTypes[currentAgentTypeIdx]
      ) {
        currentAgentTypeIdx = Math.min(
          currentAgentTypeIdx + 1,
          flow.agentTypes.length - 1
        );
      }
    }

    // Evaluate the overall flow
    const claudeEvaluation = await evaluateResponse({
      agentType: flow.agentTypes.join("+"),
      conversation: conversationHistory
        .slice(0, -1)
        .map((m) => ({
          role: m.role === "patient" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        })),
      userMessage: conversationHistory[conversationHistory.length - 2]?.content ?? "",
      agentResponse: lastAgentResponse,
      toolsCalled: toolsCalledAll,
      availableTools: flow.agentTypes,
    });

    const score =
      claudeEvaluation.criteria.length > 0
        ? Math.round(
            (claudeEvaluation.criteria.reduce((s, c) => s + c.score, 0) /
              claudeEvaluation.criteria.length) *
              10
          ) / 10
        : 0;

    const safetyScore = claudeEvaluation.criteria.find(
      (c) => c.name === "Segurança"
    )?.score ?? 10;

    return {
      runId,
      caseId: flow.id,
      type: "flow",
      agentType: flow.agentTypes[0],
      score,
      agentResponse: lastAgentResponse,
      toolsCalled: toolsCalledAll,
      criticalFail: safetyScore < 5,
      claudeEvaluation,
      durationMs: Date.now() - start,
      passed: score >= 7.0,
    };
  } catch (err) {
    return {
      runId,
      caseId: flow.id,
      type: "flow",
      agentType: flow.agentTypes[0],
      score: 0,
      agentResponse: "",
      toolsCalled: toolsCalledAll,
      criticalFail: false,
      claudeEvaluation: {
        criteria: [],
        overall: "Erro na execução do fluxo",
        suggestions: "",
      },
      durationMs: Date.now() - start,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const runId = new Date()
    .toISOString()
    .slice(0, 16)
    .replace("T", "-")
    .replace(":", "");

  console.log("\n🏥 Órbita Eval Suite");
  console.log(`   Run: ${runId}\n`);

  const supabase = createEvalClient();
  let ctx: TestContext | null = null;

  try {
    // Setup
    console.log("📦 Criando fixtures...");
    const clinicId = await createTestClinic(supabase);
    const patientId = await createTestPatient(supabase, clinicId);
    const { professionalId, serviceId } = await createTestProfessional(
      supabase,
      clinicId
    );
    const appointments = await createTestAppointments(
      supabase,
      clinicId,
      patientId,
      professionalId,
      serviceId
    );

    ctx = {
      clinicId,
      patientId,
      professionalId,
      serviceId,
      ...appointments,
    };

    console.log("  ✓ Fixtures prontos\n");

    const results: EvalResult[] = [];

    // Unit cases
    if (!onlyFlows) {
      const cases = agentFilter
        ? ALL_CASES.filter((c) => c.agentType === agentFilter)
        : ALL_CASES;

      if (cases.length > 0) {
        console.log(`🧪 Executando ${cases.length} casos unitários...`);
        for (const evalCase of cases) {
          process.stdout.write(`  → ${evalCase.id} (${evalCase.agentType})... `);
          const result = await runUnitCase(evalCase, ctx, runId);
          const icon = result.passed ? "✅" : result.error ? "❌" : "⚠️ ";
          console.log(`${icon} ${result.score}/10`);
          results.push(result);
        }
        console.log();
      }
    }

    // E2E flows
    if (!onlyUnit) {
      const flows = agentFilter
        ? ALL_FLOWS.filter((f) => f.agentTypes.includes(agentFilter))
        : ALL_FLOWS;

      if (flows.length > 0) {
        console.log(`🔄 Executando ${flows.length} fluxos E2E...`);
        for (const flow of flows) {
          process.stdout.write(`  → ${flow.name}... `);
          const result = await runE2EFlow(flow, ctx, runId);
          const icon = result.passed ? "✅" : result.error ? "❌" : "⚠️ ";
          console.log(`${icon} ${result.score}/10  (${Math.round(result.durationMs / 1000)}s)`);
          results.push(result);
        }
        console.log();
      }
    }

    // Report
    const summary = buildSummary(runId, results);
    const filename = saveReport(summary);
    printConsoleReport(summary);
    console.log(`  Relatório salvo em: ${filename}\n`);

    // Exit code based on critical failures or errors
    const hasCritical = results.some((r) => r.criticalFail);
    const hasErrors = results.some((r) => r.error);
    process.exit(hasCritical || hasErrors ? 1 : 0);
  } finally {
    if (ctx) {
      console.log("🧹 Limpando fixtures...");
      await teardownFixtures(supabase, ctx).catch((e) =>
        console.error("Teardown error:", e)
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Commit**

```bash
git add eval/runner.ts
git commit -m "feat(eval): add main runner (setup → unit → flows → teardown → report)"
```

---

## Task 17: Integration Test — First Run

**Step 1: Verify TypeScript compiles cleanly**

```bash
npx tsc --tsconfig tsconfig.eval.json --noEmit
```

Expected: 0 errors (fix any before proceeding)

**Step 2: Run a single agent eval to test end-to-end**

```bash
npm run eval:agent support
```

Expected output:
- "Criando fixtures..." with ✓ for each
- "Executando 3 casos unitários..."
- 3 case results with scores
- Console report table
- "Limpando fixtures..." with ✓
- JSON file in `eval-results/`

**Step 3: Inspect the JSON result**

```bash
# Windows bash
cat eval-results/*.json | head -100
```

Verify JSON structure has: `runId`, `summary`, `results` with `claudeEvaluation.criteria`

**Step 4: Run full suite**

```bash
npm run eval
```

Expected: all 6 agents + 4 flows run in ~5-10 minutes. All cases produce scores (some may be below 7.0 — this is intentional information).

**Step 5: Fix any import/runtime errors found**

Common issues:
- Missing DB columns (e.g., `confirmation_queue` might not have `patient_id`) → check actual schema and adjust fixture
- TypeScript type mismatch in Supabase inserts → check `Database` generated types
- Agent file has additional `server-only` imports → add to `tsconfig.eval.json` paths

**Step 6: Add `.gitignore` entry for eval results**

In `.gitignore`, add:
```
eval-results/
```

**Step 7: Commit final state**

```bash
git add .gitignore
git commit -m "feat(eval): complete eval suite — all agents + 4 E2E flows"
```

---

## Task 18: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add eval system section to CLAUDE.md**

Add after the "Cron Routes" table section:

```markdown
## Eval System

- `npm run eval` — full suite (unit + E2E), `--only-unit`, `--only-flows`, `--agent <type>` flags
- `eval/` at project root (tooling, not `src/`) — runs outside Next.js via tsx
- `tsconfig.eval.json` maps `server-only` → no-op stub (`eval/stubs/server-only.ts`)
- Uses real Supabase (test data created/destroyed per run), real OpenAI for agents, real Asaas sandbox for billing
- WhatsApp credentials are fake (sends fail gracefully, WA delivery not evaluated)
- `ANTHROPIC_API_KEY` + `CLAUDE_MODEL` — new env vars for Claude evaluator
- Results saved to `eval-results/YYYY-MM-DD-HHmm.json` (gitignored)
- Score < 7.0 = warning; `Segurança < 5` = `CRITICAL_FAIL` (exit code 1)
```

**Step 2: Add new env vars to .env.example**

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL=claude-sonnet-4-6
```

**Step 3: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs: document eval system in CLAUDE.md and .env.example"
```

---

## Done

**Verification checklist:**
- [ ] `npm run eval` runs without fatal errors
- [ ] All 6 agents produce unit test results with scores
- [ ] All 4 E2E flows complete (even if score < 7.0 on some)
- [ ] JSON report saved to `eval-results/`
- [ ] Console output shows colorful table with pass/fail indicators
- [ ] Teardown removes all test data (verify via Supabase dashboard)
- [ ] `Segurança` criterion never below 5 (agents don't fabricate data)
- [ ] `ANTHROPIC_API_KEY` documented in `.env.example`
