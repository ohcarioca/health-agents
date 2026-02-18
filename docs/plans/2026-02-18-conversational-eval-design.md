# Conversational Eval System — Design Document

Date: 2026-02-18
Branch: `bugs/eval-system`
Status: Approved

---

## Problem

The current eval system uses static scripted user messages per turn. This has three critical gaps:

1. **No auto-billing coverage** — the biggest recent platform change has zero eval scenarios.
2. **No cross-module flow tests** — can't test routing (support → scheduling) or multi-module journeys.
3. **Static messages can't adapt** — if the agent asks something unexpected (e.g., "What's your CPF?"), the pre-scripted next message doesn't respond to it.

## Solution

Replace the static eval system with a **Goal-Driven Patient Loop** — an LLM simulates a patient with a persona and goal, the real agent pipeline processes each message, and a Claude-powered judge evaluates the full transcript.

## Architecture

### Provider Split

| Role | Provider | Model Env Var | SDK |
|------|----------|---------------|-----|
| Agent (real pipeline) | OpenAI | `OPENAI_MODEL` | `@langchain/openai` (existing) |
| Patient simulator | OpenAI | `OPENAI_MODEL` | `@langchain/openai` (existing) |
| Judge + Analyst | Anthropic Claude | `CLAUDE_MODEL` | `@anthropic-ai/sdk` (new) |

New env vars: `CLAUDE_API_KEY`, `CLAUDE_MODEL`.

### Conversation Loop

```
Scenario YAML loaded
  ↓
Seed fixtures (clinic, patient, professionals, services, module_configs, etc.)
  ↓
Patient LLM generates first message (from persona + goal)
  ↓
┌─────────────────────────────────────────────┐
│  CONVERSATION LOOP (max 20 turns)           │
│                                             │
│  1. processMessage(patientMessage)          │
│     → Real agent pipeline (routing, tools,  │
│       tool loop, DB writes — everything)    │
│     → Returns: responseText, toolCallNames  │
│                                             │
│  2. Guardrail check (deterministic)         │
│     → never_tools, never_contains           │
│     → If violated → log failure, continue   │
│                                             │
│  3. Patient LLM receives agent response     │
│     → Has: persona, goal, full history      │
│     → Generates next patient message        │
│     → OR outputs [DONE] if goal achieved    │
│     → OR outputs [STUCK] if can't progress  │
│                                             │
│  4. Loop continues until:                   │
│     a) Patient signals [DONE] or [STUCK]    │
│     b) Max turns reached                    │
│     c) Agent escalates to human             │
└─────────────────────────────────────────────┘
  ↓
Collect full transcript (all messages + tool calls)
  ↓
Run end-of-conversation judge (Claude scores full transcript)
  ↓
Run DB assertions (appointment_created, invoice_status, etc.)
  ↓
Calculate final score + status
  ↓
Cleanup fixtures
```

### Patient LLM Simulator

File: `src/lib/eval/patient-simulator.ts`

- Uses OpenAI (`OPENAI_MODEL`) via LangChain — cheap, fast, good enough for roleplay.
- Gets full conversation history each call for coherence.
- System prompt defines persona, goal, available info (CPF, email), and behavioral rules.
- Max tokens: 150 (WhatsApp-realistic short messages).
- Temperature: 0.7 (natural variation without going off-rails).
- Termination signals: `[DONE]` (goal achieved) or `[STUCK]` (can't progress after 3 attempts).
- Signals are stripped before sending message to the agent.

### Conversation Judge (Claude-Powered)

File: `src/lib/eval/judge.ts`

Evaluates the full transcript after conversation ends. Returns:

```typescript
interface JudgeVerdict {
  goal_achieved: boolean;
  scores: {
    correctness: number;    // 0-10: Right tools, right order, right data
    helpfulness: number;    // 0-10: Guided patient toward goal efficiently
    tone: number;           // 0-10: Warm, professional, healthcare-appropriate
    safety: number;         // 0-10: No fabricated URLs, no medical advice
    conciseness: number;    // 0-10: WhatsApp-appropriate length
    flow: number;           // 0-10: Natural conversation flow, good transitions
  };
  overall: number;
  issues: string[];
  suggestion: string;
}
```

Scoring formula:

```
base_score = average(6 dimensions)
penalty = guardrail_violations * 1.5
penalty += assertion_failures * 2.0
penalty += goal_not_achieved ? 3.0 : 0
final_score = clamp(base_score - penalty, 0, 10)

status:
  pass  → final_score >= 7 AND goal_achieved AND no assertion failures
  warn  → final_score >= 5
  fail  → otherwise
```

### Analyst (Claude-Powered)

File: `src/lib/eval/analyst.ts`

Reviews failed/warned scenarios with full transcripts. Proposes fixes with categories:

```typescript
interface ImprovementProposal {
  agent: string;
  scenarioId: string;
  priority: "critical" | "high" | "low";
  category: "prompt" | "tool" | "routing" | "guardrail" | "fixture";
  issue: string;
  rootCause: string;
  fix: string;
  file?: string;
}
```

## Scenario YAML Format

```yaml
id: scheduling-booking-auto-billing
agent: scheduling
locale: pt-BR
description: "Patient books appointment when auto-billing is enabled"

persona:
  name: Maria Silva
  phone: "11987650003"
  cpf: "12345678901"
  email: "maria@email.com"
  personality: "polite, prefers mornings, provides info when asked"
  goal: "Book a cardiology appointment with Dr. Joao for next week"

fixtures:
  module_configs:
    - module_type: billing
      settings: { auto_billing: true }
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica
      duration_minutes: 30
  professional_services:
    - professional_id: eval-prof-1
      service_id: eval-svc-1
      price_cents: 25000

guardrails:
  never_tools: [escalate_to_human]
  never_contains: ["erro", "nao consigo"]
  never_matches: "https?://fake"

expectations:
  tools_called: [check_availability, book_appointment]
  tools_not_called: [cancel_appointment]
  response_contains: ["agendado"]
  goal_achieved: true
  assertions:
    appointment_created: true
    invoice_status: pending
    payment_link_created: true
    confirmation_queue_entries: 3

max_turns: 15
```

### Changes from old format

- `turns` array with scripted `user` messages → **removed**.
- `persona` gains `personality`, `goal`, `email`, `cpf`.
- `fixtures` gains `module_configs`, `professional_services`.
- `guardrails` replaces per-turn `no_tools` / `response_not_contains`.
- `expectations` is scenario-level, checked after conversation ends.
- `expectations.goal_achieved` is LLM-evaluated by the judge.
- `max_turns` controls the conversation loop limit (default: 20).

## Fixture Updates

File: `src/lib/eval/fixtures.ts`

New fixture types:
- `module_configs` — update settings on existing rows (created on signup).
- `professional_services` — insert into junction table after professionals and services, resolving IDs via `idMap`.
- `persona.email` — stored on patient row (needed for Asaas customer creation).

Cleanup additions:
- `professional_services` — delete before professionals/services.
- `module_configs` — reset settings to defaults (don't delete).

## Types

File: `src/lib/eval/types.ts`

```typescript
interface EvalScenario {
  id: string;
  agent: string;
  locale: "pt-BR" | "en" | "es";
  description: string;
  persona: ScenarioPersona;
  fixtures: ScenarioFixtures;
  guardrails?: ScenarioGuardrails;
  expectations: ScenarioExpectations;
  max_turns?: number;
}

interface ScenarioPersona {
  name: string;
  phone: string;
  cpf?: string;
  email?: string;
  personality: string;
  goal: string;
}

interface ScenarioFixtures {
  module_configs?: ModuleConfigFixture[];
  professionals?: ProfessionalFixture[];
  services?: ServiceFixture[];
  professional_services?: ProfessionalServiceFixture[];
  appointments?: AppointmentFixture[];
  invoices?: InvoiceFixture[];
  insurance_plans?: InsurancePlanFixture[];
}

interface ScenarioGuardrails {
  never_tools?: string[];
  never_contains?: string[];
  never_matches?: string;
}

interface ScenarioExpectations {
  tools_called?: string[];
  tools_not_called?: string[];
  response_contains?: string[];
  goal_achieved: boolean;
  assertions?: {
    appointment_created?: boolean;
    confirmation_queue_entries?: number;
    conversation_status?: string;
    nps_score_recorded?: boolean;
    invoice_status?: string;
    payment_link_created?: boolean;
  };
}

interface ConversationTurn {
  index: number;
  role: "patient" | "agent";
  content: string;
  toolsCalled?: string[];
  guardrailViolations?: string[];
  timestamp: number;
}

interface ScenarioResult {
  scenario: EvalScenario;
  turns: ConversationTurn[];
  turnCount: number;
  totalToolCalls: number;
  allToolsCalled: string[];
  terminationReason: "done" | "stuck" | "max_turns" | "escalated";
  guardrailViolations: string[];
  assertionResults: { passed: boolean; failures: string[] };
  judge: JudgeVerdict;
  score: number;
  status: "pass" | "warn" | "fail";
  durationMs: number;
  llmCalls: number;
}
```

## CLI

```bash
npm run eval                                    # Run all scenarios
npm run eval -- --agent scheduling              # Filter by agent type
npm run eval -- --scenario booking-happy-path   # Single scenario
npm run eval -- --verbose                       # Full transcripts
npm run eval -- --threshold 7                   # Custom pass threshold
npm run eval -- --max-turns 10                  # Override all max_turns
```

Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `CLAUDE_MODEL`.

## Scenario Catalog (20 scenarios)

### Single-Agent (16)

**Scheduling (5)**

| ID | Goal |
|----|------|
| `scheduling-happy-path-booking` | Book appointment with specific professional |
| `scheduling-booking-auto-billing` | Book with auto-billing (CPF/email collection + invoice) |
| `scheduling-cancel-appointment` | Cancel existing appointment |
| `scheduling-cancel-with-invoice` | Cancel appointment with pending invoice |
| `scheduling-reschedule` | Reschedule to new time |

**Confirmation (3)**

| ID | Goal |
|----|------|
| `confirmation-patient-confirms` | Confirm upcoming appointment |
| `confirmation-confirms-with-payment` | Confirm with auto-billing pending invoice |
| `confirmation-patient-reschedules` | Decline and reschedule |

**Billing (3)**

| ID | Goal |
|----|------|
| `billing-pay-via-pix` | Request and receive payment link |
| `billing-check-status` | Check payment status |
| `billing-dispute-escalation` | Dispute charge, get routed to human |

**NPS (2)**

| ID | Goal |
|----|------|
| `nps-promoter-flow` | Rate highly, leave comment, get Google Reviews link |
| `nps-detractor-flow` | Rate poorly, explain complaint |

**Support (2)**

| ID | Goal |
|----|------|
| `support-clinic-info` | Ask about services and insurance |
| `support-escalation` | Request human agent |

**Recall (1)**

| ID | Goal |
|----|------|
| `recall-reactivation` | Respond to reactivation, want to book again |

### Cross-Module (4)

| ID | Flow | Goal |
|----|------|------|
| `cross-support-to-scheduling` | support → scheduling | New patient books appointment |
| `cross-scheduling-to-billing` | scheduling → billing | Book, then ask about payment |
| `cross-confirmation-to-scheduling` | confirmation → scheduling | Decline, reschedule with new professional |
| `cross-recall-to-scheduling` | recall → scheduling | Reactivated patient books new appointment |

## Component File Map

| Component | File | Status |
|-----------|------|--------|
| Types | `src/lib/eval/types.ts` | Rewrite |
| Loader | `src/lib/eval/loader.ts` | Update (new schema) |
| Fixtures | `src/lib/eval/fixtures.ts` | Extend (module_configs, professional_services) |
| Patient Simulator | `src/lib/eval/patient-simulator.ts` | **New** |
| Runner | `src/lib/eval/runner.ts` | Rewrite (conversation loop) |
| Checker | `src/lib/eval/checker.ts` | Simplify (guardrails + end-of-convo assertions) |
| Judge | `src/lib/eval/judge.ts` | Rewrite (Claude, full transcript, 6 dimensions) |
| Analyst | `src/lib/eval/analyst.ts` | Rewrite (Claude, categories) |
| Reporter | `src/lib/eval/reporter.ts` | Update (new output format) |
| CLI | `src/scripts/eval.ts` | Update (new flags) |
| Scenarios | `evals/scenarios/{agent}/` | Rewrite all 11 + 9 new |
