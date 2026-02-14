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
