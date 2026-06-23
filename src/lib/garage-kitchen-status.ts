// =============================================================================
// Alur status tiket KDS (dapur/bar) — sumber kebenaran transisi yang dipakai
// lintas role: Barista & Koki memproses (queue→cooking→ready), Waiter mengantar
// (ready→delivered). Pure (tanpa DB) agar bisa diuji & dipakai ulang.
// =============================================================================

export type KitchenStatus = "queue" | "cooking" | "ready" | "delivered";

export const KITCHEN_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  queue: ["cooking", "ready"],
  cooking: ["ready"],
  ready: ["delivered"],
  delivered: [],
};

/** Status berikutnya yang sah dari sebuah status. */
export function nextKitchenStatuses(from: string): readonly string[] {
  return KITCHEN_STATUS_TRANSITIONS[from] ?? [];
}

/** Apakah transisi dari→ke diizinkan (cegah lompat/mundur status tiket). */
export function canTransitionKitchenStatus(from: string, to: string): boolean {
  return nextKitchenStatuses(from).includes(to);
}
