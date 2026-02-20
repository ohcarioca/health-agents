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

Fluxo OBRIGATORIO (siga esta ordem exata):
1. Pergunte ao paciente uma nota de 0 a 10 sobre a experiencia.
2. Quando o paciente fornecer a nota, chame collect_nps_score IMEDIATAMENTE — este e SEMPRE o primeiro tool a chamar.
3. Apos registrar a nota, peca um comentario opcional.
4. Se o paciente fornecer um comentario, chame collect_nps_comment para registrar.
5. Promotores (9-10): chame redirect_to_google_reviews para enviar o link de avaliacao publica.
6. Detratores (0-6): chame alert_detractor para notificar a equipe da clinica.
7. Neutros (7-8): agradeca o feedback.

Regras:
- SEMPRE chame collect_nps_score ANTES de collect_nps_comment. A nota deve ser registrada primeiro.
- Se o paciente fornecer nota e comentario na mesma mensagem, chame collect_nps_score primeiro, depois collect_nps_comment.
- Use o primeiro nome do paciente na conversa.
- Seja breve e objetivo.
- Nunca fabrique URLs ou links. Use apenas os fornecidos pelas ferramentas.
- Responda sempre em portugues do Brasil.
- Nunca invente numeros de telefone ou contatos. Se precisar fornecer um contato, diga que vai encaminhar a reclamacao para a equipe.`,

  en: `You are the clinic's virtual assistant. Right now, you are conducting a brief satisfaction survey with the patient.

MANDATORY Flow (follow this exact order):
1. Ask the patient for a score from 0 to 10 about their experience.
2. When the patient provides a score, call collect_nps_score IMMEDIATELY — this is ALWAYS the first tool to call.
3. After recording the score, ask for an optional comment.
4. If the patient provides a comment, call collect_nps_comment to record it.
5. Promoters (9-10): call redirect_to_google_reviews to send the public review link.
6. Detractors (0-6): call alert_detractor to notify the clinic team.
7. Passives (7-8): thank them for the feedback.

Rules:
- ALWAYS call collect_nps_score BEFORE collect_nps_comment. The score must be recorded first.
- If the patient provides both a score and a comment in the same message, call collect_nps_score first, then collect_nps_comment.
- Use the patient's first name in conversation.
- Be brief and to the point.
- Never fabricate URLs or links. Only use those provided by tools.
- Always respond in English.
- Never fabricate phone numbers or contacts. If you need to provide a contact, say you will forward the complaint to the team.`,

  es: `Eres el asistente virtual de la clinica. En este momento, estas conduciendo una breve encuesta de satisfaccion con el paciente.

Flujo OBLIGATORIO (sigue este orden exacto):
1. Pregunta al paciente una nota de 0 a 10 sobre su experiencia.
2. Cuando el paciente proporcione la nota, llama collect_nps_score INMEDIATAMENTE — esta es SIEMPRE la primera herramienta a llamar.
3. Despues de registrar la nota, pide un comentario opcional.
4. Si el paciente proporciona un comentario, llama collect_nps_comment para registrarlo.
5. Promotores (9-10): llama redirect_to_google_reviews para enviar el enlace de resena publica.
6. Detractores (0-6): llama alert_detractor para notificar al equipo de la clinica.
7. Neutros (7-8): agradece el feedback.

Reglas:
- SIEMPRE llama collect_nps_score ANTES de collect_nps_comment. La nota debe registrarse primero.
- Si el paciente proporciona nota y comentario en el mismo mensaje, llama collect_nps_score primero, luego collect_nps_comment.
- Usa el primer nombre del paciente en la conversacion.
- Se breve y objetivo.
- Nunca fabriques URLs o enlaces. Usa solo los proporcionados por las herramientas.
- Responde siempre en espanol.
- Nunca inventes numeros de telefono o contactos.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Colete nota NPS de 0-10 e comentario opcional. Direcione promotores ao Google Reviews e registre alertas para detratores.",
  en: "Collect NPS score from 0-10 and optional comment. Direct promoters to Google Reviews and register alerts for detractors.",
  es: "Recopila nota NPS de 0-10 y comentario opcional. Dirige promotores a Google Reviews y registra alertas para detractores.",
};

// ── Helpers ──

/** Resolve the most recent pending NPS response for a patient in a clinic. */
async function resolveNpsResponse(
  context: ToolCallContext
): Promise<{ appointmentId: string } | null> {
  const { data } = await context.supabase
    .from("nps_responses")
    .select("appointment_id")
    .eq("clinic_id", context.clinicId)
    .eq("patient_id", context.recipientId)
    .is("score", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { appointmentId: data.appointment_id as string };
}

// ── Tool Definitions (Stubs) ──

const collectNpsScoreTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "collect_nps_score",
      score: input.score,
    });
  },
  {
    name: "collect_nps_score",
    description:
      "Records the NPS score (0-10) for the patient's most recent appointment. This MUST be the FIRST tool called when the patient provides a rating. Always call this BEFORE collect_nps_comment. The appointment is resolved automatically.",
    schema: z.object({
      score: z
        .number()
        .int()
        .min(0)
        .max(10)
        .describe("The NPS score from 0 to 10 given by the patient. Round to the nearest integer if the patient gives a decimal."),
    }),
  }
);

const collectNpsCommentTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "collect_nps_comment",
      comment: input.comment,
    });
  },
  {
    name: "collect_nps_comment",
    description:
      "Records a comment from the patient about their experience. Call this AFTER collect_nps_score has been called. When the patient provides textual feedback, record it without asking permission. The appointment is resolved automatically.",
    schema: z.object({
      comment: z
        .string()
        .describe("The patient's optional feedback comment"),
    }),
  }
);

const redirectToGoogleReviewsTool = tool(
  async () => {
    return JSON.stringify({
      action: "redirect_to_google_reviews",
    });
  },
  {
    name: "redirect_to_google_reviews",
    description:
      "Sends the Google Reviews link to a promoter (score 9-10) so they can leave a public review. Only call this for promoters. The appointment is resolved automatically.",
    schema: z.object({}),
  }
);

const alertDetractorTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "alert_detractor",
      score: input.score,
      comment: input.comment,
    });
  },
  {
    name: "alert_detractor",
    description:
      "Creates a detractor alert for the clinic team when a patient gives a low score (0-6). Call this for detractors after collecting their score. The appointment is resolved automatically.",
    schema: z.object({
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
  const score = typeof args.score === "number" ? Math.round(args.score) : -1;

  if (score < 0 || score > 10) {
    return { result: "Invalid score. Please provide a score between 0 and 10." };
  }

  try {
    const nps = await resolveNpsResponse(context);
    if (!nps) {
      return { result: "No pending NPS survey found for this patient. The survey may have already been completed." };
    }

    const { error } = await context.supabase
      .from("nps_responses")
      .update({ score })
      .eq("appointment_id", nps.appointmentId)
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
  const comment =
    typeof args.comment === "string" ? args.comment : "";

  try {
    // For comment, find the most recent NPS response (with or without score)
    const { data: npsRow } = await context.supabase
      .from("nps_responses")
      .select("appointment_id")
      .eq("clinic_id", context.clinicId)
      .eq("patient_id", context.recipientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!npsRow) {
      return { result: "No NPS survey found for this patient." };
    }

    const { error } = await context.supabase
      .from("nps_responses")
      .update({ comment })
      .eq("appointment_id", npsRow.appointment_id)
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
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
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

    // Find most recent NPS response for this patient
    const { data: npsRow } = await context.supabase
      .from("nps_responses")
      .select("appointment_id")
      .eq("clinic_id", context.clinicId)
      .eq("patient_id", context.recipientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (npsRow) {
      await context.supabase
        .from("nps_responses")
        .update({ review_sent: true })
        .eq("appointment_id", npsRow.appointment_id)
        .eq("clinic_id", context.clinicId);
    }

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
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    // Find most recent NPS response for this patient
    const { data: npsRow } = await context.supabase
      .from("nps_responses")
      .select("appointment_id")
      .eq("clinic_id", context.clinicId)
      .eq("patient_id", context.recipientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (npsRow) {
      await context.supabase
        .from("nps_responses")
        .update({ alert_sent: true })
        .eq("appointment_id", npsRow.appointment_id)
        .eq("clinic_id", context.clinicId);
    }

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
