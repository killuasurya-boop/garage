// Konfigurasi gerak Cinematic UI V1 (satu tempat): durasi, easing, dan aturan perangkat.
export const MOTION = {
  /** Reveal headline: per baris, masked slide-up. */
  headline: { duration: 0.9, stagger: 0.12, ease: "expo.out", blur: 6 },
  /** Garis laser di bawah headline. */
  sweep: { duration: 0.8, ease: "power3.inOut" },
  /** Kartu produk masuk: fade + scale + blur. */
  product: { duration: 1.1, ease: "expo.out", fromScale: 0.94, blur: 12 },
  /** Crossfade antarproduk (detik). */
  crossfade: 0.7,
  /** Fitur kanan: stagger masuk. */
  features: { duration: 0.7, stagger: 0.09, ease: "power3.out" },
  /** Satu putaran laser mengelilingi kartu (detik). */
  laserLoop: 5.2,
  /** Parallax pointer (px maksimum). */
  parallax: { product: 14, light: 32, emblem: 8 },
  /** Tombol magnetik (px maksimum). */
  magnetic: 10,
} as const;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Perangkat sentuh/kasar: tanpa hover/parallax pointer, animasi lebih ringan. */
export function coarsePointer() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}
