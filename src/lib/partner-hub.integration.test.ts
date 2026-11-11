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

  it("nomor HP/WA mitra wajib angka: nama pengguna ditolak untuk akun login & profil", async () => {
    await expect(
      svc.createPartnerAccount(partnerA.id, { phone: "dimsumcidut", displayName: "Salah isi", pin: "123456" }, manager()),
    ).rejects.toThrow(/Nomor HP\/WhatsApp tidak valid/);
    await expect(svc.updatePartnerProfile(partnerA.id, { phone: "eskrimpokatau" }, manager())).rejects.toThrow(/tidak valid/);
    const row = await svc.updatePartnerProfile(partnerA.id, { phone: "+62 851-3964-9855", handoverPoint: "Meja pass" }, manager());
    expect(row.phone).toBe("085139649855");
    expect(row.handoverPoint).toBe("Meja pass");
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

  it("HP mitra mati / lupa tutup kemarin: produk tidak bisa dijual sampai portal terhubung lagi", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d.update(t.schema.partners).set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) }).where(eq(t.schema.partners.id, partnerA.id));
    await expect(sale([{ itemId: menuA, qty: 1 }])).rejects.toThrow(/tidak terhubung/);
    const menu = await garageSvc.getMenuData();
    const card = (menu as Array<{ id: string; stock: string; partner?: { label: string | null } }>).find((item) => item.id === menuA)!;
    expect(card.stock).toBe("sold_out");
    expect(card.partner?.label).toBe("Mitra tidak terhubung");
    // Terhubung lagi tetapi status Buka berasal dari kemarin → dianggap Tutup.
    await d.update(t.schema.partners).set({ lastSeenAt: new Date(), operationalStatusAt: new Date(Date.now() - 30 * 3_600_000) }).where(eq(t.schema.partners.id, partnerA.id));
    await expect(sale([{ itemId: menuA, qty: 1 }])).rejects.toThrow(/tutup/);
    await svc.setPartnerOperationalStatus(partnerA.id, "buka", { partner: partnerSession(partnerA) });
    await expect(sale([{ itemId: menuA, qty: 1 }])).resolves.toBeTruthy();
  });

  it("mitra menolak pesanan lunas: masuk antrean refund kasir sampai item dikeluarkan dari bill", async () => {
    const res = await sale([
      { itemId: "itm-coffee", qty: 1 },
      { itemId: menuA, qty: 1 },
    ]);
    const tickets = await svc.listTicketsForPartner(partnerA.id, "active");
    const ticket = tickets.find((row) => row.orderNo === res.orderNo)!;
    await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "reject", "bahan habis");
    const monitor = await svc.listPartnerOrdersForOutlet(outletId, { escalateMinutes: 5 });
    const card = monitor.find((row) => row.ticketNo === ticket.ticketNo)!;
    expect(card).toMatchObject({ status: "rejected", needsRefund: true, paymentLabel: "Lunas" });
    const target = await svc.rejectedPartnerTicketForRefund(outletId, ticket.ticketNo);
    expect(target.items).toHaveLength(1);
    const req = await garageSvc.requestOrderRefundApproval(res.orderNo, { reasonCode: "menu_habis", note: "Ditolak mitra", items: target.items }, manager());
    if (req.status === "pending") await garageSvc.decideApproval(req.approvalId, { status: "approved" }, owner());
    const after = await svc.listPartnerOrdersForOutlet(outletId, {});
    expect(after.find((row) => row.ticketNo === ticket.ticketNo)).toBeUndefined();
    // Baris yang ditolak tidak pernah jadi penjualan → refund-nya tidak mengurangi penjualan dua kali.
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [order] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
    const [line] = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, order.id));
    const adjustments = await d.select().from(t.schema.partnerAdjustments).where(eq(t.schema.partnerAdjustments.orderLineId, line.id));
    expect(adjustments.map((row: { salesDelta: number }) => row.salesDelta)).toEqual([0]);
    await expect(svc.rejectedPartnerTicketForRefund(outletId, ticket.ticketNo)).rejects.toThrow(/sudah direfund/);
  });

  it("pisah bill: baris mitra ikut terbagi ke bill pisahan (qty, order, snapshot HPP)", async () => {
    const a = await sale([{ itemId: menuA, qty: 3 }]);
    const b = await sale([{ itemId: "itm-coffee", qty: 1 }]);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [orderA] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, a.orderNo));
    const [orderB] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, b.orderNo));
    const [itemA] = await d.select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, orderA.id));
    const [itemB] = await d.select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, orderB.id));
    const { movePartnerLineOnSplit } = await import("@/lib/partner-hub-orders");
    await movePartnerLineOnSplit(d, { orderItemId: itemA.id, child: { id: orderB.id, orderNo: orderB.orderNo }, movedQty: 1, newOrderItemId: itemB.id });
    const kept = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderItemId, itemA.id));
    const moved = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderItemId, itemB.id));
    expect(kept[0]).toMatchObject({ qty: 2, orderId: orderA.id });
    expect(moved[0]).toMatchObject({ qty: 1, orderId: orderB.id, orderNo: orderB.orderNo, unitCost: kept[0].unitCost, ticketId: kept[0].ticketId });
    // Seluruh sisa pindah → baris berpindah order, tidak digandakan.
    await movePartnerLineOnSplit(d, { orderItemId: itemA.id, child: { id: orderB.id, orderNo: orderB.orderNo } });
    const all = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, orderB.id));
    expect(all.map((line: { qty: number }) => line.qty).sort()).toEqual([1, 2]);
  });

  it("helper aktivasi lengkap untuk mitra kedua", async () => {
    await activatePartner(partnerB.id);
    const list = await svc.listPartners(owner());
    expect(list.find((p) => p.id === partnerB.id)?.status).toBe("aktif");
  });

  it("pendaftar /mitra → ditinjau → jadi mitra Draft dengan produk nonaktif; nomor WA sama tidak bisa daftar dobel", async () => {
    const app = await svc.submitPartnerApplication({
      businessName: "Kue Lapis Bu Rina",
      ownerName: "Rina",
      whatsapp: "0812 7777 1111",
      productKind: "Kue & roti",
      products: [
        { name: "Lapis Legit", offerPrice: 15_000, suggestedPrice: 20_000 },
        { name: "Bolu Pandan", offerPrice: 10_000 },
      ],
    });
    expect(app.applicationNo).toMatch(/^MTR-/);
    await expect(
      svc.submitPartnerApplication({ businessName: "Dobel", ownerName: "Rina", whatsapp: "081277771111", productKind: "Kue", products: [{ name: "X", offerPrice: 1_000 }] }),
    ).rejects.toThrow(/masih diproses/);
    await expect(svc.convertPartnerApplication(app.id, { code: "KLB", margin: 3_000, category: "Kue" }, manager())).rejects.toThrow();
    const result = await svc.convertPartnerApplication(app.id, { code: "KLB", margin: 3_000, category: "Kue" }, owner());
    expect(result.products).toBe(2);
    const products = await svc.listPartnerProducts(result.partnerId, { outletId, showCost: true });
    expect(products.map((p) => [p.code, p.active, p.variants[0].unitCost, p.variants[0].sellPrice])).toEqual([
      ["KLB-001", false, 15_000, 20_000],
      ["KLB-002", false, 10_000, 13_000],
    ]);
    const list = await svc.listPartnerApplications(manager());
    expect(list.find((row) => row.id === app.id)).toMatchObject({ status: "diterima", partnerId: result.partnerId });
    await expect(svc.convertPartnerApplication(app.id, { code: "KLC", margin: 0, category: "Kue" }, owner())).rejects.toThrow(/sudah dijadikan/);
  });

  it("konversi pendaftar atomik: kode produk bentrok di tengah → tidak ada mitra setengah jadi, ulang dengan kode lain berhasil", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    // Produk lain sudah memakai SKU "QQQ-002" → produk kedua pendaftar bentrok setelah mitra & produk pertama dibuat.
    await d.insert(t.schema.menuItems).values({ id: "itm-qqq-collide", sku: "QQQ-002", name: "Produk lain", category: "Lainnya", section: "Lainnya", prep: "1 mnt" });
    const app = await svc.submitPartnerApplication({
      businessName: "Martabak Pak Udin",
      ownerName: "Udin",
      whatsapp: "081277772222",
      productKind: "Martabak",
      products: [
        { name: "Martabak Manis", offerPrice: 20_000 },
        { name: "Martabak Telur", offerPrice: 25_000 },
      ],
    });
    await expect(svc.convertPartnerApplication(app.id, { code: "QQQ", margin: 3_000, category: "Martabak" }, owner())).rejects.toThrow(/sudah dipakai/);
    expect(await d.select().from(t.schema.partners).where(eq(t.schema.partners.code, "QQQ"))).toHaveLength(0);
    expect(await d.select().from(t.schema.partnerProductLinks).where(eq(t.schema.partnerProductLinks.code, "QQQ-001"))).toHaveLength(0);
    const [still] = await d.select().from(t.schema.partnerApplications).where(eq(t.schema.partnerApplications.id, app.id));
    expect(still).toMatchObject({ partnerId: null, status: "baru" });
    const ok = await svc.convertPartnerApplication(app.id, { code: "MPU", margin: 3_000, category: "Martabak" }, owner());
    expect(ok.products).toBe(2);
  });

  it("impor katalog PRD idempoten; pengaturan produk & aturan harga HPP + margin", async () => {
    const first = await svc.importPrdPartnerCatalog(owner());
    const pau = first.find((r) => r.partner.includes("Pokat"))!;
    // Es Krim (kode PAU) sudah ada dari tes awal: mitra tidak dibuat ulang, PAU-001 dkk tetap diimpor bila belum ada.
    expect(pau.created).toBe(false);
    const dsm = first.find((r) => r.partner.includes("Dimsum"))!;
    expect(dsm.productsCreated.length + dsm.productsSkipped.length).toBe(20);
    const again = await svc.importPrdPartnerCatalog(owner());
    expect(again.every((r) => r.productsCreated.length === 0 && !r.created)).toBe(true);
    await expect(svc.importPrdPartnerCatalog(manager())).rejects.toThrow();

    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [dimsumPartner] = await d.select().from(t.schema.partners).where(eq(t.schema.partners.code, "DSM"));
    const products = await svc.listPartnerProducts(dimsumPartner.id, { outletId, showCost: true });
    const ayam = products.find((p) => p.code === "DSM-001");
    if (ayam) {
      await svc.updatePartnerProductSettings(ayam.linkId, { name: "Dimsum Ayam Spesial", showInDigitalMenu: false, imageUrl: "/garage-uploads/menu/dimsum.webp" }, manager());
      await expect(svc.updatePartnerProductSettings(ayam.linkId, { imageUrl: "javascript:alert(1)" }, manager())).rejects.toThrow(/Foto/);
      const [item] = await d.select().from(t.schema.menuItems).where(eq(t.schema.menuItems.id, ayam.menuItemId));
      expect(item).toMatchObject({ name: "Dimsum Ayam Spesial", showInDigitalMenu: false });
    }
    await expect(svc.applyPartnerMarginRule(dimsumPartner.id, { margin: 4_000, reason: "uji" }, manager())).rejects.toThrow();
    const rule = await svc.applyPartnerMarginRule(dimsumPartner.id, { margin: 4_000, reason: "kesepakatan baru" }, owner());
    expect(rule.changed).toBeGreaterThan(0);
    const after = await svc.listPartnerProducts(dimsumPartner.id, { outletId, showCost: true });
    expect(after.every((p) => p.variants.every((v) => v.sellPrice - (v.unitCost ?? 0) === 4_000))).toBe(true);
  });
});

describe("Smart Partner Hub — kesiapan operasional (11 Nov 2026)", () => {
  it("tiket ditolak yang belum direfund tetap di antrean kasir walau sudah > 48 jam", async () => {
    await svc.setPartnerOperationalStatus(partnerA.id, "buka", { partner: partnerSession(partnerA) });
    const res = await sale([{ itemId: menuA, qty: 1 }]);
    const ticket = (await svc.listTicketsForPartner(partnerA.id, "active")).find((row) => row.orderNo === res.orderNo)!;
    await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, "reject", "bahan habis");
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d.update(t.schema.kitchenTickets).set({ createdAt: new Date(Date.now() - 72 * 3_600_000) }).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    const monitor = await svc.listPartnerOrdersForOutlet(outletId, {});
    expect(monitor.find((row) => row.ticketNo === ticket.ticketNo)).toMatchObject({ needsRefund: true });
  });

  it("sapuan SLA server: siap belum diambil → notifikasi waiter sekali per tiket", async () => {
    const res = await sale([{ itemId: menuA, qty: 1 }]);
    const ticket = (await svc.listTicketsForPartner(partnerA.id, "active")).find((row) => row.orderNo === res.orderNo)!;
    for (const action of ["accept", "ready"] as const) await svc.actOnPartnerTicket(partnerSession(partnerA), ticket.ticketNo, action);
    const d = t.getDb();
    const { eq, and, like } = await import("drizzle-orm");
    await d.update(t.schema.kitchenTickets).set({ readyAt: new Date(Date.now() - 30 * 60_000) }).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    const first = await svc.sweepPartnerSla();
    expect(first.readyWaiting).toBeGreaterThanOrEqual(1);
    await svc.sweepPartnerSla();
    const notes = await d
      .select()
      .from(t.schema.staffNotifications)
      .where(and(eq(t.schema.staffNotifications.kind, "partner_ready_waiting"), like(t.schema.staffNotifications.dedupKey, `%${ticket.ticketNo}`)));
    expect(notes.length).toBe(2); // waiter + manajemen, tidak berulang
  });

  it("mitra ganti PIN sendiri: PIN lama wajib benar, PIN lemah ditolak, sesi lama tidak berlaku", async () => {
    const { changePartnerPin, authenticatePartner } = await import("@/lib/partner-auth");
    const acc = await svc.createPartnerAccount(partnerA.id, { phone: "081299887766", displayName: "Kasir Mitra", pin: "246810" }, manager());
    expect((await changePartnerPin(acc.id, "000000", "135792")).ok).toBe(false);
    expect(await changePartnerPin(acc.id, "246810", "111111")).toMatchObject({ ok: false, code: "WEAK_PIN" });
    const done = await changePartnerPin(acc.id, "246810", "135792");
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.account.sessionVersion).toBeGreaterThan(1);
    expect(await authenticatePartner("081299887766", "246810")).toBeNull();
    expect((await authenticatePartner("081299887766", "135792"))?.ok).toBe(true);
  });

  it("varian tambah/hapus (Owner), riwayat harga & log kejadian, Excel & dashboard", async () => {
    await expect(svc.addPartnerVariant(linkA, { label: "Large", unitCost: 25_000, sellPrice: 30_000, reason: "ukuran besar" }, manager())).rejects.toThrow(/Owner/);
    const added = await svc.addPartnerVariant(linkA, { label: "Large", unitCost: 25_000, sellPrice: 30_000, reason: "ukuran besar" }, owner());
    await expect(svc.addPartnerVariant(linkA, { label: "large", unitCost: 25_000, sellPrice: 30_000, reason: "x" }, owner())).rejects.toThrow(/sudah ada/);
    await expect(svc.addPartnerVariant(linkA, { label: "Rugi", unitCost: 30_000, sellPrice: 20_000, reason: "x" }, owner())).rejects.toThrow(/di bawah HPP/);
    const history = await svc.listPartnerPriceHistory(partnerA.id, manager());
    expect(history.some((row) => row.variantId === added.variantId && row.sellPrice === 30_000)).toBe(true);
    await svc.removePartnerVariant(linkA, added.variantId, "tidak dijual", owner());
    const events = await svc.listPartnerEvents(partnerA.id, manager());
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["variant_added", "variant_removed"]));
    const products = await svc.listPartnerProducts(partnerA.id, { outletId, showCost: true });
    const only = products.find((p) => p.linkId === linkA)!;
    await expect(svc.removePartnerVariant(linkA, only.variants[0].variantId, "x", owner())).rejects.toThrow(/minimal satu/);

    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const s = await svc.partnerFinanceSummary(partnerA.id, outletId, from, to);
    const { partnerFinanceWorkbook } = await import("@/lib/partner-finance-xlsx");
    const buf = await partnerFinanceWorkbook({ from: "2026-11-10", to: "2026-11-12", generatedBy: "Owner Test", partners: [{ partnerName: "PAU", partnerCode: "PAU", orderCount: s.orderCount, netSales: s.netSales, totalCost: s.totalCost, garageProfit: s.garageProfit, liabilityTotal: s.liabilityTotal, paidAmount: s.paidAmount, outstanding: s.outstanding, lines: s.lines }] });
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // file xlsx (zip)

    const dash = await svc.partnerDashboardSummary(owner());
    expect(dash.partners.length).toBeGreaterThan(0);
    expect(dash.monthSales).toBeGreaterThanOrEqual(dash.todaySales);
    await expect(svc.partnerDashboardSummary(kasir())).rejects.toThrow();
  });

  it("nomor HP tidak valid tetap ditolak saat membuat akun dari portal admin", async () => {
    await expect(svc.createPartnerAccount(partnerA.id, { phone: "abc12345678", displayName: "x", pin: "123456" }, manager())).rejects.toThrow(/tidak valid/);
  });
});
