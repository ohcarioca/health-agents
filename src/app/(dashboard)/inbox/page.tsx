"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationDetail } from "@/components/inbox/conversation-detail";

interface ConversationListItem {
  id: string;
  status: "active" | "escalated" | "resolved";
  current_module: string | null;
  created_at: string;
  updated_at: string;
  patient: { id: string; name: string; phone: string } | null;
  agent: { id: string; name: string; type: string } | null;
  last_message: { content: string; role: string; created_at: string } | null;
}

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

const POLL_INTERVAL_MS = 10_000;

export default function InboxPage() {
  const t = useTranslations("inbox");
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationData | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations");
      if (!res.ok) throw new Error("fetch list failed");
      const json: { data: ConversationListItem[] } = await res.json();
      setConversations(json.data);
    } catch {
      console.error("[inbox] failed to load conversations");
    } finally {
      setListLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/inbox/conversations/${id}`);
      if (!res.ok) throw new Error("fetch detail failed");
      const json: { data: ConversationData } = await res.json();
      setDetail(json.data);
    } catch {
      console.error("[inbox] failed to load conversation detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Auto-select conversation from ?conversation= query param
  useEffect(() => {
    if (listLoading) return;
    const id = searchParams.get("conversation");
    if (id && id !== selectedId) {
      handleSelect(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listLoading]);

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedId) {
        fetchDetail(selectedId);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchConversations, fetchDetail, selectedId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    fetchDetail(id);
  }

  const handleRefresh = useCallback(() => {
    fetchConversations();
    if (selectedId) {
      fetchDetail(selectedId);
    }
  }, [fetchConversations, fetchDetail, selectedId]);

  // On mobile: selecting a conversation shows detail view; back returns to list
  const mobileShowDetail = selectedId !== null;

  function handleBack() {
    setSelectedId(null);
    setDetail(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      {/* Header — hidden on mobile when viewing a conversation */}
      <div className={mobileShowDetail ? "hidden lg:block" : ""}>
        <PageHeader title={t("title")} />
      </div>

      <div className="mt-2 grid h-[calc(100dvh-8rem)] grid-cols-1 gap-0 overflow-hidden sm:mt-6 sm:gap-6 lg:h-[calc(100vh-11rem)] lg:grid-cols-3">
        {/* Left panel: conversation list — hidden on mobile when detail is open */}
        <div className={`flex min-h-0 flex-col overflow-hidden ${mobileShowDetail ? "hidden lg:flex" : "flex"}`}>
          {listLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* Right panel: conversation detail — hidden on mobile when no selection */}
        <div className={`flex min-h-0 flex-col lg:col-span-2 ${mobileShowDetail ? "flex" : "hidden lg:flex"}`}>
          {detailLoading && !detail ? (
            <Card className="h-full">
              <div className="flex h-full items-center justify-center">
                <Spinner size="lg" />
              </div>
            </Card>
          ) : detail ? (
            <ConversationDetail
              conversation={detail}
              onRefresh={handleRefresh}
              onBack={handleBack}
            />
          ) : (
            <Card className="h-full">
              <div className="flex h-full items-center justify-center">
                <p
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("selectConversation")}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
