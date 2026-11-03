import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// TEST INTEGRASI SLA v2: S1 target tiket dari waktu prep menu (hanya bila
// pengaturan aktif), dan papan produksi membawa konfigurasi SLA outlet.
// Seed: Kopi Test prep 5m (Bar), Nasi Test prep 15m (Dapur).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let outletId = "";
const OWNER = "user-itest-sla-owner";

function owner(): GarageSession {
  return {
    user: { id: OWNER, name: "Owner SLA" },
    profile: {
      id: `sp-${OWNER}`,
      role: "Owner" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "SLA-V2",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function order(table: string) {
  return svc.createOrder(
    {
      orderType: "dine-in",
      tableNumber: table,
      guestName: "SLA",
      paymentMethod: "Cash",
      cashReceived: 500_000,
      items: [
        { itemId: "itm-coffee", variantId: "reg", qty: 1 },
        { itemId: "itm-food", variantId: "reg", qty: 1 },
      ],
    },
    owner(),
  );
}

async function targets(orderNo: string) {
  const { eq } = await import("drizzle-orm");
  const rows = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderNo, orderNo));
  return Object.fromEntries(rows.map((r: any) => [r.station, r.targetMinutes]));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("SLA v2 — S1 target per menu", () => {
  it("bawaan MATI: target tiket = target station dari Pengaturan", async () => {
    await svc.updateAppSettings(outletId, { productionTargetBarMinutes: 7, productionTargetFoodMinutes: 20 }, owner());
    const res = await order("21");
    expect(await targets(res.orderNo)).toEqual({ Bar: 7, Food: 20 });
  });

  it("AKTIF: target tiket = waktu prep menu (Kopi 5m, Nasi 15m)", async () => {
    await svc.updateAppSettings(outletId, { productionTargetFromMenu: true }, owner());
    const res = await order("22");
    expect(await targets(res.orderNo)).toEqual({ Bar: 5, Food: 15 });
  });

  it("menu tanpa prep valid jatuh ke target station", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.menuItems).set({ prep: "cepat" }).where(eq(t.schema.menuItems.id, "itm-coffee"));
    const res = await order("23");
    expect(await targets(res.orderNo)).toEqual({ Bar: 7, Food: 15 });
  });

  it("papan produksi membawa konfigurasi SLA outlet", async () => {
    await svc.updateAppSettings(outletId, { productionDeliverTargetMinutes: 6, productionBusyThreshold: 0 }, owner());
    const board = await prod.getProductionBoard(owner());
    expect(board.sla).toMatchObject({ deliverTargetMinutes: 6, busyThreshold: 0, startTargetMinutes: 3 });
  });
});
