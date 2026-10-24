import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Wave 2 — waste & kedaluwarsa: waste memotong stok (buang yang basi dulu),
// waste besar dari staf menunggu approval, batch kedaluwarsa tidak ikut transfer,
// no. batch + expired ikut pindah, hasil produksi mewarisi expired bahan input.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let waste: any;
let mainBar = "";
let outletBar = "";
let syrupId = "";

const DAY = 86_400_000;

async function addBatch(productId: string, warehouseId: string, qty: number, expiredAt: Date | null, batchNo: string, hpp = 10) {
  await wms.runInTx((tx: any) =>
    wms.recordStockMovement(tx, { type: "in", productId, warehouseId, deltaQty: qty, hpp, refDoc: "TEST-IN", batchNo, expiredAt }),
  );
}

async function batches(productId: string, warehouseId: string): Promise<Array<{ batchNo: string; qty: number; expiredAt: Date }>> {
  const { and, eq, sql } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.wmsBatch)
    .where(and(eq(t.schema.wmsBatch.productId, productId), eq(t.schema.wmsBatch.warehouseId, warehouseId), sql`${t.schema.wmsBatch.qty} > 0`));
  return rows.map((b: any) => ({ batchNo: b.batchNo as string, qty: Number(b.qty), expiredAt: b.expiredAt as Date }));
}

const owner = { userId: null, name: "Owner Test", elevated: true };
const staff = { userId: null, name: "Bar Test", elevated: false };

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  waste = await import("@/lib/wms-waste");
  const whs = await wms.listWmsWarehouses();
  mainBar = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  outletBar = whs.find((w: any) => w.type === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Waste Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({ sku: "T-SYRUP", name: "Sirup Test", category: "Bar · Waste Test", unit: "ml", packPrice: 10_000, packQty: 1000 });
  syrupId = prod.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Kedaluwarsa", () => {
  it("transfer menolak stok kedaluwarsa & membawa no. batch + expired ke ruang tujuan", async () => {
    const fresh = new Date(Date.now() + 10 * DAY);
    await addBatch(syrupId, mainBar, 100, new Date(Date.now() - DAY), "OLD-1");
    await addBatch(syrupId, mainBar, 50, fresh, "NEW-1");

    await expect(
      wms.transferStock({ fromWarehouseId: mainBar, toWarehouseId: outletBar, items: [{ productId: syrupId, qty: 80 }] }),
    ).rejects.toThrow(/layak pakai tidak cukup/);

    await wms.transferStock({ fromWarehouseId: mainBar, toWarehouseId: outletBar, items: [{ productId: syrupId, qty: 30 }] });
    const dest = await batches(syrupId, outletBar);
    expect(dest).toHaveLength(1);
    expect(dest[0]).toMatchObject({ batchNo: "NEW-1", qty: 30 });
    expect(dest[0].expiredAt?.getTime()).toBe(fresh.getTime());
    // Batch kedaluwarsa tetap di sumber, tidak tersentuh.
    expect((await batches(syrupId, mainBar)).find((b) => b.batchNo === "OLD-1")?.qty).toBe(100);
  });

  it("daftar kedaluwarsa menampilkan batch basi & hampir basi", async () => {
    const rows = await waste.listExpiringWmsBatches(3);
    const old = rows.find((r: any) => r.batchNo === "OLD-1");
    expect(old).toMatchObject({ expired: true, qty: 100, value: 1000 });
    expect(rows.some((r: any) => r.batchNo === "NEW-1")).toBe(false); // exp 10 hari lagi
  });

  it("hasil produksi mewarisi expired bahan input paling awal", async () => {
    const out = await wms.createWmsProduct({ sku: "T-SYRUP-MIX", name: "Sirup Racik", category: "Bar · Waste Test", unit: "ml", packPrice: 0, packQty: 1 });
    const recipe = await wms.createProductionRecipe({ name: "Racik", outputProductId: out.id, outputQty: 10, bom: [{ inputProductId: syrupId, qty: 5 }], shelfLifeHours: 24 * 30 });
    await wms.runProduction({ recipeId: recipe.id, batches: 1, warehouseId: outletBar });
    const [made] = await batches(out.id, outletBar);
    expect(made.qty).toBe(10);
    const inputExpiry = (await batches(syrupId, outletBar))[0].expiredAt.getTime();
    expect(made.expiredAt.getTime()).toBe(inputExpiry); // 10 hari < 30 hari umur simpan
  });
});

describe("Waste", () => {
  it("Owner mencatat waste kedaluwarsa → stok terpotong dari batch basi dulu", async () => {
    const row = await waste.recordWmsWaste({ warehouseId: mainBar, productId: syrupId, qty: 40, reason: "expired" }, owner);
    expect(row.status).toBe("recorded");
    expect(Number(row.value)).toBe(400);
    const src = await batches(syrupId, mainBar);
    expect(src.find((b) => b.batchNo === "OLD-1")?.qty).toBe(60);
    expect(src.find((b) => b.batchNo === "NEW-1")?.qty).toBe(20);

    const { and, eq } = await import("drizzle-orm");
    const moves = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(and(eq(t.schema.wmsStockMovement.type, "waste"), eq(t.schema.wmsStockMovement.refDoc, row.doc)));
    expect(moves).toHaveLength(1);
    expect(Number(moves[0].qty)).toBe(-40);
  });

  it("waste staf bernilai besar menunggu approval; stok baru berubah setelah disetujui", async () => {
    const big = await wms.createWmsProduct({ sku: "T-BEAN", name: "Biji Mahal", category: "Bar · Waste Test", unit: "gr", packPrice: 1_000_000, packQty: 1000 });
    await addBatch(big.id, outletBar, 100, null, "BEAN-1", 1000);
    const row = await waste.recordWmsWaste({ warehouseId: outletBar, productId: big.id, qty: 60, reason: "spill", note: "jatuh" }, staff);
    expect(row.status).toBe("pending_approval");
    expect((await batches(big.id, outletBar))[0].qty).toBe(100);

    await expect(waste.decideWmsWaste(row.id, { approve: false }, { userId: null })).rejects.toThrow(/Alasan penolakan/);
    const approved = await waste.decideWmsWaste(row.id, { approve: true }, { userId: null });
    expect(approved.status).toBe("recorded");
    expect(Number(approved.value)).toBe(60_000);
    expect((await batches(big.id, outletBar))[0].qty).toBe(40);
    await expect(waste.decideWmsWaste(row.id, { approve: true }, { userId: null })).rejects.toThrow(/sudah diputuskan/);
  });

  it("menolak waste melebihi stok ruang & alasan 'Lainnya' tanpa keterangan", async () => {
    await expect(waste.recordWmsWaste({ warehouseId: mainBar, productId: syrupId, qty: 9999, reason: "damaged" }, owner)).rejects.toThrow(/hanya/);
    await expect(waste.recordWmsWaste({ warehouseId: mainBar, productId: syrupId, qty: 1, reason: "other" }, owner)).rejects.toThrow(/keterangan/);
  });

  it("ringkasan waste per alasan untuk laporan owner", async () => {
    const now = new Date();
    const summary = await waste.summarizeWmsWaste(new Date(now.getTime() - DAY), new Date(now.getTime() + DAY));
    expect(summary.total).toBe(60_400);
    expect(summary.byReason.map((r: any) => r.label).sort()).toEqual(["Kedaluwarsa", "Tumpah / jatuh"]);
  });
});
