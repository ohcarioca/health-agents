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
          <Badge variant={value === p ? "accent" : "neutral"}>{t(p)}</Badge>
        </button>
      ))}
    </div>
  );
}
