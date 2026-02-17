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
    <Card>
      <p
        className="mb-4 text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("title")}
      </p>
      {data.length === 0 ? (
        <p
          className="py-8 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          —
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(5)}
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
