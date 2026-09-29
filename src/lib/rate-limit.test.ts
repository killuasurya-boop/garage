import { afterEach, describe, expect, it, vi } from "vitest";

import { rateLimit } from "@/lib/rate-limit";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api/test", { headers });

describe("rateLimit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("per-IP: menolak setelah batas terlampaui", () => {
    const ns = `t-ip-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) expect(rateLimit(req({ "x-real-ip": "1.1.1.1" }), ns, { limit: 3, windowMs: 60_000 })).toBeNull();
    expect(rateLimit(req({ "x-real-ip": "1.1.1.1" }), ns, { limit: 3, windowMs: 60_000 })?.status).toBe(429);
    // IP lain punya ember sendiri.
    expect(rateLimit(req({ "x-real-ip": "2.2.2.2" }), ns, { limit: 3, windowMs: 60_000 })).toBeNull();
  });

  it("tanpa header IP (LAN tanpa proxy): ember bersama diberi batas berlipat", () => {
    vi.stubEnv("GARAGE_RATE_LIMIT_SHARED_MULTIPLIER", "10");
    const ns = `t-shared-${Math.random()}`;
    for (let i = 0; i < 30; i += 1) expect(rateLimit(req(), ns, { limit: 3, windowMs: 60_000 })).toBeNull();
    expect(rateLimit(req(), ns, { limit: 3, windowMs: 60_000 })?.status).toBe(429);
  });

  it("X-Forwarded-For dipakai bila X-Real-IP tidak ada", () => {
    const ns = `t-xff-${Math.random()}`;
    expect(rateLimit(req({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" }), ns, { limit: 1, windowMs: 60_000 })).toBeNull();
    expect(rateLimit(req({ "x-forwarded-for": "3.3.3.3" }), ns, { limit: 1, windowMs: 60_000 })?.status).toBe(429);
  });
});
