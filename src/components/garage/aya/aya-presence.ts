// =============================================================================
// AYA presence — state machine animasi AYA (master prompt V5 §6), murni & teruji.
//
// 10 state: idle, greeting, talking, listening, thinking, happy, pointing, guide, sleep, error.
// Dipakai dua renderer:
// - AyaStage3D (Three.js, layer resmi V5 berlapis) → membaca state langsung;
// - fallback 2D AyaMascot (aya-rig) → `presenceTo2D` memetakan ke state/motion/efek 2D yang sudah ada.
// Transisi lewat `ayaPresenceReducer(event)` supaya chat, navigasi dan welcome tidak menyetel state
// sembarangan (mis. "sleep" tidak boleh menimpa "talking", "error" hilang sendiri setelah dicoba lagi).
// =============================================================================
import type { AyaEffect, AyaMotion, AyaState } from "./aya-mascot";

export const AYA_PRESENCES = ["idle", "greeting", "talking", "listening", "thinking", "happy", "pointing", "guide", "sleep", "error"] as const;
export type AyaPresence = (typeof AYA_PRESENCES)[number];

export const AYA_PRESENCE_LABEL: Record<AyaPresence, string> = {
  idle: "Siap membantu",
  greeting: "Menyapa",
  talking: "Sedang bicara…",
  listening: "Mendengarkan…",
  thinking: "Sedang berpikir…",
  happy: "Senang bisa bantu",
  pointing: "Menunjukkan menu",
  guide: "Memandu kamu",
  sleep: "Istirahat sebentar",
  error: "Ada kendala",
};

/** State sesaat → kembali ke idle setelah durasi ini (ms). State lain bertahan sampai ada event. */
export const AYA_PRESENCE_HOLD_MS: Partial<Record<AyaPresence, number>> = {
  greeting: 2600,
  happy: 1800,
  pointing: 2400,
};

/** Tanpa interaksi selama ini → AYA tidur (render 3D diperlambat). */
export const AYA_SLEEP_AFTER_MS = 60_000;

export type AyaPresenceEvent =
  | { type: "greet" }
  | { type: "listenStart" }
  | { type: "listenEnd" }
  | { type: "think" }
  | { type: "answer"; ok: boolean }
  | { type: "speakStart" }
  | { type: "speakEnd" }
  | { type: "point" }
  | { type: "guide" }
  | { type: "guideEnd" }
  | { type: "idleTimeout" }
  | { type: "wake" }
  | { type: "error" }
  | { type: "settle" };

/** Prioritas: state aktif (mendengar/bicara) tidak boleh ditimpa event pasif (tidur, settle). */
const BUSY: ReadonlySet<AyaPresence> = new Set(["listening", "talking", "thinking"]);

export function ayaPresenceReducer(current: AyaPresence, event: AyaPresenceEvent): AyaPresence {
  switch (event.type) {
    case "greet":
      return BUSY.has(current) ? current : "greeting";
    case "listenStart":
      return "listening";
    case "listenEnd":
      return current === "listening" ? "idle" : current;
    case "think":
      return "thinking";
    case "answer":
      return event.ok ? "happy" : "idle";
    case "speakStart":
      return current === "listening" ? current : "talking";
    case "speakEnd":
      return current === "talking" ? "idle" : current;
    case "point":
      return current === "listening" ? current : "pointing";
    case "guide":
      return "guide";
    case "guideEnd":
      return current === "guide" ? "happy" : current;
    case "idleTimeout":
      return BUSY.has(current) || current === "guide" || current === "error" ? current : "sleep";
    case "wake":
      return current === "sleep" ? "greeting" : current;
    case "error":
      return "error";
    case "settle":
      // Akhir state sesaat (greeting/happy/pointing) atau "coba lagi" setelah error.
      return BUSY.has(current) || current === "guide" || current === "sleep" ? current : "idle";
    default:
      return current;
  }
}

/** Fallback 2D (aya-rig): state, gerak tubuh, efek. */
export function presenceTo2D(presence: AyaPresence): { state: AyaState; motion: AyaMotion; effect: AyaEffect | null } {
  switch (presence) {
    case "greeting":
      return { state: "success", motion: "wave", effect: "sparkle" };
    case "talking":
      return { state: "speaking", motion: "rest", effect: null };
    case "listening":
      return { state: "listening", motion: "rest", effect: null };
    case "thinking":
      return { state: "thinking", motion: "rest", effect: null };
    case "happy":
      return { state: "success", motion: "dance", effect: "hearts" };
    case "pointing":
      return { state: "guiding", motion: "rest", effect: null };
    case "guide":
      return { state: "guiding", motion: "walk", effect: null };
    case "sleep":
      return { state: "idle", motion: "rest", effect: "zzz" };
    case "error":
      return { state: "error", motion: "rest", effect: "dizzy" };
    default:
      return { state: "idle", motion: "rest", effect: null };
  }
}

/** Ekspresi wajah 3D (mata & mulut digambar dari koordinat layer wajah resmi V5). */
export type AyaFace = "idle" | "happy" | "listening" | "speaking" | "thinking" | "sleep" | "error";

export function presenceFace(presence: AyaPresence): AyaFace {
  switch (presence) {
    case "greeting":
    case "happy":
      return "happy";
    case "talking":
      return "speaking";
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "sleep":
      return "sleep";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

/**
 * Amplop mulut saat bicara: TIDAK mengklaim lip-sync (Web Speech API tidak memberi level audio),
 * hanya gerak suku kata semu yang deterministik dari waktu. 0 = tertutup, 1 = terbuka penuh.
 */
export function talkEnvelope(tMs: number) {
  const syllable = Math.abs(Math.sin(tMs / 95)) * 0.65 + Math.abs(Math.sin(tMs / 233 + 1.3)) * 0.35;
  const phrase = Math.sin(tMs / 1300) > -0.7 ? 1 : 0.25; // jeda singkat antar frasa
  return Math.min(1, syllable * phrase);
}

/** Kedip: true selama ~120 ms setiap ~3,2–4,4 s (pola tetap supaya mudah diuji). */
export function isBlinking(tMs: number) {
  const cycle = 3200 + (Math.floor(tMs / 4000) % 3) * 600;
  return tMs % cycle < 120;
}
