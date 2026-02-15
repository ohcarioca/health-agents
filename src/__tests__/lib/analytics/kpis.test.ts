import { describe, it, expect } from "vitest";
import {
  calculateNPS,
  calculateConfirmationRate,
  calculateRevenueMetrics,
  formatCents,
  groupByDate,
} from "@/lib/analytics/kpis";

describe("calculateNPS", () => {
  it("returns null for empty responses", () => {
    expect(calculateNPS([])).toEqual({
      score: null,
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
    });
  });

  it("calculates NPS correctly with mixed scores", () => {
    const scores = [9, 10, 8, 3, 5];
    const result = calculateNPS(scores);
    expect(result.score).toBe(0);
    expect(result.promoters).toBe(2);
    expect(result.passives).toBe(1);
    expect(result.detractors).toBe(2);
    expect(result.total).toBe(5);
  });

  it("returns 100 for all promoters", () => {
    const result = calculateNPS([9, 10, 10, 9]);
    expect(result.score).toBe(100);
  });

  it("returns -100 for all detractors", () => {
    const result = calculateNPS([0, 1, 2, 3]);
    expect(result.score).toBe(-100);
  });
});

describe("calculateConfirmationRate", () => {
  it("returns 0 for empty data", () => {
    expect(calculateConfirmationRate(0, 0)).toBe(0);
  });

  it("calculates rate as percentage", () => {
    expect(calculateConfirmationRate(8, 10)).toBe(80);
  });
});

describe("calculateRevenueMetrics", () => {
  it("returns zeros for empty invoices", () => {
    const result = calculateRevenueMetrics([]);
    expect(result).toEqual({
      totalCents: 0,
      paidCents: 0,
      pendingCents: 0,
      overdueCount: 0,
      conversionRate: 0,
    });
  });

  it("aggregates invoice amounts correctly", () => {
    const invoices = [
      { amount_cents: 15000, status: "paid" },
      { amount_cents: 20000, status: "paid" },
      { amount_cents: 10000, status: "pending" },
      { amount_cents: 5000, status: "overdue" },
    ];
    const result = calculateRevenueMetrics(invoices);
    expect(result.totalCents).toBe(50000);
    expect(result.paidCents).toBe(35000);
    expect(result.pendingCents).toBe(10000);
    expect(result.overdueCount).toBe(1);
    expect(result.conversionRate).toBe(50);
  });
});

describe("formatCents", () => {
  it("formats cents to BRL string", () => {
    // Node.js toLocaleString uses non-breaking space (\u00a0) between R$ and amount
    expect(formatCents(15000)).toBe("R$\u00a0150,00");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("R$\u00a00,00");
  });
});

describe("groupByDate", () => {
  it("groups items by date key", () => {
    const items = [
      { date: "2026-02-10", value: 3 },
      { date: "2026-02-10", value: 2 },
      { date: "2026-02-11", value: 5 },
    ];
    const result = groupByDate(items, "date", "value");
    expect(result).toEqual([
      { date: "2026-02-10", value: 5 },
      { date: "2026-02-11", value: 5 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(groupByDate([], "date", "value")).toEqual([]);
  });
});
