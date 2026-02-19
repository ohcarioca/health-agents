// eval/flows/billing.flow.ts
// Flow: billing agent contacts patient about overdue invoice, patient pays.
import type { EvalFlow } from "../types";

export const billingFlow: EvalFlow = {
  id: "flow-billing",
  name: "Cobrança: agente envia fatura pendente, paciente paga",
  persona: {
    name: "Ana Souza",
    description:
      "Paciente com fatura pendente de R$200. Está disposta a pagar mas quer ver o valor e a forma de pagamento antes de confirmar.",
    openingMessage: "Oi, recebi uma mensagem sobre uma cobrança",
  },
  steps: [
    // Turn 1: billing lists the invoice
    {
      agentType: "billing",
      expectedToolsCalled: ["list_patient_invoices"],
    },
    // Turn 2: patient confirms interest in paying, billing creates payment link
    {
      agentType: "billing",
      expectedToolsCalled: ["create_payment_link"],
    },
    // Turn 3: patient says they paid / billing checks status
    {
      agentType: "billing",
      fixedPatientMessage: "Paguei agora, pode verificar?",
      expectedToolsCalled: ["check_payment_status"],
    },
  ],
};
