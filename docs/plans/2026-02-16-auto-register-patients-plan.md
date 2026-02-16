# Auto-Register New Patients — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an unregistered person messages a clinic via WhatsApp, auto-create a patient record and route them to the support agent with a welcome greeting.

**Architecture:** Inline auto-creation in `process-message.ts`. WhatsApp profile name extracted in webhook route and passed downstream. `isNewPatient` flag propagated through `RecipientContext` to `context-builder.ts` for prompt injection.

**Tech Stack:** TypeScript, Supabase (admin client), Next.js API routes, Vitest

---

### Task 1: Add `isNewPatient` to `RecipientContext`

**Files:**
- Modify: `src/lib/agents/types.ts:37-44`

**Step 1: Add the field**

In `src/lib/agents/types.ts`, add `isNewPatient?: boolean` to the `RecipientContext` interface (line 43, before closing brace):

```ts
export interface RecipientContext {
  id: string;
  firstName: string;
  fullName: string;
  phone: string;
  observations?: string;
  customFields?: Record<string, unknown>;
  isNewPatient?: boolean;
}
```

**Step 2: Commit**

```bash
git add src/lib/agents/types.ts
git commit -m "feat: add isNewPatient flag to RecipientContext"
```

---

### Task 2: Add new-patient line to `context-builder.ts`

**Files:**
- Modify: `src/lib/agents/context-builder.ts:89-97`

**Step 1: Update `formatRecipientContext`**

In `src/lib/agents/context-builder.ts`, add the `isNewPatient` check after the observations line (line 95), before the `return`:

```ts
function formatRecipientContext(recipient: RecipientContext): string {
  const lines: string[] = [`Recipient context:`];
  lines.push(`- Name: ${recipient.fullName}`);
  lines.push(`- Phone: ${recipient.phone}`);
  if (recipient.observations) {
    lines.push(`- Observations: ${recipient.observations}`);
  }
  if (recipient.isNewPatient) {
    lines.push(
      "- THIS IS A NEW PATIENT (first contact). Welcome them warmly, introduce yourself and the clinic's services, and ask how you can help."
    );
  }
  return lines.join("\n");
}
```

**Step 2: Commit**

```bash
git add src/lib/agents/context-builder.ts
git commit -m "feat: inject new-patient context into agent system prompt"
```

---

### Task 3: Add `contactName` to `ProcessMessageInput` and auto-create patient

**Files:**
- Modify: `src/lib/agents/process-message.ts:19-71` (input interface) and `src/lib/agents/process-message.ts:61-71` (patient not found block) and `src/lib/agents/process-message.ts:186-195` (recipient context)

**Step 1: Add `contactName` to the input interface**

In `src/lib/agents/process-message.ts`, add `contactName?: string` to `ProcessMessageInput` (line 23):

```ts
interface ProcessMessageInput {
  phone: string;
  message: string;
  externalId: string;
  clinicId: string;
  contactName?: string;
}
```

**Step 2: Replace the "no patient found" block with auto-creation**

Replace lines 61-71 (the `if (!patient)` block that returns empty) with:

```ts
  let isNewPatient = false;

  if (!patient) {
    // Auto-create patient with WhatsApp profile name
    const patientName = input.contactName?.trim() || normalizedPhone;
    const { data: newPatient, error: insertError } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinicId,
        name: patientName,
        phone: normalizedPhone,
      })
      .select("id, name, phone, notes, custom_fields")
      .single();

    if (insertError) {
      // Race condition: another request may have created the patient
      if (insertError.code === "23505") {
        const { data: existingPatient } = await supabase
          .from("patients")
          .select("id, name, phone, notes, custom_fields")
          .eq("clinic_id", clinicId)
          .eq("phone", normalizedPhone)
          .single();

        if (!existingPatient) {
          console.error("[process-message] patient insert conflict but re-query failed:", insertError);
          return {
            conversationId: "",
            responseText: "",
            module: "",
            toolCallCount: 0,
            toolCallNames: [],
            queued: false,
          };
        }

        patient = existingPatient;
      } else {
        console.error("[process-message] failed to create patient:", insertError);
        return {
          conversationId: "",
          responseText: "",
          module: "",
          toolCallCount: 0,
          toolCallNames: [],
          queued: false,
        };
      }
    } else {
      patient = newPatient;
    }

    isNewPatient = true;
    console.log(
      `[process-message] auto-created patient name="${patient.name}" phone=${normalizedPhone} clinic=${clinicId}`
    );
  }
```

Important: The `patient` variable (line 54) must change from `const` to `let` so it can be reassigned:

```ts
  let { data: patient } = await supabase
```

**Step 3: Pass `isNewPatient` to `RecipientContext`**

Update the recipient object construction (around line 188) to include the flag:

```ts
  const recipient: RecipientContext = {
    id: patient.id,
    firstName,
    fullName: patient.name,
    phone: patient.phone,
    observations: patient.notes ?? undefined,
    customFields: patient.custom_fields as Record<string, unknown> | undefined,
    isNewPatient,
  };
```

**Step 4: Force-route new patients to support**

In the module routing section (around line 134), add a new-patient shortcut before the existing routing logic. Replace the routing section:

```ts
  // 6. Route message to module
  let moduleType: ModuleType;

  if (currentModule && getAgentType(currentModule)) {
    moduleType = currentModule as ModuleType;
  } else if (isNewPatient && getAgentType("support")) {
    // New patients always start with support agent
    moduleType = "support" as ModuleType;
  } else {
```

This inserts the `isNewPatient` check between the existing-conversation check and the agent-lookup logic.

**Step 5: Commit**

```bash
git add src/lib/agents/process-message.ts
git commit -m "feat: auto-create patient on first WhatsApp contact"
```

---

### Task 4: Pass `contactName` from webhook route

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts:62-108`

**Step 1: Extract contact name and pass to processMessage**

In the webhook route, extract the contact name from the payload (after line 65 where `displayPhone` is set) and pass it in the `processMessage` call.

Add after line 65:

```ts
  const contactName = value.contacts?.[0]?.profile?.name;
```

Update the `processMessage` call (around line 103) to include `contactName`:

```ts
        await processMessage({
          phone: senderPhone,
          message: messageBody,
          externalId: messageExternalId,
          clinicId: clinic.id,
          contactName: contactName ?? undefined,
        });
```

**Step 2: Commit**

```bash
git add src/app/api/webhooks/whatsapp/route.ts
git commit -m "feat: pass whatsapp contact name to processMessage"
```

---

### Task 5: Write tests

**Files:**
- Create: `src/__tests__/lib/agents/process-message.test.ts`

**Step 1: Write test for auto-creation flow**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

// Mock WhatsApp service
vi.mock("@/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
  verifySignature: vi.fn().mockReturnValue(true),
}));

// Mock engine — returns a canned response without calling OpenAI
vi.mock("@/lib/agents/engine", () => ({
  chatWithToolLoop: vi.fn().mockResolvedValue({
    responseText: "Welcome to our clinic!",
    appendToResponse: undefined,
    newConversationStatus: undefined,
    responseData: undefined,
    toolCallCount: 0,
    toolCallNames: [],
  }),
}));

// Mock router
vi.mock("@/lib/agents/router", () => ({
  routeMessage: vi.fn().mockResolvedValue({ module: "support", reason: "new patient" }),
}));

// ── Mock Supabase ──

interface MockQueryResult {
  data: unknown;
  error: unknown;
}

function createChainableMock(result: MockQueryResult) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const terminal = {
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  const chainable = new Proxy(mock, {
    get(_target, prop: string) {
      if (prop === "single" || prop === "maybeSingle") return terminal[prop];
      if (!mock[prop]) {
        mock[prop] = vi.fn().mockReturnValue(chainable);
      }
      return mock[prop];
    },
  });
  return chainable;
}

const mockInsertSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("processMessage — auto-register new patient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: no existing message (idempotency check passes)
    // Tables: messages (idempotency), patients (lookup), conversations, clinics, etc.
    mockFrom.mockImplementation((table: string) => {
      if (table === "messages") {
        return {
          select: vi.fn().mockReturnValue(
            createChainableMock({ data: null, error: null })
          ),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "patients") {
        return {
          select: vi.fn().mockReturnValue(
            // First call: patient not found
            createChainableMock({ data: null, error: null })
          ),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "new-patient-id",
                  name: "Maria",
                  phone: "5511999990000",
                  notes: null,
                  custom_fields: {},
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue(
            createChainableMock({ data: null, error: null })
          ),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "new-conv-id" },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue(
            createChainableMock({ data: null, error: null })
          ),
        };
      }
      if (table === "agents") {
        return {
          select: vi.fn().mockReturnValue(
            createChainableMock({
              data: { id: "agent-1", name: "Support", description: null, instructions: null, config: {} },
              error: null,
            })
          ),
        };
      }
      if (table === "clinics") {
        return {
          select: vi.fn().mockReturnValue(
            createChainableMock({
              data: {
                name: "Test Clinic",
                phone: "551199998888",
                address: "Rua Test",
                timezone: "America/Sao_Paulo",
                whatsapp_phone_number_id: "123",
                whatsapp_access_token: "token",
              },
              error: null,
            })
          ),
        };
      }
      if (table === "insurance_plans" || table === "services") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === "professionals") {
        return {
          select: vi.fn().mockReturnValue(
            createChainableMock({ data: [], error: null })
          ),
        };
      }
      if (table === "message_queue") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "queue-1" },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue(
            createChainableMock({ data: null, error: null })
          ),
        };
      }
      // Fallback
      return createChainableMock({ data: null, error: null });
    });
  });

  it("creates a new patient when phone is not found", async () => {
    const { processMessage } = await import("@/lib/agents");

    const result = await processMessage({
      phone: "5511999990000",
      message: "Ola, quero marcar uma consulta",
      externalId: "ext-123",
      clinicId: "clinic-1",
      contactName: "Maria",
    });

    // Should not return empty — should have processed the message
    expect(result.conversationId).not.toBe("");
    expect(result.responseText).toBeTruthy();
    expect(result.queued).toBe(true);

    // Verify patient insert was called
    const patientCalls = mockFrom.mock.calls.filter(
      ([table]: [string]) => table === "patients"
    );
    // At least one call should be an insert (auto-creation)
    expect(patientCalls.length).toBeGreaterThan(0);
  });

  it("uses phone number as name when contactName is missing", async () => {
    const { processMessage } = await import("@/lib/agents");

    const result = await processMessage({
      phone: "5511999990000",
      message: "Ola",
      externalId: "ext-456",
      clinicId: "clinic-1",
      // No contactName provided
    });

    expect(result.conversationId).not.toBe("");
    expect(result.responseText).toBeTruthy();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/agents/process-message.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/lib/agents/process-message.test.ts
git commit -m "test: add process-message auto-register patient tests"
```

---

### Task 6: Run full test suite and verify build

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All existing tests still pass.

**Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Final commit (if any fixes needed)**

If any fixes were needed, commit them as a fix.
