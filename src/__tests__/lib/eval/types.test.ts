import { describe, it, expect } from "vitest";
import { evalScenarioSchema } from "@/lib/eval/types";

describe("evalScenarioSchema", () => {
  it("validates a minimal valid scenario", () => {
    const scenario = {
      id: "test-scenario",
      agent: "support",
      locale: "pt-BR",
      description: "Test scenario",
      persona: { name: "Maria", phone: "11999998888" },
      turns: [
        {
          user: "Oi",
          expect: {},
        },
      ],
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("validates a full scenario with all fields", () => {
    const scenario = {
      id: "scheduling-happy-path",
      agent: "scheduling",
      locale: "pt-BR",
      description: "Patient books appointment",
      persona: {
        name: "Maria Silva",
        phone: "11987654321",
        notes: "Prefere manha",
      },
      fixtures: {
        professionals: [
          {
            id: "prof-1",
            name: "Dr. Joao",
            specialty: "Cardiologia",
            appointment_duration_minutes: 30,
            schedule_grid: {
              monday: [{ start: "08:00", end: "12:00" }],
            },
          },
        ],
        services: [
          { id: "svc-1", name: "Consulta", duration_minutes: 30 },
        ],
      },
      turns: [
        {
          user: "Quero marcar consulta",
          expect: {
            tools_called: ["check_availability"],
            no_tools: ["book_appointment"],
            response_contains: ["disponivel"],
            response_not_contains: ["https://"],
          },
        },
      ],
      assertions: {
        appointment_created: true,
        confirmation_queue_entries: 3,
        conversation_status: "active",
      },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("rejects scenario without required fields", () => {
    const result = evalScenarioSchema.safeParse({ id: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent type", () => {
    const scenario = {
      id: "test",
      agent: "invalid_agent",
      locale: "pt-BR",
      description: "Test",
      persona: { name: "Maria", phone: "11999998888" },
      turns: [{ user: "Oi", expect: {} }],
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });
});
