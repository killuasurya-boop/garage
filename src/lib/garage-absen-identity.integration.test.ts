import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// SATU AKUN per karyawan: akun login yang sama dipakai absen (kode + PIN),
// gaji, dan fee — ensureAbsenIdentity memasang kode absen ke akun login.
// =============================================================================

let t: GarageTestDb;
let outletId = "";

async function loginUser(id: string, role: string, position: string | null) {
  await t.getDb().insert(t.schema.user).values({ id, name: id, email: `${id}@garage.id` });
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: id, outletId, role, position });
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-seed" })).outletId;
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("ensureAbsenIdentity", () => {
  it("memasang kode absen + PIN ke akun login, lalu absen kode+PIN menemukan akun yang sama", async () => {
    const { ensureAbsenIdentity } = await import("@/lib/garage-absen-employees");
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    await loginUser("kasir-one", "Kasir", "Kasir");

    const result = await ensureAbsenIdentity("kasir-one", { code: "KSR1", position: "Kasir", role: "Kasir" });
    expect(result.code).toBe("KSR1");
    expect(result.created).toBe(true);
    expect(result.pin).toMatch(/^\d{6}$/);

    const employee = await resolveAbsenEmployee({ code: "ksr1", pin: result.pin!, ip: "test" });
    expect(employee.staffUserId).toBe("kasir-one"); // absen = akun login, bukan akun terpisah
  });

  it("idempoten: dipanggil ulang tidak membuat baris/PIN baru", async () => {
    const { ensureAbsenIdentity } = await import("@/lib/garage-absen-employees");
    const again = await ensureAbsenIdentity("kasir-one", { code: "KSR1", position: "Kasir", role: "Kasir" });
    expect(again).toEqual({ code: "KSR1", pin: null, created: false });
  });

  it("kode otomatis bernomor per jabatan bila tidak ditentukan (BAR1, BAR2)", async () => {
    const { ensureAbsenIdentity } = await import("@/lib/garage-absen-employees");
    await loginUser("barista-a", "Kasir", "Barista");
    await loginUser("barista-b", "Kasir", "Barista");
    const a = await ensureAbsenIdentity("barista-a", { position: "Barista", role: "Kasir", generatePin: false });
    const b = await ensureAbsenIdentity("barista-b", { position: "Barista", role: "Kasir", generatePin: false });
    expect([a.code, b.code]).toEqual(["BAR1", "BAR2"]);
    expect(a.pin).toBeNull();
  });

  it("menolak kode yang sudah dipakai akun lain", async () => {
    const { ensureAbsenIdentity } = await import("@/lib/garage-absen-employees");
    await loginUser("waiter-x", "Waiter", "Waiter");
    await expect(
      ensureAbsenIdentity("waiter-x", { code: "KSR1", position: "Waiter", role: "Waiter" }),
    ).rejects.toThrow(/sudah dipakai/);
  });
});
