// eval/flows/nps.flow.ts
// Flow: NPS agent surveys patient after completed appointment.
// Promoter path: score 9 → comment → Google Reviews redirect.
import type { EvalFlow } from "../types";

export const npsFlow: EvalFlow = {
  id: "flow-nps",
  name: "NPS: pesquisa pós-consulta, promotor redireciona para Google Reviews",
  persona: {
    name: "Roberto Alves",
    description:
      "Paciente satisfeito que acabou de consultar. Dará nota 9, fará um comentário positivo e estará disposto a deixar uma avaliação no Google.",
    openingMessage: "Olá",
  },
  steps: [
    // Turn 1: patient says "Olá" — NPS agent asks for score (no tool yet, score not received)
    {
      agentType: "nps",
    },
    // Turn 2: patient gives score 9 — agent MUST call collect_nps_score then ask for comment
    {
      agentType: "nps",
      fixedPatientMessage: "9",
      expectedToolsCalled: ["collect_nps_score"],
    },
    // Turn 3: patient leaves comment — agent calls collect_nps_comment + redirect_to_google_reviews
    {
      agentType: "nps",
      fixedPatientMessage: "Atendimento excelente, super recomendo!",
      expectedToolsCalled: ["collect_nps_comment", "redirect_to_google_reviews"],
    },
  ],
};
