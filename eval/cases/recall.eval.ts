// eval/cases/recall.eval.ts
import type { EvalCase } from "../types";

export const recallCases: EvalCase[] = [
  {
    id: "recall-001",
    agentType: "recall",
    description: "Agente inicia reativação de paciente inativo (>90 dias)",
    conversation: [],
    userMessage: "Oii, vi que recebi uma mensagem de vocês. O que aconteceu?",
    expectedOutcomes: {
      toolsCalled: ["send_reactivation_message"],
    },
    extraCriteria: ["Motivação para retorno"],
  },
  {
    id: "recall-002",
    agentType: "recall",
    description: "Paciente responde positivamente ao recall — roteado para scheduling",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Notamos que faz mais de 3 meses desde sua última consulta. Que tal agendar uma revisão?",
      },
    ],
    userMessage: "Boa ideia, quero marcar uma consulta.",
    expectedOutcomes: {
      toolsCalled: ["route_to_scheduling"],
    },
    extraCriteria: ["Motivação para retorno"],
  },
];
