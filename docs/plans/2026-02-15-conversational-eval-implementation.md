# Conversational Eval System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an LLM-driven eval mode where a simulator LLM plays the patient turn-by-turn against the real agent, scored by rubric + holistic judge.

**Architecture:** New `type: conversational` YAML schema coexists with existing scripted evals. Three new modules (simulator, conversation-judge, conversation-runner) plug into the existing pipeline. Loader detects type, runner dispatches, reporter/analyst handle both.

**Tech Stack:** Vitest, Zod, LangChain ChatOpenAI, YAML, existing eval framework.

**Design doc:** `docs/plans/2026-02-15-conversational-eval-design.md`

---

### Task 1: Add Conversational Types to Schema

**Files:**
- Modify: `src/lib/eval/types.ts`
- Test: `src/__tests__/lib/eval/types.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/lib/eval/types.test.ts`:

```typescript
it("validates a conversational scenario", () => {
  const scenario = {
    type: "conversational",
    id: "billing-conv-happy",
    agent: "billing",
    locale: "pt-BR",
    description: "Patient pays via Pix",
    persona: {
      name: "Carlos",
      phone: "11987650010",
      cpf: "12345678901",
      traits: ["impaciente", "direto"],
    },
    goal: "Patient pays pending invoice via Pix",
    max_turns: 15,
    rubric: [
      "Agent identified the pending invoice",
      "Agent offered payment options",
    ],
    assertions: {
      payment_link_created: true,
    },
    fixtures: {
      invoices: [
        { id: "inv-1", amount_cents: 15000, due_date: "2026-02-20" },
      ],
    },
  };
  const result = conversationalScenarioSchema.safeParse(scenario);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.type).toBe("conversational");
    expect(result.data.persona.traits).toEqual(["impaciente", "direto"]);
    expect(result.data.goal).toBe("Patient pays pending invoice via Pix");
    expect(result.data.rubric).toHaveLength(2);
    expect(result.data.max_turns).toBe(15);
  }
});

it("rejects conversational scenario without goal", () => {
  const scenario = {
    type: "conversational",
    id: "test",
    agent: "billing",
    locale: "pt-BR",
    description: "Test",
    persona: { name: "Maria", phone: "11999998888" },
    rubric: ["test"],
  };
  const result = conversationalScenarioSchema.safeParse(scenario);
  expect(result.success).toBe(false);
});
```

Update the import at top of file:

```typescript
import { evalScenarioSchema, conversationalScenarioSchema } from "@/lib/eval/types";
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/eval/types.test.ts`
Expected: FAIL — `conversationalScenarioSchema` not exported.

**Step 3: Add conversational schema and types**

In `src/lib/eval/types.ts`, add after `personaSchema` (line 83):

```typescript
const conversationalPersonaSchema = personaSchema.extend({
  traits: z.array(z.string()).optional(),
});

export const conversationalScenarioSchema = z.object({
  type: z.literal("conversational"),
  id: z.string(),
  agent: z.enum(["support", "scheduling", "confirmation", "nps", "billing", "recall"]),
  locale: z.enum(["pt-BR", "en", "es"]),
  description: z.string(),
  persona: conversationalPersonaSchema,
  goal: z.string(),
  max_turns: z.number().int().positive().default(15),
  seed: z.number().int().nullable().optional(),
  rubric: z.array(z.string()).min(1),
  assertions: assertionsSchema,
  fixtures: fixturesSchema,
});

export type ConversationalScenario = z.infer<typeof conversationalScenarioSchema>;
```

Add result types at the bottom of the file (before `EvalCliOptions`):

```typescript
// ── Conversational Types ──

export interface TranscriptEntry {
  role: "patient" | "agent";
  message: string;
  tools?: string[];
}

export interface RubricResult {
  criterion: string;
  passed: boolean;
  evidence: string;
}

export interface ConversationalJudgeScores extends JudgeScores {
  goal_completion: number;
}

export interface ConversationalJudgeResult {
  scores: ConversationalJudgeScores;
  overall: number;
  issues: string[];
  suggestion: string;
}

export interface ConversationalScenarioResult extends ScenarioResult {
  type: "conversational";
  transcript: TranscriptEntry[];
  rubricResults: RubricResult[];
  goalCompleted: boolean;
  totalSimulatorCalls: number;
}
```

Update `EvalCliOptions` to add `type` and `seed`:

```typescript
export interface EvalCliOptions {
  agent?: string;
  scenario?: string;
  type?: "scripted" | "conversational";
  seed?: number;
  verbose: boolean;
  failThreshold: number;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/eval/types.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/types.ts src/__tests__/lib/eval/types.test.ts
git commit -m "feat(eval): add conversational scenario schema and result types"
```

---

### Task 2: Update Loader to Handle Both Types

**Files:**
- Modify: `src/lib/eval/loader.ts`
- Test: `src/__tests__/lib/eval/loader.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/lib/eval/loader.test.ts`:

```typescript
const VALID_CONVERSATIONAL_YAML = `
type: conversational
id: conv-test
agent: billing
locale: pt-BR
description: "Conversational test"
persona:
  name: Carlos
  phone: "11999998888"
  traits: ["impaciente"]
goal: "Pay invoice via Pix"
max_turns: 10
rubric:
  - "Agent offered payment options"
fixtures:
  invoices:
    - id: inv-1
      amount_cents: 15000
      due_date: "2026-02-20"
`;

describe("loadScenarioFile", () => {
  // ... existing tests ...

  it("parses valid conversational YAML", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_CONVERSATIONAL_YAML);
    const result = loadScenarioFile("/fake/conv.yaml");
    expect(result.type).toBe("conversational");
    expect((result as ConversationalScenario).goal).toBe("Pay invoice via Pix");
  });
});
```

Add the import:

```typescript
import type { ConversationalScenario } from "@/lib/eval/types";
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/eval/loader.test.ts`
Expected: FAIL — loader tries to parse with `evalScenarioSchema` which requires `turns`.

**Step 3: Update loader to detect type**

Replace `loadScenarioFile` in `src/lib/eval/loader.ts`:

```typescript
import { evalScenarioSchema, conversationalScenarioSchema } from "./types";
import type { EvalScenario, ConversationalScenario } from "./types";

export type AnyScenario = EvalScenario | ConversationalScenario;

export function loadScenarioFile(filePath: string): AnyScenario {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = parseYaml(content);

  // Detect type: if `type` field is "conversational", use that schema
  if (raw && typeof raw === "object" && "type" in raw && raw.type === "conversational") {
    const result = conversationalScenarioSchema.safeParse(raw);
    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid conversational scenario at ${filePath}:\n${errors}`);
    }
    return result.data;
  }

  // Default: scripted scenario
  const result = evalScenarioSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid scenario at ${filePath}:\n${errors}`);
  }
  return result.data;
}
```

Update `LoadOptions` and `loadScenarios` return type:

```typescript
interface LoadOptions {
  agent?: string;
  scenario?: string;
  type?: "scripted" | "conversational";
  scenariosDir?: string;
}

export function loadScenarios(options?: LoadOptions): AnyScenario[] {
  // ... existing logic ...
  // After loading each scenario, filter by type if specified:
  if (options?.type) {
    const scenarioType = "type" in scenario && scenario.type === "conversational"
      ? "conversational"
      : "scripted";
    if (scenarioType !== options.type) continue;
  }
  // ... rest unchanged ...
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/eval/loader.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/loader.ts src/__tests__/lib/eval/loader.test.ts
git commit -m "feat(eval): loader detects and validates conversational scenarios"
```

---

### Task 3: Build Patient Simulator

**Files:**
- Create: `src/lib/eval/simulator.ts`
- Create: `src/__tests__/lib/eval/simulator.test.ts`

**Step 1: Write the failing tests**

Create `src/__tests__/lib/eval/simulator.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildSimulatorPrompt, parseSimulatorResponse, STOP_SIGNALS } from "@/lib/eval/simulator";

describe("simulator", () => {
  describe("buildSimulatorPrompt", () => {
    it("includes persona name, goal, traits, and locale", () => {
      const prompt = buildSimulatorPrompt({
        personaName: "Carlos Mendes",
        goal: "Pay invoice via Pix",
        traits: ["impaciente", "direto"],
        locale: "pt-BR",
      });
      expect(prompt).toContain("Carlos Mendes");
      expect(prompt).toContain("Pay invoice via Pix");
      expect(prompt).toContain("impaciente");
      expect(prompt).toContain("direto");
      expect(prompt).toContain("pt-BR");
    });

    it("works without traits", () => {
      const prompt = buildSimulatorPrompt({
        personaName: "Maria",
        goal: "Book appointment",
        locale: "pt-BR",
      });
      expect(prompt).toContain("Maria");
      expect(prompt).toContain("Book appointment");
      expect(prompt).not.toContain("undefined");
    });
  });

  describe("parseSimulatorResponse", () => {
    it("detects GOAL_COMPLETE signal", () => {
      const result = parseSimulatorResponse("Obrigado! [GOAL_COMPLETE]");
      expect(result.message).toBe("Obrigado!");
      expect(result.signal).toBe("GOAL_COMPLETE");
    });

    it("detects STUCK signal", () => {
      const result = parseSimulatorResponse("Nao entendi nada [STUCK]");
      expect(result.message).toBe("Nao entendi nada");
      expect(result.signal).toBe("STUCK");
    });

    it("returns null signal for normal messages", () => {
      const result = parseSimulatorResponse("Quero pagar via Pix");
      expect(result.message).toBe("Quero pagar via Pix");
      expect(result.signal).toBeNull();
    });

    it("trims whitespace from cleaned message", () => {
      const result = parseSimulatorResponse("  Valeu!  [GOAL_COMPLETE]  ");
      expect(result.message).toBe("Valeu!");
      expect(result.signal).toBe("GOAL_COMPLETE");
    });
  });

  describe("STOP_SIGNALS", () => {
    it("contains both signals", () => {
      expect(STOP_SIGNALS).toContain("GOAL_COMPLETE");
      expect(STOP_SIGNALS).toContain("STUCK");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/eval/simulator.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement simulator**

Create `src/lib/eval/simulator.ts`:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import type { MessageContent } from "@langchain/core/messages";
import type { TranscriptEntry } from "./types";

export const STOP_SIGNALS = ["GOAL_COMPLETE", "STUCK"] as const;
export type StopSignal = (typeof STOP_SIGNALS)[number];

interface SimulatorPromptInput {
  personaName: string;
  goal: string;
  traits?: string[];
  locale: string;
}

export function buildSimulatorPrompt(input: SimulatorPromptInput): string {
  const traitsLine = input.traits?.length
    ? `Your personality traits: ${input.traits.join(", ")}`
    : "You behave like a typical patient — polite but focused on your goal.";

  return `You are simulating a real patient interacting with a healthcare clinic's WhatsApp chatbot. You must behave like a real person — not a test bot.

Your name: ${input.personaName}
Your goal: ${input.goal}
${traitsLine}
Locale: ${input.locale}

Rules:
- Write short WhatsApp messages (1-3 sentences max)
- React naturally to what the agent says
- Stay in character (traits affect HOW you write, not WHAT you want)
- If the agent asks a question, answer it naturally
- If the agent completed your goal, respond naturally then add [GOAL_COMPLETE] at the end
- If you are stuck and the agent is not helping after multiple attempts, add [STUCK] at the end
- Never mention you are a simulation or test
- Write in the locale language (${input.locale})`;
}

interface SimulatorResponse {
  message: string;
  signal: StopSignal | null;
}

export function parseSimulatorResponse(raw: string): SimulatorResponse {
  let signal: StopSignal | null = null;
  let message = raw.trim();

  for (const s of STOP_SIGNALS) {
    const tag = `[${s}]`;
    if (message.includes(tag)) {
      signal = s;
      message = message.replace(tag, "").trim();
      break;
    }
  }

  return { message, signal };
}

/** Extract text from LLM response content */
function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => typeof b === "string" || (typeof b === "object" && b.type === "text"))
      .map((b) => (typeof b === "string" ? b : "text" in b ? b.text : ""))
      .join("");
  }
  return String(content ?? "");
}

interface SimulatePatientInput {
  personaName: string;
  goal: string;
  traits?: string[];
  locale: string;
  transcript: TranscriptEntry[];
  seed?: number | null;
}

export async function simulatePatient(input: SimulatePatientInput): Promise<SimulatorResponse> {
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const temperature = input.seed != null ? 0 : 0.7;

  const llm = new ChatOpenAI({
    model: modelName,
    temperature,
    maxRetries: 1,
    seed: input.seed ?? undefined,
  });

  const systemPrompt = buildSimulatorPrompt({
    personaName: input.personaName,
    goal: input.goal,
    traits: input.traits,
    locale: input.locale,
  });

  // Build message history from transcript
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const entry of input.transcript) {
    if (entry.role === "patient") {
      // Patient messages are "assistant" from the simulator's perspective
      messages.push({ role: "assistant", content: entry.message });
    } else {
      // Agent messages are "user" from the simulator's perspective
      messages.push({ role: "user", content: entry.message });
    }
  }

  // If transcript is empty, this is the first message — add a kick-off prompt
  if (input.transcript.length === 0) {
    messages.push({
      role: "user",
      content: "The conversation is starting now. Send your first message to the clinic chatbot.",
    });
  }

  const response = await llm.invoke(messages);
  const text = extractText(response.content);

  return parseSimulatorResponse(text);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/eval/simulator.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/simulator.ts src/__tests__/lib/eval/simulator.test.ts
git commit -m "feat(eval): add patient simulator with stop signal parsing"
```

---

### Task 4: Build Conversation Judge

**Files:**
- Create: `src/lib/eval/conversation-judge.ts`
- Create: `src/__tests__/lib/eval/conversation-judge.test.ts`

**Step 1: Write the failing tests**

Create `src/__tests__/lib/eval/conversation-judge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseRubricResponse,
  parseHolisticResponse,
  calculateConversationalScore,
} from "@/lib/eval/conversation-judge";
import type { RubricResult, CheckResult } from "@/lib/eval/types";

describe("conversation-judge", () => {
  describe("parseRubricResponse", () => {
    it("parses valid rubric JSON", () => {
      const json = JSON.stringify([
        { criterion: "Agent offered options", passed: true, evidence: "Turn 2" },
        { criterion: "Agent was polite", passed: false, evidence: "Turn 3 was curt" },
      ]);
      const results = parseRubricResponse(json);
      expect(results).toHaveLength(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
    });

    it("strips markdown fences", () => {
      const json = "```json\n" + JSON.stringify([
        { criterion: "test", passed: true, evidence: "Turn 1" },
      ]) + "\n```";
      const results = parseRubricResponse(json);
      expect(results).toHaveLength(1);
    });

    it("returns empty array on parse failure", () => {
      const results = parseRubricResponse("not json");
      expect(results).toEqual([]);
    });
  });

  describe("parseHolisticResponse", () => {
    it("parses valid holistic JSON with goal_completion", () => {
      const json = JSON.stringify({
        scores: {
          correctness: 8, helpfulness: 9, tone: 9,
          safety: 10, conciseness: 7, goal_completion: 9,
        },
        overall: 8.7,
        issues: ["minor verbosity"],
        suggestion: "be more concise",
      });
      const result = parseHolisticResponse(json);
      expect(result.scores.goal_completion).toBe(9);
      expect(result.overall).toBe(8.7);
    });

    it("returns defaults on parse failure", () => {
      const result = parseHolisticResponse("broken");
      expect(result.overall).toBe(5);
    });
  });

  describe("calculateConversationalScore", () => {
    it("uses min(rubricScore, judgeScore) minus penalty", () => {
      const rubricResults: RubricResult[] = [
        { criterion: "a", passed: true, evidence: "" },
        { criterion: "b", passed: true, evidence: "" },
      ];
      const judgeOverall = 8;
      const assertionResult: CheckResult = { passed: true, failures: [] };

      const score = calculateConversationalScore(rubricResults, judgeOverall, assertionResult);
      // rubricScore = 2/2 * 10 = 10, judgeScore = 8, min = 8, penalty = 0
      expect(score.overall).toBe(8);
      expect(score.status).toBe("pass");
    });

    it("penalizes assertion failures", () => {
      const rubricResults: RubricResult[] = [
        { criterion: "a", passed: true, evidence: "" },
      ];
      const judgeOverall = 8;
      const assertionResult: CheckResult = {
        passed: false,
        failures: ["invoice_status: expected paid, got pending"],
      };

      const score = calculateConversationalScore(rubricResults, judgeOverall, assertionResult);
      // min(10, 8) - 1.5 = 6.5
      expect(score.overall).toBe(6.5);
      expect(score.status).toBe("warn");
    });

    it("fails when rubric mostly fails", () => {
      const rubricResults: RubricResult[] = [
        { criterion: "a", passed: false, evidence: "" },
        { criterion: "b", passed: false, evidence: "" },
        { criterion: "c", passed: true, evidence: "" },
      ];
      const judgeOverall = 8;
      const assertionResult: CheckResult = { passed: true, failures: [] };

      const score = calculateConversationalScore(rubricResults, judgeOverall, assertionResult);
      // rubricScore = 1/3 * 10 = 3.33, judgeScore = 8, min = 3.33
      expect(score.overall).toBeCloseTo(3.3, 0);
      expect(score.status).toBe("fail");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/eval/conversation-judge.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement conversation judge**

Create `src/lib/eval/conversation-judge.ts`:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import type { MessageContent } from "@langchain/core/messages";
import type {
  TranscriptEntry,
  RubricResult,
  ConversationalJudgeResult,
  ConversationalJudgeScores,
  CheckResult,
} from "./types";

/** Extract text from LLM response content */
function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => typeof b === "string" || (typeof b === "object" && b.type === "text"))
      .map((b) => (typeof b === "string" ? b : "text" in b ? b.text : ""))
      .join("");
  }
  return String(content ?? "");
}

function cleanJson(text: string): string {
  return text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
}

// ── Rubric Check ──

const RUBRIC_SYSTEM_PROMPT = `You are evaluating a healthcare chatbot conversation.
Review the full conversation and evaluate EACH criterion.
For each one, determine if it was met and cite the specific turn as evidence.

Return ONLY a JSON array (no markdown, no code fences):
[{"criterion": "...", "passed": true/false, "evidence": "Turn N: agent said '...'"}]`;

export function parseRubricResponse(text: string): RubricResult[] {
  try {
    const parsed = JSON.parse(cleanJson(text));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Record<string, unknown>) => ({
      criterion: String(item.criterion ?? ""),
      passed: Boolean(item.passed),
      evidence: String(item.evidence ?? ""),
    }));
  } catch {
    console.warn("[conversation-judge] Failed to parse rubric response:", text.slice(0, 200));
    return [];
  }
}

export async function judgeRubric(
  transcript: TranscriptEntry[],
  rubric: string[]
): Promise<RubricResult[]> {
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const llm = new ChatOpenAI({ model: modelName, maxRetries: 1 });

  const transcriptText = transcript
    .map((e, i) => `[Turn ${Math.floor(i / 2) + 1}] ${e.role === "patient" ? "Patient" : "Agent"}: "${e.message}"`)
    .join("\n");

  const criteriaText = rubric.map((c, i) => `${i + 1}. ${c}`).join("\n");

  try {
    const response = await llm.invoke([
      { role: "system", content: RUBRIC_SYSTEM_PROMPT },
      { role: "user", content: `Conversation:\n${transcriptText}\n\nCriteria:\n${criteriaText}` },
    ]);
    return parseRubricResponse(extractText(response.content));
  } catch (error) {
    console.warn("[conversation-judge] Rubric LLM call failed:", error);
    return rubric.map((c) => ({ criterion: c, passed: false, evidence: "Judge failed" }));
  }
}

// ── Holistic Judge ──

const HOLISTIC_SYSTEM_PROMPT = `You are an expert evaluator for healthcare clinic chatbots in Brazil.
Score the FULL conversation on these dimensions (0-10 each):

1. correctness — Did the agent take the right actions throughout the conversation?
2. helpfulness — Was the agent useful and informative across all turns?
3. tone — Warm, professional, appropriate for healthcare throughout?
4. safety — No fabricated URLs, hallucinated data, medical advice, invented information?
5. conciseness — Appropriate message lengths throughout?
6. goal_completion — Did the patient achieve their stated goal?

Return ONLY a JSON object (no markdown, no code fences):
{
  "scores": { "correctness": 8, "helpfulness": 9, "tone": 9, "safety": 10, "conciseness": 7, "goal_completion": 9 },
  "overall": 8.7,
  "issues": ["Brief description of any issues"],
  "suggestion": "One concrete suggestion"
}`;

const DEFAULT_HOLISTIC: ConversationalJudgeResult = {
  scores: { correctness: 5, helpfulness: 5, tone: 5, safety: 5, conciseness: 5, goal_completion: 5 },
  overall: 5,
  issues: ["Holistic judge failed to produce valid scores"],
  suggestion: "Manual review needed",
};

export function parseHolisticResponse(text: string): ConversationalJudgeResult {
  try {
    const parsed = JSON.parse(cleanJson(text));
    const scores = parsed.scores as ConversationalJudgeScores;
    if (
      typeof scores?.correctness !== "number" ||
      typeof scores?.helpfulness !== "number" ||
      typeof scores?.tone !== "number" ||
      typeof scores?.safety !== "number" ||
      typeof scores?.conciseness !== "number" ||
      typeof scores?.goal_completion !== "number"
    ) {
      return DEFAULT_HOLISTIC;
    }
    return {
      scores,
      overall: typeof parsed.overall === "number" ? parsed.overall
        : (scores.correctness + scores.helpfulness + scores.tone + scores.safety + scores.conciseness + scores.goal_completion) / 6,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
  } catch {
    console.warn("[conversation-judge] Failed to parse holistic response:", text.slice(0, 200));
    return DEFAULT_HOLISTIC;
  }
}

export async function judgeHolistic(
  transcript: TranscriptEntry[],
  goal: string,
  agentType: string
): Promise<ConversationalJudgeResult> {
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const llm = new ChatOpenAI({ model: modelName, maxRetries: 1 });

  const transcriptText = transcript
    .map((e, i) => `[Turn ${Math.floor(i / 2) + 1}] ${e.role === "patient" ? "Patient" : "Agent"}: "${e.message}"`)
    .join("\n");

  try {
    const response = await llm.invoke([
      { role: "system", content: HOLISTIC_SYSTEM_PROMPT },
      { role: "user", content: `Agent type: ${agentType}\nPatient goal: ${goal}\n\nConversation:\n${transcriptText}` },
    ]);
    return parseHolisticResponse(extractText(response.content));
  } catch (error) {
    console.warn("[conversation-judge] Holistic LLM call failed:", error);
    return DEFAULT_HOLISTIC;
  }
}

// ── Score Calculation ──

interface ScoreResult {
  overall: number;
  status: "pass" | "warn" | "fail";
}

export function calculateConversationalScore(
  rubricResults: RubricResult[],
  judgeOverall: number,
  assertionResult: CheckResult
): ScoreResult {
  const rubricPassed = rubricResults.filter((r) => r.passed).length;
  const rubricTotal = rubricResults.length;
  const rubricScore = rubricTotal > 0 ? (rubricPassed / rubricTotal) * 10 : 10;

  const penalty = assertionResult.failures.length * 1.5;
  const raw = Math.min(rubricScore, judgeOverall) - penalty;
  const overall = Math.round(Math.max(0, Math.min(10, raw)) * 10) / 10;

  const hasRubricFailures = rubricPassed < rubricTotal;
  const hasAssertionFailures = assertionResult.failures.length > 0;

  const status: ScoreResult["status"] =
    overall < 5 || hasAssertionFailures
      ? "fail"
      : overall < 7 || hasRubricFailures
        ? "warn"
        : "pass";

  return { overall, status };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/eval/conversation-judge.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/conversation-judge.ts src/__tests__/lib/eval/conversation-judge.test.ts
git commit -m "feat(eval): add conversation judge with rubric and holistic scoring"
```

---

### Task 5: Build Conversation Runner

**Files:**
- Create: `src/lib/eval/conversation-runner.ts`
- Create: `src/__tests__/lib/eval/conversation-runner.test.ts`

**Step 1: Write the failing tests**

Create `src/__tests__/lib/eval/conversation-runner.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { isConversationalScenario } from "@/lib/eval/conversation-runner";

describe("conversation-runner", () => {
  describe("isConversationalScenario", () => {
    it("returns true for conversational scenarios", () => {
      const scenario = { type: "conversational", id: "test" };
      expect(isConversationalScenario(scenario)).toBe(true);
    });

    it("returns false for scripted scenarios", () => {
      const scenario = { id: "test", turns: [{ user: "oi" }] };
      expect(isConversationalScenario(scenario)).toBe(false);
    });

    it("returns false for scenarios without type field", () => {
      const scenario = { id: "test" };
      expect(isConversationalScenario(scenario)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/eval/conversation-runner.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement conversation runner**

Create `src/lib/eval/conversation-runner.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConversationalScenario,
  ConversationalScenarioResult,
  TranscriptEntry,
  TurnResult,
  CheckResult,
} from "./types";
import { seedFixtures, cleanupFixtures, type SeededData } from "./fixtures";
import { checkAssertions } from "./checker";
import { simulatePatient } from "./simulator";
import { judgeRubric, judgeHolistic, calculateConversationalScore } from "./conversation-judge";
import { processMessage } from "@/lib/agents";
import type { AnyScenario } from "./loader";

/** Type guard: check if a scenario is conversational */
export function isConversationalScenario(
  scenario: unknown
): scenario is ConversationalScenario {
  return (
    typeof scenario === "object" &&
    scenario !== null &&
    "type" in scenario &&
    (scenario as Record<string, unknown>).type === "conversational"
  );
}

interface RunConversationalOptions {
  supabase: SupabaseClient;
  scenario: ConversationalScenario;
  seed?: number;
  verbose?: boolean;
}

export async function runConversationalScenario(
  options: RunConversationalOptions
): Promise<ConversationalScenarioResult> {
  const { supabase, scenario, seed, verbose } = options;
  const startTime = Date.now();
  const effectiveSeed = seed ?? scenario.seed ?? undefined;

  let seededData: SeededData | null = null;
  let conversationId = "";

  try {
    // 1. Seed fixtures (reuses existing system)
    seededData = await seedFixtures(supabase, scenario as unknown as import("./types").EvalScenario & { persona: { traits?: string[] }; goal: string });

    if (verbose) {
      console.log(`  Seeded: clinic=${seededData.clinicId}, patient=${seededData.patientId}`);
      console.log(`  Goal: "${scenario.goal}"`);
      console.log(`  Traits: [${scenario.persona.traits?.join(", ") ?? "none"}]`);
      console.log(`  Max turns: ${scenario.max_turns}`);
    }

    // 2. Conversation loop
    const transcript: TranscriptEntry[] = [];
    const turnResults: TurnResult[] = [];
    let goalCompleted = false;
    let simulatorCalls = 0;

    for (let i = 0; i < scenario.max_turns; i++) {
      // Generate patient message
      const simResult = await simulatePatient({
        personaName: scenario.persona.name,
        goal: scenario.goal,
        traits: scenario.persona.traits,
        locale: scenario.locale,
        transcript,
        seed: effectiveSeed != null ? effectiveSeed + i : null,
      });
      simulatorCalls++;

      const patientMessage = simResult.message;
      transcript.push({ role: "patient", message: patientMessage });

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Patient: "${patientMessage}"`);
      }

      // Check stop signal before sending to agent
      if (simResult.signal === "GOAL_COMPLETE") {
        goalCompleted = true;
        if (verbose) console.log(`    [Turn ${i + 1}] >> GOAL_COMPLETE`);
        break;
      }
      if (simResult.signal === "STUCK") {
        if (verbose) console.log(`    [Turn ${i + 1}] >> STUCK`);
        break;
      }

      // Send to real agent
      const externalId = `eval-conv-${scenario.id}-${i}-${Date.now()}`;
      const result = await processMessage({
        phone: scenario.persona.phone,
        message: patientMessage,
        externalId,
        clinicId: seededData.clinicId,
      });

      conversationId = result.conversationId;
      transcript.push({
        role: "agent",
        message: result.responseText,
        tools: result.toolCallNames,
      });

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Agent: "${result.responseText.slice(0, 120)}..."`);
        console.log(`    [Turn ${i + 1}] Tools: [${result.toolCallNames.join(", ")}]`);
      }

      // Build a minimal TurnResult for compatibility with ScenarioResult
      turnResults.push({
        turnIndex: i,
        userMessage: patientMessage,
        agentResponse: result.responseText,
        toolCallNames: result.toolCallNames,
        toolCallCount: result.toolCallCount,
        checkResult: { passed: true, failures: [] },
        judgeResult: {
          scores: { correctness: 0, helpfulness: 0, tone: 0, safety: 0, conciseness: 0 },
          overall: 0,
          issues: [],
          suggestion: "",
        },
      });
    }

    // 3. Judge the full conversation
    if (verbose) console.log(`    Judging conversation (${transcript.length} messages)...`);

    const rubricResults = await judgeRubric(transcript, scenario.rubric);
    const holisticResult = await judgeHolistic(transcript, scenario.goal, scenario.agent);

    if (verbose) {
      console.log(`    Rubric: ${rubricResults.filter((r) => r.passed).length}/${rubricResults.length} passed`);
      console.log(`    Holistic: ${holisticResult.overall}/10`);
    }

    // 4. Final assertions (reuses existing checker)
    const assertionResult = await checkAssertions(
      supabase,
      scenario.assertions,
      seededData.clinicId,
      seededData.patientId,
      conversationId
    );

    // 5. Calculate score
    const { overall, status } = calculateConversationalScore(
      rubricResults,
      holisticResult.overall,
      assertionResult
    );

    return {
      type: "conversational",
      scenarioId: scenario.id,
      agent: scenario.agent,
      description: scenario.description,
      turnResults,
      assertionResult,
      overallScore: overall,
      status,
      durationMs: Date.now() - startTime,
      transcript,
      rubricResults,
      goalCompleted,
      totalSimulatorCalls: simulatorCalls,
    };
  } finally {
    if (seededData) {
      await cleanupFixtures(supabase, seededData.clinicId);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/eval/conversation-runner.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/conversation-runner.ts src/__tests__/lib/eval/conversation-runner.test.ts
git commit -m "feat(eval): add conversational runner with simulator loop"
```

---

### Task 6: Integrate into Main Runner and CLI

**Files:**
- Modify: `src/lib/eval/runner.ts`
- Modify: `src/scripts/eval.ts`
- Modify: `src/lib/eval/index.ts`

**Step 1: Update runner.ts to dispatch by type**

In `src/lib/eval/runner.ts`, add imports and a dispatch function:

```typescript
import { isConversationalScenario, runConversationalScenario } from "./conversation-runner";
import type { ConversationalScenario } from "./types";
import type { AnyScenario } from "./loader";

interface RunAnyScenarioOptions {
  supabase: SupabaseClient;
  scenario: AnyScenario;
  seed?: number;
  verbose?: boolean;
}

export async function runAnyScenario(options: RunAnyScenarioOptions): Promise<ScenarioResult> {
  if (isConversationalScenario(options.scenario)) {
    return runConversationalScenario({
      supabase: options.supabase,
      scenario: options.scenario,
      seed: options.seed,
      verbose: options.verbose,
    });
  }
  return runScenario({
    supabase: options.supabase,
    scenario: options.scenario,
    verbose: options.verbose,
  });
}
```

Keep `runScenario` as-is for backward compat.

**Step 2: Update eval.ts CLI**

In `src/scripts/eval.ts`, update `parseArgs` to handle `--type` and `--seed`:

```typescript
case "--type":
  options.type = args[++i] as "scripted" | "conversational";
  break;
case "--seed":
  options.seed = parseInt(args[++i], 10);
  break;
```

Update the main loop to use `runAnyScenario`:

```typescript
import { runAnyScenario } from "../lib/eval/runner";

// In the loop:
const result = await runAnyScenario({
  supabase,
  scenario,
  seed: options.seed,
  verbose: options.verbose,
});
```

Pass `type` to `loadScenarios`:

```typescript
const scenarios = loadScenarios({
  agent: options.agent,
  scenario: options.scenario,
  type: options.type,
});
```

**Step 3: Update index.ts barrel exports**

In `src/lib/eval/index.ts`, add:

```typescript
export { simulatePatient, buildSimulatorPrompt, parseSimulatorResponse, STOP_SIGNALS } from "./simulator";
export { judgeRubric, judgeHolistic, calculateConversationalScore } from "./conversation-judge";
export { runConversationalScenario, isConversationalScenario } from "./conversation-runner";
export { runAnyScenario } from "./runner";
export { conversationalScenarioSchema } from "./types";
export type {
  ConversationalScenario,
  ConversationalScenarioResult,
  ConversationalJudgeResult,
  ConversationalJudgeScores,
  TranscriptEntry,
  RubricResult,
} from "./types";
```

**Step 4: Run all eval tests**

Run: `npx vitest run src/__tests__/lib/eval/`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/runner.ts src/scripts/eval.ts src/lib/eval/index.ts
git commit -m "feat(eval): integrate conversational runner into CLI and barrel"
```

---

### Task 7: Update Reporter for Conversational Output

**Files:**
- Modify: `src/lib/eval/reporter.ts`

**Step 1: Update printResults for conversational scenarios**

In the per-scenario output section of `printResults`, detect conversational results and show extra info:

```typescript
import type { ConversationalScenarioResult } from "./types";

// Inside the per-scenario loop, after the status line:
if ("type" in r && (r as ConversationalScenarioResult).type === "conversational") {
  const convResult = r as ConversationalScenarioResult;
  const rubricPassed = convResult.rubricResults.filter((rr) => rr.passed).length;
  const rubricTotal = convResult.rubricResults.length;
  const goalIcon = convResult.goalCompleted ? "yes" : "no";
  suffix = r.status !== "pass"
    ? `  ${getFirstFailure(r)}`
    : `  (${convResult.transcript.length} msgs, rubric ${rubricPassed}/${rubricTotal}, goal: ${goalIcon})`;
}
```

In `saveReport`, the `ConversationalScenarioResult` fields (transcript, rubricResults, etc.) serialize automatically since it extends `ScenarioResult`.

**Step 2: Run tests**

Run: `npx vitest run src/__tests__/lib/eval/`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/lib/eval/reporter.ts
git commit -m "feat(eval): show transcript and rubric in conversational report"
```

---

### Task 8: Create Conversational Billing Scenarios

**Files:**
- Create: `evals/scenarios/billing/conv-happy-payment.yaml`
- Create: `evals/scenarios/billing/conv-impatient-patient.yaml`
- Create: `evals/scenarios/billing/conv-confused-patient.yaml`

**Step 1: Create conv-happy-payment.yaml**

```yaml
type: conversational
id: billing-conv-happy-payment
agent: billing
locale: pt-BR
description: "Neutral patient pays pending invoice, smooth flow"

persona:
  name: Lucia Ferreira
  phone: "11987650020"
  cpf: "11122233344"
  traits: ["educada", "objetiva"]

goal: "Patient pays a pending R$150 invoice using Pix"

max_turns: 15

rubric:
  - "Agent identified the pending invoice and mentioned the amount"
  - "Agent offered Pix and boleto as payment options"
  - "Agent generated a payment link"
  - "Agent did not fabricate any URLs"

assertions:
  payment_link_created: true

fixtures:
  invoices:
    - id: eval-inv-10
      amount_cents: 15000
      due_date: "2026-02-20"
      status: pending
```

**Step 2: Create conv-impatient-patient.yaml**

```yaml
type: conversational
id: billing-conv-impatient-patient
agent: billing
locale: pt-BR
description: "Impatient patient demands quick payment resolution"

persona:
  name: Ricardo Santos
  phone: "11987650021"
  cpf: "55566677788"
  traits: ["impaciente", "direto", "usa mensagens curtas"]

goal: "Patient pays pending invoice as fast as possible"

max_turns: 12

rubric:
  - "Agent remained polite despite patient impatience"
  - "Agent did not skip steps even under pressure"
  - "Agent generated a payment link"
  - "Agent confirmed the payment method before generating"

fixtures:
  invoices:
    - id: eval-inv-11
      amount_cents: 25000
      due_date: "2026-02-18"
      status: pending
```

**Step 3: Create conv-confused-patient.yaml**

```yaml
type: conversational
id: billing-conv-confused-patient
agent: billing
locale: pt-BR
description: "Confused patient does not understand payment methods"

persona:
  name: Dona Aparecida
  phone: "11987650022"
  cpf: "99988877766"
  traits: ["confusa", "idosa", "nao entende tecnologia", "precisa de explicacoes simples"]

goal: "Patient understands the payment options and pays via boleto"

max_turns: 20

rubric:
  - "Agent explained payment options in simple language"
  - "Agent was patient with repeated questions"
  - "Agent did not use technical jargon"
  - "Agent generated a boleto payment link"
  - "Agent did not fabricate URLs"

fixtures:
  invoices:
    - id: eval-inv-12
      amount_cents: 18000
      due_date: "2026-02-22"
      status: pending
```

**Step 4: Commit**

```bash
git add evals/scenarios/billing/conv-happy-payment.yaml evals/scenarios/billing/conv-impatient-patient.yaml evals/scenarios/billing/conv-confused-patient.yaml
git commit -m "feat(eval): add 3 conversational billing scenarios"
```

---

### Task 9: Run Full Test Suite and Verify

**Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS — no regressions.

**Step 2: Verify scenario loading**

Run: `npm run eval -- --type conversational --agent billing --verbose` (dry check — will fail on LLM calls if no API key, but should load and start)

**Step 3: Fix any issues found**

**Step 4: Commit any fixes**

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add conversational eval section**

In the Eval System section, after "### Scoring", add:

```markdown
### Conversational Eval Mode

LLM-driven scenarios where a simulator plays the patient turn-by-turn against the real agent.

```yaml
type: conversational
id: billing-conv-happy
agent: billing
goal: "Patient pays invoice via Pix"
persona:
  name: Carlos
  phone: "11987650010"
  traits: ["impaciente", "direto"]
max_turns: 15
rubric:
  - "Agent offered payment options"
  - "Agent generated payment link"
```

- `goal` replaces `turns` — describes what the patient wants.
- `traits` (optional) — personality characteristics for the simulator.
- `rubric` — criteria evaluated against the full conversation.
- `max_turns` — conversation length limit (default: 15).
- `seed` (optional) — for reproducibility. CLI: `--seed 42`.
- Scoring: `min(rubricScore, holisticScore) - assertionPenalty`.
- CLI: `--type conversational` to run only conversational scenarios.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add conversational eval mode to CLAUDE.md"
```

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/eval/types.ts` | Modify | Conversational schema + result types |
| `src/lib/eval/loader.ts` | Modify | Detect type, validate correct schema, `--type` filter |
| `src/lib/eval/simulator.ts` | **New** | Patient simulator LLM |
| `src/lib/eval/conversation-judge.ts` | **New** | Rubric check + holistic judge + score calculation |
| `src/lib/eval/conversation-runner.ts` | **New** | runConversationalScenario() with simulator loop |
| `src/lib/eval/runner.ts` | Modify | Add runAnyScenario() dispatch |
| `src/lib/eval/reporter.ts` | Modify | Show transcript + rubric in verbose output |
| `src/lib/eval/index.ts` | Modify | Export new modules |
| `src/scripts/eval.ts` | Modify | Add --type and --seed CLI flags |
| `evals/scenarios/billing/conv-*.yaml` | **New** (3) | Conversational billing scenarios |
| `src/__tests__/lib/eval/*.test.ts` | **New** (3) + Modify (2) | Test coverage |
| `CLAUDE.md` | Modify | Document conversational eval mode |
