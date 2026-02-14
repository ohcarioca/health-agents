import { describe, it, expect, vi } from "vitest";
import { checkTurn, checkAssertions } from "@/lib/eval/checker";
import type { TurnExpect } from "@/lib/eval/types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("checkTurn", () => {
  it("passes when all expectations met", () => {
    const expect_: TurnExpect = {
      tools_called: ["check_availability"],
      no_tools: ["book_appointment"],
      response_contains: ["disponivel"],
      response_not_contains: ["https://"],
    };
    const result = checkTurn(
      expect_,
      ["check_availability"],
      "Temos horarios disponivel para voce"
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when expected tool not called", () => {
    const expect_: TurnExpect = {
      tools_called: ["check_availability"],
    };
    const result = checkTurn(expect_, [], "Some response");
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("check_availability");
  });

  it("fails when forbidden tool was called", () => {
    const expect_: TurnExpect = {
      no_tools: ["book_appointment"],
    };
    const result = checkTurn(
      expect_,
      ["check_availability", "book_appointment"],
      "Booked!"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("book_appointment");
  });

  it("fails when expected substring missing", () => {
    const expect_: TurnExpect = {
      response_contains: ["horario"],
    };
    const result = checkTurn(expect_, [], "Ola, como posso ajudar?");
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("horario");
  });

  it("fails when forbidden substring present", () => {
    const expect_: TurnExpect = {
      response_not_contains: ["https://"],
    };
    const result = checkTurn(
      expect_,
      [],
      "Acesse https://fake-link.com para pagar"
    );
    expect(result.passed).toBe(false);
  });

  it("checks response_matches regex", () => {
    const expect_: TurnExpect = {
      response_matches: "\\d{2}/\\d{2}/\\d{4}",
    };
    const pass = checkTurn(expect_, [], "Sua consulta e em 18/02/2026");
    expect(pass.passed).toBe(true);

    const fail = checkTurn(expect_, [], "Consulta marcada");
    expect(fail.passed).toBe(false);
  });

  it("passes with empty expectations", () => {
    const result = checkTurn({}, ["any_tool"], "any response");
    expect(result.passed).toBe(true);
  });
});

function mockSupabase(tableResults: Record<string, { data: unknown[] | null }>): SupabaseClient {
  const chainable = (table: string) => {
    const result = tableResults[table] ?? { data: [] };
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: result.data ? result.data[0] : null }),
      then: (resolve: (val: { data: unknown[] | null }) => void) => resolve(result),
    };
    return chain;
  };

  return { from: (table: string) => chainable(table) } as unknown as SupabaseClient;
}

describe("checkAssertions — billing", () => {
  it("passes when payment_link_created matches", async () => {
    const supabase = mockSupabase({
      payment_links: { data: [{ id: "pl-1" }] },
    });
    const result = await checkAssertions(
      supabase,
      { payment_link_created: true },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when payment_link_created expected but none exist", async () => {
    const supabase = mockSupabase({
      payment_links: { data: [] },
    });
    const result = await checkAssertions(
      supabase,
      { payment_link_created: true },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("payment_link_created");
  });

  it("passes when invoice_status matches", async () => {
    const supabase = mockSupabase({
      invoices: { data: [{ status: "paid" }] },
    });
    const result = await checkAssertions(
      supabase,
      { invoice_status: "paid" },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when invoice_status does not match", async () => {
    const supabase = mockSupabase({
      invoices: { data: [{ status: "pending" }] },
    });
    const result = await checkAssertions(
      supabase,
      { invoice_status: "paid" },
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("invoice_status");
  });

  it("passes with no assertions", async () => {
    const supabase = mockSupabase({});
    const result = await checkAssertions(
      supabase,
      undefined,
      "clinic-1",
      "patient-1",
      "conv-1"
    );
    expect(result.passed).toBe(true);
  });
});
