// =============================================================================
// Menu V5 F5: umpan balik suara + gerak untuk aksi pelanggan (papan 06).
//
// Suara memakai efek sintetis AYA (`playAyaSfx`, tanpa file audio): ikut toggle
// Suara AYA di header, volume, aktivasi pengguna dan jeda antarefek. Mode staf
// (Pesankan waiter) selalu diam — tablet waiter dipakai di depan pelanggan.
// =============================================================================
import { playAyaSfx, type AyaSfx } from "@/lib/aya-sound";

export type MenuFeedbackAction =
  | "add"
  | "remove"
  | "favorite-on"
  | "favorite-off"
  | "quickview-open"
  | "quickview-close"
  | "checkout-success"
  | "checkout-error";

const SFX: Record<MenuFeedbackAction, AyaSfx> = {
  add: "pop",
  remove: "tap",
  "favorite-on": "sparkle",
  "favorite-off": "tap",
  "quickview-open": "whoosh",
  "quickview-close": "tap",
  "checkout-success": "sparkle",
  "checkout-error": "oops",
};

/** Efek suara untuk sebuah aksi; `null` bila aksi tidak berbunyi (mode staf). */
export function menuSfxFor(action: MenuFeedbackAction, options: { staff?: boolean } = {}): AyaSfx | null {
  if (options.staff) return null;
  return SFX[action];
}

/** Mainkan efek aksi menu. Mengembalikan true bila suara benar-benar diputar. */
export function playMenuSfx(action: MenuFeedbackAction, options: { staff?: boolean } = {}) {
  const sfx = menuSfxFor(action, options);
  return sfx ? playAyaSfx(sfx, "customer") : false;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Ikon Daftar Pilihan yang sedang terlihat (bottom nav di HP, panel kanan di desktop). */
function visibleListTarget(): HTMLElement | null {
  const targets = document.querySelectorAll<HTMLElement>("[data-gm5-list-target]");
  for (const target of targets) {
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) return target;
  }
  return null;
}

/**
 * "Terbang ke Daftar": titik merah kecil dari tombol + ke ikon Daftar Pilihan
 * (Web Animations API, ±450 ms, transform/opacity saja). Dilewati bila
 * reduced-motion, tidak ada asal, atau ikon tujuan tidak terlihat.
 */
export function flyToList(origin: Element | null | undefined) {
  if (typeof window === "undefined" || !origin || prefersReducedMotion()) return false;
  const target = visibleListTarget();
  if (!target || typeof document.body.animate !== "function") return false;
  const from = origin.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width && !from.height) return false;
  const size = 14;
  const x0 = from.left + from.width / 2 - size / 2;
  const y0 = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - size / 2 - x0;
  const dy = to.top + to.height / 2 - size / 2 - y0;
  const dot = document.createElement("span");
  dot.className = "gm5-fly-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.style.left = `${x0}px`;
  dot.style.top = `${y0}px`;
  document.body.appendChild(dot);
  const lift = Math.min(-40, dy * 0.25);
  const animation = dot.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(0.9)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.2 },
    ],
    { duration: 450, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
  const done = () => dot.remove();
  animation.onfinish = done;
  animation.oncancel = done;
  return true;
}
