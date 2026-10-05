import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Bandingkan rahasia (CRON_SECRET, token job) dalam waktu konstan. Kedua sisi
 * di-hash dulu agar panjang tidak bocor dan timingSafeEqual tidak melempar.
 * Rahasia kosong/tidak diatur selalu ditolak.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined) {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
