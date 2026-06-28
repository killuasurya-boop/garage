import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// HAPUS PRODUK (Menu Jualan) — guard: hapus permanen hanya jika belum pernah
// terjual. Data sumber guard = getMenuProductOrderCount.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const USER = "user-itest";

function session(): GarageSession {
  return {
    user: { id: USER, name: "Owner Test" },
    profile: {
      id: "sp",
      role: "Owner / CEO" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Dev",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: USER });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Hapus produk — guard berdasarkan riwayat penjualan", () => {
  it("produk belum terjual → order count 0, bisa dihapus permanen", async () => {
    expect(await svc.getMenuProductOrderCount("itm-food")).toBe(0);
    const res = await svc.deleteMenuProduct("itm-food", session());
    expect(res?.status).toBe("deleted");

    const { eq } = await import("drizzle-orm");
    const rows = await t
      .getDb()
      .select()
      .from(t.schema.menuItems)
      .where(eq(t.schema.menuItems.id, "itm-food"));
    expect(rows.length).toBe(0);
  });

  it("produk yang sudah terjual → order count > 0 (guard akan memblokir hapus)", async () => {
    await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      },
      session(),
    );
    expect(await svc.getMenuProductOrderCount("itm-coffee")).toBeGreaterThanOrEqual(1);
  });
});
