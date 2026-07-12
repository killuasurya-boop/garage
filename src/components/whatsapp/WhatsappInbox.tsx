"use client";

import { useEffect, useState } from "react";

import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { ReplyComposer } from "./ReplyComposer";
import { CropPanel, type WhatsappConversation, type WhatsappMessage } from "./shared";

export function WhatsappInbox() {
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [activeConv, setActiveConv] = useState<WhatsappConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/conversations");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Gagal memuat percakapan.");
      setConversations(data.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  async function selectConversation(id: string) {
    setSelectedId(id);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Gagal memuat pesan.");
      setActiveConv(data.data.conversation);
      setMessages(data.data.messages);
      await fetch(`/api/whatsapp/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read" }),
      });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, []);

  return (
    <CropPanel>
      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 md:grid-cols-[20rem_1fr]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          loading={loading}
          error={error}
          onSelect={selectConversation}
          onRefresh={loadList}
        />
        <section className="flex min-h-0 flex-col border-t border-[var(--garage-line)] md:border-l md:border-t-0">
          {activeConv ? (
            <>
              <MessageThread conversation={activeConv} messages={messages} />
              <ReplyComposer
                conversation={activeConv}
                onSent={() => selectConversation(activeConv.id)}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--garage-mute)]">
              Pilih percakapan di kiri untuk melihat pesan.
            </div>
          )}
        </section>
      </div>
    </CropPanel>
  );
}
