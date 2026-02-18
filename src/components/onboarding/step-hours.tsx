"use client";

import { useTranslations } from "next-intl";
import { SchedulePicker } from "@/components/onboarding/schedule-picker";
import type { ScheduleGrid } from "@/lib/validations/settings";

interface StepHoursProps {
  operatingHours: ScheduleGrid;
  onOperatingHoursChange: (value: ScheduleGrid) => void;
}

export function StepHours({ operatingHours, onOperatingHoursChange }: StepHoursProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("stepHours.description")}
      </p>
      <SchedulePicker value={operatingHours} onChange={onOperatingHoursChange} />
    </div>
  );
}
