import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Fee karyawan & kantong (audit 29 Okt 2026 #9): siklus 5 bulan, tarif per peran,
// fee siap/antar/bayar idempoten, pembalikan saat batal, kunci 5 bulan, pencairan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let earn: typeof import("@/lib/garage-earnings");
let outletId = "";
const KASIR = "user-earn-kasir";
const WAITER = "user-earn-waiter";
const OWNER = "user-earn-owner";
let seq = 0;

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: WAITER, name: "Waiter Uji", email: `${WAITER}@garage.id` },
    { id: OWNER, name: "Owner Uji", email: `${OWNER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir" },
    { userId: WAITER, outletId, role: "Waiter" },
    { userId: OWNER, outletId, role: "Owner" },
  ]);
  earn = await import("@/lib/garage-earnings");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

/** Order berisi `coffee` Kopi (Bar) + `food` Nasi (Dapur), plus tiket per stasiun. */
async function makeOrder(opts: { coffee: number; food: number; status?: string }) {
  const d = t.getDb();
  seq += 1;
  const total = opts.coffee * 20_000 + opts.food * 30_000;
  const [order] = await d
    .insert(t.schema.orders)
    .values({
      orderNo: `ERN-${seq}`,
      outletId,
      channel: "Dine-in",
      status: opts.status ?? "paid",
      subtotal: total,
      service: 0,
      tax: 0,
      total,
    } as any)
    .returning();
  const lines = [
    opts.coffee ? { menuItemId: "itm-coffee", itemName: "Kopi Test", unitPrice: 20_000, qty: opts.coffee } : null,
    opts.food ? { menuItemId: "itm-food", itemName: "Nasi Test", unitPrice: 30_000, qty: opts.food } : null,
  ].filter(Boolean) as any[];
  await d.insert(t.schema.orderItems).values(
    lines.map((l) => ({ ...l, orderId: order.id, variantId: "reg", variantLabel: "Regular", lineTotal: l.unitPrice * l.qty })),
  );
  const ticket = async (station: string) => {
    const [row] = await d
      .insert(t.schema.kitchenTickets)
      .values({ ticketNo: `KT-${seq}-${station}`, orderId: order.id, tableLabel: "Meja 01", channel: "Dine-in", station })
      .returning();
    return row.id as string;
  };
  return { orderId: order.id as string, barTicket: await ticket("bar"), foodTicket: await ticket("food") };
}

async function earningsOf(orderId: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.staffEarnings).where(eq(t.schema.staffEarnings.orderId, orderId));
}

describe("siklus & tarif (murni)", () => {
  it("siklus 5 bulan berjangkar Jan 2026, label lintas tahun benar", () => {
    const a = earn.getCycleForDate(new Date("2026-03-15T00:00:00Z"));
    expect(a).toMatchObject({ index: 0, label: "Jan–Mei 2026" });
    expect(a.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(a.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(earn.getCycleForDate(new Date("2026-10-29T00:00:00Z"))).toMatchObject({ index: 1, label: "Jun–Okt 2026" });
    const cross = earn.getCycleForDate(new Date("2027-01-10T00:00:00Z"));
    expect(cross).toMatchObject({ index: 2, label: "Nov 2026–Mar 2027" });
    const before = earn.getCycleForDate(new Date("2025-12-31T23:59:59Z"));
    expect(before).toMatchObject({ index: -1, label: "Agu–Des 2025" });
    expect(before.end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("batas siklus: detik terakhir Mei masuk siklus 0, 1 Juni siklus 1", () => {
    expect(earn.getCycleForDate(new Date("2026-05-31T23:59:59Z")).index).toBe(0);
    expect(earn.getCycleForDate(new Date("2026-06-01T00:00:00Z")).index).toBe(1);
  });

  it("tarif default per peran & event; peran tidak berhak = 0", () => {
    const f = (role: string, itemKind: any, event: any) => earn.lookupUnitFee({ role, itemKind, event });
    expect(f("Kasir", "food", "ticket_ready")).toBe(200);
    expect(f("Kasir", "drink", "ticket_ready")).toBe(200);
    expect(f("Waiter", "food", "ticket_ready")).toBe(0);
    expect(f("Waiter", "service", "ticket_delivered")).toBe(100);
    expect(f("Kasir", "service", "ticket_delivered")).toBe(0);
    expect(f("Kasir", "cashier", "order_paid")).toBe(200);
    expect(f("Manajer", "cashier", "order_paid")).toBe(0);
    expect(f("Kasir", "food", "order_paid")).toBe(0);
    expect(f("Kasir", "adjustment", "owner_adjustment")).toBe(0);
  });

  it("tarif dari Pengaturan menggantikan default", () => {
    const fees = {
      feeKitchenReadyPerItem: 300,
      feeBaristaReadyPerItem: 250,
      feePackagingReadyPerItem: 50,
      feeWaiterDeliveredPerItem: 150,
      feeCashierPaidPerItem: 175,
    } as any;
    expect(earn.lookupUnitFee({ role: "Kasir", itemKind: "food", event: "ticket_ready" }, fees)).toBe(300);
    expect(earn.lookupUnitFee({ role: "Kasir", itemKind: "drink", event: "ticket_ready" }, fees)).toBe(250);
    expect(earn.lookupUnitFee({ role: "Waiter", itemKind: "service", event: "ticket_delivered" }, fees)).toBe(150);
    expect(earn.lookupUnitFee({ role: "Kasir", itemKind: "cashier", event: "order_paid" }, fees)).toBe(175);
  });

  it("jenis item dari stasiun & kategori", () => {
    expect(earn.itemKindForStation("BAR")).toBe("drink");
    expect(earn.itemKindForStation("food")).toBe("food");
    expect(earn.itemKindForStation("packaging")).toBe("packaging");
    expect(earn.itemKindForStation("lainnya")).toBeNull();
    expect(earn.itemKindForStation(null)).toBeNull();
    expect(earn.itemKindForCategory("Coffee")).toBe("drink");
    expect(earn.itemKindForCategory("Non-Coffee")).toBe("drink");
    expect(earn.itemKindForCategory("Makanan")).toBe("food");
    expect(earn.itemKindForCategory(null)).toBe("food");
  });
});

describe("pencatatan fee", () => {
  it("tiket Bar siap: hanya item Bar, qty × tarif, sekali saja walau dipicu ulang", async () => {
    const o = await makeOrder({ coffee: 2, food: 1 });
    const first = await earn.recordTicketReadyEarnings({ ticketId: o.barTicket, staffUserId: KASIR, staffRole: "Kasir", outletId });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ staffUserId: KASIR, itemKind: "drink", qty: 2, unitFee: 200, amount: 400, status: "accrued" });
    const again = await earn.recordTicketReadyEarnings({ ticketId: o.barTicket, staffUserId: KASIR, staffRole: "Kasir", outletId });
    expect(again).toEqual([]);
    expect((await earningsOf(o.orderId)).filter((r: any) => r.event === "ticket_ready")).toHaveLength(1);
  });

  it("tiket Dapur yang ditandai Waiter: fee jatuh ke Kasir outlet, bukan Waiter", async () => {
    const o = await makeOrder({ coffee: 1, food: 3 });
    const rows = await earn.recordTicketReadyEarnings({ ticketId: o.foodTicket, staffUserId: WAITER, staffRole: "Waiter", outletId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffUserId: KASIR, role: "Kasir", itemKind: "food", qty: 3, amount: 600 });
  });

  it("order batal/void: tidak ada fee siap", async () => {
    const o = await makeOrder({ coffee: 1, food: 1, status: "void" });
    expect(await earn.recordTicketReadyEarnings({ ticketId: o.barTicket, staffUserId: KASIR, staffRole: "Kasir", outletId })).toEqual([]);
  });

  it("antar: Waiter dapat fee per item semua baris, sekali per tiket", async () => {
    const o = await makeOrder({ coffee: 2, food: 1 });
    const rows = await earn.recordTicketDeliveredEarnings({ ticketId: o.foodTicket, staffUserId: WAITER, staffRole: "Waiter", outletId });
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s: number, r: any) => s + r.amount, 0)).toBe(300);
    expect(rows.every((r: any) => r.staffUserId === WAITER && r.itemKind === "service")).toBe(true);
    expect(await earn.recordTicketDeliveredEarnings({ ticketId: o.foodTicket, staffUserId: WAITER, staffRole: "Waiter", outletId })).toEqual([]);
  });

  it("bayar: Kasir dapat fee per item; tarif Pengaturan dipakai; sekali per order", async () => {
    const o = await makeOrder({ coffee: 1, food: 2 });
    const rows = await earn.recordOrderPaidEarnings({
      orderId: o.orderId,
      staffUserId: KASIR,
      staffRole: "Kasir",
      outletId,
      fees: { feeCashierPaidPerItem: 250 } as any,
    });
    expect(rows.reduce((s: number, r: any) => s + r.amount, 0)).toBe(750);
    expect(await earn.recordOrderPaidEarnings({ orderId: o.orderId, staffUserId: KASIR, staffRole: "Kasir", outletId })).toEqual([]);
  });

  it("pembalikan saat batal: hanya fee accrued yang belum masuk pencairan", async () => {
    const { eq } = await import("drizzle-orm");
    const o = await makeOrder({ coffee: 1, food: 1 });
    const paid = await earn.recordOrderPaidEarnings({ orderId: o.orderId, staffUserId: KASIR, staffRole: "Kasir", outletId });
    const [payout] = await t
      .getDb()
      .insert(t.schema.staffEarningPayouts)
      .values({ staffUserId: KASIR, outletId, cycleStart: new Date(), cycleEnd: new Date(), totalAmount: 200, status: "pending" })
      .returning();
    await t.getDb().update(t.schema.staffEarnings).set({ payoutId: payout.id }).where(eq(t.schema.staffEarnings.id, paid[0].id));

    const reversed = await earn.reverseEarningsForOrder({ orderId: o.orderId, reason: "void uji" });
    expect(reversed.map((r: any) => r.id)).toEqual([paid[1].id]);
    const after = await earningsOf(o.orderId);
    expect(after.find((r: any) => r.id === paid[0].id).status).toBe("accrued");
    expect(after.find((r: any) => r.id === paid[1].id)).toMatchObject({ status: "reversed", reverseReason: "void uji" });
  });
});

describe("kantong (kunci 5 bulan) & pencairan", () => {
  const STAFF = "user-earn-wallet";

  beforeAll(async () => {
    const d = t.getDb();
    await d.insert(t.schema.user).values({ id: STAFF, name: "Kasir Kantong", email: `${STAFF}@garage.id` });
    await d.insert(t.schema.staffProfiles).values({ userId: STAFF, outletId, role: "Kasir" });
    const old = new Date();
    old.setUTCMonth(old.getUTCMonth() - 6);
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - 3);
    const row = (earnedAt: Date, amount: number, status = "accrued", itemKind = "cashier") => {
      const c = earn.getCycleForDate(earnedAt);
      return {
        staffUserId: STAFF, outletId, itemKind, role: "Kasir", event: "order_paid", qty: amount / 200, unitFee: 200, amount,
        status, cycleStart: c.start, cycleEnd: c.end, earnedAt,
      };
    };
    await d.insert(t.schema.staffEarnings).values([
      row(old, 1_000),
      row(old, 600, "accrued", "drink"),
      row(recent, 400),
      row(old, 200, "reversed"),
    ]);
  });

  it("saldo: lewat 5 bulan = tersedia, belum = terkunci; dibalik tidak dihitung", async () => {
    const w = await earn.getStaffWalletBalance(STAFF);
    expect(w).toMatchObject({ lockMonths: 5, availableBalance: 1_600, availableCount: 2, lockedBalance: 400, lockedCount: 1, totalReversed: 200, totalPaid: 0 });
    expect(w.lockedBreakdown).toHaveLength(1);
    expect(w.lockedBreakdown[0].amount).toBe(400);
    expect(new Date(w.nextUnlockAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("koreksi Owner langsung tersedia (tanggal dimundurkan melewati kunci)", async () => {
    const { row } = await earn.createOwnerAdjustment({ staffUserId: STAFF, outletId, amount: 5_000, note: "bonus uji" });
    expect(row).toMatchObject({ event: "owner_adjustment", amount: 5_000, reverseReason: "bonus uji" });
    expect((await earn.getStaffWalletBalance(STAFF)).availableBalance).toBe(6_600);
    expect((await earn.createOwnerAdjustment({ staffUserId: "tidak-ada", outletId, amount: 1 })).reason).toBe("STAFF_NOT_FOUND");
  });

  it("pencairan hanya mengambil fee yang sudah lewat kunci; setujui → bayar membuat fee 'paid'", async () => {
    const payout = await earn.closeCycleForStaff({ staffUserId: STAFF, cycle: earn.getCurrentCycle(), outletId, requestedBy: OWNER });
    expect(payout).toMatchObject({ totalAmount: 6_600, status: "pending", itemCountCashier: 5, itemCountDrink: 3 });

    // Belum disetujui → tidak bisa dibayar.
    expect(await earn.markPayoutPaid({ payoutId: payout!.id, paidByUserId: OWNER })).toBeNull();
    expect(await earn.approvePayout(payout!.id, OWNER, "ok")).toMatchObject({ status: "approved", approvedBy: OWNER });
    expect(await earn.approvePayout(payout!.id, OWNER)).toBeNull();
    expect(await earn.markPayoutPaid({ payoutId: payout!.id, paidByUserId: OWNER, paymentRef: "TRF-1" })).toMatchObject({ status: "paid", paymentRef: "TRF-1" });

    const w = await earn.getStaffWalletBalance(STAFF);
    expect(w).toMatchObject({ availableBalance: 0, totalPaid: 6_600, lockedBalance: 400 });
    // Yang masih terkunci tidak ikut pencairan berikutnya.
    expect(await earn.closeCycleForStaff({ staffUserId: STAFF, cycle: earn.getCurrentCycle(), outletId, requestedBy: OWNER })).toBeNull();
    // Pencairan yang sudah dibayar tidak bisa dibatalkan.
    expect(await earn.cancelPayout(payout!.id, OWNER)).toBeNull();
  });

  it("pencairan kedua di siklus yang sama (setelah dibayar) tetap bisa; batal melepas fee", async () => {
    // Bug lama: indeks unik (staf, awal siklus) membuat pencairan kedua siklus Jan–Mei gagal di DB.
    await earn.createOwnerAdjustment({ staffUserId: STAFF, outletId, amount: 2_000 });
    const payout = await earn.closeCycleForStaff({ staffUserId: STAFF, cycle: earn.getCurrentCycle(), outletId, requestedBy: OWNER });
    expect(payout!.totalAmount).toBe(2_000);
    expect(await earn.cancelPayout(payout!.id, OWNER, "salah nominal")).toMatchObject({ status: "cancelled", note: "salah nominal" });
    expect((await earn.getStaffWalletBalance(STAFF)).availableBalance).toBe(2_000);
  });

  it("selama ada pencairan aktif, pencairan baru ditolak jelas (PayoutActiveError)", async () => {
    const payout = await earn.closeCycleForStaff({ staffUserId: STAFF, cycle: earn.getCurrentCycle(), outletId, requestedBy: OWNER });
    expect(payout!.totalAmount).toBe(2_000);
    await earn.createOwnerAdjustment({ staffUserId: STAFF, outletId, amount: 700 });
    await expect(
      earn.closeCycleForStaff({ staffUserId: STAFF, cycle: earn.getCurrentCycle(), outletId, requestedBy: OWNER }),
    ).rejects.toBeInstanceOf(earn.PayoutActiveError);
    await earn.cancelPayout(payout!.id, OWNER);
  });

  it("dua permintaan bersamaan: hanya satu pencairan, fee tidak tertaut dua kali", async () => {
    const call = () => earn.closeCycleForStaff({ staffUserId: STAFF, cycle: earn.getCurrentCycle(), outletId, requestedBy: OWNER });
    const results = await Promise.allSettled([call(), call()]);
    const ok = results.filter((r) => r.status === "fulfilled" && r.value);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(earn.PayoutActiveError);
    expect((ok[0] as PromiseFulfilledResult<any>).value.totalAmount).toBe(2_700);
    await earn.cancelPayout((ok[0] as PromiseFulfilledResult<any>).value.id, OWNER);
  });

  it("buat pencairan otomatis melewati staf yang masih punya pencairan aktif", async () => {
    const first = await earn.autoCreateEligiblePayouts({ outletId, requestedBy: OWNER });
    expect(first.payouts.find((p) => p.staffUserId === STAFF)?.totalAmount).toBe(2_700);
    const second = await earn.autoCreateEligiblePayouts({ outletId, requestedBy: OWNER });
    expect(second.payouts.find((p) => p.staffUserId === STAFF)).toBeUndefined();
    expect(second.skippedActive).toBeGreaterThanOrEqual(1);
  });
});
