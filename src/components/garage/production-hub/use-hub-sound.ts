"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductionBoard } from "@/lib/garage-api-types";
import { getVoiceSettings, isOnlineChannel, voice, type VoiceScenario } from "@/lib/garage-voice";
import { hubSoundEvents, inSoundArea, lateToneKey, type HubSoundArea } from "@/lib/hub-sound-rules";
import { claimSound } from "@/lib/sound-claim";
import { getSoundTheme, playStationCue, type StationCue } from "@/lib/station-sound-theme";

// Suara & voice Production Hub. Smart Notification V2:
// - `soundArea` = stasiun perangkat (Bar/Dapur); hanya Owner/Manajer/kasir tanpa
//   stasiun yang mengikuti area tampilan. Bar tidak pernah bersuara untuk Dapur.
// - Satu event = satu bunyi per perangkat (claimSound: lintas tab + refresh).
// - "Pesanan siap" hanya saat seluruh pesanan siap (hub-sound-rules.ts).
// "Suara OFF" membisukan semua; status audio browser dilaporkan lewat `audioState`.

const PICKUP_REMIND_MINUTES = 3;

export type HubAudioState = "off" | "locked" | "ready" | "unsupported";

export function useHubSound(board: ProductionBoard | null, soundArea: HubSoundArea, lateIds: Set<string>, now: number) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioState, setAudioState] = useState<HubAudioState>("off");
  const audioRef = useRef<AudioContext | null>(null);
  const prevStatusRef = useRef<Map<string, string> | null>(null);
  const prevLateRef = useRef<Set<string>>(new Set());
  const remindRef = useRef<Map<string, number>>(new Map());

  const refreshAudioState = useCallback((enabled: boolean) => {
    if (!enabled) return setAudioState("off");
    const ctx = audioRef.current;
    if (!ctx) {
      const hasCtor =
        typeof window !== "undefined" &&
        Boolean(window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      return setAudioState(hasCtor ? "locked" : "unsupported");
    }
    setAudioState(ctx.state === "running" ? "ready" : "locked");
  }, []);

  const primeAudio = useCallback(() => {
    const AudioCtor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return setAudioState("unsupported");
    if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioCtor();
    const ctx = audioRef.current;
    void ctx.resume().then(() => setAudioState(ctx.state === "running" ? "ready" : "locked")).catch(() => setAudioState("locked"));
    voice.unlock();
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem("garage:kds:sound") === "on") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- init sekali dari storage
        setSoundEnabled(true);
        refreshAudioState(true);
        // Browser hanya mengizinkan audio setelah sentuhan: siapkan AudioContext pada sentuhan pertama.
        window.addEventListener("pointerdown", primeAudio, { once: true });
        return () => window.removeEventListener("pointerdown", primeAudio);
      }
    } catch {
      /* localStorage tidak tersedia */
    }
  }, [primeAudio, refreshAudioState]);

  const playTone = useCallback(
    (kind: "new" | "late" | "test", station: "Bar" | "Food" = "Bar") => {
      const ctx = audioRef.current;
      if (!ctx || ctx.state === "closed") return false;
      if (getSoundTheme() === "station") {
        const cue: StationCue = kind === "late" ? "late" : station === "Food" ? "new_dapur" : "new_bar";
        return playStationCue(ctx, cue, getVoiceSettings().volume);
      }
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        const osc = ctx.createOscillator();
        osc.type = kind === "late" ? "square" : "sine";
        osc.frequency.setValueAtTime(kind === "late" ? 440 : 880, t);
        if (kind !== "late") osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
        return ctx.state === "running";
      } catch {
        /* audio ditolak (kiosk) — abaikan */
        return false;
      }
    },
    [],
  );

  /** Tone sekali per kunci event per perangkat. */
  const playToneOnce = useCallback(
    (kind: "new" | "late", key: string, station: "Bar" | "Food" = "Bar") => {
      if (!soundEnabled) return;
      void claimSound(key).then((ok) => {
        if (ok) playTone(kind, station);
      });
    },
    [playTone, soundEnabled],
  );

  const toggleSound = useCallback(() => {
    if (soundEnabled) {
      setSoundEnabled(false);
      setAudioState("off");
      try {
        localStorage.setItem("garage:kds:sound", "off");
      } catch {
        /* abaikan */
      }
      return;
    }
    primeAudio();
    setSoundEnabled(true);
    try {
      localStorage.setItem("garage:kds:sound", "on");
    } catch {
      /* abaikan */
    }
  }, [primeAudio, soundEnabled]);

  /** Tombol "Tes suara": tanpa klaim (selalu bunyi), melaporkan apakah audio benar-benar jalan. */
  const testSound = useCallback(async () => {
    primeAudio();
    try {
      await audioRef.current?.resume();
    } catch {
      /* ditolak browser */
    }
    const ok = playTone("test", soundArea === "Food" ? "Food" : "Bar");
    refreshAudioState(true);
    void voice.announce(soundArea === "Food" ? "order_new_kitchen" : "order_new_bar", { force: true, table: "07" });
    return ok;
  }, [playTone, primeAudio, refreshAudioState, soundArea]);

  // Tiket baru, transisi status → bunyi & voice (hanya stasiun perangkat).
  useEffect(() => {
    if (!board) return;
    const events = hubSoundEvents(prevStatusRef.current, board.tickets, soundArea, isOnlineChannel);
    prevStatusRef.current = new Map(board.tickets.map((t) => [t.ticketNo, t.status]));
    if (!soundEnabled) return;
    let toneKey: string | null = null;
    let toneStation: "Bar" | "Food" = "Bar";
    const voiceSettings = getVoiceSettings();
    const voiceOn = (scenario: VoiceScenario) => voiceSettings.enabled && voiceSettings.scenariosEnabled[scenario] !== false;
    for (const event of events) {
      if (event.type === "new") {
        const scenario: VoiceScenario = event.station === "Bar" ? "order_new_bar" : "order_new_kitchen";
        // Satu bunyi per event: voice (sudah ber-ding) bila aktif, selain itu tone KDS.
        if (voiceOn(scenario)) {
          void voice.announce(scenario, { table: event.table, orderNo: event.orderNo, dedupKey: event.key });
        } else {
          if (!toneKey) toneStation = event.station;
          toneKey = toneKey ? `${toneKey}|${event.key}` : event.key;
        }
      } else if (event.type === "online_new") {
        void voice.announce("online_new", { channel: event.channel, dedupKey: event.key });
      } else if (event.type === "cooking") {
        void voice.announce(event.station === "Bar" ? "bar_mixing" : "kitchen_cooking", { table: event.table, dedupKey: event.key });
      } else if (event.type === "order_ready") {
        void voice.announce("order_ready", { table: event.table, orderNo: event.orderNo, dedupKey: event.key });
      }
    }
    if (toneKey) playToneOnce("new", toneKey, toneStation);
  }, [board, playToneOnce, soundArea, soundEnabled]);

  // Tiket baru lewat SLA (hanya stasiun perangkat) — satu tone per refresh.
  useEffect(() => {
    const visible = new Set(
      (board?.tickets ?? []).filter((t) => inSoundArea(soundArea, t.station)).map((t) => t.ticketNo),
    );
    const key = lateToneKey(prevLateRef.current, lateIds, visible);
    if (key) playToneOnce("late", key);
    prevLateRef.current = lateIds;
  }, [lateIds, playToneOnce, board, soundArea]);

  // READY dipanggil ≥3 menit belum diambil → umumkan ulang (maks. 3x), berhenti
  // begitu tiket diantar (tiket hilang dari papan / bukan READY lagi).
  useEffect(() => {
    if (!soundEnabled) return;
    for (const t of board?.tickets ?? []) {
      if (t.status !== "ready" || !t.handoverAt) continue;
      if (!inSoundArea(soundArea, t.station)) continue;
      const minutes = Math.floor((now - new Date(t.handoverAt).getTime()) / 60000);
      if (minutes < PICKUP_REMIND_MINUTES || minutes >= PICKUP_REMIND_MINUTES + 3) continue;
      if (remindRef.current.get(t.ticketNo) === minutes) continue;
      remindRef.current.set(t.ticketNo, minutes);
      void voice.announce("order_ready_deliver", {
        table: t.table,
        dedupKey: `hub:remind:${t.ticketNo}:${t.handoverAt}:${minutes}`,
      });
    }
  }, [now, board, soundArea, soundEnabled]);

  return { soundEnabled, toggleSound, audioState, testSound };
}
