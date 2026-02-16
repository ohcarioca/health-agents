"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
}

interface ProfServiceRow {
  service_id: string;
  price_cents: number;
}

interface ProfessionalServicesFormProps {
  professionalId: string;
}

export function ProfessionalServicesForm({
  professionalId,
}: ProfessionalServicesFormProps) {
  const t = useTranslations("settings.professionalForm");

  const [allServices, setAllServices] = useState<ServiceRow[]>([]);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [svcRes, profSvcRes] = await Promise.all([
          fetch("/api/settings/services"),
          fetch(`/api/settings/professionals/${professionalId}/services`),
        ]);

        if (svcRes.ok) {
          const svcJson = await svcRes.json();
          setAllServices(svcJson.data ?? []);
        }

        if (profSvcRes.ok) {
          const profSvcJson = await profSvcRes.json();
          const map = new Map<string, number>();
          for (const ps of (profSvcJson.data ?? []) as ProfServiceRow[]) {
            map.set(ps.service_id, ps.price_cents);
          }
          setSelected(map);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [professionalId]);

  function toggleService(serviceId: string, defaultPrice: number | null) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.set(serviceId, defaultPrice ?? 0);
      }
      return next;
    });
  }

  function updatePrice(serviceId: string, priceDisplay: string) {
    const cents = Math.round(parseFloat(priceDisplay || "0") * 100);
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(serviceId, cents);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    const services = Array.from(selected.entries()).map(
      ([service_id, price_cents]) => ({ service_id, price_cents }),
    );

    try {
      const res = await fetch(
        `/api/settings/professionals/${professionalId}/services`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services }),
        },
      );

      if (res.ok) {
        setFeedback({ type: "success", message: "Salvo" });
      } else {
        const json = await res.json();
        setFeedback({ type: "error", message: json.error ?? "Erro" });
      }
    } catch {
      setFeedback({ type: "error", message: "Erro" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  if (allServices.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        {t("noServices")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {allServices.map((svc) => {
        const isChecked = selected.has(svc.id);
        const priceCents = selected.get(svc.id) ?? 0;

        return (
          <div
            key={svc.id}
            className="flex items-center gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggleService(svc.id, svc.price_cents)}
              className="size-4 rounded accent-[var(--accent)]"
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {svc.name}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {svc.duration_minutes}min
              </p>
            </div>
            {isChecked && (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(priceCents / 100).toFixed(2)}
                  onChange={(e) => updatePrice(svc.id, e.target.value)}
                  className="w-24 rounded-md border bg-transparent px-2 py-1 text-sm text-right"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

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
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
