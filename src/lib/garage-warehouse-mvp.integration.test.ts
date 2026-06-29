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
// WAREHOUSE MVP — TDD edge case auto-potong stok + stok masuk (DB nyata).
// Memastikan: additif (varian + "all" dijumlah, konsisten dgn HPP), waste%,
// anti-minus (stok tak < 0), toggle off, stok masuk menambah, stok keluar guard.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const KASIR = "user-itest-kasir";

function session(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Test" },
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

async function addMenu(id: string) {
  await t.getDb().insert(t.schema.menuItems).values({
    id,
    name: id,
    category: "Coffee",
    section: "Coffee",
    prep: "5m",
  });
  await t.getDb().insert(t.schema.menuVariants).values({
    itemId: id,
    variantId: "reg",
    label: "Regular",
    price: 20_000,
  });
}
async function addBahan(sku: string, onHand: number) {
  await t.getDb().insert(t.schema.inventoryItems).values({
    sku,
    name: sku,
    alternativeName: "-",
    category: "Bar",
    usageArea: "bar",
    unit: "gram",
    packageSize: "1000 gram",
    onHand,
    min: 50,
    status: "safe",
    movement: "-",
  });
}
async function addRecipe(menuId: string, sku: string, qty: number, variantId = "all", wastePct = 0) {
  await t.getDb().insert(t.schema.menuRecipes).values({
    menuItemId: menuId,
    variantId,
    inventorySku: sku,
    qty,
    unit: "gram",
    wastePct,
    status: "active",
  });
}
async function onHandOf(sku: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.inventoryItems)
    .where(eq(t.schema.inventoryItems.sku, sku));
  return row?.onHand ?? null;
}
async function sell(menuId: string, qty: number) {
  await svc.createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 100_000,
      items: [{ itemId: menuId, variantId: "reg", qty }],
    },
    session(),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Auto-potong stok — edge case", () => {
  it("ADDITIF: resep 'all' + resep varian dua-duanya dipotong", async () => {
    await addMenu("m-add");
    await addBahan("B-milk", 1000);
    await addBahan("B-shot", 1000);
    await addRecipe("m-add", "B-milk", 100, "all");
    await addRecipe("m-add", "B-shot", 18, "reg");
    await sell("m-add", 1);
    expect(await onHandOf("B-milk")).toBe(900); // dari resep 'all'
    expect(await onHandOf("B-shot")).toBe(982); // dari resep varian
  });

  it("waste% menambah konsumsi (100 + 10% = 110)", async () => {
    await addMenu("m-waste");
    await addBahan("B-w", 1000);
    await addRecipe("m-waste", "B-w", 100, "all", 10);
    await sell("m-waste", 1);
    expect(await onHandOf("B-w")).toBe(890);
  });

  it("anti-minus: stok tidak turun di bawah 0", async () => {
    await addMenu("m-neg");
    await addBahan("B-neg", 5);
    await addRecipe("m-neg", "B-neg", 18, "all");
    await sell("m-neg", 1);
    expect(await onHandOf("B-neg")).toBe(0);
  });
});

describe("Stok masuk (Belanja) & guard stok keluar", () => {
  it("stok masuk menambah onHand", async () => {
    await addBahan("B-in", 100);
    await svc.createStockMovement(
      { itemSku: "B-in", type: "stock_in", note: "beli 50", qty: 50, applyToStock: true },
      session(),
    );
    expect(await onHandOf("B-in")).toBe(150);
  });

  it("stok keluar melebihi stok → ditolak (anti-minus)", async () => {
    await addBahan("B-out", 10);
    await expect(
      svc.createStockMovement(
        { itemSku: "B-out", type: "stock_out", note: "x", qty: -9999, applyToStock: true },
        session(),
      ),
    ).rejects.toThrow(/stok tidak cukup/i);
  });
});

describe("Toggle setting", () => {
  it("inventoryAutoDeduct OFF → stok tidak dipotong saat jual", async () => {
    await svc.updateAppSettings(outletId, { inventoryAutoDeduct: false }, session());
    await addMenu("m-off");
    await addBahan("B-off", 1000);
    await addRecipe("m-off", "B-off", 50, "all");
    await sell("m-off", 1);
    expect(await onHandOf("B-off")).toBe(1000);
  });
});
