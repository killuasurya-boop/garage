"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, CheckCheck, Bell, ArrowLeft, Headset } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ThreadSummary = {
  id: string;
  tableLabel: string;
  orderId: string | null;
  status: string;
  unread: boolean;
  lastMessageAt: string;
  preview: string;
  lastSender: string | null;
};

type ChatMsg = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
  staffUserId?: string | null;
};

type ThreadDetail = {
  id: string;
  tableLabel: string;
  orderId: string | null;
  status: string;
  messages: ChatMsg[];
};

const CANNED = [
  "Baik, pesanan sedang kami proses 🙏",
  "Segera kami siapkan ya.",
  "Mohon maaf, menu itu sedang habis.",
  "Pelayan akan menuju meja Anda.",
  "Terima kasih sudah menunggu 🙏",
];

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Request gagal.");
  return json.data as T;
}

async function apiPost<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Request gagal.");
  return json.data as T;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    /* audio tidak tersedia */
  }
}

function ChatLine({ msg }: { msg: ChatMsg }) {
  if (msg.sender === "system") {
    return (
      <p className="mx-auto w-fit rounded-full border border-[#f5a742]/30 bg-[#f5a742]/10 px-3 py-1 text-center text-[11px] font-semibold text-[#ffd79a]">
        {msg.body}
      </p>
    );
  }
  const staff = msg.sender === "staff";
  return (
    <div className={`flex ${staff ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          staff
            ? "rounded-br-sm bg-[#d11a2a] text-white"
            : "rounded-bl-sm border border-[#34343c] bg-white/[0.06] text-[#e7e7ea]"
        }`}
      >
        {!staff ? (
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-[#f5a742]">Customer</span>
        ) : null}
        <span className="whitespace-pre-wrap break-words">{msg.body}</span>
      </div>
    </div>
  );
}

export function PosChatInbox() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [active, setActive] = useState<ThreadDetail | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevUnreadIds = useRef<Set<string>>(new Set());

  const unreadCount = threads.filter((t) => t.unread).length;

  // Polling daftar thread (selalu jalan agar badge update walau sheet tertutup).
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const data = await apiGet<{ threads: ThreadSummary[] }>("/api/pos/chat");
        if (!alive) return;
        // Bunyikan beep kalau ada thread unread baru.
        const currentUnread = new Set(data.threads.filter((t) => t.unread).map((t) => t.id));
        let hasNew = false;
        currentUnread.forEach((id) => {
          if (!prevUnreadIds.current.has(id)) hasNew = true;
        });
        if (hasNew) beep();
        prevUnreadIds.current = currentUnread;
        setThreads(data.threads);
      } catch {
        /* sesi/offline sesaat */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    try {
      const data = await apiGet<ThreadDetail>(`/api/pos/chat/${threadId}`);
      setActive(data);
    } catch {
      /* abaikan */
    }
  }, []);

  // Polling percakapan aktif.
  useEffect(() => {
    if (!open || !active) return;
    const threadId = active.id;
    const id = window.setInterval(() => void loadThread(threadId), 3000);
    return () => window.clearInterval(id);
  }, [open, active, loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length]);

  async function reply(text: string) {
    const body = text.trim();
    if (!body || !active || busy) return;
    setBusy(true);
    try {
      await apiPost(`/api/pos/chat/${active.id}`, { body });
      setInput("");
      await loadThread(active.id);
    } catch {
      /* abaikan */
    } finally {
      setBusy(false);
    }
  }

  async function doAction(action: "resolve" | "forward") {
    if (!active || busy) return;
    setBusy(true);
    try {
      await apiPost(`/api/pos/chat/${active.id}`, { action });
      if (action === "resolve") {
        setActive(null);
      } else {
        await loadThread(active.id);
      }
    } catch {
      /* abaikan */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chat tamu / customer"
        title="Chat tamu (customer)"
        // Top-right + z-50 supaya tidak bentrok pos-bill-panel (z-40 bottom)
        // dan mini bottom-bar (z-30). Ikon Headset = chat TAMU, beda dari
        // ChatFab tim staf (MessageCircle, bottom-right) agar tidak rancu.
        className="garage-press fixed right-4 top-20 z-50 flex size-12 items-center justify-center rounded-full border border-[#f5a742]/70 bg-[#f5a742] text-black shadow-[0_10px_30px_rgba(0,0,0,0.45)] sm:size-14 md:top-4"
      >
        <Headset className="size-6" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full border-2 border-[#121218] bg-[#d11a2a] px-1.5 text-xs font-black text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 border-[#34343c] bg-[#121218] p-0 sm:max-w-md">
          <SheetHeader className="border-b border-[#34343c] p-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-white">
              {active ? (
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="garage-press rounded-md p-1 hover:bg-white/10"
                  aria-label="Kembali ke daftar"
                >
                  <ArrowLeft className="size-4" />
                </button>
              ) : (
                <MessageCircle className="size-4 text-[#f5a742]" />
              )}
              {active ? `Chat - ${active.tableLabel}` : "Chat Meja"}
            </SheetTitle>
            <SheetDescription className="text-[#b8b8bf]">
              {active
                ? "Balas customer. Auto-refresh tiap 3 detik."
                : `${threads.length} percakapan aktif - ${unreadCount} belum dibaca.`}
            </SheetDescription>
          </SheetHeader>

          {!active ? (
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {threads.length === 0 ? (
                <p className="mt-8 text-center text-sm text-[#9696a1]">Belum ada chat dari customer.</p>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void loadThread(t.id)}
                    className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition ${
                      t.unread
                        ? "border-[#d11a2a]/60 bg-[#d11a2a]/12"
                        : "border-[#34343c] bg-white/[0.04] hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#4a4a54] bg-[#202027] text-[#f5a742]">
                      <Bell className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-white">{t.tableLabel}</span>
                        {t.unread ? (
                          <span className="shrink-0 rounded-full bg-[#f5a742] px-2 py-0.5 text-[10px] font-black text-black">
                            BARU
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#b8b8bf]">
                        {t.lastSender === "staff" ? "Anda: " : ""}
                        {t.preview || "(belum ada pesan)"}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                {active.messages.map((m) => (
                  <ChatLine key={m.id} msg={m} />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-[#34343c] px-3 pt-2">
                {CANNED.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={busy}
                    onClick={() => void reply(c)}
                    className="garage-press rounded-full border border-[#4a4a54] bg-white/[0.05] px-2.5 py-1 text-[11px] text-[#d4d4d8] hover:bg-white/[0.1] disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doAction("forward")}
                  className="garage-press rounded-md border border-[#4a4a54] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-[#e7e7ea] hover:bg-white/[0.1] disabled:opacity-50"
                >
                  Teruskan ke waiter
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doAction("resolve")}
                  className="garage-press flex items-center gap-1 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-1.5 text-xs font-semibold text-[#bbf7d0] hover:bg-[#22c55e]/20 disabled:opacity-50"
                >
                  <CheckCheck className="size-3.5" /> Selesai
                </button>
              </div>
              <div className="flex items-end gap-2 border-t border-[#34343c] p-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void reply(input);
                    }
                  }}
                  rows={1}
                  placeholder="Balas customer..."
                  className="max-h-24 min-h-11 flex-1 resize-none rounded-md border border-[#4a4a54] bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-[#7a7a85] focus:border-[#d11a2a]/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void reply(input)}
                  disabled={busy || !input.trim()}
                  className="garage-press flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-[#d11a2a] px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
