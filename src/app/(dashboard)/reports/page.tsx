"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/reports/period-selector";
import { AppointmentChart } from "@/components/reports/appointment-chart";
import { NpsChart } from "@/components/reports/nps-chart";
import { RevenueChart } from "@/components/reports/revenue-chart";

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
      // Handle silently
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
      [d.date, d.total, d.completed, d.noShow, d.cancelled].join(",")
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
            <AppointmentChart data={data.appointmentTrend} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <NpsChart trend={data.npsTrend} breakdown={data.nps} />
              <RevenueChart
                trend={data.revenueTrend}
                metrics={data.revenue}
              />
            </div>

            {Object.keys(data.moduleStats).length > 0 && (
              <Card>
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
