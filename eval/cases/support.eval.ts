// eval/cases/support.eval.ts
import type { EvalCase } from "../types";

export const supportCases: EvalCase[] = [
  {
    id: "support-001",
    agentType: "support",
    description: "Paciente pergunta horário de funcionamento",
    conversation: [],
    userMessage: "Olá, qual é o horário de funcionamento da clínica?",
    expectedOutcomes: {
      toolsCalled: ["get_clinic_info"],
    },
    extraCriteria: [],
  },
  {
    id: "support-002",
    agentType: "support",
    description: "Paciente pede para falar com humano",
    conversation: [
      {
        role: "user",
        content: "Preciso resolver um problema urgente.",
      },
      {
        role: "assistant",
        content: "Olá! Sou o assistente virtual da clínica. Como posso ajudar?",
      },
    ],
    userMessage: "Quero falar com uma pessoa, não com robô.",
    expectedOutcomes: {
      toolsCalled: ["escalate_to_human"],
    },
    extraCriteria: [],
  },
  {
    id: "support-003",
    agentType: "support",
    description: "Paciente pede para agendar consulta — deve rotear",
    conversation: [],
    userMessage: "Quero marcar uma consulta para a semana que vem.",
    expectedOutcomes: {
      toolsCalled: ["route_to_module"],
    },
    extraCriteria: [],
  },
];
