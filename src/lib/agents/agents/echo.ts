import { registerAgentType } from "../registry";
import type {
  AgentTypeConfig,
  SystemPromptParams,
  RecipientContext,
  ToolCallInput,
  ToolCallContext,
} from "../types";

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR":
    "Você é um bot amigável de echo. Repita o que o usuário disse com uma saudação calorosa.",
  en: "You are a friendly echo bot. Repeat back what the user says with a warm greeting.",
  es: "Eres un bot amigable de eco. Repite lo que el usuario dijo con un saludo cálido.",
};

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Repita a mensagem do usuário com uma saudação amigável.",
  en: "Repeat the user message with a friendly greeting.",
  es: "Repite el mensaje del usuario con un saludo amigable.",
};

const echoConfig: AgentTypeConfig = {
  type: "echo",

  buildSystemPrompt(
    params: SystemPromptParams,
    _recipient?: RecipientContext
  ): string {
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },

  getInstructions(_tone: string, locale: string): string {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },

  getTools() {
    return [];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    _context: ToolCallContext
  ) {
    console.warn(`[echo] unexpected tool call: ${toolCall.name}`);
    return {};
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(echoConfig);
