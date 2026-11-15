// Sumber QRIS merchant tunggal untuk semua layar (POS, menu digital, invoice,
// layar pelanggan). QRIS aktif sejak 15 Nov 2026: BNI (acquirer 93600009),
// NMID ID1026637608138, nama di QR "GARAGE COFFEE*" — dicek dengan decode isi QR
// (CRC A70F valid). Menggantikan QRIS BNI sebelumnya (NMID ID1026601785003) dan
// QRIS lama "G A R A G E MINUMAN" (SpeedCash, NMID ID1026525964734).
// Ganti gambar? Taruh PNG baru di public/payments/qris-garage.png, perbarui
// NMID & naikkan QRIS_IMAGE_VERSION agar cache browser/CDN memuat gambar baru.
export const QRIS_MERCHANT = {
  name: "GARAGE COFFEE",
  nmid: "ID1026637608138",
  acquirer: "BNI",
  acquirerId: "93600009",
} as const;

export const QRIS_IMAGE_VERSION = "bni-2026-11-15";
export const QRIS_IMAGE_SRC = `/payments/qris-garage.png?v=${QRIS_IMAGE_VERSION}`;
