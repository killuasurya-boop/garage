"use client";

import { formatRelative, type WhatsappConversation } from "./shared";

export function ConversationList({
  conversations,
  selectedId,
  loading,
  error,
  onSelect,
  onRefresh,
}: {
  conversations: WhatsappConversation[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-[var(--garage-line)] md:border-r">
      <header className="flex items-center justify-between border-b border-[var(--garage-line)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--garage-dim)]">
          Percakapan
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--garage-mute)] transition-colors duration-200 hover:text-[var(--garage-fg)] cursor-pointer"
          aria-label="Muat ulang percakapan"
        >
          Segarkan
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-[var(--garage-mute)]">Memuat…</p>
        ) : error ? (
          <p className="p-4 text-sm text-[var(--garage-red-bright)]">{error}</p>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-sm text-[var(--garage-mute)]">Belum ada percakapan masuk.</p>
        ) : (
          <ul className="divide-y divide-[var(--garage-line)]">
            {conversations.map((c) => {
              const active = c.id === selectedId;
              const open = c.status === "open";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active}
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-200 cursor-pointer ${
                      active ? "bg-[var(--garage-bg-3)]" : "hover:bg-[var(--garage-bg-2)]"
                    }`}
                  >
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        open ? "bg-[var(--garage-amber)]" : "bg-[var(--garage-mute)]"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--garage-fg)]">
                          {c.customerName || c.phoneNumber}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--garage-mute)]">
                          {formatRelative(c.lastInboundAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--garage-mute)]">
                        {c.lastMessagePreview || "—"}
                      </span>
                    </span>
                    {c.unreadCount > 0 ? (
                      <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--garage-red)] px-1.5 text-[10px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
