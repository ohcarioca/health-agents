"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FaqItem {
  question: string;
  answer: string;
}

// NPS is not included: it has no extra settings beyond the inline toggle
export type DialogModuleType = "billing" | "recall" | "support";

interface ModuleSettingsDialogProps {
  moduleType: DialogModuleType;
  settings: Record<string, unknown>;
  onClose: () => void;
  onSave: (
    type: string,
    payload: Record<string, unknown>
  ) => Promise<{ ok: boolean }>;
}

// ── Billing settings ──

interface BillingSettingsProps {
  autoBilling: boolean;
  onChangeAutoBilling: (v: boolean) => void;
}

function BillingSettings({ autoBilling, onChangeAutoBilling }: BillingSettingsProps) {
  const t = useTranslations("modules");
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {t("billing.autoBilling")}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {t("billing.autoBillingDescription")}
        </p>
      </div>
      <Switch checked={autoBilling} onChange={onChangeAutoBilling} />
    </div>
  );
}

// ── Recall settings ──

interface RecallSettingsProps {
  inactivityDays: number;
  onChangeInactivityDays: (v: number) => void;
}

function RecallSettings({ inactivityDays, onChangeInactivityDays }: RecallSettingsProps) {
  const t = useTranslations("modules");
  return (
    <div className="space-y-1.5">
      <label
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {t("recall.inactivityDays")}
      </label>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("recall.inactivityDaysDescription")}
      </p>
      <Input
        type="number"
        min={7}
        max={730}
        value={inactivityDays}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChangeInactivityDays(v);
        }}
        className="w-32"
      />
    </div>
  );
}

// ── Support / FAQ settings ──

interface SupportSettingsProps {
  faqItems: FaqItem[];
  onChange: (items: FaqItem[]) => void;
  pendingQuestion: string;
  onPendingQuestionChange: (v: string) => void;
  pendingAnswer: string;
  onPendingAnswerChange: (v: string) => void;
}

function SupportSettings({
  faqItems,
  onChange,
  pendingQuestion,
  onPendingQuestionChange,
  pendingAnswer,
  onPendingAnswerChange,
}: SupportSettingsProps) {
  const t = useTranslations("modules");

  function handleAdd() {
    const q = pendingQuestion.trim();
    const a = pendingAnswer.trim();
    if (!q || !a) return;
    onChange([...faqItems, { question: q, answer: a }]);
    onPendingQuestionChange("");
    onPendingAnswerChange("");
  }

  function handleDelete(index: number) {
    onChange(faqItems.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("support.faqDescription")}
      </p>

      {/* Existing items */}
      {faqItems.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("support.noFaqItems")}
        </p>
      ) : (
        <div className="space-y-2">
          {faqItems.map((item, i) => (
            <div
              key={i}
              className="rounded-lg p-3 text-sm"
              style={{
                backgroundColor: "var(--nav-hover-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {item.question}
                  </p>
                  <p
                    className="text-xs whitespace-pre-wrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.answer}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  className="shrink-0 rounded p-1 transition-colors hover:bg-red-100"
                  aria-label={t("support.deleteFaq")}
                >
                  <Trash2
                    className="size-4"
                    strokeWidth={1.75}
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new */}
      <div
        className="rounded-lg p-3 space-y-2"
        style={{
          backgroundColor: "var(--nav-hover-bg)",
          border: "1px dashed var(--border)",
        }}
      >
        <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {t("support.addFaq")}
        </p>
        <Input
          placeholder={t("support.question")}
          value={pendingQuestion}
          onChange={(e) => onPendingQuestionChange(e.target.value)}
        />
        <textarea
          placeholder={t("support.answer")}
          value={pendingAnswer}
          onChange={(e) => onPendingAnswerChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors resize-none"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!pendingQuestion.trim() || !pendingAnswer.trim()}
        >
          <Plus className="size-4 mr-1.5" strokeWidth={1.75} />
          {t("support.addFaq")}
        </Button>
      </div>
    </div>
  );
}

// ── Main Dialog ──

export function ModuleSettingsDialog({
  moduleType,
  settings: initialSettings,
  onClose,
  onSave,
}: ModuleSettingsDialogProps) {
  const t = useTranslations("modules");

  // Billing state
  const [autoBilling, setAutoBilling] = useState(
    initialSettings.auto_billing === true
  );

  // Recall state
  const [inactivityDays, setInactivityDays] = useState(
    typeof initialSettings.inactivity_days === "number"
      ? initialSettings.inactivity_days
      : 90
  );

  // Support state
  const [faqItems, setFaqItems] = useState<FaqItem[]>(() => {
    const raw = initialSettings.faq_items;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
      .map((item) => ({
        question: typeof item.question === "string" ? item.question : "",
        answer: typeof item.answer === "string" ? item.answer : "",
      }))
      .filter((item) => item.question && item.answer);
  });
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState("");

  const [saving, setSaving] = useState(false);

  function buildPayload(): Record<string, unknown> {
    switch (moduleType) {
      case "billing":
        return { auto_billing: autoBilling };
      case "recall":
        return { inactivity_days: inactivityDays };
      case "support": {
        // Auto-include pending input fields so user doesn't need to click "+"
        const items = [...faqItems];
        const q = pendingQuestion.trim();
        const a = pendingAnswer.trim();
        if (q && a) {
          items.push({ question: q, answer: a });
        }
        return { faq_items: items };
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    const result = await onSave(moduleType, buildPayload());
    setSaving(false);
    if (result.ok) onClose();
  }

  function getTitle(): string {
    switch (moduleType) {
      case "billing":
        return t("billing.settingsTitle");
      case "recall":
        return t("recall.settingsTitle");
      case "support":
        return t("support.settingsTitle");
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={getTitle()}
      size={moduleType === "support" ? "lg" : "md"}
    >
      <div className="space-y-6">
        {moduleType === "billing" && (
          <BillingSettings
            autoBilling={autoBilling}
            onChangeAutoBilling={setAutoBilling}
          />
        )}
        {moduleType === "recall" && (
          <RecallSettings
            inactivityDays={inactivityDays}
            onChangeInactivityDays={setInactivityDays}
          />
        )}
        {moduleType === "support" && (
          <SupportSettings
            faqItems={faqItems}
            onChange={setFaqItems}
            pendingQuestion={pendingQuestion}
            onPendingQuestionChange={setPendingQuestion}
            pendingAnswer={pendingAnswer}
            onPendingAnswerChange={setPendingAnswer}
          />
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {t("save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
