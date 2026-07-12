"use client";

import { useState } from "react";

import { type WhatsappConversation } from "./shared";

export function ReplyComposer({
  conversation,
  onSent,
}: {
  conversation: WhatsappConversation;
  onSent: () => void;
}) {
  const within24h = (() => {
    if (!conversation.lastInboundAt) return false;
    // eslint-disable-next-line react-hooks/purity
    const diff = Date.now() - new Date(conversation.lastInboundAt).getTime();
    return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
  })();

  const [mode, setMode] = useState<"text" | "template">(within24h ? "text" : "template");
  const [text, setText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [params, setParams] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forceTemplate = !within24h;

  async function send() {
    setSending(true);
    setError(null);
    const isTemplate = forceTemplate || mode === "template";
    const body = isTemplate
      ? {
          type: "template",
          templateName: templateName.trim(),
          templateParameters: params
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        }
      : { type: "text", text: text.trim() };
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === "WHATSAPP_24H_WINDOW_EXPIRED") {
          setMode("template");
          setError("Jendela 24 jam sudah habis. Gunakan template untuk membalas.");
          return;
        }
        throw new Error(data?.error?.message || "Gagal mengirim pesan.");
      }
      setText("");
      setTemplateName("");
      setParams("");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-[var(--garage-line)] p-3">
      {forceTemplate ? (
        <p className="mb-2 rounded-[var(--radius-sm)] bg-[var(--garage-amber)]/10 px-2 py-1 text-xs text-[var(--garage-amber)]">
          Jendela 24 jam sudah habis. Balas wajib memakai template yang disetujui Meta.
        </p>
      ) : null}
      {!forceTemplate ? (
        <div className="mb-2 flex gap-1">
          {(["text", "template"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-[var(--radius-sm)] px-2 py-1 text-xs transition-colors duration-200 cursor-pointer ${
                mode === m
                  ? "bg-[var(--garage-bg-3)] text-[var(--garage-fg)]"
                  : "text-[var(--garage-mute)] hover:text-[var(--garage-fg)]"
              }`}
            >
              {m === "text" ? "Teks bebas" : "Template"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "template" || forceTemplate ? (
        <div className="mb-2 flex flex-col gap-2">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Nama template (mis. order_status)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--garage-line)] bg-[var(--garage-bg-0)] px-3 py-2 text-sm text-[var(--garage-fg)] outline-none focus-visible:border-[var(--garage-amber)]"
          />
          <input
            value={params}
            onChange={(e) => setParams(e.target.value)}
            placeholder="Parameter (pisahkan dengan koma)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--garage-line)] bg-[var(--garage-bg-0)] px-3 py-2 text-sm text-[var(--garage-fg)] outline-none focus-visible:border-[var(--garage-amber)]"
          />
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Tulis balasan…"
          className="mb-2 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--garage-line)] bg-[var(--garage-bg-0)] px-3 py-2 text-sm text-[var(--garage-fg)] outline-none focus-visible:border-[var(--garage-amber)]"
        />
      )}

      {error ? <p className="mb-2 text-xs text-[var(--garage-red-bright)]">{error}</p> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="min-h-11 rounded-[var(--radius-sm)] bg-[var(--garage-red)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {sending ? "Mengirim…" : "Kirim"}
        </button>
      </div>
    </div>
  );
}
