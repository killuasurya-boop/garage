// Suara & SFX Aya (A4, keputusan Owner OD-04) — semuanya di browser, tanpa layanan berbayar (OD-03).
// - Customer (menu digital): suara + SFX NYALA secara bawaan; staf (POS/KDS/Production Hub): MATI
//   secara bawaan agar tidak tertukar dengan bunyi pesanan. Pengguna bisa mengubahnya (per perangkat).
// - Tidak bersuara sebelum pengguna menyentuh/menekan sesuatu (aturan autoplay browser).
// - Suara operasional selalu menang: bila speechSynthesis sedang dipakai pihak lain, Aya diam.
// - Teks selalu tampil sebagai caption; suara hanyalah tambahan.
import { zzfxBuildSamples, zzfxPlaySamples, type ZzfxParams } from "@/lib/zzfx";

export type AyaAudienceSound = "customer" | "staff";
export type AyaSfx = "pop" | "whoosh" | "boing" | "sparkle" | "tap" | "point" | "oops";

/** Parameter ZzFX tiap efek (dirancang lembut & pendek, ≤0,5 dtk). */
export const AYA_SFX: Record<AyaSfx, ZzfxParams> = {
  pop: [0.6, 0.05, 660, 0, 0.01, 0.06, 0, 1.6, 12],
  whoosh: [0.35, 0.05, 180, 0.08, 0.12, 0.2, 4, 1, 3, 0, 0, 0, 0, 0.6],
  boing: [0.5, 0.05, 240, 0.01, 0.04, 0.18, 1, 1.4, -8, 0, 0, 0, 0, 0, 12],
  sparkle: [0.35, 0.05, 1200, 0, 0.03, 0.18, 0, 1, 0, 0, 380, 0.05, 0.06],
  tap: [0.4, 0.05, 900, 0, 0.005, 0.04, 1],
  point: [0.4, 0.05, 520, 0, 0.02, 0.07, 1, 1, 4, 0, 160, 0.03],
  oops: [0.45, 0.05, 420, 0.01, 0.05, 0.22, 1, 1, -6, 0, 0, 0, 0, 0, 20],
};

/** Jeda minimum antar efek yang sama (ms) — anti berisik. */
export const AYA_SFX_COOLDOWN_MS = 350;
/** Jeda minimum antar efek apa pun (ms). */
export const AYA_SFX_GLOBAL_GAP_MS = 120;

export type AyaSoundSettings = { enabled: boolean; volume: number };

export function ayaSoundDefaults(audience: AyaAudienceSound): AyaSoundSettings {
  return { enabled: audience === "customer", volume: 0.7 };
}

/** Boleh memutar efek sekarang? (fungsi murni untuk dites) */
export function ayaSfxAllowed(last: ReadonlyMap<AyaSfx | "*", number>, name: AyaSfx, now: number) {
  return now - (last.get(name) ?? -Infinity) >= AYA_SFX_COOLDOWN_MS && now - (last.get("*") ?? -Infinity) >= AYA_SFX_GLOBAL_GAP_MS;
}

type VoiceLike = { lang: string; name: string; localService?: boolean };

/** Suara Bahasa Indonesia terbaik yang tersedia; null bila tidak ada (Aya cukup caption). */
export function pickIndonesianVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  const id = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("id"));
  if (!id.length) return null;
  // Suara perempuan yang dikenal lebih cocok untuk karakter Aya; sisanya urutan perangkat.
  const preferred = id.find((v) => /gadis|damayanti|google/i.test(v.name));
  return preferred ?? id.find((v) => v.lang.replace("_", "-") === "id-ID") ?? id[0];
}

/** Buang emoji/simbol yang dibaca aneh oleh mesin suara. */
export function speakableText(text: string) {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[“”"«»]/g, "")
    .replace(/\s*[·•|]\s*/g, ", ")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- pengaturan (per perangkat)

const settingsKey = (audience: AyaAudienceSound) => `garage:aya-sound:${audience}`;
const settingsListeners = new Set<() => void>();
const settingsCache = new Map<AyaAudienceSound, AyaSoundSettings>();

export function readAyaSound(audience: AyaAudienceSound): AyaSoundSettings {
  const cached = settingsCache.get(audience);
  if (cached) return cached;
  let value = ayaSoundDefaults(audience);
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(settingsKey(audience));
      if (raw) value = { ...value, ...(JSON.parse(raw) as Partial<AyaSoundSettings>) };
    } catch {
      // Penyimpanan diblokir: pakai bawaan.
    }
  }
  settingsCache.set(audience, value);
  return value;
}

export function writeAyaSound(audience: AyaAudienceSound, next: AyaSoundSettings) {
  settingsCache.set(audience, next);
  try {
    window.localStorage.setItem(settingsKey(audience), JSON.stringify(next));
  } catch {
    // Tetap berlaku di halaman ini.
  }
  if (!next.enabled) stopAyaSpeech();
  settingsListeners.forEach((fn) => fn());
}

export function subscribeAyaSound(fn: () => void) {
  settingsListeners.add(fn);
  return () => settingsListeners.delete(fn);
}

// ---------------------------------------------------------------- aktivasi pengguna

let activated = false;
function userActivated() {
  if (typeof window === "undefined") return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activated || ua?.hasBeenActive === true;
}
if (typeof window !== "undefined") {
  const mark = () => {
    activated = true;
  };
  window.addEventListener("pointerdown", mark, { once: true, capture: true, passive: true });
  window.addEventListener("keydown", mark, { once: true, capture: true });
}

// ---------------------------------------------------------------- SFX

let audioCtx: AudioContext | null = null;
const sampleCache = new Map<AyaSfx, Float32Array>();
const lastPlayed = new Map<AyaSfx | "*", number>();

export function playAyaSfx(name: AyaSfx, audience: AyaAudienceSound) {
  if (typeof window === "undefined") return false;
  const settings = readAyaSound(audience);
  if (!settings.enabled || !userActivated()) return false;
  const now = performance.now();
  if (!ayaSfxAllowed(lastPlayed, name, now)) return false;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    audioCtx ??= new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    let samples = sampleCache.get(name);
    if (!samples) {
      const params = [...AYA_SFX[name]];
      params[1] = 0; // tanpa variasi acak saat di-cache
      samples = zzfxBuildSamples(...(params as number[]));
      sampleCache.set(name, samples);
    }
    zzfxPlaySamples(audioCtx, samples, 0.25 * settings.volume);
    lastPlayed.set(name, now);
    lastPlayed.set("*", now);
    return true;
  } catch {
    return false; // perangkat tanpa Web Audio: diam saja
  }
}

// ---------------------------------------------------------------- suara bicara

let ourUtterance: SpeechSynthesisUtterance | null = null;
let lastSpoken = { text: "", at: 0 };
let speaking = false;
const speakingListeners = new Set<() => void>();
function setSpeaking(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  speakingListeners.forEach((fn) => fn());
}

export function subscribeAyaSpeaking(fn: () => void) {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}
export function getAyaSpeaking() {
  return speaking;
}

/**
 * speechSynthesis.cancel() menghapus SELURUH antrean, termasuk pengumuman operasional
 * yang mengantre di belakang kalimat Aya (Smart Notification V2). Aya hanya boleh
 * membatalkan bila tidak ada ucapan lain yang menunggu.
 */
export function ayaMayCancel(synth: { speaking: boolean; pending: boolean }, hasOwnUtterance: boolean) {
  return hasOwnUtterance && synth.speaking && !synth.pending;
}

export function stopAyaSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (ayaMayCancel(window.speechSynthesis, Boolean(ourUtterance))) window.speechSynthesis.cancel();
  ourUtterance = null;
  setSpeaking(false);
}

/** Aya bicara (bila diizinkan & ada suara Indonesia). Mengembalikan true bila benar-benar bicara. */
export function speakAya(text: string, audience: AyaAudienceSound) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const settings = readAyaSound(audience);
  if (!settings.enabled || !userActivated()) return false;
  const synth = window.speechSynthesis;
  // Suara lain (mis. pengumuman operasional) sedang bicara ATAU mengantre → Aya mengalah.
  if ((synth.speaking || synth.pending) && !ourUtterance) return false;
  if (ourUtterance && synth.pending) return false;
  const voice = pickIndonesianVoice(synth.getVoices());
  if (!voice) return false;
  const clean = speakableText(text);
  if (!clean) return false;
  // Kalimat yang sama baru saja diucapkan (mis. efek ganda React) → jangan ulang.
  const now = Date.now();
  if (clean === lastSpoken.text && now - lastSpoken.at < 1500) return true;
  lastSpoken = { text: clean, at: now };
  try {
    return speakNow(synth, voice, clean, settings.volume);
  } catch {
    setSpeaking(false);
    return false; // mesin suara perangkat bermasalah: cukup caption
  }
}

function speakNow(synth: SpeechSynthesis, voice: SpeechSynthesisVoice, clean: string, volume: number) {
  if (ayaMayCancel(synth, Boolean(ourUtterance))) synth.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.pitch = 1.4; // imut
  utterance.rate = 1.04;
  utterance.volume = volume;
  utterance.onstart = () => setSpeaking(true);
  const done = () => {
    if (ourUtterance === utterance) ourUtterance = null;
    setSpeaking(false);
  };
  utterance.onend = done;
  utterance.onerror = done;
  ourUtterance = utterance;
  synth.speak(utterance);
  return true;
}
