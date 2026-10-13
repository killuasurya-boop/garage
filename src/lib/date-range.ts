// Validasi tanggal & rentang laporan (kalender WIB). Dipakai API laporan
// supaya "2026-02-31", rentang terbalik, atau rentang terlalu panjang ditolak
// dengan pesan jelas — bukan diam-diam bergeser ke bulan berikutnya.

/** "YYYY-MM-DD" yang benar-benar ada di kalender (tolak 2026-02-31). */
export function isCalendarDateKey(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Tanggal hari ini (WIB) "YYYY-MM-DD". */
export function todayWibKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type RangeCheck = { ok: true; from: string; to: string } | { ok: false; code: string; message: string };

/**
 * Validasi rentang: tanggal kalender valid, dari ≤ sampai, mulai tidak di masa
 * depan, dan panjang ≤ maxDays (inklusif).
 */
export function validateDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
  options: { maxDays: number; today?: string },
): RangeCheck {
  if (!isCalendarDateKey(from) || !isCalendarDateKey(to)) {
    return { ok: false, code: "INVALID_DATE", message: "Tanggal tidak valid. Gunakan format YYYY-MM-DD yang ada di kalender." };
  }
  if (from > to) {
    return { ok: false, code: "INVALID_RANGE", message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir." };
  }
  const today = options.today ?? todayWibKey();
  if (from > today) {
    return { ok: false, code: "FUTURE_RANGE", message: "Tanggal mulai tidak boleh di masa depan." };
  }
  if (daysBetween(from, to) + 1 > options.maxDays) {
    return { ok: false, code: "RANGE_TOO_LONG", message: `Rentang maksimal ${options.maxDays} hari.` };
  }
  return { ok: true, from, to };
}
