"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

interface StepCalendarProps {
  profName: string;
  specialty: string;
  hasProfessional: boolean;
  calendarConnected: boolean;
  calendarLoading: boolean;
  onConnect: () => void;
}

export function StepCalendar({
  profName,
  specialty,
  hasProfessional,
  calendarConnected,
  calendarLoading,
  onConnect,
}: StepCalendarProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step4.description")}
      </p>

      {hasProfessional && profName && (
        <div
          className="flex items-center justify-between rounded-lg border px-4 py-3"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5" style={{ color: "var(--accent)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {profName}
              </p>
              {specialty && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {specialty}
                </p>
              )}
            </div>
          </div>
          <Badge variant={calendarConnected ? "success" : "neutral"}>
            {calendarConnected ? t("step4.connected") : t("step4.notConnected")}
          </Badge>
        </div>
      )}

      {!calendarConnected && hasProfessional && (
        <Button variant="outline" onClick={onConnect} disabled={calendarLoading}>
          {calendarLoading ? t("step4.waitingCallback") : t("step4.connect")}
        </Button>
      )}

      {!hasProfessional && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("step2.description")}
        </p>
      )}
    </div>
  );
}
