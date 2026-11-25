import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// POS Fase 4 — mode jual offline (owner 25 Nov 2026): tunai masuk laci shift saat jual (tidak pernah pindah
// shift), QRIS statis = tagihan yang wajib dicek mutasi, tiket produksi tidak dibuat dua kali.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const USER = "user-itest-pos-offline";

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

async function openSession() {
  const { eq } = await import("drizzle-orm");
  const [session] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"));
  return session as { id: string; expectedCash: number };
}

const soldAt = () => new Date(Date.now() - 5 * 60_000).toISOString();

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: USER })).outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("tunai offline", () => {
  it("masuk laci shift saat jual, tercatat offline, tiket produksi langsung ditutup, kunci sama tidak dobel", async () => {
    const session = await openSession();
    const before = session.expectedCash;
    const body = {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 50_000,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
      offline: { offlineNo: "OFF-KASIR1-0001", soldAt: soldAt(), cashSessionId: session.id },
    };
    const created = await svc.createOrder(body, as("Kasir"), { requestKey: `${USER}:off-0001`, offlineSync: true });
    expect(created.total).toBe(40_000);
    expect((await openSession()).expectedCash).toBe(before + 40_000);

    const [payment] = await rowsWhere(t.schema.payments, t.schema.payments.orderId, created.orderId);
    expect(payment.status).toBe("captured");
    expect(payment.cashSessionId).toBe(session.id);
    expect(payment.metadata).toMatchObject({ offlineSale: true, offlineNo: "OFF-KASIR1-0001", offlineDevice: "Kasir-1" });

    const tickets = await rowsWhere(t.schema.kitchenTickets, t.schema.kitchenTickets.orderId, created.orderId);
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((ticket: any) => ticket.status === "delivered" && ticket.chitPrintedAt)).toBe(true);

    const audits = await rowsWhere(t.schema.auditLogs, t.schema.auditLogs.object, "Take away");
    expect(audits.some((row: any) => (row.metadata as any)?.actionType === "offline_sale")).toBe(true);

    const replay = await svc.createOrder(body, as("Kasir"), { requestKey: `${USER}:off-0001`, offlineSync: true });
    expect(replay.orderId).toBe(created.orderId);
    expect((await openSession()).expectedCash).toBe(before + 40_000);
  });

  it("shift saat jual berbeda/tutup → ditolak permanen, laci tidak berubah", async () => {
    const before = (await openSession()).expectedCash;
    await expect(
      svc.createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          cashReceived: 20_000,
          items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
          offline: { offlineNo: "OFF-KASIR1-0002", soldAt: soldAt(), cashSessionId: "00000000-0000-4000-8000-000000000000" },
        },
        as("Kasir"),
        { requestKey: `${USER}:off-0002`, offlineSync: true },
      ),
    ).rejects.toMatchObject({ code: "OFFLINE_SHIFT_CLOSED" });
    expect((await openSession()).expectedCash).toBe(before);
  });
});

describe("QRIS statis offline", () => {
  it("jadi tagihan cek mutasi (tidak lunas otomatis), tiket ditutup, Manajer lunasi dengan referensi tanpa menyentuh laci", async () => {
    const before = (await openSession()).expectedCash;
    const created = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "QRIS offline OFF-KASIR1-0003",
      source: "qr_takeaway",
      staffOrder: true,
      allowHiddenItems: true,
      skipCashierNotify: true,
      paymentMethod: "QRIS",
      offline: { offlineNo: "OFF-KASIR1-0003", soldAt: soldAt(), cashSessionId: null },
      items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
      clientRequestKey: `${USER}:off-0003`,
    });
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, as("Kasir"), { openBill: true });
    await svc.closeOfflineProductionTicketsForOrder(created.order.id, "Kasir Test");

    const [order] = await rowsWhere(t.schema.orders, t.schema.orders.id, created.order.id);
    expect(order.status).not.toBe("paid");
    const [payment] = await rowsWhere(t.schema.payments, t.schema.payments.orderId, created.order.id);
    expect(payment.status).toBe("pending");
    expect(payment.method).toBe("QRIS");
    expect(payment.metadata).toMatchObject({ offlineNo: "OFF-KASIR1-0003", qrisVerification: "needs_mutation_check" });
    expect((payment.metadata as any).staffOrder).toBeUndefined();

    const tickets = await rowsWhere(t.schema.kitchenTickets, t.schema.kitchenTickets.orderId, created.order.id);
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((ticket: any) => ticket.status === "delivered")).toBe(true);

    await svc.confirmOrderPayment(
      created.order.id,
      { paymentMethod: "QRIS", paymentReference: "MUTASI-QRIS-OFF-0003", reason: "Mutasi QRIS sudah masuk" },
      as("Manajer"),
    );
    const [paid] = await rowsWhere(t.schema.orders, t.schema.orders.id, created.order.id);
    expect(paid.status).toBe("paid");
    const [capturedPayment] = await rowsWhere(t.schema.payments, t.schema.payments.orderId, created.order.id);
    expect(capturedPayment.status).toBe("captured");
    expect((capturedPayment.metadata as any).reference).toBe("MUTASI-QRIS-OFF-0003");
    expect((await openSession()).expectedCash).toBe(before);
  });
});
