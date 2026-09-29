import { errorJson } from "@/lib/member-types";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Tanpa reverse proxy (server langsung di LAN outlet) route handler tidak tahu
// IP klien: SEMUA HP pelanggan & tablet staf jatuh ke satu ember bersama.
// Dulu ember bersama memakai batas per-IP apa adanya → saat ramai (uji beban
// QA-audit: 30 pelanggan) 52% polling status order ditolak 429. Ember bersama
// kini diberi batas N× lipat (default 20×, atur GARAGE_RATE_LIMIT_SHARED_MULTIPLIER).
// Proteksi brute-force yang sebenarnya ada di penguncian per akun (lihat
// pin-guard & garage-login-attempts-service), bukan di pembatas per-IP ini.
function sharedMultiplier() {
  const value = Number(process.env.GARAGE_RATE_LIMIT_SHARED_MULTIPLIER ?? 20);
  return Number.isFinite(value) && value >= 1 ? value : 20;
}

export function rateLimitClientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

export function rateLimit(
  request: Request,
  namespace: string,
  options: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
) {
  const ip = rateLimitClientIp(request);
  const key = `${namespace}:${ip ?? "shared"}`;
  const limit = ip ? options.limit : options.limit * sharedMultiplier();
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  current.count += 1;
  if (current.count > limit) {
    return errorJson(429, "Terlalu banyak request. Coba lagi sebentar.");
  }

  return null;
}
