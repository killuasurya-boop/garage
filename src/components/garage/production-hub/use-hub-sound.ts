"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductionBoard } from "@/lib/garage-api-types";
import { isOnlineChannel, voice } from "@/lib/garage-voice";

// Suara & voice Production Hub (dipindah apa adanya dari layar lama): bunyi tiket
// baru / tiket telat, voice transisi status, dan pengingat READY yang belum
// diambil. Hanya station yang tampil di layar ini; "Suara OFF" membisukan semua.

const PICKUP_REMIND_MINUTES = 3;
type Area = "all" | "Bar" | "Food";

export function useHubSound(board: ProductionBoard | null, area: Area, lateIds: Set<string>, now: number) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const prevStatusRef = useRef<Map<string, string> | null>(null);
  const prevLateRef = useRef<Set<string>>(new Set());
  const remindRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    try {
      if (localStorage.getItem("garage:kds:sound") === "on") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- init sekali dari storage
        setSoundEnabled(true);
        // Browser hanya mengizinkan audio setelah sentuhan: siapkan AudioContext pada sentuhan pertama.
        const prime = () => {
          const AudioCtor =
            window.AudioContext ??
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioCtor) return;
          if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioCtor();
          void audioRef.current.resume();
          voice.unlock();
        };
        window.addEventListener("pointerdown", prime, { once: true });
        return () => window.removeEventListener("pointerdown", prime);
      }
    } catch {
      /* localStorage tidak tersedia */
    }
  }, []);

  const playTone = useCallback(
    (kind: "new" | "late") => {
      const ctx = audioRef.current;
      if (!soundEnabled || !ctx || ctx.state === "closed") return;
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        const osc = ctx.createOscillator();
        osc.type = kind === "new" ? "sine" : "square";
        osc.frequency.setValueAtTime(kind === "new" ? 880 : 440, t);
        if (kind === "new") osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      } catch {
        /* audio ditolak (kiosk) — abaikan */
      }
    },
    [soundEnabled],
  );

  const toggleSound = useCallback(() => {
    if (soundEnabled) {
      setSoundEnabled(false);
      try {
        localStorage.setItem("garage:kds:sound", "off");
      } catch {
        /* abaikan */
      }
      return;
    }
    const AudioCtor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioCtor();
    void audioRef.current.resume();
    voice.unlock();
    setSoundEnabled(true);
    try {
      localStorage.setItem("garage:kds:sound", "on");
    } catch {
      /* abaikan */
    }
  }, [soundEnabled]);

  // Tiket baru, transisi status → bunyi & voice.
  useEffect(() => {
    if (!board) return;
    const prev = prevStatusRef.current;
    const next = new Map(board.tickets.map((t) => [t.ticketNo, t.status]));
    if (prev) {
      let hasNew = false;
      for (const t of board.tickets) {
        if (area !== "all" && area !== t.station) continue;
        const before = prev.get(t.ticketNo);
        if (!before) {
          hasNew = true;
          if (soundEnabled && isOnlineChannel(t.channel)) {
            void voice.announce("online_new", { channel: t.channel, dedupKey: `${t.ticketNo}:online` });
          }
          continue;
        }
        if (!soundEnabled) continue;
        if (before === "queue" && t.status === "cooking") {
          void voice.announce(t.station === "Bar" ? "bar_mixing" : "kitchen_cooking", {
            table: t.table,
            dedupKey: `${t.ticketNo}:cook`,
          });
        } else if (before !== "ready" && t.status === "ready") {
          void voice.announce("order_ready", { table: t.table, orderNo: t.orderNo, dedupKey: `${t.ticketNo}:ready` });
        }
      }
      if (hasNew) playTone("new");
    }
    prevStatusRef.current = next;
  }, [board, playTone, area, soundEnabled]);

  // Tiket baru lewat SLA (hanya station yang tampil).
  useEffect(() => {
    const visible = new Set(
      (board?.tickets ?? []).filter((t) => area === "all" || t.station === area).map((t) => t.ticketNo),
    );
    let newlyLate = false;
    for (const id of lateIds) if (!prevLateRef.current.has(id) && visible.has(id)) newlyLate = true;
    if (newlyLate) playTone("late");
    prevLateRef.current = lateIds;
  }, [lateIds, playTone, board, area]);

  // READY dipanggil ≥3 menit belum diambil → umumkan ulang (maks. 3x).
  useEffect(() => {
    for (const t of board?.tickets ?? []) {
      if (t.status !== "ready" || !t.handoverAt) continue;
      if (area !== "all" && area !== t.station) continue;
      const minutes = Math.floor((now - new Date(t.handoverAt).getTime()) / 60000);
      if (minutes < PICKUP_REMIND_MINUTES || minutes >= PICKUP_REMIND_MINUTES + 3) continue;
      if (remindRef.current.get(t.ticketNo) === minutes) continue;
      remindRef.current.set(t.ticketNo, minutes);
      if (!soundEnabled) continue;
      void voice.announce("order_ready_deliver", { table: t.table, dedupKey: `${t.ticketNo}:remind:${minutes}` });
    }
  }, [now, board, area, soundEnabled]);

  return { soundEnabled, toggleSound };
}
