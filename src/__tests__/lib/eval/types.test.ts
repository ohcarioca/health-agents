import { describe, it, expect } from "vitest";
import { evalScenarioSchema } from "@/lib/eval/types";

describe("evalScenarioSchema", () => {
  it("validates a minimal valid scenario", () => {
    const scenario = {
      id: "test-scenario",
      agent: "support",
      locale: "pt-BR",
      description: "Test scenario",
      persona: {
        name: "Maria",
        phone: "11999998888",
        personality: "Polite and straightforward",
        goal: "Get clinic info",
      },
      expectations: {
        goal_achieved: true,
      },
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
      max_turns: 12,
      persona: {
        name: "Maria Silva",
        phone: "11987654321",
        personality: "Polite, no medical knowledge",
        goal: "Book cardiology appointment with Dr. Joao",
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
          { id: "svc-1", name: "Consulta", duration_minutes: 30, price_cents: 25000 },
        ],
        professional_services: [
          { professional_id: "prof-1", service_id: "svc-1", price_cents: 25000 },
        ],
        module_configs: [
          { module_type: "billing", enabled: true, settings: { auto_billing: false } },
        ],
      },
      guardrails: {
        never_tools: ["cancel_appointment"],
        never_contains: ["cancelar"],
      },
      expectations: {
        tools_called: ["check_availability", "book_appointment"],
        tools_not_called: ["cancel_appointment"],
        response_contains: ["disponivel"],
        goal_achieved: true,
        assertions: {
          appointment_created: true,
          confirmation_queue_entries: 3,
        },
      },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("rejects scenario without required fields", () => {
    const result = evalScenarioSchema.safeParse({ id: "test" });
    expect(result.success).toBe(false);
  });

  it("validates a billing scenario with invoice fixtures and CPF", () => {
    const scenario = {
      id: "billing-payment-link",
      agent: "billing",
      locale: "pt-BR",
      description: "Patient requests payment link",
      persona: {
        name: "Carlos Mendes",
        phone: "11987650010",
        cpf: "12345678901",
        personality: "Direct and impatient",
        goal: "Pay pending invoice via Pix",
      },
      fixtures: {
        invoices: [
          {
            id: "eval-inv-1",
            amount_cents: 15000,
            due_date: "2026-02-20",
            status: "pending",
          },
        ],
      },
      expectations: {
        tools_called: ["create_payment_link"],
        goal_achieved: true,
        assertions: {
          invoice_status: "paid",
          payment_link_created: true,
        },
      },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.persona.cpf).toBe("12345678901");
      expect(result.data.fixtures?.invoices).toHaveLength(1);
      expect(result.data.fixtures?.invoices?.[0].amount_cents).toBe(15000);
      expect(result.data.expectations.assertions?.invoice_status).toBe("paid");
      expect(result.data.expectations.assertions?.payment_link_created).toBe(true);
    }
  });

  it("rejects invalid agent type", () => {
    const scenario = {
      id: "test",
      agent: "invalid_agent",
      locale: "pt-BR",
      description: "Test",
      persona: {
        name: "Maria",
        phone: "11999998888",
        personality: "Normal",
        goal: "Test goal",
      },
      expectations: { goal_achieved: true },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });

  it("rejects persona without personality or goal", () => {
    const scenario = {
      id: "test",
      agent: "support",
      locale: "pt-BR",
      description: "Test",
      persona: {
        name: "Maria",
        phone: "11999998888",
      },
      expectations: { goal_achieved: true },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });

  it("defaults max_turns to 20", () => {
    const scenario = {
      id: "test",
      agent: "support",
      locale: "pt-BR",
      description: "Test",
      persona: {
        name: "Maria",
        phone: "11999998888",
        personality: "Normal",
        goal: "Test goal",
      },
      expectations: { goal_achieved: true },
    };
    const result = evalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_turns).toBe(20);
    }
  });
});
