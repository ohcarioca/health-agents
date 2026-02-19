// eval/flows/scheduling.flow.ts
// Flow: patient asks to schedule, support routes to scheduling, appointment booked.
import type { EvalFlow } from "../types";

export const schedulingFlow: EvalFlow = {
  id: "flow-scheduling",
  name: "Agendamento completo via support → scheduling",
  persona: {
    name: "Carlos Lima",
    description:
      "Paciente novo querendo marcar uma consulta geral. Responde perguntas de forma direta e está disponível qualquer dia da semana.",
    openingMessage: "Oi, queria marcar uma consulta",
  },
  steps: [
    // Turn 1: support receives the opening and routes to scheduling
    {
      agentType: "support",
      expectedToolsCalled: ["route_to_module"],
    },
    // Turn 2: scheduling asks for preferences / checks availability
    {
      agentType: "scheduling",
      expectedToolsCalled: ["check_availability"],
    },
    // Turn 3: patient picks a slot (LLM will pick from what was offered)
    {
      agentType: "scheduling",
      expectedToolsCalled: ["book_appointment"],
    },
  ],
};
