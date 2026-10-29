import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Wave 4 — PO tersimpan (terima sebagian/penuh, batal penerimaan mengurangi),
// supplier master terhubung ke penerimaan, riwayat harga beli, aturan reorder per
// ruang (Bar diisi dari gudang utama dulu, sisanya beli), surat jalan per batch.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let po: any;
let proc: any;
const OWNER = { userId: null, name: "Owner Test", role: "Owner" };
/** Phase 2: PO wajib diajukan & disetujui sebelum dikirim / diterima. */
async function approve(id: string) {
  await proc.submitPurchaseOrder(id, OWNER);
  await proc.approvePurchaseOrder(id, OWNER);
}
let mainBar = "";
let outletBar = "";
let supplierId = "";
let milkId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  po = await import("@/lib/wms-purchase");
  proc = await import("@/lib/wms-procurement");
  const whs = await wms.listWmsWarehouses();
  mainBar = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  outletBar = whs.find((w: any) => w.type === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · PO Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({ sku: "T-OAT", name: "Sirup Vanila", category: "Bar · PO Test", unit: "ml", packPrice: 30_000, packQty: 1000 });
  milkId = prod.id;
  const supplier = await wms.createWmsSupplier({ name: "CV Susu Segar" });
  supplierId = supplier.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function stock(warehouseId: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.wmsWarehouseStock)
    .where(and(eq(t.schema.wmsWarehouseStock.productId, milkId), eq(t.schema.wmsWarehouseStock.warehouseId, warehouseId)));
  return Number(row?.qty ?? 0);
}

describe("Purchase Order", () => {
  it("PO → terima sebagian → partial; terima sisa → received; batal penerimaan → partial lagi", async () => {
    const order = await po.createPurchaseOrder({ supplierId, warehouseId: mainBar, items: [{ productId: milkId, orderedQty: 2000, unitPrice: 30 }] });
    expect(order.status).toBe("draft");
    await expect(po.setPurchaseOrderStatus(order.id, "send")).rejects.toThrow(/disetujui/);
    await expect(po.createReceivingFromPurchaseOrder(order.id)).rejects.toThrow(/belum disetujui/);
    await approve(order.id);
    await po.setPurchaseOrderStatus(order.id, "send");

    const rec1 = await po.createReceivingFromPurchaseOrder(order.id);
    expect(rec1).toMatchObject({ supplier: "CV Susu Segar", supplierId, purchaseOrderId: order.id, poNumber: order.doc });
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.wmsReceivingItem).set({ receivedQty: 1900, orderedQty: 2000 }).where(eq(t.schema.wmsReceivingItem.receivingId, rec1.id));
    // Sengaja kurang sedikit (<10%) → penerimaan tetap selesai tanpa approval.
    await wms.completeReceiving(rec1.id);
    let detail = await po.getPurchaseOrder(order.id);
    expect(detail.status).toBe("partial");
    expect(detail.items[0]).toMatchObject({ receivedQty: 1900, remainingQty: 100 });
    expect(await stock(mainBar)).toBe(1900);

    const rec2 = await po.createReceivingFromPurchaseOrder(order.id);
    await wms.completeReceiving(rec2.id);
    detail = await po.getPurchaseOrder(order.id);
    expect(detail.status).toBe("received");
    await expect(po.createReceivingFromPurchaseOrder(order.id)).rejects.toThrow(/sudah selesai/);

    await wms.cancelReceiving(rec2.id, { reason: "Salah kirim" });
    detail = await po.getPurchaseOrder(order.id);
    expect(detail.status).toBe("partial");
    expect(detail.items[0].receivedQty).toBe(1900);
  });

  it("riwayat harga beli per supplier & penerimaan manual tertaut ke master supplier", async () => {
    const manual = await wms.createReceiving({ supplier: "  cv susu segar ", warehouseId: mainBar, items: [{ productId: milkId, orderedQty: 100, receivedQty: 100, hpp: 34, qc: "pass" }] });
    expect(manual.supplierId).toBe(supplierId);
    await wms.completeReceiving(manual.id);
    const [history] = await po.getSupplierPriceHistory([milkId]);
    expect(history).toMatchObject({ supplierId, lastPrice: 34, receipts: 2 });
    expect(history.avgPrice).toBeCloseTo((1900 * 30 + 100 * 34) / 2000, 4);
  });

  it("baris PO ganda untuk bahan yang sama digabung (penerimaan tidak salah baris)", async () => {
    const order = await po.createPurchaseOrder({
      supplierId,
      items: [
        { productId: milkId, orderedQty: 10, unitPrice: 30 },
        { productId: milkId, orderedQty: 30, unitPrice: 40 },
      ],
    });
    const detail = await po.getPurchaseOrder(order.id);
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]).toMatchObject({ orderedQty: 40, unitPrice: 37.5 });
    await po.setPurchaseOrderStatus(order.id, "cancel");
  });

  it("PO tidak bisa dibatalkan selama ada penerimaan draft", async () => {
    const order = await po.createPurchaseOrder({ supplierId, items: [{ productId: milkId, orderedQty: 10, unitPrice: 30 }] });
    await approve(order.id);
    await po.createReceivingFromPurchaseOrder(order.id);
    await expect(po.setPurchaseOrderStatus(order.id, "cancel")).rejects.toThrow(/penerimaan draft/);
  });
});

describe("Reorder per ruang", () => {
  it("Bar di bawah min → ambil dari gudang utama dulu, sisanya beli ke supplier terakhir", async () => {
    await po.upsertReorderRule({ productId: milkId, warehouseId: outletBar, minQty: 500, maxQty: 3000 });
    await expect(po.upsertReorderRule({ productId: milkId, warehouseId: outletBar, minQty: 500, maxQty: 100 })).rejects.toThrow(/Maks/);
    const mainQty = await stock(mainBar); // 2000
    const [s] = await po.getReorderSuggestions();
    // Masih dipesan di PO terbuka: sisa 100 dari PO pertama (diterima sebagian 1900/2000) + PO 10
    // yang masih punya penerimaan draft → tidak dibeli lagi.
    const onOrder = 110;
    expect(s).toMatchObject({ warehouseId: outletBar, onHand: 0, needQty: 3000, transferQty: mainQty, onOrderQty: onOrder, purchaseQty: 3000 - mainQty - onOrder, supplierId, lastPrice: 34 });

    const { created, skipped } = await po.createPurchaseOrdersFromSuggestions();
    expect(skipped).toEqual([]);
    expect(created).toHaveLength(1);
    const detail = await po.getPurchaseOrder(created[0].id);
    expect(detail.items[0]).toMatchObject({ orderedQty: 3000 - mainQty - onOrder, unitPrice: 34 });
  });

  it("internal order mengisi Bar; surat jalan menampilkan baris per batch", async () => {
    const io = await wms.createInternalOrder({ outletWarehouseId: outletBar, items: [{ productId: milkId, qty: 600 }] });
    const note = await po.getStockDocumentLines(io.doc);
    expect(note.from).toBeTruthy();
    expect(note.to).toBeTruthy();
    expect(note.lines.reduce((sum: number, l: any) => sum + l.qty, 0)).toBe(600);
    expect(note.lines.every((l: any) => l.batchNo)).toBe(true);
    // Stok Bar 600 > min 500 → tidak ada saran lagi.
    expect(await po.getReorderSuggestions()).toEqual([]);
  });
});
