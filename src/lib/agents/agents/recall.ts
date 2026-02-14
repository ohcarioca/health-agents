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
  "pt-BR": `Voce e o assistente de reativacao de pacientes da clinica. Sua funcao e entrar em contato com pacientes que nao visitam a clinica ha algum tempo e incentiva-los a retornar.

Regras:
- Use o primeiro nome do paciente para tornar a conversa mais pessoal.
- Responda sempre em portugues do Brasil.
- Seja caloroso e acolhedor, mencionando que faz tempo desde a ultima visita sem ser intrusivo.
- Use a ferramenta route_to_scheduling quando o paciente quiser agendar uma consulta.
- Use a ferramenta mark_patient_inactive se o paciente optar por nao receber mais contato.
- Nao insista mais de 1 vez se o paciente demonstrar desinteresse.
- Nunca mencione dados clinicos ou detalhes sobre tratamentos anteriores.
- Apos chamar uma ferramenta, SEMPRE responda ao paciente em linguagem natural e amigavel. Nunca exponha resultados internos.`,

  en: `You are the clinic's patient reactivation assistant. Your role is to reach out to patients who haven't visited the clinic in a while and encourage them to return.

Rules:
- Use the patient's first name to make the conversation more personal.
- Always respond in English.
- Be warm and welcoming, mentioning it's been a while since their last visit without being intrusive.
- Use the route_to_scheduling tool when the patient wants to book an appointment.
- Use the mark_patient_inactive tool if the patient opts out of further contact.
- Do not insist more than 1 time if the patient shows disinterest.
- Never mention clinical data or details about previous treatments.
- After calling a tool, ALWAYS respond to the patient in natural, friendly language. Never expose internal results.`,

  es: `Eres el asistente de reactivacion de pacientes de la clinica. Tu funcion es contactar a pacientes que no han visitado la clinica en un tiempo e incentivarlos a retornar.

Reglas:
- Usa el primer nombre del paciente para hacer la conversacion mas personal.
- Responde siempre en espanol.
- Se calido y acogedor, mencionando que ha pasado tiempo desde su ultima visita sin ser intrusivo.
- Usa la herramienta route_to_scheduling cuando el paciente quiera agendar una cita.
- Usa la herramienta mark_patient_inactive si el paciente opta por no recibir mas contacto.
- No insistas mas de 1 vez si el paciente muestra desinteres.
- Nunca menciones datos clinicos o detalles sobre tratamientos anteriores.
- Despues de llamar una herramienta, SIEMPRE responde al paciente en lenguaje natural y amigable. Nunca expongas resultados internos.`,
};
// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Reative pacientes inativos com mensagens acolhedoras e encaminhe para agendamento quando demonstrarem interesse.",
  en: "Reactivate inactive patients with welcoming messages and route to scheduling when they show interest.",
  es: "Reactiva pacientes inactivos con mensajes acogedores y encamina al agendamiento cuando muestren interes.",
};

// ── Tool Definitions (Stubs) ──

const sendReactivationMessageTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "send_reactivation_message",
      recall_id: input.recall_id,
    });
  },
  {
    name: "send_reactivation_message",
    description:
      "Retrieves patient recall information to compose a warm reactivation message. Call this to get context about the patient's last visit before composing the outreach message.",
    schema: z.object({
      recall_id: z
        .string()
        .describe("The ID of the recall queue entry for this patient"),
    }),
  }
);

const routeToSchedulingTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "route_to_scheduling",
      recall_id: input.recall_id,
    });
  },
  {
    name: "route_to_scheduling",
    description:
      "Routes the patient to the scheduling module to book a new appointment. Call this when the patient expresses interest in scheduling a visit.",
    schema: z.object({
      recall_id: z
        .string()
        .describe("The ID of the recall queue entry for this patient"),
    }),
  }
);

const markPatientInactiveTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "mark_patient_inactive",
      recall_id: input.recall_id,
      reason: input.reason,
    });
  },
  {
    name: "mark_patient_inactive",
    description:
      "Records that the patient has opted out of further reactivation contact. Call this when the patient explicitly asks not to be contacted again.",
    schema: z.object({
      recall_id: z
        .string()
        .describe("The ID of the recall queue entry for this patient"),
      reason: z
        .string()
        .describe("The reason the patient opted out of further contact"),
    }),
  }
);
// ── Tool Handlers ──

async function handleSendReactivationMessage(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const recallId = typeof args.recall_id === "string" ? args.recall_id : "";

  try {
    const { data: recallEntry, error: recallError } = await context.supabase
      .from("recall_queue")
      .select("id, last_visit_date, patients!inner(name)")
      .eq("id", recallId)
      .single();

    if (recallError || !recallEntry) {
      return {
        result: `Recall entry not found: ${recallError?.message ?? "no data"}`,
      };
    }

    const patient = recallEntry.patients as unknown as { name: string };
    const lastVisitDate = recallEntry.last_visit_date as string;
    const lastVisit = new Date(lastVisitDate);
    const now = new Date();
    const daysSinceLastVisit = Math.floor(
      (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      result: `Patient ${patient.name} last visited ${daysSinceLastVisit} days ago (${lastVisitDate}). Compose a warm, welcoming message inviting them to return to the clinic. Do not mention specific clinical details.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error retrieving recall information: ${message}` };
  }
}

async function handleRouteToScheduling(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const recallId = typeof args.recall_id === "string" ? args.recall_id : "";

  try {
    await context.supabase
      .from("recall_queue")
      .update({ status: "responded" })
      .eq("id", recallId);

    return {
      result:
        "Patient wants to book an appointment. Route to the scheduling module.",
      responseData: {
        routedTo: "scheduling",
        routeContext: "Patient reactivation",
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error routing to scheduling: ${message}` };
  }
}

async function handleMarkPatientInactive(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const recallId = typeof args.recall_id === "string" ? args.recall_id : "";
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  try {
    await context.supabase
      .from("recall_queue")
      .update({ status: "opted_out" })
      .eq("id", recallId);

    return {
      result: `Patient opt-out recorded. Reason: ${reason}. Acknowledge the patient's decision respectfully and confirm they will not be contacted again for reactivation.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error recording patient opt-out: ${message}` };
  }
}
// ── Agent Config ──

const recallConfig: AgentTypeConfig = {
  type: "recall",

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
    return [
      sendReactivationMessageTool,
      routeToSchedulingTool,
      markPatientInactiveTool,
    ];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "send_reactivation_message":
        return handleSendReactivationMessage(toolCall.args, context);
      case "route_to_scheduling":
        return handleRouteToScheduling(toolCall.args, context);
      case "mark_patient_inactive":
        return handleMarkPatientInactive(toolCall.args, context);
      default:
        console.warn(`[recall] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(recallConfig);
