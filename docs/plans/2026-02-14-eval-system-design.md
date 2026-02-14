# Eval System Design — Scenario-Driven Agent Evaluation

**Date:** 2026-02-14
**Status:** Approved

---

## Goal

Build an AI-powered evaluation system that:

1. **Discovers weaknesses** in agent prompts, tools, and behavior by simulating real patient conversations
2. **Locks good behavior** into a regression suite that catches regressions after changes
3. **Proposes concrete improvements** to prompts and tool configurations

## Decisions

| Decision | Choice |
|----------|--------|
| Approach | Scenario-Driven Eval Pipeline |
| Runtime | CLI script (`npm run eval`) |
| LLM calls | Real OpenAI API calls (authentic evaluation) |
| Judge | Same model (GPT-4o) scoring responses |
| DB | Real Supabase queries against test data |
| External services | WhatsApp and Google Calendar stubbed |

---

## Scenario Format

Each scenario is a YAML file describing a multi-turn conversation:

```yaml
# evals/scenarios/scheduling/happy-path-booking.yaml
id: scheduling-happy-path-booking
agent: scheduling
locale: pt-BR
description: "Patient books a standard appointment with a single professional"

persona:
  name: Maria Silva
  phone: "11987654321"
  notes: "Prefere horarios pela manha"

fixtures:
  professionals:
    - id: prof-1
      name: Dr. Joao Silva
      specialty: Cardiologia
      appointment_duration_minutes: 30
      schedule_grid:
        monday: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
  services:
    - id: svc-1
      name: Consulta Cardiologica
      duration_minutes: 30

turns:
  - user: "Oi, quero marcar uma consulta com o Dr. Joao"
    expect:
      tools_called: [check_availability]
      no_tools: [book_appointment]
      response_contains: ["horario", "disponivel"]
      response_not_contains: ["http://", "https://"]

  - user: "Pode ser as 10h"
    expect:
      tools_called: [book_appointment]
      status: active

  - user: "Obrigada!"
    expect:
      tools_called: []
      tone: friendly

assertions:
  appointment_created: true
  confirmation_queue_entries: 3
  conversation_status: active
```

### Scenario fields

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | yes | Unique identifier for the scenario |
| `agent` | yes | Which agent type to test (scheduling, support, confirmation, nps) |
| `locale` | yes | Locale for the conversation (pt-BR, en, es) |
| `description` | yes | Human-readable description |
| `persona` | yes | Simulated patient identity and context |
| `fixtures` | no | Test data to seed before running (professionals, services, appointments) |
| `turns` | yes | Sequential user messages with expected outcomes |
| `assertions` | no | DB state checks after all turns complete |

### Turn expectations

| Expect field | Type | Purpose |
|-------------|------|---------|
| `tools_called` | string[] | Tools that MUST be called this turn |
| `no_tools` | string[] | Tools that must NOT be called |
| `response_contains` | string[] | Substrings that must appear in response |
| `response_not_contains` | string[] | Substrings that must NOT appear |
| `status` | string | Expected conversation status after turn |
| `tone` | string | Expected tone (for LLM judge) |
| `response_matches` | string | Regex pattern the response must match |

---

## Architecture

```
npm run eval
     |
     v
+-----------+    +---------------+    +-----------------+
| Scenario  |--->|  Eval Runner  |--->| Deterministic   |
| Loader    |    |               |    | Checker         |
+-----------+    | For each turn:|    +-----------------+
     |           | 1. Send msg   |           |
     v           | 2. Get resp   |           v
+-----------+    | 3. Check      |    +-----------------+
| Fixture   |    | 4. Judge      |    | LLM Judge       |
| Seeder    |    +---------------+    | (GPT-4o)        |
+-----------+                         +-----------------+
                                             |
                                             v
                                      +-----------------+
                                      | Reporter        |
                                      | (CLI + JSON)    |
                                      +-----------------+
                                             |
                                             v
                                      +-----------------+
                                      | Analyst         |
                                      | (proposals)     |
                                      +-----------------+
```

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Scenario Loader | `src/lib/eval/loader.ts` | Parse YAML, validate with Zod |
| Fixture Seeder | `src/lib/eval/fixtures.ts` | Insert/cleanup test data in Supabase |
| Eval Runner | `src/lib/eval/runner.ts` | Orchestrate multi-turn conversations via `processMessage()` |
| Deterministic Checker | `src/lib/eval/checker.ts` | Verify tool calls, content, status (no LLM) |
| LLM Judge | `src/lib/eval/judge.ts` | Score response quality on 5 dimensions |
| Reporter | `src/lib/eval/reporter.ts` | CLI output + JSON report |
| Analyst | `src/lib/eval/analyst.ts` | Review failures, propose improvements |
| CLI Entry | `src/scripts/eval.ts` | Parse args, run scenarios, exit code |

### What is real vs stubbed

| Component | Real or Stubbed | Why |
|-----------|----------------|-----|
| `processMessage()` | Real | Core pipeline under test |
| LLM (ChatOpenAI) | Real | Authentic agent responses |
| Supabase queries | Real | Verify actual DB behavior |
| `sendTextMessage()` | Stubbed | Don't send real WhatsApp messages |
| `sendTemplateMessage()` | Stubbed | Capture what would be sent |
| Google Calendar | Stubbed | Don't create real events |

---

## Eval Runner

The runner calls real `processMessage()` for each turn:

1. Seed fixtures (clinic, patient, professionals, services)
2. For each turn:
   a. Call `processMessage()` with the user message
   b. Run deterministic checks (tool calls, content, status)
   c. Run LLM judge for quality scoring
   d. Collect results
3. Run final assertions (DB state)
4. Cleanup fixtures

External service stubs capture calls for verification without side effects.

---

## LLM Judge

A separate GPT-4o call per turn, scoring 5 dimensions (0-10):

| Dimension | What it measures |
|-----------|-----------------|
| `correctness` | Right action? Right tool? |
| `helpfulness` | Useful to the patient? |
| `tone` | Warm, professional, appropriate? |
| `safety` | No fabricated URLs, no hallucinated data? |
| `conciseness` | Not too verbose, not too terse? |

### Scoring tiers

| Score | Meaning | Action |
|-------|---------|--------|
| 9-10 | Excellent | Pass |
| 7-8 | Good, minor issues | Pass with notes |
| 5-6 | Problematic | Warning |
| 0-4 | Failure | Hard fail |

Judge call is lightweight: low `max_tokens` (200), single turn, no tools. ~$0.01 per judgment.

---

## CLI & Reporting

### Commands

```bash
npm run eval                              # Run all scenarios
npm run eval -- --agent scheduling        # Filter by agent
npm run eval -- --scenario <id>           # Single scenario
npm run eval -- --verbose                 # Full conversation output
```

### Output

```
Orbita Eval Suite -- 24 scenarios

  scheduling (8 scenarios)
    pass  happy-path-booking          9.2/10  (3 turns, 2 tools)
    pass  reschedule-conflict         8.8/10  (4 turns, 3 tools)
    FAIL  edge-case-sunday            4.1/10  called book_appointment on Sunday
    pass  cancel-with-reason          9.0/10  (2 turns, 1 tool)

Results: 21 passed, 1 warning, 2 failed
Average score: 8.4/10
Cost: $0.82 (47 LLM calls)
Report: evals/reports/2026-02-14T15-30-00.json
```

Exit code: `0` if no hard fails (score >= 5.0), `1` otherwise.

### JSON report

Saved to `evals/reports/` (gitignored) with:
- Every turn: user message, agent response, tool calls, check results, judge scores
- Aggregated scores per agent and overall
- Improvement proposals from analyst

---

## Improvement Proposals (Analyst)

After all scenarios, a final LLM call reviews failures and warnings:

- Which agent and scenario failed
- Root cause analysis (prompt? tool? behavior?)
- Concrete fix (exact text to add/change)
- Priority: critical / high / low

Proposals are saved in the JSON report. The system never auto-modifies prompts.

---

## File Structure

```
evals/
  scenarios/
    scheduling/
      happy-path-booking.yaml
      reschedule-conflict.yaml
      edge-case-sunday.yaml
      ...
    confirmation/
      patient-confirms.yaml
      patient-wants-reschedule.yaml
      ...
    nps/
      promoter-flow.yaml
      detractor-angry.yaml
      ...
    support/
      clinic-info-request.yaml
      escalation-flow.yaml
      ...
  reports/                    # gitignored
    2026-02-14T15-30-00.json

src/lib/eval/
  loader.ts
  fixtures.ts
  runner.ts
  checker.ts
  judge.ts
  analyst.ts
  reporter.ts
  types.ts

src/scripts/
  eval.ts                     # CLI entry point
```

---

## Dependencies

- `yaml` (npm package) — parse YAML scenario files
- No other new dependencies. Uses existing: Zod, LangChain, Supabase admin client.

---

## Future (Phase 2)

- AI scenario generator: LLM creates new scenarios based on agent capabilities and past failures
- Best generated scenarios promoted to regression suite
- Dashboard view for eval results
