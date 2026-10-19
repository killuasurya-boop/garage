import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Order & invoice admin (owner, Okt 2026): kasir hanya mengajukan; Owner/Manajer
// ubah status/metode bayar, edit info, arsip/pulihkan, riwayat — tanpa
// menggandakan pembayaran atau mengubah nominal.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const USER = "user-itest-order-admin";

const as = (role: Role) =>
  ({
    user: { id: USER, name: `${role} Test`, email: `${USER}@garage.id` },
    profile: {
      id: `sp-${USER}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

async function rowsWhere(table: any, column: any, value: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(table).where(eq(column, value));
}

async function openBill(name: string) {
  const created = await svc.createCustomerOrder({
    orderType: "takeaway",
    outletId,
    customerMode: "guest",
    guestName: name,
    source: "qr_takeaway",
    staffOrder: true,
    paymentMethod: "Cash",
    items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
  });
  await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, as("Kasir"), { openBill: true });
  const [order] = await rowsWhere(t.schema.orders, t.schema.orders.id, created.order.id);
  return order;
}

async function expectedCash() {
  const { eq } = await import("drizzle-orm");
  const [session] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"));
  return session.expectedCash as number;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: USER })).outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("order & invoice admin", () => {
  it("kasir tidak bisa membatalkan pesanan yang sudah diproses; Owner/Manajer saja yang bisa aksi admin", async () => {
    const order = await openBill("Dodi");
    await svc.updateCustomerOrderStatus(order.id, { action: "request_bill" }, as("Kasir"));
    const [billed] = await rowsWhere(t.schema.orders, t.schema.orders.id, order.id);
    expect(billed.status).toBe("awaiting_payment");
    await expect(
      svc.updateCustomerOrderStatus(order.id, { action: "reject", reason: "batal" }, as("Kasir")),
    ).rejects.toThrow(/Ajukan Batal/);
    for (const call of [
      () => svc.revertOrderPayment(order.id, "salah input lunas", as("Kasir")),
      () => svc.updateOrderInfo(order.id, { customerName: "X", reason: "typo" }, as("Kasir")),
      () => svc.setOrderArchived(order.id, { archived: true, reason: "rapikan" }, as("Waiter")),
      () => svc.getOrderChangeHistory(order.id, as("Kasir")),
      () => svc.confirmOrderPayment(order.id, { paymentMethod: "Cash", reason: "bayar" }, as("Kasir")),
    ]) {
      await expect(call()).rejects.toThrow(/Owner atau Manajer/);
    }
  });

  it("lunas → batalkan pelunasan → konfirmasi lunas: satu pembayaran, kas & total konsisten, audit lengkap", async () => {
    const order = await openBill("Eka");
    const before = await expectedCash();
    await svc.updateCustomerOrderStatus(order.id, { action: "paid", paymentMethod: "Cash", cashReceived: order.total }, as("Kasir"));
    expect(await expectedCash()).toBe(before + order.total);

    await svc.revertOrderPayment(order.id, "Salah tekan lunas", as("Manajer"));
    const [reverted] = await rowsWhere(t.schema.orders, t.schema.orders.id, order.id);
    expect(reverted.status).toBe("awaiting_payment");
    expect(reverted.total).toBe(order.total);
    expect(await expectedCash()).toBe(before);
    let pays = await rowsWhere(t.schema.payments, t.schema.payments.orderId, order.id);
    expect(pays.map((p: any) => p.status)).toEqual(["pending"]);

    await svc.confirmOrderPayment(order.id, { paymentMethod: "QRIS", reason: "Pelanggan bayar QRIS" }, as("Manajer"));
    const [paid] = await rowsWhere(t.schema.orders, t.schema.orders.id, order.id);
    expect(paid.status).toBe("paid");
    pays = await rowsWhere(t.schema.payments, t.schema.payments.orderId, order.id);
    expect(pays).toHaveLength(1);
    expect(pays[0].status).toBe("captured");
    expect(pays[0].method).toBe("QRIS");
    expect(pays[0].amount).toBe(order.total);
    expect(await expectedCash()).toBe(before);

    await svc.updateOrderInfo(order.id, { customerName: "Eka Putri", reason: "Salah ketik nama" }, as("Owner"));
    await svc.setOrderArchived(order.id, { archived: true, reason: "Rapikan daftar" }, as("Owner"));
    const archivedList = await svc.listInvoicesForFinance({ outletId, archived: "only" });
    expect(archivedList.rows.map((r: any) => r.orderNo)).toContain(order.orderNo);
    const activeList = await svc.listInvoicesForFinance({ outletId });
    expect(activeList.rows.map((r: any) => r.orderNo)).not.toContain(order.orderNo);
    await svc.setOrderArchived(order.id, { archived: false, reason: "Dipulihkan" }, as("Owner"));

    const history = await svc.getOrderChangeHistory(order.id, as("Owner"));
    const actions = history.map((h: any) => h.action).join("|");
    expect(actions).toMatch(/Batalkan pelunasan/);
    expect(actions).toMatch(/Konfirmasi lunas/);
    expect(actions).toMatch(/Edit order/);
    expect(actions).toMatch(/Arsip invoice/);
    expect(actions).toMatch(/Pulihkan invoice/);
    const edit = history.find((h: any) => /Edit order/.test(h.action));
    expect(edit.metadata.before.customerName).toBe("Eka");
    expect(edit.metadata.after.customerName).toBe("Eka Putri");

    // Filter: status bayar, metode, jenis pesanan.
    const lunasQris = await svc.listInvoicesForFinance({ outletId, paymentStatus: "paid", paymentMethod: "QRIS", channelGroup: "takeaway" });
    expect(lunasQris.rows.map((r: any) => r.orderNo)).toContain(order.orderNo);
    const cashOnly = await svc.listInvoicesForFinance({ outletId, paymentMethod: "Cash" });
    expect(cashOnly.rows.map((r: any) => r.orderNo)).not.toContain(order.orderNo);
  });

  it("invoice Pending tidak bisa diarsip; kasir void selalu jadi pengajuan", async () => {
    const order = await openBill("Fani");
    await expect(svc.setOrderArchived(order.id, { archived: true, reason: "x yz" }, as("Owner"))).rejects.toThrow(/Pending/);
    // Walau setting "wajib Manajer untuk void" dimatikan, kasir tetap hanya mengajukan.
    await svc.updateAppSettings(outletId, { requireManagerForVoid: false }, as("Owner"));
    const { ORDER_CANCEL_REASONS } = await import("@/lib/approval-rules");
    const reasonCode = ORDER_CANCEL_REASONS[0].code;
    const res = await svc.requestOrderVoidApproval(order.id, { reasonCode, note: "dobel input pesanan" }, as("Kasir"));
    expect(res.status).toBe("pending");
    expect(res.approvalId).toMatch(/^APP-VOID-/);
    const [still] = await rowsWhere(t.schema.orders, t.schema.orders.id, order.id);
    expect(still.status).not.toBe("voided");
  });
});
