// Pembatas percobaan gagal untuk PIN & aksi sensitif (in-memory, per proses).
// Beda dari rateLimit per-IP: menghitung KEGAGALAN dalam jendela panjang lalu
// mengunci, supaya tebak PIN pelan-pelan (mis. 7x/menit) tetap terhenti.

type Bucket = { fails: number[]; lockedUntil: number };

export type GuardPolicy = { maxFails: number; windowMs: number; lockMs: number };

const buckets = new Map<string, Bucket>();

/** PIN persetujuan di tablet: 5 salah / 15 menit → kunci 15 menit. */
export const APPROVAL_PIN_POLICY: GuardPolicy = { maxFails: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
/** Batas per outlet (semua akun kasir digabung) agar tidak bisa dipecah ke banyak akun. */
export const APPROVAL_PIN_OUTLET_POLICY: GuardPolicy = { maxFails: 12, windowMs: 60 * 60_000, lockMs: 30 * 60_000 };
/** Login member per nomor HP/email: 8 salah / 15 menit → kunci 15 menit (IP bisa dipalsukan). */
export const MEMBER_LOGIN_POLICY: GuardPolicy = { maxFails: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
/** Ganti PIN / atur PIN staf: password salah atau PIN bentrok → 5 / jam → kunci 1 jam. */
export const PIN_CHANGE_POLICY: GuardPolicy = { maxFails: 5, windowMs: 60 * 60_000, lockMs: 60 * 60_000 };

function recentFails(bucket: Bucket, policy: GuardPolicy, now: number) {
  return bucket.fails.filter((time) => now - time < policy.windowMs);
}

/** Detik tersisa bila terkunci, null bila boleh mencoba. */
export function guardLockedFor(key: string, now = Date.now()): number | null {
  const bucket = buckets.get(key);
  if (!bucket || bucket.lockedUntil <= now) return null;
  return Math.ceil((bucket.lockedUntil - now) / 1000);
}

export function guardRecordFail(key: string, policy: GuardPolicy, now = Date.now()) {
  const bucket = buckets.get(key) ?? { fails: [], lockedUntil: 0 };
  bucket.fails = [...recentFails(bucket, policy, now), now];
  if (bucket.fails.length >= policy.maxFails) {
    bucket.lockedUntil = now + policy.lockMs;
    bucket.fails = [];
  }
  buckets.set(key, bucket);
}

export function guardReset(key: string) {
  buckets.delete(key);
}

export function lockedMessage(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`;
}
