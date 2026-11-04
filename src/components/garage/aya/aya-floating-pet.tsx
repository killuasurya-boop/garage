"use client";

// Aya melayang (keputusan Owner D-07): pet kecil yang bisa diseret ke mana saja di layar,
// sesekali terbang sendiri ke tempat lain, joget saat diketuk, dan membuka balon sapaan.
// Posisi diingat per perangkat (localStorage); "Sembunyikan" berlaku per sesi.
// prefers-reduced-motion: tidak terbang sendiri dan tanpa animasi — tetap bisa diseret & diketuk.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { AyaCharacter, type AyaExpression, type AyaPose } from "@/components/garage/aya/aya-character";
import type { AyaEffect } from "@/components/garage/aya/aya-mascot";
import { AyaSoundToggle } from "@/components/garage/aya/aya-sound-toggle";
import { nextAyaLine, type AyaLineCategory } from "@/lib/aya-lines";
import { getAyaSpeaking, playAyaSfx, speakAya, subscribeAyaSpeaking, type AyaSfx } from "@/lib/aya-sound";
import { AYA_NAME } from "@/lib/garage-ai-persona";

/** Event global agar layar lain bisa meminta Aya berceletuk (mis. panduan selesai). */
export const AYA_CHIRP_EVENT = "garage:aya-chirp";
export function requestAyaChirp(category: AyaLineCategory) {
  window.dispatchEvent(new CustomEvent(AYA_CHIRP_EVENT, { detail: { category } }));
}

/** Celetukan spontan paling sering sekali per 2 menit. */
const AMBIENT_GAP_MS = 120_000;

/** Lama caption tampil: cukup untuk dibaca (±70 ms per huruf, minimal 3,5 dtk). */
export function captionDurationMs(text: string) {
  return Math.max(3500, Math.min(9000, text.length * 70));
}

const PET_SIZE = 72;
const EDGE = 8;
const DRAG_THRESHOLD = 6;
/** Dilepas saat diseret lebih cepat dari ini (px/ms) → Aya pusing sebentar. */
export const DIZZY_SPEED = 1.6;

/** Kecepatan seret terhalus (px/ms) — rata-rata bergerak agar satu sentakan tidak langsung "pusing". */
export function nextDragSpeed(previous: number, distancePx: number, elapsedMs: number) {
  if (elapsedMs <= 0) return previous;
  return previous * 0.6 + (distancePx / elapsedMs) * 0.4;
}

type Point = { x: number; y: number };

function readJson<T>(storage: "local" | "session", key: string): T | null {
  try {
    const raw = (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: "local" | "session", key: string, value: unknown) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan diblokir: posisi hanya bertahan di halaman ini.
  }
}

/** Jepit posisi agar Aya selalu terlihat utuh di layar. */
export function clampPetPosition(point: Point, viewport: { width: number; height: number }, size = PET_SIZE): Point {
  return {
    x: Math.min(Math.max(EDGE, point.x), Math.max(EDGE, viewport.width - size - EDGE)),
    y: Math.min(Math.max(EDGE, point.y), Math.max(EDGE, viewport.height - size - EDGE)),
  };
}

export type AyaGait = "fly" | "walk" | "run";

/** Kecepatan menapak (px/detik): jalan santai vs lari ceria. */
export const WALK_SPEED = 150;
export const RUN_SPEED = 380;

/**
 * Jalan-jalan sendiri (Owner, Nov 2026: "berjalan ceria, lari sana-sini"): Aya menapak di jalurnya
 * sendiri (tinggi sama), jadi tidak melintasi isi halaman ke atas/bawah. Jarak jauh = berlari.
 */
export function pickWalkTarget(
  current: Point,
  viewport: { width: number; height: number },
  random = Math.random,
  size = PET_SIZE,
): { target: Point; gait: "walk" | "run"; seconds: number } {
  const minX = EDGE;
  const maxX = Math.max(EDGE, viewport.width - size - EDGE);
  const span = maxX - minX;
  let x = minX + random() * span;
  // Selalu benar-benar berpindah (minimal ~1/4 lebar jalur) supaya langkahnya terlihat.
  const minStep = Math.min(span, Math.max(60, span * 0.25));
  if (Math.abs(x - current.x) < minStep) x = current.x + (current.x - minX > span / 2 ? -minStep : minStep);
  const target = clampPetPosition({ x, y: current.y }, viewport, size);
  const distance = Math.abs(target.x - current.x);
  const gait = distance > Math.max(220, viewport.width * 0.45) ? "run" : "walk";
  const seconds = Math.min(3.2, Math.max(0.7, distance / (gait === "run" ? RUN_SPEED : WALK_SPEED)));
  return { target, gait, seconds: Math.round(seconds * 100) / 100 };
}

/** Pelanggan sedang memakai halaman (menggulir/mengetik/membuka dialog) → Aya jangan berkeliaran. */
export const BUSY_PAUSE_MS = 6_000;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AyaFloatingPet({
  scope,
  greetingOnce = true,
  roam = true,
  corner = "bottom-right",
  mood,
  openSignal = 0,
  guide = null,
  onGuideExit,
  laneBottom,
  children,
}: {
  /** Jalur aman (Menu V5): Aya selalu menapak di garis ini, `laneBottom` px dari bawah layar (mis. di atas navigasi bawah). */
  laneBottom?: number;
  /** Panduan aktif: Aya terbang ke titik ini, menunjuk (state guiding), balon tetap terbuka. */
  guide?: { x: number; y: number; faceLeft: boolean; bubble?: "above" | "below" } | null;
  /** Dipanggil bila customer menutup balon/menyeret Aya saat panduan berjalan. */
  onGuideExit?: () => void;
  /** Kunci penyimpanan per layar, mis. "order" / "staff". */
  scope: string;
  /** Buka balon otomatis sekali per sesi (sambutan). */
  greetingOnce?: boolean;
  /** Terbang sendiri sesekali (matikan di layar kasir agar tidak menutupi tombol). */
  roam?: boolean;
  /** Posisi awal sebelum pengguna memindahkan Aya. */
  corner?: "bottom-right" | "bottom-left";
  /** Ekspresi istirahat mengikuti keadaan (mis. siaga saat ada antrean telat). */
  mood?: AyaExpression;
  /** Naikkan angkanya untuk membuka balon dari luar (mis. peringatan baru). */
  openSignal?: number;
  /** Isi balon; `close` menutup balon, `hide` menyembunyikan Aya untuk sesi ini. */
  children: (api: { close: () => void; hide: () => void }) => ReactNode;
}) {
  const posKey = `garage:aya-pos:${scope}`;
  const hiddenKey = `garage:aya-hidden:${scope}`;
  const greetedKey = `garage:aya-greeted:${scope}`;

  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [open, setOpen] = useState(false);
  const [pose, setPose] = useState<AyaPose>("idle");
  const [expression, setExpression] = useState<AyaExpression>("default");
  const [effect, setEffect] = useState<AyaEffect | null>(null);
  const [landing, setLanding] = useState(false);
  const [gait, setGait] = useState<AyaGait>("fly");
  const [travel, setTravel] = useState(1.7);
  const [caption, setCaption] = useState<string | null>(null);
  const audience = scope === "order" ? "customer" : "staff";
  const talking = useSyncExternalStore(subscribeAyaSpeaking, getAyaSpeaking, () => false);
  const captionTimer = useRef(0);
  const lastAmbient = useRef(0);
  const guideRef = useRef(guide);
  const guiding = guide !== null;

  const sfx = useCallback((name: AyaSfx) => playAyaSfx(name, audience), [audience]);
  /** Aya berceletuk: caption selalu tampil, suara bila diizinkan (OD-04). */
  const chirp = useCallback(
    (category: AyaLineCategory) => {
      const line = nextAyaLine(category);
      setCaption(line);
      window.clearTimeout(captionTimer.current);
      captionTimer.current = window.setTimeout(() => setCaption(null), captionDurationMs(line));
      speakAya(line, audience);
    },
    [audience],
  );
  useEffect(() => () => window.clearTimeout(captionTimer.current), []);
  useEffect(() => {
    const onChirp = (event: Event) => {
      const category = (event as CustomEvent<{ category?: AyaLineCategory }>).detail?.category;
      if (category) chirp(category);
    };
    window.addEventListener(AYA_CHIRP_EVENT, onChirp);
    return () => window.removeEventListener(AYA_CHIRP_EVENT, onChirp);
  }, [chirp]);
  const guideKey = guide ? `${Math.round(guide.x)},${Math.round(guide.y)},${guide.faceLeft}` : "";
  // Customer menutup/menyeret Aya di tengah panduan → panduan berhenti.
  const exitGuide = useCallback(() => {
    if (guiding) onGuideExit?.();
  }, [guiding, onGuideExit]);

  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean; lastX: number; lastY: number; lastT: number; speed: number } | null>(null);
  const lastActive = useRef(0);
  const lastBusy = useRef(0);
  const gaitRef = useRef<AyaGait>("fly");
  const posRef = useRef(pos);
  const settleRef = useRef<() => void>(() => {});
  const rest = mood ?? "default";
  const restRef = useRef<AyaExpression>(rest);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  // Muat posisi/status setelah mount (SSR tidak tahu ukuran layar & storage).
  useEffect(() => {
    const vp = viewport();
    const saved = readJson<Point>("local", posKey);
    const fallback = { x: corner === "bottom-left" ? 16 : vp.width - PET_SIZE - 16, y: vp.height - PET_SIZE - 170 };
    const base = clampPetPosition(saved ?? fallback, vp);
    const start = laneBottom == null ? base : clampPetPosition({ x: base.x, y: vp.height - PET_SIZE - laneBottom }, vp);
    lastActive.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inisialisasi dari window/storage
    setPos(start);
    setHidden(readJson<boolean>("session", hiddenKey) === true);
    setReady(true);
    if (greetingOnce && !readJson<boolean>("session", greetedKey)) {
      writeJson("session", greetedKey, true);
      const timer = window.setTimeout(() => {
        setOpen(true);
        setPose("wave");
        setExpression("happy");
        playAyaSfx("pop", scope === "order" ? "customer" : "staff"); // diam bila belum ada sentuhan
      }, 900);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jalur dibaca sekali saat mount; perubahan diurus efek di bawah
  }, [posKey, hiddenKey, greetedKey, greetingOnce, corner, scope]);

  // Jalur aman ikut ukuran layar (rotasi, keyboard, ganti breakpoint).
  useEffect(() => {
    if (laneBottom == null || !ready) return;
    const snap = () => {
      if (drag.current) return;
      const vp = viewport();
      setPos((current) => clampPetPosition({ x: current.x, y: vp.height - PET_SIZE - laneBottom }, vp));
    };
    snap();
    window.addEventListener("resize", snap);
    return () => window.removeEventListener("resize", snap);
  }, [laneBottom, ready]);

  // Ekspresi istirahat ikut keadaan bila Aya sedang diam.
  useEffect(() => {
    restRef.current = rest;
    if (!drag.current) {
      setExpression((current) => (current === "sleepy" && rest === "happy" ? current : rest));
    }
  }, [rest]);

  // Dibuka dari luar (peringatan baru).
  useEffect(() => {
    if (!openSignal) return;
    lastActive.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reaksi terhadap sinyal dari pemanggil
    setOpen(true);
    setPose("wave");
    sfx("pop");
    const timer = window.setTimeout(() => setPose("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [openSignal, sfx]);

  // Tetap di dalam layar saat ukuran berubah (rotasi tablet, keyboard HP).
  useEffect(() => {
    const onResize = () => setPos((current) => clampPetPosition(current, viewport()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const flyTo = useCallback((target: Point) => {
    gaitRef.current = "fly";
    setGait("fly");
    setTravel(1.7);
    setFacingLeft(target.x < posRef.current.x);
    setMoving(true);
    setPose("fly");
    setExpression("happy");
    setPos(target);
    posRef.current = target;
    sfx("whoosh");
    // Mendarat setelah transisi CSS (1,7 dtk); timer, bukan transitionend, agar tidak macet bila jaraknya 0.
    window.setTimeout(() => settleRef.current(), 1750);
  }, [sfx]);

  /** Menapak ke kiri/kanan di jalurnya sendiri; jarak jauh = berlari. Tanpa suara (tidak berisik). */
  const walkTo = useCallback((next: { target: Point; gait: "walk" | "run"; seconds: number }) => {
    gaitRef.current = next.gait;
    setGait(next.gait);
    setTravel(next.seconds);
    setFacingLeft(next.target.x < posRef.current.x);
    setMoving(true);
    setPose(next.gait);
    setExpression(next.gait === "run" ? "happy" : restRef.current);
    setPos(next.target);
    posRef.current = next.target;
    window.setTimeout(() => settleRef.current(), next.seconds * 1000 + 60);
  }, []);

  // Pelanggan sedang menggulir/mengetik → tandai sibuk (Aya menunggu, tidak berkeliaran).
  useEffect(() => {
    const busy = () => {
      lastBusy.current = Date.now();
    };
    window.addEventListener("scroll", busy, { passive: true });
    window.addEventListener("keydown", busy);
    window.addEventListener("input", busy, true);
    return () => {
      window.removeEventListener("scroll", busy);
      window.removeEventListener("keydown", busy);
      window.removeEventListener("input", busy, true);
    };
  }, []);

  // Panduan: terbang ke samping tombol yang dibahas lalu menunjuk; selesai → kembali santai.
  useEffect(() => {
    guideRef.current = guide;
  });
  const prevGuideKey = useRef("");
  useEffect(() => {
    const was = prevGuideKey.current;
    prevGuideKey.current = guideKey;
    if (!ready) return;
    const target = guideRef.current;
    if (!target) {
      if (was) {
        setPose("idle");
        setExpression(restRef.current);
      }
      return;
    }
    lastActive.current = Date.now();
    setOpen(true);
    const spot = clampPetPosition({ x: target.x, y: target.y }, viewport());
    if (prefersReducedMotion()) {
      setPos(spot);
      posRef.current = spot;
      setFacingLeft(target.faceLeft);
      setPose("idle");
      setExpression("centil");
      sfx("point"); // suara bukan gerak: tetap berbunyi saat reduced-motion
      return;
    }
    flyTo(spot);
  }, [ready, guideKey, flyTo, sfx]);

  // Jalan-jalan sendiri (pelanggan 9–18 dtk, staf 18–35 dtk) bila dibiarkan; mengantuk setelah 2 menit tanpa sentuhan.
  // Tidak berkeliaran saat pelanggan menggulir/mengetik atau ada dialog terbuka (mis. Quick View).
  useEffect(() => {
    if (!ready || hidden || guiding || prefersReducedMotion()) return;
    // Tanpa roam Aya tetap bisa mengantuk, tapi tidak pindah tempat sendiri.
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible" && !open && !drag.current) {
          if (Date.now() - lastActive.current > 120_000) {
            setPose("idle");
            setExpression("sleepy");
          } else if (roam && Date.now() - lastBusy.current > BUSY_PAUSE_MS && !document.querySelector('[role="dialog"], [aria-modal="true"]')) {
            walkTo(pickWalkTarget(posRef.current, viewport()));
          }
        }
        schedule();
      }, audience === "customer" ? 9_000 + Math.random() * 9_000 : 18_000 + Math.random() * 17_000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [ready, hidden, open, walkTo, roam, guiding, audience]);

  /** Efek lucu sesaat (hati, pusing, …) lalu hilang sendiri. */
  function flash(next: AyaEffect, ms: number) {
    setEffect(next);
    window.setTimeout(() => setEffect((current) => (current === next ? null : current)), ms);
  }

  function settle() {
    if (drag.current) return;
    setMoving(false);
    const flew = gaitRef.current === "fly";
    // Mendarat: squash & stretch sekali (hanya setelah terbang; jalan/lari langsung berhenti).
    if (flew) {
      setLanding(true);
      window.setTimeout(() => setLanding(false), 450);
    }
    const guideNow = guideRef.current;
    if (guideNow) {
      // Mendarat di samping tombol: hadap ke tombol & menunjuk.
      setFacingLeft(guideNow.faceLeft);
      setPose("idle");
      setExpression("centil");
      sfx("point");
      return;
    }
    if (flew) sfx("boing");
    // Sesekali berceletuk (bijak/lucu untuk pelanggan, semangat untuk staf) — jarang, tidak saat balon terbuka.
    if (!open && Date.now() - lastAmbient.current > AMBIENT_GAP_MS && Math.random() < 0.4) {
      lastAmbient.current = Date.now();
      chirp(audience === "customer" ? (Math.random() < 0.5 ? "wisdom" : "joke") : "staffCheer");
    }
    // Sesekali joget setelah mendarat.
    if (Math.random() < 0.35) {
      setPose("dance");
      setExpression("happy");
      window.setTimeout(() => {
        if (guideRef.current) return;
        setPose("idle");
        setExpression(restRef.current);
      }, 2100);
    } else {
      setPose("idle");
      setExpression(restRef.current === "default" && Math.random() < 0.3 ? "centil" : restRef.current);
    }
  }

  useEffect(() => {
    settleRef.current = settle;
  });

  function savePos(point: Point) {
    writeJson("local", posKey, point);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX, startY: event.clientY, originX: posRef.current.x, originY: posRef.current.y, moved: false,
      lastX: event.clientX, lastY: event.clientY, lastT: event.timeStamp, speed: 0,
    };
    setMoving(false);
    lastActive.current = Date.now();
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      setDragging(true);
      exitGuide();
      setOpen(false);
      gaitRef.current = "fly"; // dilepas → mendarat (squash) seperti setelah terbang
      setGait("fly");
      setTravel(1.7);
      setPose("fly");
      setExpression("surprised");
    }
    state.speed = nextDragSpeed(state.speed, Math.hypot(event.clientX - state.lastX, event.clientY - state.lastY), event.timeStamp - state.lastT);
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    setFacingLeft(dx < 0);
    const next = clampPetPosition({ x: state.originX + dx, y: state.originY + dy }, viewport());
    posRef.current = next;
    setPos(next);
  }

  function onPointerUp() {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved) {
      setDragging(false);
      savePos(posRef.current);
      if (state.speed > DIZZY_SPEED && !prefersReducedMotion()) {
        // Dilempar kencang → pusing sebentar, baru tenang lagi.
        setPose("idle");
        setExpression("grumpy");
        flash("dizzy", 2700);
        sfx("oops");
        chirp("dizzy");
        window.setTimeout(() => settleRef.current(), 2700);
        return;
      }
      settle();
      return;
    }
    // Ketuk = buka/tutup balon + reaksi (hati kecil); membuka balon → Aya menyapa singkat.
    if (open) exitGuide();
    setOpen((current) => !current);
    setPose("wave");
    setExpression("happy");
    flash("hearts", 1500);
    sfx(open ? "tap" : "pop");
    if (!open && !guiding) chirp("tapped");
    window.setTimeout(() => setPose("idle"), 1800);
  }

  // Keyboard: Enter/Spasi buka balon, panah memindahkan Aya.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 48 : 16;
    const delta: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      const next = clampPetPosition({ x: posRef.current.x + move.x, y: posRef.current.y + move.y }, viewport());
      posRef.current = next;
      setPos(next);
      savePos(next);
    } else if (event.key === "Escape") {
      exitGuide();
      setOpen(false);
    }
  }

  const close = useCallback(() => {
    exitGuide();
    setOpen(false);
    setPose("idle");
    setExpression(rest);
  }, [rest, exitGuide]);
  const hide = useCallback(() => {
    exitGuide();
    setOpen(false);
    setHidden(true);
    writeJson("session", hiddenKey, true);
  }, [hiddenKey, exitGuide]);

  if (!ready || hidden) return null;

  // Balon di sisi yang lebih lapang, dijepit agar tidak keluar layar.
  const vp = viewport();
  const bubbleWidth = Math.min(300, vp.width - 24);
  const bubbleX = Math.min(Math.max(12, pos.x + PET_SIZE / 2 - bubbleWidth / 2), vp.width - bubbleWidth - 12) - pos.x;
  // Saat memandu, balon menjauhi tombol yang ditunjuk (dihitung petSpotBeside).
  const bubbleAbove = guide?.bubble ? guide.bubble === "above" : pos.y > vp.height / 2;

  return (
    <div
      className={`aya-pet ${facingLeft ? "aya-pet-facing-left" : ""}`}
      data-moving={moving && !dragging ? "true" : "false"}
      data-gait={gait}
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, ["--aya-travel" as string]: `${travel}s` }}
    >
      <button
        type="button"
        className="aya-pet-button"
        style={{ width: PET_SIZE, height: PET_SIZE }}
        aria-label={open ? `Tutup sapaan ${AYA_NAME}` : `${AYA_NAME}, AI pet Garage — ketuk untuk bantuan, seret untuk memindahkan`}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // Klik dari keyboard (Enter/Spasi) tidak melewati pointer events.
          if (event.detail === 0) setOpen((current) => !current);
        }}
      >
        <AyaCharacter expression={expression} pose={pose} effect={effect} landing={landing} talking={talking} look={guiding ? "right" : "center"} role={audience} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={`Sapaan ${AYA_NAME}`}
          className="aya-bubble"
          style={{
            left: bubbleX,
            width: bubbleWidth,
            ...(bubbleAbove ? { bottom: PET_SIZE + 6 } : { top: PET_SIZE + 6 }),
          }}
        >
          {caption ? (
            <p className="aya-caption mb-2 rounded-md bg-garage-bg-3 px-2.5 py-1.5 text-[13px] italic leading-snug text-white" role="status">
              {caption}
            </p>
          ) : null}
          {children({ close, hide })}
          <div className="mt-2 flex justify-end border-t border-garage-line pt-1.5">
            <AyaSoundToggle audience={audience} />
          </div>
        </div>
      ) : caption ? (
        // Balon kecil celetukan saat balon utama tertutup.
        <p
          className="aya-bubble aya-caption-chip text-[13px] italic leading-snug"
          role="status"
          style={{
            left: Math.min(Math.max(12, pos.x + PET_SIZE / 2 - Math.min(240, vp.width - 24) / 2), vp.width - Math.min(240, vp.width - 24) - 12) - pos.x,
            width: Math.min(240, vp.width - 24),
            padding: "8px 10px",
            ...(pos.y > vp.height / 2 ? { bottom: PET_SIZE + 6 } : { top: PET_SIZE + 6 }),
          }}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}
