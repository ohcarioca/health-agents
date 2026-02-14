import { describe, it, expect } from "vitest";
import { checkTurn } from "@/lib/eval/checker";
import type { TurnExpect } from "@/lib/eval/types";

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
