// Satu sumber kebenaran untuk nomor & label meja (aman dipakai client & server).
//
// Batas 50 mengikuti aset audio panggilan meja (smart notif "Meja 1–50") dan
// kartu QR. Meja yang benar-benar dipakai outlet diatur di tabel `dining_tables`
// (menu Atur Meja); tanpa konfigurasi, semua 01–50 dianggap aktif.

export const MAX_TABLE_NUMBER = 50;
export const DEFAULT_TABLE_COUNT = 50;

export const ALL_TABLE_NUMBERS: string[] = Array.from({ length: MAX_TABLE_NUMBER }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

export const TABLE_NUMBER_RANGE_MESSAGE = `Nomor meja harus 01 sampai ${String(MAX_TABLE_NUMBER).padStart(2, "0")}.`;

/**
 * Nomor meja ketat → "06". Menerima "6", "06", "Meja 6", "meja 06", 6.
 * Menolak (null) teks tanpa angka, angka di luar 1–MAX, atau label dengan
 * lebih dari satu angka (mis. "Meja 1 2") — tidak pernah memotong "123" → "23".
 */
export function parseTableNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(?:meja\s*)?0*(\d{1,3})$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TABLE_NUMBER) return null;
  return String(parsed).padStart(2, "0");
}

/** Ambil nomor meja dari label order ("Meja 06", "Meja 6"). Label lain (Take away, Meja QR) → null. */
export function tableNumberFromLabel(label: string | null | undefined): string | null {
  return parseTableNumber(label ?? null);
}

/** Label kanonik yang disimpan di orders/tiket: "Meja 06". */
export function tableLabelFor(tableNumber: string): string {
  return `Meja ${parseTableNumber(tableNumber) ?? tableNumber}`;
}

/** Durasi ringkas untuk kartu meja: "8m", "1j 25m", "2h 3j". */
export function formatTableDuration(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes ?? 0));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  if (hours < 24) {
    const rest = total % 60;
    return rest ? `${hours}j ${rest}m` : `${hours}j`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}h ${restHours}j` : `${days}h`;
}

/** Lantai maksimum yang bisa diatur di Pengaturan → Meja & QR. */
export const MAX_TABLE_FLOOR = 9;

/** Lantai default bila belum diatur (Owner, Nov 2026): Meja 01–25 = Lantai 1, 26–50 = Lantai 2. */
export function defaultTableFloor(tableNumber: string): number {
  const n = Number.parseInt(tableNumber, 10);
  return Number.isFinite(n) && n > 25 ? 2 : 1;
}
