# Phase 10: Dashboard + Reports — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the placeholder Dashboard and Reports screens into real, data-driven views. All metrics collected by the 6 agents (scheduling, confirmation, NPS, billing, recall, support) are now visualized as actionable KPIs, charts, alerts, and exportable reports.

**Architecture:** Server Components fetch aggregated data directly from Supabase via `createAdminClient()`. Interactive charts render in Client Components using Recharts. API routes serve time-series data for the Reports page. The Modules page is upgraded to show real per-module metrics. CSV export is provided for reports data.

**Tech Stack:** Recharts (charts), existing Supabase + Next.js 16 App Router + Tailwind CSS v4 + next-intl + Zod

---

## Task 1: Install Recharts

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install recharts`

**Step 2: Verify installation**

Run: `npm run build`
Expected: Build passes (Recharts is tree-shakeable, no config needed)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts for dashboard charts"
```

---

## Task 2: Analytics utility functions (TDD)

**Files:**
- Create: `src/lib/analytics/kpis.ts`
- Test: `src/__tests__/lib/analytics/kpis.test.ts`

Pure functions for KPI calculations — no DB calls, easy to test.

**Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/analytics/kpis.test.ts
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
    // 2 promoters (9, 10), 1 passive (8), 2 detractors (3, 5)
    const scores = [9, 10, 8, 3, 5];
    const result = calculateNPS(scores);
    // NPS = ((2/5) - (2/5)) * 100 = 0
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
    // 2 paid out of 4 total = 50%
    expect(result.conversionRate).toBe(50);
  });
});

describe("formatCents", () => {
  it("formats cents to BRL string", () => {
    expect(formatCents(15000)).toBe("R$ 150,00");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("R$ 0,00");
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
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/lib/analytics/kpis.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/analytics/kpis.ts

interface NPSResult {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

export function calculateNPS(scores: number[]): NPSResult {
  if (scores.length === 0) {
    return { score: null, promoters: 0, passives: 0, detractors: 0, total: 0 };
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const s of scores) {
    if (s >= 9) promoters++;
    else if (s >= 7) passives++;
    else detractors++;
  }

  const total = scores.length;
  const score = Math.round(((promoters - detractors) / total) * 100);

  return { score, promoters, passives, detractors, total };
}

export function calculateConfirmationRate(
  confirmed: number,
  total: number,
): number {
  if (total === 0) return 0;
  return Math.round((confirmed / total) * 100);
}

interface InvoiceForMetrics {
  amount_cents: number;
  status: string;
}

interface RevenueMetrics {
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  overdueCount: number;
  conversionRate: number;
}

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
    if (inv.status === "paid") {
      paidCents += inv.amount_cents;
      paidCount++;
    } else if (inv.status === "pending") {
      pendingCents += inv.amount_cents;
    }
    if (inv.status === "overdue") {
      overdueCount++;
    }
  }

  const conversionRate = Math.round((paidCount / invoices.length) * 100);

  return { totalCents, paidCents, pendingCents, overdueCount, conversionRate };
}

export function formatCents(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

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
    map.set(date, (map.get(date) || 0) + value);
  }

  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/lib/analytics/kpis.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/analytics/kpis.ts src/__tests__/lib/analytics/kpis.test.ts
git commit -m "feat(analytics): add KPI calculation utilities with tests"
```

---

## Task 3: Dashboard KPIs API route (TDD)

**Files:**
- Create: `src/app/api/dashboard/kpis/route.ts`
- Create: `src/lib/validations/dashboard.ts`
- Test: `src/__tests__/app/api/dashboard/kpis.test.ts`

**Step 1: Write the validation schema**

```typescript
// src/lib/validations/dashboard.ts
import { z } from "zod/v4";

export const dashboardPeriodSchema = z.enum(["today", "7d", "30d", "90d"]);

export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

export const reportPeriodSchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
  professionalId: z.string().uuid().optional(),
});

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
```

**Step 2: Write the failing tests**

```typescript
// src/__tests__/app/api/dashboard/kpis.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
  }),
}));

import { GET } from "@/app/api/dashboard/kpis/route";

const TODAY = "2026-02-15";

function createRequest(period = "today"): Request {
  return new Request(
    `http://localhost/api/dashboard/kpis?period=${period}`,
  );
}

// Chain builder helper to simulate Supabase fluent API
function chainBuilder(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error });
  chain.then = vi.fn((resolve) => resolve({ data, error, count: Array.isArray(data) ? data.length : 0 }));
  return chain;
}

describe("GET /api/dashboard/kpis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: membership lookup succeeds
    mockFrom.mockImplementation((table: string) => {
      if (table === "clinic_users") {
        return chainBuilder({ clinic_id: "clinic-1" });
      }
      if (table === "clinics") {
        return chainBuilder({ timezone: "America/Sao_Paulo" });
      }
      // Default: empty data for all other tables
      return chainBuilder([]);
    });
  });

  it("returns 401 if user is not authenticated", async () => {
    const { createServerSupabaseClient } = await import(
      "@/lib/supabase/server"
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never);

    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  it("returns KPIs for today period", async () => {
    const res = await GET(createRequest("today"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveProperty("appointments");
    expect(body.data).toHaveProperty("confirmations");
    expect(body.data).toHaveProperty("noShows");
    expect(body.data).toHaveProperty("nps");
    expect(body.data).toHaveProperty("revenue");
    expect(body.data).toHaveProperty("escalated");
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/app/api/dashboard/kpis.test.ts`
Expected: FAIL — module not found

**Step 4: Write the API route**

```typescript
// src/app/api/dashboard/kpis/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardPeriodSchema } from "@/lib/validations/dashboard";
import { calculateNPS, calculateRevenueMetrics } from "@/lib/analytics/kpis";

function getDateRange(period: string, timezone: string): { start: string; end: string } {
  // Build date range relative to "now" in the clinic's timezone
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);

  const start = new Date(now);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (period === "30d") {
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clinicId = membership.clinic_id as string;

  // Get clinic timezone
  const { data: clinic } = await admin
    .from("clinics")
    .select("timezone")
    .eq("id", clinicId)
    .single();

  const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

  // Parse period from query
  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") || "today";
  const parsed = dashboardPeriodSchema.safeParse(periodParam);
  const period = parsed.success ? parsed.data : "today";

  const { start, end } = getDateRange(period, timezone);

  // Fetch all metrics in parallel
  const [
    appointmentsResult,
    noShowsResult,
    confirmationsResult,
    npsResult,
    invoicesResult,
    escalatedResult,
  ] = await Promise.all([
    // Appointments in period
    admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .gte("starts_at", start)
      .lt("starts_at", end),

    // No-shows in period
    admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "no_show")
      .gte("starts_at", start)
      .lt("starts_at", end),

    // Pending confirmations
    admin
      .from("confirmation_queue")
      .select("id, appointments!inner(clinic_id)", { count: "exact", head: true })
      .eq("appointments.clinic_id", clinicId)
      .eq("status", "sent"),

    // NPS scores in period
    admin
      .from("nps_responses")
      .select("score")
      .eq("clinic_id", clinicId)
      .gte("created_at", start)
      .lt("created_at", end),

    // Invoices in period
    admin
      .from("invoices")
      .select("amount_cents, status")
      .eq("clinic_id", clinicId)
      .gte("created_at", start)
      .lt("created_at", end),

    // Escalated conversations
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "escalated"),
  ]);

  // Calculate NPS
  const npsScores = (npsResult.data || []).map(
    (r: { score: number }) => r.score,
  );
  const nps = calculateNPS(npsScores);

  // Calculate revenue
  const invoices = (invoicesResult.data || []) as Array<{
    amount_cents: number;
    status: string;
  }>;
  const revenue = calculateRevenueMetrics(invoices);

  return NextResponse.json({
    data: {
      appointments: appointmentsResult.count || 0,
      noShows: noShowsResult.count || 0,
      confirmations: confirmationsResult.count || 0,
      nps,
      revenue,
      escalated: escalatedResult.count || 0,
      period,
    },
  });
}
```

**Step 5: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/app/api/dashboard/kpis.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/app/api/dashboard/kpis/route.ts src/lib/validations/dashboard.ts src/__tests__/app/api/dashboard/kpis.test.ts
git commit -m "feat(dashboard): add KPIs API route with period filtering"
```

---

## Task 4: Dashboard alerts API route

**Files:**
- Create: `src/app/api/dashboard/alerts/route.ts`

Alerts surface actionable items: NPS detractors, overdue invoices, escalated conversations, delivery failures.

**Step 1: Write the API route**

```typescript
// src/app/api/dashboard/alerts/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface Alert {
  id: string;
  type: "detractor" | "overdue" | "escalated" | "failure";
  title: string;
  description: string;
  createdAt: string;
  entityId: string;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clinicId = membership.clinic_id as string;
  const alerts: Alert[] = [];

  // Fetch alert sources in parallel
  const [detractors, overdueInvoices, escalated, failures] = await Promise.all([
    // NPS detractors (score 0-6, not yet alerted)
    admin
      .from("nps_responses")
      .select("id, score, comment, created_at, patients(name)")
      .eq("clinic_id", clinicId)
      .lte("score", 6)
      .order("created_at", { ascending: false })
      .limit(10),

    // Overdue invoices
    admin
      .from("invoices")
      .select("id, amount_cents, due_date, patients(name)")
      .eq("clinic_id", clinicId)
      .eq("status", "overdue")
      .order("due_date", { ascending: true })
      .limit(10),

    // Escalated conversations
    admin
      .from("conversations")
      .select("id, created_at, patients(name)")
      .eq("clinic_id", clinicId)
      .eq("status", "escalated")
      .order("updated_at", { ascending: false })
      .limit(10),

    // Failed message deliveries (last 24h)
    admin
      .from("message_queue")
      .select("id, created_at, patients(name)")
      .eq("clinic_id", clinicId)
      .eq("status", "failed")
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Build alerts list
  for (const d of detractors.data || []) {
    const patient = d.patients as { name: string } | null;
    alerts.push({
      id: `detractor-${d.id}`,
      type: "detractor",
      title: patient?.name || "Patient",
      description: `NPS ${d.score}${d.comment ? `: "${d.comment}"` : ""}`,
      createdAt: d.created_at,
      entityId: d.id,
    });
  }

  for (const inv of overdueInvoices.data || []) {
    const patient = inv.patients as { name: string } | null;
    const amount = (inv.amount_cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    alerts.push({
      id: `overdue-${inv.id}`,
      type: "overdue",
      title: patient?.name || "Patient",
      description: `${amount} overdue since ${inv.due_date}`,
      createdAt: inv.due_date,
      entityId: inv.id,
    });
  }

  for (const conv of escalated.data || []) {
    const patient = conv.patients as { name: string } | null;
    alerts.push({
      id: `escalated-${conv.id}`,
      type: "escalated",
      title: patient?.name || "Patient",
      description: "Conversation escalated to human",
      createdAt: conv.created_at,
      entityId: conv.id,
    });
  }

  for (const f of failures.data || []) {
    const patient = f.patients as { name: string } | null;
    alerts.push({
      id: `failure-${f.id}`,
      type: "failure",
      title: patient?.name || "Patient",
      description: "Message delivery failed",
      createdAt: f.created_at,
      entityId: f.id,
    });
  }

  // Sort by most recent first
  alerts.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return NextResponse.json({ data: alerts.slice(0, 20) });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 3: Commit**

```bash
git add src/app/api/dashboard/alerts/route.ts
git commit -m "feat(dashboard): add alerts API route"
```

---

## Task 5: Dashboard page with real data

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Create: `src/components/dashboard/kpi-card.tsx`
- Create: `src/components/dashboard/alerts-list.tsx`
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

The dashboard becomes a Server Component that fetches KPIs directly, plus a Client Component for alerts (which auto-refreshes).

**Step 1: Add i18n keys to all 3 locales**

Add these keys under `"dashboard"` in each locale file:

**pt-BR additions:**
```json
{
  "dashboard": {
    "title": "Painel",
    "kpi": {
      "appointments": "Consultas hoje",
      "confirmations": "Confirmações pendentes",
      "noShows": "Faltas",
      "nps": "NPS médio",
      "revenue": "Receita",
      "escalated": "Escaladas"
    },
    "funnel": "Funil de conversão",
    "alerts": "Alertas recentes",
    "noAlerts": "Nenhum alerta no momento",
    "period": {
      "today": "Hoje",
      "7d": "7 dias",
      "30d": "30 dias",
      "90d": "90 dias"
    },
    "alertTypes": {
      "detractor": "NPS Detrator",
      "overdue": "Fatura vencida",
      "escalated": "Conversa escalada",
      "failure": "Falha de envio"
    },
    "noData": "Sem dados",
    "viewAll": "Ver todos"
  }
}
```

**en additions:**
```json
{
  "dashboard": {
    "title": "Dashboard",
    "kpi": {
      "appointments": "Appointments today",
      "confirmations": "Pending confirmations",
      "noShows": "No-shows",
      "nps": "Average NPS",
      "revenue": "Revenue",
      "escalated": "Escalated"
    },
    "funnel": "Conversion funnel",
    "alerts": "Recent alerts",
    "noAlerts": "No alerts at the moment",
    "period": {
      "today": "Today",
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days"
    },
    "alertTypes": {
      "detractor": "NPS Detractor",
      "overdue": "Overdue invoice",
      "escalated": "Escalated conversation",
      "failure": "Delivery failure"
    },
    "noData": "No data",
    "viewAll": "View all"
  }
}
```

**es additions:**
```json
{
  "dashboard": {
    "title": "Panel",
    "kpi": {
      "appointments": "Consultas hoy",
      "confirmations": "Confirmaciones pendientes",
      "noShows": "Ausencias",
      "nps": "NPS promedio",
      "revenue": "Ingresos",
      "escalated": "Escaladas"
    },
    "funnel": "Embudo de conversión",
    "alerts": "Alertas recientes",
    "noAlerts": "Sin alertas por el momento",
    "period": {
      "today": "Hoy",
      "7d": "7 días",
      "30d": "30 días",
      "90d": "90 días"
    },
    "alertTypes": {
      "detractor": "NPS Detractor",
      "overdue": "Factura vencida",
      "escalated": "Conversación escalada",
      "failure": "Fallo de envío"
    },
    "noData": "Sin datos",
    "viewAll": "Ver todos"
  }
}
```

**Step 2: Create KPI card component**

```typescript
// src/components/dashboard/kpi-card.tsx
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  subtitle?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  subtitle,
}: KpiCardProps) {
  return (
    <Card variant="glass">
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="size-5" strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {label}
        </p>
      </div>
      <p
        className="mt-3 text-3xl font-bold font-mono"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
    </Card>
  );
}
```

**Step 3: Create alerts list component (client component)**

```typescript
// src/components/dashboard/alerts-list.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, CreditCard, MessageSquare, XCircle } from "lucide-react";

interface Alert {
  id: string;
  type: "detractor" | "overdue" | "escalated" | "failure";
  title: string;
  description: string;
  createdAt: string;
}

const ALERT_CONFIG = {
  detractor: { icon: AlertTriangle, variant: "warning" as const },
  overdue: { icon: CreditCard, variant: "danger" as const },
  escalated: { icon: MessageSquare, variant: "accent" as const },
  failure: { icon: XCircle, variant: "danger" as const },
} as const;

export function AlertsList() {
  const t = useTranslations("dashboard");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/dashboard/alerts");
        if (res.ok) {
          const body = await res.json();
          setAlerts(body.data || []);
        }
      } catch {
        // Silently fail — alerts are supplementary
      } finally {
        setLoading(false);
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000); // Refresh every 60s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card variant="glass">
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("alerts")}
        </p>
        <div className="mt-4 flex justify-center py-8">
          <Spinner size="md" />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {t("alerts")}
      </p>
      {alerts.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("noAlerts")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {alerts.map((alert) => {
            const config = ALERT_CONFIG[alert.type];
            const Icon = config.icon;
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-lg p-3"
                style={{ backgroundColor: "var(--surface)" }}
              >
                <Icon
                  className="mt-0.5 size-4 shrink-0"
                  style={{
                    color:
                      alert.type === "detractor" || alert.type === "failure"
                        ? "var(--warning)"
                        : alert.type === "overdue"
                          ? "var(--danger)"
                          : "var(--accent)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className="truncate text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {alert.title}
                    </p>
                    <Badge variant={config.variant}>
                      {t(`alertTypes.${alert.type}`)}
                    </Badge>
                  </div>
                  <p
                    className="mt-0.5 truncate text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {alert.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
```

**Step 4: Rewrite dashboard page as Server Component**

```typescript
// src/app/(dashboard)/page.tsx
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";
import { calculateNPS } from "@/lib/analytics/kpis";
import { Calendar, CheckCircle2, UserX, Star, DollarSign, MessageSquare } from "lucide-react";
import { formatCents } from "@/lib/analytics/kpis";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const clinicId = await getClinicId();

  if (!clinicId) {
    return (
      <PageContainer>
        <PageHeader title={t("title")} />
        <p style={{ color: "var(--text-muted)" }}>{t("noData")}</p>
      </PageContainer>
    );
  }

  const admin = createAdminClient();

  // Get clinic timezone
  const { data: clinic } = await admin
    .from("clinics")
    .select("timezone")
    .eq("id", clinicId)
    .single();

  const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

  // Today's date range in clinic timezone
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setDate(todayEnd.getDate() + 1);
  todayEnd.setHours(0, 0, 0, 0);

  // Fetch all KPIs in parallel
  const [appointments, noShows, confirmations, npsData, invoicesData, escalated] =
    await Promise.all([
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("starts_at", todayStart.toISOString())
        .lt("starts_at", todayEnd.toISOString()),

      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "no_show")
        .gte("starts_at", todayStart.toISOString())
        .lt("starts_at", todayEnd.toISOString()),

      admin
        .from("confirmation_queue")
        .select("id, appointments!inner(clinic_id)", { count: "exact", head: true })
        .eq("appointments.clinic_id", clinicId)
        .eq("status", "sent"),

      admin
        .from("nps_responses")
        .select("score")
        .eq("clinic_id", clinicId)
        .gte("created_at", todayStart.toISOString())
        .lt("created_at", todayEnd.toISOString()),

      admin
        .from("invoices")
        .select("amount_cents, status")
        .eq("clinic_id", clinicId)
        .eq("status", "overdue"),

      admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "escalated"),
    ]);

  const npsScores = (npsData.data || []).map(
    (r: { score: number }) => r.score,
  );
  const nps = calculateNPS(npsScores);

  const overdueTotal = (invoicesData.data || []).reduce(
    (sum: number, inv: { amount_cents: number }) => sum + inv.amount_cents,
    0,
  );

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label={t("kpi.appointments")}
            value={appointments.count || 0}
            icon={Calendar}
            iconBg="rgba(139,92,246,0.15)"
            iconColor="var(--accent)"
          />
          <KpiCard
            label={t("kpi.confirmations")}
            value={confirmations.count || 0}
            icon={CheckCircle2}
            iconBg="rgba(34,197,94,0.15)"
            iconColor="var(--success)"
          />
          <KpiCard
            label={t("kpi.noShows")}
            value={noShows.count || 0}
            icon={UserX}
            iconBg="rgba(245,158,11,0.15)"
            iconColor="var(--warning)"
          />
          <KpiCard
            label={t("kpi.nps")}
            value={nps.score !== null ? nps.score : "—"}
            icon={Star}
            iconBg="rgba(59,130,246,0.15)"
            iconColor="var(--info)"
            subtitle={nps.total > 0 ? `${nps.total} responses` : undefined}
          />
          <KpiCard
            label={t("kpi.revenue")}
            value={overdueTotal > 0 ? formatCents(overdueTotal) : "—"}
            icon={DollarSign}
            iconBg="rgba(239,68,68,0.15)"
            iconColor="var(--danger)"
            subtitle={overdueTotal > 0 ? "overdue" : undefined}
          />
          <KpiCard
            label={t("kpi.escalated")}
            value={escalated.count || 0}
            icon={MessageSquare}
            iconBg="rgba(139,92,246,0.15)"
            iconColor="var(--accent)"
          />
        </div>

        {/* Alerts */}
        <AlertsList />
      </div>
    </PageContainer>
  );
}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 6: Commit**

```bash
git add src/app/(dashboard)/page.tsx src/components/dashboard/kpi-card.tsx src/components/dashboard/alerts-list.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat(dashboard): real KPI cards and alerts list with live data"
```

---

## Task 6: Reports API routes — appointments + NPS time-series

**Files:**
- Create: `src/app/api/reports/overview/route.ts`

Single endpoint that returns all report data for a given period: appointment trends, NPS breakdown, revenue trends, and module stats.

**Step 1: Write the API route**

```typescript
// src/app/api/reports/overview/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportPeriodSchema } from "@/lib/validations/dashboard";
import { calculateNPS, calculateRevenueMetrics } from "@/lib/analytics/kpis";

function getPeriodDays(period: string): number {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  return 90;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clinicId = membership.clinic_id as string;

  // Parse query params
  const { searchParams } = new URL(request.url);
  const parsed = reportPeriodSchema.safeParse({
    period: searchParams.get("period") || "30d",
    professionalId: searchParams.get("professionalId") || undefined,
  });

  const period = parsed.success ? parsed.data.period : "30d";
  const professionalId = parsed.success
    ? parsed.data.professionalId
    : undefined;

  const days = getPeriodDays(period);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const start = startDate.toISOString();

  // Build appointment query (optionally filtered by professional)
  let appointmentQuery = admin
    .from("appointments")
    .select("id, starts_at, status, professional_id")
    .eq("clinic_id", clinicId)
    .gte("starts_at", start)
    .order("starts_at", { ascending: true });

  if (professionalId) {
    appointmentQuery = appointmentQuery.eq("professional_id", professionalId);
  }

  // Fetch all data in parallel
  const [appointmentsResult, npsResult, invoicesResult, conversationsResult] =
    await Promise.all([
      appointmentQuery,

      admin
        .from("nps_responses")
        .select("score, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start)
        .order("created_at", { ascending: true }),

      admin
        .from("invoices")
        .select("amount_cents, status, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start)
        .order("created_at", { ascending: true }),

      admin
        .from("conversations")
        .select("id, status, current_module, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start)
        .order("created_at", { ascending: true }),
    ]);

  // --- Process appointment trends ---
  const appointments = appointmentsResult.data || [];
  const appointmentsByDate = new Map<
    string,
    { total: number; confirmed: number; completed: number; noShow: number; cancelled: number }
  >();

  for (const apt of appointments) {
    const date = (apt.starts_at as string).slice(0, 10);
    const entry = appointmentsByDate.get(date) || {
      total: 0,
      confirmed: 0,
      completed: 0,
      noShow: 0,
      cancelled: 0,
    };
    entry.total++;
    if (apt.status === "confirmed") entry.confirmed++;
    if (apt.status === "completed") entry.completed++;
    if (apt.status === "no_show") entry.noShow++;
    if (apt.status === "cancelled") entry.cancelled++;
    appointmentsByDate.set(date, entry);
  }

  const appointmentTrend = Array.from(appointmentsByDate.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Process NPS ---
  const npsScores = (npsResult.data || []).map(
    (r: { score: number }) => r.score,
  );
  const nps = calculateNPS(npsScores);

  // NPS trend by date
  const npsByDate = new Map<string, number[]>();
  for (const r of npsResult.data || []) {
    const date = (r.created_at as string).slice(0, 10);
    const scores = npsByDate.get(date) || [];
    scores.push(r.score as number);
    npsByDate.set(date, scores);
  }

  const npsTrend = Array.from(npsByDate.entries())
    .map(([date, scores]) => ({
      date,
      average: Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      ),
      count: scores.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Process Revenue ---
  const invoices = (invoicesResult.data || []) as Array<{
    amount_cents: number;
    status: string;
    created_at: string;
  }>;
  const revenue = calculateRevenueMetrics(invoices);

  // Revenue trend by date
  const revenueByDate = new Map<
    string,
    { paid: number; pending: number }
  >();

  for (const inv of invoices) {
    const date = (inv.created_at as string).slice(0, 10);
    const entry = revenueByDate.get(date) || { paid: 0, pending: 0 };
    if (inv.status === "paid") {
      entry.paid += inv.amount_cents;
    } else {
      entry.pending += inv.amount_cents;
    }
    revenueByDate.set(date, entry);
  }

  const revenueTrend = Array.from(revenueByDate.entries())
    .map(([date, amounts]) => ({ date, ...amounts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Process conversation stats ---
  const conversations = conversationsResult.data || [];
  const moduleStats = new Map<
    string,
    { total: number; escalated: number; resolved: number }
  >();

  for (const conv of conversations) {
    const module = (conv.current_module as string) || "support";
    const entry = moduleStats.get(module) || {
      total: 0,
      escalated: 0,
      resolved: 0,
    };
    entry.total++;
    if (conv.status === "escalated") entry.escalated++;
    if (conv.status === "resolved") entry.resolved++;
    moduleStats.set(module, entry);
  }

  return NextResponse.json({
    data: {
      period,
      appointmentTrend,
      appointmentSummary: {
        total: appointments.length,
        confirmed: appointments.filter((a) => a.status === "confirmed").length,
        completed: appointments.filter((a) => a.status === "completed").length,
        noShow: appointments.filter((a) => a.status === "no_show").length,
        cancelled: appointments.filter((a) => a.status === "cancelled").length,
      },
      nps,
      npsTrend,
      revenue,
      revenueTrend,
      moduleStats: Object.fromEntries(moduleStats),
    },
  });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 3: Commit**

```bash
git add src/app/api/reports/overview/route.ts
git commit -m "feat(reports): add overview API with appointment, NPS, revenue trends"
```

---

## Task 7: Reports page with charts

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/components/reports/appointment-chart.tsx`
- Create: `src/components/reports/nps-chart.tsx`
- Create: `src/components/reports/revenue-chart.tsx`
- Create: `src/components/reports/period-selector.tsx`
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add i18n keys**

Add/replace these keys under `"reports"` in each locale:

**pt-BR:**
```json
{
  "reports": {
    "title": "Relatórios",
    "exportCsv": "Exportar CSV",
    "period": {
      "7d": "7 dias",
      "30d": "30 dias",
      "90d": "90 dias"
    },
    "chart": {
      "appointments": "Consultas",
      "nps": "NPS",
      "revenue": "Receita"
    },
    "appointments": {
      "title": "Consultas por dia",
      "total": "Total",
      "completed": "Realizadas",
      "noShow": "Faltas",
      "cancelled": "Canceladas"
    },
    "nps": {
      "title": "NPS ao longo do tempo",
      "average": "Média",
      "responses": "Respostas",
      "promoters": "Promotores",
      "passives": "Neutros",
      "detractors": "Detratores",
      "score": "Score NPS"
    },
    "revenue": {
      "title": "Receita",
      "paid": "Recebido",
      "pending": "Pendente",
      "overdue": "Vencido",
      "conversionRate": "Taxa de conversão",
      "total": "Total"
    },
    "modules": {
      "title": "Conversas por módulo",
      "total": "Total",
      "escalated": "Escaladas",
      "resolved": "Resolvidas"
    },
    "noData": "Nenhum dado para o período selecionado",
    "loading": "Carregando relatórios..."
  }
}
```

**en:**
```json
{
  "reports": {
    "title": "Reports",
    "exportCsv": "Export CSV",
    "period": {
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days"
    },
    "chart": {
      "appointments": "Appointments",
      "nps": "NPS",
      "revenue": "Revenue"
    },
    "appointments": {
      "title": "Appointments by day",
      "total": "Total",
      "completed": "Completed",
      "noShow": "No-shows",
      "cancelled": "Cancelled"
    },
    "nps": {
      "title": "NPS over time",
      "average": "Average",
      "responses": "Responses",
      "promoters": "Promoters",
      "passives": "Passives",
      "detractors": "Detractors",
      "score": "NPS Score"
    },
    "revenue": {
      "title": "Revenue",
      "paid": "Collected",
      "pending": "Pending",
      "overdue": "Overdue",
      "conversionRate": "Conversion rate",
      "total": "Total"
    },
    "modules": {
      "title": "Conversations by module",
      "total": "Total",
      "escalated": "Escalated",
      "resolved": "Resolved"
    },
    "noData": "No data for the selected period",
    "loading": "Loading reports..."
  }
}
```

**es:**
```json
{
  "reports": {
    "title": "Informes",
    "exportCsv": "Exportar CSV",
    "period": {
      "7d": "7 días",
      "30d": "30 días",
      "90d": "90 días"
    },
    "chart": {
      "appointments": "Consultas",
      "nps": "NPS",
      "revenue": "Ingresos"
    },
    "appointments": {
      "title": "Consultas por día",
      "total": "Total",
      "completed": "Completadas",
      "noShow": "Ausencias",
      "cancelled": "Canceladas"
    },
    "nps": {
      "title": "NPS a lo largo del tiempo",
      "average": "Promedio",
      "responses": "Respuestas",
      "promoters": "Promotores",
      "passives": "Pasivos",
      "detractors": "Detractores",
      "score": "Score NPS"
    },
    "revenue": {
      "title": "Ingresos",
      "paid": "Cobrado",
      "pending": "Pendiente",
      "overdue": "Vencido",
      "conversionRate": "Tasa de conversión",
      "total": "Total"
    },
    "modules": {
      "title": "Conversaciones por módulo",
      "total": "Total",
      "escalated": "Escaladas",
      "resolved": "Resueltas"
    },
    "noData": "Sin datos para el período seleccionado",
    "loading": "Cargando informes..."
  }
}
```

**Step 2: Create period selector component**

```typescript
// src/components/reports/period-selector.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

interface PeriodSelectorProps {
  value: string;
  onChange: (period: string) => void;
}

const PERIODS = ["7d", "30d", "90d"] as const;

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const t = useTranslations("reports.period");

  return (
    <div className="flex items-center gap-2">
      {PERIODS.map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)}>
          <Badge variant={value === p ? "accent" : "neutral"}>
            {t(p)}
          </Badge>
        </button>
      ))}
    </div>
  );
}
```

**Step 3: Create appointment chart component**

```typescript
// src/components/reports/appointment-chart.tsx
"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface AppointmentDay {
  date: string;
  total: number;
  completed: number;
  noShow: number;
  cancelled: number;
}

interface AppointmentChartProps {
  data: AppointmentDay[];
}

export function AppointmentChart({ data }: AppointmentChartProps) {
  const t = useTranslations("reports.appointments");

  return (
    <Card variant="glass">
      <p className="mb-4 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {t("title")}
      </p>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          —
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(5)} // MM-DD
            />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
            <Legend />
            <Bar
              dataKey="completed"
              name={t("completed")}
              fill="var(--success)"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="noShow"
              name={t("noShow")}
              fill="var(--warning)"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="cancelled"
              name={t("cancelled")}
              fill="var(--text-muted)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

**Step 4: Create NPS chart component**

```typescript
// src/components/reports/nps-chart.tsx
"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface NPSTrend {
  date: string;
  average: number;
  count: number;
}

interface NPSBreakdown {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

interface NpsChartProps {
  trend: NPSTrend[];
  breakdown: NPSBreakdown;
}

export function NpsChart({ trend, breakdown }: NpsChartProps) {
  const t = useTranslations("reports.nps");

  return (
    <Card variant="glass">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("title")}
        </p>
        {breakdown.score !== null && (
          <p className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
            {breakdown.score}
          </p>
        )}
      </div>

      {/* Breakdown badges */}
      {breakdown.total > 0 && (
        <div className="mb-4 flex gap-4 text-xs">
          <span style={{ color: "var(--success)" }}>
            {t("promoters")}: {breakdown.promoters}
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            {t("passives")}: {breakdown.passives}
          </span>
          <span style={{ color: "var(--danger)" }}>
            {t("detractors")}: {breakdown.detractors}
          </span>
        </div>
      )}

      {trend.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          —
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
            <Line
              type="monotone"
              dataKey="average"
              name={t("average")}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ fill: "var(--accent)", r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

**Step 5: Create revenue chart component**

```typescript
// src/components/reports/revenue-chart.tsx
"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/analytics/kpis";

interface RevenueTrend {
  date: string;
  paid: number;
  pending: number;
}

interface RevenueMetrics {
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  overdueCount: number;
  conversionRate: number;
}

interface RevenueChartProps {
  trend: RevenueTrend[];
  metrics: RevenueMetrics;
}

export function RevenueChart({ trend, metrics }: RevenueChartProps) {
  const t = useTranslations("reports.revenue");

  return (
    <Card variant="glass">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("title")}
        </p>
        <div className="text-right">
          <p className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
            {formatCents(metrics.paidCents)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("conversionRate")}: {metrics.conversionRate}%
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="mb-4 flex gap-4 text-xs">
        <span style={{ color: "var(--success)" }}>
          {t("paid")}: {formatCents(metrics.paidCents)}
        </span>
        <span style={{ color: "var(--warning)" }}>
          {t("pending")}: {formatCents(metrics.pendingCents)}
        </span>
        <span style={{ color: "var(--danger)" }}>
          {t("overdue")}: {metrics.overdueCount}
        </span>
      </div>

      {trend.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          —
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickFormatter={(v: number) => `R$${(v / 100).toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
              formatter={(value: number, name: string) => [
                formatCents(value),
                name,
              ]}
            />
            <Area
              type="monotone"
              dataKey="paid"
              name={t("paid")}
              stroke="var(--success)"
              fill="rgba(34,197,94,0.15)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="pending"
              name={t("pending")}
              stroke="var(--warning)"
              fill="rgba(245,158,11,0.1)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

**Step 6: Rewrite reports page**

```typescript
// src/app/(dashboard)/reports/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { PeriodSelector } from "@/components/reports/period-selector";
import { AppointmentChart } from "@/components/reports/appointment-chart";
import { NpsChart } from "@/components/reports/nps-chart";
import { RevenueChart } from "@/components/reports/revenue-chart";
import { Badge } from "@/components/ui/badge";

interface ReportData {
  period: string;
  appointmentTrend: Array<{
    date: string;
    total: number;
    completed: number;
    noShow: number;
    cancelled: number;
  }>;
  appointmentSummary: {
    total: number;
    confirmed: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
  nps: {
    score: number | null;
    promoters: number;
    passives: number;
    detractors: number;
    total: number;
  };
  npsTrend: Array<{ date: string; average: number; count: number }>;
  revenue: {
    totalCents: number;
    paidCents: number;
    pendingCents: number;
    overdueCount: number;
    conversionRate: number;
  };
  revenueTrend: Array<{ date: string; paid: number; pending: number }>;
  moduleStats: Record<
    string,
    { total: number; escalated: number; resolved: number }
  >;
}

export default function ReportsPage() {
  const t = useTranslations("reports");
  const tModules = useTranslations("modules");

  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/overview?period=${p}`);
      if (res.ok) {
        const body = await res.json();
        setData(body.data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  function handleExportCsv() {
    if (!data) return;

    const rows = data.appointmentTrend.map((d) =>
      [d.date, d.total, d.completed, d.noShow, d.cancelled].join(","),
    );
    const csv = ["date,total,completed,no_show,cancelled", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={
          <Button
            variant="secondary"
            disabled={!data}
            onClick={handleExportCsv}
          >
            {t("exportCsv")}
          </Button>
        }
      />

      <div className="mt-6 space-y-6">
        <PeriodSelector value={period} onChange={setPeriod} />

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : !data ? (
          <p style={{ color: "var(--text-muted)" }}>{t("noData")}</p>
        ) : (
          <>
            {/* Appointment chart — full width */}
            <AppointmentChart data={data.appointmentTrend} />

            {/* NPS + Revenue — side by side on desktop */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <NpsChart trend={data.npsTrend} breakdown={data.nps} />
              <RevenueChart
                trend={data.revenueTrend}
                metrics={data.revenue}
              />
            </div>

            {/* Module stats */}
            {Object.keys(data.moduleStats).length > 0 && (
              <Card variant="glass">
                <p
                  className="mb-4 text-sm font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("modules.title")}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(data.moduleStats).map(([module, stats]) => (
                    <div
                      key={module}
                      className="rounded-lg p-3"
                      style={{ backgroundColor: "var(--surface)" }}
                    >
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {tModules(`${module}.name`)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="neutral">
                          {t("modules.total")}: {stats.total}
                        </Badge>
                        {stats.escalated > 0 && (
                          <Badge variant="warning">
                            {t("modules.escalated")}: {stats.escalated}
                          </Badge>
                        )}
                        {stats.resolved > 0 && (
                          <Badge variant="success">
                            {t("modules.resolved")}: {stats.resolved}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
```

**Step 7: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 8: Commit**

```bash
git add src/app/(dashboard)/reports/page.tsx src/components/reports/period-selector.tsx src/components/reports/appointment-chart.tsx src/components/reports/nps-chart.tsx src/components/reports/revenue-chart.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat(reports): interactive reports with appointment, NPS, and revenue charts"
```

---

## Task 8: Modules page upgrade — real metrics

**Files:**
- Modify: `src/app/(dashboard)/modules/page.tsx`
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

The modules page now shows real per-module stats (conversations count, enabled/disabled status from DB).

**Step 1: Add i18n keys**

Add under `"modules"` in each locale:

**pt-BR:**
```json
{
  "modules": {
    "conversations": "{count} conversas",
    "noConversations": "Nenhuma conversa",
    "enabled": "Ativo",
    "disabled": "Inativo"
  }
}
```

**en:**
```json
{
  "modules": {
    "conversations": "{count} conversations",
    "noConversations": "No conversations",
    "enabled": "Active",
    "disabled": "Inactive"
  }
}
```

**es:**
```json
{
  "modules": {
    "conversations": "{count} conversaciones",
    "noConversations": "Sin conversaciones",
    "enabled": "Activo",
    "disabled": "Inactivo"
  }
}
```

**Step 2: Rewrite modules page as Server Component**

```typescript
// src/app/(dashboard)/modules/page.tsx
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/supabase/server";
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Star,
  CreditCard,
  RotateCcw,
} from "lucide-react";

const MODULES = [
  { key: "support", icon: MessageSquare },
  { key: "scheduling", icon: Calendar },
  { key: "confirmation", icon: CheckCircle2 },
  { key: "nps", icon: Star },
  { key: "billing", icon: CreditCard },
  { key: "recall", icon: RotateCcw },
] as const;

export default async function ModulesPage() {
  const t = await getTranslations("modules");
  const clinicId = await getClinicId();

  let moduleConfigs: Record<string, boolean> = {};
  let conversationCounts: Record<string, number> = {};

  if (clinicId) {
    const admin = createAdminClient();

    // Fetch module configs and conversation counts in parallel
    const [configsResult, conversationsResult] = await Promise.all([
      admin
        .from("module_configs")
        .select("module_type, enabled")
        .eq("clinic_id", clinicId),

      admin
        .from("conversations")
        .select("current_module")
        .eq("clinic_id", clinicId),
    ]);

    // Build enabled map
    for (const config of configsResult.data || []) {
      moduleConfigs[config.module_type as string] = config.enabled as boolean;
    }

    // Count conversations per module
    for (const conv of conversationsResult.data || []) {
      const module = (conv.current_module as string) || "support";
      conversationCounts[module] = (conversationCounts[module] || 0) + 1;
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map(({ key, icon: Icon }) => {
          const enabled = moduleConfigs[key] !== false; // Default to enabled
          const count = conversationCounts[key] || 0;

          return (
            <Card key={key} interactive variant="glass">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-lg p-2"
                    style={{ backgroundColor: "var(--accent-muted)" }}
                  >
                    <Icon
                      className="size-5"
                      strokeWidth={1.75}
                      style={{ color: "var(--accent)" }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t(`${key}.name`)}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t(`${key}.description`)}
                    </p>
                  </div>
                </div>
                <Badge variant={enabled ? "success" : "neutral"}>
                  {enabled ? t("enabled") : t("disabled")}
                </Badge>
              </div>
              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <p
                  className="text-xs font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {count > 0
                    ? t("conversations", { count })
                    : t("noConversations")}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 4: Commit**

```bash
git add src/app/(dashboard)/modules/page.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat(modules): show real enabled status and conversation counts"
```

---

## Task 9: Run all tests + typecheck + build

**Step 1: Run tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Fix any issues**

If any step above fails, fix the issue before proceeding.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build/test issues from phase 10"
```

---

## Task 10: Update CLAUDE.md + MEMORY.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `C:\Users\KABUM\.claude\projects\c--Users-KABUM-Documents-BALAM-SANDBOX-supermvp-health-agents\memory\MEMORY.md`

**Step 1: Update CLAUDE.md**

Add the new API routes to the relevant section. After the existing cron routes table, add:

```markdown
### Dashboard & Reports API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/dashboard/kpis` | GET | Today's KPI metrics (appointments, NPS, revenue, etc.) |
| `/api/dashboard/alerts` | GET | Actionable alerts (detractors, overdue, escalated, failures) |
| `/api/reports/overview` | GET | Time-series data for reports (appointments, NPS, revenue trends) |
```

And add `recharts` to the tech stack table:

```markdown
| Charts | Recharts |
```

**Step 2: Update MEMORY.md**

Add under a new section:

```markdown
## Phase 10 — Dashboard + Reports
- Dashboard: Server Component with real KPIs (appointments, confirmations, no-shows, NPS, revenue, escalated)
- Dashboard alerts: Client Component with auto-refresh (60s) — detractors, overdue invoices, escalated convos, failures
- Reports: Client page with period selector (7d/30d/90d), Recharts charts (appointments bar, NPS line, revenue area)
- Reports API: single `/api/reports/overview` endpoint returns all trend data
- Modules page: Server Component showing real enabled/disabled status + conversation counts per module
- Chart library: Recharts (composable, React-native, Tailwind-friendly)
- CSV export: client-side blob generation from appointment trend data
- Analytics utilities: `src/lib/analytics/kpis.ts` — calculateNPS, calculateRevenueMetrics, formatCents, groupByDate
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with phase 10 routes and recharts"
```

---

## Summary

| Task | Description | Complexity |
|------|-------------|-----------|
| 1 | Install Recharts | Trivial |
| 2 | Analytics utility functions (TDD) | Low |
| 3 | Dashboard KPIs API route (TDD) | Medium |
| 4 | Dashboard alerts API route | Medium |
| 5 | Dashboard page with real data | Medium |
| 6 | Reports API route (overview) | Medium |
| 7 | Reports page with charts | Medium-High |
| 8 | Modules page upgrade | Low |
| 9 | Tests + typecheck + build | Low |
| 10 | Update docs | Trivial |

**Total new files:** 10
**Total modified files:** 7
**Test files:** 2
