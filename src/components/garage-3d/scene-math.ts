// Fungsi murni untuk adegan 3D emblem Garage (diuji di scene-math.test.ts; tanpa three.js).

export type SceneMode = "off" | "static" | "animated";
export type SceneQuality = "high" | "low";

export type DeviceHints = {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.deviceMemory (GB) bila ada. */
  deviceMemory?: number;
  cores?: number;
  coarsePointer: boolean;
  /** Lebar viewport (px). */
  width: number;
};

/**
 * Putuskan apakah adegan 3D dijalankan dan seberapa berat.
 * - hemat data → mati (tidak mengunduh three.js sama sekali)
 * - reduced-motion → satu bingkai diam
 * - perangkat lemah (RAM ≤2 GB / ≤2 inti / HP kecil) → kualitas rendah
 */
export function decideScene(hints: DeviceHints): { mode: SceneMode; quality: SceneQuality } {
  if (hints.saveData) return { mode: "off", quality: "low" };
  const weak = (hints.deviceMemory !== undefined && hints.deviceMemory <= 2) || (hints.cores !== undefined && hints.cores <= 2);
  const phone = hints.coarsePointer && hints.width < 700;
  const quality: SceneQuality = weak || phone ? "low" : "high";
  return { mode: hints.reducedMotion ? "static" : "animated", quality };
}

/** Jarak kamera agar lingkaran berjari-jari `radius` muat di dimensi terkecil layar. */
export function fitDistance(fovDeg: number, aspect: number, radius: number) {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  return radius / (half * Math.min(1, Math.max(0.2, aspect)));
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Peredaman eksponensial yang tidak bergantung pada frame rate. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Rata-rata durasi bingkai → tindakan penyesuaian kualitas. */
export function adaptAction(avgFrameSeconds: number, alreadyDowngraded: boolean): "keep" | "downgrade" | "stop" {
  if (alreadyDowngraded) return avgFrameSeconds > 0.045 ? "stop" : "keep";
  return avgFrameSeconds > 0.034 ? "downgrade" : "keep";
}
