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

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e um assistente de suporte profissional de saude. Seu papel e ajudar pacientes com duvidas sobre a clinica, servicos e informacoes gerais.

Regras:
- Use o primeiro nome do paciente na conversa para tornar o atendimento mais pessoal.
- SEMPRE chame a ferramenta get_clinic_info antes de responder perguntas sobre a clinica (horarios, endereco, planos de saude, servicos). Nunca invente essas informacoes.
- ROTEAMENTO IMEDIATO: Ao detectar qualquer intencao de agendamento, remarcacao ou cancelamento (palavras como "marcar", "agendar", "consulta", "remarcar", "cancelar"), chame route_to_module(scheduling) IMEDIATAMENTE na mesma mensagem, SEM fazer perguntas antes. O modulo de agendamento coletara as informacoes necessarias.
- ROTEAMENTO IMEDIATO: Ao detectar intencao relacionada a pagamentos ou cobranças, chame route_to_module(billing) IMEDIATAMENTE, SEM fazer perguntas antes.
- Nao mencione modulos ou transferencias — apenas continue ajudando naturalmente.
- Se voce nao conseguir ajudar o paciente apos 2 tentativas, escale para um atendente humano usando escalate_to_human.
- Nunca fabrique URLs, links de pagamento ou informacoes que voce nao obteve de uma ferramenta.
- NUNCA mostre IDs internos (UUIDs) ao paciente. Eles sao apenas para uso interno do sistema.
- Responda sempre em portugues do Brasil.`,

  en: `You are a professional healthcare support assistant. Your role is to help patients with questions about the clinic, services, and general information.

Rules:
- Use the patient's first name in conversation to make the interaction more personal.
- ALWAYS call the get_clinic_info tool before answering questions about the clinic (hours, address, insurance plans, services). Never fabricate this information.
- IMMEDIATE ROUTING: Upon detecting any scheduling, rescheduling, or cancellation intent (words like "schedule", "book", "appointment", "reschedule", "cancel"), call route_to_module(scheduling) IMMEDIATELY in the same response, WITHOUT asking questions first. The scheduling module will collect all necessary information.
- IMMEDIATE ROUTING: Upon detecting payment or billing intent, call route_to_module(billing) IMMEDIATELY, WITHOUT asking questions first.
- Never mention modules or transfers — just continue helping naturally.
- If you cannot help the patient after 2 attempts, escalate to a human agent using escalate_to_human.
- Never fabricate URLs, payment links, or information you did not obtain from a tool.
- NEVER show internal IDs (UUIDs) to the patient. They are for internal system use only.
- Always respond in English.`,

  es: `Eres un asistente de soporte profesional de salud. Tu rol es ayudar a los pacientes con preguntas sobre la clinica, servicios e informacion general.

Reglas:
- Usa el primer nombre del paciente en la conversacion para hacer la interaccion mas personal.
- SIEMPRE llama la herramienta get_clinic_info antes de responder preguntas sobre la clinica (horarios, direccion, planes de seguro, servicios). Nunca inventes esta informacion.
- ENRUTAMIENTO INMEDIATO: Al detectar cualquier intencion de agendar, reprogramar o cancelar una cita (palabras como "agendar", "cita", "turno", "reprogramar", "cancelar"), llama route_to_module(scheduling) INMEDIATAMENTE en la misma respuesta, SIN hacer preguntas antes. El modulo de agendamiento recopilara la informacion necesaria.
- ENRUTAMIENTO INMEDIATO: Al detectar intencion relacionada con pagos o cobros, llama route_to_module(billing) INMEDIATAMENTE, SIN hacer preguntas antes.
- Nunca menciones modulos o transferencias — simplemente sigue ayudando naturalmente.
- Si no puedes ayudar al paciente despues de 2 intentos, escala a un agente humano usando escalate_to_human.
- Nunca fabriques URLs, enlaces de pago o informacion que no obtuviste de una herramienta.
- NUNCA muestres IDs internos (UUIDs) al paciente. Son solo para uso interno del sistema.
- Responde siempre en espanol.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Responda duvidas sobre a clinica usando informacoes verificadas. Ajude com agendamentos e cobrancas. Escale para humano quando necessario.",
  en: "Answer clinic questions using verified information. Help with scheduling and billing. Escalate to human when necessary.",
  es: "Responde preguntas sobre la clinica usando informacion verificada. Ayuda con agendamientos y cobros. Escala a un humano cuando sea necesario.",
};

// ── Tool Definitions (Stubs) ──

const getClinicInfoTool = tool(
  async () => {
    return JSON.stringify({ action: "get_clinic_info" });
  },
  {
    name: "get_clinic_info",
    description:
      "Retrieves clinic information including operating hours, address, accepted insurance plans, and available services. ALWAYS call this tool before answering any question about the clinic.",
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
      "Escalates the conversation to a human agent. Use this when you cannot resolve the patient's issue after 2 attempts or when the patient explicitly requests a human.",
    schema: z.object({
      reason: z
        .string()
        .describe("Brief reason for escalation to a human agent"),
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
      "Routes the conversation to a specialized module. Use 'scheduling' for appointment booking, 'confirmation' for appointment confirmations, 'nps' for satisfaction surveys, 'billing' for payments and invoices, 'recall' for patient recall campaigns.",
    schema: z.object({
      module: z
        .enum(["scheduling", "confirmation", "nps", "billing", "recall"])
        .describe("Target module to route the conversation to"),
      context: z
        .string()
        .describe(
          "Brief context about what the patient needs, to help the target module"
        ),
    }),
  }
);

// ── Tool Handlers ──

async function handleGetClinicInfo(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const [clinicResult, insuranceResult, servicesResult] = await Promise.all([
      context.supabase
        .from("clinics")
        .select("name, phone, address, timezone, operating_hours")
        .eq("id", context.clinicId)
        .single(),
      context.supabase
        .from("insurance_plans")
        .select("name")
        .eq("clinic_id", context.clinicId),
      context.supabase
        .from("services")
        .select("name, price_cents, duration_minutes")
        .eq("clinic_id", context.clinicId),
    ]);

    if (clinicResult.error) {
      return {
        result: `Failed to retrieve clinic information: ${clinicResult.error.message}`,
      };
    }

    const clinic = clinicResult.data;
    const insurancePlans = insuranceResult.data?.map((p) => p.name) ?? [];
    const services = (servicesResult.data ?? []).map((s) => {
      const price = s.price_cents
        ? ` — R$ ${(s.price_cents / 100).toFixed(2).replace(".", ",")}`
        : "";
      const duration = s.duration_minutes ? ` (${s.duration_minutes}min)` : "";
      return `${s.name}${duration}${price}`;
    });

    const parts: string[] = [
      `Clinic: ${clinic.name}`,
      clinic.phone ? `Phone: ${clinic.phone}` : null,
      clinic.address ? `Address: ${clinic.address}` : null,
      clinic.timezone ? `Timezone: ${clinic.timezone}` : null,
      clinic.operating_hours
        ? `Operating hours: ${typeof clinic.operating_hours === "string" ? clinic.operating_hours : JSON.stringify(clinic.operating_hours)}`
        : null,
      insurancePlans.length > 0
        ? `Accepted insurance plans: ${insurancePlans.join(", ")}`
        : "No insurance plans registered.",
      services.length > 0
        ? `Available services: ${services.join(", ")}`
        : "No services registered.",
    ].filter((part): part is string => part !== null);

    return { result: parts.join("\n") };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error retrieving clinic information: ${message}` };
  }
}

async function handleEscalateToHuman(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  return {
    result: `Conversation escalated to a human agent. Reason: ${reason}`,
    newConversationStatus: "escalated",
  };
}

async function handleRouteToModule(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const targetModule =
    typeof args.module === "string" ? args.module : "unknown";
  const routeContext =
    typeof args.context === "string" ? args.context : "";

  return {
    result: `Ready to help with: ${routeContext}. Continue the conversation naturally without mentioning any internal routing or module change.`,
    responseData: {
      routedTo: targetModule,
      routeContext,
    },
  };
}

// ── Agent Config ──

const basicSupportConfig: AgentTypeConfig = {
  type: "support",

  buildSystemPrompt(
    params: SystemPromptParams,
    _recipient?: RecipientContext
  ): string {
    // Only return the base prompt (step 1 of the 8-step assembly).
    // Steps 2-8 (name, description, instructions, tools, business/recipient context)
    // are handled by context-builder.ts — do NOT duplicate them here.
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
        console.warn(`[support] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(basicSupportConfig);
