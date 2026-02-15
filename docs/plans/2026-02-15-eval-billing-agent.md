# Eval System: Billing Agent Support

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the eval system to support billing agent scenarios by adding invoice fixtures, billing-specific assertions, and 3 scenario YAML files.

**Architecture:** The eval system already supports `billing` as a valid agent type in its schema, but lacks the fixture seeding (invoices), persona fields (CPF), assertions (invoice status, payment link created), and cleanup for billing-specific DB tables. We add these incrementally, test-first, then create 3 billing scenarios covering the core flows.

**Tech Stack:** Vitest, Zod, YAML, Supabase admin client, existing eval framework.

---

## Gap Analysis

| Component | Current State | Missing for Billing |
|-----------|--------------|-------------------|
| `types.ts` fixtures | professionals, services, appointments, insurance_plans | **invoices** (amount_cents, due_date, status) |
| `types.ts` persona | name, phone, notes, custom_fields | **cpf** (required for Asaas customer creation) |
| `types.ts` assertions | appointment_created, confirmation_queue_entries, conversation_status, nps_score_recorded | **invoice_status**, **payment_link_created** |
| `fixtures.ts` seeding | professionals, services, insurance_plans, appointments | **invoices**, **patient CPF** |
| `fixtures.ts` cleanup | recall_queue → nps_responses → ... → clinics | Missing **payment_links**, **invoices** |
| `checker.ts` | 4 assertion types | Missing **invoice_status**, **payment_link_created** |
| `evals/scenarios/billing/` | Does not exist | Need **3 scenarios** |
| Tests | types.test.ts, checker.test.ts | Need billing coverage |

---

### Task 1: Add Invoice Fixture Schema and CPF to Types

**Files:**
- Modify: `src/lib/eval/types.ts:26-41` (fixtures schema area)
- Modify: `src/lib/eval/types.ts:58-63` (assertions schema)
- Modify: `src/lib/eval/types.ts:65-70` (persona schema)
- Test: `src/__tests__/lib/eval/types.test.ts`

**Step 1: Write the failing test**

Add to `types.test.ts`:

```typescript
it("validates a billing scenario with invoice fixtures and CPF", () => {
  const scenario = {
    id: "billing-payment-link",
    agent: "billing",
    locale: "pt-BR",
    description: "Patient requests payment link",
    persona: {
      name: "Carlos Mendes",
      phone: "11987650010",
      cpf: "12345678901",
    },
    fixtures: {
      invoices: [
        {
          id: "eval-inv-1",
          amount_cents: 15000,
          due_date: "2026-02-20",
          status: "pending",
        },
      ],
    },
    turns: [
      {
        user: "Quero pagar minha consulta",
        expect: { tools_called: ["create_payment_link"] },
      },
    ],
    assertions: {
      invoice_status: "paid",
      payment_link_created: true,
    },
  };
  const result = evalScenarioSchema.safeParse(scenario);
  expect(result.success).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/eval/types.test.ts`
Expected: FAIL — `invoices` not in fixtures schema, `cpf` not in persona, `invoice_status`/`payment_link_created` not in assertions.

**Step 3: Add invoice fixture schema, CPF to persona, billing assertions**

In `src/lib/eval/types.ts`:

Add invoice fixture schema (after `appointmentFixtureSchema`):

```typescript
const invoiceFixtureSchema = z.object({
  id: z.string(),
  amount_cents: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pending", "partial", "paid", "overdue", "cancelled"]).optional(),
  appointment_id: z.string().optional(),
  notes: z.string().optional(),
});
```

Add `invoices` to `fixturesSchema`:

```typescript
const fixturesSchema = z.object({
  professionals: z.array(professionalFixtureSchema).optional(),
  services: z.array(serviceFixtureSchema).optional(),
  appointments: z.array(appointmentFixtureSchema).optional(),
  insurance_plans: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  invoices: z.array(invoiceFixtureSchema).optional(),
}).optional();
```

Add `cpf` to `personaSchema`:

```typescript
const personaSchema = z.object({
  name: z.string(),
  phone: z.string(),
  cpf: z.string().optional(),
  notes: z.string().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});
```

Add billing assertions to `assertionsSchema`:

```typescript
const assertionsSchema = z.object({
  appointment_created: z.boolean().optional(),
  confirmation_queue_entries: z.number().int().optional(),
  conversation_status: z.string().optional(),
  nps_score_recorded: z.boolean().optional(),
  invoice_status: z.string().optional(),
  payment_link_created: z.boolean().optional(),
}).optional();
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/eval/types.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/types.ts src/__tests__/lib/eval/types.test.ts
git commit -m "feat(eval): add invoice fixtures, CPF persona, billing assertions to schema"
```

---

### Task 2: Seed Invoices and Patient CPF in Fixtures

**Files:**
- Modify: `src/lib/eval/fixtures.ts:33-144` (seedFixtures function)
- Modify: `src/lib/eval/fixtures.ts:147-175` (cleanupFixtures function)

**Step 1: Add CPF to patient seeding**

In `seedFixtures`, update the patient insert (around line 55-62) to include CPF:

```typescript
await insertRow(supabase, "patients", {
  id: patientId,
  clinic_id: clinicId,
  name: scenario.persona.name,
  phone: normalizedPhone,
  notes: scenario.persona.notes ?? null,
  custom_fields: scenario.persona.custom_fields ?? {},
  cpf: scenario.persona.cpf ?? null,
});
```

**Step 2: Add invoice seeding block**

After the appointments seeding block (after line 142), add:

```typescript
if (scenario.fixtures?.invoices) {
  for (const inv of scenario.fixtures.invoices) {
    const invId = resolveId(idMap, inv.id);
    const apptId = inv.appointment_id ? resolveId(idMap, inv.appointment_id) : null;

    await insertRow(supabase, "invoices", {
      id: invId,
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: apptId,
      amount_cents: inv.amount_cents,
      due_date: inv.due_date,
      status: inv.status ?? "pending",
      notes: inv.notes ?? null,
    });
  }
}
```

**Step 3: Add payment_links and invoices to cleanup**

Update the cleanup tables list to include `payment_links` and `invoices` in the correct dependency order (payment_links depends on invoices, both depend on clinics):

```typescript
const tables = [
  "recall_queue",
  "nps_responses",
  "confirmation_queue",
  "payment_links",   // ← depends on invoices
  "invoices",        // ← depends on patients + clinics
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
```

**Step 4: Run existing tests to verify no regressions**

Run: `npx vitest run src/__tests__/lib/eval/`
Expected: ALL PASS (no regressions — existing scenarios don't use invoices)

**Step 5: Commit**

```bash
git add src/lib/eval/fixtures.ts
git commit -m "feat(eval): seed invoices, patient CPF, cleanup billing tables"
```

---

### Task 3: Add Billing Assertions to Checker

**Files:**
- Modify: `src/lib/eval/checker.ts:62-136` (checkAssertions function)
- Test: `src/__tests__/lib/eval/checker.test.ts`

**Step 1: Write the failing tests**

Add a new `describe` block to `checker.test.ts`:

```typescript
import { checkAssertions } from "@/lib/eval/checker";

describe("checkAssertions — billing", () => {
  // Mock Supabase for assertions
  function mockSupabase(overrides: Record<string, unknown[]>) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: (_col: string, _val: string) => ({
            eq: (_col2: string, _val2: string) => ({
              single: () => ({
                data: (overrides[table] ?? [])[0] ?? null,
              }),
            }),
            single: () => ({
              data: (overrides[table] ?? [])[0] ?? null,
            }),
          }),
        }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
  }

  it("passes when invoice_status matches", async () => {
    const supabase = mockSupabase({
      invoices: [{ status: "paid" }],
    });
    const result = await checkAssertions(
      supabase,
      { invoice_status: "paid" },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when invoice_status does not match", async () => {
    const supabase = mockSupabase({
      invoices: [{ status: "pending" }],
    });
    const result = await checkAssertions(
      supabase,
      { invoice_status: "paid" },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("invoice_status");
  });

  it("passes when payment_link_created is true and link exists", async () => {
    const supabase = mockSupabase({
      payment_links: [{ id: "pl-1" }],
    });
    const result = await checkAssertions(
      supabase,
      { payment_link_created: true },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when payment_link_created expected but none exists", async () => {
    const supabase = mockSupabase({
      payment_links: [],
    });
    const result = await checkAssertions(
      supabase,
      { payment_link_created: true },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("payment_link_created");
  });
});
```

> **Note:** The mock above is simplified. The actual Supabase client chains are more complex. Look at how the existing assertions use `.eq().eq()` chains and replicate that pattern in the mock. The mock may need adjustment to match the actual query shape — the tests will tell you.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/eval/checker.test.ts`
Expected: FAIL — `invoice_status` and `payment_link_created` not handled in `checkAssertions`.

**Step 3: Add billing assertions to checkAssertions**

In `checker.ts`, update the `checkAssertions` function signature to include the new fields, and add two new assertion blocks before the final return:

```typescript
// Update the assertions parameter type:
assertions: {
  appointment_created?: boolean;
  confirmation_queue_entries?: number;
  conversation_status?: string;
  nps_score_recorded?: boolean;
  invoice_status?: string;
  payment_link_created?: boolean;
} | undefined,
```

Add after the `nps_score_recorded` block:

```typescript
if (assertions.invoice_status !== undefined) {
  const { data } = await supabase
    .from("invoices")
    .select("status")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId);
  const statuses = (data ?? []).map((r: { status: string }) => r.status);
  const hasExpected = statuses.includes(assertions.invoice_status);
  if (!hasExpected) {
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/eval/checker.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/eval/checker.ts src/__tests__/lib/eval/checker.test.ts
git commit -m "feat(eval): add invoice_status and payment_link_created assertions"
```

---

### Task 4: Create Billing Scenario — Payment Link (Pix)

**Files:**
- Create: `evals/scenarios/billing/payment-link-pix.yaml`

**Step 1: Create the scenario directory**

```bash
mkdir -p evals/scenarios/billing
```

**Step 2: Write the scenario YAML**

```yaml
id: billing-payment-link-pix
agent: billing
locale: pt-BR
description: "Patient asks for Pix payment link for a pending invoice"

persona:
  name: Carlos Mendes
  phone: "11987650010"
  cpf: "12345678901"

fixtures:
  invoices:
    - id: eval-inv-1
      amount_cents: 15000
      due_date: "2026-02-20"
      status: pending

turns:
  - user: "Oi, quero pagar minha consulta"
    expect:
      tools_called: [create_payment_link]
      response_not_contains: ["https://fake"]
      # Agent should mention the amount (R$ 150,00) or payment method
      response_contains: ["150"]

  - user: "Quero pagar via Pix"
    expect:
      # Agent may call create_payment_link again or just provide the link
      response_not_contains: ["erro"]
```

> **Design note:** The billing agent's `create_payment_link` tool requires an `invoice_id` and `method`. The LLM must identify the pending invoice and pick Pix. The first turn tests tool invocation. The second turn tests the agent presents the payment info cleanly.

**Step 3: Validate the scenario loads**

Run: `npx vitest run src/__tests__/lib/eval/loader.test.ts`
Expected: ALL PASS (loader should discover the new file)

**Step 4: Commit**

```bash
git add evals/scenarios/billing/payment-link-pix.yaml
git commit -m "feat(eval): add billing payment-link-pix scenario"
```

---

### Task 5: Create Billing Scenario — Payment Status Check

**Files:**
- Create: `evals/scenarios/billing/payment-status-check.yaml`

**Step 1: Write the scenario YAML**

```yaml
id: billing-payment-status-check
agent: billing
locale: pt-BR
description: "Patient checks the status of their pending payment"

persona:
  name: Ana Beatriz Costa
  phone: "11987650011"
  cpf: "98765432100"

fixtures:
  invoices:
    - id: eval-inv-2
      amount_cents: 25000
      due_date: "2026-02-18"
      status: pending

turns:
  - user: "Oi, quero saber se meu pagamento ja foi processado"
    expect:
      tools_called: [check_payment_status]
      no_tools: [create_payment_link, escalate_billing]

  - user: "Ainda esta pendente? Pode gerar um boleto pra mim?"
    expect:
      tools_called: [create_payment_link]
```

> **Design note:** Turn 1 validates the agent checks status (not creates a new link). Turn 2 tests transition from status inquiry to payment link generation.

**Step 2: Commit**

```bash
git add evals/scenarios/billing/payment-status-check.yaml
git commit -m "feat(eval): add billing payment-status-check scenario"
```

---

### Task 6: Create Billing Scenario — Escalation

**Files:**
- Create: `evals/scenarios/billing/escalation-dispute.yaml`

**Step 1: Write the scenario YAML**

```yaml
id: billing-escalation-dispute
agent: billing
locale: pt-BR
description: "Patient disputes a charge and agent escalates to human"

persona:
  name: Roberto Lima
  phone: "11987650012"
  cpf: "45678912300"

fixtures:
  invoices:
    - id: eval-inv-3
      amount_cents: 35000
      due_date: "2026-02-15"
      status: pending

turns:
  - user: "Nao concordo com essa cobranca, esse valor esta errado"
    expect:
      no_tools: [create_payment_link]
      # Agent should acknowledge the dispute, not just push payment

  - user: "Quero falar com alguem responsavel, isso e um absurdo"
    expect:
      tools_called: [escalate_billing]

assertions:
  conversation_status: "escalated"
```

> **Design note:** Turn 1 tests that the agent does NOT immediately push a payment link when the patient disputes. Turn 2 tests escalation when the patient explicitly demands a human. The final assertion verifies the conversation status changed.

**Step 2: Commit**

```bash
git add evals/scenarios/billing/escalation-dispute.yaml
git commit -m "feat(eval): add billing escalation-dispute scenario"
```

---

### Task 7: Run Full Test Suite and Verify

**Step 1: Run all eval unit tests**

Run: `npx vitest run src/__tests__/lib/eval/`
Expected: ALL PASS — types, checker, loader, tool-tracking tests.

**Step 2: Verify scenario loading for billing**

Run: `npx vitest run src/__tests__/lib/eval/loader.test.ts`
Expected: ALL PASS — loader discovers billing scenarios directory.

**Step 3: Verify all tests still pass project-wide**

Run: `npx vitest run`
Expected: ALL PASS — no regressions.

**Step 4: Commit any fixes**

If anything failed, fix and commit with descriptive message.

---

### Task 8: Update CLAUDE.md Eval Documentation

**Files:**
- Modify: `CLAUDE.md` (Eval System section)

**Step 1: Add billing fixtures to scenario format documentation**

In the "Scenario Format" section of CLAUDE.md, update the example to show invoice fixtures:

```yaml
fixtures:
  professionals:
    - id: eval-prof-1
      name: Dr. Joao Silva
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica
  invoices:                              # NEW — billing scenarios
    - id: eval-inv-1
      amount_cents: 15000
      due_date: "2026-02-20"
      status: pending
```

**Step 2: Add billing assertions to "Writing Scenarios" section**

Add to the bullet list:
- `invoice_status` checks the status of the patient's invoice(s) in the invoices table.
- `payment_link_created` checks that a payment_links row was created for the clinic.

**Step 3: Add CPF note to persona docs**

Document that `persona.cpf` (optional) is used for billing scenarios that require Asaas customer creation.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with billing eval fixtures and assertions"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/eval/types.ts` | Add `invoiceFixtureSchema`, `cpf` to persona, `invoice_status`/`payment_link_created` to assertions |
| `src/lib/eval/fixtures.ts` | Seed invoices + patient CPF, add `payment_links`/`invoices` to cleanup |
| `src/lib/eval/checker.ts` | Add `invoice_status` and `payment_link_created` assertion checks |
| `src/__tests__/lib/eval/types.test.ts` | Add billing scenario validation test |
| `src/__tests__/lib/eval/checker.test.ts` | Add billing assertion tests |
| `evals/scenarios/billing/payment-link-pix.yaml` | Happy path: Pix payment link creation |
| `evals/scenarios/billing/payment-status-check.yaml` | Status inquiry → boleto generation |
| `evals/scenarios/billing/escalation-dispute.yaml` | Charge dispute → human escalation |
| `CLAUDE.md` | Document billing fixtures, assertions, CPF persona field |

**No changes needed to:** runner.ts, judge.ts, analyst.ts, reporter.ts, loader.ts, eval CLI — they already handle billing as a valid agent type generically.
