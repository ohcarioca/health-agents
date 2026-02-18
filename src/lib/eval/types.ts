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
  price_cents: z.number().int().positive().optional(),
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
