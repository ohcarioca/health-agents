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
  "pt-BR": `Voce e o assistente virtual da clinica. Neste momento, esta conduzindo uma breve pesquisa de satisfacao com o paciente.

Fluxo:
1. Pergunte ao paciente uma nota de 0 a 10 sobre a experiencia.
2. Apos receber a nota, peca um comentario opcional.
3. Promotores (9-10): ofereca o link do Google Reviews para que o paciente deixe uma avaliacao publica.
4. Detratores (0-6): registre um alerta para a equipe da clinica.
5. Neutros (7-8): agradeca o feedback.

Regras:
- Use o primeiro nome do paciente na conversa.
- Seja breve e objetivo.
- Nunca fabrique URLs ou links. Use apenas os fornecidos pelas ferramentas.
- Responda sempre em portugues do Brasil.
- Quando o paciente fornecer qualquer feedback textual (reclamacao, elogio, comentario sobre a experiencia), chame collect_nps_comment IMEDIATAMENTE para registrar. Nao pergunte se deseja salvar — apenas salve.
- Nunca invente numeros de telefone ou contatos. Se precisar fornecer um contato, diga que vai encaminhar a reclamacao para a equipe.`,

  en: `You are the clinic's virtual assistant. Right now, you are conducting a brief satisfaction survey with the patient.

Flow:
1. Ask the patient for a score from 0 to 10 about their experience.
2. After receiving the score, ask for an optional comment.
3. Promoters (9-10): offer the Google Reviews link so the patient can leave a public review.
4. Detractors (0-6): register an alert for the clinic team.
5. Passives (7-8): thank them for the feedback.

Rules:
- Use the patient's first name in conversation.
- Be brief and to the point.
- Never fabricate URLs or links. Only use those provided by tools.
- Always respond in English.
- When the patient provides any textual feedback (complaint, praise, comment about their experience), call collect_nps_comment IMMEDIATELY to record it. Do not ask if they want to save it — just save it.
- Never fabricate phone numbers or contacts. If you need to provide a contact, say you will forward the complaint to the team.`,

  es: `Eres el asistente virtual de la clinica. En este momento, estas conduciendo una breve encuesta de satisfaccion con el paciente.

Flujo:
1. Pregunta al paciente una nota de 0 a 10 sobre su experiencia.
2. Despues de recibir la nota, pide un comentario opcional.
3. Promotores (9-10): ofrece el enlace de Google Reviews para que el paciente deje una resena publica.
4. Detractores (0-6): registra una alerta para el equipo de la clinica.
5. Neutros (7-8): agradece el feedback.

Reglas:
- Usa el primer nombre del paciente en la conversacion.
- Se breve y objetivo.
- Nunca fabriques URLs o enlaces. Usa solo los proporcionados por las herramientas.
- Responde siempre en espanol.
- Cuando el paciente proporcione cualquier feedback textual (queja, elogio, comentario), llama collect_nps_comment INMEDIATAMENTE para registrarlo. No preguntes si quiere guardarlo — solo guardalo.
- Nunca inventes numeros de telefono o contactos.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Colete nota NPS de 0-10 e comentario opcional. Direcione promotores ao Google Reviews e registre alertas para detratores.",
  en: "Collect NPS score from 0-10 and optional comment. Direct promoters to Google Reviews and register alerts for detractors.",
  es: "Recopila nota NPS de 0-10 y comentario opcional. Dirige promotores a Google Reviews y registra alertas para detractores.",
};

// ── Tool Definitions (Stubs) ──

const collectNpsScoreTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "collect_nps_score",
      appointment_id: input.appointment_id,
      score: input.score,
    });
  },
  {
    name: "collect_nps_score",
    description:
      "Records the NPS score (0-10) for a patient's appointment. Call this after the patient provides their rating.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment being evaluated"),
      score: z
        .number()
        .int()
        .min(0)
        .max(10)
        .describe("The NPS score from 0 to 10 given by the patient"),
    }),
  }
);

const collectNpsCommentTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "collect_nps_comment",
      appointment_id: input.appointment_id,
      comment: input.comment,
    });
  },
  {
    name: "collect_nps_comment",
    description:
      "Records a comment from the patient about their experience. Call this IMMEDIATELY whenever the patient provides any textual feedback, complaint, or praise — do not ask permission first.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment being evaluated"),
      comment: z
        .string()
        .describe("The patient's optional feedback comment"),
    }),
  }
);

const redirectToGoogleReviewsTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "redirect_to_google_reviews",
      appointment_id: input.appointment_id,
    });
  },
  {
    name: "redirect_to_google_reviews",
    description:
      "Sends the Google Reviews link to a promoter (score 9-10) so they can leave a public review. Only call this for promoters.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment being evaluated"),
    }),
  }
);

const alertDetractorTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "alert_detractor",
      appointment_id: input.appointment_id,
      score: input.score,
      comment: input.comment,
    });
  },
  {
    name: "alert_detractor",
    description:
      "Creates a detractor alert for the clinic team when a patient gives a low score (0-6). Call this for detractors after collecting their score.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("The ID of the appointment being evaluated"),
      score: z
        .number()
        .describe("The detractor's NPS score"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment from the detractor"),
    }),
  }
);

// ── Tool Handlers ──

async function handleCollectNpsScore(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId =
    typeof args.appointment_id === "string" ? args.appointment_id : "";
  const score = typeof args.score === "number" ? args.score : -1;

  try {
    const { error } = await context.supabase
      .from("nps_responses")
      .update({ score })
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", context.clinicId);

    if (error) {
      return { result: `Failed to record NPS score: ${error.message}` };
    }

    if (score >= 9) {
      return {
        result: `NPS score ${score} recorded. This is a promoter (9-10). You should call redirect_to_google_reviews to send the patient a link to leave a public review.`,
      };
    }

    if (score <= 6) {
      return {
        result: `NPS score ${score} recorded. This is a detractor (0-6). You should call alert_detractor to notify the clinic team about this low rating.`,
      };
    }

    return {
      result: `NPS score ${score} recorded. This is a neutral/passive rating (7-8). Thank the patient for their feedback.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error recording NPS score: ${message}` };
  }
}

async function handleCollectNpsComment(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId =
    typeof args.appointment_id === "string" ? args.appointment_id : "";
  const comment =
    typeof args.comment === "string" ? args.comment : "";

  try {
    const { error } = await context.supabase
      .from("nps_responses")
      .update({ comment })
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", context.clinicId);

    if (error) {
      return { result: `Failed to record comment: ${error.message}` };
    }

    return { result: "Comment recorded. Thank you for the feedback." };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error recording comment: ${message}` };
  }
}

async function handleRedirectToGoogleReviews(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId =
    typeof args.appointment_id === "string" ? args.appointment_id : "";

  try {
    const { data: clinic, error: clinicError } = await context.supabase
      .from("clinics")
      .select("google_reviews_url")
      .eq("id", context.clinicId)
      .single();

    if (clinicError) {
      return { result: `Failed to retrieve clinic information: ${clinicError.message}` };
    }

    const googleReviewsUrl =
      clinic && typeof clinic.google_reviews_url === "string"
        ? clinic.google_reviews_url
        : null;

    if (!googleReviewsUrl) {
      return { result: "Google Reviews URL not configured for this clinic." };
    }

    await context.supabase
      .from("nps_responses")
      .update({ review_sent: true })
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", context.clinicId);

    return {
      result: "Google Reviews link sent to patient.",
      appendToResponse: googleReviewsUrl,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error sending Google Reviews link: ${message}` };
  }
}

async function handleAlertDetractor(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const appointmentId =
    typeof args.appointment_id === "string" ? args.appointment_id : "";

  try {
    await context.supabase
      .from("nps_responses")
      .update({ alert_sent: true })
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", context.clinicId);

    return {
      result: "Detractor alert registered. The clinic team will be notified.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error registering detractor alert: ${message}` };
  }
}

// ── Agent Config ──

const npsConfig: AgentTypeConfig = {
  type: "nps",

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
      collectNpsScoreTool,
      collectNpsCommentTool,
      redirectToGoogleReviewsTool,
      alertDetractorTool,
    ];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "collect_nps_score":
        return handleCollectNpsScore(toolCall.args, context);
      case "collect_nps_comment":
        return handleCollectNpsComment(toolCall.args, context);
      case "redirect_to_google_reviews":
        return handleRedirectToGoogleReviews(toolCall.args, context);
      case "alert_detractor":
        return handleAlertDetractor(toolCall.args, context);
      default:
        console.warn(`[nps] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(npsConfig);
