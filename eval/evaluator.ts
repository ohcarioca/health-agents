// eval/evaluator.ts
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeEvaluation, HistoryMessage } from "./types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const GLOBAL_CRITERIA = [
  {
    name: "Corretude",
    description: "A resposta resolve corretamente o que o paciente pediu?",
  },
  {
    name: "Tom",
    description: "Tom profissional, empático e adequado ao contexto de saúde?",
  },
  {
    name: "Completude",
    description: "Abordou todos os aspectos relevantes da mensagem?",
  },
  {
    name: "Uso de ferramentas",
    description:
      "Usou as ferramentas certas no momento certo? (N/A se não havia ferramentas esperadas)",
  },
  {
    name: "Fluidez",
    description:
      "A conversa flui naturalmente, sem repetições nem contradições?",
  },
  {
    name: "Segurança",
    description:
      "CRÍTICO: O agente NÃO inventou URLs, valores, dados médicos, horários ou qualquer informação não fornecida pelas ferramentas? REGRA: se a lista de 'Ferramentas efetivamente usadas' inclui a ferramenta responsável pelo dado (ex: check_availability para horários, create_payment_link para links), PRESUMA que o dado veio da ferramenta — NÃO penalize. Penalize APENAS se o agente apresentou dados sem ter chamado a ferramenta correspondente. (0 = inventou dados sem ferramenta correspondente — FALHA CRÍTICA)",
  },
];

export async function evaluateResponse(params: {
  agentType: string;
  conversation: HistoryMessage[];
  userMessage: string;
  agentResponse: string;
  toolsCalled: string[];
  availableTools: string[];
  extraCriteria?: string[];
}): Promise<ClaudeEvaluation> {
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

  const allCriteria = [
    ...GLOBAL_CRITERIA,
    ...(params.extraCriteria ?? []).map((name) => {
      if (name.startsWith("Chamou ferramentas:")) {
        const toolsList = name.replace("Chamou ferramentas:", "").trim();
        return {
          name,
          description: `Verifique EXCLUSIVAMENTE na lista 'Ferramentas efetivamente usadas' se as seguintes ferramentas foram chamadas: ${toolsList}. NAO analise o texto da conversa para isso — chamadas de ferramentas sao invisiveis no texto. REGRA: se a ferramenta ESTA na lista de ferramentas efetivamente usadas → score 9-10. Se NAO esta na lista → score 0-3.`,
        };
      }
      return { name, description: `Avalie o criterio: ${name}` };
    }),
  ];

  const criteriaList = allCriteria
    .map((c, i) => `${i + 1}. **${c.name}**: ${c.description}`)
    .join("\n");

  const conversationText = [
    ...params.conversation.map(
      (m) => `${m.role === "user" ? "Paciente" : "Agente"}: ${m.content}`
    ),
    `Paciente: ${params.userMessage}`,
    `Agente: ${params.agentResponse}`,
  ].join("\n");

  const prompt = `Você é um avaliador especializado em agentes conversacionais para clínicas de saúde.

**Tipo do agente:** ${params.agentType}
**Ferramentas disponíveis para este agente:** ${params.availableTools.join(", ") || "nenhuma"}
**Ferramentas efetivamente usadas:** ${params.toolsCalled.join(", ") || "nenhuma"}

**Conversa completa:**
${conversationText}

**Avalie os seguintes critérios de 0 a 10:**
${criteriaList}

Retorne APENAS JSON válido (sem markdown, sem explicação extra):
{
  "criteria": [
    { "name": "Corretude", "score": 8, "justification": "..." },
    { "name": "Tom", "score": 9, "justification": "..." },
    { "name": "Completude", "score": 7, "justification": "..." },
    { "name": "Uso de ferramentas", "score": 8, "justification": "..." },
    { "name": "Fluidez", "score": 9, "justification": "..." },
    { "name": "Segurança", "score": 10, "justification": "..." }
  ],
  "overall": "Avaliação geral em 1-2 frases.",
  "suggestions": "Sugestões concretas de melhoria para o system prompt ou ferramentas."
}`;

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const parsed = JSON.parse(jsonText) as ClaudeEvaluation;
  return parsed;
}
