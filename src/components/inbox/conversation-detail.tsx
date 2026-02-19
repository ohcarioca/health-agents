"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MessageBubble } from "@/components/inbox/message-bubble";

interface MessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  external_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface ConversationData {
  id: string;
  status: "active" | "escalated" | "resolved";
  current_module: string | null;
  channel: string;
  created_at: string;
  patient: { id: string; name: string; phone: string } | null;
  agent: { id: string; name: string; type: string } | null;
  messages: MessageItem[];
}

interface ConversationDetailProps {
  conversation: ConversationData;
  onRefresh: () => void;
}

const STATUS_BADGE_VARIANT: Record<
  ConversationData["status"],
  "success" | "warning" | "neutral"
> = {
  active: "success",
  escalated: "warning",
  resolved: "neutral",
};

export function ConversationDetail({
  conversation,
  onRefresh,
}: ConversationDetailProps) {
  const t = useTranslations("inbox");
  const [actionLoading, setActionLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages]);

  async function handleTakeOver() {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversation.id}/take-over`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("take-over failed");
      onRefresh();
    } catch {
      console.error("[inbox] take-over failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleHandBack() {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversation.id}/hand-back`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("hand-back failed");
      onRefresh();
    } catch {
      console.error("[inbox] hand-back failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text) return;

    setSendLoading(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        }
      );
      if (!res.ok) throw new Error("send failed");
      setMessageText("");
      onRefresh();
    } catch {
      console.error("[inbox] send message failed");
    } finally {
      setSendLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!messageText.trim() || sendLoading) return;
      handleSend(e as unknown as FormEvent);
    }
  }

  return (
    <div
      className="flex h-full flex-col rounded-xl border"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="truncate text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {conversation.patient?.name ?? t("unknownPatient")}
            </h2>
            <Badge variant={STATUS_BADGE_VARIANT[conversation.status]}>
              {t(`status.${conversation.status}`)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {conversation.patient?.phone && (
              <span>{t("phone")}: {conversation.patient.phone}</span>
            )}
            {conversation.current_module && (
              <span>{t("module")}: {conversation.current_module}</span>
            )}
            <span>{t("channel")}: {conversation.channel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actionLoading && <Spinner size="sm" />}
          {conversation.status === "active" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTakeOver}
              disabled={actionLoading}
            >
              {t("actions.takeOver")}
            </Button>
          )}
          {conversation.status === "escalated" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleHandBack}
              disabled={actionLoading}
            >
              {t("actions.handBack")}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {conversation.messages.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("noMessages")}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversation.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                createdAt={msg.created_at}
                isHuman={msg.metadata?.sent_by_human === true}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input form — only shown when escalated */}
      {conversation.status === "escalated" && (
        <form
          onSubmit={handleSend}
          className="flex items-end gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <textarea
            rows={3}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("messagePlaceholder")}
            disabled={sendLoading}
            className="flex-1 resize-none overflow-y-auto rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={sendLoading || !messageText.trim()}
          >
            {sendLoading ? <Spinner size="sm" /> : t("actions.send")}
          </Button>
        </form>
      )}
    </div>
  );
}
