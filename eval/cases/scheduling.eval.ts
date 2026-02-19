// eval/cases/scheduling.eval.ts
import type { EvalCase } from "../types";

export const schedulingCases: EvalCase[] = [
  {
    id: "scheduling-001",
    agentType: "scheduling",
    description: "Paciente pede disponibilidade para a semana que vem",
    conversation: [],
    userMessage:
      "Olá, gostaria de marcar uma consulta para a semana que vem. Quais horários têm disponíveis?",
    expectedOutcomes: {
      toolsCalled: ["check_availability"],
    },
  },
  {
    id: "scheduling-002",
    agentType: "scheduling",
    description: "Paciente agenda após ver disponibilidade (happy path)",
    conversation: [
      {
        role: "user",
        content: "Quero marcar para terça-feira que vem.",
      },
      {
        role: "assistant",
        content:
          "Terça-feira temos os seguintes horários: 09:00, 10:00, 14:00 e 15:00. Qual prefere?",
      },
    ],
    userMessage: "Pode ser às 10h.",
    expectedOutcomes: {
      toolsCalled: ["book_appointment"],
    },
  },
  {
    id: "scheduling-003",
    agentType: "scheduling",
    description: "Paciente quer reagendar consulta existente",
    conversation: [],
    userMessage:
      "Preciso remarcar minha consulta que está agendada para amanhã. Tem como mudar para quinta?",
    expectedOutcomes: {
      toolsCalled: ["list_patient_appointments"],
    },
  },
  {
    id: "scheduling-004",
    agentType: "scheduling",
    description: "Paciente cancela consulta",
    conversation: [
      {
        role: "user",
        content: "Quero cancelar minha consulta de amanhã.",
      },
      {
        role: "assistant",
        content:
          "Encontrei sua consulta de amanhã às 10h. Tem certeza que deseja cancelar?",
      },
    ],
    userMessage: "Sim, pode cancelar.",
    expectedOutcomes: {
      toolsCalled: ["cancel_appointment"],
    },
  },
  {
    id: "scheduling-005",
    agentType: "scheduling",
    description: "Paciente pede consulta sem especificar data — agente deve guiar",
    conversation: [],
    userMessage: "Quero marcar uma consulta.",
    expectedOutcomes: {},
    extraCriteria: ["Coleta de informações"],
  },
];
