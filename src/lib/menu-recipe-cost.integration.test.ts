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
// HPP MENU LIVE DARI BAHAN BAKU — HPP varian = Σ(qty resep × HPP bahan terkini),
// bukan angka tertulis / patokan persen. Ikut berubah saat HPP bahan berubah.
// HPP bahan boleh pecahan (Rp/ml) dan disimpan 4 desimal.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let cost: typeof import("@/lib/menu-recipe-cost");
let outletId = "";

const owner = (): GarageSession =>
  ({
    user: { id: "user-itest", name: "Owner Test", email: "user-itest@garage.id" },
    profile: {
      id: "sp-user-itest",
      role: "Owner" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

async function addInventory(sku: string, unit: string, unitCost: number) {
  await t.getDb().insert(t.schema.inventoryItems).values({
    sku,
    name: sku,
    alternativeName: "-",
    category: "Bar",
    usageArea: "bar",
    unit,
    packageSize: `1 ${unit}`,
    unitCost,
    onHand: 0,
    min: 0,
    status: "safe",
    movement: "",
  });
}

async function variantCost(itemId: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select({ baseCost: t.schema.menuVariants.baseCost })
    .from(t.schema.menuVariants)
    .where(eq(t.schema.menuVariants.itemId, itemId));
  return Number(row?.baseCost);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t));
  svc = await import("@/lib/garage-service");
  cost = await import("@/lib/menu-recipe-cost");

  await addInventory("T-MILK", "ml", 23.8);
  await addInventory("T-BEAN", "gr", 190);
  await addInventory("T-CUP", "pcs", 500);
  await t.getDb().insert(t.schema.menuRecipes).values([
    { menuItemId: "itm-coffee", variantId: "all", inventorySku: "T-MILK", qty: 120, unit: "ml" },
    { menuItemId: "itm-coffee", variantId: "all", inventorySku: "T-BEAN", qty: 18, unit: "gr" },
    { menuItemId: "itm-coffee", variantId: "all", inventorySku: "T-CUP", qty: 1, unit: "pcs" },
  ]);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("syncRecipeBaseCosts — HPP dari bahan baku", () => {
  it("varian ber-resep = Σ qty × HPP bahan (120 ml × 23,8 + 18 gr × 190 + 1 cup × 500)", async () => {
    await cost.syncRecipeBaseCosts(t.getDb());
    expect(await variantCost("itm-coffee")).toBe(2856 + 3420 + 500);
  });

  it("varian tanpa resep tidak disentuh (HPP 0 = belum ada resep)", async () => {
    expect(await variantCost("itm-food")).toBe(0);
  });

  it("HPP bahan berubah lewat edit Gudang → HPP menu ikut berubah (live)", async () => {
    await svc.updateInventoryItem("T-MILK", { unitCost: 25.5 }, owner());
    expect(await variantCost("itm-coffee")).toBe(120 * 25.5 + 3420 + 500);
  });

  it("HPP bahan pecahan disimpan 4 desimal (Rp115.000 / 760 ml)", async () => {
    const item = await svc.updateInventoryItem("T-MILK", { unitCost: 115000 / 760 }, owner());
    expect(Number(item?.unitCost ?? item?.item?.unitCost)).toBeCloseTo(151.3158, 4);
    expect(await variantCost("itm-coffee")).toBe(Math.round(120 * 151.3158 + 3420 + 500));
  });
});
