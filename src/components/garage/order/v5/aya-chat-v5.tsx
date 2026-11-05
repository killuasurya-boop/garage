"use client";

// Panel chat AYA Assistant (Menu V5 F4, papan 04 §1/§4/§5/§6/§7).
// Jawaban dari aya-menu-assistant.ts (aturan atas data menu, tanpa AI). Mic memakai
// pengenalan suara bawaan browser bila ada; balasan dibacakan lewat speakAya bila
// Suara AYA nyala. Di HP = sheet bawah, di desktop = panel kanan.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bean, ChevronRight, CupSoda, Heart, LayoutGrid, Mic, Plus, SendHorizontal, Snowflake, Square, Star, Tag, UtensilsCrossed, Volume2, VolumeX, X } from "lucide-react";

import { AyaMascot, type AyaState } from "@/components/garage/aya/aya-mascot";
import { useAyaSound } from "@/components/garage/aya/aya-sound-toggle";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { getAyaSpeaking, playAyaSfx, speakAya, stopAyaSpeech, subscribeAyaSpeaking, writeAyaSound } from "@/lib/aya-sound";
import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";
import { rupiah } from "../order-ui";
import { AYA_SAMPLE_PROMPTS, AYA_WELCOME, answerAya, ayaQuickPrompts, type AyaAction, type AyaPromptIcon } from "./aya-menu-assistant";
import { cardPrice } from "./menu-v5-model";

type ChatMessage = { id: number; from: "aya" | "user"; text: string; items?: MenuItem[]; action?: AyaAction; at: Date };

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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
};

const STATUS_TEXT: Partial<Record<AyaState, string>> = {
  listening: "Mendengarkan…",
  thinking: "Sedang memproses…",
  speaking: "Sedang bicara…",
  success: "Siap! Semoga cocok",
};

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

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
}) {
  const ctx = useMemo(() => ({ items, bestSellerIds }), [items, bestSellerIds]);
  const quick = useMemo(() => ayaQuickPrompts(ctx), [ctx]);
  const sound = useAyaSound("customer");
  const speaking = useSyncExternalStore(subscribeAyaSpeaking, getAyaSpeaking, () => false);
  // Sapaan pembuka = pesan pertama (isi panel hanya dirender saat terbuka).
  const [messages, setMessages] = useState<ChatMessage[]>(() => [{ id: 0, from: "aya", text: AYA_WELCOME, at: new Date() }]);
  const [state, setState] = useState<AyaState>("idle");
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [listenSeconds, setListenSeconds] = useState(0);
  const [micSupported, setMicSupported] = useState(false);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const recognition = useRef<RecognitionLike | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Fitur browser dibaca setelah mount (SSR tidak tahu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMicSupported(Boolean(recognitionCtor()));
  }, []);


  const stopListening = useCallback(() => {
    recognition.current?.abort();
    recognition.current = null;
    setListening(false);
  }, []);

  // Semua jalur tutup lewat sini → hentikan bicara, mic dan timer, AYA kembali diam.
  const close = useCallback(() => {
    stopAyaSpeech();
    stopListening();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setState("idle");
    onOpenChange(false);
  }, [onOpenChange, stopListening]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  // Gulir ke pesan terbaru.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [messages, state]);

  // Penghitung waktu rekaman (papan 04 §5: 0:00 … 0:05).
  useEffect(() => {
    if (!listening) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mulai hitung dari 0 setiap rekaman baru
    setListenSeconds(0);
    const timer = window.setInterval(() => setListenSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [listening]);

  const shownState: AyaState = listening ? "listening" : speaking ? "speaking" : state;

  const ask = useCallback(
    (raw: string) => {
      const query = raw.trim().slice(0, 200);
      if (!query) return;
      stopAyaSpeech();
      setInput("");
      setMessages((list) => [...list, { id: ++seq.current, from: "user", text: query, at: new Date() }]);
      setState("thinking");
      const timer = window.setTimeout(() => {
        const answer = answerAya(query, ctx);
        setMessages((list) => [...list, { id: ++seq.current, from: "aya", text: answer.text, items: answer.items, action: answer.action, at: new Date() }]);
        playAyaSfx(answer.empty ? "boing" : "pop", "customer");
        speakAya(answer.text, "customer");
        setState(answer.empty ? "idle" : "success");
        timers.current.push(window.setTimeout(() => setState("idle"), 1600));
      }, reducedMotion() ? 200 : 550);
      timers.current.push(timer);
    },
    [ctx],
  );

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    stopAyaSpeech();
    const rec = new Ctor();
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (event) => {
      const parts = Array.from(event.results);
      const text = parts.map((result) => result[0]?.transcript ?? "").join(" ").trim();
      setInput(text);
      if (parts.at(-1)?.isFinal) finalText = text;
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      if (finalText) ask(finalText);
    };
    rec.onerror = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recognition.current = null;
    }
  }

  const lastAya = [...messages].reverse().find((message) => message.from === "aya");
  const firstOnly = messages.length <= 1;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // Jangan munculkan keyboard HP otomatis; fokus ke panel.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
        className="gm5 inset-x-0 bottom-0 z-[96] mx-auto flex h-[88svh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-t-[20px] border border-[color:var(--gm5-line)] bg-[#0e0e0e] p-0 text-white lg:!left-auto lg:!right-4 lg:!top-4 lg:!bottom-4 lg:!h-auto lg:!w-[480px] lg:rounded-[20px]"
      >
        {/* Header: avatar + nama + status, suara, tutup */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="relative size-12 shrink-0" aria-hidden>
            <AyaMascot state={shownState} crop="head" role="customer" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="gm5-title text-lg leading-tight text-white">AYA Assistant</SheetTitle>
            <p className="flex items-center gap-1.5 text-sm text-[#cfc9c4]" aria-live="polite">
              <span className={`size-2 rounded-full ${shownState === "idle" ? "bg-[#4ade80]" : "bg-[var(--menu-red-bright)]"}`} aria-hidden />
              {STATUS_TEXT[shownState] ?? "Siap membantu"}
            </p>
            <SheetDescription className="sr-only">Tanya AYA tentang menu, rekomendasi, atau cara pesan.</SheetDescription>
          </div>
          <button
            type="button"
            className="gm5-icon-btn !h-11 !w-11"
            aria-pressed={sound.enabled}
            aria-label={sound.enabled ? "Matikan suara AYA" : "Nyalakan suara AYA"}
            onClick={() => {
              if (sound.enabled) stopAyaSpeech();
              writeAyaSound("customer", { ...sound, enabled: !sound.enabled });
            }}
          >
            {sound.enabled ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          </button>
          <button type="button" className="gm5-icon-btn !h-11 !w-11" aria-label="Tutup AYA" onClick={close}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Percakapan */}
        <div ref={logRef} role="log" aria-live="polite" aria-label="Percakapan dengan AYA" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          {messages.map((message) =>
            message.from === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="gm5-pop max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-b from-[var(--menu-red-bright)] to-[var(--menu-red)] px-3.5 py-2 text-[15px] leading-snug text-white">
                  {message.text}
                  <span className="ml-2 align-bottom text-[11px] text-white/75">{timeFmt.format(message.at)}</span>
                </p>
              </div>
            ) : (
              <div key={message.id} className="flex items-start gap-2">
                <span className="relative mt-0.5 size-8 shrink-0" aria-hidden>
                  <AyaMascot state="idle" crop="head" role="customer" />
                </span>
                <div className="gm5-pop min-w-0 flex-1 space-y-2">
                  <p className="w-fit max-w-full rounded-2xl rounded-tl-md border border-white/10 bg-[#1a1819] px-3.5 py-2 text-[15px] leading-snug text-[#f6f2ee]">
                    {message.text}
                    <span className="ml-2 align-bottom text-[11px] text-[#a7a09b]">{timeFmt.format(message.at)}</span>
                  </p>
                  {message.items?.length ? (
                    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Menu yang disarankan">
                      {message.items.map((item) => (
                        <AyaMenuCard key={item.id} item={item} onAdd={onAdd} onOpen={(menuItem) => { close(); onOpenItem(menuItem); }} />
                      ))}
                    </ul>
                  ) : null}
                  {message.action === "guide" && onStartGuide ? (
                    <button type="button" className="gm5-btn-red min-h-11 px-4 text-sm" onClick={() => { close(); onStartGuide(); }}>
                      Tunjukkan cara pesan <ChevronRight className="size-4" aria-hidden />
                    </button>
                  ) : null}
                  {message.action === "staff" && onStaff ? (
                    <button type="button" className="gm5-btn-red min-h-11 px-4 text-sm" onClick={() => { close(); onStaff(); }}>
                      {staffLabel} <ChevronRight className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {state === "thinking" ? (
            <div className="flex items-center gap-2" aria-label="AYA sedang memproses">
              <span className="relative size-8 shrink-0" aria-hidden>
                <AyaMascot state="thinking" crop="head" role="customer" />
              </span>
              <span className="gm5-typing rounded-2xl rounded-tl-md border border-white/10 bg-[#1a1819] px-4 py-3" aria-hidden>
                <i /> <i /> <i />
              </span>
            </div>
          ) : null}

          {firstOnly && lastAya ? (
            <ul className="space-y-2 pt-1" aria-label="Contoh pertanyaan">
              {AYA_SAMPLE_PROMPTS.map((prompt) => {
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
        <div className="border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <p className="mb-1.5 text-xs font-semibold text-[#cfc9c4]">Coba tanyakan:</p>
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
            {quick.map((prompt) => {
              const Icon = ICONS[prompt.icon];
              return (
                <button key={prompt.id} type="button" className="gm5-chip shrink-0" onClick={() => ask(prompt.query)}>
                  <Icon className="size-4" aria-hidden /> {prompt.label}
                </button>
              );
            })}
            <button type="button" className="gm5-chip shrink-0" onClick={() => ask("Cara pesan gimana?")}>
              <LayoutGrid className="size-4" aria-hidden /> Cara pesan
            </button>
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
                className={`gm5-icon-btn !h-12 !w-12 shrink-0 ${listening ? "gm5-mic-active" : ""}`}
                aria-pressed={listening}
                aria-label={listening ? "Berhenti merekam" : "Tanya dengan suara"}
              >
                {listening ? <Square className="size-4" fill="currentColor" aria-hidden /> : <Mic className="size-5" aria-hidden />}
              </button>
            ) : null}
            <button type="submit" className="gm5-btn-red !h-12 !w-12 shrink-0 !p-0" aria-label="Kirim pertanyaan" disabled={!input.trim()}>
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AyaMenuCard({ item, onAdd, onOpen }: { item: MenuItem; onAdd: (itemId: string, variantId: string, delta: number) => void; onOpen: (item: MenuItem) => void }) {
  const price = cardPrice(item);
  const single = item.variants.length === 1 ? item.variants[0] : null;
  const detail = item.description?.trim() || (item.section && item.section !== item.category ? item.section : item.category);
  return (
    <li className="w-[132px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#161416]">
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
