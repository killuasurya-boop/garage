// Idempotency key sisi klien untuk submit pembayaran/order.
// Key hanya melindungi dari order dobel bila DIPAKAI ULANG saat retry: kalau
// respons hilang (WiFi tablet putus) padahal order sudah tersimpan, kasir klik
// "Bayar" lagi → key sama → server mengembalikan order yang sudah ada.
// Isi request berubah (keranjang/metode bayar diganti) → key baru.

export type IdempotencyAttempt = { fingerprint: string; key: string };

export function idempotencyAttemptFor(
  previous: IdempotencyAttempt | null | undefined,
  body: unknown,
  makeKey: () => string,
): IdempotencyAttempt {
  const fingerprint = JSON.stringify(body);
  if (previous && previous.fingerprint === fingerprint) return previous;
  return { fingerprint, key: makeKey() };
}
