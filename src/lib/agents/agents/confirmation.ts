import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import { deleteEvent } from "@/services/google-calendar";
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
- Quando o paciente quiser remarcar, chame reschedule_from_confirmation IMEDIATAMENTE. Nao pergunte data, horario ou motivo antes de chamar a ferramenta.
- Apos remarcar, informe que a consulta foi cancelada e pergunte qual data e horario o paciente prefere para a nova consulta. O paciente pode remarcar agora mesmo nesta conversa.
- Nao insista mais de 2 vezes se o paciente nao responder.
- Nunca fabrique URLs ou informacoes que voce nao obteve de uma ferramenta.
- Apos chamar uma ferramenta, SEMPRE responda ao paciente em linguagem natural e amigavel. Nunca exponha resultados internos.
- Responda sempre em portugues do Brasil.`,

  en: `You are an appointment confirmation assistant. Your role is to remind patients about scheduled appointments and record their responses.

Rules:
- Use the patient's first name to make the conversation more personal.
- Keep messages brief and direct.
- When the patient confirms attendance, call the confirm_attendance tool immediately.
- When the patient wants to reschedule, call reschedule_from_confirmation IMMEDIATELY. Do not ask for date, time, or reason before calling the tool.
- After rescheduling, inform the patient their appointment was cancelled and ask what date and time they prefer for the new one. The patient can reschedule right now in this conversation.
- Do not insist more than 2 times if the patient does not respond.
- Never fabricate URLs or information you did not obtain from a tool.
- After calling a tool, ALWAYS respond to the patient in natural, friendly language. Never expose internal results.
- Always respond in English.`,

  es: `Eres un asistente de confirmacion de citas. Tu rol es recordar a los pacientes sobre citas programadas y registrar sus respuestas.

Reglas:
- Usa el primer nombre del paciente para hacer la conversacion mas personal.
- Se breve y directo en los mensajes.
- Cuando el paciente confirme asistencia, llama la herramienta confirm_attendance inmediatamente.
- Cuando el paciente quiera reprogramar, llama reschedule_from_confirmation INMEDIATAMENTE. No preguntes fecha, hora o motivo antes de llamar la herramienta.
- Despues de reprogramar, informa que la cita fue cancelada y pregunta que fecha y hora prefiere para la nueva cita. El paciente puede reprogramar ahora mismo en esta conversacion.
- No insistas mas de 2 veces si el paciente no responde.
- Nunca fabriques URLs o informacion que no obtuviste de una herramienta.
- Despues de llamar una herramienta, SIEMPRE responde al paciente en lenguaje natural y amigable. Nunca expongas resultados internos.
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
// NOTE: Tools do NOT require appointment_id from the LLM.
// The handlers resolve the active confirmation automatically via patient + clinic.

const confirmAttendanceTool = tool(
  async () => {
    return JSON.stringify({ action: "confirm_attendance" });
  },
  {
    name: "confirm_attendance",
    description:
      "Confirms that the patient will attend their upcoming appointment. Call this when the patient explicitly confirms they will come. No parameters needed.",
    schema: z.object({}),
  }
);

const rescheduleFromConfirmationTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "reschedule_from_confirmation",
      reason: input.reason,
    });
  },
  {
    name: "reschedule_from_confirmation",
    description:
      "Cancels the current appointment and routes the patient to reschedule. Call this IMMEDIATELY when the patient wants to reschedule — do not ask for details.",
    schema: z.object({
      reason: z
        .string()
        .describe("Brief reason why the patient wants to reschedule"),
    }),
  }
);

const markNoShowTool = tool(
  async () => {
    return JSON.stringify({ action: "mark_no_show" });
  },
  {
    name: "mark_no_show",
    description:
      "Marks the appointment as a no-show. Use this when the patient did not attend and did not respond to confirmation attempts. No parameters needed.",
    schema: z.object({}),
  }
);

// ── Appointment Lookup Helper ──

/**
 * Finds the active confirmation appointment for the current patient.
 * Looks up confirmation_queue entries with status "sent" that link to
 * appointments belonging to this patient in this clinic.
 */
async function findActiveConfirmationAppointment(
  context: ToolCallContext
): Promise<string | null> {
  // Find scheduled appointments for this patient
  const { data: appointments } = await context.supabase
    .from("appointments")
    .select("id")
    .eq("patient_id", context.recipientId)
    .eq("clinic_id", context.clinicId)
    .in("status", ["scheduled", "confirmed"])
    .order("starts_at", { ascending: true });

  if (!appointments || appointments.length === 0) return null;

  // Find which one has a sent confirmation
  const { data: queueEntry } = await context.supabase
    .from("confirmation_queue")
    .select("appointment_id")
    .in(
      "appointment_id",
      appointments.map((a) => a.id)
    )
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return queueEntry?.appointment_id ?? appointments[0].id;
}

// ── Tool Handlers ──

async function handleConfirmAttendance(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const appointmentId = await findActiveConfirmationAppointment(context);

    if (!appointmentId) {
      return { result: "No pending appointment found for this patient." };
    }

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
  context: ToolCallContext
): Promise<ToolCallResult> {
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  try {
    const appointmentId = await findActiveConfirmationAppointment(context);

    if (!appointmentId) {
      return { result: "No pending appointment found for this patient." };
    }

    // Fetch appointment details for Google Calendar sync
    const { data: appointment } = await context.supabase
      .from("appointments")
      .select("id, professional_id, google_event_id")
      .eq("id", appointmentId)
      .single();

    // Cancel the current appointment
    await context.supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_reason: reason })
      .eq("id", appointmentId);

    // Mark confirmation queue entries as responded
    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "rescheduled" })
      .eq("appointment_id", appointmentId)
      .eq("status", "sent");

    // Delete Google Calendar event if it exists
    if (appointment?.google_event_id && appointment?.professional_id) {
      try {
        const { data: professional } = await context.supabase
          .from("professionals")
          .select("google_calendar_id, google_refresh_token")
          .eq("id", appointment.professional_id)
          .single();

        if (
          professional?.google_refresh_token &&
          professional?.google_calendar_id
        ) {
          await deleteEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            appointment.google_event_id as string
          );
        }
      } catch (calendarError) {
        console.error(
          "[confirmation] Google Calendar delete failed:",
          calendarError
        );
      }
    }

    return {
      result: `Appointment cancelled successfully. IMPORTANT: Tell the patient their appointment was cancelled and ask "Qual data e horario voce prefere para a nova consulta?" so they can reschedule immediately in this conversation.`,
      responseData: {
        routedTo: "scheduling",
        routeContext: reason,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error processing reschedule: ${message}` };
  }
}

async function handleMarkNoShow(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const appointmentId = await findActiveConfirmationAppointment(context);

    if (!appointmentId) {
      return { result: "No pending appointment found for this patient." };
    }

    const { error } = await context.supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appointmentId);

    if (error) {
      return {
        result: `Failed to mark appointment as no-show: ${error.message}`,
      };
    }

    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "no_show" })
      .eq("appointment_id", appointmentId)
      .eq("status", "sent");

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
