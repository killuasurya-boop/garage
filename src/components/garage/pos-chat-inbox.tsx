"use client";

// =============================================================================
// INBOX CHAT TAMU (kasir) — percakapan pelanggan dari menu digital/pelacak.
// - Tiap percakapan menampilkan nomor pesanan + tipe (Meja / Take away /
//   Delivery) + status, dengan tombol "Buka pesanan".
// - Balasan cepat menyesuaikan tipe; "Teruskan ke pelayan" hanya untuk meja.
// - Tab "Aktif" & "Riwayat"; foto bukti bayar tampil; jam per pesan.
// - Bunyi chat baru ditangani Pusat Notifikasi (patuh mute) — tidak dobel di sini.
// - Poll 5 dtk saat terbuka, 20 dtk saat tertutup (badge), berhenti saat tab tersembunyi.
// =============================================================================

import { ArrowDown, ArrowLeft, Bike, CheckCheck, ExternalLink, Loader2, MessageCircle, Send, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type ThreadSummary = {
  id: string;
  tableLabel: string;
  orderId: string | null;
  orderNo: string | null;
  orderStatus: string | null;
  fulfillment: string | null;
  deliveryStatus: string | null;
  total: number | null;
  status: string;
  unread: boolean;
  unreadCount: number;
  lastMessageAt: string;
  preview: string;
  lastSender: string | null;
};

type ChatMsg = {
  id: string;
  sender: string;
  body: string;
  attachmentUrl?: string | null;
  staffName?: string | null;
  createdAt: string;
  staffUserId?: string | null;
};

type ThreadDetail = Omit<ThreadSummary, "unread" | "unreadCount" | "lastMessageAt" | "preview" | "lastSender"> & {
  customerPhone: string | null;
  messages: ChatMsg[];
};

const CANNED_COMMON = ["Baik, pesanan sedang kami proses 🙏", "Terima kasih sudah menunggu 🙏", "Mohon maaf, menu itu sedang habis."];
const CANNED_BY_TYPE: Record<string, string[]> = {
  "dine-in": ["Pelayan akan menuju meja Anda.", ...CANNED_COMMON],
  takeaway: ["Bukti bayar sudah kami terima, pesanan segera dibuat.", "Pesanan siap diambil di kasir ya.", ...CANNED_COMMON],
  delivery: [
    "Bukti bayar QRIS sudah kami terima, pesanan segera dibuat.",
    "Kurir sedang dalam perjalanan ke alamat Anda.",
    "Mohon pastikan nomor WA bisa dihubungi kurir.",
    ...CANNED_COMMON,
  ],
};

const STATUS_LABEL: Record<string, string> = {
  pending_cashier: "Menunggu kasir",
  awaiting_payment: "Menunggu bayar",
  accepted: "Diterima",
  paid: "Lunas",
  rejected: "Ditolak",
  voided: "Dibatalkan",
};

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? "Request gagal.");
  return json.data as T;
}

function TypeBadge({ fulfillment, tableLabel }: { fulfillment: string | null; tableLabel: string }) {
  const kind = fulfillment === "delivery" ? "delivery" : fulfillment === "takeaway" ? "takeaway" : "dine-in";
  const Icon = kind === "delivery" ? Bike : kind === "takeaway" ? ShoppingBag : UtensilsCrossed;
  const tone =
    kind === "delivery"
      ? "border-[#d11a2a]/55 bg-[#d11a2a]/12 text-[#ffc2c8]"
      : kind === "takeaway"
        ? "border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffd79a]"
        : "border-[#c9ccd3]/45 bg-white/[0.06] text-[#e7e9ee]";
  const label = kind === "delivery" ? "Delivery" : kind === "takeaway" ? "Take away" : tableLabel.split(" · ")[0];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-bold ${tone}`}>
      <Icon className="size-3" aria-hidden /> {label}
    </span>
  );
}

function ChatLine({ msg }: { msg: ChatMsg }) {
  const time = timeFmt.format(new Date(msg.createdAt));
  if (msg.sender === "system") {
    return (
      <p className="mx-auto w-fit max-w-[92%] rounded-full border border-[#f5a742]/30 bg-[#f5a742]/10 px-3 py-1 text-center text-xs font-semibold text-[#ffd79a]">
        {msg.body} <span className="font-normal text-[#e8c99a]">· {time}</span>
      </p>
    );
  }
  const staff = msg.sender === "staff";
  return (
    <div className={`flex ${staff ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
          staff ? "rounded-br-sm bg-[#d11a2a] text-white" : "rounded-bl-sm border border-[#4a4a54] bg-[#202027] text-[#f4f4f5]"
        }`}
      >
        <span className={`mb-0.5 block text-xs font-bold ${staff ? "text-white/85" : "text-[#ffd79a]"}`}>
          {staff ? (msg.staffName ? `${msg.staffName} (staf)` : "Staf") : "Pelanggan"}
        </span>
        {msg.attachmentUrl ? (
          <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="mb-1 block" title="Buka foto ukuran penuh">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto unggahan pelanggan */}
            <img src={msg.attachmentUrl} alt="Foto dari pelanggan" className="max-h-60 w-full rounded-lg object-cover" loading="lazy" />
          </a>
        ) : null}
        {msg.body && !(msg.attachmentUrl && msg.body === "📷 Foto") ? <span className="whitespace-pre-wrap break-words">{msg.body}</span> : null}
        <span className={`mt-1 block text-right text-[11px] ${staff ? "text-white/80" : "text-[#c9c9d1]"}`}>{time}</span>
      </div>
    </div>
  );
}

// Controlled: trigger ada di toolbar POS. `onUnread` = jumlah PESAN belum dibaca
// (bukan jumlah percakapan) untuk badge toolbar.
export function PosChatInbox({
  open,
  onOpenChange,
  onUnread,
  onOpenOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUnread?: (n: number) => void;
  /** Buka detail pesanan di POS (dari tombol "Buka pesanan"). */
  onOpenOrder?: (orderId: string) => void;
}) {
  const setOpen = onOpenChange;
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<ThreadDetail | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);

  const unreadMessages = threads.reduce((sum, thread) => sum + (thread.unreadCount ?? (thread.unread ? 1 : 0)), 0);
  useEffect(() => {
    if (tab === "open") onUnread?.(unreadMessages);
  }, [unreadMessages, onUnread, tab]);

  const loadThreads = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const data = await apiGet<{ threads: ThreadSummary[] }>(`/api/pos/chat${tab === "resolved" ? "?status=resolved" : ""}`);
      setThreads(data.threads);
    } catch {
      /* sesi/offline sesaat */
    }
  }, [tab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat awal daftar percakapan
    void loadThreads();
    const id = window.setInterval(() => void loadThreads(), open ? 5000 : 20000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadThreads();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadThreads, open]);

  const loadThread = useCallback(async (threadId: string) => {
    try {
      const data = await apiGet<ThreadDetail>(`/api/pos/chat/${threadId}`);
      setActive(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Percakapan gagal dimuat.");
    }
  }, []);

  // Poll percakapan aktif (bergantung pada id saja — interval tidak dibuat ulang tiap respons).
  useEffect(() => {
    if (!open || !activeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- buka percakapan terpilih
    void loadThread(activeId);
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void loadThread(activeId);
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, activeId, loadThread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (nearBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [active?.messages.length]);

  async function reply(text: string) {
    const body = text.trim();
    if (!body || !active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/pos/chat/${active.id}`, { body });
      setInput("");
      nearBottomRef.current = true;
      await loadThread(active.id);
      void loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Balasan gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  async function doAction(action: "resolve" | "forward") {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/pos/chat/${active.id}`, { action });
      if (action === "resolve") {
        setActiveId(null);
        setActive(null);
      } else {
        await loadThread(active.id);
      }
      void loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  }

  const kind = active?.fulfillment === "delivery" ? "delivery" : active?.fulfillment === "takeaway" ? "takeaway" : "dine-in";
  const canned = CANNED_BY_TYPE[kind];
  const finePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-0 border-[#34343c] bg-[#121218] p-0 sm:max-w-md">
        <SheetHeader className="border-b border-[#34343c] p-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-white">
            {active ? (
              <button
                type="button"
                onClick={() => {
                  setActiveId(null);
                  setActive(null);
                }}
                className="garage-press rounded-md p-1 hover:bg-white/10"
                aria-label="Kembali ke daftar"
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : (
              <MessageCircle className="size-4 text-[#f5a742]" aria-hidden />
            )}
            {active ? active.tableLabel : "Chat Tamu"}
          </SheetTitle>
          <SheetDescription className="text-sm text-[#d0d0d6]">
            {active ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <TypeBadge fulfillment={active.fulfillment} tableLabel={active.tableLabel} />
                {active.orderNo ? <span className="font-mono font-bold text-white">{active.orderNo}</span> : <span>Belum memesan</span>}
                {active.orderStatus ? <span>· {STATUS_LABEL[active.orderStatus] ?? active.orderStatus}</span> : null}
                {active.total != null ? <span>· {rupiah.format(active.total)}</span> : null}
              </span>
            ) : (
              `${threads.length} percakapan ${tab === "open" ? "aktif" : "selesai"}${tab === "open" ? ` · ${unreadMessages} pesan belum dibaca` : ""}`
            )}
          </SheetDescription>
          {!active ? (
            <div className="flex gap-1.5 pt-1" role="tablist" aria-label="Filter percakapan">
              {(["open", "resolved"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`garage-press rounded-md border px-3 py-1.5 text-xs font-bold ${
                    tab === value ? "border-[#d11a2a]/60 bg-[#d11a2a]/15 text-white" : "border-[#4a4a54] text-[#d0d0d6]"
                  }`}
                >
                  {value === "open" ? "Aktif" : "Riwayat"}
                </button>
              ))}
            </div>
          ) : active.orderId && onOpenOrder ? (
            <button
              type="button"
              onClick={() => onOpenOrder(active.orderId as string)}
              className="garage-press mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-[#4a4a54] px-2.5 py-1 text-xs font-bold text-white hover:bg-white/10"
            >
              <ExternalLink className="size-3.5" aria-hidden /> Buka pesanan
            </button>
          ) : null}
        </SheetHeader>

        {!active ? (
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {threads.length === 0 ? (
              <p className="mt-8 text-center text-sm text-[#c9c9d1]">
                {tab === "open" ? "Belum ada chat dari pelanggan." : "Belum ada percakapan yang selesai."}
              </p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    nearBottomRef.current = true;
                    setActiveId(t.id);
                  }}
                  className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition ${
                    t.unread ? "border-[#d11a2a]/60 bg-[#d11a2a]/12" : "border-[#34343c] bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <TypeBadge fulfillment={t.fulfillment} tableLabel={t.tableLabel} />
                      <span className="truncate text-sm font-bold text-white">{t.tableLabel.split(" · ")[1] ?? t.tableLabel}</span>
                      {t.orderNo ? <span className="font-mono text-xs text-[#d0d0d6]">{t.orderNo}</span> : null}
                      {t.unreadCount ? (
                        <span className="ml-auto shrink-0 rounded-full bg-[#f5a742] px-2 py-0.5 text-xs font-black text-black">
                          {t.unreadCount} baru
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-sm text-[#d0d0d6]">
                      {t.lastSender === "staff" ? "Anda: " : ""}
                      {t.preview || "(belum ada pesan)"}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#b8b8bf]">
                      {timeFmt.format(new Date(t.lastMessageAt))}
                      {t.orderStatus ? ` · ${STATUS_LABEL[t.orderStatus] ?? t.orderStatus}` : ""}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-label="Percakapan dengan pelanggan"
                onScroll={(event) => {
                  const el = event.currentTarget;
                  nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  if (nearBottomRef.current) setShowJump(false);
                }}
                className="h-full space-y-2.5 overflow-y-auto p-4"
              >
                {active.messages.map((m) => (
                  <ChatLine key={m.id} msg={m} />
                ))}
              </div>
              {showJump ? (
                <button
                  type="button"
                  onClick={() => {
                    nearBottomRef.current = true;
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                    setShowJump(false);
                  }}
                  className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#f5a742] px-3 py-1.5 text-xs font-black text-black"
                >
                  <ArrowDown className="size-3.5" aria-hidden /> Pesan baru
                </button>
              ) : null}
            </div>
            {error ? (
              <p className="px-3 pb-1 text-sm text-[#fca5a5]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 border-t border-[#34343c] px-3 pt-2">
              {canned.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  onClick={() => void reply(c)}
                  className="garage-press rounded-full border border-[#4a4a54] bg-white/[0.05] px-2.5 py-1 text-xs text-[#e7e7ea] hover:bg-white/[0.1] disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              {kind === "dine-in" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doAction("forward")}
                  className="garage-press rounded-md border border-[#4a4a54] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-[#e7e7ea] hover:bg-white/[0.1] disabled:opacity-50"
                >
                  Teruskan ke pelayan
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void doAction("resolve")}
                className="garage-press flex items-center gap-1 rounded-md border border-[#c9ccd3]/45 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.1] disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Tandai selesai
              </button>
            </div>
            <div className="flex items-end gap-2 border-t border-[#34343c] p-3">
              <label htmlFor="pos-chat-reply" className="sr-only">
                Balas pelanggan
              </label>
              <textarea
                id="pos-chat-reply"
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && finePointer && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void reply(input);
                  }
                }}
                rows={1}
                placeholder="Balas pelanggan..."
                className="max-h-24 min-h-11 flex-1 resize-none rounded-md border border-[#4a4a54] bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-[#a1a1aa] focus:border-[#d11a2a]/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void reply(input)}
                disabled={busy || !input.trim()}
                aria-label="Kirim balasan"
                className="garage-press flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-[#d11a2a] px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
