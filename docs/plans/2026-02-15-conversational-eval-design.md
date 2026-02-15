# Conversational Eval System — Design

**Goal:** Add an LLM-driven eval mode where a simulator LLM plays the patient, generating messages turn-by-turn in reaction to the real agent — testing natural conversation behavior alongside the existing scripted evals.

**Architecture:** New `type: conversational` scenario format coexists with existing scripted scenarios. A patient simulator LLM generates messages based on goal + persona traits. A conversation judge evaluates the full transcript against a rubric + holistic scoring. Reuses existing fixtures, assertions, analyst, and reporter.

---

## Scenario Format

```yaml
type: conversational
id: billing-conv-happy-payment
agent: billing
locale: pt-BR
description: "Impatient patient pays pending invoice via Pix"

persona:
  name: Carlos Mendes
  phone: "11987650010"
  cpf: "12345678901"
  traits: ["impaciente", "direto", "pouco familiarizado com tecnologia"]

goal: "Patient successfully pays a pending invoice using Pix"

max_turns: 15
seed: null                     # null = random, number = deterministic

rubric:
  - "Agent identified the correct pending invoice"
  - "Agent offered Pix and boleto as payment options"
  - "Agent generated a real payment link (not fabricated)"
  - "Agent was patient despite user's impatience"

assertions:
  payment_link_created: true

fixtures:
  invoices:
    - id: eval-inv-1
      amount_cents: 15000
      due_date: "2026-02-20"
      status: pending
```

**Key differences from scripted:**
- `type: conversational` (scripted has no `type` field — backward-compatible)
- `goal` replaces `turns` — describes what the patient wants to achieve
- `traits` in persona — behavioral characteristics for the simulator
- `rubric` — specific criteria the judge evaluates against the full conversation
- `max_turns` — conversation length limit (default: 15)
- `seed` — reproducibility (CLI override with `--seed`)
- No `turns` — LLM generates messages in real-time

---

## Patient Simulator

New module `src/lib/eval/simulator.ts`.

**System prompt:**
```
You are simulating a real patient interacting with a healthcare clinic's
WhatsApp chatbot. You must behave like a real person — not a test bot.

Your name: {persona.name}
Your goal: {goal}
Your personality traits: {traits.join(", ")}
Locale: {locale}

Rules:
- Write short WhatsApp messages (1-3 sentences max)
- React naturally to what the agent says
- Stay in character (traits affect HOW you write, not WHAT you want)
- If the agent asks a question, answer it naturally
- If the agent completed your goal, respond naturally then add [GOAL_COMPLETE] at the end
- If you are stuck and the agent is not helping, add [STUCK] at the end
- Never mention you are a simulation or test
- Write in the locale language
```

**Flow per turn:**
```
Simulator LLM → generates patient message
     ↓
processMessage() → real agent response
     ↓
Simulator LLM → reacts + generates next message
     ↓
... loop until stop condition
```

**Stop conditions (whichever comes first):**
1. `max_turns` reached
2. Simulator includes `[GOAL_COMPLETE]`
3. Simulator includes `[STUCK]`

**Reproducibility:**
- `temperature: 0` when seed is provided
- `temperature: 0.7` when no seed (natural variation)

Simulator receives full conversation history each turn for coherence.

---

## Conversation Judge

New module `src/lib/eval/conversation-judge.ts`.

### Pass 1 — Rubric Check (deterministic via LLM)

Each rubric item evaluated individually:

```ts
interface RubricResult {
  criterion: string;       // "Agent offered Pix and boleto as options"
  passed: boolean;
  evidence: string;        // "Turn 3: agent said 'Posso gerar Pix ou boleto'"
}
```

### Pass 2 — Holistic Score (6 dimensions)

Same 5 dimensions as existing judge (correctness, helpfulness, tone, safety, conciseness) plus:
- **goal_completion** — Did the patient achieve their goal?

Applied to the full conversation, not individual turns.

### Score Formula

```
rubricScore = (rubric items passed / total items) * 10
judgeScore  = average of 6 dimensions
penalty     = assertion failures * 1.5
overall     = min(rubricScore, judgeScore) - penalty
```

Uses `min()` — both passes must be good. Status thresholds same as scripted (pass >= 7, warn 5-7, fail < 5).

---

## Runner Integration

Runner dispatches by type:

```
loadScenarios()
  ↓
For each scenario:
  ├─ type === "scripted" (or no type) → runScriptedScenario()  [existing]
  └─ type === "conversational"         → runConversationalScenario()  [new]
```

**`runConversationalScenario()` flow:**
```
1. seedFixtures()                          ← reuses existing
2. loop (until max_turns or stop signal):
   a. simulatePatient() → generate msg    ← new
   b. processMessage()                    ← reuses existing
   c. accumulate transcript[]             ← new
3. judgeConversation(transcript, rubric)  ← new
4. checkAssertions()                      ← reuses existing
5. calculate score                        ← new formula
6. cleanupFixtures()                      ← reuses existing
```

**Result type:**

```ts
interface ConversationalScenarioResult extends ScenarioResult {
  type: "conversational";
  transcript: { role: "patient" | "agent"; message: string; tools?: string[] }[];
  rubricResults: RubricResult[];
  goalCompleted: boolean;
  totalSimulatorCalls: number;
}
```

---

## CLI Changes

```bash
npm run eval                                    # All (scripted + conversational)
npm run eval -- --type scripted                 # Scripted only
npm run eval -- --type conversational           # Conversational only
npm run eval -- --agent billing --seed 42       # Fixed seed
npm run eval -- --agent billing --verbose       # Shows generated turns
```

---

## Files

| File | Action |
|------|--------|
| `src/lib/eval/simulator.ts` | **New** — patient simulator LLM |
| `src/lib/eval/conversation-judge.ts` | **New** — rubric + holistic judge |
| `src/lib/eval/conversation-runner.ts` | **New** — runConversationalScenario() |
| `src/lib/eval/types.ts` | **Modify** — conversational schema + result types |
| `src/lib/eval/loader.ts` | **Modify** — detect type, validate correct schema |
| `src/lib/eval/runner.ts` | **Modify** — dispatch by type |
| `src/lib/eval/reporter.ts` | **Modify** — print transcript + rubric in verbose |
| `src/scripts/eval.ts` | **Modify** — add --type and --seed flags |
| `src/lib/eval/index.ts` | **Modify** — export new modules |

**Reused without changes:** fixtures.ts, checker.ts (assertions), analyst.ts, judge.ts (scripted still uses it).

---

## Testing

| Test File | Validates |
|-----------|-----------|
| `simulator.test.ts` | Prompt assembly, stop signal parsing, temperature by seed |
| `conversation-judge.test.ts` | Rubric parsing, holistic scoring, score formula, LLM fallback |
| `conversation-runner.test.ts` | Stop at max_turns, stop at GOAL_COMPLETE, stop at STUCK, type dispatch |
| `types.test.ts` | Conversational schema validation |
| `loader.test.ts` | Type detection, both types loaded, --type filtering |

**Initial conversational scenarios (3):**
```
evals/scenarios/billing/
  ├─ conv-happy-payment.yaml        # Happy path, neutral patient
  ├─ conv-impatient-patient.yaml    # Impatient, wants quick resolution
  └─ conv-confused-patient.yaml     # Confused about payment methods
```

Prefix `conv-` to visually distinguish from scripted scenarios.
