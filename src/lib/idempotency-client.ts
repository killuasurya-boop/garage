// Idempotency key sisi klien untuk submit pembayaran/order.
// Key hanya melindungi dari order dobel bila DIPAKAI ULANG saat retry: kalau
// respons hilang (WiFi tablet putus) padahal order sudah tersimpan, kasir klik
// "Bayar" lagi → key sama → server mengembalikan order yang sudah ada.
// Isi request berubah (keranjang/metode bayar diganti) → key baru — KECUALI
// percobaan sebelumnya berstatus TIDAK PASTI (GOD++ F-03): server mungkin sudah
// menyimpan order. Key lama dipakai lagi supaya server mengecek dulu
// (order tersimpan → dikembalikan, belum tersimpan → dibuat sekali).

export type IdempotencyAttempt = { fingerprint: string; key: string; uncertain?: boolean; itemsFingerprint?: string };

/** Isi pesanan (item/qty/varian) — pesanan pelanggan lain tidak boleh mewarisi key lama. */
function itemsFingerprintOf(body: unknown) {
  const items = (body as { items?: unknown } | null)?.items;
  return items === undefined ? JSON.stringify(body) : JSON.stringify(items);
}

export function idempotencyAttemptFor(
  previous: IdempotencyAttempt | null | undefined,
  body: unknown,
  makeKey: () => string,
): IdempotencyAttempt {
  const fingerprint = JSON.stringify(body);
  const itemsFingerprint = itemsFingerprintOf(body);
  if (previous && previous.fingerprint === fingerprint) return previous;
  // Tidak pasti + pesanan yang sama (hanya metode/nominal berubah) → key lama, server cek dulu.
  if (previous?.uncertain && previous.itemsFingerprint === itemsFingerprint) return { ...previous, fingerprint };
  return { fingerprint, key: makeKey(), itemsFingerprint };
}

/**
 * Gagal "pasti" = server menolak dengan alasan validasi (4xx selain 408/409/429): order TIDAK tersimpan.
 * Selain itu (jaringan putus, timeout, 5xx, sedang diproses) = tidak pasti: order mungkin sudah tersimpan.
 */
export function isUncertainSubmitError(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
  if (status === 0) return true;
  if (status === 408 || status === 409 || status === 429) return true;
  return status >= 500;
}

/** Tandai percobaan sebagai tidak pasti bila error-nya tidak pasti. */
export function markAttemptAfterError(attempt: IdempotencyAttempt, error: unknown): IdempotencyAttempt {
  return isUncertainSubmitError(error) ? { ...attempt, uncertain: true } : { ...attempt, uncertain: false };
}

export const UNCERTAIN_SUBMIT_MESSAGE =
  "Status pembayaran belum pasti (koneksi/server bermasalah). Jangan buat order baru — tekan bayar lagi: sistem mengecek order yang sama di server, tidak akan tercatat dobel.";

/**
 * Pesan untuk kasir setelah submit gagal. Kunci sama + isi berbeda (server: IDEMPOTENCY_MISMATCH,
 * audit POS 24 Nov 2026 S4/K6) berarti percobaan sebelumnya SUDAH tersimpan dengan isi lain —
 * tampilkan pesan server apa adanya (cek Riwayat struk), bukan pesan "belum pasti" umum.
 * Kunci tetap ditandai tidak pasti agar tekan ulang tidak pernah membuat order kedua diam-diam.
 */
export function submitErrorMessage(error: unknown, fallback: string) {
  if ((error as { code?: unknown } | null)?.code === "IDEMPOTENCY_MISMATCH" && error instanceof Error) return error.message;
  if (isUncertainSubmitError(error)) return UNCERTAIN_SUBMIT_MESSAGE;
  return error instanceof Error ? error.message : fallback;
}
