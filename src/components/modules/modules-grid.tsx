"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Star,
  CreditCard,
  RotateCcw,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ModuleSettingsDialog } from "./module-settings-dialog";

type ModuleKey =
  | "support"
  | "scheduling"
  | "confirmation"
  | "nps"
  | "billing"
  | "recall";

// Modules that have an enabled/disabled toggle on the card
const HAS_TOGGLE = new Set<ModuleKey>(["billing", "nps", "recall"]);

// Modules that have a gear icon to open the settings dialog
const HAS_GEAR = new Set<ModuleKey>(["billing", "recall", "support"]);

// Dialog is only shown for these module types (NPS has no extra settings)
type DialogModuleType = "billing" | "recall" | "support";

const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  support: MessageSquare,
  scheduling: Calendar,
  confirmation: CheckCircle2,
  nps: Star,
  billing: CreditCard,
  recall: RotateCcw,
};

export interface ModuleEntry {
  key: ModuleKey;
  enabled: boolean;
  settings: Record<string, unknown>;
}

interface ModulesGridProps {
  modules: ModuleEntry[];
  conversationCounts: Record<string, number>;
}

export function ModulesGrid({ modules, conversationCounts }: ModulesGridProps) {
  const t = useTranslations("modules");
  const [moduleData, setModuleData] = useState<ModuleEntry[]>(modules);
  const [toggling, setToggling] = useState<ModuleKey | null>(null);
  const [editingModule, setEditingModule] = useState<DialogModuleType | null>(null);

  const editingEntry = editingModule
    ? moduleData.find((m) => m.key === editingModule)
    : null;

  async function handleToggle(type: ModuleKey, enabled: boolean) {
    // Optimistic update
    setToggling(type);
    setModuleData((prev) =>
      prev.map((m) => (m.key === type ? { ...m, enabled } : m))
    );

    try {
      const res = await fetch(`/api/settings/modules/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        // Revert on failure
        setModuleData((prev) =>
          prev.map((m) => (m.key === type ? { ...m, enabled: !enabled } : m))
        );
      }
    } catch {
      setModuleData((prev) =>
        prev.map((m) => (m.key === type ? { ...m, enabled: !enabled } : m))
      );
    } finally {
      setToggling(null);
    }
  }

  async function handleSave(
    type: string,
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(`/api/settings/modules/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { ok: false };

      const json = (await res.json()) as {
        data?: { enabled?: boolean; settings?: Record<string, unknown> };
      };

      if (json.data) {
        setModuleData((prev) =>
          prev.map((m) =>
            m.key === type
              ? {
                  ...m,
                  enabled: json.data?.enabled ?? m.enabled,
                  settings: json.data?.settings ?? m.settings,
                }
              : m
          )
        );
      }

      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moduleData.map((mod) => {
          const Icon = MODULE_ICONS[mod.key];
          const hasToggle = HAS_TOGGLE.has(mod.key);
          const hasGear = HAS_GEAR.has(mod.key);
          const count = conversationCounts[mod.key] || 0;

          return (
            <div key={mod.key}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  {/* Icon + Name + Description */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="shrink-0 rounded-lg p-2"
                      style={{ backgroundColor: "var(--accent-muted)" }}
                    >
                      <Icon
                        className="size-5"
                        strokeWidth={1.75}
                        style={{ color: "var(--accent)" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {t(`${mod.key}.name`)}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {t(`${mod.key}.description`)}
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex shrink-0 items-center gap-2">
                    {hasToggle ? (
                      <Switch
                        checked={mod.enabled}
                        onChange={(v) => handleToggle(mod.key, v)}
                        disabled={toggling === mod.key}
                      />
                    ) : (
                      <Badge variant={mod.enabled ? "success" : "neutral"}>
                        {mod.enabled ? t("enabled") : t("disabled")}
                      </Badge>
                    )}

                    {hasGear && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingModule(mod.key as DialogModuleType)
                        }
                        className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                        aria-label={t("configure")}
                      >
                        <Settings2
                          className="size-4"
                          strokeWidth={1.75}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {/* Conversation count */}
                <div
                  className="mt-3 border-t pt-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <p
                    className="text-xs font-mono"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {count > 0
                      ? t("conversations", { count })
                      : t("noConversations")}
                  </p>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {editingModule && editingEntry && (
        <ModuleSettingsDialog
          moduleType={editingModule}
          settings={editingEntry.settings}
          onClose={() => setEditingModule(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
