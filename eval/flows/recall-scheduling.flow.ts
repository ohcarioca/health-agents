// eval/flows/recall-scheduling.flow.ts
// Flow: recall agent reaches inactive patient, patient agrees to return, routed to scheduling.
import type { EvalFlow } from "../types";

export const recallSchedulingFlow: EvalFlow = {
  id: "flow-recall-scheduling",
  name: "Reativação: recall detecta inativo → scheduling agenda consulta",
  persona: {
    name: "Fernanda Costa",
    description:
      "Paciente que não consulta há mais de 3 meses. Ao receber o contato da clínica, fica interessada em voltar e quer marcar uma consulta.",
    openingMessage: "Oi, recebi uma mensagem de vocês",
  },
  steps: [
    // Turn 1: recall explains the outreach
    {
      agentType: "recall",
      expectedToolsCalled: ["send_reactivation_message"],
    },
    // Turn 2: patient says she wants to book, recall routes to scheduling
    {
      agentType: "recall",
      fixedPatientMessage: "Que ótimo, quero marcar uma consulta sim!",
      expectedToolsCalled: ["route_to_scheduling"],
    },
    // Turn 3: scheduling checks availability
    {
      agentType: "scheduling",
      expectedToolsCalled: ["check_availability"],
    },
    // Turn 4: patient picks a slot, scheduling confirms booking
    {
      agentType: "scheduling",
      expectedToolsCalled: ["book_appointment"],
    },
  ],
};
