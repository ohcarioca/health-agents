/**
 * Pure KPI calculation utilities for the analytics dashboard.
 * No database calls — just math and formatting.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NPSResult {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

export interface InvoiceForMetrics {
  amount_cents: number;
  status: string;
}

export interface RevenueMetrics {
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  overdueCount: number;
  conversionRate: number;
}

// ---------------------------------------------------------------------------
// NPS
// ---------------------------------------------------------------------------

/**
 * Calculate Net Promoter Score from an array of 0-10 scores.
 *
 * - Promoters: 9-10
 * - Passives:  7-8
 * - Detractors: 0-6
 * - NPS = ((promoters - detractors) / total) * 100, rounded to nearest integer
 */
export function calculateNPS(scores: number[]): NPSResult {
  if (scores.length === 0) {
    return {
      score: null,
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
    };
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const s of scores) {
    if (s >= 9) {
      promoters++;
    } else if (s >= 7) {
      passives++;
    } else {
      detractors++;
    }
  }

  const total = scores.length;
  const score = Math.round(((promoters - detractors) / total) * 100);

  return { score, promoters, passives, detractors, total };
}

// ---------------------------------------------------------------------------
// Confirmation Rate
// ---------------------------------------------------------------------------

/**
 * Calculate confirmation rate as a percentage (0-100).
 * Returns 0 when total is 0 to avoid division by zero.
 */
export function calculateConfirmationRate(
  confirmed: number,
  total: number,
): number {
  if (total === 0) return 0;
  return Math.round((confirmed / total) * 100);
}

// ---------------------------------------------------------------------------
// Revenue Metrics
// ---------------------------------------------------------------------------

/**
 * Aggregate invoice data into revenue KPIs.
 *
 * - `paidCents`: sum of invoices with status "paid"
 * - `pendingCents`: sum of invoices with status "pending"
 * - `overdueCount`: count of invoices with status "overdue"
 * - `conversionRate`: percentage of paid invoices out of total count
 */
export function calculateRevenueMetrics(
  invoices: InvoiceForMetrics[],
): RevenueMetrics {
  if (invoices.length === 0) {
    return {
      totalCents: 0,
      paidCents: 0,
      pendingCents: 0,
      overdueCount: 0,
      conversionRate: 0,
    };
  }

  let totalCents = 0;
  let paidCents = 0;
  let pendingCents = 0;
  let overdueCount = 0;
  let paidCount = 0;

  for (const inv of invoices) {
    totalCents += inv.amount_cents;

    switch (inv.status) {
      case "paid":
        paidCents += inv.amount_cents;
        paidCount++;
        break;
      case "pending":
        pendingCents += inv.amount_cents;
        break;
      case "overdue":
        overdueCount++;
        break;
    }
  }

  const conversionRate = Math.round((paidCount / invoices.length) * 100);

  return { totalCents, paidCents, pendingCents, overdueCount, conversionRate };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format an integer amount in cents as a BRL currency string.
 *
 * Example: `formatCents(15000)` => `"R$\u00a0150,00"`
 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Group items by a date key, summing a numeric value key.
 * Returns an array of `{ date, value }` sorted by date ascending.
 */
export function groupByDate<T extends Record<string, unknown>>(
  items: T[],
  dateKey: keyof T & string,
  valueKey: keyof T & string,
): Array<{ date: string; value: number }> {
  if (items.length === 0) return [];

  const map = new Map<string, number>();

  for (const item of items) {
    const date = String(item[dateKey]);
    const value = Number(item[valueKey]);
    map.set(date, (map.get(date) ?? 0) + value);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}
