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
    // Turn 1: NPS agent asks for score
    {
      agentType: "nps",
      expectedToolsCalled: ["collect_nps_score"],
    },
    // Turn 2: patient gives score 9, agent collects comment
    {
      agentType: "nps",
      fixedPatientMessage: "9",
      expectedToolsCalled: ["collect_nps_comment"],
    },
    // Turn 3: patient leaves comment, agent redirects to Google Reviews
    {
      agentType: "nps",
      fixedPatientMessage: "Atendimento excelente, super recomendo!",
      expectedToolsCalled: ["redirect_to_google_reviews"],
    },
  ],
};
