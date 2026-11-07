"use client";

// Tanya AYA — panel chat premium (Menu V5, papan 04 + master prompt §2/§7/§8).
// - Jawaban dari aya-menu-assistant.ts: aturan atas data menu yang tampil, TANPA AI/kunci API
//   (keputusan D-07) → tidak pernah mengarang harga, menu, atau info operasional.
// - Non-modal: HP = bottom sheet (bisa diperbesar/diperkecil/minimalkan), tablet = panel melayang,
//   desktop = panel kanan bawah yang bisa diperbesar tanpa menutup seluruh menu.
// - Status: mengetik/berpikir, mendengarkan (mic bawaan browser), berbicara (+ tombol Hentikan).
// - Suara hanya setelah pelanggan menyalakannya (writeAyaSound) dan ada interaksi; teks = transkrip.
// - Riwayat sesi di sessionStorage (aya-chat-history.ts). Navigasi pintar lewat `onNavigate`.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Bean,
  Camera,
  ChevronRight,
  Crown,
  CupSoda,
  Heart,
  HelpCircle,
  MapPin,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  SendHorizontal,
  Settings2,
  Snowflake,
  Square,
  Star,
  Tag,
  Trash2,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  X,
  ArrowUpRight,
  Navigation,
  Armchair,
} from "lucide-react";

import { AyaMascot } from "@/components/garage/aya/aya-mascot";
import { AYA_PRESENCE_HOLD_MS, AYA_PRESENCE_LABEL, AYA_SLEEP_AFTER_MS, ayaPresenceReducer, type AyaPresence, type AyaPresenceEvent } from "@/components/garage/aya/aya-presence";
import { AyaStage3D } from "@/components/garage/aya/aya-stage-3d";
import { useAyaSound } from "@/components/garage/aya/aya-sound-toggle";
import { getAyaSpeaking, playAyaSfx, speakAya, stopAyaSpeech, subscribeAyaSpeaking, writeAyaSound } from "@/lib/aya-sound";
import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";
import { rupiah } from "../order-ui";
import { clearAyaChat, readAyaChat, writeAyaChat, type AyaChatMessage } from "./aya-chat-history";
import { AYA_SAMPLE_PROMPTS, AYA_WELCOME, answerAya, ayaQuickPrompts, type AyaContext, type AyaNav, type AyaPromptIcon } from "./aya-menu-assistant";
import { cardPrice } from "./menu-v5-model";

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ICONS: Record<AyaPromptIcon, typeof CupSoda> = {
  cup: CupSoda,
  snow: Snowflake,
  bean: Bean,
  heart: Heart,
  star: Star,
  tag: Tag,
  utensils: UtensilsCrossed,
  crown: Crown,
  help: HelpCircle,
  table: Armchair,
  pin: MapPin,
  camera: Camera,
};

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
/** Batas ucapan per jawaban (master prompt §7: pembatasan durasi). */
const SPEAK_MAX_CHARS = 240;
const ASK_GAP_MS = 600;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function welcomeMessage(): AyaChatMessage {
  return { id: 0, from: "aya", text: AYA_WELCOME, at: new Date() };
}

/** Tinggi keyboard HP (visualViewport) supaya input chat tidak tertutup. */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

export type AyaChatView = "closed" | "open" | "minimized";

export function AyaChatV5({
  open,
  onOpenChange,
  items,
  bestSellerIds,
  onAdd,
  onOpenItem,
  onStartGuide,
  onStaff,
  staffLabel = "Chat kasir",
  onNavigate,
  autoNavigate = true,
  mode,
  tableLabel,
  historyScope = "default",
  menuState = "ready",
  onRetryMenu,
  expandToken = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly MenuItem[];
  bestSellerIds?: readonly string[];
  onAdd: (itemId: string, variantId: string, delta: number) => void;
  onOpenItem: (item: MenuItem) => void;
  onStartGuide?: () => void;
  onStaff?: () => void;
  staffLabel?: string;
  /** Navigasi pintar: buka kategori/filter/bantuan di halaman (panel diminimalkan dulu). */
  onNavigate?: (nav: AyaNav) => void;
  /** false = pelanggan pernah membatalkan navigasi → hanya tawarkan tombol, jangan pindah otomatis. */
  autoNavigate?: boolean;
  mode?: AyaContext["mode"];
  tableLabel?: string | null;
  /** Kunci riwayat sesi (outlet + meja). */
  historyScope?: string;
  /** Status data menu: AYA menjelaskan kendala dan menawarkan muat ulang. */
  menuState?: "ready" | "loading" | "error";
  onRetryMenu?: () => void;
  /** Naikkan angka ini untuk membuka lagi panel yang sedang diminimalkan (mis. "Kembali ke AYA"). */
  expandToken?: number;
}) {
  const ctx = useMemo<AyaContext>(() => ({ items, bestSellerIds, mode, tableLabel }), [items, bestSellerIds, mode, tableLabel]);
  const quick = useMemo(() => ayaQuickPrompts(ctx), [ctx]);
  const sound = useAyaSound("customer");
  const speaking = useSyncExternalStore(subscribeAyaSpeaking, getAyaSpeaking, () => false);

  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<AyaChatMessage[]>(() => [welcomeMessage()]);
  const [restored, setRestored] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [presence, setPresence] = useState<AyaPresence>("greeting");
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [listenSeconds, setListenSeconds] = useState(0);
  const [micSupported, setMicSupported] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const lastAskAt = useRef(0);
  const recognition = useRef<RecognitionLike | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const voiceNoteShown = useRef(false);
  const keyboard = useKeyboardInset(open && !minimized && isMobile);

  const dispatch = useCallback((event: AyaPresenceEvent) => setPresence((current) => ayaPresenceReducer(current, event)), []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    // Kemampuan browser & ukuran layar baru diketahui setelah mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMicSupported(Boolean(recognitionCtor()));
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Pulihkan riwayat sesi sekali saat menu sudah ada (kartu menu dibaca ulang dari data terbaru).
  useEffect(() => {
    if (restored || !items.length) return;
    const saved = readAyaChat(historyScope, items);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage hanya tersedia di client
    setRestored(true);
    if (saved?.length) {
      seq.current = Math.max(...saved.map((message) => message.id));
      setMessages(saved);
    }
  }, [historyScope, items, restored]);

  useEffect(() => {
    if (restored) writeAyaChat(historyScope, messages);
  }, [historyScope, messages, restored]);

  // Status bicara global (speechSynthesis) dibaca langsung di `shownPresence` (talking), bukan disalin ke state.

  // State sesaat (sapa/senang/tunjuk) kembali ke idle.
  useEffect(() => {
    const hold = AYA_PRESENCE_HOLD_MS[presence];
    if (!hold) return;
    const timer = window.setTimeout(() => dispatch({ type: "settle" }), hold);
    return () => window.clearTimeout(timer);
  }, [dispatch, presence]);

  // Tidur setelah lama tanpa interaksi (panel terbuka/diminimalkan).
  useEffect(() => {
    if (!open || presence === "sleep") return;
    const timer = window.setTimeout(() => dispatch({ type: "idleTimeout" }), AYA_SLEEP_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, messages, open, presence, input]);

  const stopListening = useCallback(() => {
    recognition.current?.abort();
    recognition.current = null;
    setListening(false);
  }, []);

  // Buka: simpan fokus asal, sapa sekali, fokus ke panel (bukan input → keyboard HP tidak muncul sendiri).
  useEffect(() => {
    if (!open) return;
    returnFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- panel baru dibuka = tampil penuh lagi
    setMinimized(false);
    dispatch({ type: "greet" });
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [dispatch, open]);

  // Semua jalur tutup lewat sini → hentikan bicara, mic dan timer; fokus kembali ke pemicu.
  const close = useCallback(() => {
    stopAyaSpeech();
    stopListening();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setThinking(false);
    setSettingsOpen(false);
    setExpanded(false);
    setMinimized(false);
    onOpenChange(false);
    const target = returnFocus.current;
    if (target && document.contains(target)) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }, [onOpenChange, stopListening]);

  const minimize = useCallback(() => {
    stopListening();
    setSettingsOpen(false);
    setMinimized(true);
  }, [stopListening]);

  const restore = useCallback(() => {
    setMinimized(false);
    dispatch({ type: "wake" });
    window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
  }, [dispatch]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- permintaan dari luar ("Kembali ke AYA")
    if (expandToken) restore();
  }, [expandToken, restore]);

  // Gulir ke pesan terbaru.
  useEffect(() => {
    const log = logRef.current;
    // Sapaan pertama: biarkan di atas (AYA 3D + contoh pertanyaan terlihat); selanjutnya ikuti pesan terbaru.
    if (log && open && !minimized && (messages.length > 1 || thinking)) log.scrollTo({ top: log.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [messages, thinking, open, minimized]);

  // Penghitung waktu rekaman (papan 04 §5).
  useEffect(() => {
    if (!listening) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mulai hitung dari 0 setiap rekaman baru
    setListenSeconds(0);
    const timer = window.setInterval(() => setListenSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [listening]);

  const say = useCallback(
    (text: string) => {
      if (!sound.enabled) return;
      const spoke = speakAya(text.slice(0, SPEAK_MAX_CHARS), "customer");
      // Fallback teks: beri tahu sekali per sesi, jangan mengulang di setiap jawaban.
      if (!spoke && !voiceNoteShown.current) {
        voiceNoteShown.current = true;
        setVoiceNote("Suara AYA belum tersedia di perangkat ini — jawabannya tetap tertulis di sini.");
      }
    },
    [sound.enabled],
  );

  const push = useCallback((message: Omit<AyaChatMessage, "id" | "at">) => {
    setMessages((list) => [...list, { ...message, id: ++seq.current, at: new Date() }]);
  }, []);

  const navigate = useCallback(
    (nav: AyaNav) => {
      if (!onNavigate) return;
      dispatch({ type: "point" });
      playAyaSfx("point", "customer");
      minimize();
      onNavigate(nav);
    },
    [dispatch, minimize, onNavigate],
  );

  const ask = useCallback(
    (raw: string) => {
      const query = raw.trim().slice(0, 200);
      if (!query) return;
      const now = Date.now();
      if (now - lastAskAt.current < ASK_GAP_MS) return; // cegah kirim ganda
      lastAskAt.current = now;
      stopAyaSpeech();
      setInput("");
      setVoiceNote("");
      push({ from: "user", text: query });

      if (menuState !== "ready" || !items.length) {
        const text = menuState === "loading"
          ? "Menu masih dimuat, tunggu sebentar ya, lalu tanya lagi."
          : "Maaf, AYA belum bisa membaca daftar menu sekarang. Coba muat ulang menunya.";
        push({ from: "aya", text, retry: menuState === "loading" ? query : "menu" });
        dispatch({ type: "error" });
        return;
      }

      setThinking(true);
      dispatch({ type: "think" });
      later(() => {
        setThinking(false);
        try {
          const answer = answerAya(query, ctx);
          push({ from: "aya", text: answer.text, items: answer.items.length ? answer.items : undefined, action: answer.action, nav: answer.nav, links: answer.links });
          playAyaSfx(answer.empty ? "boing" : "pop", "customer");
          dispatch({ type: "answer", ok: !answer.empty });
          say(answer.text);
          if (answer.nav && answer.autoNav && autoNavigate && onNavigate) {
            const nav = answer.nav;
            later(() => navigate(nav), reducedMotion() ? 300 : 1100);
          }
        } catch {
          push({ from: "aya", text: "Ups, AYA sedang bermasalah menjawab. Coba lagi, ya.", retry: query });
          dispatch({ type: "error" });
          playAyaSfx("oops", "customer");
        }
      }, reducedMotion() ? 200 : 550);
    },
    [autoNavigate, ctx, dispatch, items.length, later, menuState, navigate, onNavigate, push, say],
  );

  function retry(target: string) {
    dispatch({ type: "settle" });
    if (target === "menu") {
      onRetryMenu?.();
      push({ from: "aya", text: "Siap, AYA muat ulang menunya. Coba tanya lagi sebentar lagi, ya." });
      return;
    }
    lastAskAt.current = 0;
    ask(target);
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    stopAyaSpeech();
    setVoiceNote("");
    const rec = new Ctor();
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (event) => {
      const parts = Array.from(event.results);
      const text = parts.map((result) => result[0]?.transcript ?? "").join(" ").trim();
      setInput(text.slice(0, 200));
      if (parts.at(-1)?.isFinal) finalText = text;
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      dispatch({ type: "listenEnd" });
      if (finalText) ask(finalText);
    };
    rec.onerror = (event) => {
      recognition.current = null;
      setListening(false);
      dispatch({ type: "listenEnd" });
      setVoiceNote(
        event?.error === "not-allowed" || event?.error === "service-not-allowed"
          ? "Izin mikrofon ditolak. Izinkan mikrofon di browser, atau ketik pertanyaanmu."
          : event?.error === "no-speech"
            ? "AYA tidak mendengar suara. Ketuk mic lalu coba bicara lagi."
            : "Mikrofon sedang bermasalah. Ketik pertanyaanmu saja, ya.",
      );
    };
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
      dispatch({ type: "listenStart" });
    } catch {
      recognition.current = null;
      setVoiceNote("Mikrofon tidak bisa dipakai di browser ini. Ketik pertanyaanmu saja, ya.");
    }
  }

  function toggleSound() {
    if (sound.enabled) stopAyaSpeech();
    writeAyaSound("customer", { ...sound, enabled: !sound.enabled });
    setVoiceNote("");
  }

  function resetChat() {
    stopAyaSpeech();
    clearAyaChat(historyScope);
    seq.current = 0;
    setMessages([welcomeMessage()]);
    setSettingsOpen(false);
    dispatch({ type: "greet" });
  }

  function onPanelKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (settingsOpen) setSettingsOpen(false);
    else close();
  }

  if (!open) return null;

  const shownPresence: AyaPresence = listening ? "listening" : speaking ? "talking" : thinking ? "thinking" : presence;
  const lastAya = [...messages].reverse().find((message) => message.from === "aya");
  const firstOnly = messages.length <= 1;
  const statusText = AYA_PRESENCE_LABEL[shownPresence];
  const busy = shownPresence !== "idle" && shownPresence !== "sleep";

  // ---------------------------------------------------------------- diminimalkan
  if (minimized) {
    return (
      <div
        className="gm5 gm5-aya-mini fixed z-[96] flex items-center gap-2 rounded-full border border-[color:var(--gm5-line)] bg-[#141214]/95 p-1.5 pr-2 text-white shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-sm"
        role="region"
        aria-label="Tanya AYA (diminimalkan)"
      >
        <button type="button" className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-full pr-1 text-left" onClick={restore} aria-label="Buka lagi percakapan AYA">
          <span className="relative size-10 shrink-0" aria-hidden>
            <AyaMascot state={shownPresence === "talking" ? "speaking" : shownPresence === "listening" ? "listening" : "idle"} crop="head" role="customer" />
            {speaking ? <span className="gm5-live-dot absolute -right-0.5 -top-0.5" /> : null}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold leading-tight">Tanya AYA</span>
            <span className="block max-w-[11rem] truncate text-xs text-[#cfc9c4] sm:max-w-[14rem]">{statusText}</span>
          </span>
        </button>
        {speaking ? (
          <button type="button" className="gm5-icon-btn !h-10 !w-10" aria-label="Hentikan suara AYA" onClick={() => stopAyaSpeech()}>
            <Square className="size-4" fill="currentColor" aria-hidden />
          </button>
        ) : null}
        <button type="button" className="gm5-icon-btn !h-10 !w-10" aria-label="Perbesar panel AYA" onClick={restore}>
          <Maximize2 className="size-4" aria-hidden />
        </button>
        <button type="button" className="gm5-icon-btn !h-10 !w-10" aria-label="Tutup AYA" onClick={close}>
          <X className="size-5" aria-hidden />
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------- terbuka
  return (
    <>
      {isMobile ? <button type="button" aria-label="Tutup AYA" tabIndex={-1} className="gm5-aya-backdrop fixed inset-0 z-[95] cursor-default bg-black/55" onClick={close} /> : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isMobile}
        aria-labelledby="aya-chat-title"
        aria-describedby="aya-chat-desc"
        tabIndex={-1}
        onKeyDown={onPanelKey}
        data-expanded={expanded}
        style={isMobile ? { bottom: keyboard, maxHeight: keyboard ? `calc(100dvh - ${keyboard}px - 8px)` : undefined } : undefined}
        className="gm5 gm5-aya-panel fixed z-[96] flex flex-col overflow-hidden border border-[color:var(--gm5-line)] bg-[#0e0e0e] text-white outline-none"
      >
        {/* Handle (HP): ketuk = perbesar/perkecil */}
        <button
          type="button"
          className="mx-auto mt-1.5 flex h-6 w-24 shrink-0 cursor-pointer items-center justify-center md:hidden"
          aria-label={expanded ? "Perkecil panel AYA" : "Perbesar panel AYA"}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
        </button>

        {/* Header: avatar + nama + status, suara, pengaturan, minimalkan, perbesar, tutup */}
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 pb-2.5 pt-1 md:pt-3">
          <span className="relative size-11 shrink-0" aria-hidden>
            <AyaMascot state={shownPresence === "talking" ? "speaking" : shownPresence === "listening" ? "listening" : shownPresence === "thinking" ? "thinking" : shownPresence === "error" ? "error" : "idle"} crop="head" role="customer" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="aya-chat-title" className="gm5-title whitespace-nowrap text-base leading-tight text-white md:text-lg">
              Tanya AYA
            </h2>
            <p className="flex items-center gap-1.5 text-[13px] text-[#cfc9c4]" aria-live="polite">
              <span className={`size-2 shrink-0 rounded-full ${shownPresence === "error" ? "bg-[#f5a742]" : busy ? "bg-[var(--menu-red-bright)]" : "bg-[#4ade80]"}`} aria-hidden />
              <span className="truncate">{shownPresence === "idle" ? "Online · siap membantu" : statusText}</span>
              {speaking ? (
                <span className="gm5-speak-bars" aria-hidden>
                  <i /> <i /> <i /> <i />
                </span>
              ) : null}
            </p>
            <p id="aya-chat-desc" className="sr-only">
              Asisten digital Garage Coffee. Tanya soal menu, rekomendasi, cara pesan, meja, lokasi, atau media sosial.
            </p>
          </div>
          {speaking ? (
            <button type="button" className="gm5-icon-btn gm5-stop-btn !h-10 !w-auto gap-1.5 !px-3 text-xs font-bold" onClick={() => stopAyaSpeech()}>
              <Square className="size-3.5" fill="currentColor" aria-hidden /> Stop
            </button>
          ) : null}
          <button type="button" className="gm5-icon-btn !h-10 !w-10" aria-pressed={sound.enabled} aria-label={sound.enabled ? "Matikan suara AYA" : "Nyalakan suara AYA"} onClick={toggleSound}>
            {sound.enabled ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          </button>
          <button
            type="button"
            className="gm5-icon-btn !h-10 !w-10"
            aria-expanded={settingsOpen}
            aria-controls="aya-chat-settings"
            aria-label="Pengaturan suara & percakapan"
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings2 className="size-5" aria-hidden />
          </button>
          <button type="button" className="gm5-icon-btn !h-10 !w-10" aria-label="Minimalkan AYA" onClick={minimize}>
            <Minus className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            className="gm5-icon-btn hidden !h-10 !w-10 md:inline-flex"
            aria-label={expanded ? "Perkecil panel AYA" : "Perbesar panel AYA"}
            aria-pressed={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 className="size-[18px]" aria-hidden /> : <Maximize2 className="size-[18px]" aria-hidden />}
          </button>
          <button type="button" className="gm5-icon-btn gm5-close-btn !h-10 !w-10" aria-label="Tutup AYA" onClick={close}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {settingsOpen ? (
          <div id="aya-chat-settings" className="gm5-pop space-y-3 border-b border-white/10 bg-[#141214] px-4 py-3" role="group" aria-label="Pengaturan suara AYA">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
              <span>
                Suara AYA
                <span className="block text-xs font-normal text-[#cfc9c4]">Bacakan setiap jawaban (teks tetap tampil).</span>
              </span>
              <input type="checkbox" role="switch" className="gm5-switch" checked={sound.enabled} onChange={toggleSound} />
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <span className="w-16 shrink-0">Volume</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={sound.volume}
                disabled={!sound.enabled}
                onChange={(event) => writeAyaSound("customer", { ...sound, volume: Number(event.target.value) })}
                className="gm5-range min-w-0 flex-1"
                aria-valuetext={`${Math.round(sound.volume * 100)} persen`}
              />
              <span className="w-10 text-right font-mono text-xs tabular-nums text-[#cfc9c4]">{Math.round(sound.volume * 100)}%</span>
            </label>
            <button type="button" className="gm5-btn-ghost min-h-11 w-full gap-2 px-3 text-sm" onClick={resetChat}>
              <Trash2 className="size-4" aria-hidden /> Mulai percakapan baru
            </button>
          </div>
        ) : null}

        {/* Percakapan */}
        <div ref={logRef} role="log" aria-live="polite" aria-label="Percakapan dengan AYA" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 md:px-4">
          {firstOnly ? (
            <div className="gm5-aya-hero relative mx-auto -mb-1 h-36 w-36 md:h-40 md:w-40">
              <AyaStage3D presence={shownPresence} className="h-full w-full" />
            </div>
          ) : null}
          {messages.map((message) =>
            message.from === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="gm5-pop max-w-[85%] break-words rounded-2xl rounded-br-md bg-gradient-to-b from-[var(--menu-red-bright)] to-[var(--menu-red)] px-3.5 py-2 text-[15px] leading-snug text-white">
                  {message.text}
                  <span className="ml-2 align-bottom text-[11px] text-white/80">{timeFmt.format(message.at)}</span>
                </p>
              </div>
            ) : (
              <div key={message.id} className="flex items-start gap-2">
                <span className="relative mt-0.5 size-8 shrink-0" aria-hidden>
                  <AyaMascot state={message.retry ? "error" : "idle"} crop="head" role="customer" />
                </span>
                <div className="gm5-pop min-w-0 flex-1 space-y-2">
                  <p className={`w-fit max-w-full break-words rounded-2xl rounded-tl-md border px-3.5 py-2 text-[15px] leading-snug text-[#f6f2ee] ${message.retry ? "border-[#b97a2c] bg-[#1f1a12]" : "border-white/10 bg-[#1a1819]"}`}>
                    {message.text}
                    <span className="ml-2 align-bottom text-[11px] text-[#a7a09b]">{timeFmt.format(message.at)}</span>
                  </p>
                  {message.items?.length ? (
                    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Menu yang disarankan">
                      {message.items.map((item) => (
                        <AyaMenuCard key={item.id} item={item} onAdd={onAdd} onOpen={(menuItem) => { minimize(); onOpenItem(menuItem); }} />
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {message.nav && onNavigate ? (
                      <button type="button" className="gm5-btn-red min-h-11 gap-1.5 px-4 text-sm" onClick={() => navigate(message.nav!)}>
                        <Navigation className="size-4" aria-hidden /> {message.nav.kind === "help" ? message.nav.label : `Buka ${message.nav.label}`}
                      </button>
                    ) : null}
                    {message.action === "guide" && onStartGuide ? (
                      <button type="button" className="gm5-btn-red min-h-11 px-4 text-sm" onClick={() => { minimize(); dispatch({ type: "guide" }); onStartGuide(); }}>
                        Tunjukkan cara pesan <ChevronRight className="size-4" aria-hidden />
                      </button>
                    ) : null}
                    {message.action === "staff" && onStaff && message.nav?.kind !== "help" ? (
                      <button type="button" className="gm5-btn-red min-h-11 px-4 text-sm" onClick={() => { minimize(); onStaff(); }}>
                        {staffLabel} <ChevronRight className="size-4" aria-hidden />
                      </button>
                    ) : null}
                    {message.links?.map((link) => (
                      <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="gm5-btn-ghost min-h-11 gap-1.5 px-4 text-sm">
                        {link.label} <ArrowUpRight className="size-4" aria-hidden />
                      </a>
                    ))}
                    {message.retry ? (
                      <button type="button" className="gm5-btn-ghost min-h-11 gap-1.5 px-4 text-sm" onClick={() => retry(message.retry!)}>
                        <RotateCcw className="size-4" aria-hidden /> Coba lagi
                      </button>
                    ) : null}
                    {sound.enabled && !message.retry && message.id !== 0 ? (
                      <button type="button" className="gm5-mini-link" onClick={() => { stopAyaSpeech(); say(message.text); }} aria-label="Bacakan jawaban ini">
                        <Volume2 className="size-3.5" aria-hidden /> Bacakan
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ),
          )}
          {thinking ? (
            <div className="flex items-center gap-2" role="status" aria-label="AYA sedang mengetik">
              <span className="relative size-8 shrink-0" aria-hidden>
                <AyaMascot state="thinking" crop="head" role="customer" />
              </span>
              <span className="gm5-typing rounded-2xl rounded-tl-md border border-white/10 bg-[#1a1819] px-4 py-3" aria-hidden>
                <i /> <i /> <i />
              </span>
              <span className="text-xs text-[#cfc9c4]">AYA mengetik…</span>
            </div>
          ) : null}

          {firstOnly && lastAya ? (
            <ul className="space-y-2 pt-1" aria-label="Contoh pertanyaan">
              {AYA_SAMPLE_PROMPTS.slice(0, expanded ? 5 : 3).map((prompt) => {
                const Icon = ICONS[prompt.icon];
                return (
                  <li key={prompt.id}>
                    <button type="button" className="gm5-prompt" onClick={() => ask(prompt.query)}>
                      <Icon className="size-5 shrink-0 text-[var(--menu-red-bright)]" aria-hidden />
                      <span className="min-w-0 flex-1 text-left">{prompt.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-[#a7a09b]" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {/* Saran cepat + input */}
        <div className="border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:px-4">
          {voiceNote ? (
            <p className="mb-2 flex items-start gap-2 rounded-xl border border-[#b97a2c] bg-[#1f1a12] px-3 py-2 text-xs leading-snug text-[#ffd79e]" role="status">
              <span className="min-w-0 flex-1">{voiceNote}</span>
              <button type="button" className="shrink-0 cursor-pointer font-bold underline" onClick={() => setVoiceNote("")}>
                Tutup
              </button>
            </p>
          ) : null}
          <p className="mb-1.5 text-xs font-semibold text-[#cfc9c4]">Coba tanyakan:</p>
          <div className="gm5-chip-row -mx-3 mb-2 flex gap-2 overflow-x-auto px-3 pb-1 md:-mx-4 md:px-4" role="list" aria-label="Saran pertanyaan">
            {quick.map((prompt) => {
              const Icon = ICONS[prompt.icon];
              return (
                <span key={prompt.id} role="listitem" className="shrink-0">
                  <button type="button" className="gm5-chip !min-h-10 !px-3.5 !text-[13px]" onClick={() => ask(prompt.query)}>
                    <Icon className="size-4" aria-hidden /> {prompt.label}
                  </button>
                </span>
              );
            })}
          </div>

          {listening ? (
            <div className="mb-2 flex items-center gap-3 rounded-full border border-[color:var(--gm5-line)] bg-[#141214] px-4 py-2" role="status">
              <span className="font-mono text-xs tabular-nums text-[#cfc9c4]">0:{String(Math.min(listenSeconds, 59)).padStart(2, "0")}</span>
              <span className="gm5-wave flex-1" aria-hidden>
                {Array.from({ length: 18 }).map((_, index) => (
                  <i key={index} style={{ animationDelay: `${(index % 6) * 90}ms` }} />
                ))}
              </span>
              <span className="text-xs font-semibold text-[#ffb4b0]">Mendengarkan…</span>
            </div>
          ) : null}

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 200))}
              onFocus={() => dispatch({ type: "wake" })}
              maxLength={200}
              enterKeyHint="send"
              autoComplete="off"
              name="tanya-aya"
              aria-label="Tanya AYA"
              placeholder="Tanya AYA soal menu…"
              className="h-12 min-w-0 flex-1 rounded-full border border-white/15 bg-[#141214] px-4 text-base text-white outline-none placeholder:text-[#8f8984] hover:border-white/25 focus:border-[var(--menu-red)]"
            />
            {micSupported ? (
              <button
                type="button"
                onClick={toggleMic}
                className={`gm5-icon-btn !h-12 !w-12 shrink-0 border border-white/15 ${listening ? "gm5-mic-active" : ""}`}
                aria-pressed={listening}
                aria-label={listening ? "Berhenti merekam" : "Tanya dengan suara"}
              >
                {listening ? <Square className="size-4" fill="currentColor" aria-hidden /> : <Mic className="size-5" aria-hidden />}
              </button>
            ) : null}
            <button type="submit" className="gm5-btn-red !h-12 !w-12 shrink-0 !p-0" aria-label="Kirim pertanyaan" disabled={!input.trim() || thinking}>
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function AyaMenuCard({ item, onAdd, onOpen }: { item: MenuItem; onAdd: (itemId: string, variantId: string, delta: number) => void; onOpen: (item: MenuItem) => void }) {
  const price = cardPrice(item);
  const single = item.variants.length === 1 ? item.variants[0] : null;
  const detail = item.description?.trim() || (item.section && item.section !== item.category ? item.section : item.category);
  return (
    <li className="w-[136px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#161416]">
      <button type="button" className="block w-full cursor-pointer text-left" onClick={() => onOpen(item)} aria-label={`Lihat detail ${item.name}`}>
        <span className="block aspect-[4/3] overflow-hidden">
          <MenuPhoto item={item} hideLabel iconClassName="size-7" />
        </span>
        <span className="block px-2.5 pt-2">
          <span className="block truncate text-sm font-bold text-white">{item.name}</span>
          <span className="block truncate text-xs text-[#cfc9c4]">{detail}</span>
        </span>
      </button>
      <span className="flex items-end justify-between gap-1 px-2.5 pb-2.5 pt-1">
        <span className="min-w-0 font-mono text-[13px] font-bold tabular-nums text-white">
          {price.from ? <span className="block font-sans text-[11px] font-normal leading-none text-[#cfc9c4]">mulai</span> : null}
          {rupiah.format(price.price)}
        </span>
        <button
          type="button"
          className="gm5-step gm5-step-plus"
          aria-label={single ? `Tambah ${item.name}` : `Pilih varian ${item.name}`}
          onClick={() => (single ? onAdd(item.id, single.id, 1) : onOpen(item))}
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden />
        </button>
      </span>
    </li>
  );
}
