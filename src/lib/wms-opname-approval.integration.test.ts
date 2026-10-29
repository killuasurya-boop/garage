import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Wave 3 — opname dengan approval (ala ERPNext Stock Reconciliation):
// hitung → kirim → manajer setujui/tolak; hitung buta untuk penghitung; selisih
// dihitung terhadap stok SAAT dihitung, penjualan sesudahnya tetap berlaku.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let barId = "";
let productId = "";

async function onHand() {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.wmsWarehouseStock)
    .where(and(eq(t.schema.wmsWarehouseStock.productId, productId), eq(t.schema.wmsWarehouseStock.warehouseId, barId)));
  return Number(row?.qty ?? 0);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  const whs = await wms.listWmsWarehouses();
  barId = whs.find((w: any) => w.type === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Opname Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({ sku: "T-OPN", name: "Gula Opname", category: "Bar · Opname Test", unit: "gr", packPrice: 20_000, packQty: 1000 });
  productId = prod.id;
  await wms.runInTx((tx: any) =>
    wms.recordStockMovement(tx, { type: "in", productId, warehouseId: barId, deltaQty: 1000, hpp: 20, refDoc: "TEST-IN" }),
  );
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Opname dengan approval", () => {
  it("hitung buta, kirim, tolak, hitung ulang, setujui → stok = fisik + mutasi sesudah hitung", async () => {
    const op = await wms.createWmsOpname(barId);
    const blind = await wms.getWmsOpname(op.id, { blind: true });
    const line = blind.lines.find((l: any) => l.productId === productId);
    expect(line).toMatchObject({ systemQty: null, physicalQty: null, variance: null, counted: false });

    await expect(wms.submitWmsOpname(op.id)).rejects.toThrow(/Belum ada bahan/);
    await wms.saveWmsOpnameLine(line.id, 900, op.id); // hilang 100 gr (10%) → di luar toleransi
    // Phase 3: selisih di atas toleransi wajib dihitung ulang sebelum bisa dikirim.
    await expect(wms.submitWmsOpname(op.id)).rejects.toThrow(/dihitung ulang/);
    await wms.saveWmsOpnameLine(line.id, 900, op.id); // hitung ulang, hasil sama → review Manajer
    await wms.submitWmsOpname(op.id);
    await expect(wms.saveWmsOpnameLine(line.id, 950, op.id)).rejects.toThrow(/terkunci/);
    expect(await onHand()).toBe(1000); // belum berubah sebelum disetujui

    await expect(wms.rejectWmsOpname(op.id, "")).rejects.toThrow(/Alasan/);
    await wms.rejectWmsOpname(op.id, "Rak belakang belum dihitung");
    const rejected = await wms.getWmsOpname(op.id);
    expect(rejected).toMatchObject({ status: "draft", rejectReason: "Rak belakang belum dihitung" });

    await wms.saveWmsOpnameLine(line.id, 950, op.id); // hitung ulang: hilang 50 gr
    // Penjualan SETELAH dihitung tetap berlaku (tidak dihapus oleh posting opname).
    await wms.runInTx((tx: any) =>
      wms.recordStockMovement(tx, { type: "out", productId, warehouseId: barId, deltaQty: -30, hpp: 20, refDoc: "SALE AFTER" }),
    );
    await wms.submitWmsOpname(op.id);
    const review = await wms.getWmsOpname(op.id);
    expect(review.lines.find((l: any) => l.id === line.id)).toMatchObject({ systemQty: 1000, physicalQty: 950, variance: -50, varianceValue: -1000 });

    await wms.finalizeWmsOpname(op.id);
    expect(await onHand()).toBe(920); // 950 fisik − 30 terjual sesudah dihitung
    const done = await wms.getWmsOpname(op.id, { blind: true });
    expect(done.status).toBe("completed");
    expect(done.blind).toBe(false); // setelah selesai angka boleh dilihat
    await wms.finalizeWmsOpname(op.id); // idempoten
    expect(await onHand()).toBe(920);
  });

  it("manajer tidak bisa menyetujui opname yang ia kirim sendiri (Owner boleh)", async () => {
    await t.getDb().insert(t.schema.user).values({ id: "user-opname-mgr", name: "Manajer Test", email: "user-opname-mgr@garage.id" });
    const op = await wms.createWmsOpname(barId);
    const detail = await wms.getWmsOpname(op.id);
    const line = detail.lines.find((l: any) => l.productId === productId);
    await wms.saveWmsOpnameLine(line.id, 900, op.id, "user-opname-mgr");
    await wms.saveWmsOpnameLine(line.id, 900, op.id, "user-opname-mgr"); // hitung ulang wajib (di luar toleransi)
    await wms.submitWmsOpname(op.id, "user-opname-mgr");
    await expect(wms.finalizeWmsOpname(op.id, "user-opname-mgr")).rejects.toThrow(/manajer lain/);
    await wms.finalizeWmsOpname(op.id, "user-opname-mgr", { allowSelfApproval: true });
    expect((await wms.getWmsOpname(op.id)).status).toBe("completed");
  });
});
