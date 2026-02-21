"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface InsurancePlanRow {
  id: string;
  name: string;
  created_at: string;
}

const COMMON_PLANS = [
  "Unimed",
  "Bradesco Saúde",
  "SulAmérica",
  "Amil",
  "NotreDame Intermédica",
  "Hapvida",
  "Porto Seguro Saúde",
  "Cassi",
  "Prevent Senior",
  "São Cristóvão Saúde",
  "Golden Cross",
  "MedSênior",
  "Particular",
] as const;

export function InsurancePlansList() {
  const t = useTranslations("settings.insurancePlans");
  const tc = useTranslations("common");

  const [plans, setPlans] = useState<InsurancePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingPlan, setTogglingPlan] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState<InsurancePlanRow | null>(null);

  async function fetchList() {
    try {
      const res = await fetch("/api/settings/insurance-plans");
      if (res.ok) {
        const json = await res.json();
        setPlans(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  const selectedNames = new Set(plans.map((p) => p.name));

  const customPlans = plans.filter(
    (p) => !(COMMON_PLANS as readonly string[]).includes(p.name)
  );

  async function toggleCommonPlan(name: string) {
    setTogglingPlan(name);
    try {
      if (selectedNames.has(name)) {
        const plan = plans.find((p) => p.name === name);
        if (plan) {
          const res = await fetch(`/api/settings/insurance-plans/${plan.id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setPlans((prev) => prev.filter((p) => p.id !== plan.id));
          }
        }
      } else {
        const res = await fetch("/api/settings/insurance-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          const json = await res.json();
          setPlans((prev) => [...prev, json.data]);
        }
      }
    } finally {
      setTogglingPlan(null);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim().length < 2) return;

    setAdding(true);
    try {
      const res = await fetch("/api/settings/insurance-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (res.ok) {
        const json = await res.json();
        setPlans((prev) => [...prev, json.data]);
        setNewName("");
      }
    } finally {
      setAdding(false);
    }
  }

  function handleDelete(plan: InsurancePlanRow) {
    setDeletingPlan(plan);
    setConfirmOpen(true);
  }

  async function executeDelete() {
    if (!deletingPlan) return;

    const res = await fetch(`/api/settings/insurance-plans/${deletingPlan.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== deletingPlan.id));
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
      {/* Common plans (toggleable chips) */}
      <div>
        <p
          className="mb-3 text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("commonTitle")}
        </p>
        <div className="flex flex-wrap gap-2">
          {COMMON_PLANS.map((name) => {
            const isSelected = selectedNames.has(name);
            const isToggling = togglingPlan === name;

            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleCommonPlan(name)}
                disabled={isToggling}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-70"
                style={{
                  backgroundColor: isSelected ? "var(--accent-muted)" : "var(--surface)",
                  borderWidth: isSelected ? 2 : 1,
                  borderStyle: "solid",
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                  color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                  cursor: isToggling ? "wait" : "pointer",
                }}
              >
                {isToggling ? (
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                ) : isSelected ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : null}
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Separator */}
      <div className="h-px" style={{ backgroundColor: "var(--border)" }} />

      {/* Custom plans */}
      <div>
        <p
          className="mb-3 text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("customTitle")}
        </p>

        <form onSubmit={handleAdd} className="flex gap-2">
          <div className="flex-1">
            <Input
              id="newPlanName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("customPlaceholder")}
            />
          </div>
          <Button type="submit" size="sm" disabled={adding || !newName.trim()}>
            <Plus className="size-4" strokeWidth={1.75} />
            {t("add")}
          </Button>
        </form>

        {customPlans.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {customPlans.map((plan) => (
              <div
                key={plan.id}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: "var(--accent-muted)",
                  color: "var(--text-primary)",
                }}
              >
                {plan.name}
                <button
                  onClick={() => handleDelete(plan)}
                  className="rounded-full p-0.5 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="size-3" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={tc("delete")}
        description={t("deleteConfirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        variant="danger"
        onConfirm={executeDelete}
      />
    </div>
  );
}
