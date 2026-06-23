import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { calculateBillingTotals } from "@/lib/garage-billing";
import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// SETTINGS WIRING — TEST INTEGRASI: pengaturan benar-benar mengontrol transaksi.
// Owner ubah Service Charge & PB1 di Settings → total order kasir IKUT berubah.
// Membuktikan menu Pengaturan tidak "mati" (terhubung ke perhitungan POS).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let createOrder: any;
let updateAppSettings: any;
let getAppSettings: any;
let outletId = "";
const KASIR = "user-itest-kasir";
const OWNER = "user-itest-owner";

function sess(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Dev-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function orderOneCoffee() {
  return createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 100_000,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    },
    sess(KASIR, "Kasir Test", "Kasir"),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  await t
    .getDb()
    .insert(t.schema.user)
    .values({ id: OWNER, name: "Owner Test", email: `${OWNER}@garage.local` });

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
  updateAppSettings = svc.updateAppSettings;
  getAppSettings = svc.getAppSettings;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Settings → POS: service charge & PB1 mengontrol total transaksi", () => {
  it("owner ubah serviceChargePct & taxPct → tersimpan & terbaca per outlet", async () => {
    await updateAppSettings(
      outletId,
      { serviceChargePct: 10, taxPct: 12 },
      sess(OWNER, "Owner Test", "Owner / CEO"),
    );
    const s = await getAppSettings(outletId);
    expect(s.serviceChargePct).toBe(10);
    expect(s.taxPct).toBe(12);
  });

  it("order kasir memakai persentase baru (kopi 20.000 → service 2.000, PB1 2.640)", async () => {
    const res = await orderOneCoffee();
    const settings = await getAppSettings(outletId);
    const expected = calculateBillingTotals(20_000, settings);

    expect(res.service).toBe(2_000); // 10% * 20.000
    expect(res.tax).toBe(2_640); // 12% * (20.000 + 2.000)
    expect(res.service).toBe(expected.service);
    expect(res.tax).toBe(expected.tax);
    expect(res.total).toBe(expected.grossTotal);
  });

  it("ubah lagi ke 0% → order berikutnya tanpa service & pajak", async () => {
    await updateAppSettings(
      outletId,
      { serviceChargePct: 0, taxPct: 0 },
      sess(OWNER, "Owner Test", "Owner / CEO"),
    );
    const res = await orderOneCoffee();
    expect(res.service).toBe(0);
    expect(res.tax).toBe(0);
    expect(res.total).toBe(res.subtotal);
  });
});
