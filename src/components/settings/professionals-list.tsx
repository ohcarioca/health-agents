"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { ProfessionalForm } from "./professional-form";

interface ProfessionalRow {
  id: string;
  name: string;
  specialty: string | null;
  appointment_duration_minutes: number;
  schedule_grid?: Record<string, { start: string; end: string }[]>;
  active: boolean;
  created_at: string;
}

export function ProfessionalsList() {
  const t = useTranslations("settings.professionals");

  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProfessionalRow | undefined>();

  async function fetchList() {
    try {
      const res = await fetch("/api/settings/professionals");
      if (res.ok) {
        const json = await res.json();
        setProfessionals(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function toggleActive(prof: ProfessionalRow) {
    // Optimistic update
    setProfessionals((prev) =>
      prev.map((p) =>
        p.id === prof.id ? { ...p, active: !p.active } : p,
      ),
    );

    const res = await fetch(`/api/settings/professionals/${prof.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !prof.active }),
    });

    if (!res.ok) {
      // Revert on failure
      setProfessionals((prev) =>
        prev.map((p) =>
          p.id === prof.id ? { ...p, active: prof.active } : p,
        ),
      );
    }
  }

  async function handleDelete(prof: ProfessionalRow) {
    if (!window.confirm(t("deleteConfirm"))) return;

    const res = await fetch(`/api/settings/professionals/${prof.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setProfessionals((prev) => prev.filter((p) => p.id !== prof.id));
    }
  }

  function openAdd() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(prof: ProfessionalRow) {
    setEditing(prof);
    setDialogOpen(true);
  }

  function handleFormSuccess() {
    setDialogOpen(false);
    setEditing(undefined);
    setLoading(true);
    fetchList();
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

      {professionals.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {professionals.map((prof) => (
            <Card key={prof.id}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {prof.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {prof.specialty ?? "—"} · {prof.appointment_duration_minutes}min
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(prof)}>
                    <Badge variant={prof.active ? "success" : "neutral"}>
                      {prof.active ? t("active") : t("inactive")}
                    </Badge>
                  </button>
                  <button
                    onClick={() => openEdit(prof)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Pencil className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => handleDelete(prof)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.1)]"
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
        size="xl"
      >
        <ProfessionalForm
          professional={editing}
          onSuccess={handleFormSuccess}
          onCancel={() => setDialogOpen(false)}
        />
      </Dialog>
    </>
  );
}
