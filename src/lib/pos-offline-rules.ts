// =============================================================================
// Aturan murni mode jual offline POS (Fase 4, owner 25 Nov 2026).
// - Batas Owner: maks 50 penjualan tertunda dan 8 jam sejak penjualan tertunda tertua.
// - Klasifikasi respons sinkron: sukses / ulangi nanti / ditolak permanen (perlu ditinjau, tidak pernah dibuang).
// - Nomor sementara struk: OFF-<perangkat>-<urut>.
// Tanpa IndexedDB/DOM supaya bisa dites di Node.
// =============================================================================

export const OFFLINE_MAX_ORDERS = 50;
export const OFFLINE_MAX_AGE_MS = 8 * 60 * 60_000;
/** Item sinkron per putaran worker (antrean dikuras, bukan 1 order per 30 dtk). */
export const OFFLINE_SYNC_BATCH = 20;

export type OfflineQueueEntry = { createdAt: number; status: string; permanent?: boolean };

/** Alasan penjualan offline BARU ditolak (null = boleh). */
export function offlineSaleBlockReason(queue: readonly OfflineQueueEntry[], now: number): string | null {
  const waiting = queue.filter((entry) => entry.status !== "synced");
  if (waiting.length >= OFFLINE_MAX_ORDERS) {
    return `Antrean offline penuh (${OFFLINE_MAX_ORDERS} penjualan). Tunggu koneksi kembali dan sinkron dulu.`;
  }
  const oldest = waiting.reduce<number | null>((min, entry) => (min === null || entry.createdAt < min ? entry.createdAt : min), null);
  if (oldest !== null && now - oldest >= OFFLINE_MAX_AGE_MS) {
    return "Penjualan offline tertua sudah 8 jam belum terkirim. Sambungkan internet dan sinkron dulu sebelum jualan offline lagi.";
  }
  return null;
}

export type SyncOutcome = "synced" | "retry" | "permanent";

/**
 * Status HTTP (0 = jaringan putus) + kode error server → hasil sinkron.
 * `IDEMPOTENCY_MISMATCH` (kunci sudah dipakai isi lain) dan `OFFLINE_SHIFT_CLOSED` (shift saat jual sudah tutup)
 * tidak akan berubah dengan diulang → permanen, tampil di "Perlu ditinjau".
 */
export function classifySyncResponse(status: number, code?: string | null): SyncOutcome {
  if (status >= 200 && status < 300) return "synced";
  if (code === "IDEMPOTENCY_MISMATCH" || code === "OFFLINE_SHIFT_CLOSED") return "permanent";
  if (status === 0 || status === 408 || status === 409 || status === 429 || status >= 500) return "retry";
  if (status >= 400) return "permanent";
  return "retry";
}

/** Jeda sebelum percobaan ulang ke-n (30 dtk, 60 dtk, … maks 10 mnt). */
export function retryDelayMs(attempts: number) {
  if (attempts <= 0) return 0;
  return Math.min(10 * 60_000, 30_000 * 2 ** (attempts - 1));
}

export function isRetryDue(entry: { attempts: number; updatedAt: number }, now: number) {
  return now - entry.updatedAt >= retryDelayMs(entry.attempts);
}

/** Kode perangkat untuk nomor sementara: huruf/angka saja, maks 12, default "POS". */
export function offlineDeviceCode(deviceLabel: string | null | undefined) {
  const code = (deviceLabel ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return code || "POS";
}

/** Nomor sementara struk offline, mis. OFF-KASIR1-0007 (urut per perangkat). */
export function makeOfflineNo(deviceLabel: string | null | undefined, sequence: number) {
  return `OFF-${offlineDeviceCode(deviceLabel)}-${String(Math.max(1, Math.floor(sequence))).padStart(4, "0")}`;
}

/** Baris catatan di struk sementara. */
export const OFFLINE_RECEIPT_NOTE = "STRUK SEMENTARA — dijual saat offline. Nomor resmi menyusul setelah sinkron.";
