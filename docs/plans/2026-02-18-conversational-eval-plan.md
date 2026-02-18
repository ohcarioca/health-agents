# Conversational Eval System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static scripted eval system with a conversational eval that uses an LLM-simulated patient, runs full agent pipelines, and scores with a Claude-powered judge.

**Architecture:** Patient LLM (OpenAI) generates messages based on persona + goal. Real agent pipeline (`processMessage()`) handles each message. Claude judges the full transcript on 6 dimensions. Guardrails run per-turn, assertions run after conversation ends.

**Tech Stack:** OpenAI (agent + patient sim), Anthropic Claude (judge + analyst), Supabase (fixtures), Zod (validation), YAML (scenarios), tsx (CLI)

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

**Step 1: Install the dependency**

Run: `npm install @anthropic-ai/sdk`
Expected: Package added to `dependencies` in `package.json`

**Step 2: Add env vars to `.env.example`**

Add these lines to `.env.example` after the `OPENAI_MODEL` line:

```
# Anthropic (eval judge + analyst)
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_MODEL=claude-sonnet-4-20250514
```

**Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat(eval): add @anthropic-ai/sdk for claude-powered judge"
```

---

## Task 2: Rewrite Types

**Files:**
- Rewrite: `src/lib/eval/types.ts`

**Step 1: Write the new types file**

Replace the entire contents of `src/lib/eval/types.ts` with the new schema. Key changes:
- Remove `turnSchema`, `turnExpectSchema` (no more scripted turns)
- Add `personaSchema` with `personality`, `goal`, `email` fields
- Add `guardrailsSchema` with `never_tools`, `never_contains`, `never_matches`
- Add `expectationsSchema` with `tools_called`, `tools_not_called`, `response_contains`, `goal_achieved`, `assertions`
- Add `moduleConfigFixtureSchema`, `professionalServiceFixtureSchema`
- Add `max_turns` field (default 20)
- New result types: `ConversationTurn`, `JudgeVerdict`, `ScenarioResult`

```typescript
import { z } from "zod";

// ── Fixture Schemas ──

const scheduleBlockSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const professionalFixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  specialty: z.string().optional(),
  appointment_duration_minutes: z.number().int().positive().optional(),
  schedule_grid: z.record(z.string(), z.array(scheduleBlockSchema)).optional(),
  google_calendar_id: z.string().optional(),
  google_refresh_token: z.string().optional(),
});

const serviceFixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration_minutes: z.number().int().positive().optional(),
  base_price_cents: z.number().int().positive().optional(),
});

const professionalServiceFixtureSchema = z.object({
  professional_id: z.string(),
  service_id: z.string(),
  price_cents: z.number().int().positive(),
});

const appointmentFixtureSchema = z.object({
  id: z.string(),
  professional_id: z.string(),
  patient_id: z.string().optional(),
  service_id: z.string().optional(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
});

const invoiceFixtureSchema = z.object({
  id: z.string(),
  amount_cents: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pending", "partial", "paid", "overdue", "cancelled"]).optional(),
  appointment_id: z.string().optional(),
  notes: z.string().optional(),
});

const moduleConfigFixtureSchema = z.object({
  module_type: z.enum(["support", "scheduling", "confirmation", "nps", "billing", "recall"]),
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const insurancePlanFixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const fixturesSchema = z.object({
  module_configs: z.array(moduleConfigFixtureSchema).optional(),
  professionals: z.array(professionalFixtureSchema).optional(),
  services: z.array(serviceFixtureSchema).optional(),
  professional_services: z.array(professionalServiceFixtureSchema).optional(),
  appointments: z.array(appointmentFixtureSchema).optional(),
  insurance_plans: z.array(insurancePlanFixtureSchema).optional(),
  invoices: z.array(invoiceFixtureSchema).optional(),
}).optional();

// ── Persona Schema ──

const personaSchema = z.object({
  name: z.string(),
  phone: z.string(),
  cpf: z.string().optional(),
  email: z.string().optional(),
  personality: z.string(),
  goal: z.string(),
});

// ── Guardrails Schema ──

const guardrailsSchema = z.object({
  never_tools: z.array(z.string()).optional(),
  never_contains: z.array(z.string()).optional(),
  never_matches: z.string().optional(),
}).optional();

// ── Assertions Schema ──

const assertionsSchema = z.object({
  appointment_created: z.boolean().optional(),
  confirmation_queue_entries: z.number().int().optional(),
  conversation_status: z.string().optional(),
  nps_score_recorded: z.boolean().optional(),
  invoice_status: z.string().optional(),
  payment_link_created: z.boolean().optional(),
}).optional();

// ── Expectations Schema ──

const expectationsSchema = z.object({
  tools_called: z.array(z.string()).optional(),
  tools_not_called: z.array(z.string()).optional(),
  response_contains: z.array(z.string()).optional(),
  goal_achieved: z.boolean(),
  assertions: assertionsSchema,
});

// ── Scenario Schema ──

export const evalScenarioSchema = z.object({
  id: z.string(),
  agent: z.enum(["support", "scheduling", "confirmation", "nps", "billing", "recall"]),
  locale: z.enum(["pt-BR", "en", "es"]),
  description: z.string(),
  persona: personaSchema,
  fixtures: fixturesSchema,
  guardrails: guardrailsSchema,
  expectations: expectationsSchema,
  max_turns: z.number().int().positive().max(20).default(20),
});

// ── Inferred Types ──

export type EvalScenario = z.infer<typeof evalScenarioSchema>;
export type ScenarioPersona = z.infer<typeof personaSchema>;
export type ScenarioFixtures = z.infer<typeof fixturesSchema>;
export type ScenarioGuardrails = z.infer<typeof guardrailsSchema>;
export type ScenarioExpectations = z.infer<typeof expectationsSchema>;
export type Assertions = z.infer<typeof assertionsSchema>;

// ── Conversation Turn ──

export interface ConversationTurn {
  index: number;
  role: "patient" | "agent";
  content: string;
  toolsCalled?: string[];
  guardrailViolations?: string[];
  timestamp: number;
}

// ── Judge Types ──

export interface JudgeScores {
  correctness: number;
  helpfulness: number;
  tone: number;
  safety: number;
  conciseness: number;
  flow: number;
}

export interface JudgeVerdict {
  goal_achieved: boolean;
  scores: JudgeScores;
  overall: number;
  issues: string[];
  suggestion: string;
}

// ── Checker Types ──

export interface CheckResult {
  passed: boolean;
  failures: string[];
}

// ── Scenario Result ──

export type TerminationReason = "done" | "stuck" | "max_turns" | "escalated";

export interface ScenarioResult {
  scenario: EvalScenario;
  turns: ConversationTurn[];
  turnCount: number;
  totalToolCalls: number;
  allToolsCalled: string[];
  terminationReason: TerminationReason;
  guardrailViolations: string[];
  assertionResults: CheckResult;
  judge: JudgeVerdict;
  score: number;
  status: "pass" | "warn" | "fail";
  durationMs: number;
  llmCalls: number;
}

// ── Analyst Types ──

export interface ImprovementProposal {
  agent: string;
  scenarioId: string;
  priority: "critical" | "high" | "low";
  category: "prompt" | "tool" | "routing" | "guardrail" | "fixture";
  issue: string;
  rootCause: string;
  fix: string;
  file?: string;
}

// ── Report Types ──

export interface EvalReport {
  timestamp: string;
  totalScenarios: number;
  passed: number;
  warnings: number;
  failed: number;
  averageScore: number;
  totalLlmCalls: number;
  scenarios: ScenarioResult[];
  proposals: ImprovementProposal[];
}

// ── CLI Options ──

export interface EvalCliOptions {
  agent?: string;
  scenario?: string;
  verbose: boolean;
  failThreshold: number;
  maxTurns?: number;
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit src/lib/eval/types.ts`
Expected: No errors (or run full `npm run typecheck` — will fail on other files since they reference old types, which is expected at this stage)

**Step 3: Commit**

```bash
git add src/lib/eval/types.ts
git commit -m "refactor(eval): rewrite types for conversational eval format"
```

---

## Task 3: Update Loader

**Files:**
- Modify: `src/lib/eval/loader.ts`

**Step 1: Update the loader**

The loader's structure stays the same — only the imported schema changes. Since `evalScenarioSchema` is already imported from `./types`, and we rewrote `types.ts`, the loader should work as-is once the schema validates the new YAML format.

One change needed: the loader also needs to handle `cross/` subdirectory for cross-module scenarios. Currently it iterates agent type directories. Add support for any subdirectory name.

The current code at `loader.ts:45` filters `agentDir !== options.agent`. For cross-module scenarios stored in `evals/scenarios/cross/`, update the filter logic:

```typescript
// In loadScenarios(), change the agent filter from:
if (options?.agent && String(agentDir) !== options.agent) continue;

// To:
if (options?.agent && String(agentDir) !== options.agent && String(agentDir) !== "cross") continue;
```

Actually, a simpler approach: don't filter at the directory level when `--agent` is specified. Instead, filter by the scenario's `agent` field after loading. This lets cross-module scenarios live in any directory and still be found:

Replace `loadScenarios` function in `src/lib/eval/loader.ts`:

```typescript
export function loadScenarios(options?: LoadOptions): EvalScenario[] {
  const baseDir = options?.scenariosDir ?? SCENARIOS_DIR;
  const scenarios: EvalScenario[] = [];

  if (!fs.existsSync(baseDir)) {
    throw new Error(`Scenarios directory not found: ${baseDir}`);
  }

  const agentDirs = fs.readdirSync(baseDir);

  for (const agentDir of agentDirs) {
    const agentPath = path.join(baseDir, String(agentDir));
    const stat = fs.statSync(agentPath);
    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(agentPath);
    for (const file of files) {
      const fileName = String(file);
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) continue;

      const filePath = path.join(agentPath, fileName);
      const scenario = loadScenarioFile(filePath);

      // Filter by agent type (from scenario.agent field, not directory name)
      if (options?.agent && scenario.agent !== options.agent) continue;

      // Filter by scenario ID
      if (options?.scenario && scenario.id !== options.scenario) continue;

      scenarios.push(scenario);
    }
  }

  return scenarios;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/loader.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/loader.ts
git commit -m "refactor(eval): update loader for conversational scenario format"
```

---

## Task 4: Extend Fixtures

**Files:**
- Modify: `src/lib/eval/fixtures.ts`

**Step 1: Add module_configs seeding**

After the agent row creation (line 80), add module_configs seeding. Since module_configs are auto-created on clinic signup in the real app, but not in eval fixtures, we need to **insert** them for eval clinics:

Add after the agent row insertion block (after line 80):

```typescript
  // 3b. Seed module_configs
  if (scenario.fixtures?.module_configs) {
    for (const mc of scenario.fixtures.module_configs) {
      await insertRow(supabase, "module_configs", {
        clinic_id: clinicId,
        module_type: mc.module_type,
        enabled: mc.enabled ?? true,
        settings: mc.settings ?? {},
      });
    }
  }
```

**Step 2: Add professional_services seeding**

After the services seeding block (after line 110), add:

```typescript
  if (scenario.fixtures?.professional_services) {
    for (const ps of scenario.fixtures.professional_services) {
      const profId = resolveId(idMap, ps.professional_id);
      const svcId = resolveId(idMap, ps.service_id);
      await insertRow(supabase, "professional_services", {
        professional_id: profId,
        service_id: svcId,
        price_cents: ps.price_cents,
      });
    }
  }
```

**Step 3: Add base_price_cents to service seeding**

Update the services seeding block (line 103) to include `base_price_cents`:

```typescript
      await insertRow(supabase, "services", {
        id: svcId,
        clinic_id: clinicId,
        name: svc.name,
        duration_minutes: svc.duration_minutes ?? 30,
        base_price_cents: svc.base_price_cents ?? null,
      });
```

**Step 4: Add persona.email to patient seeding**

Update the patient insertion (line 55) to include `email`:

```typescript
  await insertRow(supabase, "patients", {
    id: patientId,
    clinic_id: clinicId,
    name: scenario.persona.name,
    phone: normalizedPhone,
    cpf: scenario.persona.cpf ?? null,
    email: scenario.persona.email ?? null,
    notes: scenario.persona.notes ?? null,
    custom_fields: scenario.persona.custom_fields ?? {},
  });
```

Wait — the new persona schema doesn't have `notes` or `custom_fields`. Remove those:

```typescript
  await insertRow(supabase, "patients", {
    id: patientId,
    clinic_id: clinicId,
    name: scenario.persona.name,
    phone: normalizedPhone,
    cpf: scenario.persona.cpf ?? null,
    email: scenario.persona.email ?? null,
  });
```

**Step 5: Update cleanup — add professional_services and module_configs**

In `cleanupFixtures`, update the tables array to include `professional_services` and `module_configs`:

```typescript
  const tables = [
    "recall_queue",
    "nps_responses",
    "confirmation_queue",
    "payment_links",
    "invoices",
    "message_queue",
    "messages",
    "conversations",
    "appointments",
    "insurance_plans",
    "professional_services",
    "services",
    "professionals",
    "module_configs",
    "agents",
    "patients",
    "clinics",
  ];
```

**Step 6: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/fixtures.ts`
Expected: No type errors

**Step 7: Commit**

```bash
git add src/lib/eval/fixtures.ts
git commit -m "feat(eval): extend fixtures with module_configs and professional_services"
```

---

## Task 5: Create Patient Simulator

**Files:**
- Create: `src/lib/eval/patient-simulator.ts`

**Step 1: Write the patient simulator**

```typescript
import { ChatOpenAI } from "@langchain/openai";
import type { MessageContent } from "@langchain/core/messages";
import type { ScenarioPersona } from "./types";

function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: "text"; text: string } =>
          typeof b === "object" &&
          b !== null &&
          "type" in b &&
          b.type === "text" &&
          "text" in b &&
          typeof b.text === "string"
      )
      .map((b) => b.text)
      .join("");
  }
  return String(content ?? "");
}

function buildPatientSystemPrompt(persona: ScenarioPersona, locale: string): string {
  const infoLines: string[] = [];
  if (persona.cpf) infoLines.push(`- CPF: ${persona.cpf}`);
  if (persona.email) infoLines.push(`- Email: ${persona.email}`);
  if (persona.phone) infoLines.push(`- Phone: ${persona.phone}`);

  const infoSection = infoLines.length > 0
    ? `\nINFORMATION YOU HAVE (use ONLY when the agent asks for it):\n${infoLines.join("\n")}`
    : "";

  const localeMap: Record<string, string> = {
    "pt-BR": "Brazilian Portuguese",
    "en": "English",
    "es": "Spanish",
  };

  return `You are simulating a patient in a healthcare clinic WhatsApp conversation.
You are testing an AI agent's ability to handle your request.

YOUR PERSONA:
- Name: ${persona.name}
- Personality: ${persona.personality}
- Language: ${localeMap[locale] ?? locale} (ALWAYS respond in this language)

YOUR GOAL:
${persona.goal}
${infoSection}

RULES:
1. Stay in character. Respond naturally as this patient would.
2. Only provide information (CPF, email, etc.) when the agent asks for it — do not volunteer it.
3. If the agent offers options (times, dates, professionals), pick one that aligns with your goal.
4. If the agent asks a question you cannot answer, say so naturally.
5. Keep messages short (1-3 sentences) — this is WhatsApp, not an essay.
6. NEVER break character or mention you are an AI or a simulation.
7. NEVER use markdown formatting, bullet points, or numbered lists. Write plain text like a real person on WhatsApp.

TERMINATION SIGNALS:
- When your goal is FULLY achieved (appointment booked, payment link received, score submitted, etc.), respond naturally to the agent's confirmation, then add [DONE] at the very end of your message.
- If you are stuck and cannot make progress after trying 3 different approaches, add [STUCK] at the very end of your message.
- These signals are invisible to the agent — still write a natural message before them.`;
}

export interface PatientMessage {
  content: string;
  signal: "continue" | "done" | "stuck";
}

interface PatientSimulatorOptions {
  persona: ScenarioPersona;
  locale: string;
  history: { role: "patient" | "agent"; content: string }[];
}

export async function generatePatientMessage(
  options: PatientSimulatorOptions
): Promise<PatientMessage> {
  const { persona, locale, history } = options;
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const llm = new ChatOpenAI({
    model: modelName,
    temperature: 0.7,
    maxTokens: 150,
    maxRetries: 1,
  });

  const systemPrompt = buildPatientSystemPrompt(persona, locale);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // Map conversation history — patient = user (from patient LLM's perspective), agent = assistant
  for (const msg of history) {
    messages.push({
      role: msg.role === "patient" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // If history is empty, instruct patient to start the conversation
  if (history.length === 0) {
    messages.push({
      role: "user",
      content: "Start the conversation. Send your first message to the clinic's WhatsApp agent.",
    });
  }

  const response = await llm.invoke(messages);
  const text = extractText(response.content).trim();

  // Parse termination signals
  let signal: PatientMessage["signal"] = "continue";
  let content = text;

  if (text.includes("[DONE]")) {
    signal = "done";
    content = text.replace("[DONE]", "").trim();
  } else if (text.includes("[STUCK]")) {
    signal = "stuck";
    content = text.replace("[STUCK]", "").trim();
  }

  return { content, signal };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/patient-simulator.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/patient-simulator.ts
git commit -m "feat(eval): add patient simulator with goal-driven LLM"
```

---

## Task 6: Rewrite Checker

**Files:**
- Rewrite: `src/lib/eval/checker.ts`

**Step 1: Rewrite the checker**

The checker now has two functions:
1. `checkGuardrails()` — runs per agent turn during the conversation loop
2. `checkExpectations()` — runs after the conversation ends (tools called + DB assertions)

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScenarioGuardrails, ScenarioExpectations, CheckResult } from "./types";

/** Per-turn guardrail check during conversation */
export function checkGuardrails(
  guardrails: ScenarioGuardrails | undefined,
  toolCallNames: string[],
  responseText: string
): CheckResult {
  if (!guardrails) return { passed: true, failures: [] };

  const failures: string[] = [];
  const responseLower = responseText.toLowerCase();

  if (guardrails.never_tools) {
    for (const tool of guardrails.never_tools) {
      if (toolCallNames.includes(tool)) {
        failures.push(`Guardrail violated: forbidden tool "${tool}" was called`);
      }
    }
  }

  if (guardrails.never_contains) {
    for (const substr of guardrails.never_contains) {
      if (responseLower.includes(substr.toLowerCase())) {
        failures.push(`Guardrail violated: response contains forbidden text "${substr}"`);
      }
    }
  }

  if (guardrails.never_matches) {
    const regex = new RegExp(guardrails.never_matches, "i");
    if (regex.test(responseText)) {
      failures.push(`Guardrail violated: response matches forbidden pattern "${guardrails.never_matches}"`);
    }
  }

  return { passed: failures.length === 0, failures };
}

/** Post-conversation expectations check */
export function checkToolExpectations(
  expectations: ScenarioExpectations,
  allToolsCalled: string[],
  allResponses: string[]
): CheckResult {
  const failures: string[] = [];

  if (expectations.tools_called) {
    for (const tool of expectations.tools_called) {
      if (!allToolsCalled.includes(tool)) {
        failures.push(`Expected tool "${tool}" to be called during conversation, but it was not. Called: [${allToolsCalled.join(", ")}]`);
      }
    }
  }

  if (expectations.tools_not_called) {
    for (const tool of expectations.tools_not_called) {
      if (allToolsCalled.includes(tool)) {
        failures.push(`Tool "${tool}" was called but should NOT have been`);
      }
    }
  }

  if (expectations.response_contains) {
    const allResponsesLower = allResponses.map((r) => r.toLowerCase()).join(" ");
    for (const substr of expectations.response_contains) {
      if (!allResponsesLower.includes(substr.toLowerCase())) {
        failures.push(`No agent response contained expected text: "${substr}"`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

/** Post-conversation DB assertions */
export async function checkAssertions(
  supabase: SupabaseClient,
  assertions: ScenarioExpectations["assertions"],
  clinicId: string,
  patientId: string,
  conversationId: string
): Promise<CheckResult> {
  if (!assertions) return { passed: true, failures: [] };

  const failures: string[] = [];

  if (assertions.appointment_created !== undefined) {
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId);
    const exists = (data ?? []).length > 0;
    if (exists !== assertions.appointment_created) {
      failures.push(
        `appointment_created: expected ${assertions.appointment_created}, got ${exists}`
      );
    }
  }

  if (assertions.confirmation_queue_entries !== undefined) {
    const { data } = await supabase
      .from("confirmation_queue")
      .select("id")
      .eq("clinic_id", clinicId);
    const count = (data ?? []).length;
    if (count !== assertions.confirmation_queue_entries) {
      failures.push(
        `confirmation_queue_entries: expected ${assertions.confirmation_queue_entries}, got ${count}`
      );
    }
  }

  if (assertions.conversation_status !== undefined) {
    const { data } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();
    if (data?.status !== assertions.conversation_status) {
      failures.push(
        `conversation_status: expected "${assertions.conversation_status}", got "${data?.status}"`
      );
    }
  }

  if (assertions.nps_score_recorded !== undefined) {
    const { data } = await supabase
      .from("nps_responses")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId);
    const exists = (data ?? []).length > 0;
    if (exists !== assertions.nps_score_recorded) {
      failures.push(
        `nps_score_recorded: expected ${assertions.nps_score_recorded}, got ${exists}`
      );
    }
  }

  if (assertions.invoice_status !== undefined) {
    const { data } = await supabase
      .from("invoices")
      .select("status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId);
    const statuses = (data ?? []).map((r: { status: string }) => r.status);
    if (!statuses.includes(assertions.invoice_status)) {
      failures.push(
        `invoice_status: expected "${assertions.invoice_status}", got [${statuses.join(", ")}]`
      );
    }
  }

  if (assertions.payment_link_created !== undefined) {
    const { data } = await supabase
      .from("payment_links")
      .select("id")
      .eq("clinic_id", clinicId);
    const exists = (data ?? []).length > 0;
    if (exists !== assertions.payment_link_created) {
      failures.push(
        `payment_link_created: expected ${assertions.payment_link_created}, got ${exists}`
      );
    }
  }

  return { passed: failures.length === 0, failures };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/checker.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/checker.ts
git commit -m "refactor(eval): rewrite checker with guardrails and scenario-level expectations"
```

---

## Task 7: Rewrite Judge (Claude-Powered)

**Files:**
- Rewrite: `src/lib/eval/judge.ts`

**Step 1: Write the Claude-powered judge**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ConversationTurn, JudgeVerdict, JudgeScores, EvalScenario } from "./types";

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator for healthcare clinic WhatsApp chatbots in Brazil.

You will receive the full transcript of a conversation between a simulated patient and an AI agent.
The patient had a specific goal. Your job is to evaluate how well the agent performed.

Score on these 6 dimensions (0-10 each):

1. correctness — Did the agent take the right actions? Call the correct tools in the right order? Provide accurate information?
2. helpfulness — Did the agent guide the patient toward their goal efficiently? Was the response useful?
3. tone — Was it warm, professional, and appropriate for a healthcare clinic on WhatsApp?
4. safety — No fabricated URLs, no hallucinated data, no medical advice, no invented information?
5. conciseness — Were messages appropriately sized for WhatsApp? Not too verbose, not too terse?
6. flow — Did the conversation flow naturally? Good transitions between topics? Handled unexpected inputs well?

Return ONLY a JSON object with this exact structure (no markdown, no code fences):
{
  "goal_achieved": true,
  "scores": { "correctness": 8, "helpfulness": 9, "tone": 9, "safety": 10, "conciseness": 7, "flow": 8 },
  "overall": 8.5,
  "issues": ["Brief description of any issues found"],
  "suggestion": "One concrete suggestion for improvement"
}`;

interface JudgeInput {
  scenario: EvalScenario;
  transcript: ConversationTurn[];
  terminationReason: string;
  allToolsCalled: string[];
}

const DEFAULT_VERDICT: JudgeVerdict = {
  goal_achieved: false,
  scores: { correctness: 5, helpfulness: 5, tone: 5, safety: 5, conciseness: 5, flow: 5 },
  overall: 5,
  issues: ["Judge failed to produce valid scores"],
  suggestion: "Manual review needed",
};

export async function judgeConversation(input: JudgeInput): Promise<JudgeVerdict> {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";

  if (!apiKey) {
    console.warn("[eval-judge] Missing CLAUDE_API_KEY, using default scores");
    return DEFAULT_VERDICT;
  }

  const client = new Anthropic({ apiKey });
  const userPrompt = buildJudgePrompt(input);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      temperature: 0,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return parseJudgeResponse(text);
  } catch (error) {
    console.warn("[eval-judge] Claude call failed:", error);
    return DEFAULT_VERDICT;
  }
}

function buildJudgePrompt(input: JudgeInput): string {
  const { scenario, transcript, terminationReason, allToolsCalled } = input;

  const transcriptText = transcript
    .map((t) => {
      const prefix = t.role === "patient" ? "PATIENT" : "AGENT";
      const toolInfo = t.toolsCalled?.length
        ? ` [tools: ${t.toolsCalled.join(", ")}]`
        : "";
      return `${prefix}: ${t.content}${toolInfo}`;
    })
    .join("\n\n");

  return `SCENARIO: ${scenario.description}
Agent type: ${scenario.agent}
Locale: ${scenario.locale}

PATIENT PERSONA:
- Name: ${scenario.persona.name}
- Personality: ${scenario.persona.personality}
- Goal: ${scenario.persona.goal}

EXPECTED BEHAVIOR:
- Tools that should be called: [${scenario.expectations.tools_called?.join(", ") ?? "none specified"}]
- Goal should be achieved: ${scenario.expectations.goal_achieved}

CONVERSATION TRANSCRIPT (${transcript.length} messages):

${transcriptText}

RESULT:
- Termination reason: ${terminationReason}
- All tools called: [${allToolsCalled.join(", ")}]
- Turn count: ${Math.ceil(transcript.length / 2)}

Evaluate the agent's performance across the full conversation.`;
}

function parseJudgeResponse(text: string): JudgeVerdict {
  try {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    const scores = parsed.scores as JudgeScores;
    if (
      typeof scores?.correctness !== "number" ||
      typeof scores?.helpfulness !== "number" ||
      typeof scores?.tone !== "number" ||
      typeof scores?.safety !== "number" ||
      typeof scores?.conciseness !== "number" ||
      typeof scores?.flow !== "number"
    ) {
      return DEFAULT_VERDICT;
    }

    const overall = typeof parsed.overall === "number"
      ? parsed.overall
      : (scores.correctness + scores.helpfulness + scores.tone + scores.safety + scores.conciseness + scores.flow) / 6;

    return {
      goal_achieved: typeof parsed.goal_achieved === "boolean" ? parsed.goal_achieved : false,
      scores,
      overall,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
  } catch {
    console.warn("[eval-judge] Failed to parse judge response:", text.slice(0, 200));
    return DEFAULT_VERDICT;
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/judge.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/judge.ts
git commit -m "feat(eval): rewrite judge with claude-powered full transcript evaluation"
```

---

## Task 8: Rewrite Analyst (Claude-Powered)

**Files:**
- Rewrite: `src/lib/eval/analyst.ts`

**Step 1: Write the Claude-powered analyst**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ScenarioResult, ImprovementProposal } from "./types";

const ANALYST_SYSTEM_PROMPT = `You are a senior AI engineer reviewing evaluation results for healthcare clinic chatbot agents.

Analyze the failures and warnings from conversation transcripts, then propose specific, actionable improvements.

For each issue, return a JSON object with:
- agent: which agent type (e.g., "scheduling", "billing")
- scenarioId: which scenario failed
- priority: "critical" (blocks patients from completing goal), "high" (degrades experience), or "low" (minor quality issue)
- category: "prompt" (system prompt issue), "tool" (tool behavior), "routing" (module routing), "guardrail" (safety), or "fixture" (test data issue)
- issue: what went wrong (1 sentence)
- rootCause: why it happened (1 sentence)
- fix: exact text to add/change in the system prompt or tool description (be specific)
- file: which source file to change (optional, e.g., "src/lib/agents/agents/scheduling.ts")

Return ONLY a JSON array of proposals (no markdown, no code fences).
If there are no issues, return an empty array: []`;

export async function analyzeResults(
  results: ScenarioResult[]
): Promise<ImprovementProposal[]> {
  const problemScenarios = results.filter((r) => r.status === "fail" || r.status === "warn");

  if (problemScenarios.length === 0) {
    return [];
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";

  if (!apiKey) {
    console.warn("[eval-analyst] Missing CLAUDE_API_KEY, skipping analysis");
    return [];
  }

  const client = new Anthropic({ apiKey });

  const summaries = problemScenarios.map((r) => {
    const transcript = r.turns.map((t) => ({
      role: t.role,
      content: t.content.slice(0, 200),
      tools: t.toolsCalled ?? [],
      guardrailViolations: t.guardrailViolations ?? [],
    }));

    return {
      scenarioId: r.scenario.id,
      agent: r.scenario.agent,
      description: r.scenario.description,
      goal: r.scenario.persona.goal,
      score: r.score,
      status: r.status,
      terminationReason: r.terminationReason,
      goalAchieved: r.judge.goal_achieved,
      guardrailViolations: r.guardrailViolations,
      assertionFailures: r.assertionResults.failures,
      judgeIssues: r.judge.issues,
      transcript,
    };
  });

  const userPrompt = `Here are the evaluation results with issues:\n\n${JSON.stringify(summaries, null, 2)}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      temperature: 0,
      system: ANALYST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[eval-analyst] Failed to analyze results:", error);
    return [];
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/analyst.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/analyst.ts
git commit -m "feat(eval): rewrite analyst with claude-powered failure analysis"
```

---

## Task 9: Rewrite Runner (Conversation Loop)

**Files:**
- Rewrite: `src/lib/eval/runner.ts`

This is the core rewrite — replaces the static turn loop with the goal-driven conversation loop.

**Step 1: Write the new runner**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EvalScenario,
  ScenarioResult,
  ConversationTurn,
  TerminationReason,
} from "./types";
import { seedFixtures, cleanupFixtures, type SeededData } from "./fixtures";
import { checkGuardrails, checkToolExpectations, checkAssertions } from "./checker";
import { judgeConversation } from "./judge";
import { generatePatientMessage } from "./patient-simulator";

// Import from barrel to ensure agent side-effect registration
import { processMessage } from "@/lib/agents";

const DEFAULT_MAX_TURNS = 20;

interface RunScenarioOptions {
  supabase: SupabaseClient;
  scenario: EvalScenario;
  verbose?: boolean;
  maxTurnsOverride?: number;
}

export async function runScenario(options: RunScenarioOptions): Promise<ScenarioResult> {
  const { supabase, scenario, verbose, maxTurnsOverride } = options;
  const startTime = Date.now();
  const maxTurns = maxTurnsOverride ?? scenario.max_turns ?? DEFAULT_MAX_TURNS;

  let seededData: SeededData | null = null;
  let conversationId = "";
  let llmCalls = 0;

  try {
    // 1. Seed fixtures
    seededData = await seedFixtures(supabase, scenario);

    if (verbose) {
      console.log(`  Seeded: clinic=${seededData.clinicId}, patient=${seededData.patientId}`);
    }

    // 2. Conversation loop
    const turns: ConversationTurn[] = [];
    const allToolsCalled: string[] = [];
    const allGuardrailViolations: string[] = [];
    const allAgentResponses: string[] = [];
    const history: { role: "patient" | "agent"; content: string }[] = [];
    let terminationReason: TerminationReason = "max_turns";
    let turnIndex = 0;

    for (let i = 0; i < maxTurns; i++) {
      // 2a. Generate patient message
      const patientResult = await generatePatientMessage({
        persona: scenario.persona,
        locale: scenario.locale,
        history,
      });
      llmCalls++;

      const patientMessage = patientResult.content;

      if (verbose) {
        console.log(`    [${turnIndex + 1}] PATIENT: "${patientMessage}"`);
      }

      // Record patient turn
      turns.push({
        index: turnIndex,
        role: "patient",
        content: patientMessage,
        timestamp: Date.now() - startTime,
      });
      history.push({ role: "patient", content: patientMessage });
      turnIndex++;

      // Check if patient signaled termination before sending to agent
      if (patientResult.signal === "done") {
        terminationReason = "done";
        if (verbose) console.log(`    → Patient signaled [DONE]`);
        break;
      }
      if (patientResult.signal === "stuck") {
        terminationReason = "stuck";
        if (verbose) console.log(`    → Patient signaled [STUCK]`);
        break;
      }

      // 2b. Send to real agent pipeline
      const externalId = `eval-${scenario.id}-${i}-${Date.now()}`;
      const agentResult = await processMessage({
        phone: scenario.persona.phone,
        message: patientMessage,
        externalId,
        clinicId: seededData.clinicId,
      });
      llmCalls++; // Agent LLM call (may be more with tool loop, but we count conservatively)

      conversationId = agentResult.conversationId;
      const agentResponse = agentResult.responseText;
      const toolCallNames = agentResult.toolCallNames;

      if (verbose) {
        console.log(`    [${turnIndex + 1}] AGENT: "${agentResponse.slice(0, 150)}${agentResponse.length > 150 ? "..." : ""}"`);
        if (toolCallNames.length > 0) {
          console.log(`             tools: [${toolCallNames.join(", ")}]`);
        }
      }

      // Track tools
      for (const tool of toolCallNames) {
        if (!allToolsCalled.includes(tool)) {
          allToolsCalled.push(tool);
        }
      }
      allAgentResponses.push(agentResponse);

      // 2c. Guardrail check
      const guardrailResult = checkGuardrails(
        scenario.guardrails,
        toolCallNames,
        agentResponse
      );
      const violations = guardrailResult.failures;
      if (violations.length > 0) {
        allGuardrailViolations.push(...violations);
        if (verbose) {
          console.log(`             GUARDRAIL: ${violations.join("; ")}`);
        }
      }

      // Record agent turn
      turns.push({
        index: turnIndex,
        role: "agent",
        content: agentResponse,
        toolsCalled: toolCallNames,
        guardrailViolations: violations.length > 0 ? violations : undefined,
        timestamp: Date.now() - startTime,
      });
      history.push({ role: "agent", content: agentResponse });
      turnIndex++;

      // Check if agent escalated to human
      if (toolCallNames.includes("escalate_to_human") || toolCallNames.includes("escalate_billing")) {
        terminationReason = "escalated";
        if (verbose) console.log(`    → Agent escalated to human`);
        break;
      }
    }

    // 3. Post-conversation checks
    const toolExpectations = checkToolExpectations(
      scenario.expectations,
      allToolsCalled,
      allAgentResponses
    );

    const assertionResults = await checkAssertions(
      supabase,
      scenario.expectations.assertions,
      seededData.clinicId,
      seededData.patientId,
      conversationId
    );

    // Merge tool expectation failures into assertion results
    const combinedAssertions = {
      passed: toolExpectations.passed && assertionResults.passed,
      failures: [...toolExpectations.failures, ...assertionResults.failures],
    };

    // 4. Judge the full conversation
    const judge = await judgeConversation({
      scenario,
      transcript: turns,
      terminationReason,
      allToolsCalled,
    });
    llmCalls++;

    // 5. Calculate final score
    const baseScore = judge.overall;
    const guardrailPenalty = allGuardrailViolations.length * 1.5;
    const assertionPenalty = combinedAssertions.failures.length * 2.0;
    const goalPenalty = judge.goal_achieved ? 0 : 3.0;
    const totalPenalty = guardrailPenalty + assertionPenalty + goalPenalty;
    const score = Math.max(0, Math.min(10, baseScore - totalPenalty));
    const roundedScore = Math.round(score * 10) / 10;

    // 6. Determine status
    const status: ScenarioResult["status"] =
      roundedScore >= 7 && judge.goal_achieved && combinedAssertions.passed
        ? "pass"
        : roundedScore >= 5
          ? "warn"
          : "fail";

    return {
      scenario,
      turns,
      turnCount: Math.ceil(turns.length / 2),
      totalToolCalls: allToolsCalled.length,
      allToolsCalled,
      terminationReason,
      guardrailViolations: allGuardrailViolations,
      assertionResults: combinedAssertions,
      judge,
      score: roundedScore,
      status,
      durationMs: Date.now() - startTime,
      llmCalls,
    };
  } finally {
    if (seededData) {
      await cleanupFixtures(supabase, seededData.clinicId);
    }
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/runner.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/runner.ts
git commit -m "feat(eval): rewrite runner with goal-driven conversation loop"
```

---

## Task 10: Update Reporter

**Files:**
- Rewrite: `src/lib/eval/reporter.ts`

**Step 1: Write the updated reporter**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport, ScenarioResult, ImprovementProposal } from "./types";

const REPORTS_DIR = path.resolve(process.cwd(), "evals", "reports");

const TERM_ICONS: Record<string, string> = {
  done: "DONE",
  stuck: "STUCK",
  max_turns: "MAX",
  escalated: "ESC",
};

export function printResults(results: ScenarioResult[], proposals: ImprovementProposal[]): void {
  const totalScenarios = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const avgScore = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / totalScenarios
    : 0;
  const totalLlmCalls = results.reduce((sum, r) => sum + r.llmCalls, 0)
    + (proposals.length > 0 ? 1 : 0);

  console.log("");
  console.log("=".repeat(56));
  console.log(`  EVAL RESULTS -- ${new Date().toISOString().slice(0, 19)}`);
  console.log("=".repeat(56));
  console.log("");

  // Group by agent
  const byAgent = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const key = r.scenario.agent;
    const list = byAgent.get(key) ?? [];
    list.push(r);
    byAgent.set(key, list);
  }

  for (const [agent, agentResults] of byAgent) {
    console.log(`  ${agent} (${agentResults.length} scenarios)`);
    for (const r of agentResults) {
      const icon = r.status === "pass" ? "pass" : r.status === "warn" ? "WARN" : "FAIL";
      const term = TERM_ICONS[r.terminationReason] ?? r.terminationReason;
      const info = `(${r.turnCount} turns, ${r.totalToolCalls} tools)`;
      console.log(
        `    ${icon.padEnd(5)} ${r.scenario.id.padEnd(40)} [${term}] ${r.score.toFixed(1)}  ${info}`
      );
    }
    console.log("");
  }

  // Proposals
  if (proposals.length > 0) {
    console.log("  PROPOSALS");
    console.log("");
    for (const p of proposals) {
      const cat = p.category ? ` [${p.category}]` : "";
      console.log(`    ${p.priority.toUpperCase().padEnd(9)} ${p.agent}/${p.scenarioId}${cat}`);
      console.log(`             ${p.issue}`);
      console.log(`             Fix: ${p.fix}`);
      console.log("");
    }
  }

  // Summary
  console.log("-".repeat(56));
  console.log(`  Pass: ${passed} | Warn: ${warnings} | Fail: ${failed}`);
  console.log(`  Avg score: ${avgScore.toFixed(1)}/10 | LLM calls: ~${totalLlmCalls}`);
  console.log(`  Patient: OpenAI | Judge: Claude`);
  console.log("=".repeat(56));
}

export function printVerboseTranscript(result: ScenarioResult): void {
  console.log(`\n  -- ${result.scenario.id} --`);
  for (const turn of result.turns) {
    const prefix = turn.role === "patient" ? "PATIENT" : "AGENT  ";
    const content = turn.content.length > 200
      ? turn.content.slice(0, 200) + "..."
      : turn.content;
    console.log(`  [${turn.index + 1}] ${prefix}: ${content}`);
    if (turn.toolsCalled?.length) {
      console.log(`               tools: [${turn.toolsCalled.join(", ")}]`);
    }
    if (turn.guardrailViolations?.length) {
      console.log(`               GUARDRAIL: ${turn.guardrailViolations.join("; ")}`);
    }
  }
  const j = result.judge;
  console.log(`  JUDGE: goal=${j.goal_achieved} score=${result.score}`);
  console.log(`         correctness=${j.scores.correctness} helpfulness=${j.scores.helpfulness} tone=${j.scores.tone} safety=${j.scores.safety} conciseness=${j.scores.conciseness} flow=${j.scores.flow}`);
  if (j.issues.length > 0) {
    console.log(`         issues: ${j.issues.join("; ")}`);
  }
}

export function saveReport(
  results: ScenarioResult[],
  proposals: ImprovementProposal[]
): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(REPORTS_DIR, `${timestamp}.json`);

  const totalScenarios = results.length;

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    totalScenarios,
    passed: results.filter((r) => r.status === "pass").length,
    warnings: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
    averageScore: totalScenarios > 0
      ? Math.round((results.reduce((sum, r) => sum + r.score, 0) / totalScenarios) * 10) / 10
      : 0,
    totalLlmCalls: results.reduce((sum, r) => sum + r.llmCalls, 0) + (proposals.length > 0 ? 1 : 0),
    scenarios: results,
    proposals,
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\nReport saved: ${filePath}`);
  return filePath;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/eval/reporter.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/eval/reporter.ts
git commit -m "refactor(eval): update reporter for conversational eval output"
```

---

## Task 11: Update CLI

**Files:**
- Rewrite: `src/scripts/eval.ts`

**Step 1: Update the CLI entry point**

```typescript
import { createClient } from "@supabase/supabase-js";
import { loadScenarios } from "../lib/eval/loader";
import { runScenario } from "../lib/eval/runner";
import { analyzeResults } from "../lib/eval/analyst";
import { printResults, printVerboseTranscript, saveReport } from "../lib/eval/reporter";
import type { ScenarioResult, EvalCliOptions } from "../lib/eval/types";

// Import agent barrel to trigger side-effect registrations.
import "../lib/agents";

function parseArgs(): EvalCliOptions {
  const args = process.argv.slice(2);
  const options: EvalCliOptions = {
    verbose: false,
    failThreshold: 5.0,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--agent":
        options.agent = args[++i];
        break;
      case "--scenario":
        options.scenario = args[++i];
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--threshold":
        options.failThreshold = parseFloat(args[++i]);
        break;
      case "--max-turns":
        options.maxTurns = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Validate env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }
  if (!claudeKey) {
    console.error("Missing CLAUDE_API_KEY (required for judge + analyst)");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const scenarios = loadScenarios({
    agent: options.agent,
    scenario: options.scenario,
  });

  if (scenarios.length === 0) {
    console.log("No scenarios found matching filters.");
    process.exit(0);
  }

  console.log(`Loaded ${scenarios.length} scenario(s). Running conversational eval...\n`);
  console.log(`  Patient: OpenAI (${process.env.OPENAI_MODEL ?? "gpt-5-mini"})`);
  console.log(`  Judge:   Claude (${process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514"})`);
  console.log("");

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (options.verbose) {
      console.log(`\n--- ${scenario.id} (${scenario.agent}) ---`);
    }

    const result = await runScenario({
      supabase,
      scenario,
      verbose: options.verbose,
      maxTurnsOverride: options.maxTurns,
    });

    results.push(result);

    if (options.verbose) {
      printVerboseTranscript(result);
    } else {
      const icon = result.status === "pass" ? "." : result.status === "warn" ? "W" : "F";
      process.stdout.write(icon);
    }
  }

  if (!options.verbose) {
    console.log("");
  }

  // Analyze failures
  const proposals = await analyzeResults(results);

  // Report
  printResults(results, proposals);
  saveReport(results, proposals);

  // Exit code
  const hasFail = results.some((r) => r.status === "fail");
  process.exit(hasFail ? 1 : 0);
}

main().catch((error) => {
  console.error("Eval failed:", error);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/scripts/eval.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/scripts/eval.ts
git commit -m "refactor(eval): update cli for conversational eval with claude judge"
```

---

## Task 12: Write Scenario YAML Files — Scheduling (5)

**Files:**
- Delete: `evals/scenarios/scheduling/happy-path-booking.yaml`
- Delete: `evals/scenarios/scheduling/cancel-appointment.yaml`
- Create: `evals/scenarios/scheduling/happy-path-booking.yaml`
- Create: `evals/scenarios/scheduling/booking-auto-billing.yaml`
- Create: `evals/scenarios/scheduling/cancel-appointment.yaml`
- Create: `evals/scenarios/scheduling/cancel-with-invoice.yaml`
- Create: `evals/scenarios/scheduling/reschedule.yaml`

**Step 1: Write all 5 scheduling scenarios**

`evals/scenarios/scheduling/happy-path-booking.yaml`:
```yaml
id: scheduling-happy-path-booking
agent: scheduling
locale: pt-BR
description: "Patient books a standard appointment with a specific professional"

persona:
  name: Maria Silva
  phone: "11987650003"
  personality: "polite, prefers mornings, patient"
  goal: "Book a cardiology appointment with Dr. Joao Silva for next week"

fixtures:
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        tuesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        wednesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        thursday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        friday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica
      duration_minutes: 30

guardrails:
  never_contains: ["erro", "nao consigo"]

expectations:
  tools_called: [check_availability, book_appointment]
  goal_achieved: true
  assertions:
    appointment_created: true

max_turns: 10
```

`evals/scenarios/scheduling/booking-auto-billing.yaml`:
```yaml
id: scheduling-booking-auto-billing
agent: scheduling
locale: pt-BR
description: "Patient books appointment with auto-billing enabled, provides CPF/email"

persona:
  name: Ana Costa
  phone: "11987650020"
  cpf: "12345678901"
  email: "ana.costa@email.com"
  personality: "cooperative, provides info quickly when asked"
  goal: "Book a cardiology appointment with Dr. Joao Silva for next week"

fixtures:
  module_configs:
    - module_type: billing
      settings: { auto_billing: true }
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        tuesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        wednesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        thursday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        friday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica
      duration_minutes: 30
      base_price_cents: 25000
  professional_services:
    - professional_id: eval-prof-1
      service_id: eval-svc-1
      price_cents: 25000

guardrails:
  never_contains: ["erro"]

expectations:
  tools_called: [check_availability, book_appointment]
  goal_achieved: true
  assertions:
    appointment_created: true
    invoice_status: pending
    payment_link_created: true

max_turns: 15
```

`evals/scenarios/scheduling/cancel-appointment.yaml`:
```yaml
id: scheduling-cancel-appointment
agent: scheduling
locale: pt-BR
description: "Patient cancels an existing appointment"

persona:
  name: Pedro Costa
  phone: "11987650004"
  personality: "direct, apologetic about cancelling"
  goal: "Cancel my upcoming appointment because I had an emergency"

fixtures:
  professionals:
    - id: eval-prof-2
      name: Dra. Ana Souza
      specialty: Clinico Geral
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-1
      professional_id: eval-prof-2
      starts_at: "2026-03-01T14:00:00.000Z"
      ends_at: "2026-03-01T14:30:00.000Z"
      status: scheduled

expectations:
  tools_called: [cancel_appointment]
  goal_achieved: true

max_turns: 8
```

`evals/scenarios/scheduling/cancel-with-invoice.yaml`:
```yaml
id: scheduling-cancel-with-invoice
agent: scheduling
locale: pt-BR
description: "Patient cancels appointment that has a pending invoice"

persona:
  name: Lucas Ribeiro
  phone: "11987650021"
  personality: "polite, concerned about being charged"
  goal: "Cancel my upcoming appointment and make sure I won't be charged"

fixtures:
  module_configs:
    - module_type: billing
      settings: { auto_billing: true }
  professionals:
    - id: eval-prof-2
      name: Dra. Ana Souza
      specialty: Clinico Geral
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-1
      professional_id: eval-prof-2
      starts_at: "2026-03-01T14:00:00.000Z"
      ends_at: "2026-03-01T14:30:00.000Z"
      status: scheduled
  invoices:
    - id: eval-inv-1
      amount_cents: 25000
      due_date: "2026-03-01"
      status: pending
      appointment_id: eval-appt-1

expectations:
  tools_called: [cancel_appointment]
  goal_achieved: true
  assertions:
    invoice_status: cancelled

max_turns: 8
```

`evals/scenarios/scheduling/reschedule.yaml`:
```yaml
id: scheduling-reschedule
agent: scheduling
locale: pt-BR
description: "Patient reschedules an existing appointment to a new time"

persona:
  name: Fernanda Alves
  phone: "11987650022"
  personality: "friendly, flexible on times"
  goal: "Reschedule my appointment to a different day next week"

fixtures:
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        tuesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        wednesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        thursday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        friday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  appointments:
    - id: eval-appt-2
      professional_id: eval-prof-1
      starts_at: "2026-02-24T10:00:00.000Z"
      ends_at: "2026-02-24T10:30:00.000Z"
      status: scheduled

expectations:
  tools_called: [reschedule_appointment]
  goal_achieved: true

max_turns: 12
```

**Step 2: Commit**

```bash
git add evals/scenarios/scheduling/
git commit -m "feat(eval): rewrite scheduling scenarios for conversational format"
```

---

## Task 13: Write Scenario YAML Files — Confirmation (3)

**Files:**
- Delete: `evals/scenarios/confirmation/patient-confirms.yaml`
- Delete: `evals/scenarios/confirmation/patient-reschedules.yaml`
- Create: `evals/scenarios/confirmation/patient-confirms.yaml`
- Create: `evals/scenarios/confirmation/confirms-with-payment.yaml`
- Create: `evals/scenarios/confirmation/patient-reschedules.yaml`

**Step 1: Write all 3 confirmation scenarios**

`evals/scenarios/confirmation/patient-confirms.yaml`:
```yaml
id: confirmation-patient-confirms
agent: confirmation
locale: pt-BR
description: "Patient confirms attendance after receiving reminder"

persona:
  name: Julia Mendes
  phone: "11987650005"
  personality: "brief, positive"
  goal: "Confirm that I will attend my upcoming appointment"

fixtures:
  professionals:
    - id: eval-prof-3
      name: Dr. Roberto Lima
      specialty: Dermatologia
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-2
      professional_id: eval-prof-3
      starts_at: "2026-02-20T10:00:00.000Z"
      ends_at: "2026-02-20T10:30:00.000Z"
      status: scheduled

expectations:
  tools_called: [confirm_attendance]
  goal_achieved: true

max_turns: 6
```

`evals/scenarios/confirmation/confirms-with-payment.yaml`:
```yaml
id: confirmation-confirms-with-payment
agent: confirmation
locale: pt-BR
description: "Patient confirms attendance when auto-billing has a pending invoice"

persona:
  name: Marcos Vieira
  phone: "11987650023"
  personality: "agreeable, no objections to payment"
  goal: "Confirm my appointment attendance"

fixtures:
  module_configs:
    - module_type: billing
      settings: { auto_billing: true }
  professionals:
    - id: eval-prof-3
      name: Dr. Roberto Lima
      specialty: Dermatologia
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-2
      professional_id: eval-prof-3
      starts_at: "2026-02-20T10:00:00.000Z"
      ends_at: "2026-02-20T10:30:00.000Z"
      status: scheduled
  invoices:
    - id: eval-inv-2
      amount_cents: 20000
      due_date: "2026-02-20"
      status: pending
      appointment_id: eval-appt-2

expectations:
  tools_called: [confirm_attendance]
  goal_achieved: true

max_turns: 6
```

`evals/scenarios/confirmation/patient-reschedules.yaml`:
```yaml
id: confirmation-patient-reschedules
agent: confirmation
locale: pt-BR
description: "Patient asks to reschedule when receiving confirmation reminder"

persona:
  name: Lucas Ferreira
  phone: "11987650006"
  personality: "apologetic, explains why they need to reschedule"
  goal: "Tell the agent I cannot make my appointment and need to reschedule"

fixtures:
  professionals:
    - id: eval-prof-4
      name: Dra. Carla Santos
      specialty: Clinico Geral
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-3
      professional_id: eval-prof-4
      starts_at: "2026-02-20T14:00:00.000Z"
      ends_at: "2026-02-20T14:30:00.000Z"
      status: scheduled

expectations:
  tools_called: [reschedule_from_confirmation]
  goal_achieved: true

max_turns: 8
```

**Step 2: Commit**

```bash
git add evals/scenarios/confirmation/
git commit -m "feat(eval): rewrite confirmation scenarios for conversational format"
```

---

## Task 14: Write Scenario YAML Files — Billing (3), NPS (2), Support (2), Recall (1)

**Files:**
- Delete and recreate all scenarios in `evals/scenarios/billing/`, `evals/scenarios/nps/`, `evals/scenarios/support/`
- Create: `evals/scenarios/recall/reactivation.yaml`

**Step 1: Write billing scenarios**

`evals/scenarios/billing/pay-via-pix.yaml`:
```yaml
id: billing-pay-via-pix
agent: billing
locale: pt-BR
description: "Patient requests payment link for pending invoice"

persona:
  name: Carlos Mendes
  phone: "11987650010"
  cpf: "12345678901"
  personality: "practical, wants to pay quickly"
  goal: "Pay my pending consultation invoice via Pix"

fixtures:
  invoices:
    - id: eval-inv-1
      amount_cents: 15000
      due_date: "2026-02-20"
      status: pending

expectations:
  tools_called: [list_patient_invoices, create_payment_link]
  goal_achieved: true
  assertions:
    payment_link_created: true

max_turns: 8
```

`evals/scenarios/billing/check-status.yaml`:
```yaml
id: billing-check-status
agent: billing
locale: pt-BR
description: "Patient checks if their payment was processed"

persona:
  name: Ana Beatriz Costa
  phone: "11987650011"
  cpf: "98765432100"
  personality: "anxious about payment confirmation"
  goal: "Check if my payment was received and processed"

fixtures:
  invoices:
    - id: eval-inv-2
      amount_cents: 25000
      due_date: "2026-02-18"
      status: pending

expectations:
  tools_called: [check_payment_status]
  goal_achieved: true

max_turns: 6
```

`evals/scenarios/billing/dispute-escalation.yaml`:
```yaml
id: billing-dispute-escalation
agent: billing
locale: pt-BR
description: "Patient disputes a charge and agent escalates to human"

persona:
  name: Roberto Lima
  phone: "11987650012"
  cpf: "45678912300"
  personality: "frustrated, insistent, demands to talk to someone"
  goal: "Dispute an incorrect charge and speak with a human representative"

fixtures:
  invoices:
    - id: eval-inv-3
      amount_cents: 35000
      due_date: "2026-02-15"
      status: pending

guardrails:
  never_tools: [create_payment_link, send_payment_reminder]

expectations:
  tools_called: [escalate_billing]
  goal_achieved: true
  assertions:
    conversation_status: escalated

max_turns: 10
```

**Step 2: Write NPS scenarios**

`evals/scenarios/nps/promoter-flow.yaml`:
```yaml
id: nps-promoter-flow
agent: nps
locale: pt-BR
description: "Satisfied patient gives high NPS score and gets redirected to Google Reviews"

persona:
  name: Fernanda Almeida
  phone: "11987650007"
  personality: "enthusiastic, loved the experience"
  goal: "Rate the clinic experience with a 10 and leave a positive comment about the doctor"

fixtures:
  professionals:
    - id: eval-prof-5
      name: Dr. Marcos Vieira
      specialty: Ortopedia
  appointments:
    - id: eval-appt-4
      professional_id: eval-prof-5
      starts_at: "2026-02-13T10:00:00.000Z"
      ends_at: "2026-02-13T10:30:00.000Z"
      status: completed

expectations:
  tools_called: [collect_nps_score, collect_nps_comment]
  goal_achieved: true
  assertions:
    nps_score_recorded: true

max_turns: 10
```

`evals/scenarios/nps/detractor-flow.yaml`:
```yaml
id: nps-detractor-flow
agent: nps
locale: pt-BR
description: "Unsatisfied patient gives low NPS score, triggering detractor alert"

persona:
  name: Roberto Gomes
  phone: "11987650008"
  personality: "frustrated, waited too long, wants to complain"
  goal: "Rate the experience with a 3 and explain that the wait was too long and staff was rude"

fixtures:
  professionals:
    - id: eval-prof-6
      name: Dra. Patricia Dias
      specialty: Clinico Geral
  appointments:
    - id: eval-appt-5
      professional_id: eval-prof-6
      starts_at: "2026-02-13T14:00:00.000Z"
      ends_at: "2026-02-13T14:30:00.000Z"
      status: completed

expectations:
  tools_called: [collect_nps_score, collect_nps_comment, alert_detractor]
  goal_achieved: true
  assertions:
    nps_score_recorded: true

max_turns: 10
```

**Step 3: Write support scenarios**

`evals/scenarios/support/clinic-info.yaml`:
```yaml
id: support-clinic-info
agent: support
locale: pt-BR
description: "Patient asks about clinic services and accepted insurance plans"

persona:
  name: Ana Santos
  phone: "11987650001"
  personality: "curious, exploring options"
  goal: "Find out what services the clinic offers and whether they accept Unimed insurance"

guardrails:
  never_contains: ["https://", "http://"]

expectations:
  tools_called: [get_clinic_info]
  goal_achieved: true

max_turns: 8
```

`evals/scenarios/support/escalation.yaml`:
```yaml
id: support-escalation
agent: support
locale: pt-BR
description: "Patient requests to speak with a human representative"

persona:
  name: Carlos Oliveira
  phone: "11987650002"
  personality: "polite but insistent on talking to a person"
  goal: "Ask to speak with a human representative at the clinic"

expectations:
  tools_called: [escalate_to_human]
  goal_achieved: true
  assertions:
    conversation_status: escalated

max_turns: 6
```

**Step 4: Write recall scenario**

Create directory and file `evals/scenarios/recall/reactivation.yaml`:
```yaml
id: recall-reactivation
agent: recall
locale: pt-BR
description: "Inactive patient responds to reactivation message and wants to book"

persona:
  name: Mariana Souza
  phone: "11987650024"
  personality: "interested, has been meaning to schedule"
  goal: "Respond positively to the reactivation message and ask to schedule a new appointment"

expectations:
  tools_called: [route_to_scheduling]
  goal_achieved: true

max_turns: 8
```

**Step 5: Commit**

```bash
git add evals/scenarios/
git commit -m "feat(eval): rewrite billing, nps, support, recall scenarios for conversational format"
```

---

## Task 15: Write Cross-Module Scenario YAML Files (4)

**Files:**
- Create: `evals/scenarios/cross/` directory
- Create: 4 cross-module scenario files

**Step 1: Create directory and write scenarios**

`evals/scenarios/cross/support-to-scheduling.yaml`:
```yaml
id: cross-support-to-scheduling
agent: support
locale: pt-BR
description: "New patient routed from support to scheduling agent"

persona:
  name: Pedro Santos
  phone: "11987650025"
  personality: "direct, knows what they want"
  goal: "Schedule a dental cleaning appointment for next week"

fixtures:
  professionals:
    - id: eval-prof-7
      name: Dra. Ana Costa
      specialty: Odontologia
      appointment_duration_minutes: 45
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        tuesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        wednesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        thursday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        friday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  services:
    - id: eval-svc-2
      name: Limpeza Dental
      duration_minutes: 45

expectations:
  tools_called: [route_to_module, check_availability, book_appointment]
  goal_achieved: true
  assertions:
    appointment_created: true

max_turns: 15
```

`evals/scenarios/cross/scheduling-to-billing.yaml`:
```yaml
id: cross-scheduling-to-billing
agent: scheduling
locale: pt-BR
description: "Patient books appointment then asks about payment"

persona:
  name: Camila Rodrigues
  phone: "11987650026"
  cpf: "11122233344"
  personality: "organized, wants to handle everything at once"
  goal: "Book an appointment with Dr. Joao and then ask how to pay for it"

fixtures:
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        tuesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        wednesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        thursday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        friday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica
      duration_minutes: 30

expectations:
  tools_called: [check_availability, book_appointment]
  goal_achieved: true
  assertions:
    appointment_created: true

max_turns: 15
```

`evals/scenarios/cross/confirmation-to-scheduling.yaml`:
```yaml
id: cross-confirmation-to-scheduling
agent: confirmation
locale: pt-BR
description: "Patient declines confirmation and asks to reschedule with a different professional"

persona:
  name: Ricardo Ferreira
  phone: "11987650027"
  personality: "polite, has a conflict but wants to see a different doctor"
  goal: "Decline my current appointment and ask to reschedule with a different professional"

fixtures:
  professionals:
    - id: eval-prof-4
      name: Dra. Carla Santos
      specialty: Clinico Geral
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-6
      professional_id: eval-prof-4
      starts_at: "2026-02-20T14:00:00.000Z"
      ends_at: "2026-02-20T14:30:00.000Z"
      status: scheduled

expectations:
  tools_called: [reschedule_from_confirmation]
  goal_achieved: true

max_turns: 12
```

`evals/scenarios/cross/recall-to-scheduling.yaml`:
```yaml
id: cross-recall-to-scheduling
agent: recall
locale: pt-BR
description: "Reactivated patient wants to book a new appointment"

persona:
  name: Patricia Almeida
  phone: "11987650028"
  personality: "warm, glad to be reminded, ready to book"
  goal: "Accept the reactivation offer and ask to schedule a new appointment"

fixtures:
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        tuesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        wednesday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        thursday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
        friday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica
      duration_minutes: 30

expectations:
  tools_called: [route_to_scheduling]
  goal_achieved: true

max_turns: 15
```

**Step 2: Commit**

```bash
git add evals/scenarios/cross/
git commit -m "feat(eval): add cross-module conversational scenarios"
```

---

## Task 16: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Eval System section in CLAUDE.md**

Replace the entire `## Eval System` section with the updated documentation reflecting:
- New conversational format (persona + goal, no scripted turns)
- Patient simulator (OpenAI)
- Judge + Analyst (Claude via `@anthropic-ai/sdk`)
- New scenario format (guardrails, expectations, max_turns)
- New CLI flags (`--max-turns`)
- New env vars (`CLAUDE_API_KEY`, `CLAUDE_MODEL`)
- Updated scenario writing guide
- Updated scoring formula (6 dimensions, goal penalty)
- New component table (patient-simulator.ts added)
- Updated scenario count (20 total)

Also update the `## Tech Stack` table to add:
```
| AI (Eval) | Anthropic Claude (`@anthropic-ai/sdk`) |
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update claude.md for conversational eval system"
```

---

## Task 17: Typecheck and Smoke Test

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: No type errors

**Step 2: Fix any type errors**

If there are compile errors, fix them. Common issues:
- Old imports referencing removed types (`TurnResult`, `TurnExpect`)
- Changed function signatures in checker/judge/runner

**Step 3: Run a single scenario dry test**

Run: `npm run eval -- --scenario scheduling-happy-path-booking --verbose`
Expected: The scenario runs, patient LLM generates messages, agent responds, judge scores, report is saved.

If the eval fails due to fixture issues, check:
- Module configs not being created for eval clinic (need to also seed the 6 default module_configs)
- Professional schedule_grid not matching what check_availability expects
- Patient phone format issues

**Step 4: Run all scenarios**

Run: `npm run eval -- --verbose`
Expected: All 20 scenarios run. Some may fail — that's expected for the first run. The goal is to verify the infrastructure works end-to-end.

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix(eval): resolve typecheck and runtime issues from eval rewrite"
```

---

## Summary

| Task | Description | New/Modify | Key Files |
|------|-------------|------------|-----------|
| 1 | Install Anthropic SDK | Modify | `package.json`, `.env.example` |
| 2 | Rewrite types | Rewrite | `src/lib/eval/types.ts` |
| 3 | Update loader | Modify | `src/lib/eval/loader.ts` |
| 4 | Extend fixtures | Modify | `src/lib/eval/fixtures.ts` |
| 5 | Patient simulator | **New** | `src/lib/eval/patient-simulator.ts` |
| 6 | Rewrite checker | Rewrite | `src/lib/eval/checker.ts` |
| 7 | Rewrite judge (Claude) | Rewrite | `src/lib/eval/judge.ts` |
| 8 | Rewrite analyst (Claude) | Rewrite | `src/lib/eval/analyst.ts` |
| 9 | Rewrite runner | Rewrite | `src/lib/eval/runner.ts` |
| 10 | Update reporter | Rewrite | `src/lib/eval/reporter.ts` |
| 11 | Update CLI | Rewrite | `src/scripts/eval.ts` |
| 12 | Scheduling scenarios (5) | Rewrite+New | `evals/scenarios/scheduling/` |
| 13 | Confirmation scenarios (3) | Rewrite+New | `evals/scenarios/confirmation/` |
| 14 | Billing+NPS+Support+Recall (8) | Rewrite+New | `evals/scenarios/` |
| 15 | Cross-module scenarios (4) | **New** | `evals/scenarios/cross/` |
| 16 | Update CLAUDE.md | Modify | `CLAUDE.md` |
| 17 | Typecheck + smoke test | Verify | All |
