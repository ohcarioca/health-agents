import { describe, it, expect } from "vitest";
import { checkGuardrails, checkToolExpectations, checkAssertions } from "@/lib/eval/checker";
import type { ScenarioGuardrails, ScenarioExpectations } from "@/lib/eval/types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("checkGuardrails", () => {
  it("passes when no guardrails defined", () => {
    const result = checkGuardrails(undefined, ["check_availability"], "Some response");
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when forbidden tool was called", () => {
    const guardrails: ScenarioGuardrails = {
      never_tools: ["book_appointment"],
    };
    const result = checkGuardrails(
      guardrails,
      ["check_availability", "book_appointment"],
      "Booked!"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("book_appointment");
  });

  it("fails when response contains forbidden text", () => {
    const guardrails: ScenarioGuardrails = {
      never_contains: ["https://"],
    };
    const result = checkGuardrails(
      guardrails,
      [],
      "Acesse https://fake-link.com para pagar"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("https://");
  });

  it("fails when response matches forbidden pattern", () => {
    const guardrails: ScenarioGuardrails = {
      never_matches: "\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}",
    };
    const result = checkGuardrails(guardrails, [], "Seu CPF e 123.456.789-00");
    expect(result.passed).toBe(false);
  });

  it("passes when no violations found", () => {
    const guardrails: ScenarioGuardrails = {
      never_tools: ["cancel_appointment"],
      never_contains: ["cancelar"],
    };
    const result = checkGuardrails(
      guardrails,
      ["check_availability"],
      "Temos horarios disponiveis"
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});

describe("checkToolExpectations", () => {
  const baseExpectations: ScenarioExpectations = {
    goal_achieved: true,
    assertions: undefined,
  };

  it("passes when expected tools were called", () => {
    const expectations: ScenarioExpectations = {
      ...baseExpectations,
      tools_called: ["check_availability", "book_appointment"],
    };
    const result = checkToolExpectations(
      expectations,
      ["check_availability", "book_appointment"],
      ["response"]
    );
    expect(result.passed).toBe(true);
  });

  it("fails when expected tool not called", () => {
    const expectations: ScenarioExpectations = {
      ...baseExpectations,
      tools_called: ["check_availability", "book_appointment"],
    };
    const result = checkToolExpectations(
      expectations,
      ["check_availability"],
      ["response"]
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("book_appointment");
  });

  it("fails when forbidden tool was called", () => {
    const expectations: ScenarioExpectations = {
      ...baseExpectations,
      tools_not_called: ["cancel_appointment"],
    };
    const result = checkToolExpectations(
      expectations,
      ["check_availability", "cancel_appointment"],
      ["response"]
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("cancel_appointment");
  });

  it("fails when expected response text not found", () => {
    const expectations: ScenarioExpectations = {
      ...baseExpectations,
      response_contains: ["horario"],
    };
    const result = checkToolExpectations(
      expectations,
      [],
      ["Ola, como posso ajudar?"]
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("horario");
  });

  it("passes with minimal expectations", () => {
    const result = checkToolExpectations(
      baseExpectations,
      ["any_tool"],
      ["any response"]
    );
    expect(result.passed).toBe(true);
  });
});

// Helper: creates a mock Supabase client that returns table-specific data
function mockSupabase(tableData: Record<string, unknown[]>) {
  const chainable = (table: string) => {
    const data = tableData[table] ?? [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: () => ({ data: data[0] ?? null }),
      then: undefined as unknown,
    };
    // Make the chain itself act as a thenable that resolves to { data }
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: { data: unknown[] }) => void) => resolve({ data }),
      enumerable: false,
    });
    return chain;
  };
  return { from: (table: string) => chainable(table) } as unknown as SupabaseClient;
}

describe("checkAssertions — billing", () => {
  it("passes when invoice_status matches", async () => {
    const supabase = mockSupabase({
      invoices: [{ status: "paid" }],
    });
    const result = await checkAssertions(
      supabase,
      { invoice_status: "paid" },
      "clinic-1", "patient-1", "conv-1"
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when invoice_status does not match", async () => {
    const supabase = mockSupabase({
      invoices: [{ status: "pending" }],
    });
    const result = await checkAssertions(
      supabase,
      { invoice_status: "paid" },
      "clinic-1", "patient-1", "conv-1"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("invoice_status");
  });

  it("passes when payment_link_created is true and link exists", async () => {
    const supabase = mockSupabase({
      payment_links: [{ id: "pl-1" }],
    });
    const result = await checkAssertions(
      supabase,
      { payment_link_created: true },
      "clinic-1", "patient-1", "conv-1"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when payment_link_created expected but none exists", async () => {
    const supabase = mockSupabase({
      payment_links: [],
    });
    const result = await checkAssertions(
      supabase,
      { payment_link_created: true },
      "clinic-1", "patient-1", "conv-1"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("payment_link_created");
  });

  it("returns passed for undefined assertions", async () => {
    const supabase = mockSupabase({});
    const result = await checkAssertions(
      supabase, undefined, "clinic-1", "patient-1", "conv-1"
    );
    expect(result.passed).toBe(true);
  });
});
