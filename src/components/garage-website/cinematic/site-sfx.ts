// =============================================================================
// Sistem suara website Garage (Cinematic UI V1) — Web Audio prosedural (zzfx), tanpa file audio/dependensi.
//
// Aturan Owner: default MATI, tidak pernah autoplay, hanya berbunyi setelah pengunjung menyalakan tombol
// Sound (tindakan pengguna), volume lembut, jeda antarefek agar tidak berisik. Terpisah dari suara AYA menu.
// =============================================================================
import { zzfxBuildSamples, zzfxPlaySamples, type ZzfxParams } from "@/lib/zzfx";

export type SiteSfx = "entrance" | "laser" | "tick" | "click" | "carousel" | "shimmer" | "sweep";

/** Parameter ZzFX: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, … */
export const SITE_SFX: Record<SiteSfx, ZzfxParams> = {
  entrance: [0.5, 0, 110, 0.22, 0.28, 0.55, 4, 1, 2, 0, 0, 0, 0, 0.85, 0, 0, 0, 0.6, 0, 0, 900], // whoosh sinematik
  laser: [0.28, 0, 190, 0.04, 0.16, 0.24, 2, 1, 7, 0, 0, 0, 0, 0, 3, 0, 0, 0.5, 0, 0.15, 1600], // energi futuristik
  tick: [0.2, 0, 2300, 0, 0.004, 0.022, 0], // hover digital
  click: [0.45, 0, 150, 0, 0.012, 0.06, 3, 1, -12, 0, 0, 0, 0, 0.35], // klik mekanis
  carousel: [0.32, 0, 280, 0.05, 0.1, 0.22, 4, 1, 4, 0, 0, 0, 0, 0.9], // whoosh lembut
  shimmer: [0.24, 0, 1500, 0, 0.03, 0.26, 0, 1, 0, 0, 480, 0.05, 0.07, 0, 0, 0, 0.12], // kilau produk
  sweep: [0.22, 0, 640, 0.02, 0.06, 0.12, 0, 1, -14], // transisi navigasi
};

/** Jeda minimum per efek (ms); hover lebih rapat tapi tetap dibatasi. */
export const SITE_SFX_GAP_MS: Record<SiteSfx, number> = {
  entrance: 2000,
  laser: 600,
  tick: 90,
  click: 120,
  carousel: 220,
  shimmer: 400,
  sweep: 250,
};

const MASTER_VOLUME = 0.55;
const STORAGE_KEY = "garage:site-sound";

/** Boleh memutar efek sekarang? (murni, untuk dites) */
export function siteSfxAllowed(last: ReadonlyMap<SiteSfx, number>, name: SiteSfx, now: number) {
  const previous = last.get(name);
  return previous === undefined || now - previous >= SITE_SFX_GAP_MS[name];
}

// ---------------------------------------------------------------- status nyala/mati (per perangkat)

let enabledCache: boolean | null = null;
const listeners = new Set<() => void>();

export function readSiteSound(): boolean {
  if (enabledCache !== null) return enabledCache;
  let value = false; // default MATI
  if (typeof window !== "undefined") {
    try {
      value = window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      value = false;
    }
  }
  enabledCache = value;
  return value;
}

export function subscribeSiteSound(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Dipanggil dari klik tombol Sound (aktivasi pengguna) — aman membuat AudioContext. */
export function setSiteSound(on: boolean) {
  enabledCache = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Penyimpanan diblokir: status hanya berlaku di sesi ini.
  }
  listeners.forEach((fn) => fn());
  if (on) playSiteSfx("laser");
}

// ---------------------------------------------------------------- pemutar

let ctx: AudioContext | null = null;
const cache = new Map<SiteSfx, Float32Array>();
const lastPlayed = new Map<SiteSfx, number>();

export function playSiteSfx(name: SiteSfx) {
  if (typeof window === "undefined" || !readSiteSound()) return false;
  const now = performance.now();
  if (!siteSfxAllowed(lastPlayed, name, now)) return false;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    let samples = cache.get(name);
    if (!samples) {
      const params = [...SITE_SFX[name]];
      params[1] = 0;
      samples = zzfxBuildSamples(...(params as number[]));
      cache.set(name, samples);
    }
    zzfxPlaySamples(ctx, samples, 0.22 * MASTER_VOLUME);
    lastPlayed.set(name, now);
    return true;
  } catch {
    return false;
  }
}
