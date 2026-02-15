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
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("title")}
        </p>
        {breakdown.score !== null && (
          <p
            className="text-2xl font-bold font-mono"
            style={{ color: "var(--text-primary)" }}
          >
            {breakdown.score}
          </p>
        )}
      </div>
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
        <p
          className="py-8 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
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
