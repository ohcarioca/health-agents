// eval/cases/confirmation.eval.ts
import type { EvalCase } from "../types";

export const confirmationCases: EvalCase[] = [
  {
    id: "confirmation-001",
    agentType: "confirmation",
    description: "Paciente confirma presença ao receber lembrete de 48h",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Lembrando que você tem consulta amanhã às 10h com Dr. Avaliação. Confirma presença?",
      },
    ],
    userMessage: "Sim, confirmo!",
    expectedOutcomes: {
      toolsCalled: ["confirm_attendance"],
    },
  },
  {
    id: "confirmation-002",
    agentType: "confirmation",
    description: "Paciente quer reagendar ao receber lembrete",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Lembrando que você tem consulta amanhã às 10h. Confirma presença?",
      },
    ],
    userMessage: "Não vou poder comparecer, preciso remarcar.",
    expectedOutcomes: {
      toolsCalled: ["reschedule_from_confirmation"],
    },
  },
  {
    id: "confirmation-003",
    agentType: "confirmation",
    description: "Paciente confirma mas menciona atraso",
    conversation: [
      {
        role: "assistant",
        content: "Você confirma a consulta de amanhã às 10h?",
      },
    ],
    userMessage: "Confirmo, mas posso me atrasar uns 15 minutos.",
    expectedOutcomes: {
      toolsCalled: ["confirm_attendance"],
    },
    extraCriteria: ["Gestão de expectativas"],
  },
];
