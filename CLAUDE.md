# CLAUDE.md

Engineering standards for this repository.
Follow strictly when generating, modifying, or reviewing code.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Next.js 16 (App Router) — `proxy.ts` replaces middleware |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first config — no `tailwind.config.*`) |
| AI | LangChain + OpenAI |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Payments | Pagar.me |
| Email | Gmail API + Google Pub/Sub |
| WhatsApp | Meta WhatsApp Business API |
| Calendar | Google Calendar API |
| i18n | next-intl (`pt-BR`, `en`, `es`) — default: `pt-BR` |
| Validation | Zod |
| Testing | Vitest + React Testing Library |

No alternative libraries without explicit approval.

---

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `AgentCard.tsx` |
| Hooks | camelCase + `use` prefix | `useAgentStatus.ts` |
| Utilities | camelCase | `formatCurrency.ts` |
| Types/Interfaces | PascalCase | `AgentConfig` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Files/folders | kebab-case | `agent-card.tsx` |
| Route groups | `(feature)` | `(dashboard)` |
| API routes | kebab-case | `api/agent-status/route.ts` |
| Path alias | `@/*` → `./src/*` | `@/lib/utils` |

---

## TypeScript

- `strict` mode is mandatory.
- **Never use `any`.** Use `unknown` and narrow explicitly.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Shared types live in `src/types/`. One file per domain.
- **Runtime validation** at all system boundaries using Zod: API inputs, form submissions, webhook payloads.
- Never use `as unknown as` casts. Use Supabase generated types or narrow properly.
- Avoid type assertions (`as`) — prefer type guards and discriminated unions.
- Export types from the module that owns them. Re-export from `src/types/` only for cross-cutting concerns.

---

## Components & Rendering

- **Server Components by default.** Add `"use client"` only when the component uses state, effects, event handlers, or browser APIs.
- Props interface: `{ComponentName}Props`.
- **Never hardcode user-facing strings** — always `useTranslations()` from `next-intl`.
- One component per file. Co-locate component-specific types in the same file.
- Avoid prop drilling beyond 2 levels — use composition or context.
- Prefer composition over configuration: small, focused components over large ones with many props.

---

## Styling

- Tailwind v4 utilities only. Theme config via CSS variables in `globals.css` (`@theme inline`).
- No `tailwind.config.*` file. No CSS modules. No styled-components.
- Mobile-first: `sm`, `md`, `lg`.
- Extract repeated UI patterns into components, not `@apply` abstractions.
- Use semantic CSS variables for colors — never hardcode hex values in components.

---

## Data & State Management

- **Server-side data fetching first.** Only fetch on the client when real-time or user interaction requires it.
- Client state: local → `useState`/`useReducer`, shared UI → React Context (`src/contexts/`).
- No global state library. If you need one, ask first.
- Supabase clients (three files, never mix):
  - `client.ts` → browser only (`"use client"`)
  - `server.ts` → SSR (reads cookies/session)
  - `admin.ts` → service role (webhooks, cron — `import "server-only"`)
- Environment variables: `NEXT_PUBLIC_*` → client. Everything else → server only. Never leak server secrets to the client.

---

## API Routes

- Wrap `request.json()` in `try/catch` → return `400` on invalid JSON.
- **Validate all inputs with Zod.** Schemas live in `src/lib/validations/`.
- Apply rate limiting to all mutating endpoints.
- Secret comparison: `crypto.timingSafeEqual()` — never `===`.
- Return consistent response shapes: `{ data }` on success, `{ error }` on failure.
- Use appropriate HTTP status codes. Don't return `200` for errors.

### Webhook Routes

- Always use `createAdminClient()` — never session-based auth.
- Verify signatures cryptographically (HMAC-SHA256 for WhatsApp, OIDC for Gmail).
- Implement idempotency: deduplicate by external message ID before processing.
- Return `200` for success or known skip only. `5xx` triggers provider retry.
- Use `after()` from `next/server` for async work that must complete after the HTTP response.

### `after()` Pattern

```ts
import { after } from "next/server";

after(async () => {
  const supabase = createAdminClient();
  await processAsync(supabase, params);
});
return NextResponse.json({ status: "ok" });
```

---

## Services Layer

- All external API integrations live in `src/services/`. One file per integration.
- Services log their own errors. Callers decide retry/fallback/user messaging.
- Fire-and-forget async calls must `.catch()` and log — never leave unhandled promises.
- Queue tables follow the pattern: `pending` → `processing` → `sent`/`failed`, with max 3 attempts.
- Never throw from a service that sends messages (email/WhatsApp). Return a result type instead.

---

## Database

- **All tables enforce RLS.** Users can only access rows where `user_id = auth.uid()`.
- Migrations are sequential, numbered with zero-padded prefix (`001_`, `002_`, etc.).
- Phone numbers: always stored digits-only. Normalize on write.
- Monetary amounts: always in **cents** (integer). `15000` = R$150.00.
- Use `created_at` and `updated_at` with triggers for audit trails.
- Prefer partial unique indexes over application-level uniqueness checks.
- Use `agent_id` as nullable FK — module-based flows may not have a linked agent.
- Foreign keys should cascade deletes only when the child has no independent meaning.

---

## AI / LLM — General Rules

- Use `ChatOpenAI` from `@langchain/openai`. Model from env `OPENAI_MODEL` with hardcoded fallback.
- Retry: max 2 retries, exponential backoff.
- Tool loop: max 5 iterations. If the LLM hasn't resolved after 5 tool calls, stop.
- History cap: feed at most 30 messages to the LLM for context.
- **The LLM must never fabricate URLs.** Payment links, calendar links — always from tools.
- System prompt construction follows a strict, documented order. Don't skip steps.
- Handle LLM content as `string | ContentBlock[]` — always extract text before using.

---

## Agent Architecture (LangChain)

### Core Concepts

The agent system is built on three layers:

1. **Registry** — a `Map<string, AgentTypeConfig>` where each agent type auto-registers on import.
2. **Context Builder** — assembles system prompt + tools + business context for a given agent + recipient.
3. **Execution Engine** — `chatWithToolLoop()` drives the multi-turn LLM ↔ tool cycle.

### Agent Type Contract (`AgentTypeConfig`)

Every agent type **must** implement this interface. No partial implementations.

```ts
interface AgentTypeConfig {
  type: string;                          // Unique key: "billing", "intake", etc.

  // --- Prompt ---
  buildSystemPrompt(params, recipient?): string;
  getInstructions(tone, locale): string;

  // --- Tools ---
  getTools(agentOptions): StructuredToolInterface[];
  handleToolCall(toolCall, context): Promise<ToolCallResult>;

  // --- Metadata ---
  supportedChannels: ('gmail' | 'whatsapp')[];
  whatsappTemplate?: WhatsAppTemplateConfig;
}
```

**Rules:**
- `buildSystemPrompt` must follow the prompt assembly order (see below).
- `getTools` returns an empty array `[]` if the agent has no tools — never `undefined`.
- `handleToolCall` must handle unknown tool names gracefully (log + return empty result).
- `getInstructions` must support all three locales (`pt-BR`, `en`, `es`) and at least `professional` tone.

### Registering a New Agent

```ts
// src/lib/agents/registry/my-agent.ts
import { registerAgentType } from "./store";
import type { AgentTypeConfig } from "./types";

const config: AgentTypeConfig = {
  type: "my-agent",
  buildSystemPrompt(params, recipient) { /* ... */ },
  getTools(options) { return []; },
  handleToolCall(toolCall, context) { return {}; },
  getInstructions(tone, locale) { return "..."; },
  supportedChannels: ["whatsapp"],
};

registerAgentType(config);
```

Then import it in `src/lib/agents/registry/index.ts` so it auto-registers.

**Rules:**
- One file per agent type. File name = agent type key in kebab-case.
- Never register two agents with the same `type` key.
- Keep agent configs declarative. Business logic belongs in tool handlers, not in the config.

### System Prompt Assembly Order

Build the prompt in this exact order. Each section is optional but the order is not.

1. **Base prompt** — agent-type-specific personality and behavior rules.
2. **Agent name** — `Your name is "{name}".`
3. **Description** — `About you: {description}`
4. **Custom instructions** — `Specific instructions:\n{instructions}`
5. **Success criteria** — from `success_integration` (free text or parsed config).
6. **Tool instructions** — explicit rules for each tool (e.g., "never fabricate URLs").
7. **Business context** — from `business_profiles` table (company, hours, tone, etc.).
8. **Recipient context** — who the agent is talking to (name, observations, custom fields).

**Rules:**
- Never skip the tool instructions section if the agent has tools.
- Business context is injected by the context builder, not by the agent config.
- Recipient context must always be last — it's the most specific and most likely to change.

### Defining Tools

Use the `tool()` factory from `@langchain/core/tools` with a Zod schema:

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const myTool = tool(
  async (input) => {
    // Return a JSON string describing the ACTION to take.
    // Do NOT execute side effects here — that happens in handleToolCall.
    return JSON.stringify({
      action: "my_action",
      value: input.value,
    });
  },
  {
    name: "my_tool",
    description: "Clear, specific description of what this tool does and WHEN the LLM should use it.",
    schema: z.object({
      value: z.string().describe("What this parameter means to the LLM."),
    }),
  }
);
```

**Rules:**
- The tool function is a **stub** — it returns a serialized intent, not a side effect. The real work happens in `handleToolCall`.
- Every parameter must have a `.describe()` — this is the LLM's documentation.
- Tool names use `snake_case`. Tool descriptions are written for the LLM, not for developers.
- Monetary values are always `z.number().int().positive()` (cents).
- Dates are always ISO 8601 with timezone.
- Never define a tool that returns a URL the LLM should present to the user. Use `appendToResponse` instead.

### Handling Tool Calls

```ts
handleToolCall: async (toolCall, context) => {
  switch (toolCall.name) {
    case "my_tool":
      return handleMyTool(toolCall.args, context);
    default:
      console.warn(`[my-agent] Unknown tool: ${toolCall.name}`);
      return {};
  }
}
```

Each handler returns a `ToolCallResult`:

```ts
interface ToolCallResult {
  result?: string;                    // Feedback text for the LLM
  appendToResponse?: string;          // Appended to the final message (links, etc.)
  newConversationStatus?: string;     // Updates conversation.status in DB
  responseData?: Record<string, unknown>;
}
```

**Rules:**
- `result` is what the LLM sees. Write it as if briefing the agent: "Payment link created successfully for R$150.00."
- `appendToResponse` is what the **user** sees appended after the LLM response. Use it for URLs and structured data the LLM must not hallucinate.
- `newConversationStatus` is applied **after** the entire tool loop finishes — last non-null value wins.
- Tool handlers receive a `ToolCallContext` with `supabase` (admin client), `conversationId`, `recipientId`, `userId`. Use it for all DB operations.
- Never throw from a tool handler. Return a descriptive `result` string on failure so the LLM can inform the user.

### The Tool Loop (`chatWithToolLoop`)

```
User message
    ↓
┌─────────────────────────────┐
│  LLM invocation (with tools)│ ← max 5 iterations
│         ↓                   │
│  Tool calls? ──No──→ Return │
│         │ Yes               │
│         ↓                   │
│  Execute each tool          │
│  Collect side effects       │
│  Feed ToolMessage back      │
│         ↓                   │
│  Loop ──────────────────────│
└─────────────────────────────┘
```

**Rules:**
- Max 5 iterations is a hard limit. If the LLM is looping, the prompt is ambiguous — fix the prompt, don't raise the limit.
- Side effects (`appendToResponse`, `newConversationStatus`, `responseData`) accumulate across all iterations. Last `newConversationStatus` wins. `appendToResponse` strings concatenate.
- Apply side effects to the database **after** the loop finishes, not inside it.
- The tool resolver callback bridges `chatWithToolLoop` to `AgentTypeConfig.handleToolCall`. Keep it thin.

### Content Extraction

LLM responses can be `string` or `ContentBlock[]`. Always normalize:

```ts
function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("");
  }
  return String(content);
}
```

Never assume `content` is a string. Always extract.

### LLM Router (Module-Based Dispatch)

For multi-module systems, use an LLM classifier to route inbound messages:

```ts
interface RouterResult {
  module: string;   // Target module key
  reason: string;   // Brief classification reason (for logging)
}
```

**Rules:**
- The router is a **separate, lightweight LLM call** — low `max_tokens` (100), no tools.
- Provide the router with patient/user state (appointments, invoices, scores) so it can make informed decisions.
- Always define a fallback module (e.g., `intake`) for parse failures or unknown intents.
- Validate that the returned module is in the list of active modules. Reject and fallback otherwise.
- Strip markdown fences and extract JSON defensively — LLMs often wrap JSON in code blocks.

### Message History

```ts
function buildMessages(systemPrompt, history, userMessage) {
  return [
    new SystemMessage(systemPrompt),
    ...history.map((m) =>
      m.role === "user" ? new HumanMessage(m.content)
      : m.role === "assistant" ? new AIMessage(m.content)
      : new SystemMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];
}
```

**Rules:**
- Cap at 30 messages. Trim from the oldest, keep the system message and latest user message.
- Map `role` to LangChain message types explicitly. Don't use a generic `BaseMessage`.
- Never include raw tool call/result messages in the history sent to the LLM — only `user`, `assistant`, and `system`.

### Message Delivery (Never Throws)

The message sender (`sendAndQueueEmail`, `sendAndQueueWhatsApp`) must **never throw**:

- On success: queue row with status `sent`.
- On failure: queue row with status `pending` for retry (max 3 attempts).
- Return the status — let the caller decide what to do.

### Multi-Channel WhatsApp Templates

For proactive outreach via WhatsApp, agents can define a template config:

```ts
whatsappTemplate: {
  templateName: "appointment_reminder",
  templateLanguage: "pt_BR",
  getTemplateParams(recipient, agentName) {
    return [recipient.firstName, agentName];
  },
  getTemplateBody(recipient, agentName) {
    return `Olá ${recipient.firstName}, ...`;
  },
}
```

**Rules:**
- Template names must match exactly what's registered in Meta Business Manager.
- Template params are positional — order matters.
- Always provide a `getTemplateBody` for local preview/logging even though Meta renders the actual template.

### Agent Checklist (New Agent Type)

Before shipping a new agent type, verify:

- [ ] Config implements all required `AgentTypeConfig` methods
- [ ] Registered in `registry/index.ts` (auto-import)
- [ ] `buildSystemPrompt` follows the 8-step assembly order
- [ ] All tools have Zod schemas with `.describe()` on every param
- [ ] Tool handlers never throw — return descriptive error strings
- [ ] `handleToolCall` handles unknown tool names with a warning
- [ ] Instructions support all 3 locales and at least `professional` tone
- [ ] WhatsApp template (if any) matches Meta registration
- [ ] Conversation status transitions are documented
- [ ] Integration test covers the tool loop with mocked LLM responses

### Registered Agent Types

| Type | File | Tools | Channel |
|------|------|-------|---------|
| `support` | `agents/basic-support.ts` | `get_clinic_info`, `escalate_to_human`, `route_to_module` | whatsapp |
| `scheduling` | `agents/scheduling.ts` | `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `list_patient_appointments`, `escalate_to_human` | whatsapp |
| `confirmation` | `agents/confirmation.ts` | `confirm_attendance`, `reschedule_from_confirmation`, `mark_no_show` | whatsapp |
| `nps` | `agents/nps.ts` | `collect_nps_score`, `collect_nps_comment`, `redirect_to_google_reviews`, `alert_detractor` | whatsapp |
| `billing` | `agents/billing.ts` | `create_payment_link`, `check_payment_status`, `send_payment_reminder`, `escalate_billing` | whatsapp |
| `recall` | `agents/recall.ts` | `send_reactivation_message`, `route_to_scheduling`, `mark_patient_inactive` | whatsapp |

### Outbound Messaging (`src/lib/agents/outbound.ts`)

Shared utility for proactive (system-initiated) messages:
- **Business hours:** 8am-8pm Mon-Sat in the clinic's timezone. Sunday = no outbound.
- **Rate limit:** Max 3 messages per patient per day.
- `sendOutboundMessage()` — text messages (for within 24h window).
- `sendOutboundTemplate()` — WhatsApp template messages (for >24h window).

### Cron Routes

| Route | Schedule | Purpose |
|-------|----------|---------|
| `GET /api/cron/confirmations` | `*/15 * * * *` | Scans `confirmation_queue`, sends reminders |
| `GET /api/cron/nps` | `0 */2 * * *` | Surveys patients after completed appointments |
| `GET /api/cron/recall` | `0 6 * * *` | Enqueues inactive patients for reactivation |
| `GET /api/cron/recall-send` | `*/30 * * * *` | Sends pending recall messages |

Auth: `Authorization: Bearer {CRON_SECRET}` (verified with `crypto.timingSafeEqual()`).

**Auto-enqueue:** When `book_appointment` creates an appointment, it auto-inserts 48h/24h/2h entries into `confirmation_queue` via `enqueueConfirmations()`.

---

## Error Handling

- Catch errors at service boundaries. Let UI errors propagate to error boundaries (`error.tsx`).
- Log with context: operation name, entity IDs, sanitized inputs. Never log secrets or PII.
- UI errors: translated via `next-intl`, user-friendly, no stack traces exposed.
- Webhooks: `5xx` → provider retries. `200` → success or known skip only.
- Every page group should include `loading.tsx`, `not-found.tsx`, and `error.tsx`.

---

## Security

- Never commit secrets or `.env` files.
- Validate and sanitize all external input at the boundary (Zod).
- Server secrets must never use `NEXT_PUBLIC_*` prefix.
- Secret comparison: `crypto.timingSafeEqual()` — never `===`.
- Webhook auth: cryptographic signature verification. Never trust unverified payloads.
- Rate limit all public-facing and mutating endpoints.
- Use parameterized queries (Supabase client handles this). Never concatenate SQL.

---

## Testing

- Runner: Vitest. UI: React Testing Library.
- File pattern: `src/__tests__/{path}/{name}.test.ts(x)`
- Test: business logic, data transformations, validations, API route handlers.
- Do not test: styling, framework internals, trivial getters/setters.
- Tests must be isolated and deterministic. No shared mutable state between tests.
- Mock external services (Supabase, OpenAI, etc.). Never call real APIs in tests.
- Prefer integration tests for API routes. Prefer unit tests for pure functions.

---

## Eval System

CLI-driven evaluation pipeline that runs YAML scenarios against real LangChain agents, scores responses with deterministic checks + LLM judge, and proposes improvements.

### Running Evals

```bash
npm run eval                                    # Run all scenarios
npm run eval -- --agent scheduling              # Filter by agent type
npm run eval -- --scenario nps-promoter-flow    # Single scenario
npm run eval -- --verbose                       # Detailed per-turn output
npm run eval -- --threshold 7                   # Custom pass threshold (default: 5)
```

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` in `.env`.

### Architecture

| Component | File | Purpose |
|-----------|------|---------|
| Types | `src/lib/eval/types.ts` | Zod schemas and TypeScript interfaces |
| Loader | `src/lib/eval/loader.ts` | Reads YAML scenarios from `evals/scenarios/{agent}/` |
| Fixtures | `src/lib/eval/fixtures.ts` | Seeds and cleans up test data in Supabase |
| Runner | `src/lib/eval/runner.ts` | Orchestrates multi-turn scenario execution via `processMessage()` |
| Checker | `src/lib/eval/checker.ts` | Deterministic pass/fail checks (tools called, response content, DB assertions) |
| Judge | `src/lib/eval/judge.ts` | LLM-based scoring on 5 dimensions (correctness, helpfulness, tone, safety, conciseness) |
| Analyst | `src/lib/eval/analyst.ts` | Reviews failures via LLM and proposes specific fixes |
| Reporter | `src/lib/eval/reporter.ts` | CLI output formatting + JSON report to `evals/reports/` |
| CLI | `src/scripts/eval.ts` | Entry point with arg parsing |

### Scenario Format

Scenarios are YAML files in `evals/scenarios/{agent-type}/`. Each scenario defines a persona, fixtures, and conversation turns with expectations.

```yaml
id: scheduling-happy-path-booking
agent: scheduling
locale: pt-BR
description: "Patient books a standard appointment"

persona:
  name: Maria Silva
  phone: "11987650003"

fixtures:
  professionals:
    - id: eval-prof-1                    # Mapped to real UUID at runtime
      name: Dr. Joao Silva
      specialty: Cardiologia
  services:
    - id: eval-svc-1
      name: Consulta Cardiologica

turns:
  - user: "Quero marcar uma consulta com o Dr. Joao"
    expect:
      tools_called: [check_availability]
      no_tools: [book_appointment]

  - user: "Pode ser o primeiro horario disponivel"
    expect:
      tools_called: [book_appointment]
```

### Writing Scenarios

- Fixture IDs (e.g. `eval-prof-1`) are mapped to real UUIDs at runtime — use any string.
- `tools_called` checks that specific tools were invoked during the turn.
- `no_tools` checks that specific tools were NOT invoked.
- `response_contains` / `response_not_contains` check the agent's text response.
- `response_matches` checks the response against a regex pattern.
- Valid agent types: `support`, `scheduling`, `confirmation`, `nps`, `billing`, `recall`.

### Scoring

- Each turn gets a deterministic check (pass/fail) and an LLM judge score (0-10).
- Overall score = average judge score minus 1.5 points per deterministic failure.
- Status: `pass` (>= 7), `warn` (5-7), `fail` (< 5 or any deterministic failure).

---

## Git

- Commit messages: imperative, lowercase, max 72 characters.
- Branches: `feature/short-description`, `fix/short-description`.
- One logical change per commit. Don't mix refactoring with features.
- English only for code, comments, commits, logs, and documentation.
- User-facing text lives exclusively in `messages/{locale}.json`.

---

## Code Quality Principles

1. **No over-engineering.** Only build what is needed now. Three similar lines are better than a premature abstraction.
2. **No dead code.** If it's unused, delete it. Don't comment it out "for later."
3. **No magic values.** Extract into named constants or config.
4. **Fail fast.** Validate inputs early. Return errors immediately — don't nest deep.
5. **Single responsibility.** Each function, component, and file does one thing.
6. **Explicit over implicit.** Prefer verbose clarity over clever brevity.
7. **Colocation.** Keep related code together. Don't scatter a feature across 10 folders.
8. **Boundaries matter.** Validate at system edges (API routes, webhooks, form submissions). Trust internal code.
9. **Composition over inheritance.** Always.
10. **Consistency over preference.** Follow existing patterns in the codebase, even if you'd do it differently.

---

## Self-Maintenance

This file must stay in sync with the codebase. Update CLAUDE.md in the same commit as any change that affects:

- Project structure (new/removed files or folders)
- Database schema (new migrations)
- API routes (new/removed endpoints)
- Dependencies or tech stack changes
- Environment variables
- Architectural patterns or conventions
- Agent types in the registry

Keep it concise and factual. Document what exists, not what might exist.
