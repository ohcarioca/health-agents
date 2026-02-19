"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertTriangle,
  CreditCard,
  MessageSquare,
  XCircle,
} from "lucide-react";

interface Alert {
  id: string;
  type: "detractor" | "overdue" | "escalated" | "failure";
  title: string;
  description: string;
  createdAt: string;
  entityId: string;
}

function getAlertRoute(type: Alert["type"], entityId: string): string {
  if (type === "escalated" || type === "failure") {
    return `/inbox?conversation=${entityId}`;
  }
  if (type === "overdue") return "/payments";
  return "/inbox";
}

const ALERT_CONFIG = {
  detractor: { icon: AlertTriangle, variant: "warning" as const },
  overdue: { icon: CreditCard, variant: "danger" as const },
  escalated: { icon: MessageSquare, variant: "accent" as const },
  failure: { icon: XCircle, variant: "danger" as const },
} as const;

export function AlertsList() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/dashboard/alerts");
        if (res.ok) {
          const body: { data?: Alert[] } = await res.json();
          setAlerts(body.data || []);
        }
      } catch {
        // Alerts are supplementary — silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-xl border p-5"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("alerts")}
        </p>
        <div className="mt-4 flex justify-center py-8">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
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
                role="button"
                tabIndex={0}
                onClick={() => router.push(getAlertRoute(alert.type, alert.entityId))}
                onKeyDown={(e) => e.key === "Enter" && router.push(getAlertRoute(alert.type, alert.entityId))}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--nav-hover-bg)]"
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
    </div>
  );
}
