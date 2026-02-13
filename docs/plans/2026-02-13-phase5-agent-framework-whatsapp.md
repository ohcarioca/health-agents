# Phase 5 — Agent Framework + WhatsApp Integration

## Context

Phases 1-4 are complete: database schema (16 tables with RLS), auth, web shell with Liquid Glass UI, and Settings/Team CRUD. The agent-related tables already exist (`agents`, `conversations`, `messages`, `message_queue`, `module_configs`) but no framework code has been written.

Phase 5 builds the **technical heart** of Órbita: a LangChain-based agent framework with a registry pattern, tool loop engine, and WhatsApp webhook integration. We also build a minimal "echo" agent to verify the entire pipeline end-to-end (real agent types come in Phase 6+).

**Goal:** Message arrives via WhatsApp webhook → conversation created/found → routed to agent → LLM generates response with optional tool calls → response queued and sent back via WhatsApp.

---

## Files Overview

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `package.json` | MODIFY | Add `@langchain/openai`, `@langchain/core` |
| 2 | `src/lib/agents/types.ts` | CREATE | All agent framework interfaces |
| 3 | `src/lib/agents/registry.ts` | CREATE | Map-based agent type registry |
| 4 | `src/lib/agents/content.ts` | CREATE | `extractTextContent()` utility |
| 5 | `src/lib/agents/history.ts` | CREATE | `buildMessages()` with 30-msg cap |
| 6 | `src/lib/agents/context-builder.ts` | CREATE | 8-step system prompt assembly |
| 7 | `src/lib/agents/engine.ts` | CREATE | `chatWithToolLoop()` — LLM ↔ tool cycle |
| 8 | `src/lib/agents/router.ts` | CREATE | LLM-based module dispatcher |
| 9 | `src/lib/agents/process-message.ts` | CREATE | End-to-end message orchestrator |
| 10 | `src/lib/agents/agents/echo.ts` | CREATE | Minimal echo agent for testing |
| 11 | `src/lib/agents/index.ts` | CREATE | Barrel exports + agent auto-imports |
| 12 | `src/services/whatsapp.ts` | CREATE | WhatsApp API client (send, verify) |
| 13 | `src/app/api/webhooks/whatsapp/route.ts` | CREATE | GET (verify) + POST (receive) |
| 14 | `src/lib/validations/webhook.ts` | CREATE | Zod schemas for webhook payloads |

---

## Task 1: Install Dependencies

```bash
npm install @langchain/openai @langchain/core
```

---

## Task 2: Agent Framework Types

### `src/lib/agents/types.ts` (NEW)

```ts
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleType } from "@/types";

// ── Tool Call Context ──
export interface ToolCallContext {
  supabase: SupabaseClient;       // admin client
  conversationId: string;
  recipientId: string;            // patient_id
  clinicId: string;
  userId?: string;
}

// ── Tool Call Result ──
export interface ToolCallResult {
  result?: string;                   // feedback for the LLM
  appendToResponse?: string;         // appended to final message (links, etc.)
  newConversationStatus?: string;    // updates conversation.status
  responseData?: Record<string, unknown>;
}

// ── Tool Call Input ──
export interface ToolCallInput {
  name: string;
  args: Record<string, unknown>;
}

// ── WhatsApp Template Config ──
export interface WhatsAppTemplateConfig {
  templateName: string;
  templateLanguage: string;
  getTemplateParams(recipient: RecipientContext, agentName: string): string[];
  getTemplateBody(recipient: RecipientContext, agentName: string): string;
}

// ── Recipient Context ──
export interface RecipientContext {
  id: string;
  firstName: string;
  fullName: string;
  phone: string;
  observations?: string;
  customFields?: Record<string, unknown>;
}

// ── Business Context ──
export interface BusinessContext {
  clinicName: string;
  phone?: string;
  address?: string;
  timezone: string;
  insurancePlans: string[];
  services: string[];
}

// ── System Prompt Build Params ──
export interface SystemPromptParams {
  agentName: string;
  agentDescription?: string;
  customInstructions?: string;
  successCriteria?: string;
  businessContext?: BusinessContext;
  tone: "professional" | "friendly" | "casual";
  locale: "pt-BR" | "en" | "es";
}

// ── Agent Type Config ──
export interface AgentTypeConfig {
  type: string;
  buildSystemPrompt(params: SystemPromptParams, recipient?: RecipientContext): string;
  getInstructions(tone: string, locale: string): string;
  getTools(options: AgentToolOptions): StructuredToolInterface[];
  handleToolCall(toolCall: ToolCallInput, context: ToolCallContext): Promise<ToolCallResult>;
  supportedChannels: ("gmail" | "whatsapp")[];
  whatsappTemplate?: WhatsAppTemplateConfig;
}

// ── Agent Tool Options ──
export interface AgentToolOptions {
  clinicId: string;
  conversationId: string;
  locale: string;
}

// ── Engine Result ──
export interface EngineResult {
  responseText: string;
  appendToResponse?: string;
  newConversationStatus?: string;
  responseData?: Record<string, unknown>;
  toolCallCount: number;
}

// ── Router Result ──
export interface RouterResult {
  module: ModuleType;
  reason: string;
}

// ── Message Processing Result ──
export interface ProcessMessageResult {
  conversationId: string;
  responseText: string;
  module: string;
  toolCallCount: number;
  queued: boolean;
}
```

---

## Task 3: Registry

### `src/lib/agents/registry.ts` (NEW)

- `Map<string, AgentTypeConfig>` as module-level store
- `registerAgentType(config)` — validates `config.type` uniqueness, adds to map
- `getAgentType(type)` — returns config or `undefined`
- `getRegisteredTypes()` — returns array of registered type keys

---

## Task 4: Content Extraction

### `src/lib/agents/content.ts` (NEW)

```ts
export function extractTextContent(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: "text"; text: string } =>
        typeof b === "object" && b !== null && "type" in b && b.type === "text" && "text" in b && typeof b.text === "string"
      )
      .map((b) => b.text)
      .join("");
  }
  return String(content);
}
```

---

## Task 5: Message History Builder

### `src/lib/agents/history.ts` (NEW)

- `buildMessages(systemPrompt, history, userMessage)` → array of LangChain message objects
- Maps `role` to `SystemMessage`, `HumanMessage`, `AIMessage`
- Caps history at 30 messages (trim oldest, keep system + latest user)
- History input type: `Array<{ role: "user" | "assistant" | "system"; content: string }>`

---

## Task 6: Context Builder

### `src/lib/agents/context-builder.ts` (NEW)

- `buildSystemPrompt(agentConfig, params, recipient?)` → `string`
- Assembles prompt in the **exact 8-step order**:
  1. Base prompt from `agentConfig.buildSystemPrompt(params, recipient)`
  2. Agent name: `Your name is "{params.agentName}".`
  3. Description: `About you: {params.agentDescription}`
  4. Custom instructions: `Specific instructions:\n{params.customInstructions}`
  5. Success criteria: `Success criteria:\n{params.successCriteria}`
  6. Tool instructions (extracted from agent config tools' descriptions)
  7. Business context (clinic name, phone, address, timezone, services, insurance)
  8. Recipient context (name, phone, observations)
- Skips empty/undefined sections

---

## Task 7: Tool Loop Engine

### `src/lib/agents/engine.ts` (NEW)

- `chatWithToolLoop(options)` → `Promise<EngineResult>`
- Options: `{ model, messages, tools, agentConfig, toolCallContext, maxIterations? }`
- Loop (max 5 iterations):
  1. Invoke LLM with messages + tools
  2. If no tool calls → extract text → return
  3. For each tool call → `agentConfig.handleToolCall()` → collect side effects
  4. Append `AIMessage` (with tool_calls) + `ToolMessage` (results) to messages
  5. Continue loop
- Side effects accumulate: last `newConversationStatus` wins, `appendToResponse` concatenates
- Uses `ChatOpenAI` from `@langchain/openai` with `OPENAI_MODEL` env var
- Max 2 retries on LLM calls

---

## Task 8: LLM Router

### `src/lib/agents/router.ts` (NEW)

- `routeMessage(options)` → `Promise<RouterResult>`
- Options: `{ message, patientContext?, activeModules }`
- Lightweight LLM call (max_tokens: 100, no tools)
- System prompt: "Classify the intent... return JSON { module, reason }"
- Parse response: strip markdown fences, extract JSON
- Validate `module` is in `activeModules` list
- Fallback to `"support"` on parse failure or unknown module

---

## Task 9: WhatsApp Service

### `src/services/whatsapp.ts` (NEW)

```ts
import "server-only";
import crypto from "crypto";

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// ── Types ──
interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ── Send text message ──
export async function sendTextMessage(to: string, text: string): Promise<SendMessageResult>
// POST to {BASE_URL}/{PHONE_NUMBER_ID}/messages
// Body: { messaging_product: "whatsapp", to, type: "text", text: { body: text } }
// Authorization: Bearer {WHATSAPP_API_TOKEN}
// Never throws — returns { success: false, error } on failure

// ── Send template message ──
export async function sendTemplateMessage(
  to: string, templateName: string, language: string, params: string[]
): Promise<SendMessageResult>
// Same endpoint, type: "template"

// ── Verify webhook signature ──
export function verifySignature(payload: string, signature: string): boolean
// HMAC-SHA256 with META_APP_SECRET
// Uses crypto.timingSafeEqual for constant-time comparison
// signature header format: "sha256=..."

// ── Normalize phone number ──
export function normalizePhone(phone: string): string
// Strip non-digits, ensure country code
```

---

## Task 10: Webhook Validation Schemas

### `src/lib/validations/webhook.ts` (NEW)

Zod schemas for WhatsApp webhook payload structure:
- `whatsappMessageSchema` — validates the incoming message object
- Used for runtime validation of webhook data

---

## Task 11: Message Processing Orchestrator

### `src/lib/agents/process-message.ts` (NEW)

The core pipeline that connects everything:

```
1. Receive (phone, message, externalId, clinicId)
2. Idempotency check: SELECT by external_id → skip if exists
3. Find patient by phone in clinic
4. Find or create conversation (clinic_id + patient_id + channel + active status)
5. Save incoming message to DB
6. Load conversation history (last 30 messages)
7. Route message to module (LLM router or current_module)
8. Get agent config from registry by module type
9. Find agent row in DB (clinic_id + type + active)
10. Build system prompt via context-builder
11. Run chatWithToolLoop
12. Save assistant response to DB
13. Update conversation (current_module, status)
14. Queue outbound message in message_queue (status: pending)
15. Send via WhatsApp service
16. Update queue status to sent/failed
17. Return result
```

---

## Task 12: Echo Agent

### `src/lib/agents/agents/echo.ts` (NEW)

Minimal agent for testing the framework end-to-end:

- Type: `"echo"`
- `buildSystemPrompt`: "You are a friendly echo bot. Repeat back what the user says with a greeting."
- `getTools`: returns `[]` (no tools)
- `handleToolCall`: warns on unknown tool, returns `{}`
- `getInstructions`: simple instructions in all 3 locales
- `supportedChannels`: `["whatsapp"]`

Registered via `registerAgentType()`.

---

## Task 13: Agent Barrel Exports

### `src/lib/agents/index.ts` (NEW)

- Re-exports all types
- Re-exports registry functions
- Re-exports engine, router, process-message
- Imports echo agent (triggers auto-registration)

---

## Task 14: WhatsApp Webhook Route

### `src/app/api/webhooks/whatsapp/route.ts` (NEW)

#### GET — Webhook Verification (Meta handshake)
```ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
```

#### POST — Receive Messages
```ts
export async function POST(request: Request) {
  // 1. Read raw body for signature verification
  // 2. Verify HMAC-SHA256 signature (x-hub-signature-256 header)
  // 3. Parse body as JSON
  // 4. Extract messages from webhook payload structure:
  //    body.entry[0].changes[0].value.messages[0]
  // 5. Skip non-text messages for now (images, audio, etc.)
  // 6. For each text message:
  //    a. Look up clinic by whatsapp phone number ID
  //    b. Call processMessage() inside after()
  // 7. Return 200 immediately (before processing)
}
```

Uses `after()` from `next/server` for async processing post-response.

---

## Implementation Order

```
Phase A — Foundation (no dependencies, parallel):
  1. npm install @langchain/openai @langchain/core
  2. src/lib/agents/types.ts
  3. src/lib/agents/content.ts
  4. src/lib/validations/webhook.ts

Phase B — Framework Core (depends on A):
  5. src/lib/agents/registry.ts
  6. src/lib/agents/history.ts
  7. src/lib/agents/context-builder.ts
  8. src/services/whatsapp.ts

Phase C — Engine + Router (depends on B):
  9. src/lib/agents/engine.ts
  10. src/lib/agents/router.ts

Phase D — Orchestration (depends on C):
  11. src/lib/agents/agents/echo.ts
  12. src/lib/agents/process-message.ts
  13. src/lib/agents/index.ts

Phase E — Webhook (depends on D):
  14. src/app/api/webhooks/whatsapp/route.ts

Phase F — Verification:
  15. npx tsc --noEmit && npm run build
```

---

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm run build` — all routes compile, no build errors
3. **Webhook verification test**: `curl "localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=test123"` → should return `test123`
4. **Framework structure test**: Import `getAgentType("echo")` from registry → confirm config is valid
5. **End-to-end** (when WhatsApp is connected): Send message to WhatsApp number → verify conversation created in DB → response received

---

## Scope Boundaries (NOT building in this phase)

- Real agent types (support, scheduling, etc.) — Phase 6+
- Gmail webhook — future phase
- Cron-based message queue processing — Phase 8
- Rate limiting on webhook — fast follow
- Tests — will add in a testing-focused pass
- WhatsApp template approval/registration in Meta — ops task
- Settings UI for WhatsApp connection status — already placeholder from Phase 4
