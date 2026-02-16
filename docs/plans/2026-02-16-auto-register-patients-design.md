# Auto-Register New Patients on First WhatsApp Contact

## Problem

When an unregistered person sends a WhatsApp message to a clinic, `process-message.ts` logs a warning and returns an empty result. The person receives no response. This is a lost opportunity — they should be auto-registered and attended to.

## Approach

**Inline auto-creation in `process-message.ts`** — when patient lookup returns null, create a new patient record using the WhatsApp profile name and phone number, then continue the normal flow. Route new patients to the `support` agent with a `isNewPatient` flag so the agent can welcome them.

## Changes

### 1. `src/lib/agents/types.ts`

Add `isNewPatient?: boolean` to `RecipientContext`:

```ts
interface RecipientContext {
  id: string;
  firstName: string;
  fullName: string;
  phone: string;
  observations?: string;
  customFields?: Record<string, unknown>;
  isNewPatient?: boolean;
}
```

### 2. `src/lib/agents/process-message.ts`

- Add `contactName?: string` to `ProcessMessageInput`.
- Replace the "no patient found → return empty" block with auto-creation logic.
- On insert failure due to unique constraint (race condition), re-query the patient.
- Set `isNewPatient = true` and pass it through to `RecipientContext`.
- When `isNewPatient` and no active conversation exists, force-route to `support` (skip LLM router).

### 3. `src/app/api/webhooks/whatsapp/route.ts`

Extract `value.contacts?.[0]?.profile?.name` from the webhook payload and pass it as `contactName` to `processMessage()`. The Zod schema already validates `contacts` — no schema changes needed.

### 4. `src/lib/agents/context-builder.ts`

Add to `formatRecipientContext()`: when `recipient.isNewPatient` is true, append a line telling the agent this is a first-time patient who should be welcomed.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No WhatsApp profile name | Use phone number as patient name |
| Race condition (duplicate insert) | Catch unique constraint error, re-query existing patient |
| Patient messages again after creation | Normal flow — patient exists, `isNewPatient` is false |
| Clinic has no active agents | Existing error handling applies (throws) |

## What Does NOT Change

- No new files, services, or abstractions
- No changes to the support agent's base prompt
- No new database columns or migrations
- No changes to the webhook Zod schema
- No changes to other agent types
