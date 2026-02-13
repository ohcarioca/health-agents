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
  "pt-BR": `Voce e um assistente de confirmacao de consultas. Seu papel e lembrar pacientes sobre consultas agendadas e registrar suas respostas.

Regras:
- Use o primeiro nome do paciente para tornar a conversa mais pessoal.
- Seja breve e direto nas mensagens.
- Quando o paciente confirmar presenca, chame a ferramenta confirm_attendance imediatamente.
- Quando o paciente quiser remarcar, chame a ferramenta reschedule_from_confirmation com o motivo.
- Nao insista mais de 2 vezes se o paciente nao responder.
- Nunca fabrique URLs ou informacoes que voce nao obteve de uma ferramenta.
- Responda sempre em portugues do Brasil.`,

  en: `You are an appointment confirmation assistant. Your role is to remind patients about scheduled appointments and record their responses.

Rules:
- Use the patient's first name to make the conversation more personal.
- Keep messages brief and direct.
- When the patient confirms attendance, call the confirm_attendance tool immediately.
- When the patient wants to reschedule, call the reschedule_from_confirmation tool with the reason.
- Do not insist more than 2 times if the patient does not respond.
- Never fabricate URLs or information you did not obtain from a tool.
- Always respond in English.`,

  es: `Eres un asistente de confirmacion de citas. Tu rol es recordar a los pacientes sobre citas programadas y registrar sus respuestas.

Reglas:
- Usa el primer nombre del paciente para hacer la conversacion mas personal.
- Se breve y directo en los mensajes.
- Cuando el paciente confirme asistencia, llama la herramienta confirm_attendance inmediatamente.
- Cuando el paciente quiera reprogramar, llama la herramienta reschedule_from_confirmation con el motivo.
- No insistas mas de 2 veces si el paciente no responde.
- Nunca fabriques URLs o informacion que no obtuviste de una herramienta.
- Responde siempre en espanol.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Confirme consultas com pacientes, registre respostas e encaminhe remarcacoes quando necessario.",
  en: "Confirm appointments with patients, record responses, and route rescheduling requests when needed.",
  es: "Confirma citas con pacientes, registra respuestas y encamina reprogramaciones cuando sea necesario.",
};

// ── Tool Definitions (Stubs) ──

const confirmAttendanceTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "confirm_attendance",
      appointment_id: input.appointment_id,
    });
  },
  {
    name: "confirm_attendance",
    description:
      "Confirms that the patient will attend the appointment. Call this when the patient explicitly confirms they will come.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment being confirmed"),
    }),
  }
);

const rescheduleFromConfirmationTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "reschedule_from_confirmation",
      appointment_id: input.appointment_id,
      reason: input.reason,
    });
  },
  {
    name: "reschedule_from_confirmation",
    description:
      "Routes the patient to the scheduling module when they want to reschedule instead of confirming. Use this when the patient cannot make it but wants a new time.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment to reschedule"),
      reason: z
        .string()
        .describe("Brief reason why the patient wants to reschedule"),
    }),
  }
);

const markNoShowTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "mark_no_show",
      appointment_id: input.appointment_id,
    });
  },
  {
    name: "mark_no_show",
    description:
      "Marks the appointment as a no-show. Use this when the patient did not attend and did not respond to confirmation attempts.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment to mark as no-show"),
    }),
  }
);

// ── Tool Handlers ──

async function handleConfirmAttendance(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId =
    typeof args.appointment_id === "string" ? args.appointment_id : "";

  try {
    const { error: appointmentError } = await context.supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", appointmentId);

    if (appointmentError) {
      return {
        result: `Failed to confirm appointment: ${appointmentError.message}`,
      };
    }

    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "confirmed" })
      .eq("appointment_id", appointmentId)
      .eq("status", "sent");

    return {
      result: "Appointment confirmed successfully. The patient will attend.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error confirming appointment: ${message}` };
  }
}

async function handleRescheduleFromConfirmation(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  return {
    result: `Patient wants rescheduling. Routing to scheduling module. Reason: ${reason}`,
    responseData: {
      routedTo: "scheduling",
      routeContext: reason,
    },
  };
}

async function handleMarkNoShow(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId =
    typeof args.appointment_id === "string" ? args.appointment_id : "";

  try {
    const { error } = await context.supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appointmentId);

    if (error) {
      return {
        result: `Failed to mark appointment as no-show: ${error.message}`,
      };
    }

    return { result: "Appointment marked as no-show." };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error marking no-show: ${message}` };
  }
}

// ── Agent Config ──

const confirmationConfig: AgentTypeConfig = {
  type: "confirmation",

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
    return [confirmAttendanceTool, rescheduleFromConfirmationTool, markNoShowTool];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "confirm_attendance":
        return handleConfirmAttendance(toolCall.args, context);
      case "reschedule_from_confirmation":
        return handleRescheduleFromConfirmation(toolCall.args, context);
      case "mark_no_show":
        return handleMarkNoShow(toolCall.args, context);
      default:
        console.warn(`[confirmation] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(confirmationConfig);
