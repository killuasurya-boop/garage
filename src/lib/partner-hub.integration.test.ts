import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PartnerSession } from "@/lib/partner-auth";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Smart Partner Hub — alur penuh di DB nyata (PGlite): registrasi → aktivasi → order campuran →
// tiket Mitra → Portal Mitra → keuangan → settlement → payout. Rujukan UAT di docs/partner-hub/.

let t: GarageTestDb;
let outletId = "";
const kasirId = "user-itest-partner-kasir";
const ownerId = "user-itest-partner-owner";
const managerId = "user-itest-partner-mgr";
let svc: typeof import("@/lib/partner-hub-service");
let garageSvc: typeof import("@/lib/garage-service");
let partnerA = { id: "", code: "PAU" };
let partnerB = { id: "", code: "DSM" };
let linkA = "";
let menuA = "";

const sessionFor = (id: string, role: "Owner" | "Manajer" | "Kasir"): GarageSession =>
  ({
    user: { id, name: `${role} Test` },
    profile: { id: `sp-${id}`, role, shiftLabel: "Pagi", deviceLabel: "T-1", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  }) as unknown as GarageSession;
const owner = () => sessionFor(ownerId, "Owner");
const manager = () => sessionFor(managerId, "Manajer");
const kasir = () => sessionFor(kasirId, "Kasir");
const partnerSession = (partner: { id: string; code: string }, name = "Mitra"): PartnerSession => ({
  account: { id: `acc-${partner.code}`, displayName: name, phone: "081200000000" },
  partner: { id: partner.id, code: partner.code, name, outletId, status: "aktif", operationalStatus: "buka" },
});

async function setHub(enabled: boolean) {
  const d = t.getDb();
  await d.delete(t.schema.appSettings);
  await d.insert(t.schema.appSettings).values({ outletId, key: "partnerHubEnabled", valueJson: enabled });
}

async function activatePartner(id: string) {
  await svc.updatePartnerProfile(id, { phone: "081234500001", terms: "Harga & serah-terima disepakati Owner." }, manager());
  const bank = await svc.addPartnerBankAccount(id, { bankName: "Mandiri", accountName: "Henry", accountNumber: "1234560148" }, manager());
  await svc.verifyPartnerBankAccount(bank.id, owner());
  await svc.createPartnerAccount(id, { phone: `0812${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`, displayName: "Akun Mitra", pin: "246810" }, manager());
  const product = await svc.createPartnerProduct(
    id,
    { code: "DSM-001", name: "Dimsum Ayam", category: "Dimsum", variants: [{ variantId: "reg", label: "Regular", unitCost: 22_000, sellPrice: 25_000 }] },
    manager(),
  );
  await svc.setPartnerProductActive(product.linkId, true, owner());
  await svc.changePartnerStatus(id, "verifikasi", "data lengkap", manager());
  await svc.changePartnerStatus(id, "disetujui", "kontrak oke", owner());
  await svc.changePartnerStatus(id, "aktif", "uji order lulus", owner());
  await svc.setPartnerOperationalStatus(id, "buka", { garage: manager() });
}

const sale = (items: Array<{ itemId: string; qty: number }>, extra: Record<string, unknown> = {}) =>
  garageSvc.createOrder(
    {
      orderType: "dine-in",
      tableNumber: "12",
      paymentMethod: "Cash",
      cashReceived: 500_000,
      guestName: "Rizky A.",
      items: items.map((item) => ({ ...item, variantId: "reg" })),
      ...extra,
    } as never,
    kasir(),
  );

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: kasirId }));
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: ownerId, name: "Owner Test", email: `${ownerId}@garage.id` },
    { id: managerId, name: "Manajer Test", email: `${managerId}@garage.id` },
  ]);
  svc = await import("@/lib/partner-hub-service");
  garageSvc = await import("@/lib/garage-service");
  await setHub(true);
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Smart Partner Hub — registrasi & aktivasi", () => {
  it("mitra baru tidak bisa diaktifkan sebelum syarat lengkap (UAT-01)", async () => {
    const row = await svc.createPartner({ code: "PAU", name: "Es Krim Pokat Au" }, manager());
    partnerA = { id: row.id, code: row.code };
    await expect(svc.changePartnerStatus(row.id, "aktif", "langsung", owner())).rejects.toThrow(/tidak bisa diubah/);
    await svc.changePartnerStatus(row.id, "verifikasi", "cek", manager());
    await expect(svc.changePartnerStatus(row.id, "disetujui", "ok", manager())).rejects.toThrow(/hanya boleh dilakukan Owner/);
    await svc.changePartnerStatus(row.id, "disetujui", "ok", owner());
    await expect(svc.changePartnerStatus(row.id, "aktif", "ok", owner())).rejects.toThrow(/Rekening penerima belum diverifikasi/);
  });

  it("produk mitra baru nonaktif sampai disetujui Owner; aktivasi lengkap lalu BUKA", async () => {
    const product = await svc.createPartnerProduct(
      partnerA.id,
      { code: "PAU-002", name: "Es Krim Pokat", category: "Dessert", variants: [{ variantId: "reg", label: "Regular", unitCost: 19_000, sellPrice: 22_000 }] },
      manager(),
    );
    linkA = product.linkId;
    menuA = product.menuItemId;
    await expect(svc.setPartnerProductActive(linkA, true, manager())).rejects.toThrow(/Owner/);
    await svc.setPartnerProductActive(linkA, true, owner());
    // Status partner saat ini "disetujui": lengkapi syarat lalu aktifkan.
    await svc.updatePartnerProfile(partnerA.id, { phone: "085139649855", terms: "HPP sesuai kesepakatan; transfer setelah tutup." }, manager());
    const bank = await svc.addPartnerBankAccount(partnerA.id, { bankName: "Mandiri", accountName: "Henry", accountNumber: "9990000148" }, manager());
    expect(bank.accountMasked).toBe("•••• 0148");
    await expect(svc.verifyPartnerBankAccount(bank.id, manager())).rejects.toThrow(/Owner/);
    await svc.verifyPartnerBankAccount(bank.id, owner());
    await svc.createPartnerAccount(partnerA.id, { phone: "085139649855", displayName: "Henry", pin: "135790" }, manager());
    await svc.changePartnerStatus(partnerA.id, "aktif", "uji order lulus", owner());
    await svc.setPartnerOperationalStatus(partnerA.id, "buka", { garage: manager() });
    const list = await svc.listPartners(kasir());
    const mine = list.find((p) => p.id === partnerA.id)!;
    expect(mine.status).toBe("aktif");
    // Nomor rekening lengkap tidak dikirim ke non-Owner.
    expect(mine.bank[0].accountNumber).toBeUndefined();
  });
});

describe("Smart Partner Hub — order & tiket", () => {
  it("order meja kopi + es krim: satu invoice, tiket Bar + tiket Mitra, snapshot HPP (UAT-06)", async () => {
    const res = await sale([
      { itemId: "itm-coffee", qty: 1 },
      { itemId: menuA, qty: 2 },
    ]);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [order] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
    const tickets = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, order.id));
    expect(tickets.map((x: { station: string }) => x.station).sort()).toEqual(["Bar", "Mitra"]);
    const partnerTicket = tickets.find((x: { station: string }) => x.station === "Mitra")!;
    expect(partnerTicket.partnerId).toBe(partnerA.id);
    const lines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, order.id));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: 2, unitPrice: 22_000, unitCost: 19_000, tableLabel: "Meja 12", customerName: "Rizky A." });
    // Tiket Mitra tidak muncul di Production Hub Bar/Dapur.
    const { getProductionBoard } = await import("@/lib/garage-production");
    const board = await getProductionBoard(kasir());
    expect(JSON.stringify(board)).not.toContain(partnerTicket.ticketNo);
  });

  it("server menolak produk mitra saat Habis / Tutup / hub mati (UAT-03/04/24)", async () => {
    await svc.setPartnerProductAvailability(linkA, false, { partner: partnerSession(partnerA) });
    await expect(sale([{ itemId: menuA, qty: 1 }])).rejects.toThrow(/habis/i);
    await svc.setPartnerProductAvailability(linkA, true, { partner: partnerSession(partnerA) });
    await svc.setPartnerOperationalStatus(partnerA.id, "tutup", { partner: partnerSession(partnerA) });
    await expect(sale([{ itemId: menuA, qty: 1 }])).rejects.toThrow(/tutup/);
    await svc.setPartnerOperationalStatus(partnerA.id, "buka", { partner: partnerSession(partnerA) });
    await setHub(false);
    await expect(sale([{ itemId: menuA, qty: 1 }])).rejects.toThrow(/Partner Hub belum aktif/);
    // Produk Garage tetap jalan normal saat hub mati.
    await expect(sale([{ itemId: "itm-food", qty: 1 }])).resolves.toMatchObject({ orderNo: expect.any(String) });
    await setHub(true);
  });

  it("produk Garage biasa berstatus habis juga ditolak di POS (DEC-13)", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d.update(t.schema.menuItems).set({ stock: "sold_out" }).where(eq(t.schema.menuItems.id, "itm-food"));
    await expect(sale([{ itemId: "itm-food", qty: 1 }])).rejects.toThrow(/habis/);
    await d.update(t.schema.menuItems).set({ stock: "ready" }).where(eq(t.schema.menuItems.id, "itm-food"));
  });

  it("pelanggan tidak bisa checkout produk mitra dari menu digital (DEC-14)", async () => {
    await expect(
      garageSvc.createCustomerOrder({
        outletId,
        customerMode: "guest",
        customerName: "Tamu",
        customerPhone: "081299990000",
        orderType: "dine-in",
        tableNumber: "5",
        items: [{ itemId: menuA, variantId: "reg", qty: 1 }],
      } as never),
    ).rejects.toThrow(/produk mitra/);
  });

  it("harga diubah setelah order: snapshot transaksi lama tetap (UAT-14)", async () => {
    await expect(svc.setPartnerProductPrice(linkA, { variantId: "reg", unitCost: 20_000, sellPrice: 24_000, reason: "naik" }, manager())).rejects.toThrow(/Owner/);
    await svc.setPartnerProductPrice(linkA, { variantId: "reg", unitCost: 20_000, sellPrice: 24_000, reason: "Kesepakatan baru" }, owner());
    const d = t.getDb();
    const rows = await d.select().from(t.schema.partnerOrderLines);
    expect(rows.every((row: { unitCost: number }) => row.unitCost === 19_000)).toBe(true);
    await svc.setPartnerProductPrice(linkA, { variantId: "reg", unitCost: 19_000, sellPrice: 22_000, reason: "Kembali ke harga awal" }, owner());
  });
});

describe("Smart Partner Hub — Portal Mitra & isolasi", () => {
  it("mitra terima → proses → siap; transisi tidak sah ditolak; mitra lain 404 (UAT-09/20)", async () => {
    const b = await svc.createPartner({ code: "DSM", name: "Mitra Dimsum" }, manager());
    partnerB = { id: b.id, code: b.code };
    const [ticket] = await svc.listTicketsForPartner(partnerA.id, "active");
    expect(ticket.status).toBe("queue");
    await expect(svc.actOnPartnerTicket(partnerSession(partnerB), ticket.ticketNo, "accept")).rejects.toThrow(/tidak ditemukan/);
    expect(await svc.listTicketsForPartner(partnerB.id, "active")).toHaveLength(0);
    await expect(svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "start")).rejects.toThrow(/tidak bisa/);
    await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "accept");
    await expect(svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "accept")).rejects.toThrow(/tidak bisa/);
    await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "start");
    await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "ready");
    const d = t.getDb();
    const events = await d.select().from(t.schema.partnerEvents);
    expect(events.filter((e: { kind: string }) => e.kind.startsWith("ticket_")).map((e: { toStatus: string | null }) => e.toStatus)).toEqual(["accepted", "cooking", "ready"]);
    // Jejak mitra append-only.
    await expect(d.delete(t.schema.partnerEvents)).rejects.toThrow();
  });

  it("keuangan per mitra: 2 × Es Krim Pokat = jual 44.000, HPP 38.000, profit 6.000", async () => {
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const summary = await svc.partnerFinanceSummary(partnerA.id, outletId, from, to);
    expect(summary).toMatchObject({ grossSales: 44_000, totalCost: 38_000, garageProfit: 6_000, liabilityTotal: 38_000, totalQty: 2 });
  });
});

describe("Smart Partner Hub — settlement & payout", () => {
  it("settlement anti-dobel, Owner approve → biaya HPP Mitra, payout parsial lalu lunas (UAT-17/18/19)", async () => {
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const draft = await svc.createPartnerSettlement({ partnerId: partnerA.id, from, to }, kasir());
    expect(draft).toMatchObject({ status: "draft", liabilityTotal: 38_000, grossSales: 44_000, garageProfit: 6_000, lineCount: 1 });
    await expect(svc.createPartnerSettlement({ partnerId: partnerA.id, from, to }, kasir())).rejects.toThrow(/Tidak ada transaksi/);
    await svc.submitPartnerSettlement(draft.id, kasir());
    await expect(svc.approvePartnerSettlement(draft.id, kasir())).rejects.toThrow(/Owner/);
    await expect(
      svc.recordPartnerPayout(draft.id, { amount: 10_000, fundSource: "bank_jago", reference: "TRF-001", paidAt: new Date(), idempotencyKey: "pay-early-0001" }, manager()),
    ).rejects.toThrow(/disetujui Owner/);
    await svc.approvePartnerSettlement(draft.id, owner());
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [expense] = await d.select().from(t.schema.expenses).where(eq(t.schema.expenses.sourceDoc, `PSET:${draft.settlementNo}`));
    expect(expense).toMatchObject({ category: "HPP Mitra", amount: 38_000, status: "recorded" });

    await expect(
      svc.recordPartnerPayout(draft.id, { amount: 50_000, fundSource: "bank_jago", reference: "TRF-OVER", paidAt: new Date(), idempotencyKey: "pay-over-0001" }, manager()),
    ).rejects.toThrow(/melebihi sisa/);
    const first = await svc.recordPartnerPayout(draft.id, { amount: 20_000, fundSource: "bank_jago", reference: "TRF-1001", paidAt: new Date(), idempotencyKey: "pay-1001-key" }, manager());
    expect(first.status).toBe("recorded");
    // Retry dengan kunci sama = hasil sama, bukan pembayaran kedua.
    const replay = await svc.recordPartnerPayout(draft.id, { amount: 20_000, fundSource: "bank_jago", reference: "TRF-1001", paidAt: new Date(), idempotencyKey: "pay-1001-key" }, manager());
    expect(replay).toMatchObject({ id: first.id, replay: true });
    await expect(
      svc.recordPartnerPayout(draft.id, { amount: 1_000, fundSource: "bank_jago", reference: "TRF-1001", paidAt: new Date(), idempotencyKey: "pay-dup-ref" }, manager()),
    ).rejects.toThrow(/sudah pernah dicatat/);
    await expect(svc.verifyPartnerPayout(first.id, manager())).rejects.toThrow(/Owner/);
    const afterFirst = await svc.verifyPartnerPayout(first.id, owner());
    expect(afterFirst).toMatchObject({ paidAmount: 20_000, status: "partially_paid" });
    // Owner mencatat sisa → langsung terverifikasi (tanpa pemeriksa kedua) → lunas.
    await svc.recordPartnerPayout(draft.id, { amount: 18_000, fundSource: "bank_bni", reference: "TRF-1002", paidAt: new Date(), idempotencyKey: "pay-1002-key" }, owner());
    const detail = await svc.getPartnerSettlement(draft.id, { outletId });
    expect(detail.settlement).toMatchObject({ status: "paid", paidAmount: 38_000 });
    const [paidExpense] = await d.select().from(t.schema.expenses).where(eq(t.schema.expenses.sourceDoc, `PSET:${draft.settlementNo}`));
    expect(paidExpense.status).toBe("paid");
    // Mitra lain tidak bisa membuka settlement ini.
    await expect(svc.getPartnerSettlement(draft.id, { outletId, partnerId: partnerB.id })).rejects.toThrow(/tidak ditemukan/);
  });

  it("PDF settlement: FINAL berlogo, versi tetap bila isi sama, mitra lain ditolak (UAT-21/22)", async () => {
    const [settled] = await svc.listPartnerSettlements(outletId, partnerA.id);
    const first = await svc.generatePartnerReport(settled.settlement.id, { audience: "partner", outletId, generatedBy: ownerId });
    expect(first.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(first.report).toMatchObject({ kind: "final", version: 1, totalLines: 1 });
    const again = await svc.generatePartnerReport(settled.settlement.id, { audience: "partner", outletId, generatedBy: ownerId });
    expect(again.report.id).toBe(first.report.id);
    const asPartner = await svc.generatePartnerReport(settled.settlement.id, { audience: "partner", outletId, partnerId: partnerA.id, generatedBy: null });
    expect(asPartner.report.checksum).toBe(first.report.checksum);
    await expect(svc.generatePartnerReport(settled.settlement.id, { audience: "partner", outletId, partnerId: partnerB.id, generatedBy: null })).rejects.toThrow(/tidak ditemukan/);
    await expect(svc.generatePartnerReport(settled.settlement.id, { audience: "internal", outletId, partnerId: partnerA.id, generatedBy: null })).rejects.toThrow(/setelah settlement disetujui|resmi/);
  });

  it("order dibatalkan sebelum mitra memproses: tanpa penjualan & tanpa kewajiban (UAT-13)", async () => {
    const res = await sale([{ itemId: menuA, qty: 1 }]);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [order] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
    await d.update(t.schema.orders).set({ status: "voided" }).where(eq(t.schema.orders.id, order.id));
    const lines = await svc.partnerFinanceLines(partnerA.id, outletId, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    const voided = lines.find((line) => line.orderNo === res.orderNo)!;
    expect(voided.status).toBe("cancelled");
    const { partnerLineFinance } = await import("@/lib/partner-hub-rules");
    expect(partnerLineFinance(voided)).toMatchObject({ gross: 0, liability: 0 });
  });

  it("void setelah mitra menyiapkan: penjualan void, kewajiban HPP tetap (DEC-03)", async () => {
    const res = await sale([{ itemId: menuA, qty: 1 }]);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [order] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
    const [ticket] = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, order.id));
    for (const action of ["accept", "start", "ready"] as const) await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, action);
    // Void resmi membatalkan tiket produksi (termasuk yang sudah siap).
    await d.update(t.schema.kitchenTickets).set({ status: "cancelled" }).where(eq(t.schema.kitchenTickets.id, ticket.id));
    await d.update(t.schema.orders).set({ status: "voided" }).where(eq(t.schema.orders.id, order.id));
    const lines = await svc.partnerFinanceLines(partnerA.id, outletId, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    const line = lines.find((row) => row.orderNo === res.orderNo)!;
    expect(line).toMatchObject({ status: "ready", fulfilledQty: 1, salesVoided: true });
    const { partnerLineFinance } = await import("@/lib/partner-hub-rules");
    expect(partnerLineFinance(line)).toMatchObject({ gross: 0, liability: 19_000 });
  });

  it("refund seluruh qty item mitra tidak menggagalkan refund; snapshot tetap ada (orderItemId dilepas)", async () => {
    const res = await sale([
      { itemId: "itm-coffee", qty: 1 },
      { itemId: menuA, qty: 1 },
    ]);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [order] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
    const items = await d.select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.id));
    const partnerItem = items.find((item: { menuItemId: string }) => item.menuItemId === menuA)!;
    const req = await garageSvc.requestOrderRefundApproval(
      res.orderNo,
      { reasonCode: "komplain_kualitas", note: "meleleh", items: [{ orderItemId: partnerItem.id, qty: 1 }] },
      manager(),
    );
    if (req.status === "pending") await garageSvc.decideApproval(req.approvalId, { status: "approved" }, owner());
    const left = await d.select().from(t.schema.orderItems).where(eq(t.schema.orderItems.id, partnerItem.id));
    expect(left).toHaveLength(0);
    const lines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, order.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].orderItemId).toBeNull();
    const adjustments = await d.select().from(t.schema.partnerAdjustments).where(eq(t.schema.partnerAdjustments.orderLineId, lines[0].id));
    expect(adjustments).toHaveLength(1);
  });

  it("helper aktivasi lengkap untuk mitra kedua", async () => {
    await activatePartner(partnerB.id);
    const list = await svc.listPartners(owner());
    expect(list.find((p) => p.id === partnerB.id)?.status).toBe("aktif");
  });
});
