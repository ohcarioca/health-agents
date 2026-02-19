// eval/cases/nps.eval.ts
import type { EvalCase } from "../types";

export const npsCases: EvalCase[] = [
  {
    id: "nps-001",
    agentType: "nps",
    description: "Paciente promotor dá nota 9",
    conversation: [
      {
        role: "assistant",
        content:
          "Olá! Sua consulta foi ontem. De 0 a 10, qual nota você daria para a experiência?",
      },
    ],
    userMessage: "9! Foi ótimo.",
    expectedOutcomes: {
      toolsCalled: ["collect_nps_score"],
    },
    extraCriteria: ["Sensibilidade emocional"],
  },
  {
    id: "nps-002",
    agentType: "nps",
    description: "Paciente detrator dá nota 3 — deve escalar",
    conversation: [
      {
        role: "assistant",
        content: "De 0 a 10, qual nota você daria para a experiência?",
      },
    ],
    userMessage: "3. Tive que esperar muito tempo.",
    expectedOutcomes: {
      toolsCalled: ["collect_nps_score", "alert_detractor"],
    },
    extraCriteria: ["Sensibilidade emocional", "Empatia com reclamação"],
  },
  {
    id: "nps-003",
    agentType: "nps",
    description: "Promotor deixa comentário e aceita Google Reviews",
    conversation: [
      {
        role: "assistant",
        content: "Que ótimo! Nota 9! Quer deixar um comentário?",
      },
    ],
    userMessage: "Claro, adorei o atendimento, muito atencioso.",
    expectedOutcomes: {
      toolsCalled: ["collect_nps_comment", "redirect_to_google_reviews"],
    },
    extraCriteria: ["Sensibilidade emocional"],
  },
];
