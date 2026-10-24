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
// STOK FISIK TUNGGAL = WMS. Order POS memotong stok gudang WMS (via potong stok
// resep), stok katalog OS = cermin total WMS, void mengembalikan, penjualan
// melebihi stok tetap terpotong (minus + peringatan), auto-habis membaca resep.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let wms: any;
let outletId = "";
let milkId = "";
const KASIR = "user-itest-kasir";

function session(role: Role = "Kasir" as Role): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Test" },
    profile: {
      id: "sp",
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function osOnHand(sku: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, sku));
  return Number(row?.onHand);
}

async function wmsTotal(sku: string) {
  const rows = await wms.getWmsProducts({ warehouseId: "all" });
  return Number(rows.find((r: any) => r.sku === sku)?.onHand ?? NaN);
}

async function sell(qty: number) {
  await svc.createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 1_000_000,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty }],
    },
    session(),
  );
  const { desc } = await import("drizzle-orm");
  const [order] = await t.getDb().select().from(t.schema.orders).orderBy(desc(t.schema.orders.createdAt)).limit(1);
  return order;
}

async function receive(qty: number) {
  const whs = await wms.listWmsWarehouses();
  const mainBar = whs.find((w: any) => w.type === "main" && w.area === "bar");
  await wms.runInTx((tx: any) =>
    wms.recordStockMovement(tx, { type: "in", productId: milkId, warehouseId: mainBar.id, deltaQty: qty, hpp: 24, refDoc: "TEST-IN" }),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  wms = await import("@/lib/wms-service");
  await wms.listWmsWarehouses(); // seed gudang WMS default
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Susu Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({
    sku: "T-MILK",
    name: "Susu Test",
    category: "Bar · Susu Test",
    unit: "ml",
    packPrice: 24_000,
    packQty: 1000,
  });
  milkId = prod.id;
  await t.getDb().insert(t.schema.menuRecipes).values({
    menuItemId: "itm-coffee",
    variantId: "all",
    inventorySku: "T-MILK",
    qty: 120,
    unit: "ml",
  });
  await receive(1000);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Stok WMS sebagai catatan tunggal", () => {
  it("receiving WMS → stok katalog OS ikut (cermin)", async () => {
    expect(await wmsTotal("T-MILK")).toBe(1000);
    expect(await osOnHand("T-MILK")).toBe(1000);
  });

  it("jual 2 kopi → stok WMS turun 240 ml, katalog OS sama, tidak dobel", async () => {
    await sell(2);
    expect(await wmsTotal("T-MILK")).toBe(760);
    expect(await osOnHand("T-MILK")).toBe(760);

    const { and, eq } = await import("drizzle-orm");
    const globalOut = await t
      .getDb()
      .select()
      .from(t.schema.stockMovements)
      .where(and(eq(t.schema.stockMovements.itemSku, "T-MILK"), eq(t.schema.stockMovements.type, "stock_out")));
    expect(globalOut.length).toBe(0); // potong global lama dilewati untuk bahan WMS
  });

  it("void order → stok WMS kembali", async () => {
    const order = await sell(1);
    expect(await wmsTotal("T-MILK")).toBe(640);
    await svc.voidOrder(order.orderNo, "Tes void stok WMS", session("Owner" as Role));
    expect(await wmsTotal("T-MILK")).toBe(760);
    expect(await osOnHand("T-MILK")).toBe(760);
  });

  it("jual melebihi stok tercatat → tetap terpotong (minus), penjualan tidak gagal", async () => {
    await sell(8); // butuh 960 ml, tersedia 760
    expect(await wmsTotal("T-MILK")).toBe(-200);
    expect(await osOnHand("T-MILK")).toBe(-200);
  });

  it("auto-habis: menu habis bila bahan utama kurang, tersedia lagi setelah receiving", async () => {
    await svc.updateAppSettings(outletId, { autoSoldOutFromStock: true }, session("Owner" as Role));
    let menu = await svc.getMenuData();
    expect(menu.find((m: any) => m.id === "itm-coffee").stock).toBe("sold_out");
    expect(menu.find((m: any) => m.id === "itm-food").stock).not.toBe("sold_out"); // tanpa resep

    await receive(2000);
    menu = await svc.getMenuData();
    expect(menu.find((m: any) => m.id === "itm-coffee").stock).not.toBe("sold_out");
  });

  it("katalog liter vs gudang ml: jual & void simetris (potong 120 ml, kembali 120 ml)", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.inventoryItems).set({ unit: "liter" }).where(eq(t.schema.inventoryItems.sku, "T-MILK"));
    await t.getDb().update(t.schema.menuRecipes).set({ qty: 0.12, unit: "liter" }).where(eq(t.schema.menuRecipes.inventorySku, "T-MILK"));
    const before = await wmsTotal("T-MILK");
    const order = await sell(1);
    expect(await wmsTotal("T-MILK")).toBeCloseTo(before - 120, 4);
    await svc.voidOrder(order.orderNo, "Tes satuan", session("Owner" as Role));
    expect(await wmsTotal("T-MILK")).toBeCloseTo(before, 4);
  });
});
