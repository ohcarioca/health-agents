# Phase 6: Basic Support Agent + Inbox — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** First real agent in production. Patient sends WhatsApp message, agent answers clinic FAQ, escalates to human when it cannot resolve. Inbox on web shows conversations with take-over/hand-back actions.

**Architecture:** Replace the echo agent with a Basic Support agent that has 3 tools (get_clinic_info, escalate_to_human, route_to_module). The existing agent framework (registry, engine, context-builder, router, process-message) from Phase 5 remains unchanged — we only add a new agent type and upgrade the Inbox shell to a functional page with API routes.

**Tech Stack:** Next.js 16 App Router, LangChain + OpenAI (tools via `@langchain/core/tools`), Supabase (admin client), Zod validation, Vitest, next-intl (pt-BR/en/es), Tailwind CSS v4.

---

## Summary of Changes

| Area | What changes |
|------|-------------|
| New file | `src/lib/agents/agents/basic-support.ts` — Support agent config + tool definitions + tool handlers |
| Modify | `src/lib/agents/index.ts` — Add side-effect import for basic-support |
| New file | `src/app/api/inbox/conversations/route.ts` — List conversations API |
| New file | `src/app/api/inbox/conversations/[id]/route.ts` — Single conversation + messages API |
| New file | `src/app/api/inbox/conversations/[id]/take-over/route.ts` — Human take-over action |
| New file | `src/app/api/inbox/conversations/[id]/hand-back/route.ts` — Hand back to agent |
| New file | `src/app/api/inbox/conversations/[id]/messages/route.ts` — Send human message via WhatsApp |
| New file | `src/lib/validations/inbox.ts` — Zod schemas for inbox API inputs |
| New file | `src/components/inbox/conversation-list.tsx` — Client component for conversation sidebar |
| New file | `src/components/inbox/conversation-detail.tsx` — Client component for chat view |
| New file | `src/components/inbox/message-bubble.tsx` — Message display component |
| Modify | `src/app/(dashboard)/inbox/page.tsx` — Replace shell with real server component |
| Modify | `messages/pt-BR.json`, `messages/en.json`, `messages/es.json` — Add inbox strings |
| New file | `src/__tests__/lib/agents/basic-support.test.ts` — Agent unit tests |
| New file | `src/__tests__/api/inbox/conversations.test.ts` — API route tests |

---

## Task 1: Basic Support Agent — Tool Definitions

**Files:**
- Create: `src/lib/agents/agents/basic-support.ts`

This task creates the tool stubs using `@langchain/core/tools`. Per CLAUDE.md, tool functions are stubs that return serialized intents — real work happens in `handleToolCall`.

**Step 1: Create the basic-support agent file with tool definitions**

```typescript
// src/lib/agents/agents/basic-support.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import type {
  AgentTypeConfig,
  AgentToolOptions,
  SystemPromptParams,
  RecipientContext,
  ToolCallInput,
  ToolCallContext,
  ToolCallResult,
} from "../types";

// ── Tool Stubs ──

const getClinicInfoTool = tool(
  async () => {
    return JSON.stringify({ action: "get_clinic_info" });
  },
  {
    name: "get_clinic_info",
    description:
      "Retrieves clinic information including operating hours, address, phone, accepted insurance plans, and available services. Use this when the patient asks about the clinic.",
    schema: z.object({}),
  }
);

const escalateToHumanTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "escalate_to_human",
      reason: input.reason,
    });
  },
  {
    name: "escalate_to_human",
    description:
      "Escalates the conversation to a human attendant. Use this when you cannot answer the patient's question after 2 attempts, or when the patient explicitly asks to speak with a human.",
    schema: z.object({
      reason: z
        .string()
        .describe("Brief reason for escalation, e.g. 'patient question outside FAQ scope'"),
    }),
  }
);

const routeToModuleTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "route_to_module",
      module: input.module,
      context: input.context,
    });
  },
  {
    name: "route_to_module",
    description:
      "Routes the conversation to another module when the patient's intent matches a different service. Use this when the patient wants to book an appointment (scheduling), has a billing question (billing), etc.",
    schema: z.object({
      module: z
        .enum(["scheduling", "confirmation", "nps", "billing", "recall"])
        .describe("Target module to route the conversation to."),
      context: z
        .string()
        .describe("Brief context about what the patient needs, to help the target module."),
    }),
  }
);

// ── System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Você é um assistente virtual de atendimento de uma clínica de saúde. Seu papel é responder perguntas frequentes dos pacientes de forma amigável e profissional.

Regras:
- Use o primeiro nome do paciente quando disponível.
- Seja cordial, use um tom profissional com emojis moderados.
- Sempre use a ferramenta get_clinic_info para buscar dados reais da clínica antes de responder perguntas sobre horários, endereço, convênios ou serviços.
- NUNCA invente informações. Se não souber, use escalate_to_human.
- Se o paciente quiser agendar, remarcar ou cancelar consulta, use route_to_module com module="scheduling".
- Se o paciente quiser falar sobre pagamento ou cobrança, use route_to_module com module="billing".
- Após 2 tentativas sem conseguir resolver, use escalate_to_human.
- Responda sempre em português brasileiro.`,

  en: `You are a virtual assistant for a healthcare clinic. Your role is to answer patient FAQ in a friendly, professional manner.

Rules:
- Use the patient's first name when available.
- Be cordial, professional tone with moderate emoji use.
- Always use the get_clinic_info tool to fetch real clinic data before answering questions about hours, address, insurance, or services.
- NEVER fabricate information. If unsure, use escalate_to_human.
- If the patient wants to book, reschedule, or cancel an appointment, use route_to_module with module="scheduling".
- If the patient wants to discuss payment or billing, use route_to_module with module="billing".
- After 2 failed attempts to resolve, use escalate_to_human.
- Always respond in English.`,

  es: `Eres un asistente virtual de atención de una clínica de salud. Tu rol es responder preguntas frecuentes de los pacientes de forma amigable y profesional.

Reglas:
- Usa el primer nombre del paciente cuando esté disponible.
- Sé cordial, tono profesional con emojis moderados.
- Siempre usa la herramienta get_clinic_info para buscar datos reales de la clínica antes de responder preguntas sobre horarios, dirección, seguros o servicios.
- NUNCA inventes información. Si no sabes, usa escalate_to_human.
- Si el paciente quiere agendar, reprogramar o cancelar una cita, usa route_to_module con module="scheduling".
- Si el paciente quiere hablar sobre pagos o cobros, usa route_to_module con module="billing".
- Después de 2 intentos sin resolver, usa escalate_to_human.
- Responde siempre en español.`,
};

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Responda perguntas frequentes da clínica. Use get_clinic_info para dados reais. Escale para humano após 2 tentativas sem sucesso.",
  en: "Answer clinic FAQ. Use get_clinic_info for real data. Escalate to human after 2 failed attempts.",
  es: "Responde preguntas frecuentes de la clínica. Usa get_clinic_info para datos reales. Escala a humano después de 2 intentos fallidos.",
};

// ── Tool Handlers ──

async function handleGetClinicInfo(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const { supabase, clinicId } = context;

  const [clinicResult, plansResult, servicesResult] = await Promise.all([
    supabase
      .from("clinics")
      .select("name, phone, address, timezone, operating_hours")
      .eq("id", clinicId)
      .single(),
    supabase
      .from("insurance_plans")
      .select("name")
      .eq("clinic_id", clinicId),
    supabase.from("services").select("name").eq("clinic_id", clinicId),
  ]);

  if (!clinicResult.data) {
    return { result: "Could not retrieve clinic information." };
  }

  const clinic = clinicResult.data;
  const plans = (plansResult.data ?? []).map((p) => p.name);
  const services = (servicesResult.data ?? []).map((s) => s.name);

  const info = [
    `Clinic: ${clinic.name}`,
    clinic.phone ? `Phone: ${clinic.phone}` : null,
    clinic.address ? `Address: ${clinic.address}` : null,
    `Timezone: ${clinic.timezone}`,
    plans.length > 0
      ? `Accepted insurance plans: ${plans.join(", ")}`
      : "No insurance plans registered",
    services.length > 0
      ? `Available services: ${services.join(", ")}`
      : "No services registered",
  ]
    .filter(Boolean)
    .join("\n");

  return { result: info };
}

async function handleEscalateToHuman(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const reason = (args.reason as string) ?? "patient request";

  return {
    result: `Conversation escalated to human attendant. Reason: ${reason}`,
    newConversationStatus: "escalated",
  };
}

async function handleRouteToModule(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const module = args.module as string;
  const moduleContext = (args.context as string) ?? "";

  // In Phase 6, only support is active. Other modules will be available in future phases.
  // The LLM will inform the patient and the conversation's current_module will be updated
  // by process-message.ts on the next interaction.
  return {
    result: `Patient intent routed to ${module} module. Context: ${moduleContext}. Note: if this module is not yet available, inform the patient politely and offer to help with something else or escalate to a human.`,
    responseData: { routedTo: module, routeContext: moduleContext },
  };
}

// ── Agent Config ──

const basicSupportConfig: AgentTypeConfig = {
  type: "support",

  buildSystemPrompt(
    params: SystemPromptParams,
    _recipient?: RecipientContext
  ): string {
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },

  getInstructions(_tone: string, locale: string): string {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },

  getTools(_options: AgentToolOptions) {
    return [getClinicInfoTool, escalateToHumanTool, routeToModuleTool];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "get_clinic_info":
        return handleGetClinicInfo(toolCall.args, context);
      case "escalate_to_human":
        return handleEscalateToHuman(toolCall.args, context);
      case "route_to_module":
        return handleRouteToModule(toolCall.args, context);
      default:
        console.warn(`[support] unexpected tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(basicSupportConfig);
```

**Step 2: Register in barrel module**

Modify `src/lib/agents/index.ts` — add the side-effect import at the bottom:

```typescript
// Agent auto-registration (side-effect imports)
import "./agents/echo";
import "./agents/basic-support";
```

**Step 3: Commit**

```bash
git add src/lib/agents/agents/basic-support.ts src/lib/agents/index.ts
git commit -m "feat: add basic support agent with clinic info, escalation, and routing tools"
```

---

## Task 2: Basic Support Agent — Unit Tests

**Files:**
- Create: `src/__tests__/lib/agents/basic-support.test.ts`

**Step 1: Write the test file**

```typescript
// src/__tests__/lib/agents/basic-support.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import from barrel to trigger side-effect registrations
import { getAgentType, getRegisteredTypes } from "@/lib/agents";
import type { ToolCallContext } from "@/lib/agents";

// Mock server-only module (required because engine.ts and process-message.ts import it)
vi.mock("server-only", () => ({}));

// Mock ChatOpenAI (imported by engine.ts and router.ts)
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(),
}));

describe("basic-support agent", () => {
  it("is registered with type 'support'", () => {
    const types = getRegisteredTypes();
    expect(types).toContain("support");
  });

  it("returns the agent config from registry", () => {
    const config = getAgentType("support");
    expect(config).toBeDefined();
    expect(config!.type).toBe("support");
    expect(config!.supportedChannels).toContain("whatsapp");
  });

  it("returns 3 tools", () => {
    const config = getAgentType("support")!;
    const tools = config.getTools({
      clinicId: "test-clinic",
      conversationId: "test-conv",
      locale: "pt-BR",
    });
    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_clinic_info");
    expect(names).toContain("escalate_to_human");
    expect(names).toContain("route_to_module");
  });

  it("builds system prompt for pt-BR", () => {
    const config = getAgentType("support")!;
    const prompt = config.buildSystemPrompt(
      {
        agentName: "Assistente",
        tone: "professional",
        locale: "pt-BR",
      },
      undefined
    );
    expect(prompt).toContain("assistente virtual");
    expect(prompt).toContain("get_clinic_info");
  });

  it("builds system prompt for en", () => {
    const config = getAgentType("support")!;
    const prompt = config.buildSystemPrompt(
      {
        agentName: "Assistant",
        tone: "professional",
        locale: "en",
      },
      undefined
    );
    expect(prompt).toContain("virtual assistant");
  });

  it("builds system prompt for es", () => {
    const config = getAgentType("support")!;
    const prompt = config.buildSystemPrompt(
      {
        agentName: "Asistente",
        tone: "professional",
        locale: "es",
      },
      undefined
    );
    expect(prompt).toContain("asistente virtual");
  });

  it("returns instructions for all locales", () => {
    const config = getAgentType("support")!;
    expect(config.getInstructions("professional", "pt-BR")).toContain("perguntas frequentes");
    expect(config.getInstructions("professional", "en")).toContain("clinic FAQ");
    expect(config.getInstructions("professional", "es")).toContain("preguntas frecuentes");
  });

  describe("handleToolCall", () => {
    let mockContext: ToolCallContext;
    let mockSupabase: Record<string, unknown>;

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };

      // Chain builder for Supabase queries
      const chainBuilder = () => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockResolvedValue({
          data: {
            name: "Clinica Teste",
            phone: "1199998888",
            address: "Rua Teste, 123",
            timezone: "America/Sao_Paulo",
            operating_hours: null,
          },
        });
        // For array results (insurance_plans, services)
        chain.then = undefined; // Not a promise by default
        return chain;
      };

      const fromMock = vi.fn().mockImplementation((table: string) => {
        const chain = chainBuilder();
        if (table === "clinics") {
          chain.single = vi.fn().mockResolvedValue({
            data: {
              name: "Clinica Teste",
              phone: "1199998888",
              address: "Rua Teste, 123",
              timezone: "America/Sao_Paulo",
              operating_hours: null,
            },
          });
          // Make it thenable for Promise.all
          const selectFn = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  name: "Clinica Teste",
                  phone: "1199998888",
                  address: "Rua Teste, 123",
                  timezone: "America/Sao_Paulo",
                },
              }),
            }),
          });
          return { select: selectFn };
        }
        if (table === "insurance_plans") {
          const selectFn = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ name: "Unimed" }, { name: "Amil" }],
            }),
          });
          return { select: selectFn };
        }
        if (table === "services") {
          const selectFn = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ name: "Consulta" }, { name: "Retorno" }],
            }),
          });
          return { select: selectFn };
        }
        return chain;
      });

      mockContext = {
        supabase: { from: fromMock } as unknown as ToolCallContext["supabase"],
        conversationId: "conv-123",
        recipientId: "patient-456",
        clinicId: "clinic-789",
      };
    });

    it("handles get_clinic_info and returns clinic data", async () => {
      const config = getAgentType("support")!;
      const result = await config.handleToolCall(
        { name: "get_clinic_info", args: {} },
        mockContext
      );
      expect(result.result).toContain("Clinica Teste");
      expect(result.result).toContain("1199998888");
      expect(result.result).toContain("Unimed");
      expect(result.result).toContain("Consulta");
    });

    it("handles escalate_to_human and sets conversation status", async () => {
      const config = getAgentType("support")!;
      const result = await config.handleToolCall(
        { name: "escalate_to_human", args: { reason: "patient insists" } },
        mockContext
      );
      expect(result.result).toContain("escalated");
      expect(result.newConversationStatus).toBe("escalated");
    });

    it("handles route_to_module and returns routing info", async () => {
      const config = getAgentType("support")!;
      const result = await config.handleToolCall(
        {
          name: "route_to_module",
          args: { module: "scheduling", context: "wants to book" },
        },
        mockContext
      );
      expect(result.result).toContain("scheduling");
      expect(result.responseData).toEqual({
        routedTo: "scheduling",
        routeContext: "wants to book",
      });
    });

    it("handles unknown tool gracefully", async () => {
      const config = getAgentType("support")!;
      const result = await config.handleToolCall(
        { name: "nonexistent_tool", args: {} },
        mockContext
      );
      expect(result).toEqual({});
    });
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/agents/basic-support.test.ts`

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add src/__tests__/lib/agents/basic-support.test.ts
git commit -m "test: add unit tests for basic support agent"
```

---

## Task 3: Inbox Validation Schemas

**Files:**
- Create: `src/lib/validations/inbox.ts`

**Step 1: Create Zod schemas for inbox API inputs**

```typescript
// src/lib/validations/inbox.ts
import { z } from "zod";

export const conversationListQuerySchema = z.object({
  status: z
    .enum(["active", "escalated", "resolved"])
    .optional(),
  module: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4096),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

**Step 2: Commit**

```bash
git add src/lib/validations/inbox.ts
git commit -m "feat: add zod validation schemas for inbox API"
```

---

## Task 4: Inbox API — List Conversations

**Files:**
- Create: `src/app/api/inbox/conversations/route.ts`

**Step 1: Create the list conversations endpoint**

```typescript
// src/app/api/inbox/conversations/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conversationListQuerySchema } from "@/lib/validations/inbox";

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get clinic_id for this user
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no clinic found" }, { status: 404 });
  }

  // Parse query params
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = conversationListQuerySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { status, module, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  // Build query
  let query = admin
    .from("conversations")
    .select(
      `
      id,
      status,
      current_module,
      channel,
      created_at,
      updated_at,
      patients(id, name, phone),
      agents(id, name, type)
    `,
      { count: "exact" }
    )
    .eq("clinic_id", membership.clinic_id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (module) {
    query = query.eq("current_module", module);
  }

  const { data: conversations, count, error } = await query;

  if (error) {
    console.error("[inbox/conversations] query error:", error);
    return NextResponse.json({ error: "failed to fetch conversations" }, { status: 500 });
  }

  // Fetch last message for each conversation
  const conversationIds = (conversations ?? []).map((c) => c.id);
  const lastMessages: Record<string, { content: string; role: string; created_at: string }> = {};

  if (conversationIds.length > 0) {
    // Get the latest message per conversation using a query per conversation
    // (Supabase doesn't support DISTINCT ON easily via JS client)
    for (const convId of conversationIds) {
      const { data: msg } = await admin
        .from("messages")
        .select("content, role, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (msg) {
        lastMessages[convId] = msg;
      }
    }
  }

  const result = (conversations ?? []).map((conv) => ({
    ...conv,
    lastMessage: lastMessages[conv.id] ?? null,
  }));

  return NextResponse.json({
    data: result,
    pagination: {
      page,
      limit,
      total: count ?? 0,
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/inbox/conversations/route.ts
git commit -m "feat: add GET /api/inbox/conversations endpoint with filters and pagination"
```

---

## Task 5: Inbox API — Conversation Detail + Messages

**Files:**
- Create: `src/app/api/inbox/conversations/[id]/route.ts`

**Step 1: Create the conversation detail endpoint**

```typescript
// src/app/api/inbox/conversations/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth check
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's clinic
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no clinic found" }, { status: 404 });
  }

  // Fetch conversation (enforce clinic ownership)
  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .select(
      `
      id,
      status,
      current_module,
      channel,
      created_at,
      updated_at,
      patients(id, name, phone),
      agents(id, name, type)
    `
    )
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }

  // Fetch messages
  const { data: messages, error: msgError } = await admin
    .from("messages")
    .select("id, role, content, external_id, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("[inbox/conversations/id] messages error:", msgError);
    return NextResponse.json({ error: "failed to fetch messages" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      ...conversation,
      messages: messages ?? [],
    },
  });
}
```

**Step 2: Commit**

```bash
git add "src/app/api/inbox/conversations/[id]/route.ts"
git commit -m "feat: add GET /api/inbox/conversations/[id] endpoint with messages"
```

---

## Task 6: Inbox API — Take Over + Hand Back Actions

**Files:**
- Create: `src/app/api/inbox/conversations/[id]/take-over/route.ts`
- Create: `src/app/api/inbox/conversations/[id]/hand-back/route.ts`

**Step 1: Create take-over endpoint**

```typescript
// src/app/api/inbox/conversations/[id]/take-over/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no clinic found" }, { status: 404 });
  }

  // Update conversation status to escalated (human takes over)
  const { data: conversation, error } = await admin
    .from("conversations")
    .update({ status: "escalated" })
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .select("id, status")
    .single();

  if (error || !conversation) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }

  // Insert system message to mark the takeover
  await admin.from("messages").insert({
    conversation_id: id,
    clinic_id: membership.clinic_id,
    role: "system",
    content: "Human attendant took over this conversation.",
  });

  return NextResponse.json({ data: conversation });
}
```

**Step 2: Create hand-back endpoint**

```typescript
// src/app/api/inbox/conversations/[id]/hand-back/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no clinic found" }, { status: 404 });
  }

  // Update conversation status back to active (agent resumes)
  const { data: conversation, error } = await admin
    .from("conversations")
    .update({ status: "active" })
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .select("id, status")
    .single();

  if (error || !conversation) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }

  // Insert system message to mark hand-back
  await admin.from("messages").insert({
    conversation_id: id,
    clinic_id: membership.clinic_id,
    role: "system",
    content: "Conversation handed back to agent.",
  });

  return NextResponse.json({ data: conversation });
}
```

**Step 3: Commit**

```bash
git add "src/app/api/inbox/conversations/[id]/take-over/route.ts" "src/app/api/inbox/conversations/[id]/hand-back/route.ts"
git commit -m "feat: add take-over and hand-back API endpoints for inbox conversations"
```

---

## Task 7: Inbox API — Send Human Message

**Files:**
- Create: `src/app/api/inbox/conversations/[id]/messages/route.ts`

When a human takes over, they need to send messages through the Inbox that get delivered via WhatsApp.

**Step 1: Create the send message endpoint**

```typescript
// src/app/api/inbox/conversations/[id]/messages/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage } from "@/services/whatsapp";
import { sendMessageSchema } from "@/lib/validations/inbox";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { content } = parsed.data;
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no clinic found" }, { status: 404 });
  }

  // Verify conversation belongs to clinic and get patient phone
  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .select("id, status, patients(phone)")
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }

  const patient = conversation.patients as { phone: string } | null;
  if (!patient?.phone) {
    return NextResponse.json({ error: "patient phone not found" }, { status: 400 });
  }

  // Save message
  const { data: message, error: msgError } = await admin
    .from("messages")
    .insert({
      conversation_id: id,
      clinic_id: membership.clinic_id,
      role: "assistant",
      content,
      metadata: { sent_by: user.id, sent_by_human: true },
    })
    .select("id, role, content, created_at")
    .single();

  if (msgError || !message) {
    console.error("[inbox/messages] insert error:", msgError);
    return NextResponse.json({ error: "failed to save message" }, { status: 500 });
  }

  // Queue and send via WhatsApp
  const { data: queueRow } = await admin
    .from("message_queue")
    .insert({
      conversation_id: id,
      clinic_id: membership.clinic_id,
      channel: "whatsapp",
      content,
      status: "pending",
      attempts: 0,
      max_attempts: 3,
    })
    .select("id")
    .single();

  const sendResult = await sendTextMessage(patient.phone, content);

  if (queueRow) {
    await admin
      .from("message_queue")
      .update({
        status: sendResult.success ? "sent" : "failed",
        ...(sendResult.success ? { sent_at: new Date().toISOString() } : {}),
        ...(sendResult.error ? { error: sendResult.error } : {}),
        attempts: 1,
      })
      .eq("id", queueRow.id);
  }

  return NextResponse.json({
    data: { ...message, sent: sendResult.success },
  });
}
```

**Step 2: Commit**

```bash
git add "src/app/api/inbox/conversations/[id]/messages/route.ts"
git commit -m "feat: add POST /api/inbox/conversations/[id]/messages for human replies"
```

---

## Task 8: i18n — Inbox Strings

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add new inbox strings to all 3 locale files**

Add these keys inside the existing `"inbox"` section of each locale file:

**pt-BR** — replace the `"inbox"` block:
```json
"inbox": {
  "title": "Caixa de Entrada",
  "selectConversation": "Selecione uma conversa",
  "filters": {
    "all": "Todas",
    "active": "Ativas",
    "escalated": "Escaladas",
    "resolved": "Resolvidas"
  },
  "empty": "Nenhuma conversa encontrada",
  "status": {
    "active": "Ativa",
    "escalated": "Escalada",
    "resolved": "Resolvida"
  },
  "actions": {
    "takeOver": "Assumir",
    "handBack": "Devolver ao agente",
    "send": "Enviar"
  },
  "messagePlaceholder": "Digite sua mensagem...",
  "systemMessage": {
    "takeOver": "Atendente humano assumiu esta conversa.",
    "handBack": "Conversa devolvida ao agente."
  },
  "via": "via",
  "lastMessage": "Última mensagem",
  "noMessages": "Nenhuma mensagem ainda"
}
```

**en** — replace the `"inbox"` block:
```json
"inbox": {
  "title": "Inbox",
  "selectConversation": "Select a conversation",
  "filters": {
    "all": "All",
    "active": "Active",
    "escalated": "Escalated",
    "resolved": "Resolved"
  },
  "empty": "No conversations found",
  "status": {
    "active": "Active",
    "escalated": "Escalated",
    "resolved": "Resolved"
  },
  "actions": {
    "takeOver": "Take over",
    "handBack": "Hand back to agent",
    "send": "Send"
  },
  "messagePlaceholder": "Type your message...",
  "systemMessage": {
    "takeOver": "Human attendant took over this conversation.",
    "handBack": "Conversation handed back to agent."
  },
  "via": "via",
  "lastMessage": "Last message",
  "noMessages": "No messages yet"
}
```

**es** — replace the `"inbox"` block:
```json
"inbox": {
  "title": "Bandeja de Entrada",
  "selectConversation": "Selecciona una conversación",
  "filters": {
    "all": "Todas",
    "active": "Activas",
    "escalated": "Escaladas",
    "resolved": "Resueltas"
  },
  "empty": "No se encontraron conversaciones",
  "status": {
    "active": "Activa",
    "escalated": "Escalada",
    "resolved": "Resuelta"
  },
  "actions": {
    "takeOver": "Asumir",
    "handBack": "Devolver al agente",
    "send": "Enviar"
  },
  "messagePlaceholder": "Escribe tu mensaje...",
  "systemMessage": {
    "takeOver": "Atendente humano asumió esta conversación.",
    "handBack": "Conversación devuelta al agente."
  },
  "via": "vía",
  "lastMessage": "Último mensaje",
  "noMessages": "Sin mensajes aún"
}
```

**Step 2: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add inbox i18n strings for all 3 locales"
```

---

## Task 9: Inbox UI — Message Bubble Component

**Files:**
- Create: `src/components/inbox/message-bubble.tsx`

**Step 1: Create the message bubble component**

```tsx
// src/components/inbox/message-bubble.tsx

interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  isHuman?: boolean;
}

export function MessageBubble({
  role,
  content,
  createdAt,
  isHuman,
}: MessageBubbleProps) {
  if (role === "system") {
    return (
      <div className="flex justify-center py-2">
        <span
          className="rounded-full px-3 py-1 text-xs"
          style={{
            backgroundColor: "rgba(255,255,255,0.06)",
            color: "var(--text-muted)",
          }}
        >
          {content}
        </span>
      </div>
    );
  }

  const isUser = role === "user";
  const time = new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "rounded-bl-md"
            : "rounded-br-md"
        }`}
        style={{
          backgroundColor: isUser
            ? "rgba(255,255,255,0.06)"
            : "var(--accent)",
          color: isUser ? "var(--text-primary)" : "white",
        }}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] ${
            isUser ? "" : "justify-end"
          }`}
          style={{
            color: isUser
              ? "var(--text-muted)"
              : "rgba(255,255,255,0.7)",
          }}
        >
          {isHuman && (
            <span className="mr-1 rounded bg-[rgba(255,255,255,0.15)] px-1 py-0.5 text-[9px] uppercase">
              human
            </span>
          )}
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/inbox/message-bubble.tsx
git commit -m "feat: add MessageBubble component for inbox chat view"
```

---

## Task 10: Inbox UI — Conversation List Component

**Files:**
- Create: `src/components/inbox/conversation-list.tsx`

**Step 1: Create the conversation list client component**

```tsx
// src/components/inbox/conversation-list.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConversationStatus } from "@/types";

interface ConversationItem {
  id: string;
  status: ConversationStatus;
  current_module: string | null;
  created_at: string;
  updated_at: string;
  patients: { id: string; name: string; phone: string } | null;
  agents: { id: string; name: string; type: string } | null;
  lastMessage: { content: string; role: string; created_at: string } | null;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_BADGE_VARIANT: Record<ConversationStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  escalated: "warning",
  resolved: "neutral",
};

type FilterStatus = "all" | ConversationStatus;

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const t = useTranslations("inbox");
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filters: FilterStatus[] = ["all", "active", "escalated", "resolved"];

  const filtered =
    filter === "all"
      ? conversations
      : conversations.filter((c) => c.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="cursor-pointer"
          >
            <Badge variant={f === filter ? "accent" : "neutral"}>
              {t(`filters.${f}`)}
            </Badge>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {t("empty")}
          </p>
        ) : (
          filtered.map((conv) => (
            <Card
              key={conv.id}
              interactive
              variant={conv.id === selectedId ? "solid" : "glass"}
              className={conv.id === selectedId ? "ring-1 ring-[var(--accent)]" : ""}
            >
              <button
                className="w-full text-left"
                onClick={() => onSelect(conv.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {conv.patients?.name ?? conv.id.slice(0, 8)}
                    </p>
                    {conv.lastMessage && (
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {conv.lastMessage.content.slice(0, 80)}
                      </p>
                    )}
                  </div>
                  <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={STATUS_BADGE_VARIANT[conv.status]}>
                      {t(`status.${conv.status}`)}
                    </Badge>
                    {conv.current_module && (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {conv.current_module}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/inbox/conversation-list.tsx
git commit -m "feat: add ConversationList client component for inbox"
```

---

## Task 11: Inbox UI — Conversation Detail Component

**Files:**
- Create: `src/components/inbox/conversation-detail.tsx`

**Step 1: Create the conversation detail client component**

```tsx
// src/components/inbox/conversation-detail.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageBubble } from "./message-bubble";
import type { ConversationStatus } from "@/types";

interface MessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  external_id: string | null;
  created_at: string;
  metadata?: { sent_by_human?: boolean };
}

interface ConversationData {
  id: string;
  status: ConversationStatus;
  current_module: string | null;
  channel: string;
  created_at: string;
  patients: { id: string; name: string; phone: string } | null;
  agents: { id: string; name: string; type: string } | null;
  messages: MessageItem[];
}

interface ConversationDetailProps {
  conversation: ConversationData;
  onRefresh: () => void;
}

export function ConversationDetail({
  conversation,
  onRefresh,
}: ConversationDetailProps) {
  const t = useTranslations("inbox");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages.length]);

  async function handleTakeOver() {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversation.id}/take-over`,
        { method: "POST" }
      );
      if (res.ok) {
        onRefresh();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleHandBack() {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversation.id}/hand-back`,
        { method: "POST" }
      );
      if (res.ok) {
        onRefresh();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageText.trim() }),
        }
      );
      if (res.ok) {
        setMessageText("");
        onRefresh();
      }
    } finally {
      setSending(false);
    }
  }

  const isEscalated = conversation.status === "escalated";

  return (
    <Card variant="glass" className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {conversation.patients?.name ?? "Unknown"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {conversation.patients?.phone} &middot;{" "}
            {conversation.current_module ?? conversation.channel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              conversation.status === "escalated"
                ? "warning"
                : conversation.status === "active"
                  ? "success"
                  : "neutral"
            }
          >
            {t(`status.${conversation.status}`)}
          </Badge>
          {conversation.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleTakeOver}
              disabled={actionLoading}
            >
              {t("actions.takeOver")}
            </Button>
          )}
          {conversation.status === "escalated" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleHandBack}
              disabled={actionLoading}
            >
              {t("actions.handBack")}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {conversation.messages.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {t("noMessages")}
          </p>
        ) : (
          conversation.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              createdAt={msg.created_at}
              isHuman={msg.metadata?.sent_by_human}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input (only for escalated conversations) */}
      {isEscalated && (
        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={t("messagePlaceholder")}
            className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            disabled={sending}
          />
          <Button type="submit" size="sm" disabled={sending || !messageText.trim()}>
            {t("actions.send")}
          </Button>
        </form>
      )}
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/inbox/conversation-detail.tsx
git commit -m "feat: add ConversationDetail client component with take-over, hand-back, and messaging"
```

---

## Task 12: Inbox Page — Replace Shell with Real Implementation

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx`

This replaces the skeleton shell with a real client-side inbox that fetches data from the API.

**Step 1: Rewrite the inbox page**

```tsx
// src/app/(dashboard)/inbox/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationDetail } from "@/components/inbox/conversation-detail";
import { Spinner } from "@/components/ui/spinner";

interface ConversationListItem {
  id: string;
  status: "active" | "escalated" | "resolved";
  current_module: string | null;
  created_at: string;
  updated_at: string;
  patients: { id: string; name: string; phone: string } | null;
  agents: { id: string; name: string; type: string } | null;
  lastMessage: { content: string; role: string; created_at: string } | null;
}

interface ConversationDetailData {
  id: string;
  status: "active" | "escalated" | "resolved";
  current_module: string | null;
  channel: string;
  created_at: string;
  patients: { id: string; name: string; phone: string } | null;
  agents: { id: string; name: string; type: string } | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    external_id: string | null;
    created_at: string;
    metadata?: { sent_by_human?: boolean };
  }>;
}

export default function InboxPage() {
  const t = useTranslations("inbox");
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations");
      if (res.ok) {
        const json = await res.json();
        setConversations(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/inbox/conversations/${id}`);
      if (res.ok) {
        const json = await res.json();
        setDetail(json.data ?? null);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, fetchDetail]);

  function handleRefresh() {
    fetchConversations();
    if (selectedId) {
      fetchDetail(selectedId);
    }
  }

  // Poll for updates every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedId) {
        fetchDetail(selectedId);
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchDetail, selectedId]);

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Conversation list */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {/* Right: Conversation detail */}
        <div className="lg:col-span-2">
          {detailLoading ? (
            <Card variant="glass">
              <div className="flex min-h-[500px] items-center justify-center">
                <Spinner />
              </div>
            </Card>
          ) : detail ? (
            <div className="min-h-[500px]">
              <ConversationDetail
                conversation={detail}
                onRefresh={handleRefresh}
              />
            </div>
          ) : (
            <Card variant="glass">
              <div className="flex min-h-[500px] items-center justify-center">
                <p
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("selectConversation")}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
```

**Step 2: Commit**

```bash
git add "src/app/(dashboard)/inbox/page.tsx"
git commit -m "feat: replace inbox shell with real conversation list and chat view"
```

---

## Task 13: Run Build + Type Check

**Step 1: Run TypeScript type checking**

Run: `npx tsc --noEmit`

Expected: No errors. Fix any type errors if they appear.

**Step 2: Run the full build**

Run: `npm run build`

Expected: Build succeeds.

**Step 3: Run all tests**

Run: `npm run test`

Expected: All tests pass, including the new basic-support agent tests.

**Step 4: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: address type errors and build issues from phase 6 implementation"
```

---

## Task 14: Verification — Manual Testing Checklist

After deployment, verify these flows manually:

- [ ] **Registry**: `getRegisteredTypes()` returns `["echo", "support"]`
- [ ] **Support agent tools**: `getAgentType("support")!.getTools(...)` returns 3 tools
- [ ] **Inbox page loads**: Navigate to `/inbox` — shows conversation list (may be empty)
- [ ] **Conversation filters**: Click "Active", "Escalated", "Resolved" — list filters correctly
- [ ] **Conversation detail**: Click a conversation — shows messages
- [ ] **Take over**: Click "Take over" on an active conversation — status changes to escalated, input appears
- [ ] **Send message**: Type and send a message as human — message appears, WhatsApp delivery attempted
- [ ] **Hand back**: Click "Hand back" on an escalated conversation — status returns to active
- [ ] **WhatsApp flow (end-to-end)**: Send "Quais os horários da clínica?" via WhatsApp → agent uses `get_clinic_info` → responds with real clinic data
- [ ] **Escalation flow**: Ask something out of scope 2x → agent calls `escalate_to_human` → conversation appears as escalated in Inbox
- [ ] **i18n**: Switch locale — all inbox strings render correctly in pt-BR, en, es

---

## Summary of Files Changed

```
src/lib/agents/agents/basic-support.ts         (NEW — support agent)
src/lib/agents/index.ts                         (MOD — add import)
src/lib/validations/inbox.ts                    (NEW — Zod schemas)
src/app/api/inbox/conversations/route.ts        (NEW — list API)
src/app/api/inbox/conversations/[id]/route.ts   (NEW — detail API)
src/app/api/inbox/conversations/[id]/take-over/route.ts  (NEW)
src/app/api/inbox/conversations/[id]/hand-back/route.ts  (NEW)
src/app/api/inbox/conversations/[id]/messages/route.ts   (NEW)
src/components/inbox/message-bubble.tsx          (NEW — UI)
src/components/inbox/conversation-list.tsx       (NEW — UI)
src/components/inbox/conversation-detail.tsx     (NEW — UI)
src/app/(dashboard)/inbox/page.tsx              (MOD — replace shell)
messages/pt-BR.json                             (MOD — inbox strings)
messages/en.json                                (MOD — inbox strings)
messages/es.json                                (MOD — inbox strings)
src/__tests__/lib/agents/basic-support.test.ts  (NEW — tests)
```

Total: 12 new files, 4 modified files.
