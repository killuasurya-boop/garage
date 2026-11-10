// =============================================================================
// Tema suara "Stasiun Tepi Rel" (owner, Nov 2026) — vibes kafe di tepi rel kereta.
//
// Semua bunyi DISINTESIS di browser (Web Audio): lonceng peron, bel perlintasan,
// klakson kereta, derak roda. Bukan rekaman / melodi lagu stasiun KAI (lagu-lagu
// itu masih dilindungi hak cipta) — nada ciptaan sendiri, bebas dipakai.
//
// Tema dipilih per perangkat (localStorage). "classic" = bunyi lama (tidak berubah).
// Modul ini murni klien & tanpa state server; anti-dobel tetap di sound-claim.ts.
// =============================================================================

import type { VoiceScenario } from "@/lib/garage-voice";

export type SoundTheme = "classic" | "station";
export type StationCue = "new_bar" | "new_dapur" | "ready" | "late" | "stock_sent" | "approved" | "attention";

export const SOUND_THEME_KEY = "garage:sound:theme";
export const SOUND_THEME_LABELS: Record<SoundTheme, string> = {
  classic: "Klasik",
  station: "Stasiun Kereta",
};

export const STATION_CUE_LABELS: Record<StationCue, string> = {
  new_bar: "Pesanan baru Bar — lonceng peron tinggi",
  new_dapur: "Pesanan baru Dapur — lonceng peron rendah",
  ready: "Siap antar — pengumuman kereta tiba",
  late: "Lewat SLA — bel perlintasan",
  stock_sent: "Bahan dikirim — klakson kereta berangkat",
  approved: "Batal disetujui — derak roda + nada lembut",
  attention: "Perhatian umum — lonceng 2 nada",
};

export function getSoundTheme(): SoundTheme {
  try {
    return localStorage.getItem(SOUND_THEME_KEY) === "station" ? "station" : "classic";
  } catch {
    return "classic";
  }
}

export function setSoundTheme(theme: SoundTheme) {
  try {
    localStorage.setItem(SOUND_THEME_KEY, theme);
  } catch {
    /* localStorage tidak tersedia */
  }
}

/** Bunyi pembuka pengumuman voice → cue stasiun (null = pakai ding biasa). */
export function cueForScenario(scenario: VoiceScenario): StationCue | null {
  switch (scenario) {
    case "order_new_bar":
      return "new_bar";
    case "order_new_kitchen":
    case "order_new":
    case "airport_qr":
    case "online_new":
      return "new_dapur";
    case "order_ready":
    case "order_ready_deliver":
      return "ready";
    case "warning_lowstock":
    case "warning_printer":
    case "cash_anomaly":
    case "audit_alert":
    case "ai_alert_high":
      return "late";
    case "approval_pending":
    case "waiter_call":
    case "waiter_bill_request":
    case "waiter_refill":
    case "waiter_special_request":
      return "attention";
    default:
      return null;
  }
}

/** Lama cue (ms) — voice diputar setelah cue selesai agar tidak bertumpuk. */
export function cueDurationMs(cue: StationCue) {
  return { new_bar: 1300, new_dapur: 1500, ready: 1600, late: 1400, stock_sent: 1600, approved: 2100, attention: 900 }[cue];
}

/** Lonceng: nada dasar + parsial inharmonik (karakter lonceng logam peron). */
function bell(ctx: AudioContext, freq: number, at: number, dur: number, peak: number) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  out.connect(ctx.destination);
  for (const [mult, amp] of [
    [1, 1],
    [2.76, 0.35],
    [5.4, 0.12],
  ] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    g.gain.value = amp;
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + dur);
  }
}

/** Klakson kereta: akord sawtooth diredam (bukan rekaman). */
function horn(ctx: AudioContext, at: number, dur: number, peak: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.06);
  g.gain.setValueAtTime(Math.max(0.0002, peak), at + Math.max(0.07, dur - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  lp.connect(g).connect(ctx.destination);
  for (const f of [311, 370, 466]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    osc.connect(lp);
    osc.start(at);
    osc.stop(at + dur);
  }
}

/** Derak roda di sambungan rel: semburan noise pendek. */
function clack(ctx: AudioContext, at: number, peak: number) {
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.value = peak;
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(at);
}

/**
 * Putar satu cue. `volume` 0–1 (pengaturan suara perangkat). Mengembalikan false
 * bila audio belum diizinkan browser (perlu sentuhan pertama).
 */
export function playStationCue(ctx: AudioContext, cue: StationCue, volume = 0.8): boolean {
  if (ctx.state === "closed") return false;
  const v = Math.min(1, Math.max(0.05, volume));
  const t = ctx.currentTime + 0.03;
  try {
    switch (cue) {
      case "new_bar":
        [659, 523, 784].forEach((f, i) => bell(ctx, f, t + i * 0.32, 1.1, 0.22 * v));
        break;
      case "new_dapur":
        [392, 330, 494].forEach((f, i) => bell(ctx, f, t + i * 0.36, 1.3, 0.26 * v));
        break;
      case "ready":
        [523, 659, 784, 1047].forEach((f, i) => bell(ctx, f, t + i * 0.28, 1.2, 0.2 * v));
        break;
      case "late":
        for (let i = 0; i < 6; i += 1) bell(ctx, i % 2 ? 740 : 880, t + i * 0.22, 0.3, 0.24 * v);
        break;
      case "stock_sent":
        horn(ctx, t, 0.45, 0.18 * v);
        horn(ctx, t + 0.6, 0.9, 0.18 * v);
        break;
      case "approved":
        [0, 0.12, 0.5, 0.62].forEach((d) => clack(ctx, t + d, 0.5 * v));
        bell(ctx, 587, t + 1.0, 1.0, 0.18 * v);
        bell(ctx, 784, t + 1.25, 1.2, 0.18 * v);
        break;
      case "attention":
        bell(ctx, 784, t, 0.7, 0.2 * v);
        bell(ctx, 587, t + 0.3, 0.9, 0.2 * v);
        break;
    }
    return ctx.state === "running";
  } catch {
    return false;
  }
}
