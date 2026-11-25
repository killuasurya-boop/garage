/**
 * Polling POS tiap 10–15 dtk dulu me-render ulang seluruh layar walau datanya sama (audit U3).
 * Pakai sebagai updater setState: `setRows((prev) => keepIfEqual(prev, next))` — bila isinya
 * sama, referensi lama dikembalikan dan React melewati render.
 */
export function keepIfEqual<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  try {
    return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
  } catch {
    return next;
  }
}
