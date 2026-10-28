import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setupGarageTestDb, seedGarageBasics, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Kebijakan 2FA wajib Owner/Manajer ditegakkan di API (requireGarageSession),
// bukan hanya di halaman. Sesi Better Auth & header request di-mock.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const state = vi.hoisted(() => ({
  headers: new Headers(),
  session: null as null | { user: Record<string, unknown>; session: Record<string, unknown> },
}));

vi.mock("next/headers", () => ({
  headers: async () => state.headers,
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));

let t: GarageTestDb;
let requireGarageSession: typeof import("@/lib/server-auth").requireGarageSession;
let outletId = "";
const OWNER = "user-2fa-owner";
const KASIR = "user-2fa-kasir";

function as(userId: string, twoFactorEnabled: boolean, apiPath: string | null) {
  state.session = {
    user: { id: userId, name: userId, twoFactorEnabled },
    session: { createdAt: new Date().toISOString() },
  };
  state.headers = new Headers(apiPath ? { "x-garage-api-path": apiPath } : {});
}

async function setPolicy(on: boolean) {
  const d = t.getDb();
  const { appSettings } = t.schema;
  await d.delete(appSettings).where((await import("drizzle-orm")).eq(appSettings.key, "securityRequire2faForOwner"));
  await d.insert(appSettings).values({ key: "securityRequire2faForOwner", valueJson: on, outletId: null } as any);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  const d = t.getDb();
  await d.insert(t.schema.user).values({ id: KASIR, name: "Kasir", email: `${KASIR}@garage.id` } as any);
  await d
    .insert(t.schema.staffProfiles)
    .values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop" } as any)
    .onConflictDoNothing();
  await d
    .insert(t.schema.staffProfiles)
    .values({ userId: KASIR, role: "Kasir", outletId, shiftLabel: "Pagi", deviceLabel: "Tablet" } as any)
    .onConflictDoNothing();
  ({ requireGarageSession } = await import("@/lib/server-auth"));
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("2FA wajib di API", () => {
  beforeEach(async () => {
    await setPolicy(true);
  });

  it("Owner tanpa 2FA ditolak di API saat kebijakan aktif", async () => {
    as(OWNER, false, "/api/finance/overview");
    const result = await requireGarageSession();
    expect(result.response?.status).toBe(403);
    expect(await result.response?.json()).toMatchObject({ error: { code: "TWO_FACTOR_REQUIRED" } });
  });

  it("Owner dengan 2FA lolos", async () => {
    as(OWNER, true, "/api/finance/overview");
    const result = await requireGarageSession();
    expect(result.response).toBeNull();
    expect(result.data?.profile.role).toBe("Owner");
  });

  it("ganti password & /api/me tetap terbuka tanpa 2FA", async () => {
    for (const path of ["/api/account/password", "/api/me"]) {
      as(OWNER, false, path);
      expect((await requireGarageSession()).response).toBeNull();
    }
  });

  it("halaman (tanpa header path) tidak diblok — redirect tetap urusan page-access", async () => {
    as(OWNER, false, null);
    expect((await requireGarageSession()).response).toBeNull();
  });

  it("Kasir tidak terkena kebijakan Owner/Manajer", async () => {
    as(KASIR, false, "/api/orders");
    expect((await requireGarageSession()).response).toBeNull();
  });

  it("kebijakan nonaktif → Owner tanpa 2FA tetap lolos (perilaku lama)", async () => {
    await setPolicy(false);
    as(OWNER, false, "/api/finance/overview");
    expect((await requireGarageSession()).response).toBeNull();
  });
});
