"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
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

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="mt-6 grid h-[calc(100vh-11rem)] grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left panel: conversation list */}
        <div className="flex h-full flex-col overflow-hidden">
          {listLoading ? (
            <div className="flex min-h-[300px] items-center justify-center">
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

        {/* Right panel: conversation detail */}
        <div className="flex h-full flex-col lg:col-span-2">
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
    </PageContainer>
  );
}
