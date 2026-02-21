"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SchedulePicker } from "@/components/onboarding/schedule-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ScheduleGrid } from "@/lib/validations/settings";

const EMPTY_GRID: ScheduleGrid = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

export function OperatingHoursTab() {
  const t = useTranslations("settings.operatingHours");
  const tc = useTranslations("common");

  const [hours, setHours] = useState<ScheduleGrid>(EMPTY_GRID);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/settings/clinic");
        if (res.ok) {
          const json = await res.json();
          if (json.data?.operating_hours) {
            setHours(json.data.operating_hours as ScheduleGrid);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, []);

  async function handleSave() {
    setFeedback(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operating_hours: hours }),
      });

      if (!res.ok) {
        const json = await res.json();
        setFeedback({ type: "error", message: json.error ?? t("saveError") });
        return;
      }

      setFeedback({ type: "success", message: t("saveSuccess") });
    } catch {
      setFeedback({ type: "error", message: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("description")}
      </p>

      <SchedulePicker value={hours} onChange={setHours} />

      {feedback && (
        <p
          className="text-sm"
          style={{
            color:
              feedback.type === "success" ? "var(--success)" : "var(--danger)",
          }}
        >
          {feedback.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
