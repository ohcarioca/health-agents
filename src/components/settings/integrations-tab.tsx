"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Mail, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  google_calendar_id: string | null;
}

interface ClinicCalendar {
  google_calendar_id: string | null;
}

export function IntegrationsTab() {
  const t = useTranslations("settings.integrations");
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [clinicCalendar, setClinicCalendar] = useState<ClinicCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProfessionals = useCallback(async () => {
    try {
      const [profRes, clinicRes] = await Promise.all([
        fetch("/api/settings/professionals"),
        fetch("/api/settings/clinic"),
      ]);

      if (profRes.ok) {
        const json: { data?: unknown[] } = await profRes.json();
        if (json.data && Array.isArray(json.data)) {
          setProfessionals(
            json.data
              .filter((p): p is Record<string, unknown> =>
                typeof p === "object" && p !== null
              )
              .map((p) => ({
                id: String(p.id),
                name: String(p.name),
                specialty: typeof p.specialty === "string" ? p.specialty : null,
                google_calendar_id:
                  typeof p.google_calendar_id === "string"
                    ? p.google_calendar_id
                    : null,
              }))
          );
        }
      }

      if (clinicRes.ok) {
        const { data: clinic } = await clinicRes.json();
        setClinicCalendar({
          google_calendar_id:
            typeof clinic?.google_calendar_id === "string"
              ? clinic.google_calendar_id
              : null,
        });
      }
    } catch (err) {
      console.error("[integrations] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfessionals();
  }, [fetchProfessionals]);

  async function handleConnectClinic() {
    setActionLoading("__clinic__");
    try {
      const res = await fetch("/api/integrations/google-calendar/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "clinic" }),
      });
      if (!res.ok) return;
      const json: { data?: { url?: string } } = await res.json();
      if (json.data?.url) window.location.href = json.data.url;
    } catch (err) {
      console.error("[integrations] clinic connect error:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDisconnectClinic() {
    setActionLoading("__clinic__");
    try {
      const res = await fetch("/api/integrations/google-calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "clinic" }),
      });
      if (!res.ok) return;
      await fetchProfessionals();
    } catch (err) {
      console.error("[integrations] clinic disconnect error:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConnect(professionalId: string) {
    setActionLoading(professionalId);
    try {
      const res = await fetch("/api/integrations/google-calendar/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professional_id: professionalId }),
      });
      if (!res.ok) {
        console.error("[integrations] connect failed:", res.status);
        return;
      }
      const json: { data?: { url?: string } } = await res.json();
      if (json.data?.url) {
        window.location.href = json.data.url;
      }
    } catch (err) {
      console.error("[integrations] connect error:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDisconnect(professionalId: string) {
    setActionLoading(professionalId);
    try {
      const res = await fetch("/api/integrations/google-calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professional_id: professionalId }),
      });
      if (!res.ok) {
        console.error("[integrations] disconnect failed:", res.status);
        return;
      }
      await fetchProfessionals();
    } catch (err) {
      console.error("[integrations] disconnect error:", err);
    } finally {
      setActionLoading(null);
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
      {/* Google Calendar section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays
            className="size-5"
            strokeWidth={1.75}
            style={{ color: "var(--accent)" }}
          />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {t("calendarTitle")}
          </h3>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("connectDescription")}
        </p>

        <Card>
          <div className="space-y-3">
            {/* Clinic calendar row */}
            {clinicCalendar !== null && (
              <div
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ backgroundColor: "var(--nav-hover-bg)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t("clinicCalendarLabel")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("clinicCalendarDescription")}
                  </p>
                </div>
                <Badge variant={clinicCalendar.google_calendar_id ? "success" : "neutral"}>
                  {clinicCalendar.google_calendar_id ? t("connected") : t("notConnected")}
                </Badge>
                {clinicCalendar.google_calendar_id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading === "__clinic__"}
                    onClick={handleDisconnectClinic}
                  >
                    {actionLoading === "__clinic__" ? <Spinner size="sm" /> : t("disconnect")}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={actionLoading === "__clinic__"}
                    onClick={handleConnectClinic}
                  >
                    {actionLoading === "__clinic__" ? <Spinner size="sm" /> : t("connect")}
                  </Button>
                )}
              </div>
            )}

            {/* Separator between clinic and professional rows */}
            {clinicCalendar !== null && professionals.length > 0 && (
              <div className="h-px" style={{ backgroundColor: "var(--border)" }} />
            )}

            {professionals.length === 0 ? (
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {t("comingSoon")}
              </p>
            ) : (
              professionals.map((professional) => {
                const isConnected = Boolean(
                  professional.google_calendar_id
                );
                const isLoading = actionLoading === professional.id;

                return (
                  <div
                    key={professional.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: "var(--nav-hover-bg)",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {professional.name}
                      </p>
                      {professional.specialty && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {professional.specialty}
                        </p>
                      )}
                    </div>

                    <Badge
                      variant={isConnected ? "success" : "neutral"}
                    >
                      {isConnected
                        ? t("connected")
                        : t("notConnected")}
                    </Badge>

                    {isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                        onClick={() =>
                          handleDisconnect(professional.id)
                        }
                      >
                        {isLoading ? (
                          <Spinner size="sm" />
                        ) : (
                          t("disconnect")
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isLoading}
                        onClick={() =>
                          handleConnect(professional.id)
                        }
                      >
                        {isLoading ? (
                          <Spinner size="sm" />
                        ) : (
                          t("connect")
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Gmail and Pagar.me placeholder sections */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <Mail
              className="size-5"
              strokeWidth={1.75}
              style={{ color: "var(--text-muted)" }}
            />
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("gmail")}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {t("comingSoon")}
              </p>
            </div>
            <Badge variant="neutral">{t("notConnected")}</Badge>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <CreditCard
              className="size-5"
              strokeWidth={1.75}
              style={{ color: "var(--text-muted)" }}
            />
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("asaas")}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {t("asaasDescription")}
              </p>
            </div>
            <Badge variant="neutral">{t("configuredViaEnv")}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
