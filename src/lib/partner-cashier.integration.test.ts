import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PartnerSession } from "@/lib/partner-auth";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Partner Hub untuk kasir (Owner 16 Nov 2026): alur pesanan mitra dari POS sampai diserahkan, Penjualan Mitra di laporan
// shift (penjualan · modal mitra/wajib bayar · profit Garage), dan jam layanan produk mitra (tutup otomatis).

let t: GarageTestDb;
let outletId = "";
const kasirId = "user-itest-pc-kasir";
const kasir2Id = "user-itest-pc-kasir2";
const ownerId = "user-itest-pc-owner";
const managerId = "user-itest-pc-mgr";
let svc: typeof import("@/lib/partner-hub-service");
let garageSvc: typeof import("@/lib/garage-service");
let partner = { id: "", code: "DSM" };
let menuId = "";
let linkId = "";
let cashSessionId = "";

const sessionFor = (id: string, role: "Owner" | "Manajer" | "Kasir"): GarageSession =>
  ({
    user: { id, name: `${role} ${id.slice(-5)}` },
    profile: { id: `sp-${id}`, role, shiftLabel: "Pagi", deviceLabel: "T-1", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  }) as unknown as GarageSession;
const owner = () => sessionFor(ownerId, "Owner");
const manager = () => sessionFor(managerId, "Manajer");
const kasir = () => sessionFor(kasirId, "Kasir");
const kasir2 = () => sessionFor(kasir2Id, "Kasir");
const partnerSession = (): PartnerSession => ({
  account: { id: `acc-${partner.code}`, displayName: "Mitra Dimsum", phone: "081200000000" },
  partner: { id: partner.id, code: partner.code, name: "Mitra Dimsum", outletId, status: "aktif", operationalStatus: "buka" },
});

async function setSetting(key: string, value: unknown) {
  const d = t.getDb();
  const { and, eq } = await import("drizzle-orm");
  await d.delete(t.schema.appSettings).where(and(eq(t.schema.appSettings.outletId, outletId), eq(t.schema.appSettings.key, key)));
  await d.insert(t.schema.appSettings).values({ outletId, key, valueJson: value });
}

/** "HH:MM" WIB sekarang + `delta` menit. */
function wibClock(delta: number, now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  const minutes = (((local.getUTCHours() * 60 + local.getUTCMinutes() + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

async function setHours(open: string, close: string) {
  await setSetting("partnerServiceOpen", open);
  await setSetting("partnerServiceClose", close);
}

const takeaway = (qty: number) =>
  createOrder(
    { orderType: "takeaway", paymentMethod: "Cash", cashReceived: 500_000, guestName: "Andi", items: [{ itemId: menuId, variantId: "reg", qty }] } as never,
    kasir(),
  );
const dineIn = (qty: number, table = "14") =>
  createOrder(
    { orderType: "dine-in", tableNumber: table, paymentMethod: "Cash", cashReceived: 500_000, guestName: "Bima", items: [{ itemId: menuId, variantId: "reg", qty }] } as never,
    kasir(),
  );

/** createOrder mengembalikan ringkasan order (orderNo) — ambil id dari DB. */
async function createOrder(input: never, garage: GarageSession) {
  const res = (await garageSvc.createOrder(input, garage)) as { orderNo: string };
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
  return { order: { id: row.id as string, orderNo: res.orderNo } };
}

async function partnerTicketOf(orderNo: string) {
  const rows = await svc.listPartnerOrdersForOutlet(outletId, { scope: "today" });
  const row = rows.find((r) => r.orderNo === orderNo);
  if (!row) throw new Error(`tiket mitra ${orderNo} tidak ada`);
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: kasirId }));
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: ownerId, name: "Owner Test", email: `${ownerId}@garage.id` },
    { id: managerId, name: "Manajer Test", email: `${managerId}@garage.id` },
    { id: kasir2Id, name: "Kasir Dua", email: `${kasir2Id}@garage.id` },
  ]);
  svc = await import("@/lib/partner-hub-service");
  garageSvc = await import("@/lib/garage-service");
  await setSetting("partnerHubEnabled", true);
  await setHours("", "");

  const row = await svc.createPartner({ code: "DSM", name: "Mitra Dimsum" }, manager());
  partner = { id: row.id, code: row.code };
  await svc.updatePartnerProfile(row.id, { phone: "081234500001", terms: "Harga & serah-terima disepakati Owner." }, manager());
  const bank = await svc.addPartnerBankAccount(row.id, { bankName: "Mandiri", accountName: "Henry", accountNumber: "1234560148" }, manager());
  await svc.verifyPartnerBankAccount(bank.id, owner());
  await svc.createPartnerAccount(row.id, { phone: "081299900011", displayName: "Akun Mitra", pin: "246810" }, manager());
  const product = await svc.createPartnerProduct(
    row.id,
    { code: "DSM-001", name: "Dimsum Ayam", category: "Dimsum", variants: [{ variantId: "reg", label: "Regular", unitCost: 22_000, sellPrice: 25_000 }] },
    manager(),
  );
  linkId = product.linkId;
  await svc.setPartnerProductActive(product.linkId, true, owner());
  await svc.changePartnerStatus(row.id, "verifikasi", "data lengkap", manager());
  await svc.changePartnerStatus(row.id, "disetujui", "kontrak oke", owner());
  await svc.changePartnerStatus(row.id, "aktif", "uji order lulus", owner());
  await svc.setPartnerOperationalStatus(row.id, "buka", { garage: manager() });
  const [listed] = await svc.listPartnerProducts(row.id, { outletId, showCost: true });
  menuId = listed.menuItemId;
  const { eq } = await import("drizzle-orm");
  const [session] = await d.select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.openedBy, kasirId)).limit(1);
  cashSessionId = session.id;
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Kasir mengelola pesanan mitra take away", () => {
  it("belum siap → serahkan ditolak; mitra siap → kabar 'semua siap' + notif kasir; kasir serahkan → diserahkan & baris mitra delivered", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const created = (await takeaway(2)) as { order: { id: string; orderNo: string } };
    const ticket = await partnerTicketOf(created.order.orderNo);
    expect(ticket.status).toBe("queue");
    expect(ticket.fulfillment === "takeaway" || /take/i.test(ticket.tableLabel ?? "")).toBe(true);

    await expect(svc.handoverPartnerTicket(kasir(), ticket.ticketNo)).rejects.toThrow(/belum siap/);

    await svc.actOnPartnerTicket(partnerSession(), ticket.ticketNo, "accept");
    await svc.actOnPartnerTicket(partnerSession(), ticket.ticketNo, "ready");

    const notes = await d.select().from(t.schema.staffNotifications).where(eq(t.schema.staffNotifications.orderId, created.order.id));
    const kinds = notes.map((n: { kind: string; audience: string }) => `${n.kind}:${n.audience}`);
    // Take away: kasir diberi tahu pesanan mitra siap diserahkan; semua tiket order siap → tiket SELESAI masuk antrean
    // cetak (kabar pelanggan "SIAP DIAMBIL" ikut jalur yang sama untuk order online take away).
    expect(kinds).toContain("partner_ready:cashier");
    const printJobs = await d.select().from(t.schema.printJobs).where(eq(t.schema.printJobs.orderId, created.order.id));
    expect(printJobs.some((job: { jobType: string }) => job.jobType === "order_completion")).toBe(true);

    // Diklaim staf lain → kasir biasa tidak boleh menyerahkan.
    await d.update(t.schema.kitchenTickets).set({ claimedBy: kasir2Id, claimedByName: "Kasir Dua" }).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    await expect(svc.handoverPartnerTicket(kasir(), ticket.ticketNo)).rejects.toThrow(/sedang dibawa Kasir Dua/);
    await d.update(t.schema.kitchenTickets).set({ claimedBy: null, claimedByName: null }).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));

    const result = await svc.handoverPartnerTicket(kasir(), ticket.ticketNo);
    expect(result).toMatchObject({ status: "delivered", already: false });
    // Idempoten: tekan dua kali tidak dobel.
    expect(await svc.handoverPartnerTicket(kasir(), ticket.ticketNo)).toMatchObject({ already: true });

    const [row] = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    expect(row).toMatchObject({ status: "delivered", claimedBy: kasirId });
    const lines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, created.order.id));
    expect(lines.map((l: { status: string }) => l.status)).toEqual(["delivered"]);
    const open = (await d.select().from(t.schema.staffNotifications).where(eq(t.schema.staffNotifications.orderId, created.order.id))).filter(
      (n: { kind: string; resolvedAt: Date | null }) => (n.kind === "partner_ready" || n.kind === "takeaway_ready") && !n.resolvedAt,
    );
    expect(open).toHaveLength(0);
    const events = await d.select().from(t.schema.partnerEvents).where(eq(t.schema.partnerEvents.subjectId, ticket.ticketNo));
    expect(events.map((e: { kind: string }) => e.kind)).toContain("ticket_handover");

    // Riwayat hari ini menampilkan tiket yang sudah diserahkan.
    const history = await partnerTicketOf(created.order.orderNo);
    expect(history).toMatchObject({ status: "delivered", deliveredByName: expect.any(String) });
  });

  it("Owner menyelesaikan tiket yang dibawa staf lain: klaim asli dipertahankan (bukan ditimpa)", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const created = await takeaway(1);
    const ticket = await partnerTicketOf(created.order.orderNo);
    await svc.actOnPartnerTicket(partnerSession(), ticket.ticketNo, "accept");
    await svc.actOnPartnerTicket(partnerSession(), ticket.ticketNo, "ready");
    await d.update(t.schema.kitchenTickets).set({ claimedBy: kasir2Id, claimedByName: "Kasir Dua" }).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    expect(await svc.handoverPartnerTicket(owner(), ticket.ticketNo)).toMatchObject({ status: "delivered", already: false });
    const [row] = await d.select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.ticketNo, ticket.ticketNo));
    expect(row).toMatchObject({ status: "delivered", claimedBy: kasir2Id });
  });

  it("tiket mitra outlet lain / bukan tiket mitra → 404", async () => {
    await expect(svc.handoverPartnerTicket(kasir(), "TIDAK-ADA")).rejects.toThrow(/tidak ditemukan/);
  });
});

describe("Penjualan Mitra di laporan shift", () => {
  it("penjualan · modal mitra (wajib bayar) · profit Garage; belum siap & ditolak dipisah; PDF memuat seksi mitra", async () => {
    // Pesanan meja: siap (dihitung), belum siap (dipisah), ditolak (Rp0 ke mitra).
    const ready = (await dineIn(1, "15")) as { order: { orderNo: string } };
    const pending = (await dineIn(3, "16")) as { order: { orderNo: string } };
    const rejected = (await dineIn(1, "17")) as { order: { orderNo: string } };
    const readyTicket = await partnerTicketOf(ready.order.orderNo);
    await svc.actOnPartnerTicketAsStaff(kasir(), readyTicket.ticketNo, "accept");
    await svc.actOnPartnerTicketAsStaff(kasir(), readyTicket.ticketNo, "ready");
    const rejectedTicket = await partnerTicketOf(rejected.order.orderNo);
    await svc.actOnPartnerTicket(partnerSession(), rejectedTicket.ticketNo, "reject", "Stok habis");
    expect((await partnerTicketOf(pending.order.orderNo)).status).toBe("queue");

    const report = await import("@/lib/shift-accountability-report");
    const data = await report.getShiftAccountability(cashSessionId);
    expect(data?.partners).not.toBeNull();
    const totals = data!.partners!.totals;
    // Take away 2 + take away 1 (diserahkan Owner) + meja 1 = 4 × (25.000 jual / 22.000 setor).
    expect(totals).toMatchObject({ qty: 4, sales: 100_000, partnerCost: 88_000, payable: 88_000, garageProfit: 12_000, pendingQty: 3, cancelledQty: 1 });
    const [dimsum] = data!.partners!.partners;
    expect(dimsum.products).toEqual([{ itemName: "Dimsum Ayam", variantLabel: "Regular", qty: 4, unitPrice: 25_000, sales: 100_000, partnerCost: 88_000, garageProfit: 12_000 }]);
    expect(data!.partners!.payoutNote).toMatch(/pukul 12\.00 WIB/);
    expect(data!.products.find((p) => p.name === "Dimsum Ayam")?.partner).toBe(true);

    const pdf = await import("@/lib/shift-accountability-pdf");
    const buffer: Buffer = await pdf.renderShiftAccountabilityPdf(data!);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");

    // PDF tutup shift (POS / Laporan Shift) & slip struk memuat rincian mitra yang sama.
    const core = await import("@/lib/garage-service");
    const summary = await core.getCashSessionSummary(cashSessionId, kasirId, { allowAll: true });
    const txs = await core.getCashSessionTransactions(cashSessionId, kasirId, { allowAll: true });
    const partners = await svc.partnerSalesForCashSession(cashSessionId, owner(), { allowAll: true });
    const shiftPdf = await import("@/lib/garage-shift-report-pdf");
    const withPartners: Buffer = await shiftPdf.generateShiftReportPdf(summary!, txs!, partners);
    const withoutPartners: Buffer = await shiftPdf.generateShiftReportPdf(summary!, txs!, null);
    expect(withPartners.subarray(0, 4).toString()).toBe("%PDF");
    expect(withPartners.length).toBeGreaterThan(withoutPartners.length);
    const slips = await import("@/lib/management-slips");
    const slip = slips.buildShiftSlipContent({ ...summary!, partners } as unknown as Parameters<typeof slips.buildShiftSlipContent>[0], { width: 48 });
    expect(slip).toContain("PENJUALAN MITRA");
    expect(slip).toContain("4x Dimsum Ayam");

    // Layar POS saat shift BERJALAN: kasir pemilik boleh, kasir lain tidak.
    const onScreen = await svc.partnerSalesForCashSession(cashSessionId, kasir(), { allowAll: false });
    expect(onScreen).toMatchObject({ status: "open", totals: { sales: 100_000, payable: 88_000, garageProfit: 12_000 } });
    expect(JSON.stringify(onScreen)).not.toMatch(/expectedCash|actualCash/);
    await expect(svc.partnerSalesForCashSession(cashSessionId, kasir2(), { allowAll: false })).rejects.toThrow(/bukan milik kasir/);
    expect((await svc.partnerSalesForCashSession(cashSessionId, owner(), { allowAll: true })).totals.payable).toBe(88_000);
  });
});

describe("Jam layanan produk mitra (default 17.00–22.30)", () => {
  it("di luar jam: order POS ditolak & kartu menu 'Tutup · buka …'; di dalam jam: boleh", async () => {
    await setHours(wibClock(-61), wibClock(-1));
    await expect(takeaway(1)).rejects.toThrow(/Di luar jam layanan mitra/);
    const menu = await garageSvc.getMenuData();
    const item = (menu as Array<{ id: string; partner?: { label: string | null } }>).find((row) => row.id === menuId);
    expect(item?.partner?.label).toMatch(/^Tutup · buka /);

    await setHours(wibClock(-60), wibClock(60));
    await expect(takeaway(1)).resolves.toBeTruthy();
  });

  it("pesanan pelanggan sebelum jam tutup tetap sah walau kasir menerima setelah jam tutup", async () => {
    await setHours(wibClock(-60), wibClock(60));
    const created = (await garageSvc.createCustomerOrder({
      outletId,
      customerMode: "guest",
      guestName: "Tamu QR",
      orderType: "dine-in",
      tableLabel: "Meja 21",
      paymentMethod: "Cash",
      source: "qr_table",
      enforceTableClaim: true,
      items: [{ itemId: menuId, variantId: "reg", qty: 1 }],
    } as never)) as { order: { id: string } };
    // Pelanggan memesan 3 menit lalu (masih di dalam jam), lalu jam tutup lewat sebelum kasir sempat menerima.
    const d0 = t.getDb();
    const { eq: eq0 } = await import("drizzle-orm");
    await d0.update(t.schema.orders).set({ createdAt: new Date(Date.now() - 3 * 60_000) }).where(eq0(t.schema.orders.id, created.order.id));
    await setHours(wibClock(-61), wibClock(-1));
    await garageSvc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, kasir());
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const lines = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, created.order.id));
    expect(lines).toHaveLength(1);
  });

  it("sweeper menutup mitra Buka/Jeda sekali setelah jam tutup; dibuka mitra lagi tidak ditutup ulang", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await setHours(wibClock(-61), wibClock(-1));
    await d
      .update(t.schema.partners)
      .set({ operationalStatus: "buka", operationalStatusAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(t.schema.partners.id, partner.id));
    const first = await svc.sweepPartnerServiceHours();
    expect(first.closed).toBe(1);
    const [row] = await d.select().from(t.schema.partners).where(eq(t.schema.partners.id, partner.id));
    expect(row).toMatchObject({ operationalStatus: "tutup", operationalStatusBy: "Otomatis · jam layanan" });
    expect((await svc.sweepPartnerServiceHours()).closed).toBe(0);
    // Mitra menekan BUKA setelah jam tutup: pilihan mitra dihormati (pesanan tetap ditolak oleh jam layanan).
    await svc.setPartnerOperationalStatus(partner.id, "buka", { partner: partnerSession() });
    expect((await svc.sweepPartnerServiceHours()).closed).toBe(0);
    // Tanpa batas jam: tidak ada yang ditutup.
    await setHours("", "");
    expect(await svc.sweepPartnerServiceHours()).toEqual({ closed: 0, reminded: 0 });
    void linkId;
  });
});

describe("Partner Hub kokoh (Owner 16 Nov 2026)", () => {
  it("proses otomatis gagal 3× berturut-turut → Owner diberi tahu sekali; pulih → kabar pulih sekali", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d
      .insert(t.schema.staffProfiles)
      .values({ userId: ownerId, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop Owner" } as never)
      .onConflictDoNothing();
    const runner = await import("@/lib/background-job-runner");
    runner.resetBackgroundJobHealth();
    const base = Date.now();
    const at = (minute: number) => () => new Date(base + minute * 60_000);
    const boom = async () => {
      throw new Error("relation \"partners\" does not exist");
    };
    for (let i = 0; i < 5; i += 1) expect(await runner.runMonitoredJob("partner_hours", boom, at(i))).toBeNull();
    const alerts = await d.select().from(t.schema.staffNotifications).where(eq(t.schema.staffNotifications.kind, "system_alert"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ userId: ownerId, severity: "urgent" });
    expect(alerts[0].title).toContain("Jam layanan mitra");
    // Pesan ke Owner tidak membawa teks error mentah (SQL/stack).
    expect(`${alerts[0].title} ${alerts[0].body}`).not.toMatch(/relation|does not exist/);
    expect(runner.backgroundJobHealth().find((r) => r.job === "partner_hours")).toMatchObject({ status: "failing", consecutiveFailures: 5 });

    expect(await runner.runMonitoredJob("partner_hours", async () => ({ closed: 0, reminded: 0 }), at(6))).toEqual({ closed: 0, reminded: 0 });
    const recovered = await d.select().from(t.schema.staffNotifications).where(eq(t.schema.staffNotifications.kind, "system_recovered"));
    expect(recovered).toHaveLength(1);
    expect(runner.backgroundJobHealth().find((r) => r.job === "partner_hours")?.status).toBe("ok");
  });

  it("notifikasi alarm gagal terkirim → dicoba lagi di putaran gagal berikutnya (tidak hilang)", async () => {
    const runner = await import("@/lib/background-job-runner");
    runner.resetBackgroundJobHealth();
    const base = Date.now();
    const boom = async () => {
      throw new Error("down");
    };
    let attempts = 0;
    const flakyDeliver = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("notifikasi juga gagal");
    };
    for (let i = 0; i < 4; i += 1) await runner.runMonitoredJob("partner_sla", boom, () => new Date(base + i * 60_000), flakyDeliver);
    // Putaran ke-3 mencoba (gagal kirim), putaran ke-4 mencoba lagi (berhasil); setelah itu diam.
    expect(attempts).toBe(2);
    await runner.runMonitoredJob("partner_sla", boom, () => new Date(base + 5 * 60_000), flakyDeliver);
    expect(attempts).toBe(2);
  });

  it("cek silang: pesanan kasir tercatat di laporan shift; pesanan Owner tanpa shift muncul sebagai selisih", async () => {
    const created = (await garageSvc.createOrder(
      { orderType: "takeaway", paymentMethod: "QRIS", paymentReference: "QR-OWNER-1", guestName: "Tamu Owner", items: [{ itemId: menuId, variantId: "reg", qty: 1 }] } as never,
      owner(),
    )) as { orderNo: string };
    const ticket = await partnerTicketOf(created.orderNo);
    await svc.actOnPartnerTicket(partnerSession(), ticket.ticketNo, "accept");
    await svc.actOnPartnerTicket(partnerSession(), ticket.ticketNo, "ready");
    const { wibDayStart } = await import("@/lib/partner-hub-rules");
    const from = wibDayStart(new Date());
    const coverage = await svc.partnerShiftCoverageForDay(outletId, from, new Date(from.getTime() + 86_400_000));
    expect(coverage.shiftCount).toBeGreaterThanOrEqual(1);
    expect(coverage.uncoveredPayable).toBe(22_000);
    expect(coverage.missing).toEqual([expect.objectContaining({ orderNo: created.orderNo, qty: 1, payable: 22_000 })]);
    expect(coverage.missing[0].reason).toMatch(/luar shift kasir/);
    expect(coverage.coveredPayable).toBe(coverage.totalPayable - 22_000);

    // Order yang dibayar di shift lain (mis. shift hari berikutnya) tetap dihitung tercatat — bukan dibatasi tanggal shift.
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [orderRow] = await d.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, created.orderNo));
    await d.update(t.schema.payments).set({ cashSessionId }).where(eq(t.schema.payments.orderId, orderRow.id));
    const after = await svc.partnerShiftCoverageForDay(outletId, from, new Date(from.getTime() + 86_400_000));
    expect(after).toMatchObject({ uncoveredPayable: 0, missing: [] });

    // Penyesuaian kewajiban yang disetujui ikut dihitung (sama dengan rekap setoran).
    const [line] = await d.select().from(t.schema.partnerOrderLines).where(eq(t.schema.partnerOrderLines.orderId, orderRow.id));
    await d.insert(t.schema.partnerAdjustments).values({
      partnerId: partner.id,
      outletId,
      orderLineId: line.id,
      kind: "correction",
      qty: 0,
      salesDelta: 0,
      liabilityDelta: -2_000,
      reason: "koreksi harga setor",
      status: "approved",
      sourceRef: `itest-adj-${Date.now()}`,
    } as never);
    const adjusted = await svc.partnerShiftCoverageForDay(outletId, from, new Date(from.getTime() + 86_400_000));
    expect(adjusted.totalPayable).toBe(after.totalPayable - 2_000);
    expect(adjusted.coveredPayable).toBe(after.coveredPayable - 2_000);
    expect(adjusted.uncoveredPayable).toBe(0);
  });
});
