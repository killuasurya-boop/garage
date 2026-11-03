"use client";

// Aya melayang (keputusan Owner D-07): pet kecil yang bisa diseret ke mana saja di layar,
// sesekali terbang sendiri ke tempat lain, joget saat diketuk, dan membuka balon sapaan.
// Posisi diingat per perangkat (localStorage); "Sembunyikan" berlaku per sesi.
// prefers-reduced-motion: tidak terbang sendiri dan tanpa animasi — tetap bisa diseret & diketuk.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { AyaCharacter, type AyaExpression, type AyaPose } from "@/components/garage/aya/aya-character";
import { AYA_NAME } from "@/lib/garage-ai-persona";

const PET_SIZE = 72;
const EDGE = 8;
const DRAG_THRESHOLD = 6;

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

/** Tujuan terbang acak: hindari 72 px teratas (header) & 140 px terbawah (bar keranjang/aksi). */
export function pickRoamTarget(viewport: { width: number; height: number }, random = Math.random, size = PET_SIZE): Point {
  const minY = 72;
  const maxY = Math.max(minY, viewport.height - size - 140);
  return clampPetPosition(
    { x: EDGE + random() * Math.max(0, viewport.width - size - EDGE * 2), y: minY + random() * (maxY - minY) },
    viewport,
    size,
  );
}

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
  children,
}: {
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

  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const lastActive = useRef(0);
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
    const start = clampPetPosition(saved ?? fallback, vp);
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
      }, 900);
      return () => window.clearTimeout(timer);
    }
  }, [posKey, hiddenKey, greetedKey, greetingOnce, corner]);

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
    const timer = window.setTimeout(() => setPose("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [openSignal]);

  // Tetap di dalam layar saat ukuran berubah (rotasi tablet, keyboard HP).
  useEffect(() => {
    const onResize = () => setPos((current) => clampPetPosition(current, viewport()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const flyTo = useCallback((target: Point) => {
    setFacingLeft(target.x < posRef.current.x);
    setMoving(true);
    setPose("fly");
    setExpression("happy");
    setPos(target);
    posRef.current = target;
    // Mendarat setelah transisi CSS (1,7 dtk); timer, bukan transitionend, agar tidak macet bila jaraknya 0.
    window.setTimeout(() => settleRef.current(), 1750);
  }, []);

  // Terbang sendiri tiap 18–35 detik bila dibiarkan; mengantuk setelah 2 menit tanpa sentuhan.
  useEffect(() => {
    if (!ready || hidden || prefersReducedMotion()) return;
    // Tanpa roam Aya tetap bisa mengantuk, tapi tidak pindah tempat sendiri.
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible" && !open && !drag.current) {
          if (Date.now() - lastActive.current > 120_000) {
            setPose("idle");
            setExpression("sleepy");
          } else if (roam) {
            flyTo(pickRoamTarget(viewport()));
          }
        }
        schedule();
      }, 18_000 + Math.random() * 17_000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [ready, hidden, open, flyTo, roam]);

  function settle() {
    if (drag.current) return;
    setMoving(false);
    // Sesekali joget setelah mendarat.
    if (Math.random() < 0.35) {
      setPose("dance");
      setExpression("happy");
      window.setTimeout(() => {
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
    drag.current = { startX: event.clientX, startY: event.clientY, originX: posRef.current.x, originY: posRef.current.y, moved: false };
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
      setOpen(false);
      setPose("fly");
      setExpression("surprised");
    }
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
      settle();
      return;
    }
    // Ketuk = buka/tutup balon + reaksi.
    setOpen((current) => !current);
    setPose("wave");
    setExpression("happy");
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
      setOpen(false);
    }
  }

  const close = useCallback(() => {
    setOpen(false);
    setPose("idle");
    setExpression(rest);
  }, [rest]);
  const hide = useCallback(() => {
    setOpen(false);
    setHidden(true);
    writeJson("session", hiddenKey, true);
  }, [hiddenKey]);

  if (!ready || hidden) return null;

  // Balon di sisi yang lebih lapang, dijepit agar tidak keluar layar.
  const vp = viewport();
  const bubbleWidth = Math.min(300, vp.width - 24);
  const bubbleX = Math.min(Math.max(12, pos.x + PET_SIZE / 2 - bubbleWidth / 2), vp.width - bubbleWidth - 12) - pos.x;
  const bubbleAbove = pos.y > vp.height / 2;

  return (
    <div
      className={`aya-pet ${facingLeft ? "aya-pet-facing-left" : ""}`}
      data-moving={moving && !dragging ? "true" : "false"}
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
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
        <AyaCharacter expression={expression} pose={pose} role={scope === "order" ? "customer" : "staff"} />
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
          {children({ close, hide })}
        </div>
      ) : null}
    </div>
  );
}
