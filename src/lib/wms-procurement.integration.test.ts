import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, seedGarageBasics, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Phase 2 — Pengadaan: persetujuan PO, revisi dokumen, WhatsApp Mode 1 (tanpa klaim
// terkirim otomatis), PDF, kekurangan Bar/Dapur → PO supplier utama, tagihan tempo &
// pembayaran supplier TANPA pengeluaran ganda dan tanpa laci kasir.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let po: any;
let proc: any;
let mr: any;
let mainBar = "";
let outletBar = "";
let supplierId = "";
let altSupplierId = "";
let syrupId = "";
let beanId = "";

const OWNER = { userId: "user-owner", name: "Owner Test", role: "Owner" };
const MANAJER = { userId: "user-manajer", name: "Manajer Test", role: "Manajer" };
const MANAJER2 = { userId: "user-manajer2", name: "Manajer Dua", role: "Manajer" };

async function expensesFor(doc: string) {
  const { like } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.expenses).where(like(t.schema.expenses.sourceDoc, `WMS:${doc}#%`));
}

async function approvedPo(items: Array<{ productId: string; orderedQty: number; unitPrice: number }>, supplier = supplierId) {
  const order = await po.createPurchaseOrder({ supplierId: supplier, warehouseId: mainBar, expectedDate: "2026-11-05", items }, MANAJER.userId);
  await proc.submitPurchaseOrder(order.id, MANAJER);
  await proc.approvePurchaseOrder(order.id, OWNER);
  return order;
}

async function receiveTempo(orderId: string) {
  const rec = await po.createReceivingFromPurchaseOrder(orderId);
  const { eq } = await import("drizzle-orm");
  await t.getDb().update(t.schema.wmsReceiving).set({ paymentMethod: "Tempo" }).where(eq(t.schema.wmsReceiving.id, rec.id));
  await wms.completeReceiving(rec.id);
  return rec;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: "user-itest" });
  const d = t.getDb();
  for (const u of [OWNER, MANAJER, MANAJER2]) {
    await d.insert(t.schema.user).values({ id: u.userId, name: u.name, email: `${u.userId}@garage.test`, emailVerified: true }).onConflictDoNothing();
  }
  wms = await import("@/lib/wms-service");
  po = await import("@/lib/wms-purchase");
  proc = await import("@/lib/wms-procurement");
  mr = await import("@/lib/wms-material-request");
  const whs = await wms.listWmsWarehouses();
  mainBar = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  outletBar = whs.find((w: any) => w.type === "bar").id;
  await wms.createWmsCategory({ name: "Syrup", area: "bar" });
  supplierId = (
    await wms.createWmsSupplier({
      name: "CV Sirup Nusantara",
      phone: "0812-7777-8888",
      address: "Jl. Pemuda 1, Medan",
      picName: "Bu Rina",
      areas: ["bar", "dapur"],
      paymentMethod: "tempo",
      paymentTermDays: 14,
    })
  ).id;
  altSupplierId = (await wms.createWmsSupplier({ name: "Toko Alternatif", phone: "081299990000" })).id;
  syrupId = (await wms.createWmsProduct({ sku: "T-SYR", name: "Syrup Vanilla", category: "Syrup", unit: "ml", packName: "botol", packQty: 760, packPrice: 125_000 })).id;
  beanId = (await wms.createWmsProduct({ sku: "T-BEAN", name: "Coffee Beans", category: "Syrup", unit: "gram", packQty: 1000, packPrice: 180_000 })).id;
}, 90_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Master supplier (Phase 2)", () => {
  it("menyimpan PIC, area (termasuk banyak divisi), metode & termin bayar", async () => {
    const s = (await wms.listWmsSuppliers()).find((x: any) => x.id === supplierId);
    expect(s).toMatchObject({ picName: "Bu Rina", areas: ["bar", "dapur"], paymentMethod: "tempo", paymentTermDays: 14, phone: "081277778888" });
  });

  it("bahan disediakan: utama/alternatif + harga referensi; utama juga jadi supplier utama bahan", async () => {
    await proc.upsertSupplierProduct({ supplierId: altSupplierId, productId: syrupId, refPrice: 170, role: "alternative" }, OWNER);
    await proc.upsertSupplierProduct({ supplierId, productId: syrupId, refPrice: 164.5, role: "primary" }, OWNER);
    const links = await proc.listSupplierProducts(supplierId);
    expect(links[0].link).toMatchObject({ role: "primary" });
    expect(Number(links[0].link.refPrice)).toBe(164.5);
    const prod = (await wms.getWmsProducts()).find((p: any) => p.id === syrupId);
    expect(prod.defaultSupplierId).toBe(supplierId);
  });
});

describe("Persetujuan & revisi PO", () => {
  it("draft → ajukan → pembuat (Manajer) tidak bisa menyetujui sendiri → Owner menyetujui", async () => {
    const order = await po.createPurchaseOrder({ supplierId, warehouseId: mainBar, items: [{ productId: syrupId, orderedQty: 1520, unitPrice: 164.5, uom: "botol", uomFactor: 760 }] }, MANAJER.userId);
    await expect(proc.approvePurchaseOrder(order.id, OWNER)).rejects.toMatchObject({ code: "PO_STATE" });
    await proc.submitPurchaseOrder(order.id, MANAJER);
    await expect(proc.approvePurchaseOrder(order.id, MANAJER)).rejects.toMatchObject({ code: "PO_SELF_APPROVAL" });
    const approved = await proc.approvePurchaseOrder(order.id, MANAJER2);
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(MANAJER2.userId);
  });

  it("WhatsApp Mode 1: hanya membuka chat (status 'WhatsApp Dibuka'), terkirim butuh konfirmasi manual revisi yang benar", async () => {
    const order = await approvedPo([{ productId: syrupId, orderedQty: 760, unitPrice: 164.5 }]);
    const wa = await proc.openPoWhatsapp(order.id, MANAJER);
    expect(wa.url.startsWith("https://wa.me/6281277778888?text=")).toBe(true);
    expect(wa.text).toContain("PESANAN BARANG — GARAGE COFFEE");
    expect(wa.text).toContain(`Nomor PO: ${order.doc}`);
    expect(wa.text).toContain("Kepada: CV Sirup Nusantara");
    expect(wa.text).toContain("Jumlah Produk: 1 item");
    expect(wa.fileName).toMatch(/^GARAGE_COFFEE_PO-.+_CV_SIRUP_NUSANTARA\.pdf$/);
    let detail = await po.getPurchaseOrder(order.id);
    expect(detail.status).toBe("wa_opened"); // BUKAN "sent"
    expect(detail.sentAt).toBeNull();

    await expect(proc.confirmPoSent(order.id, { revision: 5 }, MANAJER)).rejects.toMatchObject({ code: "PO_CHANGED" });
    await proc.confirmPoSent(order.id, { revision: 0 }, MANAJER);
    detail = await po.getPurchaseOrder(order.id);
    expect(detail).toMatchObject({ status: "sent", sentRevision: 0, sentBy: MANAJER.userId });

    const log = await proc.listPoDispatch(order.id);
    expect(log.map((l: any) => l.event)).toEqual(expect.arrayContaining(["wa_opened", "sent_confirmed"]));
    expect(log.find((l: any) => l.event === "sent_confirmed")).toMatchObject({ userName: "Manajer Test", supplierName: "CV Sirup Nusantara", recipient: "6281277778888", revision: 0 });

    await proc.recordSupplierResponse(order.id, { status: "confirmed", note: "Stok ada, harga sama" }, MANAJER);
    await proc.recordSupplierResponse(order.id, { status: "processing" }, MANAJER);
    expect((await po.getPurchaseOrder(order.id)).status).toBe("processing");
  });

  it("supplier tanpa nomor WA valid → tidak bisa dibuka; PO belum disetujui → ditolak", async () => {
    const noPhone = await wms.createWmsSupplier({ name: "Supplier Tanpa WA" });
    const order = await approvedPo([{ productId: beanId, orderedQty: 1000, unitPrice: 180 }], noPhone.id);
    await expect(proc.openPoWhatsapp(order.id, MANAJER)).rejects.toMatchObject({ code: "SUPPLIER_PHONE" });
    const draft = await po.createPurchaseOrder({ supplierId, items: [{ productId: beanId, orderedQty: 1000, unitPrice: 180 }] }, MANAJER.userId);
    await expect(proc.openPoWhatsapp(draft.id, MANAJER)).rejects.toMatchObject({ code: "PO_NOT_APPROVED" });
  });

  it("PO berubah setelah terkirim → REVISI 1, wajib disetujui & dikirim ulang, dokumen bertanda revisi", async () => {
    const order = await approvedPo([{ productId: syrupId, orderedQty: 760, unitPrice: 164.5 }]);
    await proc.openPoWhatsapp(order.id, MANAJER);
    await proc.confirmPoSent(order.id, { revision: 0 }, MANAJER);
    const revised = await proc.revisePurchaseOrder(order.id, { items: [{ productId: syrupId, orderedQty: 1520, unitPrice: 164.5 }] }, MANAJER);
    expect(revised).toMatchObject({ revision: 1, status: "pending_approval", approvedAt: null, sentRevision: 0 });
    await expect(proc.openPoWhatsapp(order.id, MANAJER)).rejects.toMatchObject({ code: "PO_NOT_APPROVED" });
    await proc.approvePurchaseOrder(order.id, OWNER);
    const wa = await proc.openPoWhatsapp(order.id, MANAJER);
    expect(wa.text).toContain("REVISI 1");
    expect(wa.fileName.endsWith("_R1.pdf")).toBe(true);
    await expect(proc.confirmPoSent(order.id, { revision: 0 }, MANAJER)).rejects.toMatchObject({ code: "PO_CHANGED" });
    await proc.confirmPoSent(order.id, { revision: 1 }, MANAJER);
    expect((await po.getPurchaseOrder(order.id)).sentRevision).toBe(1);
  });
});

describe("PDF Purchase Order", () => {
  it("PDF valid, multi-halaman untuk pesanan panjang, sidik sama untuk dokumen sama", async () => {
    const products = [];
    for (let i = 0; i < 45; i++) {
      products.push((await wms.createWmsProduct({ sku: `T-PDF-${i}`, name: `Bahan PDF Panjang Nomor ${i} dengan nama yang cukup panjang`, category: "Syrup", unit: "gram" })).id);
    }
    const order = await approvedPo(products.map((id: string, i: number) => ({ productId: id, orderedQty: 100 + i, unitPrice: 12.5 })));
    const { renderPurchaseOrderPdf } = await import("@/lib/wms-po-pdf");
    const data = await proc.getPoDocument(order.id);
    expect(data.supplier).toMatchObject({ name: "CV Sirup Nusantara", pic: "Bu Rina" });
    expect(data.approved).toBe(true);
    expect(data.items).toHaveLength(45);
    // Total = jumlah subtotal per baris (masing-masing dibulatkan ke rupiah).
    expect(data.total).toBe(products.reduce((s: number, _id: string, i: number) => s + Math.round((100 + i) * 12.5), 0));
    const first = await renderPurchaseOrderPdf(data);
    const second = await renderPurchaseOrderPdf(data);
    expect(first.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pages = (first.buffer.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    expect(first.sha256).toBe(second.sha256);
    await proc.recordPoPdfGenerated(order.id, first.sha256, OWNER);
    await proc.recordPoPdfGenerated(order.id, first.sha256, OWNER); // sekali per dokumen
    const log = (await proc.listPoDispatch(order.id)).filter((l: any) => l.event === "pdf_generated");
    expect(log).toHaveLength(1);
  });

  it("PO belum disetujui ditandai DRAFT di dokumen (bukan pesanan final)", async () => {
    const order = await po.createPurchaseOrder({ supplierId, items: [{ productId: beanId, orderedQty: 1000, unitPrice: 180 }] }, MANAJER.userId);
    const data = await proc.getPoDocument(order.id);
    expect(data.approved).toBe(false);
    expect(data.approvalLabel).toMatch(/BELUM DISETUJUI/);
  });
});

describe("Kekurangan Bar/Dapur → PO supplier utama", () => {
  it("supplier utama dari Master Data dipakai, asal permintaan tetap tercatat per baris", async () => {
    // Gudang utama Bar punya 300 ml; Bar minta 1000 → kirim 300, kurang 700.
    await wms.runInTx((tx: any) => wms.recordStockMovement(tx, { type: "in", productId: syrupId, warehouseId: mainBar, deltaQty: 300, hpp: 164.5, refDoc: "T-IN" }));
    const req = await mr.createMaterialRequest({ division: "bar", items: [{ productId: syrupId, qty: 1000 }] }, { userId: "user-itest", name: "Barista", outletId: null });
    const listed = (await mr.listMaterialRequests({ division: "bar" })).find((r: any) => r.id === req.id);
    expect(listed.items[0].sourceOnHand).toBe(300);
    await expect(mr.sendMaterialRequest(req.id, [{ itemId: listed.items[0].id, qty: 1000 }], { userId: "user-itest", outletId: null })).rejects.toThrow(/tidak cukup/);
    await mr.sendMaterialRequest(req.id, [{ itemId: listed.items[0].id, qty: 300 }], { userId: "user-itest", outletId: null });
    const shortages = await mr.listMaterialShortages();
    const s = shortages.find((x: any) => x.productId === syrupId);
    expect(s).toMatchObject({ supplierId, qty: 700, lastPrice: 164.5 });
    const { created } = await mr.createPurchaseOrdersFromShortages("user-itest");
    const detail = await po.getPurchaseOrder(created[0].id);
    expect(detail.supplierName).toBe("CV Sirup Nusantara");
    expect(detail.items[0].sourceRefs[0]).toContain(req.doc);
    expect(detail.items[0].sourceRefs[0]).toContain("Bar");
    // Tidak bisa dibuatkan PO dua kali.
    const again = await mr.createPurchaseOrdersFromShortages("user-itest");
    expect(again.created).toHaveLength(0);
    expect(outletBar).toBeTruthy();
  });
});

describe("Tagihan & pembayaran supplier (tanpa pengeluaran ganda)", () => {
  let order: any;
  let rec: any;
  let billId = "";

  it("penerimaan Tempo: satu baris biaya 'recorded' + tagihan dengan jatuh tempo termin supplier", async () => {
    order = await approvedPo([{ productId: beanId, orderedQty: 2000, unitPrice: 180 }]);
    rec = await receiveTempo(order.id);
    const rows = await expensesFor(rec.doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 360_000, status: "recorded", paymentMethod: "Tempo" });
    const [bill] = await proc.listSupplierBills({ status: ["unpaid"] });
    expect(bill).toMatchObject({ amount: 360_000, paidAmount: 0, status: "unpaid", supplierId, receivingId: rec.id });
    const [{ invoiceDate, dueDate }] = [bill];
    const diff = (new Date(dueDate).getTime() - new Date(invoiceDate).getTime()) / 86_400_000;
    expect(diff).toBe(14);
    billId = bill.id;
    expect((await po.getPurchaseOrder(order.id)).status).toBe("received");
  });

  it("sumber dana laci kasir / tidak cocok ditolak; transfer wajib referensi; lebih bayar ditolak", async () => {
    await expect(proc.recordSupplierPayment({ billId, kind: "payment", amount: 1000, method: "cash", fundSource: "drawer" }, OWNER)).rejects.toMatchObject({ code: "FUND_SOURCE" });
    await expect(proc.recordSupplierPayment({ billId, kind: "payment", amount: 1000, method: "cash", fundSource: "bank_bni" }, OWNER)).rejects.toMatchObject({ code: "FUND_SOURCE" });
    await expect(proc.recordSupplierPayment({ billId, kind: "payment", amount: 1000, method: "transfer", fundSource: "bank_bni" }, OWNER)).rejects.toMatchObject({ code: "REFERENCE_REQUIRED" });
    await expect(proc.recordSupplierPayment({ billId, kind: "payment", amount: 400_000, method: "transfer", fundSource: "bank_bni", reference: "TRX1" }, OWNER)).rejects.toMatchObject({ code: "OVERPAY" });
  });

  it("bayar sebagian oleh Manajer → menunggu verifikasi; pencatat tidak bisa verifikasi sendiri", async () => {
    const p = await proc.recordSupplierPayment({ billId, kind: "payment", amount: 160_000, method: "transfer", fundSource: "bank_jago", reference: "JAGO-001" }, MANAJER);
    expect(p.status).toBe("pending_verification");
    let [bill] = (await proc.listSupplierBills()).filter((b: any) => b.id === billId);
    expect(bill).toMatchObject({ paidAmount: 0, status: "unpaid" });
    await expect(proc.verifySupplierPayment(p.id, MANAJER)).rejects.toMatchObject({ code: "SELF_VERIFY" });
    await proc.verifySupplierPayment(p.id, MANAJER2);
    [bill] = (await proc.listSupplierBills()).filter((b: any) => b.id === billId);
    expect(bill).toMatchObject({ paidAmount: 160_000, status: "partial", outstanding: 200_000 });
    expect((await expensesFor(rec.doc))[0].status).toBe("recorded");
  });

  it("pelunasan Owner → tagihan lunas, baris biaya yang SAMA jadi 'paid', tidak ada pengeluaran baru", async () => {
    const before = await t.getDb().select().from(t.schema.expenses);
    await proc.recordSupplierPayment({ billId, kind: "payment", amount: 200_000, method: "cash", fundSource: "external" }, OWNER);
    const [bill] = (await proc.listSupplierBills()).filter((b: any) => b.id === billId);
    expect(bill).toMatchObject({ paidAmount: 360_000, status: "paid", outstanding: 0 });
    const rows = await expensesFor(rec.doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "paid", amount: 360_000 });
    const after = await t.getDb().select().from(t.schema.expenses);
    expect(after.length).toBe(before.length);
    await expect(proc.recordSupplierPayment({ billId, kind: "payment", amount: 1, method: "cash", fundSource: "external" }, OWNER)).rejects.toMatchObject({ code: "BILL_PAID" });
  });

  it("penerimaan yang sudah dibayar tidak bisa dibatalkan sebelum pembayaran dibatalkan (Owner)", async () => {
    await expect(wms.cancelReceiving(rec.id, { reason: "Salah input" })).rejects.toThrow(/sudah punya pembayaran/);
    const [bill] = (await proc.listSupplierBills()).filter((b: any) => b.id === billId);
    await expect(proc.voidSupplierPayment(bill.payments[0].id, "salah", MANAJER)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const p of bill.payments) await proc.voidSupplierPayment(p.id, "Koreksi pembatalan penerimaan", OWNER);
    const [reopened] = (await proc.listSupplierBills()).filter((b: any) => b.id === billId);
    expect(reopened).toMatchObject({ status: "unpaid", paidAmount: 0 });
    expect((await expensesFor(rec.doc))[0].status).toBe("recorded");
    await wms.cancelReceiving(rec.id, { reason: "Salah input" });
    const [voided] = (await proc.listSupplierBills()).filter((b: any) => b.id === billId);
    expect(voided.status).toBe("void");
    expect((await expensesFor(rec.doc))[0].status).toBe("void");
  });

  it("DP sebelum barang datang menempel ke tagihan saat penerimaan; PO ber-DP tidak bisa dibatalkan", async () => {
    const o = await approvedPo([{ productId: beanId, orderedQty: 1000, unitPrice: 180 }]);
    await expect(proc.recordSupplierPayment({ purchaseOrderId: o.id, kind: "dp", amount: 200_000, method: "cash", fundSource: "petty" }, OWNER)).rejects.toMatchObject({ code: "OVERPAY" });
    await proc.recordSupplierPayment({ purchaseOrderId: o.id, kind: "dp", amount: 50_000, method: "cash", fundSource: "petty" }, OWNER);
    await expect(po.setPurchaseOrderStatus(o.id, "cancel")).rejects.toThrow(/DP\/pembayaran/);
    const r = await receiveTempo(o.id);
    const bill = (await proc.listSupplierBills()).find((b: any) => b.receivingId === r.id);
    expect(bill).toMatchObject({ amount: 180_000, paidAmount: 50_000, status: "partial" });
    expect(bill.payments[0]).toMatchObject({ kind: "dp", amount: 50_000 });
  });

  it("DP melebihi tagihan pertama terbawa ke tagihan berikutnya (penerimaan sebagian)", async () => {
    // PO Rp180.000, DP Rp100.000, diterima Rp36.000 lalu Rp144.000 → sisa hutang total Rp80.000.
    const o = await approvedPo([{ productId: beanId, orderedQty: 1000, unitPrice: 180 }]);
    await proc.recordSupplierPayment({ purchaseOrderId: o.id, kind: "dp", amount: 100_000, method: "cash", fundSource: "petty" }, OWNER);
    const { eq } = await import("drizzle-orm");
    const r1 = await po.createReceivingFromPurchaseOrder(o.id);
    await t.getDb().update(t.schema.wmsReceivingItem).set({ receivedQty: 200 }).where(eq(t.schema.wmsReceivingItem.receivingId, r1.id));
    await t.getDb().update(t.schema.wmsReceiving).set({ paymentMethod: "Tempo" }).where(eq(t.schema.wmsReceiving.id, r1.id));
    await wms.completeReceiving(r1.id, OWNER.userId, { forceApprove: true });
    const r2 = await receiveTempo(o.id);
    const bills = (await proc.listSupplierBills()).filter((b: any) => b.purchaseOrderId === o.id).sort((a: any, b: any) => a.amount - b.amount);
    expect(bills.map((b: any) => [b.amount, b.paidAmount, b.status])).toEqual([
      [36_000, 36_000, "paid"],
      [144_000, 64_000, "partial"],
    ]);
    expect(bills.reduce((s: number, b: any) => s + b.outstanding, 0)).toBe(80_000);
    expect((await expensesFor(r1.doc))[0].status).toBe("paid");
    expect((await expensesFor(r2.doc))[0].status).toBe("recorded");
    // Bayar lebih dari sisa Rp80.000 di tagihan kedua ditolak.
    const second = bills[1];
    await expect(proc.recordSupplierPayment({ billId: second.id, kind: "payment", amount: 80_001, method: "cash", fundSource: "external" }, OWNER)).rejects.toMatchObject({ code: "OVERPAY" });
  });

  it("batas DP memperhitungkan pembayaran tagihan yang sudah ada", async () => {
    // PO Rp1.000.000, tagihan pertama Rp400.000 sudah dibayar → DP maksimal Rp600.000.
    const p = (await wms.createWmsProduct({ sku: "T-DPCAP", name: "Bahan Cap DP", category: "Syrup", unit: "pcs" })).id;
    const o = await approvedPo([{ productId: p, orderedQty: 1000, unitPrice: 1000 }]);
    const { eq } = await import("drizzle-orm");
    const r1 = await po.createReceivingFromPurchaseOrder(o.id);
    await t.getDb().update(t.schema.wmsReceivingItem).set({ receivedQty: 400 }).where(eq(t.schema.wmsReceivingItem.receivingId, r1.id));
    await t.getDb().update(t.schema.wmsReceiving).set({ paymentMethod: "Tempo" }).where(eq(t.schema.wmsReceiving.id, r1.id));
    await wms.completeReceiving(r1.id, OWNER.userId, { forceApprove: true });
    const bill = (await proc.listSupplierBills()).find((b: any) => b.receivingId === r1.id);
    await proc.recordSupplierPayment({ billId: bill.id, kind: "payment", amount: 400_000, method: "transfer", fundSource: "bank_bni", reference: "BNI-9" }, OWNER);
    await expect(proc.recordSupplierPayment({ purchaseOrderId: o.id, kind: "dp", amount: 600_001, method: "cash", fundSource: "external" }, OWNER)).rejects.toMatchObject({ code: "OVERPAY" });
    const dp = await proc.recordSupplierPayment({ purchaseOrderId: o.id, kind: "dp", amount: 600_000, method: "cash", fundSource: "external" }, OWNER);
    expect(dp.amount).toBe(600_000);
  });

  it("penerimaan Cash tetap seperti semula: lunas saat diterima, tanpa tagihan", async () => {
    const o = await approvedPo([{ productId: beanId, orderedQty: 500, unitPrice: 180 }]);
    const r = await po.createReceivingFromPurchaseOrder(o.id);
    await wms.completeReceiving(r.id);
    expect((await expensesFor(r.doc))[0]).toMatchObject({ status: "paid", paymentMethod: "Cash", amount: 90_000 });
    expect((await proc.listSupplierBills()).some((b: any) => b.receivingId === r.id)).toBe(false);
  });
});

describe("Reorder tidak membeli dobel", () => {
  it("qty di PO terbuka mengurangi saran beli; klik ganda 'buat PO dari saran' tidak membuat PO ganda", async () => {
    const tea = (await wms.createWmsProduct({ sku: "T-TEA-RO", name: "Teh Reorder", category: "Syrup", unit: "gram" })).id;
    await proc.upsertSupplierProduct({ supplierId, productId: tea, refPrice: 50, role: "primary" }, OWNER);
    await po.upsertReorderRule({ productId: tea, warehouseId: mainBar, minQty: 100, maxQty: 1000 });
    let s = (await po.getReorderSuggestions()).find((x: any) => x.productId === tea);
    expect(s).toMatchObject({ needQty: 1000, onOrderQty: 0, purchaseQty: 1000, supplierId, lastPrice: 50 });

    // Sudah dipesan 400 di PO lain (masih draft) → saran beli tinggal 600.
    await po.createPurchaseOrder({ supplierId, items: [{ productId: tea, orderedQty: 400, unitPrice: 50 }] }, MANAJER.userId);
    s = (await po.getReorderSuggestions()).find((x: any) => x.productId === tea);
    expect(s).toMatchObject({ onOrderQty: 400, purchaseQty: 600 });

    const [first, second] = await Promise.all([po.createPurchaseOrdersFromSuggestions("user-itest"), po.createPurchaseOrdersFromSuggestions("user-itest")]);
    const made = [...first.created, ...second.created];
    const teaLines = [];
    for (const m of made) {
      const d = await po.getPurchaseOrder(m.id);
      teaLines.push(...d.items.filter((it: any) => it.productId === tea));
    }
    expect(teaLines).toHaveLength(1);
    expect(teaLines[0].orderedQty).toBe(600);
    expect(teaLines[0].sourceRefs[0]).toContain("Reorder");
    s = (await po.getReorderSuggestions()).find((x: any) => x.productId === tea);
    expect(s.purchaseQty).toBe(0);
  });
});

describe("Selisih harga penerimaan vs PO", () => {
  it("harga terima menyimpang >10% dari PO wajib dikonfirmasi & dicatat di audit", async () => {
    const o = await approvedPo([{ productId: beanId, orderedQty: 100, unitPrice: 180 }]);
    const r = await po.createReceivingFromPurchaseOrder(o.id);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.wmsReceivingItem).set({ hpp: 210 }).where(eq(t.schema.wmsReceivingItem.receivingId, r.id));
    await expect(wms.completeReceiving(r.id)).rejects.toThrow(/harga PO Rp180, terima Rp210 .*\+17%/);
    await wms.completeReceiving(r.id, OWNER.userId, { forceApprove: true });
    const logs = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.object, r.doc));
    expect(logs.some((l: any) => l.action === "Selisih harga penerimaan dikonfirmasi")).toBe(true);
  });

  it("selisih harga ≤10% tidak meminta konfirmasi", async () => {
    const o = await approvedPo([{ productId: beanId, orderedQty: 100, unitPrice: 180 }]);
    const r = await po.createReceivingFromPurchaseOrder(o.id);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.wmsReceivingItem).set({ hpp: 190 }).where(eq(t.schema.wmsReceivingItem.receivingId, r.id));
    const done = await wms.completeReceiving(r.id);
    expect(done.status).toBe("completed");
  });
});

describe("Procurement Command Center", () => {
  it("ringkasan menghitung status PO, tagihan, dan verifikasi pembayaran", async () => {
    const o = await po.createPurchaseOrder({ supplierId, items: [{ productId: beanId, orderedQty: 10, unitPrice: 180 }] }, MANAJER.userId);
    await proc.submitPurchaseOrder(o.id, MANAJER);
    const dash = await proc.getProcurementDashboard();
    expect(dash.poPendingApproval).toBeGreaterThanOrEqual(1);
    expect(dash.billsUnpaid).toBeGreaterThanOrEqual(1);
    expect(dash.billsOutstanding).toBeGreaterThanOrEqual(130_000);
    expect(typeof dash.paymentsPendingVerification).toBe("number");
  });
});
