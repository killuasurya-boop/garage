import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit #13: rate limit Better Auth (login, kode 2FA) memakai tabel rate_limit — tahan restart.
let t: GarageTestDb;

beforeAll(async () => {
  t = await setupGarageTestDb();
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("rate limit Better Auth di database", () => {
  it("konfigurasi memakai storage database + aturan login & 2FA tetap", async () => {
    const { auth } = await import("@/lib/auth");
    const ctx = await auth.$context;
    expect(ctx.rateLimit.storage).toBe("database");
    expect(ctx.rateLimit.customRules?.["/sign-in/email"]).toMatchObject({ window: 60, max: 40 });
    expect(ctx.rateLimit.customRules?.["/two-factor/verify-totp"]).toMatchObject({ window: 60, max: 6 });
  });

  it("tabel rate_limit ada & bisa ditulis lewat adapter Better Auth", async () => {
    const { auth } = await import("@/lib/auth");
    const ctx = await auth.$context;
    await ctx.adapter.create({ model: "rateLimit", data: { key: "1.2.3.4|/sign-in/email", count: 3, lastRequest: Date.now() } });
    const row = await ctx.adapter.findOne<{ count: number }>({ model: "rateLimit", where: [{ field: "key", value: "1.2.3.4|/sign-in/email" }] });
    expect(row?.count).toBe(3);
    const { sql } = await import("drizzle-orm");
    const rows = await t.getDb().execute(sql`select count(*)::int as n from rate_limit`);
    expect(Number((rows as unknown as { rows: Array<{ n: number }> }).rows?.[0]?.n ?? (rows as unknown as Array<{ n: number }>)[0]?.n)).toBe(1);
  });
});
