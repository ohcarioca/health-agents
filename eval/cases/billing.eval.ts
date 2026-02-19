// eval/cases/billing.eval.ts
import type { EvalCase } from "../types";

export const billingCases: EvalCase[] = [
  {
    id: "billing-001",
    agentType: "billing",
    description: "Paciente pergunta sobre faturas pendentes",
    conversation: [],
    userMessage: "Oi, tenho alguma conta pendente com vocês?",
    expectedOutcomes: {
      toolsCalled: ["list_patient_invoices"],
    },
    extraCriteria: ["Clareza do link de pagamento"],
  },
  {
    id: "billing-002",
    agentType: "billing",
    description: "Paciente quer pagar a fatura — recebe link universal",
    conversation: [
      {
        role: "assistant",
        content:
          "Você tem uma fatura de R$200,00 referente à Consulta Geral. Deseja receber o link de pagamento?",
      },
    ],
    userMessage: "Sim, pode mandar o link.",
    expectedOutcomes: {
      toolsCalled: ["create_payment_link"],
    },
    extraCriteria: ["Clareza do link de pagamento"],
  },
  {
    id: "billing-003",
    agentType: "billing",
    description: "Paciente pergunta se pagamento foi confirmado",
    conversation: [
      {
        role: "assistant",
        content: "Enviei o link de pagamento para a sua consulta.",
      },
    ],
    userMessage: "Paguei agora, já foi confirmado?",
    expectedOutcomes: {
      toolsCalled: ["check_payment_status"],
    },
    extraCriteria: ["Clareza do link de pagamento"],
  },
];
