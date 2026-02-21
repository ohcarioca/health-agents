"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

interface ConversationItem {
  id: string;
  status: "active" | "escalated" | "resolved";
  current_module: string | null;
  created_at: string;
  updated_at: string;
  patient: { id: string; name: string; phone: string } | null;
  agent: { id: string; name: string; type: string } | null;
  last_message: { content: string; role: string; created_at: string } | null;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type StatusFilter = "all" | "active" | "escalated" | "resolved";

const STATUS_BADGE_VARIANT: Record<
  ConversationItem["status"],
  "success" | "warning" | "neutral"
> = {
  active: "success",
  escalated: "warning",
  resolved: "neutral",
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const t = useTranslations("inbox");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filters: StatusFilter[] = ["all", "active", "escalated", "resolved"];

  const filtered =
    filter === "all"
      ? conversations
      : conversations.filter((c) => c.status === filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
      {/* Filters — horizontally scrollable on mobile, no wrapping */}
      <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className="shrink-0">
            <Badge variant={filter === f ? "accent" : "neutral"}>
              {t(`filters.${f}`)}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto sm:space-y-2">
        {filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p
              className="text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              {t("empty")}
            </p>
          </div>
        ) : (
          filtered.map((conversation) => {
            const isSelected = conversation.id === selectedId;
            return (
              <button
                type="button"
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors active:scale-[0.98] hover:bg-[var(--nav-hover-bg)] sm:p-3 ${
                  isSelected ? "border-l-2 border-l-[var(--accent)]" : ""
                }`}
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: isSelected ? undefined : "var(--border)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {conversation.patient?.name ?? t("unknownPatient")}
                    </p>
                    {conversation.last_message && (
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {truncate(conversation.last_message.content, 60)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      variant={STATUS_BADGE_VARIANT[conversation.status]}
                    >
                      {t(`status.${conversation.status}`)}
                    </Badge>
                    {conversation.current_module && (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {conversation.current_module}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
