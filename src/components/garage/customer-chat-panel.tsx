"use client";

// =============================================================================
// LIVE CHAT PELANGGAN ↔ KASIR (menu digital, pelacak pesanan, halaman invoice).
// - Satu percakapan per pesanan (token per order); sebelum memesan memakai token
//   umum yang dipindah ke pesanan saat checkout (adoptChatTokenForOrder).
// - Pesan baru tetap terdeteksi walau panel tertutup (poll ringan) → badge,
//   getar, dan judul tab. Poll berhenti saat tab disembunyikan.
// - Jam per pesan, nama staf yang membalas, tanda "Dibaca", foto bukti bayar.
// =============================================================================

import { ArrowDown, Camera, CheckCheck, Loader2, MessageCircle, Send, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type CustomerChatMessage = {
  id: string;
  sender: string;
  body: string;
  attachmentUrl?: string | null;
  staffName?: string | null;
  createdAt: string;
};

type ChatPayload = {
  threadId: string | null;
  status: string;
  staffReadAt: string | null;
  messages: CustomerChatMessage[];
};

const GENERIC_KEY = "garage:chatToken";
const orderKey = (orderId: string) => `garage:chatToken:order:${orderId}`;
const activeKey = (token: string) => `garage:chatActive:${token}`;
const seenKey = (token: string) => `garage:chatSeen:${token}`;
const MAX_LEN = 500;

function newToken() {
  const raw =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `c${Date.now()}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return raw.replace(/-/g, "");
}

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* penyimpanan diblokir */
    }
  }
}

function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Token chat: per pesanan bila ada, selain itu token umum sebelum memesan. */
export function chatTokenFor(orderId?: string | null) {
  if (typeof window === "undefined") return "";
  const key = orderId ? orderKey(orderId) : GENERIC_KEY;
  let token = safeGet(key);
  if (!token || token.length < 12) {
    token = newToken();
    safeSet(key, token);
  }
  return token;
}

/** Token umum yang sudah dipakai (untuk ditautkan saat checkout), atau undefined. */
export function existingGenericChatToken() {
  if (typeof window === "undefined") return undefined;
  const token = safeGet(GENERIC_KEY);
  return token && token.length >= 12 && safeGet(activeKey(token)) ? token : undefined;
}

/** Setelah checkout: percakapan umum menjadi milik pesanan ini; kunjungan berikutnya mulai baru. */
export function adoptChatTokenForOrder(orderId: string) {
  if (typeof window === "undefined") return;
  const token = safeGet(GENERIC_KEY);
  if (token && token.length >= 12 && safeGet(activeKey(token))) {
    safeSet(orderKey(orderId), token);
  }
  safeRemove(GENERIC_KEY);
}

async function fetchChat(token: string, afterId?: string | null) {
  const url = `/api/customer/chat${afterId ? `?afterId=${encodeURIComponent(afterId)}` : ""}`;
  const response = await fetch(url, { cache: "no-store", headers: { "x-chat-token": token } });
  const json = (await response.json().catch(() => ({}))) as { data?: ChatPayload; error?: { message?: string } };
  if (!response.ok || !json.data) throw new Error(json.error?.message ?? "Chat gagal dimuat.");
  return json.data;
}

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const dayFmt = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/** Browser memblokir getar sebelum pengguna menyentuh halaman (dan mencatat error). */
function canVibrate() {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return typeof navigator.vibrate === "function" && (activation ? activation.hasBeenActive : true);
}

function ChatBubble({ msg, read }: { msg: CustomerChatMessage; read: boolean }) {
  const time = timeFmt.format(new Date(msg.createdAt));
  if (msg.sender === "system") {
    return (
      <p className="mx-auto w-fit max-w-[90%] rounded-full border border-garage-amber/35 bg-garage-amber/10 px-3 py-1 text-center text-xs font-semibold text-[#ffd79a]">
        {msg.body} <span className="font-normal text-[#e8c99a]">· {time}</span>
      </p>
    );
  }
  const mine = msg.sender === "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[15px] leading-snug ${
          mine ? "rounded-br-sm bg-garage-red text-white" : "rounded-bl-sm border border-garage-line-2 bg-[#202027] text-white"
        }`}
      >
        {!mine ? (
          <span className="mb-0.5 block text-xs font-bold text-[#ffd79a]">
            {msg.staffName ? `${msg.staffName} · Kasir Garage` : "Kasir Garage"}
          </span>
        ) : null}
        {msg.attachmentUrl ? (
          <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="mb-1 block">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto unggahan dinamis */}
            <img src={msg.attachmentUrl} alt="Foto lampiran" className="max-h-56 w-full rounded-lg object-cover" loading="lazy" />
          </a>
        ) : null}
        {msg.body && !(msg.attachmentUrl && msg.body === "📷 Foto") ? (
          <span className="whitespace-pre-wrap break-words">{msg.body}</span>
        ) : null}
        <span className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-white/85" : "text-[#c9c9d1]"}`}>
          {time}
          {mine ? (
            <span className="inline-flex items-center gap-0.5" aria-label={read ? "Dibaca kasir" : "Terkirim"}>
              <CheckCheck className={`size-3.5 ${read ? "text-[#ffd79a]" : ""}`} aria-hidden />
              {read ? "Dibaca" : "Terkirim"}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function CustomerChatPanel({
  tableLabel,
  title,
  orderId,
  orderToken,
  orderNo,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  className = "",
  onUnreadChange,
}: {
  tableLabel: string;
  title?: string;
  /** Pesanan yang sedang dilacak — chat diikat ke pesanan ini. */
  orderId?: string | null;
  /** Token invoice/tracking = bukti kepemilikan pesanan untuk server. */
  orderToken?: string | null;
  orderNo?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  className?: string;
  /** Jumlah pesan kasir yang belum dibaca — untuk badge di tombol milik halaman. */
  onUnreadChange?: (count: number) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setInnerOpen(next);
    },
    [onOpenChange],
  );

  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<CustomerChatMessage[]>([]);
  const [staffReadAt, setStaffReadAt] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState("open");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(0);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const lastIdRef = useRef<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- token dibaca dari localStorage (khusus klien)
    setToken(chatTokenFor(orderId));
    seenRef.current = new Set();
    lastIdRef.current = null;
    setMessages([]);
  }, [orderId]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- posisi "sudah dibaca" dari localStorage
    setSeenId(safeGet(seenKey(token)));
  }, [token]);

  const merge = useCallback((payload: ChatPayload) => {
    setStaffReadAt(payload.staffReadAt);
    setThreadStatus(payload.status);
    if (!payload.messages.length) return;
    setMessages((prev) => {
      const next = [...prev];
      for (const message of payload.messages) {
        if (!seenRef.current.has(message.id)) {
          seenRef.current.add(message.id);
          next.push(message);
        }
      }
      return next;
    });
    lastIdRef.current = payload.messages[payload.messages.length - 1].id;
  }, []);

  // Poll: cepat (3 dtk) saat panel terbuka; ringan (15 dtk) saat tertutup tapi
  // percakapan sudah ada. Berhenti saat tab tidak terlihat.
  const active = Boolean(token && (open || safeGetActive(token)));
  useEffect(() => {
    if (!active || !token) return;
    let alive = true;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const payload = await fetchChat(token, lastIdRef.current);
        if (!alive) return;
        merge(payload);
        setFailures(0);
      } catch {
        if (alive) setFailures((count) => count + 1);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), open ? 3000 : 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, open, token, merge]);

  const lastStaff = useMemo(() => [...messages].reverse().find((message) => message.sender !== "customer"), [messages]);
  const unread = useMemo(() => {
    if (!seenId) return messages.filter((message) => message.sender === "staff").length;
    const index = messages.findIndex((message) => message.id === seenId);
    return messages.slice(index + 1).filter((message) => message.sender !== "customer").length;
  }, [messages, seenId]);

  useEffect(() => {
    onUnreadChange?.(open ? 0 : unread);
  }, [unread, open, onUnreadChange]);

  // Panel terbuka → semua pesan dianggap terbaca.
  useEffect(() => {
    if (!open || !token || !messages.length) return;
    const lastId = messages[messages.length - 1].id;
    safeSet(seenKey(token), lastId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron penanda "sudah dibaca"
    setSeenId(lastId);
  }, [open, token, messages]);

  // Pesan staf baru saat panel tertutup → getar + judul tab.
  const lastStaffIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastStaff) return;
    if (lastStaffIdRef.current && lastStaffIdRef.current !== lastStaff.id && !open && lastStaff.sender === "staff") {
      try {
        if (canVibrate()) navigator.vibrate([120, 80, 120]);
      } catch {
        /* tidak didukung */
      }
    }
    lastStaffIdRef.current = lastStaff.id;
  }, [lastStaff, open]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unread > 0 && !open ? `(${unread}) ${base}` : base;
  }, [unread, open]);

  // Gulir otomatis hanya bila pengguna sudah di bawah; selain itu tampilkan pil.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (nearBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messages, open]);

  async function send(attachmentUrl?: string) {
    const body = input.trim();
    if ((!body && !attachmentUrl) || sending || !token) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/customer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatToken: token,
          tableLabel: tableLabel.slice(0, 40),
          body: attachmentUrl ? body || "📷 Foto" : body,
          orderToken: orderToken || undefined,
          attachmentUrl,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(json.error?.message ?? "Gagal mengirim. Coba lagi.");
      safeSet(activeKey(token), "1");
      if (!attachmentUrl) setInput("");
      nearBottomRef.current = true;
      merge(await fetchChat(token, lastIdRef.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim. Coba lagi.");
    } finally {
      setSending(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!token) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("chatToken", token);
      form.append("file", file);
      const response = await fetch("/api/customer/chat/upload", { method: "POST", body: form });
      const json = (await response.json().catch(() => ({}))) as { data?: { url: string }; error?: { message?: string } };
      if (!response.ok || !json.data) throw new Error(json.error?.message ?? "Foto gagal diunggah.");
      await send(json.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Foto gagal diunggah.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const finePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

  return (
    <>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`garage-press relative mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-garage-red/45 bg-garage-red/12 px-3 py-2.5 text-sm font-bold text-[#ffc9c9] transition hover:bg-garage-red/20 ${className}`}
        >
          <MessageCircle className="size-4" aria-hidden />
          {title ?? "Chat langsung dengan kasir"}
          {unread > 0 ? (
            <span className="ml-1 rounded-full bg-garage-amber px-2 py-0.5 text-xs font-black text-black" aria-label={`${unread} pesan baru`}>
              {unread} baru
            </span>
          ) : null}
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[85dvh] max-h-[85dvh] flex-col gap-0 border-garage-line bg-garage-bg-1 p-0 pb-[env(safe-area-inset-bottom)] sm:mx-auto sm:max-w-xl sm:rounded-t-xl"
        >
          <SheetHeader className="border-b border-garage-line p-4 text-left">
            <SheetTitle className="flex items-center gap-2 font-sans text-white">
              <MessageCircle className="size-4 text-garage-amber" aria-hidden /> Chat Kasir Garage
            </SheetTitle>
            <SheetDescription className="text-sm text-[#d0d0d6]">
              {orderNo ? `Pesanan ${orderNo} · ` : ""}
              {tableLabel} · biasanya dibalas dalam beberapa menit.
            </SheetDescription>
          </SheetHeader>
          {failures >= 3 ? (
            <p className="flex items-center gap-2 border-b border-garage-red/40 bg-garage-red/12 px-4 py-2 text-sm font-semibold text-[#ffc9c9]" role="status">
              <WifiOff className="size-4" aria-hidden /> Koneksi terputus — mencoba lagi otomatis…
            </p>
          ) : null}
          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              role="log"
              aria-live="polite"
              aria-label="Percakapan dengan kasir"
              onScroll={(event) => {
                const el = event.currentTarget;
                nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                if (nearBottomRef.current) setShowJump(false);
              }}
              className="h-full space-y-2.5 overflow-y-auto p-4"
            >
              {messages.length === 0 ? (
                <p className="mt-6 text-center text-sm text-[#c9c9d1]">
                  Tanya menu, ralat pesanan, atau kirim foto bukti bayar ke kasir.
                </p>
              ) : (
                messages.map((message, index) => {
                  const showDay = index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt);
                  const read =
                    message.sender === "customer" && Boolean(staffReadAt) && new Date(staffReadAt as string) >= new Date(message.createdAt);
                  return (
                    <div key={message.id} className="space-y-2.5">
                      {showDay ? (
                        <p className="text-center text-xs font-semibold text-[#c9c9d1]">{dayFmt.format(new Date(message.createdAt))}</p>
                      ) : null}
                      <ChatBubble msg={message} read={read} />
                    </div>
                  );
                })
              )}
              {threadStatus === "resolved" ? (
                <p className="text-center text-xs text-[#c9c9d1]">Percakapan ditutup kasir — kirim pesan untuk membuka lagi.</p>
              ) : null}
            </div>
            {showJump ? (
              <button
                type="button"
                onClick={() => {
                  nearBottomRef.current = true;
                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                  setShowJump(false);
                }}
                className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-garage-amber px-3 py-1.5 text-xs font-black text-black shadow"
              >
                <ArrowDown className="size-3.5" aria-hidden /> Pesan baru
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="flex items-center justify-between gap-2 px-4 pb-1 text-sm text-[#fca5a5]" role="alert">
              {error}
              <button type="button" onClick={() => setError("")} aria-label="Tutup pesan error" className="text-[#fca5a5]">
                <X className="size-4" aria-hidden />
              </button>
            </p>
          ) : null}
          <div className="flex items-end gap-2 border-t border-garage-line p-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || sending}
              aria-label="Kirim foto (mis. bukti bayar)"
              title="Kirim foto bukti bayar"
              className="garage-press flex size-11 shrink-0 items-center justify-center rounded-md border border-garage-line-2 text-white disabled:opacity-50"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            </button>
            <div className="min-w-0 flex-1">
              <label htmlFor="customer-chat-input" className="sr-only">
                Tulis pesan untuk kasir
              </label>
              <textarea
                id="customer-chat-input"
                value={input}
                maxLength={MAX_LEN}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter = kirim hanya di perangkat dengan keyboard fisik; di HP Enter = baris baru.
                  if (event.key === "Enter" && !event.shiftKey && finePointer && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Tulis pesan..."
                className="max-h-28 min-h-11 w-full resize-none rounded-md border border-garage-line-2 bg-white/[0.06] px-3 py-2.5 text-base text-white placeholder:text-[#a1a1aa] focus:border-garage-red/60 focus:outline-none"
              />
              {input.length > MAX_LEN - 80 ? (
                <p className="text-right text-xs text-[#c9c9d1]">
                  {input.length}/{MAX_LEN}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              aria-label="Kirim pesan"
              className="garage-press flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-garage-red px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              Kirim
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function safeGetActive(token: string) {
  if (typeof window === "undefined") return false;
  return Boolean(safeGet(activeKey(token)));
}
