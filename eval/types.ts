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

export interface PatientPersona {
  name: string;
  description: string;
  openingMessage: string;
}

export interface FlowStep {
  /** Which agent type handles this turn */
  agentType: string;
  /** If provided, the patient says exactly this (no LLM simulation) */
  fixedPatientMessage?: string;
  /** Optional assertion on what tools the agent should call */
  expectedToolsCalled?: string[];
}

export interface EvalFlow {
  id: string;
  name: string;
  persona: PatientPersona;
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
