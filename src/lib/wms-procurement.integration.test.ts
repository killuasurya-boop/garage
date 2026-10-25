import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Pengadaan WMS (§14 MASTER+ PROMPT): permintaan & PO tidak mengubah stok,
// penerimaan parsial/penuh, hutang tempo (biaya diakui, bukan kas keluar),
// pembatalan, waste, opname & internal order dengan persetujuan terpisah.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let pro: any;
let svc: any;
const OWNER = { id: "u-owner-pro", name: "Owner Pro", role: "Owner" };
const MANAJER = { id: "u-manajer-pro", name: "Manajer Pro", role: "Manajer" };
const KASIR = { id: "u-kasir-pro", name: "Kasir Bar", role: "Kasir" };
let outletId: string;

function session(a: typeof OWNER) {
  return {
    user: { id: a.id, name: a.name },
    profile: { id: "sp", role: a.role, shiftLabel: "Pagi", deviceLabel: "T", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } },
  } as any;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER.id }));
  await t.getDb().insert(t.schema.user).values([
    { id: MANAJER.id, name: MANAJER.name, email: "manajer-pro@garage.id" },
    { id: KASIR.id, name: KASIR.name, email: "kasir-pro@garage.id" },
  ]);
  wms = await import("@/lib/wms-service");
  pro = await import("@/lib/wms-procurement");
  svc = await import("@/lib/garage-service");
  await wms.getWmsProducts();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function bySku(sku: string) {
  return (await wms.getWmsProducts()).find((p: any) => p.sku === sku);
}
async function rooms() {
  return wms.listWmsWarehouses({ allowedTypes: "all" });
}

describe("Permintaan belanja → PO → penerimaan", () => {
  let requestId: string;
  let poId: string;

  it("permintaan tidak mengubah stok; duplikat ditolak; Manajer tak bisa menyetujui permintaannya sendiri", async () => {
    const bean = await bySku("BEAN-ARB");
    const before = bean.onHand;
    const req = await pro.createPurchaseRequest({ area: "bar", items: [{ productId: bean.id, qty: 5000 }] }, MANAJER);
    requestId = req.id;
    expect((await bySku("BEAN-ARB")).onHand).toBe(before);
    await expect(pro.createPurchaseRequest({ area: "bar", items: [{ productId: bean.id, qty: 10 }] }, KASIR)).rejects.toThrow(/permintaan terbuka/);
    await expect(pro.decidePurchaseRequest(req.id, { action: "approve" }, MANAJER)).rejects.toThrow(/disetujui orang lain/);
    await expect(pro.decidePurchaseRequest(req.id, { action: "reject" }, OWNER)).rejects.toThrow(/Alasan/);
    const approved = await pro.decidePurchaseRequest(req.id, { action: "approve" }, OWNER);
    expect(approved.status).toBe("approved");
    const [list] = await pro.listPurchaseRequests({ status: ["approved"] });
    expect(list.items[0].approvedQty).toBe(5000);
  });

  it("PO dari permintaan: status permintaan 'ordered', stok tetap", async () => {
    const bean = await bySku("BEAN-ARB");
    const [req] = await pro.listPurchaseRequests({ status: ["approved"] });
    const po = await pro.createPurchaseOrder(
      { supplierName: "PT Kopi", area: "bar", items: [{ productId: bean.id, qty: 5000, unitCost: 0.2, requestItemId: req.items[0].id }] },
      OWNER,
    );
    poId = po.id;
    expect((await pro.listPurchaseRequests({ status: ["ordered"] })).some((r: any) => r.id === requestId)).toBe(true);
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand);
    await expect(pro.receivePurchaseOrder(po.id, { items: [] }, OWNER)).rejects.toThrow(/setujui PO/);
    await pro.approvePurchaseOrder(po.id, OWNER);
    await pro.markPurchaseOrderSent(po.id, OWNER);
  });

  it("terima parsial lalu penuh: stok bertambah tepat, PO partial→received, permintaan fulfilled", async () => {
    const bean = await bySku("BEAN-ARB");
    const [po] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === poId);
    const line = po.items[0];
    await pro.receivePurchaseOrder(poId, { items: [{ poItemId: line.id, receivedQty: 2000 }] }, OWNER);
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand + 2000);
    let [after] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === poId);
    expect(after.status).toBe("partial");
    expect(after.items[0].outstanding).toBe(3000);

    await pro.receivePurchaseOrder(poId, { items: [{ poItemId: line.id, receivedQty: 3000 }] }, OWNER);
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand + 5000);
    [after] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === poId);
    expect(after.status).toBe("received");
    expect((await pro.listPurchaseRequests({ status: ["fulfilled"] })).some((r: any) => r.id === requestId)).toBe(true);
  });

  it("terima lebih >10% dari sisa butuh konfirmasi", async () => {
    const milk = await bySku("MILK-FC");
    const po = await pro.createPurchaseOrder({ supplierName: "Susu", items: [{ productId: milk.id, qty: 100, unitCost: 20 }] }, OWNER);
    await pro.approvePurchaseOrder(po.id, OWNER);
    const [row] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === po.id);
    await expect(pro.receivePurchaseOrder(po.id, { items: [{ poItemId: row.items[0].id, receivedQty: 150, expiredAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }] }, OWNER)).rejects.toBeInstanceOf(wms.ReceivingDiscrepancyError);
    expect((await bySku("MILK-FC")).onHand).toBe(milk.onHand);
  });
});

describe("Pembelian tempo → hutang supplier", () => {
  it("biaya bahan diakui saat terima tanpa kas keluar; bayar = kas keluar; batal saat belum dibayar membatalkan hutang", async () => {
    const { eq, like } = await import("drizzle-orm");
    const d = t.getDb();
    const milk = await bySku("MILK-FC");
    const fcBefore = await import("@/lib/finance-control");
    const coreBefore = await import("@/lib/finance-control-core");
    const rawBefore = (await fcBefore.loadDayRaws(coreBefore.jakartaDateKey(), coreBefore.jakartaDateKey())).get(coreBefore.jakartaDateKey()) as any;
    const purchasesBefore = rawBefore ? rawBefore.purchases.bar + rawBefore.purchases.dapur + rawBefore.purchases.umum : 0;
    const po = await pro.createPurchaseOrder(
      { supplierName: "Distributor Susu", paymentTerm: "tempo", dueDays: 14, items: [{ productId: milk.id, qty: 1000, unitCost: 20 }] },
      OWNER,
    );
    await pro.approvePurchaseOrder(po.id, OWNER);
    const [row] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === po.id);
    const res = await pro.receivePurchaseOrder(po.id, { invoiceNo: "INV-TEMPO-1", items: [{ poItemId: row.items[0].id, receivedQty: 1000, expiredAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }] }, OWNER);

    const [invoice] = await d.select().from(t.schema.supplierInvoices).where(eq(t.schema.supplierInvoices.invoiceNo, "INV-TEMPO-1"));
    expect(invoice).toMatchObject({ amount: 20000, status: "unpaid", receivingId: res.receivingId, poId: po.id });
    const purchases = await d.select().from(t.schema.expenses).where(like(t.schema.expenses.sourceDoc, `WMS:${res.doc}#%`));
    expect(purchases.length).toBe(1);
    expect(purchases[0]).toMatchObject({ status: "payable", amount: 20000, paymentMethod: "Tempo" });

    // Laba rugi: biaya bahan terhitung, kas keluar belum.
    const fc = await import("@/lib/finance-control");
    const core = await import("@/lib/finance-control-core");
    const today = core.jakartaDateKey();
    const raw = (await fc.loadDayRaws(today, today)).get(today) as any;
    const cashPurchases = purchasesBefore;
    expect(raw.purchases.bar + raw.purchases.dapur + raw.purchases.umum).toBe(cashPurchases + 20000);
    // Kas keluar hari ini = hanya belanja cash sebelumnya (hutang tempo belum dibayar).
    expect(Object.values(raw.expenses).reduce((s: number, v: any) => s + Number(v), 0)).toBe(cashPurchases);

    // Hutang tampil di daftar; batal penerimaan saat belum dibayar → invoice void, stok kembali.
    expect((await pro.listSupplierPayables()).some((p: any) => p.invoiceNo === "INV-TEMPO-1")).toBe(true);
    await wms.cancelReceiving(res.receivingId, { reason: "salah kirim", userId: OWNER.id });
    const [voided] = await d.select().from(t.schema.supplierInvoices).where(eq(t.schema.supplierInvoices.id, invoice.id));
    expect(voided.status).toBe("void");
    expect((await bySku("MILK-FC")).onHand).toBe(milk.onHand);
    const [poAfter] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === po.id);
    expect(poAfter.status).toBe("approved");
    await expect(svc.markSupplierInvoicePaid({ id: invoice.id }, session(OWNER))).rejects.toThrow(/dibatalkan/);
  });

  it("hutang yang sudah dibayar tidak bisa dibatalkan lewat pembatalan penerimaan", async () => {
    const { eq } = await import("drizzle-orm");
    const milk = await bySku("MILK-FC");
    const po = await pro.createPurchaseOrder({ supplierName: "Distributor Susu", paymentTerm: "tempo", dueDays: 7, items: [{ productId: milk.id, qty: 100, unitCost: 20 }] }, OWNER);
    await pro.approvePurchaseOrder(po.id, OWNER);
    const [row] = (await pro.listPurchaseOrders()).filter((p: any) => p.id === po.id);
    const res = await pro.receivePurchaseOrder(po.id, { invoiceNo: "INV-TEMPO-2", items: [{ poItemId: row.items[0].id, receivedQty: 100, expiredAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }] }, OWNER);
    const [inv] = await t.getDb().select().from(t.schema.supplierInvoices).where(eq(t.schema.supplierInvoices.invoiceNo, "INV-TEMPO-2"));
    await svc.markSupplierInvoicePaid({ id: inv.id, amount: 1000 }, session(OWNER));
    await expect(wms.cancelReceiving(res.receivingId, { reason: "coba batal", userId: OWNER.id })).rejects.toThrow(/sudah dibayar/);
  });
});

describe("Waste", () => {
  it("mengurangi stok dengan ledger waste; melebihi stok ditolak", async () => {
    const { eq, like } = await import("drizzle-orm");
    const bean = await bySku("BEAN-ARB");
    const room = (await rooms()).find((r: any) => r.type === "main" && r.area === "bar") ?? (await rooms())[0];
    const stockInRoom = (await wms.getWmsProducts({ warehouseId: room.id })).find((p: any) => p.sku === "BEAN-ARB").onHand;
    const res = await pro.recordWaste({ productId: bean.id, warehouseId: room.id, qty: 10, kind: "rusak", reason: "kemasan sobek" }, KASIR);
    expect((await bySku("BEAN-ARB")).onHand).toBe(bean.onHand - 10);
    const moves = await t.getDb().select().from(t.schema.wmsStockMovement).where(like(t.schema.wmsStockMovement.refDoc, `${res.doc}%`));
    expect(moves[0].type).toBe("waste");
    await expect(
      pro.recordWaste({ productId: bean.id, warehouseId: room.id, qty: stockInRoom + 1000, kind: "rusak", reason: "terlalu banyak" }, KASIR),
    ).rejects.toThrow(/tidak cukup/i);
    const logs = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.object, res.doc));
    expect(logs.length).toBe(1);
  });
});

describe("Stok opname dengan persetujuan", () => {
  it("alasan selisih wajib; penghitung (Manajer) tidak memposting sendiri; Manajer lain/Owner bisa", async () => {
    const room = (await rooms()).find((r: any) => r.type === "main");
    const op = await wms.createWmsOpname(room.id, MANAJER.id);
    const full = await wms.getWmsOpname(op.id);
    const line = full.lines[0];
    await wms.saveWmsOpnameLine(line.id, line.systemQty + 3, op.id);
    await expect(wms.submitWmsOpname(op.id, MANAJER.id)).rejects.toThrow(/alasan selisih/);
    await wms.saveWmsOpnameLine(line.id, line.systemQty + 3, op.id, "ditemukan di rak belakang");
    await wms.submitWmsOpname(op.id, MANAJER.id);
    await expect(wms.saveWmsOpnameLine(line.id, 1, op.id)).rejects.toThrow(/diajukan/);
    await expect(wms.finalizeWmsOpname(op.id, MANAJER.id, { actorRole: "Manajer" })).rejects.toThrow(/hitung sendiri/);
    const done = await wms.finalizeWmsOpname(op.id, OWNER.id, { actorRole: "Owner" });
    expect(done.status).toBe("completed");
  });
});

describe("Internal order dengan persetujuan", () => {
  it("staf mengajukan tanpa memindah stok; Owner menyetujui → stok pindah; tolak butuh alasan", async () => {
    const all = await rooms();
    const outlet = all.find((r: any) => r.type === "bar");
    const bean = await bySku("BEAN-ARB");
    const outletBefore = (await wms.getWmsProducts({ warehouseId: outlet.id })).find((p: any) => p.sku === "BEAN-ARB")?.onHand ?? 0;
    const order = await wms.createInternalOrder({ outletWarehouseId: outlet.id, items: [{ productId: bean.id, qty: 50 }] }, KASIR.id, { requireApproval: true });
    expect(order.status).toBe("requested");
    expect((await wms.getWmsProducts({ warehouseId: outlet.id })).find((p: any) => p.sku === "BEAN-ARB")?.onHand ?? 0).toBe(outletBefore);
    await expect(wms.decideInternalOrder(order.id, { action: "reject" }, OWNER)).rejects.toThrow(/Alasan/);
    const issued = await wms.decideInternalOrder(order.id, { action: "approve" }, OWNER);
    expect(issued.status).toBe("issued");
    expect((await wms.getWmsProducts({ warehouseId: outlet.id })).find((p: any) => p.sku === "BEAN-ARB").onHand).toBe(outletBefore + 50);
    await expect(wms.decideInternalOrder(order.id, { action: "approve" }, OWNER)).rejects.toThrow(/tidak menunggu/);
  });
});
