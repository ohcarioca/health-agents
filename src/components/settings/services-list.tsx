"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createServiceSchema } from "@/lib/validations/settings";

interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
  created_at: string;
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return "\u2014";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function ServicesList() {
  const t = useTranslations("settings.services");

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingSvc, setDeletingSvc] = useState<ServiceRow | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [priceDisplay, setPriceDisplay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchList() {
    try {
      const res = await fetch("/api/settings/services");
      if (res.ok) {
        const json = await res.json();
        setServices(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  function openAdd() {
    setEditing(undefined);
    setName("");
    setDuration(30);
    setPriceDisplay("");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(svc: ServiceRow) {
    setEditing(svc);
    setName(svc.name);
    setDuration(svc.duration_minutes);
    setPriceDisplay(svc.price_cents !== null ? (svc.price_cents / 100).toFixed(2) : "");
    setError("");
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const priceCents = priceDisplay
      ? Math.round(parseFloat(priceDisplay) * 100)
      : undefined;

    const data = {
      name,
      duration_minutes: duration,
      price_cents: priceCents,
    };

    const parsed = createServiceSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError = Object.values(flat.fieldErrors).flat()[0];
      setError(firstError ?? t("saveError"));
      return;
    }

    setSaving(true);
    try {
      const url = editing
        ? `/api/settings/services/${editing.id}`
        : "/api/settings/services";

      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("saveError"));
        return;
      }

      setDialogOpen(false);
      setLoading(true);
      fetchList();
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(svc: ServiceRow) {
    setDeletingSvc(svc);
    setConfirmOpen(true);
  }

  async function executeDelete() {
    if (!deletingSvc) return;

    const res = await fetch(`/api/settings/services/${deletingSvc.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setServices((prev) => prev.filter((s) => s.id !== deletingSvc.id));
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
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus className="size-4" strokeWidth={1.75} />
          {t("add")}
        </Button>
      </div>

      {services.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => (
            <Card key={svc.id}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {svc.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {svc.duration_minutes}min · {formatPrice(svc.price_cents)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(svc)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Pencil className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => handleDelete(svc)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? t("edit") : t("add")}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="serviceName"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            id="serviceDuration"
            label={t("duration")}
            type="number"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={5}
            max={480}
          />
          <Input
            id="servicePrice"
            label={t("priceOptional")}
            type="number"
            step="0.01"
            min="0"
            value={priceDisplay}
            onChange={(e) => setPriceDisplay(e.target.value)}
            placeholder="0,00"
          />

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("name") === "Nome do servi\u00e7o" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "..." : editing ? t("edit") : t("add")}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir"
        description={t("deleteConfirm")}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={executeDelete}
      />
    </>
  );
}
