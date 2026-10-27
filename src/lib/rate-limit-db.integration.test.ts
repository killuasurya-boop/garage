import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// API key agent AI: buat/simpan hash, sesi sintetis per scope, cabut/kedaluwarsa,
// path terlarang, baca-saja, tool & MCP, jejak Audit atas nama agent.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let keys: typeof import("@/lib/agent-api-key");
let outletId = "";
const OWNER = "user-agent-owner";

function ownerSession(): GarageSession {
  return {
    session: {} as GarageSession["session"],
    user: { id: OWNER, name: "Owner Garage" } as GarageSession["user"],
    profile: {
      id: "sp-owner",
      role: "Owner",
      shiftLabel: "Pagi",
      deviceLabel: "Laptop Owner",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as GarageSession;
}

function req(key: string, method = "GET", path = "/api/agent/v1/me") {
  return new Headers({ authorization: `Bearer ${key}`, "x-garage-agent-method": method, "x-garage-agent-path": path });
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop Owner" } as any).onConflictDoNothing();
  keys = await import("@/lib/agent-api-key");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

// =============================================================================
// F-06: rate limit persisten (rate_limit_counters). Penghitung atomik di DB:
// tahan restart (modul dimuat ulang), tepat saat permintaan bersamaan, jendela
// baru mulai dari 0; dipakai API key agent & gateway MCP ChatGPT.
// =============================================================================

async function seedCounter(bucket: string, count: number, windowMs = 60_000) {
  const nowMs = Date.now();
  const windowStart = new Date(nowMs - (nowMs % windowMs));
  await t.getDb().insert(t.schema.rateLimitCounters).values({ bucket, windowStart, count }).onConflictDoUpdate({
    target: [t.schema.rateLimitCounters.bucket, t.schema.rateLimitCounters.windowStart],
    set: { count },
  });
}

describe("rate limit persisten (F-06)", () => {
  it("menghitung per jendela; melewati batas = limited; jendela baru mulai dari 1", async () => {
    const { hitRateLimit } = await import("@/lib/rate-limit-db");
    const now = new Date("2026-11-01T10:00:30Z");
    const opts = { limit: 3, windowMs: 60_000, now };
    expect((await hitRateLimit("uji:a", opts)).count).toBe(1);
    await hitRateLimit("uji:a", opts);
    expect((await hitRateLimit("uji:a", opts)).limited).toBe(false);
    const fourth = await hitRateLimit("uji:a", opts);
    expect(fourth).toMatchObject({ limited: true, count: 4 });
    expect(fourth.resetAt.toISOString()).toBe("2026-11-01T10:01:00.000Z");
    expect((await hitRateLimit("uji:a", { ...opts, now: new Date("2026-11-01T10:01:05Z") })).count).toBe(1);
    expect((await hitRateLimit("uji:b", opts)).count).toBe(1);
  });

  it("tahan restart: modul dimuat ulang tetap melanjutkan hitungan", async () => {
    const now = new Date("2026-11-01T11:00:10Z");
    const first = await import("@/lib/rate-limit-db");
    await first.hitRateLimit("uji:restart", { limit: 5, windowMs: 60_000, now });
    await first.hitRateLimit("uji:restart", { limit: 5, windowMs: 60_000, now });
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("@/lib/rate-limit-db");
    expect(fresh).not.toBe(first);
    expect((await fresh.hitRateLimit("uji:restart", { limit: 5, windowMs: 60_000, now })).count).toBe(3);
  });

  it("permintaan bersamaan dihitung tepat (tanpa kehilangan increment)", async () => {
    const { hitRateLimit } = await import("@/lib/rate-limit-db");
    const now = new Date("2026-11-01T12:00:00Z");
    const results = await Promise.all(Array.from({ length: 25 }, () => hitRateLimit("uji:race", { limit: 20, windowMs: 60_000, now })));
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(results.filter((r) => r.limited)).toHaveLength(5);
  });

  it("API key agent: hitungan dari DB → 429 AGENT_RATE_LIMITED", async () => {
    const created = await keys.createAgentKey({ label: "Rate Limit F06", scope: "owner", expiresInDays: 30 }, ownerSession());
    expect((await keys.resolveAgentSession(created.key, req(created.key))).response).toBeNull();
    const [row] = await t.getDb().select().from(t.schema.agentApiKeys).where((await import("drizzle-orm")).eq(t.schema.agentApiKeys.label, "Rate Limit F06"));
    await seedCounter(`agent-key:${row.id}`, 120);
    const limited = await keys.resolveAgentSession(created.key, req(created.key));
    expect(limited.response?.status).toBe(429);
    expect(JSON.stringify(await limited.response!.json())).toContain("AGENT_RATE_LIMITED");
  });

  it("MCP ChatGPT: batas per akun Owner → 429 RATE_LIMITED", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.user).set({ twoFactorEnabled: true } as any).where(eq(t.schema.user.id, OWNER));
    const { handleMcpChatgptRequest } = await import("@/lib/mcp-chatgpt-gateway");
    const body = () => new Request("http://localhost/api/mcp/chatgpt", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
    expect((await handleMcpChatgptRequest(body(), { sub: OWNER } as any)).status).toBe(200);
    await seedCounter(`mcp-chatgpt:${OWNER}`, 60);
    const response = await handleMcpChatgptRequest(body(), { sub: OWNER } as any);
    expect(response.status).toBe(429);
    expect(JSON.stringify(await response.json())).toContain("RATE_LIMITED");
  });
});
