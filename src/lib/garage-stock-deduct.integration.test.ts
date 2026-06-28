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
// AUTO-POTONG STOK — saat menu terjual, stok bahan dari resep aktif berkurang
// otomatis + tercatat sebagai stock_out. Menu tanpa resep = tidak terpengaruh.
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
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
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

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;

  // Bahan "BEAN" 1000 gram + resep kopi pakai 18 gram (varian "all").
  await t.getDb().insert(t.schema.inventoryItems).values({
    sku: "BEAN",
    name: "Coffee Beans",
    alternativeName: "-",
    category: "Bar",
    usageArea: "bar",
    unit: "gram",
    packageSize: "1000 gram",
    onHand: 1000,
    min: 100,
    status: "safe",
    movement: "stabil",
  });
  await t.getDb().insert(t.schema.menuRecipes).values({
    menuItemId: "itm-coffee",
    variantId: "all",
    inventorySku: "BEAN",
    qty: 18,
    unit: "gram",
    wastePct: 0,
    status: "active",
  });

  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Auto-potong stok saat menu terjual", () => {
  it("jual 2 kopi → stok BEAN turun 36 gram (18x2) + tercatat stock_out", async () => {
    expect(await onHandOf("BEAN")).toBe(1000);
    await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
      },
      session(),
    );
    expect(await onHandOf("BEAN")).toBe(1000 - 36);

    const { eq, and } = await import("drizzle-orm");
    const moves = await t
      .getDb()
      .select()
      .from(t.schema.stockMovements)
      .where(
        and(
          eq(t.schema.stockMovements.itemSku, "BEAN"),
          eq(t.schema.stockMovements.type, "stock_out"),
        ),
      );
    expect(moves.length).toBeGreaterThanOrEqual(1);
  });

  it("menu tanpa resep (nasi) → tidak mengubah stok, tidak error", async () => {
    const before = await onHandOf("BEAN");
    await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
      },
      session(),
    );
    expect(await onHandOf("BEAN")).toBe(before);
  });
});
