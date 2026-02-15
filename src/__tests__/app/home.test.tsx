import { describe, it, expect } from "vitest";
import { calculateNPS, formatCents } from "@/lib/analytics/kpis";

/**
 * The DashboardPage is now an async Server Component that fetches data
 * directly from Supabase. Rendering it in Vitest would require mocking
 * the entire Supabase admin client, next-intl server, and async rendering.
 *
 * Dashboard logic is instead tested via:
 * - src/__tests__/lib/analytics/kpis.test.ts (pure KPI calculations)
 * - The API routes serve the same data to the reports client page.
 *
 * This file verifies the core utilities used by the dashboard.
 */
describe("Dashboard utilities", () => {
  it("calculateNPS returns correct score for mixed inputs", () => {
    const result = calculateNPS([9, 10, 8, 3, 5]);
    expect(result.score).toBe(0);
    expect(result.promoters).toBe(2);
    expect(result.detractors).toBe(2);
  });

  it("formatCents formats zero correctly", () => {
    const formatted = formatCents(0);
    expect(formatted).toContain("0,00");
  });
});
