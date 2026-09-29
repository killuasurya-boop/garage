// Kebijakan retensi data untuk fitur "Maintenance Database — Auto Purge".
// Order/penjualan & pembayaran tidak pernah di-purge (catatan keuangan).

/** Persetujuan void/refund/diskon/kas = bukti kontrol keuangan → simpan minimal 1 tahun. */
export const APPROVAL_MIN_RETENTION_DAYS = 365;

export const APPROVAL_DONE_STATUSES = ["approved", "rejected", "cancelled"];
