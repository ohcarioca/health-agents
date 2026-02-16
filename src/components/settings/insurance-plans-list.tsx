"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface InsurancePlanRow {
  id: string;
  name: string;
  created_at: string;
}

export function InsurancePlansList() {
  const t = useTranslations("settings.insurancePlans");

  const [plans, setPlans] = useState<InsurancePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

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

  async function handleDelete(plan: InsurancePlanRow) {
    if (!window.confirm(t("deleteConfirm"))) return;

    const res = await fetch(`/api/settings/insurance-plans/${plan.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
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
    <div className="space-y-4">
      {/* Inline add form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="flex-1">
          <Input
            id="newPlanName"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("placeholder")}
          />
        </div>
        <Button type="submit" size="sm" disabled={adding || !newName.trim()}>
          <Plus className="size-4" strokeWidth={1.75} />
          {t("add")}
        </Button>
      </form>

      {/* Plans list */}
      {plans.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => (
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
                className="rounded-full p-0.5 transition-colors hover:bg-[rgba(239,68,68,0.2)]"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
