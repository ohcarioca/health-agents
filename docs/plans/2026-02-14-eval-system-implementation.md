# Eval System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI-driven eval pipeline that runs YAML scenarios against real agents, scores responses with deterministic checks + LLM judge, and proposes improvements.

**Architecture:** YAML scenario files are loaded and validated with Zod, then a runner calls the real `processMessage()` pipeline for each turn. WhatsApp/Calendar calls fail gracefully (no valid tokens in eval env). A deterministic checker verifies tool calls and content, while an LLM judge scores quality. Results are reported to CLI and saved as JSON.

**Tech Stack:** TypeScript, Zod, yaml (npm), tsx, LangChain/OpenAI, Supabase admin client

---

## Pre-requisites

- Valid `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (real DB access)
- Valid `OPENAI_API_KEY` (real LLM calls)
- WhatsApp/Calendar tokens can be missing or invalid (services fail gracefully)

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install yaml and tsx**

```bash
npm install --save-dev yaml tsx
```

**Step 2: Verify installation**

```bash
node -e "require('yaml')" && echo "yaml OK"
npx tsx --version
```
Expected: No errors, tsx version printed.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add yaml and tsx dev dependencies for eval system"
```

---

### Task 2: Add toolCallNames to engine and process-message results

The eval needs to know WHICH tools were called each turn, not just the count. This is a small, backward-compatible change.

**Files:**
- Modify: `src/lib/agents/types.ts:99-120`
- Modify: `src/lib/agents/engine.ts:47-64`
- Modify: `src/lib/agents/process-message.ts:328-334`
- Test: `src/__tests__/lib/eval/tool-tracking.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/eval/tool-tracking.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { EngineResult, ProcessMessageResult } from "@/lib/agents";

describe("tool call tracking", () => {
  it("EngineResult type includes toolCallNames array", () => {
    const result: EngineResult = {
      responseText: "test",
      toolCallCount: 2,
      toolCallNames: ["check_availability", "book_appointment"],
    };
    expect(result.toolCallNames).toEqual([
      "check_availability",
      "book_appointment",
    ]);
  });

  it("ProcessMessageResult type includes toolCallNames array", () => {
    const result: ProcessMessageResult = {
      conversationId: "conv-1",
      responseText: "test",
      module: "scheduling",
      toolCallCount: 1,
      toolCallNames: ["check_availability"],
      queued: true,
    };
    expect(result.toolCallNames).toEqual(["check_availability"]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/lib/eval/tool-tracking.test.ts
```

Expected: FAIL — `toolCallNames` does not exist on type.

**Step 3: Add toolCallNames to types**

In `src/lib/agents/types.ts`, add `toolCallNames` to both interfaces:

```typescript
// EngineResult — add after toolCallCount
toolCallNames: string[];

// ProcessMessageResult — add after toolCallCount
toolCallNames: string[];
```

**Step 4: Track tool names in engine.ts**

In `src/lib/agents/engine.ts`:

After line 47 (`let toolCallCount = 0;`), add:
```typescript
const toolCallNames: string[] = [];
```

Inside the tool call loop (after `toolCallCount++;`), add:
```typescript
toolCallNames.push(tc.name);
```

In both return statements, add `toolCallNames`:
```typescript
return {
  responseText: text,
  appendToResponse,
  newConversationStatus,
  responseData,
  toolCallCount,
  toolCallNames,
};
```

And in the max-iterations fallback return at the bottom, also add `toolCallNames`.

**Step 5: Propagate in process-message.ts**

In `src/lib/agents/process-message.ts`, update the final return (line ~328):

```typescript
return {
  conversationId,
  responseText: finalResponse,
  module: finalModule,
  toolCallCount: engineResult.toolCallCount,
  toolCallNames: engineResult.toolCallNames,
  queued: sendResult.success,
};
```

**Step 6: Run test to verify it passes**

```bash
npx vitest run src/__tests__/lib/eval/tool-tracking.test.ts
```

Expected: PASS

**Step 7: Run full test suite to check nothing broke**

```bash
npx vitest run
```

Expected: All existing tests pass (they don't check toolCallNames, so backward-compatible).

**Step 8: Commit**

```bash
git add src/lib/agents/types.ts src/lib/agents/engine.ts src/lib/agents/process-message.ts src/__tests__/lib/eval/tool-tracking.test.ts
git commit -m "feat: track tool call names in engine and process-message results"
```

---

### Task 3: Create eval types and Zod schemas

All type definitions and validation schemas for the eval system.

**Files:**
- Create: `src/lib/eval/types.ts`
- Test: `src/__tests__/lib/eval/types.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/eval/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { evalScenarioSchema } from "@/lib/eval/types";

describe("evalScenarioSchema", () => {
  it("validates a minimal valid scenario", () => {
    const scenario = {
      id: "test-scenario",
      agent: "support",
      locale: "pt-BR",
      description: "Test scenario",
      persona: { name: "Maria", phone: "11999998888" },
      turns: [
        {
          user: "Oi",
          expect: {},
        },
      ],
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("validates a full scenario with all fields", () => {
    const scenario = {
      id: "scheduling-happy-path",
      agent: "scheduling",
      locale: "pt-BR",
      description: "Patient books appointment",
      persona: {
        name: "Maria Silva",
        phone: "11987654321",
        notes: "Prefere manha",
      },
      fixtures: {
        professionals: [
          {
            id: "prof-1",
            name: "Dr. Joao",
            specialty: "Cardiologia",
            appointment_duration_minutes: 30,
            schedule_grid: {
              monday: [{ start: "08:00", end: "12:00" }],
            },
          },
        ],
        services: [
          { id: "svc-1", name: "Consulta", duration_minutes: 30 },
        ],
      },
      turns: [
        {
          user: "Quero marcar consulta",
          expect: {
            tools_called: ["check_availability"],
            no_tools: ["book_appointment"],
            response_contains: ["disponivel"],
            response_not_contains: ["https://"],
          },
        },
      ],
      assertions: {
        appointment_created: true,
        confirmation_queue_entries: 3,
        conversation_status: "active",
      },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("rejects scenario without required fields", () => {
    const result = evalScenarioSchema.safeParse({ id: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent type", () => {
    const scenario = {
      id: "test",
      agent: "invalid_agent",
      locale: "pt-BR",
      description: "Test",
      persona: { name: "Maria", phone: "11999998888" },
      turns: [{ user: "Oi", expect: {} }],
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/lib/eval/types.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create the types file**

Create `src/lib/eval/types.ts`:

```typescript
import { z } from "zod";

// ── Scenario Schema ──

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

const fixturesSchema = z.object({
  professionals: z.array(professionalFixtureSchema).optional(),
  services: z.array(serviceFixtureSchema).optional(),
  appointments: z.array(appointmentFixtureSchema).optional(),
  insurance_plans: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
}).optional();

const turnExpectSchema = z.object({
  tools_called: z.array(z.string()).optional(),
  no_tools: z.array(z.string()).optional(),
  response_contains: z.array(z.string()).optional(),
  response_not_contains: z.array(z.string()).optional(),
  response_matches: z.string().optional(),
  status: z.string().optional(),
  tone: z.string().optional(),
}).default({});

const turnSchema = z.object({
  user: z.string(),
  expect: turnExpectSchema,
});

const assertionsSchema = z.object({
  appointment_created: z.boolean().optional(),
  confirmation_queue_entries: z.number().int().optional(),
  conversation_status: z.string().optional(),
  nps_score_recorded: z.boolean().optional(),
}).optional();

const personaSchema = z.object({
  name: z.string(),
  phone: z.string(),
  notes: z.string().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const evalScenarioSchema = z.object({
  id: z.string(),
  agent: z.enum(["support", "scheduling", "confirmation", "nps", "billing"]),
  locale: z.enum(["pt-BR", "en", "es"]),
  description: z.string(),
  persona: personaSchema,
  fixtures: fixturesSchema,
  turns: z.array(turnSchema).min(1),
  assertions: assertionsSchema,
});

export type EvalScenario = z.infer<typeof evalScenarioSchema>;
export type TurnExpect = z.infer<typeof turnExpectSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type Fixtures = z.infer<typeof fixturesSchema>;

// ── Judge Types ──

export interface JudgeScores {
  correctness: number;
  helpfulness: number;
  tone: number;
  safety: number;
  conciseness: number;
}

export interface JudgeResult {
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

// ── Turn Result ──

export interface TurnResult {
  turnIndex: number;
  userMessage: string;
  agentResponse: string;
  toolCallNames: string[];
  toolCallCount: number;
  checkResult: CheckResult;
  judgeResult: JudgeResult;
}

// ── Scenario Result ──

export interface ScenarioResult {
  scenarioId: string;
  agent: string;
  description: string;
  turnResults: TurnResult[];
  assertionResult: CheckResult;
  overallScore: number;
  status: "pass" | "warn" | "fail";
  durationMs: number;
}

// ── Analyst Types ──

export interface ImprovementProposal {
  agent: string;
  scenarioId: string;
  priority: "critical" | "high" | "low";
  issue: string;
  rootCause: string;
  fix: string;
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
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/lib/eval/types.test.ts
```

Expected: PASS (all 4 tests).

**Step 5: Commit**

```bash
git add src/lib/eval/types.ts src/__tests__/lib/eval/types.test.ts
git commit -m "feat: add eval system types and Zod scenario schema"
```

---

### Task 4: Create scenario loader

Reads YAML files from `evals/scenarios/`, validates them with Zod.

**Files:**
- Create: `src/lib/eval/loader.ts`
- Test: `src/__tests__/lib/eval/loader.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/eval/loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadScenarios, loadScenarioFile } from "@/lib/eval/loader";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path", async () => {
  const actual = await vi.importActual("node:path");
  return { ...actual };
});

const VALID_YAML = `
id: test-scenario
agent: support
locale: pt-BR
description: "Test scenario"
persona:
  name: Maria
  phone: "11999998888"
turns:
  - user: "Oi"
    expect: {}
`;

const INVALID_YAML = `
id: test-scenario
agent: invalid_type
`;

describe("scenario loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadScenarioFile", () => {
    it("parses valid YAML and returns EvalScenario", () => {
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);
      const result = loadScenarioFile("/fake/path.yaml");
      expect(result.id).toBe("test-scenario");
      expect(result.agent).toBe("support");
      expect(result.turns).toHaveLength(1);
    });

    it("throws on invalid scenario schema", () => {
      vi.mocked(fs.readFileSync).mockReturnValue(INVALID_YAML);
      expect(() => loadScenarioFile("/fake/path.yaml")).toThrow();
    });
  });

  describe("loadScenarios", () => {
    it("loads all YAML files from scenario directories", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.endsWith("scenarios")) {
          return ["support"] as unknown as fs.Dirent[];
        }
        return ["test.yaml"] as unknown as fs.Dirent[];
      });
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);

      const scenarios = loadScenarios();
      expect(scenarios.length).toBeGreaterThan(0);
    });

    it("filters by agent when specified", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.endsWith("scenarios")) {
          return ["support", "scheduling"] as unknown as fs.Dirent[];
        }
        return ["test.yaml"] as unknown as fs.Dirent[];
      });
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);

      const scenarios = loadScenarios({ agent: "support" });
      // All loaded scenarios should have agent matching filter
      for (const s of scenarios) {
        expect(s.agent).toBe("support");
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/lib/eval/loader.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the loader**

Create `src/lib/eval/loader.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { evalScenarioSchema, type EvalScenario } from "./types";

const SCENARIOS_DIR = path.resolve(process.cwd(), "evals", "scenarios");

export function loadScenarioFile(filePath: string): EvalScenario {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = parseYaml(content);
  const result = evalScenarioSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid scenario at ${filePath}:\n${errors}`);
  }

  return result.data;
}

interface LoadOptions {
  agent?: string;
  scenario?: string;
  scenariosDir?: string;
}

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

    // Filter by agent if specified
    if (options?.agent && String(agentDir) !== options.agent) continue;

    const files = fs.readdirSync(agentPath);
    for (const file of files) {
      const fileName = String(file);
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) continue;

      const filePath = path.join(agentPath, fileName);
      const scenario = loadScenarioFile(filePath);

      // Filter by scenario ID if specified
      if (options?.scenario && scenario.id !== options.scenario) continue;

      scenarios.push(scenario);
    }
  }

  return scenarios;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/lib/eval/loader.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/eval/loader.ts src/__tests__/lib/eval/loader.test.ts
git commit -m "feat: add YAML scenario loader with Zod validation"
```

---

### Task 5: Create deterministic checker

Pure function that verifies tool calls, content, and status against expectations.

**Files:**
- Create: `src/lib/eval/checker.ts`
- Test: `src/__tests__/lib/eval/checker.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/lib/eval/checker.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { checkTurn, checkAssertions } from "@/lib/eval/checker";
import type { TurnExpect } from "@/lib/eval/types";

describe("checkTurn", () => {
  it("passes when all expectations met", () => {
    const expect_: TurnExpect = {
      tools_called: ["check_availability"],
      no_tools: ["book_appointment"],
      response_contains: ["disponivel"],
      response_not_contains: ["https://"],
    };
    const result = checkTurn(
      expect_,
      ["check_availability"],
      "Temos horarios disponivel para voce"
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when expected tool not called", () => {
    const expect_: TurnExpect = {
      tools_called: ["check_availability"],
    };
    const result = checkTurn(expect_, [], "Some response");
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("check_availability");
  });

  it("fails when forbidden tool was called", () => {
    const expect_: TurnExpect = {
      no_tools: ["book_appointment"],
    };
    const result = checkTurn(
      expect_,
      ["check_availability", "book_appointment"],
      "Booked!"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("book_appointment");
  });

  it("fails when expected substring missing", () => {
    const expect_: TurnExpect = {
      response_contains: ["horario"],
    };
    const result = checkTurn(expect_, [], "Ola, como posso ajudar?");
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("horario");
  });

  it("fails when forbidden substring present", () => {
    const expect_: TurnExpect = {
      response_not_contains: ["https://"],
    };
    const result = checkTurn(
      expect_,
      [],
      "Acesse https://fake-link.com para pagar"
    );
    expect(result.passed).toBe(false);
  });

  it("checks response_matches regex", () => {
    const expect_: TurnExpect = {
      response_matches: "\\d{2}/\\d{2}/\\d{4}",
    };
    const pass = checkTurn(expect_, [], "Sua consulta e em 18/02/2026");
    expect(pass.passed).toBe(true);

    const fail = checkTurn(expect_, [], "Consulta marcada");
    expect(fail.passed).toBe(false);
  });

  it("passes with empty expectations", () => {
    const result = checkTurn({}, ["any_tool"], "any response");
    expect(result.passed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/lib/eval/checker.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the checker**

Create `src/lib/eval/checker.ts`:

```typescript
import type { TurnExpect, CheckResult } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export function checkTurn(
  expect: TurnExpect,
  toolCallNames: string[],
  responseText: string
): CheckResult {
  const failures: string[] = [];
  const responseLower = responseText.toLowerCase();

  // Check required tools
  if (expect.tools_called) {
    for (const tool of expect.tools_called) {
      if (!toolCallNames.includes(tool)) {
        failures.push(`Expected tool "${tool}" to be called, but it was not. Called: [${toolCallNames.join(", ")}]`);
      }
    }
  }

  // Check forbidden tools
  if (expect.no_tools) {
    for (const tool of expect.no_tools) {
      if (toolCallNames.includes(tool)) {
        failures.push(`Tool "${tool}" was called but should NOT have been`);
      }
    }
  }

  // Check response contains
  if (expect.response_contains) {
    for (const substr of expect.response_contains) {
      if (!responseLower.includes(substr.toLowerCase())) {
        failures.push(`Response missing expected text: "${substr}"`);
      }
    }
  }

  // Check response not contains
  if (expect.response_not_contains) {
    for (const substr of expect.response_not_contains) {
      if (responseLower.includes(substr.toLowerCase())) {
        failures.push(`Response contains forbidden text: "${substr}"`);
      }
    }
  }

  // Check regex match
  if (expect.response_matches) {
    const regex = new RegExp(expect.response_matches);
    if (!regex.test(responseText)) {
      failures.push(`Response does not match pattern: ${expect.response_matches}`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export async function checkAssertions(
  supabase: SupabaseClient,
  assertions: {
    appointment_created?: boolean;
    confirmation_queue_entries?: number;
    conversation_status?: string;
    nps_score_recorded?: boolean;
  } | undefined,
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

  return {
    passed: failures.length === 0,
    failures,
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/lib/eval/checker.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/eval/checker.ts src/__tests__/lib/eval/checker.test.ts
git commit -m "feat: add deterministic checker for turn expectations and DB assertions"
```

---

### Task 6: Create LLM judge

Makes a lightweight GPT-4o call to score each agent response on 5 dimensions.

**Files:**
- Create: `src/lib/eval/judge.ts`

**Step 1: Create the judge**

Create `src/lib/eval/judge.ts`:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import type { JudgeResult, JudgeScores, TurnExpect } from "./types";

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator for healthcare clinic chatbots in Brazil.
Score the agent's response on these dimensions (0-10 each):

1. correctness — Did the agent take the right action? Did it call the correct tools?
2. helpfulness — Was the response useful and informative for the patient?
3. tone — Was it warm, professional, and appropriate for a healthcare clinic?
4. safety — No fabricated URLs, no hallucinated data, no medical advice, no invented information?
5. conciseness — Not too verbose, not too terse? Appropriate length?

Return ONLY a JSON object with this exact structure (no markdown, no code fences):
{
  "scores": { "correctness": 8, "helpfulness": 9, "tone": 9, "safety": 10, "conciseness": 7 },
  "overall": 8.6,
  "issues": ["Brief description of any issues found"],
  "suggestion": "One concrete suggestion for improvement"
}`;

interface JudgeInput {
  agentType: string;
  userMessage: string;
  agentResponse: string;
  toolsCalled: string[];
  expectedBehavior: TurnExpect;
  personaName: string;
  turnIndex: number;
}

const DEFAULT_SCORES: JudgeResult = {
  scores: { correctness: 5, helpfulness: 5, tone: 5, safety: 5, conciseness: 5 },
  overall: 5,
  issues: ["Judge failed to produce valid scores"],
  suggestion: "Manual review needed",
};

export async function judgeResponse(input: JudgeInput): Promise<JudgeResult> {
  const modelName = process.env.OPENAI_MODEL ?? "gpt-4o";

  const llm = new ChatOpenAI({
    model: modelName,
    maxRetries: 1,
    maxTokens: 300,
    temperature: 0,
  });

  const userPrompt = buildJudgePrompt(input);

  try {
    const response = await llm.invoke([
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    const text = typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("")
        : String(response.content);

    return parseJudgeResponse(text);
  } catch (error) {
    console.warn("[eval-judge] LLM call failed:", error);
    return DEFAULT_SCORES;
  }
}

function buildJudgePrompt(input: JudgeInput): string {
  const parts: string[] = [
    `Agent type: ${input.agentType}`,
    `Patient name: ${input.personaName}`,
    `Turn: ${input.turnIndex + 1}`,
    ``,
    `Patient said: "${input.userMessage}"`,
    ``,
    `Agent responded: "${input.agentResponse}"`,
    ``,
    `Tools called: [${input.toolsCalled.join(", ")}]`,
  ];

  if (input.expectedBehavior.tools_called?.length) {
    parts.push(`Expected tools: [${input.expectedBehavior.tools_called.join(", ")}]`);
  }
  if (input.expectedBehavior.tone) {
    parts.push(`Expected tone: ${input.expectedBehavior.tone}`);
  }

  return parts.join("\n");
}

function parseJudgeResponse(text: string): JudgeResult {
  try {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    // Validate structure
    const scores = parsed.scores as JudgeScores;
    if (
      typeof scores?.correctness !== "number" ||
      typeof scores?.helpfulness !== "number" ||
      typeof scores?.tone !== "number" ||
      typeof scores?.safety !== "number" ||
      typeof scores?.conciseness !== "number"
    ) {
      return DEFAULT_SCORES;
    }

    return {
      scores,
      overall: typeof parsed.overall === "number"
        ? parsed.overall
        : (scores.correctness + scores.helpfulness + scores.tone + scores.safety + scores.conciseness) / 5,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
  } catch {
    console.warn("[eval-judge] Failed to parse judge response:", text.slice(0, 200));
    return DEFAULT_SCORES;
  }
}
```

**Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/lib/eval/judge.ts 2>&1 || echo "Type check with full project instead"
npx tsc --noEmit
```

Expected: No type errors (or only pre-existing ones).

**Step 3: Commit**

```bash
git add src/lib/eval/judge.ts
git commit -m "feat: add LLM judge for scoring agent responses on 5 dimensions"
```

---

### Task 7: Create fixture seeder

Seeds and cleans up test data in Supabase for each scenario.

**Files:**
- Create: `src/lib/eval/fixtures.ts`

**Step 1: Create the fixture seeder**

Create `src/lib/eval/fixtures.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvalScenario } from "./types";
import { randomUUID } from "node:crypto";

export interface SeededData {
  clinicId: string;
  patientId: string;
  agentId: string;
  userId: string;
}

const EVAL_CLINIC_PREFIX = "eval-";

export async function seedFixtures(
  supabase: SupabaseClient,
  scenario: EvalScenario
): Promise<SeededData> {
  const clinicId = `${EVAL_CLINIC_PREFIX}${randomUUID()}`;
  const patientId = randomUUID();
  const agentId = randomUUID();
  const userId = randomUUID();

  // 1. Create eval clinic
  await supabase.from("clinics").insert({
    id: clinicId,
    name: `Eval Clinic — ${scenario.id}`,
    phone: "11999990000",
    address: "Rua Eval, 123",
    timezone: "America/Sao_Paulo",
    user_id: userId,
  });

  // 2. Create patient from persona
  const normalizedPhone = scenario.persona.phone.replace(/\D/g, "");
  await supabase.from("patients").insert({
    id: patientId,
    clinic_id: clinicId,
    name: scenario.persona.name,
    phone: normalizedPhone,
    notes: scenario.persona.notes ?? null,
    custom_fields: scenario.persona.custom_fields ?? null,
  });

  // 3. Create agent row (required by processMessage step 8)
  const agentConfig = {
    tone: "professional",
    locale: scenario.locale,
  };

  await supabase.from("agents").insert({
    id: agentId,
    clinic_id: clinicId,
    type: scenario.agent,
    name: `Eval ${scenario.agent}`,
    description: `Eval agent for ${scenario.id}`,
    instructions: "",
    config: agentConfig,
    active: true,
  });

  // 4. Seed fixture data
  if (scenario.fixtures?.professionals) {
    for (const prof of scenario.fixtures.professionals) {
      await supabase.from("professionals").insert({
        id: prof.id,
        clinic_id: clinicId,
        name: prof.name,
        specialty: prof.specialty ?? null,
        appointment_duration_minutes: prof.appointment_duration_minutes ?? 30,
        schedule_grid: prof.schedule_grid ?? null,
        google_calendar_id: prof.google_calendar_id ?? null,
        google_refresh_token: prof.google_refresh_token ?? null,
        active: true,
      });
    }
  }

  if (scenario.fixtures?.services) {
    for (const svc of scenario.fixtures.services) {
      await supabase.from("services").insert({
        id: svc.id,
        clinic_id: clinicId,
        name: svc.name,
        duration_minutes: svc.duration_minutes ?? 30,
        active: true,
      });
    }
  }

  if (scenario.fixtures?.insurance_plans) {
    for (const plan of scenario.fixtures.insurance_plans) {
      await supabase.from("insurance_plans").insert({
        id: plan.id,
        clinic_id: clinicId,
        name: plan.name,
      });
    }
  }

  if (scenario.fixtures?.appointments) {
    for (const appt of scenario.fixtures.appointments) {
      await supabase.from("appointments").insert({
        id: appt.id,
        clinic_id: clinicId,
        professional_id: appt.professional_id,
        patient_id: appt.patient_id ?? patientId,
        service_id: appt.service_id ?? null,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        status: appt.status ?? "scheduled",
      });
    }
  }

  return { clinicId, patientId, agentId, userId };
}

export async function cleanupFixtures(
  supabase: SupabaseClient,
  clinicId: string
): Promise<void> {
  // Delete in reverse dependency order
  const tables = [
    "nps_responses",
    "confirmation_queue",
    "message_queue",
    "messages",
    "conversations",
    "appointments",
    "insurance_plans",
    "services",
    "professionals",
    "agents",
    "patients",
    "clinics",
  ];

  for (const table of tables) {
    if (table === "clinics") {
      await supabase.from(table).delete().eq("id", clinicId);
    } else {
      await supabase.from(table).delete().eq("clinic_id", clinicId);
    }
  }
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No new type errors.

**Step 3: Commit**

```bash
git add src/lib/eval/fixtures.ts
git commit -m "feat: add fixture seeder and cleanup for eval scenarios"
```

---

### Task 8: Create eval runner

The core orchestrator that runs multi-turn conversations against real agents.

**Files:**
- Create: `src/lib/eval/runner.ts`

**Step 1: Create the runner**

Create `src/lib/eval/runner.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvalScenario, ScenarioResult, TurnResult } from "./types";
import { seedFixtures, cleanupFixtures, type SeededData } from "./fixtures";
import { checkTurn, checkAssertions } from "./checker";
import { judgeResponse } from "./judge";

// Import from barrel to ensure agent side-effect registration
import { processMessage } from "@/lib/agents";

interface RunScenarioOptions {
  supabase: SupabaseClient;
  scenario: EvalScenario;
  verbose?: boolean;
}

export async function runScenario(options: RunScenarioOptions): Promise<ScenarioResult> {
  const { supabase, scenario, verbose } = options;
  const startTime = Date.now();

  let seededData: SeededData | null = null;
  let conversationId = "";

  try {
    // 1. Seed fixtures
    seededData = await seedFixtures(supabase, scenario);

    if (verbose) {
      console.log(`  Seeded: clinic=${seededData.clinicId}, patient=${seededData.patientId}`);
    }

    // 2. Run each turn
    const turnResults: TurnResult[] = [];

    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      const externalId = `eval-${scenario.id}-${i}-${Date.now()}`;

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Patient: "${turn.user}"`);
      }

      // Call real processMessage
      const result = await processMessage({
        phone: scenario.persona.phone,
        message: turn.user,
        externalId,
        clinicId: seededData.clinicId,
      });

      conversationId = result.conversationId;

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Agent: "${result.responseText.slice(0, 120)}..."`);
        console.log(`    [Turn ${i + 1}] Tools: [${result.toolCallNames.join(", ")}]`);
      }

      // Deterministic checks
      const checkResult = checkTurn(
        turn.expect,
        result.toolCallNames,
        result.responseText
      );

      // LLM judge
      const judgeResult = await judgeResponse({
        agentType: scenario.agent,
        userMessage: turn.user,
        agentResponse: result.responseText,
        toolsCalled: result.toolCallNames,
        expectedBehavior: turn.expect,
        personaName: scenario.persona.name,
        turnIndex: i,
      });

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Score: ${judgeResult.overall}/10`);
        if (checkResult.failures.length > 0) {
          console.log(`    [Turn ${i + 1}] FAILURES: ${checkResult.failures.join("; ")}`);
        }
      }

      turnResults.push({
        turnIndex: i,
        userMessage: turn.user,
        agentResponse: result.responseText,
        toolCallNames: result.toolCallNames,
        toolCallCount: result.toolCallCount,
        checkResult,
        judgeResult,
      });
    }

    // 3. Final assertions
    const assertionResult = await checkAssertions(
      supabase,
      scenario.assertions,
      seededData.clinicId,
      seededData.patientId,
      conversationId
    );

    // 4. Calculate overall score
    const judgeScores = turnResults.map((t) => t.judgeResult.overall);
    const avgJudgeScore =
      judgeScores.length > 0
        ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length
        : 0;

    // Penalize for deterministic failures
    const deterministicFailures = turnResults.filter((t) => !t.checkResult.passed).length;
    const assertionFailures = assertionResult.failures.length;
    const penalty = (deterministicFailures + assertionFailures) * 1.5;
    const overallScore = Math.max(0, Math.min(10, avgJudgeScore - penalty));

    // Determine status
    const status: ScenarioResult["status"] =
      overallScore < 5 || deterministicFailures > 0 || assertionFailures > 0
        ? "fail"
        : overallScore < 7
          ? "warn"
          : "pass";

    return {
      scenarioId: scenario.id,
      agent: scenario.agent,
      description: scenario.description,
      turnResults,
      assertionResult,
      overallScore: Math.round(overallScore * 10) / 10,
      status,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // 5. Always cleanup
    if (seededData) {
      await cleanupFixtures(supabase, seededData.clinicId);
    }
  }
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No new type errors.

**Step 3: Commit**

```bash
git add src/lib/eval/runner.ts
git commit -m "feat: add eval runner for multi-turn scenario orchestration"
```

---

### Task 9: Create analyst

Reviews all failures and warnings, proposes concrete improvements.

**Files:**
- Create: `src/lib/eval/analyst.ts`

**Step 1: Create the analyst**

Create `src/lib/eval/analyst.ts`:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import type { ScenarioResult, ImprovementProposal } from "./types";

const ANALYST_SYSTEM_PROMPT = `You are a senior AI engineer reviewing evaluation results for healthcare clinic chatbot agents.
Analyze the failures and warnings, then propose specific, actionable improvements.

For each issue, return a JSON object with:
- agent: which agent type
- scenarioId: which scenario failed
- priority: "critical" (blocks patients), "high" (degrades experience), or "low" (minor)
- issue: what went wrong (1 sentence)
- rootCause: why it happened — prompt issue? missing tool? wrong tool behavior? (1 sentence)
- fix: exact text to add/change in the system prompt or tool description (be specific)

Return ONLY a JSON array of proposals (no markdown, no code fences).
If there are no issues, return an empty array: []`;

export async function analyzeResults(
  results: ScenarioResult[]
): Promise<ImprovementProposal[]> {
  const problemScenarios = results.filter((r) => r.status === "fail" || r.status === "warn");

  if (problemScenarios.length === 0) {
    return [];
  }

  const modelName = process.env.OPENAI_MODEL ?? "gpt-4o";
  const llm = new ChatOpenAI({
    model: modelName,
    maxRetries: 1,
    maxTokens: 1000,
    temperature: 0,
  });

  const summaries = problemScenarios.map((r) => {
    const turnIssues = r.turnResults
      .filter((t) => !t.checkResult.passed || t.judgeResult.overall < 7)
      .map((t) => ({
        turn: t.turnIndex + 1,
        user: t.userMessage,
        agent: t.agentResponse.slice(0, 200),
        tools: t.toolCallNames,
        checkFailures: t.checkResult.failures,
        judgeScore: t.judgeResult.overall,
        judgeIssues: t.judgeResult.issues,
      }));

    return {
      scenarioId: r.scenarioId,
      agent: r.agent,
      description: r.description,
      overallScore: r.overallScore,
      status: r.status,
      assertionFailures: r.assertionResult.failures,
      turnIssues,
    };
  });

  const userPrompt = `Here are the evaluation results with issues:\n\n${JSON.stringify(summaries, null, 2)}`;

  try {
    const response = await llm.invoke([
      { role: "system", content: ANALYST_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    const text = typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("")
        : String(response.content);

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

**Step 2: Commit**

```bash
git add src/lib/eval/analyst.ts
git commit -m "feat: add analyst for AI-powered improvement proposals"
```

---

### Task 10: Create reporter

CLI output formatting and JSON report generation.

**Files:**
- Create: `src/lib/eval/reporter.ts`

**Step 1: Create the reporter**

Create `src/lib/eval/reporter.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport, ScenarioResult, ImprovementProposal } from "./types";

const REPORTS_DIR = path.resolve(process.cwd(), "evals", "reports");

// ── CLI Output ──

export function printResults(results: ScenarioResult[], proposals: ImprovementProposal[]): void {
  const totalScenarios = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const avgScore = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / totalScenarios
    : 0;
  const totalTurns = results.reduce((sum, r) => sum + r.turnResults.length, 0);
  // Each turn = 1 agent call + 1 judge call. Plus 1 analyst call if proposals exist.
  const totalLlmCalls = totalTurns * 2 + (proposals.length > 0 ? 1 : 0);

  console.log("");
  console.log(`Orbita Eval Suite -- ${totalScenarios} scenarios`);
  console.log("");

  // Group by agent
  const byAgent = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const list = byAgent.get(r.agent) ?? [];
    list.push(r);
    byAgent.set(r.agent, list);
  }

  for (const [agent, agentResults] of byAgent) {
    console.log(`  ${agent} (${agentResults.length} scenarios)`);
    for (const r of agentResults) {
      const icon = r.status === "pass" ? "pass" : r.status === "warn" ? "WARN" : "FAIL";
      const totalTools = r.turnResults.reduce((sum, t) => sum + t.toolCallCount, 0);
      const suffix = r.status !== "pass"
        ? `  ${getFirstFailure(r)}`
        : `  (${r.turnResults.length} turns, ${totalTools} tools)`;
      console.log(
        `    ${icon.padEnd(5)} ${r.scenarioId.padEnd(35)} ${r.overallScore.toFixed(1)}/10${suffix}`
      );
    }
    console.log("");
  }

  // Proposals
  if (proposals.length > 0) {
    console.log("--- Improvement Proposals ---");
    console.log("");
    for (const p of proposals) {
      console.log(`  [${p.priority.toUpperCase()}] ${p.agent} -- ${p.scenarioId}`);
      console.log(`    Issue: ${p.issue}`);
      console.log(`    Root cause: ${p.rootCause}`);
      console.log(`    Fix: ${p.fix}`);
      console.log("");
    }
  }

  // Summary
  console.log("=".repeat(50));
  console.log(`Results: ${passed} passed, ${warnings} warnings, ${failed} failed`);
  console.log(`Average score: ${avgScore.toFixed(1)}/10`);
  console.log(`LLM calls: ~${totalLlmCalls}`);
}

function getFirstFailure(r: ScenarioResult): string {
  for (const t of r.turnResults) {
    if (t.checkResult.failures.length > 0) {
      return t.checkResult.failures[0];
    }
  }
  if (r.assertionResult.failures.length > 0) {
    return r.assertionResult.failures[0];
  }
  return `score ${r.overallScore}/10`;
}

// ── JSON Report ──

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
  const totalTurns = results.reduce((sum, r) => sum + r.turnResults.length, 0);

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    totalScenarios,
    passed: results.filter((r) => r.status === "pass").length,
    warnings: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
    averageScore: totalScenarios > 0
      ? Math.round((results.reduce((sum, r) => sum + r.overallScore, 0) / totalScenarios) * 10) / 10
      : 0,
    totalLlmCalls: totalTurns * 2 + (proposals.length > 0 ? 1 : 0),
    scenarios: results,
    proposals,
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Report: ${filePath}`);
  return filePath;
}
```

**Step 2: Commit**

```bash
git add src/lib/eval/reporter.ts
git commit -m "feat: add CLI reporter and JSON report generation for eval results"
```

---

### Task 11: Create CLI entry point

The `npm run eval` script that ties everything together.

**Files:**
- Create: `src/scripts/eval.ts`
- Modify: `package.json` (add eval script)
- Modify: `.gitignore` (add evals/reports/)

**Step 1: Create the CLI script**

Create `src/scripts/eval.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import { loadScenarios } from "../lib/eval/loader";
import { runScenario } from "../lib/eval/runner";
import { analyzeResults } from "../lib/eval/analyst";
import { printResults, saveReport } from "../lib/eval/reporter";
import type { ScenarioResult, EvalCliOptions } from "../lib/eval/types";

// Import agent barrel to trigger side-effect registrations.
// The barrel imports `server-only`, which requires the `react-server`
// condition — that's why the npm script uses `tsx --conditions react-server`.
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

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  // Create admin Supabase client directly (bypass server-only import)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load scenarios
  const scenarios = loadScenarios({
    agent: options.agent,
    scenario: options.scenario,
  });

  if (scenarios.length === 0) {
    console.log("No scenarios found matching filters.");
    process.exit(0);
  }

  console.log(`Loaded ${scenarios.length} scenario(s). Running eval...\n`);

  // Run each scenario sequentially
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (options.verbose) {
      console.log(`\n--- ${scenario.id} (${scenario.agent}) ---`);
    }

    const result = await runScenario({
      supabase,
      scenario,
      verbose: options.verbose,
    });

    results.push(result);

    // Quick status indicator for non-verbose mode
    if (!options.verbose) {
      const icon = result.status === "pass" ? "." : result.status === "warn" ? "W" : "F";
      process.stdout.write(icon);
    }
  }

  if (!options.verbose) {
    console.log(""); // newline after dots
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

**Step 2: Add npm script to package.json**

In `package.json`, add to the `scripts` section:

```json
"eval": "tsx --conditions react-server --env-file=.env src/scripts/eval.ts",
"eval:verbose": "tsx --conditions react-server --env-file=.env src/scripts/eval.ts --verbose"
```

**Step 3: Add evals/reports/ to .gitignore**

Append to `.gitignore`:

```
# eval reports
evals/reports/
```

**Step 4: Create the evals directory structure**

```bash
mkdir -p evals/scenarios/support evals/scenarios/scheduling evals/scenarios/confirmation evals/scenarios/nps evals/reports
```

**Step 5: Commit**

```bash
git add src/scripts/eval.ts package.json .gitignore
git commit -m "feat: add eval CLI entry point with npm run eval command"
```

---

### Task 12: Create barrel index for eval module

**Files:**
- Create: `src/lib/eval/index.ts`

**Step 1: Create barrel**

Create `src/lib/eval/index.ts`:

```typescript
export { evalScenarioSchema } from "./types";
export type {
  EvalScenario,
  TurnExpect,
  JudgeResult,
  JudgeScores,
  CheckResult,
  TurnResult,
  ScenarioResult,
  ImprovementProposal,
  EvalReport,
  EvalCliOptions,
} from "./types";

export { loadScenarios, loadScenarioFile } from "./loader";
export { checkTurn, checkAssertions } from "./checker";
export { judgeResponse } from "./judge";
export { seedFixtures, cleanupFixtures } from "./fixtures";
export { runScenario } from "./runner";
export { analyzeResults } from "./analyst";
export { printResults, saveReport } from "./reporter";
```

**Step 2: Commit**

```bash
git add src/lib/eval/index.ts
git commit -m "feat: add eval module barrel export"
```

---

### Task 13: Write initial scenarios

Create 2 scenarios per agent (8 total) to validate the pipeline.

**Files:**
- Create: `evals/scenarios/support/clinic-info-request.yaml`
- Create: `evals/scenarios/support/escalation-flow.yaml`
- Create: `evals/scenarios/scheduling/happy-path-booking.yaml`
- Create: `evals/scenarios/scheduling/cancel-appointment.yaml`
- Create: `evals/scenarios/confirmation/patient-confirms.yaml`
- Create: `evals/scenarios/confirmation/patient-reschedules.yaml`
- Create: `evals/scenarios/nps/promoter-flow.yaml`
- Create: `evals/scenarios/nps/detractor-flow.yaml`

**Step 1: Create support scenarios**

`evals/scenarios/support/clinic-info-request.yaml`:

```yaml
id: support-clinic-info-request
agent: support
locale: pt-BR
description: "Patient asks about clinic information and services"

persona:
  name: Ana Santos
  phone: "11987650001"

turns:
  - user: "Oi, quais servicos a clinica oferece?"
    expect:
      tools_called: [get_clinic_info]
      response_not_contains: ["https://", "http://"]

  - user: "Voces aceitam Unimed?"
    expect:
      response_not_contains: ["https://", "http://"]
```

`evals/scenarios/support/escalation-flow.yaml`:

```yaml
id: support-escalation-flow
agent: support
locale: pt-BR
description: "Patient requests to speak with a human"

persona:
  name: Carlos Oliveira
  phone: "11987650002"

turns:
  - user: "Preciso falar com alguem da clinica, por favor"
    expect:
      tools_called: [escalate_to_human]

assertions:
  conversation_status: escalated
```

**Step 2: Create scheduling scenarios**

`evals/scenarios/scheduling/happy-path-booking.yaml`:

```yaml
id: scheduling-happy-path-booking
agent: scheduling
locale: pt-BR
description: "Patient books a standard appointment"

persona:
  name: Maria Silva
  phone: "11987650003"
  notes: "Prefere horarios pela manha"

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

turns:
  - user: "Quero marcar uma consulta com o Dr. Joao"
    expect:
      tools_called: [check_availability]
      no_tools: [book_appointment]

  - user: "Pode ser o primeiro horario disponivel"
    expect:
      tools_called: [book_appointment]
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

fixtures:
  professionals:
    - id: eval-prof-2
      name: Dra. Ana Souza
      specialty: Clinico Geral
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "18:00" }]
  appointments:
    - id: eval-appt-1
      professional_id: eval-prof-2
      starts_at: "2026-03-01T14:00:00.000Z"
      ends_at: "2026-03-01T14:30:00.000Z"
      status: scheduled

turns:
  - user: "Preciso cancelar minha consulta"
    expect:
      tools_called: [list_patient_appointments]

  - user: "Sim, pode cancelar. Tive um imprevisto."
    expect:
      tools_called: [cancel_appointment]
```

**Step 3: Create confirmation scenarios**

`evals/scenarios/confirmation/patient-confirms.yaml`:

```yaml
id: confirmation-patient-confirms
agent: confirmation
locale: pt-BR
description: "Patient confirms attendance after receiving reminder"

persona:
  name: Julia Mendes
  phone: "11987650005"

fixtures:
  professionals:
    - id: eval-prof-3
      name: Dr. Roberto Lima
      specialty: Dermatologia
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-2
      professional_id: eval-prof-3
      starts_at: "2026-02-16T10:00:00.000Z"
      ends_at: "2026-02-16T10:30:00.000Z"
      status: scheduled

turns:
  - user: "Sim, confirmo minha presenca"
    expect:
      tools_called: [confirm_attendance]
```

`evals/scenarios/confirmation/patient-reschedules.yaml`:

```yaml
id: confirmation-patient-reschedules
agent: confirmation
locale: pt-BR
description: "Patient asks to reschedule when receiving reminder"

persona:
  name: Lucas Ferreira
  phone: "11987650006"

fixtures:
  professionals:
    - id: eval-prof-4
      name: Dra. Carla Santos
      specialty: Clinico Geral
      appointment_duration_minutes: 30
  appointments:
    - id: eval-appt-3
      professional_id: eval-prof-4
      starts_at: "2026-02-16T14:00:00.000Z"
      ends_at: "2026-02-16T14:30:00.000Z"
      status: scheduled

turns:
  - user: "Nao vou poder ir nesse dia, preciso remarcar"
    expect:
      tools_called: [reschedule_from_confirmation]
```

**Step 4: Create NPS scenarios**

`evals/scenarios/nps/promoter-flow.yaml`:

```yaml
id: nps-promoter-flow
agent: nps
locale: pt-BR
description: "Satisfied patient gives high NPS score and is redirected to Google Reviews"

persona:
  name: Fernanda Almeida
  phone: "11987650007"

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

turns:
  - user: "10! Adorei o atendimento"
    expect:
      tools_called: [collect_nps_score]

  - user: "O doutor foi muito atencioso e explicou tudo direitinho"
    expect:
      tools_called: [collect_nps_comment]
```

`evals/scenarios/nps/detractor-flow.yaml`:

```yaml
id: nps-detractor-flow
agent: nps
locale: pt-BR
description: "Unsatisfied patient gives low NPS score, detractor alert triggered"

persona:
  name: Roberto Gomes
  phone: "11987650008"

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

turns:
  - user: "3. Esperei mais de uma hora para ser atendido"
    expect:
      tools_called: [collect_nps_score]

  - user: "A recepcionista foi grosseira e o medico tinha pressa"
    expect:
      tools_called: [collect_nps_comment]
```

**Step 5: Commit**

```bash
git add evals/
git commit -m "feat: add 8 initial eval scenarios for support, scheduling, confirmation, nps"
```

---

### Task 14: End-to-end test run

Verify the entire pipeline works.

**Step 1: Run a single scenario in verbose mode**

```bash
npm run eval -- --scenario support-clinic-info-request --verbose
```

Expected: See turn-by-turn output, judge scores, and a JSON report saved.

**Step 2: If errors occur, debug and fix**

Common issues:
- `server-only` import error → ensure `--conditions react-server` flag is in the npm script
- Missing env vars → ensure `.env` has `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`
- DB permission errors → ensure the service role key has access to all tables
- YAML parse errors → check scenario file formatting

**Step 3: Run all scenarios**

```bash
npm run eval
```

Expected: All 8 scenarios run with pass/warn/fail status.

**Step 4: Run verbose for review**

```bash
npm run eval:verbose
```

Expected: Full conversation output with scores and proposals.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve eval pipeline issues from end-to-end test"
```

---

### Task 15: Update CLAUDE.md

Add the eval system to the project documentation.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add eval section after Testing section**

Add a new section `## Eval System` with:

```markdown
## Eval System

CLI-driven scenario-based evaluation for agent quality and regression testing.

### Commands

```bash
npm run eval                              # Run all scenarios
npm run eval -- --agent scheduling        # Filter by agent
npm run eval -- --scenario <id>           # Single scenario
npm run eval:verbose                      # Full conversation output
```

### File Structure

```
evals/
  scenarios/{agent}/*.yaml    # Scenario definitions
  reports/*.json              # Generated reports (gitignored)
src/lib/eval/                 # Eval pipeline code
src/scripts/eval.ts           # CLI entry point
```

### Scenario Format

YAML files with multi-turn conversations. Each turn has user input and expected outcomes (tool calls, content checks). An LLM judge scores quality on 5 dimensions. An analyst proposes improvements for failures.

### Adding Scenarios

Create a YAML file in `evals/scenarios/{agent}/` following the schema in `src/lib/eval/types.ts`. Required fields: `id`, `agent`, `locale`, `description`, `persona`, `turns`.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add eval system section to CLAUDE.md"
```

---

## Task Summary

| Task | What | Files |
|------|------|-------|
| 1 | Install yaml + tsx | package.json |
| 2 | Add toolCallNames tracking | types.ts, engine.ts, process-message.ts |
| 3 | Eval types + Zod schemas | src/lib/eval/types.ts |
| 4 | Scenario loader | src/lib/eval/loader.ts |
| 5 | Deterministic checker | src/lib/eval/checker.ts |
| 6 | LLM judge | src/lib/eval/judge.ts |
| 7 | Fixture seeder | src/lib/eval/fixtures.ts |
| 8 | Eval runner | src/lib/eval/runner.ts |
| 9 | Analyst | src/lib/eval/analyst.ts |
| 10 | Reporter | src/lib/eval/reporter.ts |
| 11 | CLI entry point | src/scripts/eval.ts |
| 12 | Barrel index | src/lib/eval/index.ts |
| 13 | 8 initial scenarios | evals/scenarios/ |
| 14 | End-to-end test | Run npm run eval |
| 15 | Update CLAUDE.md | CLAUDE.md |

Total: 15 tasks, ~10 new files, ~8 scenario files, 2 modified files.
