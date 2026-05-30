import { errorJson } from "@/lib/member-types";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(
  request: Request,
  namespace: string,
  options: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
) {
  const ip = request.headers.get("x-real-ip")?.trim() || "local";
  const key = `${namespace}:${ip}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  current.count += 1;
  if (current.count > options.limit) {
    return errorJson(429, "Terlalu banyak request. Coba lagi sebentar.");
  }

  return null;
}
