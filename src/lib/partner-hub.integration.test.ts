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

/** Tambah/ubah satu pengaturan outlet tanpa menghapus yang lain (setHub mengosongkan semua). */
async function setSetting(key: string, value: unknown) {
  const d = t.getDb();
  const { and, eq } = await import("drizzle-orm");
  await d.delete(t.schema.appSettings).where(and(eq(t.schema.appSettings.outletId, outletId), eq(t.schema.appSettings.key, key)));
  await d.insert(t.schema.appSettings).values({ outletId, key, valueJson: value });
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
      svc.createPartnerAccount(partnerA.id, { phone: "dimsumcidut", displayName: "Salah isi", pin: "246810" }, manager()),
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

  it("server menolak produk mitra saat Habis / hub mati; Tutup tidak menolak (keputusan di mitra)", async () => {
    await svc.setPartnerProductAvailability(linkA, false, { partner: partnerSession(partnerA) });
    await expect(sale([{ itemId: menuA, qty: 1 }])).rejects.toThrow(/habis/i);
    await svc.setPartnerProductAvailability(linkA, true, { partner: partnerSession(partnerA) });
    // Tutup/Jeda: pesanan tetap masuk antrean mitra — mitra yang menerima atau menolak.
    await svc.setPartnerOperationalStatus(partnerA.id, "tutup", { partner: partnerSession(partnerA) });
    const closed = (await garageSvc.getMenuData() as Array<{ id: string; stock: string; partner?: { label: string | null; note?: string | null } }>).find((item) => item.id === menuA)!;
    expect(closed.stock).not.toBe("sold_out");
    expect(closed.partner).toMatchObject({ label: null, note: "Mitra tutup" });
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

  it("setting partnerCustomerSelfOrder mati: pelanggan tidak bisa checkout produk mitra (DEC-14 lama)", async () => {
    await setSetting("partnerCustomerSelfOrder", false);
    await expect(
      garageSvc.createCustomerOrder({
        outletId,
        customerMode: "guest",
        guestName: "Tamu",
        orderType: "dine-in",
        tableLabel: "Meja 05",
        paymentMethod: "Cash",
        source: "qr_table",
        items: [{ itemId: menuA, variantId: "reg", qty: 1 }],
      } as never),
    ).rejects.toThrow(/produk mitra/);
    await setHub(true);
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
    // Buku kas: catatan Manajer yang belum diverifikasi belum mengurangi saldo bank.
    const ledgerOf = (payoutId: string) => d.select().from(t.schema.cashLedgerEntries).where(eq(t.schema.cashLedgerEntries.sourceId, payoutId));
    const { accountBalance } = await import("@/lib/cash-ledger");
    const jagoBefore = await accountBalance("bank_jago", outletId);
    expect(await ledgerOf(first.id)).toHaveLength(0);
    // Retry dengan kunci sama = hasil sama, bukan pembayaran kedua.
    const replay = await svc.recordPartnerPayout(draft.id, { amount: 20_000, fundSource: "bank_jago", reference: "TRF-1001", paidAt: new Date(), idempotencyKey: "pay-1001-key" }, manager());
    expect(replay).toMatchObject({ id: first.id, replay: true });
    await expect(
      svc.recordPartnerPayout(draft.id, { amount: 1_000, fundSource: "bank_jago", reference: "TRF-1001", paidAt: new Date(), idempotencyKey: "pay-dup-ref" }, manager()),
    ).rejects.toThrow(/sudah pernah dicatat/);
    await expect(svc.verifyPartnerPayout(first.id, manager())).rejects.toThrow(/Owner/);
    const afterFirst = await svc.verifyPartnerPayout(first.id, owner());
    expect(afterFirst).toMatchObject({ paidAmount: 20_000, status: "partially_paid" });
    // Terverifikasi → satu baris Rekening Jago → luar usaha; saldo Jago di buku kas turun 20.000.
    const jagoRows = await ledgerOf(first.id);
    expect(jagoRows).toHaveLength(1);
    expect(jagoRows[0]).toMatchObject({ fromAccount: "bank_jago", toAccount: "external", amount: 20_000, sourceType: "partner_payout" });
    expect(await accountBalance("bank_jago", outletId)).toBe(jagoBefore - 20_000);
    await expect(svc.verifyPartnerPayout(first.id, owner())).rejects.toThrow(/sudah diproses/);
    expect(await ledgerOf(first.id)).toHaveLength(1);
    // Owner mencatat sisa → langsung terverifikasi (tanpa pemeriksa kedua) → lunas.
    const bniBefore = await accountBalance("bank_bni", outletId);
    const second = await svc.recordPartnerPayout(draft.id, { amount: 18_000, fundSource: "bank_bni", reference: "TRF-1002", paidAt: new Date(), idempotencyKey: "pay-1002-key" }, owner());
    expect(await accountBalance("bank_bni", outletId)).toBe(bniBefore - 18_000);
    // Batal → baris pembalik (riwayat tetap), saldo BNI kembali; batal dua kali tidak menggandakan pembalik.
    await svc.voidPartnerPayout(second.id, "salah nominal transfer", owner());
    const bniRows = await ledgerOf(second.id);
    expect(bniRows.map((row: { sourceType: string }) => row.sourceType).sort()).toEqual(["partner_payout", "partner_payout_void"]);
    expect(bniRows.find((row: { sourceType: string }) => row.sourceType === "partner_payout_void")).toMatchObject({ fromAccount: "external", toAccount: "bank_bni", amount: 18_000, reversesId: bniRows.find((row: { sourceType: string }) => row.sourceType === "partner_payout")!.id });
    expect(await accountBalance("bank_bni", outletId)).toBe(bniBefore);
    // Uang pribadi Owner (external) tidak lewat rekening usaha → tidak ada baris buku kas.
    const personal = await svc.recordPartnerPayout(draft.id, { amount: 18_000, fundSource: "external", reference: "TRF-1003", paidAt: new Date(), idempotencyKey: "pay-1003-key" }, owner());
    expect(await ledgerOf(personal.id)).toHaveLength(0);
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

  it("HP mitra mati / lupa tutup kemarin: produk tetap bisa dipesan, kartu memberi keterangan mitra", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d.update(t.schema.partners).set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) }).where(eq(t.schema.partners.id, partnerA.id));
    const menu = await garageSvc.getMenuData();
    const card = (menu as Array<{ id: string; stock: string; partner?: { label: string | null; note?: string | null } }>).find((item) => item.id === menuA)!;
    expect(card.stock).not.toBe("sold_out");
    expect(card.partner).toMatchObject({ label: null, note: "Mitra tidak terhubung" });
    // Terhubung lagi tetapi status Buka berasal dari kemarin → dianggap Tutup.
    await d.update(t.schema.partners).set({ lastSeenAt: new Date(), operationalStatusAt: new Date(Date.now() - 30 * 3_600_000) }).where(eq(t.schema.partners.id, partnerA.id));
    const stale = (await garageSvc.getMenuData() as Array<{ id: string; partner?: { note?: string | null } }>).find((item) => item.id === menuA)!;
    expect(stale.partner?.note).toBe("Mitra tutup");
    await svc.setPartnerOperationalStatus(partnerA.id, "buka", { partner: partnerSession(partnerA) });
    const open = (await garageSvc.getMenuData() as Array<{ id: string; partner?: { note?: string | null } }>).find((item) => item.id === menuA)!;
    expect(open.partner?.note ?? null).toBeNull();
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

  it("mitra dinonaktifkan: angka keuangan bulan ini di dashboard tidak berubah", async () => {
    const before = await svc.partnerDashboardSummary(owner());
    expect(before.monthSales).toBeGreaterThan(0);
    await svc.changePartnerStatus(partnerA.id, "nonaktif", "kerja sama selesai", owner());
    const after = await svc.partnerDashboardSummary(owner());
    expect(after.monthSales).toBe(before.monthSales);
    expect(after.monthProfit).toBe(before.monthProfit);
    expect(after.partners.some((p) => p.partnerId === partnerA.id)).toBe(false);
  });

  it("nomor HP tidak valid tetap ditolak saat membuat akun dari portal admin", async () => {
    await expect(svc.createPartnerAccount(partnerA.id, { phone: "abc12345678", displayName: "x", pin: "246810" }, manager())).rejects.toThrow(/tidak valid/);
  });
});

describe("Smart Partner Hub — pengajuan harga, rapor kinerja & kesehatan (backlog P1/P2)", () => {
  let linkB = "";
  let startCost = 0;
  let startSell = 0;

  it("mitra mengajukan harga setor baru; harga master tidak berubah sampai Owner setuju", async () => {
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    linkB = products[0].linkId;
    // Harga awal dibaca dari master (tes sebelumnya sudah memakai aturan margin).
    startCost = products[0].variants[0].unitCost!;
    startSell = products[0].variants[0].sellPrice;
    expect(startSell).toBeGreaterThanOrEqual(startCost + 2_000);
    const session = partnerSession(partnerB, "Dimsum");
    const proposal = await svc.submitPartnerPriceProposal(session, { linkId: linkB, variantId: "reg", proposedUnitCost: startCost + 2_000, reason: "Harga daging ayam naik" });
    expect(proposal.status).toBe("pending");
    expect(proposal.proposalNo).toMatch(/^PRC-\d{6}-[0-9A-F]{6}$/);
    // satu pengajuan pending per varian
    await expect(svc.submitPartnerPriceProposal(session, { linkId: linkB, variantId: "reg", proposedUnitCost: 25_000, reason: "Revisi harga" })).rejects.toThrow(/Masih ada pengajuan/);
    // mitra lain tidak bisa mengajukan untuk produk ini (404, tidak bocor)
    await expect(svc.submitPartnerPriceProposal(partnerSession(partnerA), { linkId: linkB, variantId: "reg", proposedUnitCost: 23_000, reason: "Coba-coba" })).rejects.toThrow(/tidak ditemukan/);
    const unchanged = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    expect(unchanged[0].variants[0]).toMatchObject({ unitCost: startCost, sellPrice: startSell });

    // Staf melihat dampak margin; mitra tidak.
    const staffView = await svc.listPartnerPriceProposals({ outletId, status: "pending", withImpact: true });
    const row = staffView.find((p) => p.id === proposal.id)!;
    expect(row.defaultSellPrice).toBe(startSell);
    expect(row.impact).toMatchObject({ costDelta: 2_000, marginBefore: startSell - startCost, marginAfter: startSell - startCost - 2_000 });
    const partnerView = await svc.listPartnerPriceProposals({ outletId, partnerId: partnerB.id, withImpact: false });
    expect(partnerView[0]).not.toHaveProperty("impact");
  });

  it("hanya Owner yang memutuskan; tolak wajib alasan; setuju menulis harga + histori, order lama tidak berubah", async () => {
    const [pending] = await svc.listPartnerPriceProposals({ outletId, partnerId: partnerB.id, status: "pending", withImpact: true });
    await expect(svc.decidePartnerPriceProposal(pending.id, { approve: true }, manager())).rejects.toThrow(/Owner/);
    await expect(svc.decidePartnerPriceProposal(pending.id, { approve: false, note: " " }, owner())).rejects.toThrow(/Alasan/);
    const decided = await svc.decidePartnerPriceProposal(pending.id, { approve: true, sellPrice: startSell + 2_000, note: "Disetujui mulai hari ini" }, owner());
    expect(decided).toMatchObject({ status: "approved", unitCost: startCost + 2_000, sellPrice: startSell + 2_000 });
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    expect(products[0].variants[0]).toMatchObject({ unitCost: startCost + 2_000, sellPrice: startSell + 2_000 });
    const history = await svc.listPartnerPriceHistory(partnerB.id, owner());
    expect(JSON.stringify(history)).toContain(pending.proposalNo);
    // keputusan ganda ditolak
    await expect(svc.decidePartnerPriceProposal(pending.id, { approve: false, note: "x" }, owner())).rejects.toThrow(/sudah diputuskan/);
    // snapshot order lama tetap harga lama
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const old = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.partnerId, partnerB.id));
    for (const line of old) expect(line.unitCost).toBeLessThanOrEqual(startCost);
  });

  it("mitra membatalkan pengajuan sendiri; ditolak Owner tercatat dengan alasan", async () => {
    const session = partnerSession(partnerB, "Dimsum");
    const a = await svc.submitPartnerPriceProposal(session, { linkId: linkB, variantId: "reg", proposedUnitCost: startCost + 3_000, reason: "Ongkos gas naik" });
    await expect(svc.cancelPartnerPriceProposal(partnerSession(partnerA), a.id)).rejects.toThrow(/tidak ditemukan/);
    await svc.cancelPartnerPriceProposal(session, a.id);
    const b = await svc.submitPartnerPriceProposal(session, { linkId: linkB, variantId: "reg", proposedUnitCost: startCost + 4_000, reason: "Ongkos gas naik lagi" });
    await svc.decidePartnerPriceProposal(b.id, { approve: false, note: "Belum bisa, tunggu evaluasi bulan depan" }, owner());
    const list = await svc.listPartnerPriceProposals({ outletId, partnerId: partnerB.id, withImpact: false });
    expect(list.find((p) => p.id === a.id)?.status).toBe("cancelled");
    expect(list.find((p) => p.id === b.id)).toMatchObject({ status: "rejected", decisionNote: "Belum bisa, tunggu evaluasi bulan depan" });
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    expect(products[0].variants[0].unitCost).toBe(startCost + 2_000);
  });

  it("status Tersedia/Habis produk mitra tidak bisa diubah dari POS/menu (hanya mitra / Partner Hub)", async () => {
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    const menuId = products[0].menuItemId;
    await svc.setPartnerProductAvailability(products[0].linkId, false, { partner: partnerSession(partnerB, "Dimsum") });
    await expect(garageSvc.updateMenuProductStock(menuId, "ready", kasir())).rejects.toThrow(/produk mitra/);
    await expect(garageSvc.updateMenuProduct(menuId, { stock: "ready" } as never, owner())).rejects.toThrow(/produk mitra/);
    const { bulkProductAction } = await import("@/lib/product-management");
    const bulk = await bulkProductAction({ ids: [menuId], action: "stock", value: "ready" }, owner());
    expect(bulk.updated).toBe(0);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [item] = await d.select().from(t.schema.menuItems).where(eq(t.schema.menuItems.id, menuId));
    expect(item.stock).toBe("sold_out");
    await svc.setPartnerProductAvailability(products[0].linkId, true, { partner: partnerSession(partnerB, "Dimsum") });
  });

  it("rapor kinerja & kesehatan mitra dari tiket nyata", async () => {
    const from = new Date(Date.now() - 30 * 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const report = await svc.partnerPerformanceReport(partnerA.id, outletId, from, to, { acceptSlaMinutes: 5, prepTargetMinutes: 15, pickupSlaMinutes: 3 });
    expect(report.totalTickets).toBeGreaterThan(0);
    expect(report.partner.id).toBe(partnerA.id);
    expect(Array.isArray(report.bestSellers)).toBe(true);
    // akses lintas outlet ditolak
    await expect(svc.partnerPerformanceReport(partnerA.id, "00000000-0000-0000-0000-000000000000", from, to, { acceptSlaMinutes: 5, prepTargetMinutes: 15 })).rejects.toThrow(/tidak ditemukan/);
    const health = await svc.partnerHealthForOutlet(owner(), { acceptSlaMinutes: 5 });
    const healthB = health.find((h) => h.partnerId === partnerB.id)!;
    expect(healthB).toBeTruthy();
    // produk yang baru disetujui/diubah tidak dianggap "ketersediaan basi"
    expect(healthB.alerts.map((a) => a.code)).not.toContain("AVAILABILITY_STALE");
    await expect(svc.partnerHealthForOutlet(kasir(), { acceptSlaMinutes: 5 })).rejects.toThrow(/Owner\/Manajer/);
  });
});

describe("Smart Partner Hub — produk salah mitra & form produk umum", () => {
  it("form produk umum menolak edit produk mitra dengan arahan ke Partner Hub; tag/urutan tetap boleh", async () => {
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    const menuId = products[0].menuItemId;
    await expect(garageSvc.updateMenuProduct(menuId, { productType: "menu", description: "x" } as never, owner())).rejects.toThrow(/Partner Hub/);
    expect(await garageSvc.partnerProductEditBlock(menuId)).toMatch(/produk mitra .*Kelola Mitra/);
    expect(await garageSvc.partnerProductEditBlock("itm-coffee")).toBeNull();
    await garageSvc.updateMenuProduct(menuId, { sortOrder: 5 } as never, owner());
  });

  it("Owner memindahkan produk ke mitra lain: status mitra tujuan berlaku, pesanan lama tetap milik mitra asal", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    // Mitra tujuan (mis. hasil pendaftaran) yang punya akun portal tetapi belum punya produk.
    const target = await svc.createPartner({ code: "CDT", name: "Mitra Dimsum Cidut" }, manager());
    await svc.createPartnerAccount(target.id, { phone: "081299900011", displayName: "Cidut", pin: "135791" }, manager());
    const before = await svc.partnerHealthForOutlet(owner(), { acceptSlaMinutes: 5 });
    expect(before.find((h) => h.partnerId === target.id)).toBeUndefined(); // draft: tidak dipantau
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    const link = products[0];
    const oldLines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.partnerId, partnerB.id));
    await expect(svc.movePartnerProduct(link.linkId, { toPartnerId: target.id, reason: "salah mitra" }, manager())).rejects.toThrow(/Owner/);
    await expect(svc.movePartnerProduct(link.linkId, { toPartnerId: partnerB.id, reason: "sama" }, owner())).rejects.toThrow(/sudah milik/);
    // pengajuan harga pending ikut dibatalkan
    const proposal = await svc.submitPartnerPriceProposal(partnerSession(partnerB, "Dimsum"), { linkId: link.linkId, variantId: "reg", proposedUnitCost: (link.variants[0].unitCost ?? 0) + 1_000, reason: "uji pindah mitra" });
    const moved = await svc.movePartnerProduct(link.linkId, { toPartnerId: target.id, reason: "produk milik Dimsum Cidut" }, owner());
    expect(moved).toMatchObject({ fromPartnerId: partnerB.id, toPartnerId: target.id, cancelledProposals: 1 });
    expect((await svc.listPartnerProducts(target.id, { outletId, showCost: false })).map((p) => p.linkId)).toContain(link.linkId);
    expect((await svc.listPartnerProducts(partnerB.id, { outletId, showCost: false })).map((p) => p.linkId)).not.toContain(link.linkId);
    const [row] = await d.select().from(t.schema.partnerPriceProposals).where(eq(t.schema.partnerPriceProposals.id, proposal.id));
    expect(row.status).toBe("cancelled");
    // baris pesanan lama tetap milik mitra asal
    const stillOld = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.partnerId, partnerB.id));
    expect(stillOld.length).toBe(oldLines.length);
    // kembalikan supaya tes berikutnya tetap memakai mitra B
    await svc.movePartnerProduct(link.linkId, { toPartnerId: partnerB.id, reason: "kembalikan untuk uji" }, owner());
  });

  it("Owner memindahkan semua/sebagian produk sekaligus; pilihan asing ditolak tanpa ada yang berpindah", async () => {
    const d = t.getDb();
    const { and, eq } = await import("drizzle-orm");
    const source = await svc.createPartner({ code: "KTL", name: "Mitra Katalog Impor" }, manager());
    const target = await svc.createPartner({ code: "DFT", name: "Mitra Pendaftar" }, manager());
    const makeProduct = (code: string, name: string) =>
      svc.createPartnerProduct(source.id, { code, name, category: "Dimsum", variants: [{ variantId: "reg", label: "Regular", unitCost: 20_000, sellPrice: 24_000 }] }, manager());
    const p1 = await makeProduct("KTL-001", "Dimsum Ayam Katalog");
    const p2 = await makeProduct("KTL-002", "Dimsum Udang Katalog");
    const p3 = await makeProduct("KTL-003", "Siomay Katalog");
    const ids = (rows: Array<{ linkId: string }>) => rows.map((p) => p.linkId).sort();
    const listOf = (partnerId: string) => svc.listPartnerProducts(partnerId, { outletId, showCost: false });
    const bProducts = await listOf(partnerB.id);

    await expect(svc.movePartnerProducts(source.id, { toPartnerId: target.id, reason: "milik pendaftar" }, manager())).rejects.toThrow(/Owner/);
    await expect(svc.movePartnerProducts(source.id, { toPartnerId: source.id, reason: "sama" }, owner())).rejects.toThrow(/sama dengan mitra asal/);
    await expect(svc.movePartnerProducts(source.id, { toPartnerId: target.id, reason: "x" }, owner())).rejects.toThrow(/Alasan/);
    // produk mitra B ikut dipilih → seluruh permintaan ditolak, tidak ada yang berpindah
    await expect(
      svc.movePartnerProducts(source.id, { toPartnerId: target.id, reason: "milik pendaftar", linkIds: [p1.linkId, bProducts[0].linkId] }, owner()),
    ).rejects.toThrow(/bukan milik Mitra Katalog Impor/);
    expect(ids(await listOf(source.id))).toEqual(ids([p1, p2, p3]));

    // sebagian
    const partial = await svc.movePartnerProducts(source.id, { toPartnerId: target.id, reason: "siomay milik pendaftar", linkIds: [p3.linkId] }, owner());
    expect(partial).toMatchObject({ moved: 1, cancelledProposals: 0, products: [{ linkId: p3.linkId, name: "Siomay Katalog" }] });
    expect(ids(await listOf(target.id))).toEqual([p3.linkId]);

    // semua sisanya; pengajuan harga yang menunggu ikut dibatalkan
    const [proposal] = await d
      .insert(t.schema.partnerPriceProposals)
      .values({ proposalNo: "PPR-UJI-BULK", partnerId: source.id, linkId: p1.linkId, variantId: "reg", currentUnitCost: 20_000, currentSellPrice: 24_000, proposedUnitCost: 21_000, reason: "uji pindah semua", createdBy: "uji" })
      .returning();
    const all = await svc.movePartnerProducts(source.id, { toPartnerId: target.id, reason: "semua milik pendaftar" }, owner());
    expect(all).toMatchObject({ fromPartnerId: source.id, toPartnerId: target.id, moved: 2, cancelledProposals: 1 });
    expect(all.products.map((p) => p.name)).toEqual(["Dimsum Ayam Katalog", "Dimsum Udang Katalog"]);
    expect(await listOf(source.id)).toEqual([]);
    expect(ids(await listOf(target.id))).toEqual(ids([p1, p2, p3]));
    const [cancelled] = await d.select().from(t.schema.partnerPriceProposals).where(eq(t.schema.partnerPriceProposals.id, proposal.id));
    expect(cancelled.status).toBe("cancelled");
    const outEvents = await d
      .select()
      .from(t.schema.partnerEvents)
      .where(and(eq(t.schema.partnerEvents.partnerId, source.id), eq(t.schema.partnerEvents.kind, "product_moved_out")));
    expect(outEvents.length).toBe(3);
    const inEvents = await d
      .select()
      .from(t.schema.partnerEvents)
      .where(and(eq(t.schema.partnerEvents.partnerId, target.id), eq(t.schema.partnerEvents.kind, "product_moved_in")));
    expect(inEvents.length).toBe(3);
    // mitra B tidak tersentuh
    expect(ids(await listOf(partnerB.id))).toEqual(ids(bProducts));

    // mitra asal kini tanpa produk
    await expect(svc.movePartnerProducts(source.id, { toPartnerId: target.id, reason: "lagi" }, owner())).rejects.toThrow(/tidak punya produk/);
  });
});

describe("Smart Partner Hub — media marketing website", () => {
  it("produk mitra baru boleh dipromosikan setelah memenuhi syarat; publik tanpa HPP; Manajer tidak bisa memilih", async () => {
    await setHub(true);
    const products = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    const link = products[0];
    const before = await svc.partnerMarketingStatus(link.linkId, manager());
    expect(before.blockers.length).toBeGreaterThan(0);
    await expect(svc.setPartnerWebsitePromotion(link.linkId, true, owner())).rejects.toThrow(/Belum memenuhi syarat/);
    await svc.updatePartnerProductSettings(link.linkId, { imageUrl: "/garage-uploads/menu/dimsum-ayam.webp", description: "Dimsum ayam kukus isi ayam cincang, disajikan hangat.", showInDigitalMenu: true }, manager());
    expect((await svc.partnerMarketingStatus(link.linkId, manager())).blockers).toEqual([]);
    await expect(svc.setPartnerWebsitePromotion(link.linkId, true, manager())).rejects.toThrow(/Owner/);
    await svc.setPartnerWebsitePromotion(link.linkId, true, owner());
    const pub = await svc.publicPartnerMarketingProducts();
    const card = pub.find((p) => p.name === link.name)!;
    expect(card).toBeTruthy();
    expect(card).not.toHaveProperty("unitCost");
    expect(JSON.stringify(card)).not.toMatch(/22000|baseCost|phone/);
    // Hub dimatikan → tidak tampil; nyalakan lagi lalu lepas dari website.
    await setHub(false);
    expect((await svc.publicPartnerMarketingProducts()).some((p) => p.name === link.name)).toBe(false);
    await setHub(true);
    // Edit menu biasa (Manajer) tidak bisa menghapus/menambah tag promosi.
    const menuId = (await svc.listPartnerProducts(partnerB.id, { outletId, showCost: false })).find((p) => p.linkId === link.linkId)!.menuItemId;
    await garageSvc.updateMenuProduct(menuId, { tags: ["Mitra"] } as never, manager());
    expect((await svc.partnerMarketingStatus(link.linkId, manager())).promoted).toBe(true);
    // Portal mitra offline → tetap tampil di website tetapi tidak ditandai "tersedia sekarang".
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d.update(t.schema.partners).set({ lastSeenAt: new Date(Date.now() - 60 * 60_000) }).where(eq(t.schema.partners.id, partnerB.id));
    expect((await svc.publicPartnerMarketingProducts()).find((p) => p.name === link.name)?.availableNow).toBe(false);
    // Diarsipkan → hilang dari website.
    await d.update(t.schema.menuItems).set({ status: "archived" }).where(eq(t.schema.menuItems.id, menuId));
    expect((await svc.publicPartnerMarketingProducts()).some((p) => p.name === link.name)).toBe(false);
    await d.update(t.schema.menuItems).set({ status: "active" }).where(eq(t.schema.menuItems.id, menuId));
    await svc.setPartnerWebsitePromotion(link.linkId, false, owner());
    expect((await svc.publicPartnerMarketingProducts()).some((p) => p.name === link.name)).toBe(false);
    // Manajer mencoba menambah tag lewat edit menu → diabaikan.
    await garageSvc.updateMenuProduct(menuId, { tags: ["Mitra", "Promo Website"] } as never, manager());
    expect((await svc.partnerMarketingStatus(link.linkId, manager())).promoted).toBe(false);
  });
});

describe("Smart Partner Hub — pelanggan pesan sendiri dari QR meja (owner Nov 2026)", () => {
  const customerOrder = (items: Array<{ itemId: string; variantId: string; qty: number }>, table = "Meja 09") =>
    garageSvc.createCustomerOrder({
      outletId,
      customerMode: "guest",
      guestName: "Tamu QR",
      orderType: "dine-in",
      tableLabel: table,
      paymentMethod: "Cash",
      source: "qr_table",
      // Sama dengan route /api/customer/orders: dine-in pelanggan selalu dicek aturan meja.
      enforceTableClaim: true,
      items,
    } as never);

  it("pelanggan pesan kopi + produk mitra → menunggu kasir; mitra JEDA saat terima → ditolak; BUKA → tiket Mitra + snapshot HPP", async () => {
    await setHub(true);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const session = partnerSession(partnerB, "Dimsum");
    const [product] = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    await svc.setPartnerOperationalStatus(partnerB.id, "buka", { partner: session });
    await svc.setPartnerProductAvailability(product.linkId, true, { partner: session });

    const created = await customerOrder([
      { itemId: "itm-coffee", variantId: "reg", qty: 1 },
      { itemId: product.menuItemId, variantId: "reg", qty: 2 },
    ]);
    const orderId = (created as { order: { id: string; status: string } }).order.id;
    expect((created as { order: { status: string } }).order.status).toBe("pending_cashier");
    // Belum ada tiket apa pun sebelum kasir menerima.
    expect(await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId))).toHaveLength(0);

    // Produk ditandai Habis oleh mitra sebelum kasir menerima → terima ditolak, tidak ada tiket setengah jadi.
    await svc.setPartnerProductAvailability(product.linkId, false, { partner: session });
    await expect(garageSvc.updateCustomerOrderStatus(orderId, { action: "accept" }, kasir())).rejects.toThrow(/habis/i);
    expect(await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId))).toHaveLength(0);
    await svc.setPartnerProductAvailability(product.linkId, true, { partner: session });

    // Mitra JEDA: kasir tetap bisa menerima → tiket Bar + Mitra masuk; mitra yang memutuskan.
    await svc.setPartnerOperationalStatus(partnerB.id, "jeda", { partner: session });
    await garageSvc.updateCustomerOrderStatus(orderId, { action: "accept" }, kasir());
    await svc.setPartnerOperationalStatus(partnerB.id, "buka", { partner: session });
    const tickets = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId));
    const mitra = tickets.find((x: { station: string }) => x.station === "Mitra");
    expect(mitra?.partnerId).toBe(partnerB.id);
    const lines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, orderId));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: 2, unitCost: product.variants[0].unitCost, unitPrice: product.variants[0].sellPrice });
    // Tiket muncul di antrean Portal Mitra.
    const queue = await svc.listTicketsForPartner(partnerB.id, "active");
    expect(queue.some((x: { ticketNo: string }) => x.ticketNo === mitra?.ticketNo)).toBe(true);
  });

  it("produk mitra saat mitra TUTUP/JEDA: pelanggan tetap bisa pesan selama produk Tersedia; Habis ditolak", async () => {
    const session = partnerSession(partnerB, "Dimsum");
    const [product] = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    await svc.setPartnerOperationalStatus(partnerB.id, "tutup", { partner: session });
    const created = await customerOrder([{ itemId: product.menuItemId, variantId: "reg", qty: 1 }], "Meja 10");
    expect((created as { order: { status: string } }).order.status).toBe("pending_cashier");
    await svc.setPartnerOperationalStatus(partnerB.id, "buka", { partner: session });
    await svc.setPartnerProductAvailability(product.linkId, false, { partner: session });
    await expect(customerOrder([{ itemId: product.menuItemId, variantId: "reg", qty: 1 }], "Meja 11")).rejects.toThrow(/habis/i);
    await svc.setPartnerProductAvailability(product.linkId, true, { partner: session });
  });

  it("mitra menolak pesanan meja yang BELUM dibayar: kasir mengeluarkan item dari bill, kopi tetap ditagih", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const session = partnerSession(partnerB, "Dimsum");
    const [product] = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    const created = await customerOrder(
      [
        { itemId: "itm-coffee", variantId: "reg", qty: 1 },
        { itemId: product.menuItemId, variantId: "reg", qty: 1 },
      ],
      "Meja 12",
    );
    const order = (created as { order: { id: string; orderNo: string } }).order;
    await garageSvc.updateCustomerOrderStatus(order.id, { action: "accept" }, kasir());
    const ticket = (await svc.listTicketsForPartner(partnerB.id, "active")).find((row) => row.orderNo === order.orderNo)!;
    await svc.actOnPartnerTicket(session, ticket.ticketNo, "reject", "bahan habis");
    const card = (await svc.listPartnerOrdersForOutlet(outletId, {})).find((row) => row.ticketNo === ticket.ticketNo)!;
    expect(card.needsRefund).toBe(true);
    expect(card.paymentLabel).not.toBe("Lunas");
    const target = await svc.rejectedPartnerTicketForRefund(outletId, ticket.ticketNo);
    const req = await garageSvc.requestUnpaidItemCancelApproval(target.orderNo, { reasonCode: "menu_habis", note: "Ditolak mitra", items: target.items }, manager());
    if (req.status === "pending") await garageSvc.decideApproval(req.approvalId, { status: "approved" }, owner());
    // Item mitra keluar dari bill → tiket hilang dari antrean kasir; bill asal tinggal kopi.
    expect((await svc.listPartnerOrdersForOutlet(outletId, {})).find((row) => row.ticketNo === ticket.ticketNo)).toBeUndefined();
    await expect(svc.rejectedPartnerTicketForRefund(outletId, ticket.ticketNo)).rejects.toThrow(/dikeluarkan/);
    const left = await d.select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.id));
    expect(left.filter((item: { qty: number }) => item.qty > 0).map((item: { menuItemId: string | null }) => item.menuItemId)).toEqual(["itm-coffee"]);
  });

  it("order dibatalkan setelah masuk ke mitra: tiket tampil sebagai 'Dibatalkan Garage' di portal + event tercatat", async () => {
    const d = t.getDb();
    const { and, eq } = await import("drizzle-orm");
    const { cancelProductionForOrder } = await import("@/lib/garage-production-tickets");
    const [product] = await svc.listPartnerProducts(partnerB.id, { outletId, showCost: true });
    const created = await customerOrder([{ itemId: product.menuItemId, variantId: "reg", qty: 1 }], "Meja 14");
    const order = (created as { order: { id: string; orderNo: string } }).order;
    await garageSvc.updateCustomerOrderStatus(order.id, { action: "accept" }, kasir());
    const ticket = (await svc.listTicketsForPartner(partnerB.id, "active")).find((row) => row.orderNo === order.orderNo)!;
    await d.transaction((tx: never) => cancelProductionForOrder(tx, order.id, "Order dibatalkan: pelanggan pulang"));
    expect((await svc.listTicketsForPartner(partnerB.id, "active")).find((row) => row.ticketNo === ticket.ticketNo)).toBeUndefined();
    const recent = await svc.listRecentlyCancelledTickets(partnerB.id);
    expect(recent.find((row) => row.ticketNo === ticket.ticketNo)).toMatchObject({ status: "cancelled", issueReason: "Order dibatalkan: pelanggan pulang" });
    // Sudah lewat 10 menit → tidak lagi ditampilkan.
    expect(await svc.listRecentlyCancelledTickets(partnerB.id, new Date(Date.now() + 11 * 60_000))).toHaveLength(0);
    // Pemberitahuan dijadwalkan setelah transaksi (±1,5 dtk): event tercatat untuk mitra.
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    const events = await d
      .select()
      .from(t.schema.partnerEvents)
      .where(and(eq(t.schema.partnerEvents.partnerId, partnerB.id), eq(t.schema.partnerEvents.kind, "ticket_cancelled_by_garage"), eq(t.schema.partnerEvents.subjectId, ticket.ticketNo)));
    expect(events).toHaveLength(1);
    await d.update(t.schema.orders).set({ status: "voided" }).where(eq(t.schema.orders.id, order.id));
  });

  it("PIN buatan staf: PIN lemah ditolak; mitra wajib ganti PIN sebelum aksi lain", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const auth = await import("@/lib/partner-auth");
    await expect(svc.createPartnerAccount(partnerB.id, { phone: "081277700011", displayName: "PIN lemah", pin: "111111" }, manager())).rejects.toThrow(/mudah ditebak/);
    const acc = await svc.createPartnerAccount(partnerB.id, { phone: "081277700012", displayName: "Baru", pin: "864209" }, manager());
    const [row] = await d.select().from(t.schema.partnerAccounts).where(eq(t.schema.partnerAccounts.id, acc.id));
    expect(row.mustChangePin).toBe(true);
    const cookie = (version: number) => `${auth.PARTNER_COOKIE}=${auth.signPartnerSession({ id: acc.id, partnerId: partnerB.id, sessionVersion: version })}`;
    const req = (version: number) => new Request("http://localhost/api/partner/tickets", { headers: { cookie: cookie(version) } });
    const blocked = await auth.requirePartnerSession(req(row.sessionVersion));
    expect(blocked.response?.status).toBe(403);
    expect((await auth.requirePartnerSession(req(row.sessionVersion), { allowPinChangePending: true })).data?.account.mustChangePin).toBe(true);
    const changed = await auth.changePartnerPin(acc.id, "864209", "975318");
    expect(changed.ok).toBe(true);
    const after = await auth.requirePartnerSession(req(row.sessionVersion + 1));
    expect(after.data?.account.mustChangePin).toBe(false);
    // Reset PIN oleh staf → wajib ganti lagi.
    await expect(svc.updatePartnerAccount(acc.id, { pin: "123456" }, manager())).rejects.toThrow(/mudah ditebak/);
    await svc.updatePartnerAccount(acc.id, { pin: "531864" }, manager());
    const [reset] = await d.select().from(t.schema.partnerAccounts).where(eq(t.schema.partnerAccounts.id, acc.id));
    expect(reset.mustChangePin).toBe(true);
  });

  it("meja terisi: tanpa kode gabung (bawaan) siapa saja boleh menambah pesanan; setting wajib kode → ditolak", async () => {
    // Meja 09 terisi oleh pesanan di tes sebelumnya.
    const join = await garageSvc.holdCustomerTable({ tableNumber: "9", outletId });
    expect(join.mode).toBe("join");
    const extra = await customerOrder([{ itemId: "itm-coffee", variantId: "reg", qty: 1 }], "Meja 09");
    expect((extra as { order: { tableLabel: string } }).order.tableLabel).toBe("Meja 09");
    await setSetting("tableJoinCodeRequired", true);
    await expect(garageSvc.holdCustomerTable({ tableNumber: "9", outletId })).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });
    await expect(customerOrder([{ itemId: "itm-coffee", variantId: "reg", qty: 1 }], "Meja 09")).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });
    await setHub(true);
  });
});

describe("Smart Partner Hub — staf memproses pesanan atas nama mitra (Owner 15 Nov 2026)", () => {
  const staff = (id: string, role: "Owner" | "Manajer" | "Kasir" | "Waiter", workstation: string | null, otherOutlet = false): GarageSession =>
    ({
      user: { id, name: `${role}${workstation ? `-${workstation}` : ""} Staf` },
      profile: {
        id: `sp-${id}`,
        role,
        workstation,
        shiftLabel: "Pagi",
        deviceLabel: "T-1",
        passwordResetRequired: false,
        outlet: { id: otherOutlet ? "00000000-0000-0000-0000-000000000000" : outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      },
    }) as unknown as GarageSession;

  // Mitra sendiri untuk blok ini (tidak bergantung urutan/state test lain).
  let mitra = { id: "", code: "STF" };
  let menuStaf = "";
  beforeAll(async () => {
    await setHub(true);
    const row = await svc.createPartner({ code: "STF", name: "Mitra Staf" }, manager());
    mitra = { id: row.id, code: row.code };
    await svc.updatePartnerProfile(row.id, { phone: "081234500077", terms: "Uji staf atas nama mitra." }, manager());
    const bank = await svc.addPartnerBankAccount(row.id, { bankName: "BNI", accountName: "Staf", accountNumber: "7777000077" }, manager());
    await svc.verifyPartnerBankAccount(bank.id, owner());
    await svc.createPartnerAccount(row.id, { phone: "081277700077", displayName: "Akun Mitra Staf", pin: "246810" }, manager());
    const product = await svc.createPartnerProduct(
      row.id,
      { code: "STF-001", name: "Dimsum Uji Staf", category: "Dimsum", variants: [{ variantId: "reg", label: "Regular", unitCost: 22_000, sellPrice: 25_000 }] },
      manager(),
    );
    menuStaf = product.menuItemId;
    await svc.setPartnerProductActive(product.linkId, true, owner());
    await svc.changePartnerStatus(row.id, "verifikasi", "data lengkap", manager());
    await svc.changePartnerStatus(row.id, "disetujui", "kontrak oke", owner());
    await svc.changePartnerStatus(row.id, "aktif", "uji order lulus", owner());
  });

  async function freshTicket() {
    await svc.setPartnerOperationalStatus(mitra.id, "buka", { garage: manager() });
    const res = await sale([{ itemId: menuStaf, qty: 1 }]);
    return (await svc.listTicketsForPartner(mitra.id, "active")).find((row) => row.orderNo === res.orderNo)!;
  }

  it("waiter terima + barista (Kasir/bar) siapkan atas nama mitra; tercatat staf yang menekan", async () => {
    const ticket = await freshTicket();
    await svc.actOnPartnerTicketAsStaff(staff("user-itest-waiter", "Waiter", null), ticket.ticketNo, "accept");
    const out = await svc.actOnPartnerTicketAsStaff(staff("user-itest-barista", "Kasir", "bar"), ticket.ticketNo, "ready");
    expect(out.status).toBe("ready");
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [row] = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    expect(row.status).toBe("ready");
    expect(row.acceptedByName).toContain("Waiter Staf (staf, a.n.");
    expect(row.readyByName).toContain("Kasir-bar Staf (staf, a.n.");
    const events = (await d.select().from(t.schema.partnerEvents).where(eq(t.schema.partnerEvents.subjectId, ticket.ticketNo))) as Array<{
      kind: string;
      actorType: string;
      actorName: string;
      metadata: Record<string, unknown>;
    }>;
    const ready = events.find((e) => e.kind === "ticket_ready")!;
    expect(ready.actorType).toBe("staff");
    expect(ready.actorName).toMatch(/Kasir\/bar — atas nama/);
    expect(ready.metadata).toMatchObject({ onBehalfOfPartner: true, staffRole: "Kasir", staffWorkstation: "bar" });
    // Baris keuangan mitra ikut berubah persis seperti aksi mitra sendiri.
    const lines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.ticketId, row.id));
    expect(lines.every((line: { status: string }) => line.status === "ready")).toBe(true);
  });

  it("aturan transisi sama dengan portal mitra; tolak wajib alasan", async () => {
    const ticket = await freshTicket();
    const kurir = staff("user-itest-kurir", "Waiter", "kurir");
    await expect(svc.actOnPartnerTicketAsStaff(kurir, ticket.ticketNo, "start")).rejects.toThrow(/tidak bisa/);
    await expect(svc.actOnPartnerTicketAsStaff(kurir, ticket.ticketNo, "reject")).rejects.toThrow(/Alasan/);
    const out = await svc.actOnPartnerTicketAsStaff(kurir, ticket.ticketNo, "reject", "HP mitra mati, stok habis");
    expect(out.status).toBe("rejected");
    await expect(svc.actOnPartnerTicketAsStaff(kurir, ticket.ticketNo, "accept")).rejects.toThrow(/tidak bisa/);
    // Tiket ditolak masuk antrean refund kasir seperti penolakan oleh mitra.
    const monitor = await svc.listPartnerOrdersForOutlet(outletId, {});
    expect(monitor.find((r) => r.ticketNo === ticket.ticketNo)).toMatchObject({ needsRefund: true });
  });

  it("jalur staf: terima → mulai proses → siap (serah-terima tercatat)", async () => {
    const ticket = await freshTicket();
    const manajer = staff("user-itest-mgr-onbehalf", "Manajer", null);
    for (const action of ["accept", "start", "ready"] as const) await svc.actOnPartnerTicketAsStaff(manajer, ticket.ticketNo, action);
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [row] = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    expect(row).toMatchObject({ status: "ready" });
    expect(row.handoverByName).toContain("(staf, a.n.");
    expect(row.handoverAt).not.toBeNull();
  });

  it("jalur portal mitra tidak berubah: aktor 'partner', nama akun mitra, tanpa metadata staf", async () => {
    const ticket = await freshTicket();
    await svc.actOnPartnerTicket(partnerSession(mitra, "Akun Mitra Staf"), ticket.ticketNo, "accept");
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [row] = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    expect(row.acceptedByName).toBe("Akun Mitra Staf");
    const [event] = (await d.select().from(t.schema.partnerEvents).where(eq(t.schema.partnerEvents.subjectId, ticket.ticketNo))) as Array<{ actorType: string; metadata: Record<string, unknown> }>;
    expect(event.actorType).toBe("partner");
    expect(event.metadata).toEqual({});
  });

  it("staf outlet lain / tiket bukan mitra → 404", async () => {
    const ticket = await freshTicket();
    await expect(svc.actOnPartnerTicketAsStaff(staff("user-itest-luar", "Kasir", null, true), ticket.ticketNo, "accept")).rejects.toThrow(/tidak ditemukan/);
    await expect(svc.actOnPartnerTicketAsStaff(staff("user-itest-kasir2", "Kasir", null), "TIKET-TIDAK-ADA", "accept")).rejects.toThrow(/tidak ditemukan/);
  });
});
