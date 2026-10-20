import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS hardening (audit Okt 2026): baseline POS terlindungi, tanpa stok "OS-SYNC"
// saat restart, webhook tidak memotong order Garage, selisih penerimaan butuh
// konfirmasi, pembatalan keluar dari ruang asal, invoice tidak bisa dibayar dobel.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let bridge: any;
let svc: any;
let baseline: any;

const OWNER = {
  user: { id: "owner-hardening", name: "Owner Test" },
  profile: {
    id: "sp-owner",
    role: "Owner",
    shiftLabel: "Pagi",
    deviceLabel: "Test",
    passwordResetRequired: false,
    outlet: { id: "", code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
  },
} as any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  bridge = await import("@/lib/wms-bridge");
  svc = await import("@/lib/garage-service");
  baseline = await import("@/lib/pos-baseline");
  const { outletId } = await seedGarageBasics(t, { userId: OWNER.user.id });
  OWNER.profile.outlet.id = outletId;
  // Memicu seed WMS (produk contoh + stok awal → ledger tidak kosong).
  await wms.getWmsProducts();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function bySku(sku: string) {
  return (await wms.getWmsProducts()).find((p: any) => p.sku === sku);
}

describe("Baseline POS terlindungi", () => {
  it("hash tetap sama setelah operasi gudang; perubahan harga terdeteksi", async () => {
    const before = await baseline.getPosBaseline();
    expect(before.itemCount).toBeGreaterThan(0);

    const bean = await bySku("BEAN-ARB");
    const rec = await wms.createReceiving({
      items: [{ productId: bean.id, orderedQty: 100, receivedQty: 100, hpp: 0.5, qc: "pass" }],
    });
    await wms.completeReceiving(rec.id);
    await bridge.syncOsToWms({ bootstrapStock: true });

    const after = await baseline.getPosBaseline();
    expect(after.hash).toBe(before.hash);
    expect(baseline.diffPosBaseline(before, after)).toEqual([]);

    const changed = structuredClone(after);
    changed.items[0].variants[0].price += 1000;
    expect(baseline.diffPosBaseline(before, changed).join(" ")).toMatch(/Varian/);
  });
});

describe("Sinkron OS → WMS", () => {
  it("tidak menyuntik stok OS-SYNC bila ledger WMS sudah ada transaksi", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().insert(t.schema.inventoryItems).values({
      sku: "INV-HARD-01",
      name: "Bahan Uji Restart",
      alternativeName: "",
      category: "Bar · Kopi",
      usageArea: "bar",
      unit: "gr",
      packageSize: "pack 1000 gr",
      onHand: 500,
      min: 0,
      unitCost: 10,
      status: "safe",
      movement: "",
    });
    const res = await bridge.syncOsToWms({ bootstrapStock: true });
    expect(res.stockBootstrapped).toBe(0);
    const prod = await bySku("INV-HARD-01");
    expect(prod).toBeTruthy();
    expect(prod.onHand).toBe(0);
    const synced = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.refDoc, "OS-SYNC"));
    expect(synced.length).toBe(0);
  });

  it("tidak menimpa nama produk WMS yang sudah ada dari data OS", async () => {
    const { eq } = await import("drizzle-orm");
    await t
      .getDb()
      .update(t.schema.inventoryItems)
      .set({ name: "Nama OS Lama" })
      .where(eq(t.schema.inventoryItems.sku, "INV-HARD-01"));
    await bridge.syncOsToWms({ bootstrapStock: false });
    expect((await bySku("INV-HARD-01")).name).toBe("Bahan Uji Restart");
  });
});

describe("Webhook penjualan", () => {
  it("menolak ref yang merupakan order Garage OS (sudah dipotong in-order)", async () => {
    await t.getDb().insert(t.schema.orders).values({
      orderNo: "GRG-HARD-1",
      channel: "pos",
      subtotal: 10000,
      service: 0,
      tax: 0,
      total: 10000,
    });
    await expect(
      wms.processPosSale({ ref: "GRG-HARD-1", items: [{ name: "Apa Saja", qty: 1 }] }, null),
    ).rejects.toThrow(/sudah memotong stok/);
  });
});

describe("Penerimaan barang", () => {
  it("selisih >10% butuh konfirmasi; tanpa konfirmasi tidak ada perubahan", async () => {
    const bean = await bySku("BEAN-ARB");
    const rec = await wms.createReceiving({
      items: [{ productId: bean.id, orderedQty: 1000, receivedQty: 500, hpp: 0.5, qc: "pass" }],
    });
    await expect(wms.completeReceiving(rec.id)).rejects.toBeInstanceOf(wms.ReceivingDiscrepancyError);
    const { eq } = await import("drizzle-orm");
    const [still] = await t.getDb().select().from(t.schema.wmsReceiving).where(eq(t.schema.wmsReceiving.id, rec.id));
    expect(still.status).toBe("draft");
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand);

    await wms.completeReceiving(rec.id, null, { forceApprove: true });
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand + 500);
  });

  it("pembatalan mengeluarkan stok dari ruang tempat barang masuk", async () => {
    const { eq } = await import("drizzle-orm");
    const bean = await bySku("BEAN-ARB");
    const rec = await wms.createReceiving({
      items: [{ productId: bean.id, orderedQty: 40, receivedQty: 40, hpp: 0.5, qc: "pass" }],
    });
    await wms.completeReceiving(rec.id);
    const [inMove] = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.refDoc, rec.doc));
    await wms.cancelReceiving(rec.id, { reason: "salah qty", userId: null });
    const [outMove] = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.refDoc, `BATAL ${rec.doc}`));
    expect(outMove.warehouseId).toBe(inMove.warehouseId);
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand);
  });
});

describe("Invoice supplier", () => {
  it("pembayaran bersamaan tidak dobel; invoice terbayar tidak bisa diubah nominalnya", async () => {
    const inv = await svc.createSupplierInvoice(
      { invoiceNo: "INV-HARD-1", amount: 300_000, dueDate: new Date().toISOString(), category: "Belanja Bar" },
      OWNER,
    );
    const results = await Promise.allSettled([
      svc.markSupplierInvoicePaid({ id: inv.id }, OWNER),
      svc.markSupplierInvoicePaid({ id: inv.id }, OWNER),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const { eq } = await import("drizzle-orm");
    const paid = await t
      .getDb()
      .select()
      .from(t.schema.expenses)
      .where(eq(t.schema.expenses.supplierInvoiceId, inv.id));
    expect(paid.length).toBe(1);
    expect(paid[0].amount).toBe(300_000);

    await expect(
      svc.createSupplierInvoice(
        { invoiceNo: "INV-HARD-1", amount: 1, dueDate: new Date().toISOString(), category: "Belanja Bar" },
        OWNER,
      ),
    ).rejects.toThrow(/sudah dibayar/);
  });
});

describe("Hapus bahan", () => {
  it("bahan dengan histori ledger gudang tidak bisa dihapus permanen", async () => {
    const bean = await bySku("BEAN-ARB");
    await t.getDb().insert(t.schema.inventoryItems).values({
      sku: "BEAN-ARB",
      name: bean.name,
      alternativeName: "",
      category: "Bar · Kopi",
      usageArea: "bar",
      unit: "gr",
      packageSize: "pack 1000 gr",
      onHand: 0,
      min: 0,
      unitCost: 0,
      status: "low",
      movement: "",
    }).onConflictDoNothing();
    expect(await wms.wmsSkuHasLedger("BEAN-ARB")).toBe(true);
    await expect(svc.deleteInventoryItem("BEAN-ARB")).rejects.toThrow(/histori stok gudang/);
  });
});
