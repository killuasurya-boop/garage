import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Minta Bahan Bar/Dapur → gudang: daftar belanja dari layar produksi, gudang
// kirim (stok pindah gudang utama → ruang Bar, batch & expired ikut), divisi
// konfirmasi terima, kekurangan → PO draft per supplier terakhir.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let mr: any;
let mainBar = "";
let outletBar = "";
let syrupId = "";
let beanId = "";
const actor = { userId: null, name: "Barista Test", outletId: null };

async function stock(productId: string, warehouseId: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.wmsWarehouseStock)
    .where(and(eq(t.schema.wmsWarehouseStock.productId, productId), eq(t.schema.wmsWarehouseStock.warehouseId, warehouseId)));
  return Number(row?.qty ?? 0);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  mr = await import("@/lib/wms-material-request");
  const whs = await wms.listWmsWarehouses();
  mainBar = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  outletBar = whs.find((w: any) => w.type === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Minta Test", area: "bar" }).onConflictDoNothing();
  syrupId = (await wms.createWmsProduct({ sku: "T-MR-SYRUP", name: "Sirup Minta", category: "Bar · Minta Test", unit: "ml", packPrice: 0, packQty: 1 })).id;
  beanId = (await wms.createWmsProduct({ sku: "T-MR-BEAN", name: "Biji Minta", category: "Bar · Minta Test", unit: "gr", packPrice: 0, packQty: 1 })).id;
  await wms.runInTx((tx: any) =>
    wms.recordStockMovement(tx, { type: "in", productId: syrupId, warehouseId: mainBar, deltaQty: 500, hpp: 10, refDoc: "TEST-IN", batchNo: "SYR-1", expiredAt: new Date(Date.now() + 30 * 86_400_000) }),
  );
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Minta Bahan Bar → gudang", () => {
  it("katalog Bar menampilkan stok ruang Bar & gudang utama, bahan habis bertanda out", async () => {
    const catalog = await mr.getMaterialCatalog("bar");
    expect(catalog.room.id).toBe(outletBar);
    expect(catalog.source.id).toBe(mainBar);
    expect(catalog.products.find((p: any) => p.id === syrupId)).toMatchObject({ onHand: 0, sourceOnHand: 500, status: "out" });
  });

  it("kirim daftar belanja → gudang kirim sebagian → kekurangan → divisi terima → PO dari kekurangan", async () => {
    await expect(mr.createMaterialRequest({ division: "bar", items: [] }, actor)).rejects.toThrow(/kosong/);
    const req = await mr.createMaterialRequest(
      { division: "bar", urgent: true, note: "Habis saat ramai", items: [{ productId: syrupId, qty: 300 }, { productId: beanId, qty: 1000 }, { productId: syrupId, qty: 100 }] },
      actor,
    );
    expect(req).toMatchObject({ status: "submitted", urgent: true, division: "bar" });

    let [listed] = await mr.listMaterialRequests({ division: "bar" });
    expect(listed.items).toHaveLength(2); // baris ganda digabung
    const syrupLine = listed.items.find((i: any) => i.productId === syrupId);
    const beanLine = listed.items.find((i: any) => i.productId === beanId);
    expect(syrupLine).toMatchObject({ qty: 400, sourceOnHand: 500 });

    await mr.sendMaterialRequest(req.id, [{ itemId: syrupLine.id, qty: 400 }, { itemId: beanLine.id, qty: 0 }], actor);
    expect(await stock(syrupId, mainBar)).toBe(100);
    expect(await stock(syrupId, outletBar)).toBe(400);
    // Batch & expired ikut pindah ke Bar.
    const { and, eq } = await import("drizzle-orm");
    const [batch] = await t.getDb().select().from(t.schema.wmsBatch).where(and(eq(t.schema.wmsBatch.productId, syrupId), eq(t.schema.wmsBatch.warehouseId, outletBar)));
    expect(batch.batchNo).toBe("SYR-1");
    await expect(mr.sendMaterialRequest(req.id, [], actor)).rejects.toThrow(/sudah diproses/);

    [listed] = await mr.listMaterialRequests({ division: "bar" });
    expect(listed.status).toBe("sent");
    expect(listed.items.find((i: any) => i.productId === beanId)).toMatchObject({ sentQty: 0, shortQty: 1000 });

    const received = await mr.receiveMaterialRequest(req.id, {}, actor);
    expect(received.status).toBe("received");

    // Kekurangan biji → PO draft ke supplier terakhir.
    const supplier = await wms.createWmsSupplier({ name: "CV Biji Test" });
    const rec = await wms.createReceiving({ supplier: "CV Biji Test", warehouseId: mainBar, items: [{ productId: beanId, orderedQty: 10, receivedQty: 10, hpp: 0.3, qc: "pass" }] });
    await wms.completeReceiving(rec.id);
    const shortages = await mr.listMaterialShortages();
    expect(shortages.find((s: any) => s.productId === beanId)).toMatchObject({ qty: 1000, supplierId: supplier.id, lastPrice: 0.3 });
    const { created, skipped } = await mr.createPurchaseOrdersFromShortages();
    expect(skipped).toEqual([]);
    expect(created).toHaveLength(1);
    expect(await mr.listMaterialShortages()).toEqual([]); // sudah dibuatkan PO
  });

  it("batal hanya sebelum dikirim, oleh peminta atau manajer", async () => {
    const req = await mr.createMaterialRequest({ division: "bar", items: [{ productId: syrupId, qty: 10 }] }, { ...actor, userId: null });
    await expect(mr.cancelMaterialRequest(req.id, { userId: "orang-lain", elevated: false })).rejects.toThrow(/peminta atau manajer/);
    const cancelled = await mr.cancelMaterialRequest(req.id, { userId: null, elevated: true });
    expect(cancelled.status).toBe("cancelled");
    await expect(mr.sendMaterialRequest(req.id, [], actor)).rejects.toThrow(/sudah diproses/);
  });

  it("gudang tidak bisa mengirim melebihi stok layak", async () => {
    const req = await mr.createMaterialRequest({ division: "bar", items: [{ productId: syrupId, qty: 500 }] }, actor);
    const [listed] = await mr.listMaterialRequests({ division: "bar", status: ["submitted"] });
    await expect(mr.sendMaterialRequest(req.id, [{ itemId: listed.items[0].id, qty: 500 }], actor)).rejects.toThrow(/Sirup Minta/);
  });
});
