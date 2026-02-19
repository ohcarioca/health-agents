// eval/patient-simulator.ts
// LLM-based patient simulator for E2E flows.
// Receives the conversation history and a persona description, and produces
// the next patient message.  Uses the same CLAUDE_MODEL used by the evaluator.

import Anthropic from "@anthropic-ai/sdk";
import type { HistoryMessage, PatientPersona } from "./types";

export type { PatientPersona };

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function simulatePatientReply(params: {
  persona: PatientPersona;
  conversation: HistoryMessage[];
  agentLastMessage: string;
  /** Optional hard-coded next reply — skips the LLM when provided */
  fixedReply?: string;
}): Promise<string> {
  if (params.fixedReply) return params.fixedReply;

  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

  const conversationText = [
    ...params.conversation.map(
      (m) => `${m.role === "user" ? "Paciente" : "Agente"}: ${m.content}`
    ),
    `Agente: ${params.agentLastMessage}`,
  ].join("\n");

  const prompt = `Você está simulando um paciente em uma conversa com um agente de saúde via WhatsApp.

**Persona do paciente:**
Nome: ${params.persona.name}
Descrição: ${params.persona.description}

**Conversa até agora:**
${conversationText}

**Sua tarefa:** Responda APENAS com a próxima mensagem do paciente. Seja breve e natural, como uma mensagem de WhatsApp real. Não inclua prefixo como "Paciente:" — apenas o texto da mensagem.

Mantenha a persona e o objetivo do paciente em mente. Se o objetivo foi atingido (agendamento confirmado, pagamento feito, etc.), o paciente pode se despedir brevemente.`;

  const response = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  return text;
}
