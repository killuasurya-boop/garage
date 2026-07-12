"use client";

import { type WhatsappConversation, type WhatsappMessage } from "./shared";

function tick(status: string) {
  if (status === "read") return { label: "✓✓", className: "text-[var(--garage-success)]" };
  if (status === "delivered") return { label: "✓✓", className: "text-[var(--garage-success)]" };
  if (status === "sent") return { label: "✓", className: "text-[var(--garage-mute)]" };
  if (status === "failed") return { label: "!", className: "text-[var(--garage-red-bright)]" };
  return { label: "", className: "" };
}

export function MessageThread({
  conversation,
  messages,
}: {
  conversation: WhatsappConversation;
  messages: WhatsappMessage[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--garage-line)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--garage-fg)]">
            {conversation.customerName || conversation.phoneNumber}
          </p>
          <p className="truncate font-mono text-xs text-[var(--garage-mute)]">
            {conversation.phoneNumber}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-[10px] font-semibold uppercase ${
            conversation.status === "open"
              ? "bg-[var(--garage-amber)]/15 text-[var(--garage-amber)]"
              : "bg-[var(--garage-bg-3)] text-[var(--garage-mute)]"
          }`}
        >
          {conversation.status}
        </span>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const inbound = m.direction === "inbound";
          const t = tick(m.status);
          return (
            <div
              key={m.id}
              className={`flex ${inbound ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[80%] rounded-[var(--radius)] px-3 py-2 text-sm ${
                  inbound
                    ? "bg-[var(--garage-bg-3)] text-[var(--garage-fg)]"
                    : "bg-[var(--garage-red)] text-white"
                }`}
              >
                {m.messageType === "template" ? (
                  <span className="block font-mono text-[10px] opacity-80">
                    Template: {m.templateName}
                  </span>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{m.body || "—"}</p>
                <span className="mt-1 flex items-center justify-end gap-1 font-mono text-[10px] opacity-80">
                  {new Date(m.createdAt).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {!inbound && t.label ? <span className={t.className}>{t.label}</span> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
