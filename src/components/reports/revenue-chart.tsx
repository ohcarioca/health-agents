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
    <Card>
      <div className="mb-4 flex items-start justify-between">
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("title")}
        </p>
        <div className="text-right">
          <p
            className="text-2xl font-bold font-mono"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCents(metrics.paidCents)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("conversionRate")}: {metrics.conversionRate}%
          </p>
        </div>
      </div>
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
        <p
          className="py-8 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
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
              formatter={(value?: number, name?: string) => [
                formatCents(value ?? 0),
                name ?? "",
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
