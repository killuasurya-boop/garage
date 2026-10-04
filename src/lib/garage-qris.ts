// Sumber QRIS merchant tunggal untuk semua layar (POS, menu digital, invoice,
// layar pelanggan). QRIS aktif: BNI (acquirer 93600009), dicek dengan decode
// isi QR — bukan QRIS lama "G A R A G E MINUMAN" (SpeedCash, NMID ID1026525964734).
// Ganti gambar? Taruh PNG baru di public/payments/qris-garage.png, perbarui
// NMID & naikkan QRIS_IMAGE_VERSION agar cache browser/CDN memuat gambar baru.
export const QRIS_MERCHANT = {
  name: "GARAGE COFFEE",
  nmid: "ID1026601785003",
  acquirer: "BNI",
  acquirerId: "93600009",
} as const;

export const QRIS_IMAGE_VERSION = "bni-2026-09";
export const QRIS_IMAGE_SRC = `/payments/qris-garage.png?v=${QRIS_IMAGE_VERSION}`;
