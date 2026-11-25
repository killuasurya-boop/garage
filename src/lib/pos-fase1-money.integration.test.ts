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
// POS Fase 1 (audit 24 Nov 2026, docs/pos-v6/AUDIT-BUG-KONSEP-2026-11-24.md):
// bug uang & stabilitas sisi server — S2 bayar ulang split tender, S3 tunai kurang,
// S4 kunci anti-dobel + isi berbeda, S5 Bayar nanti anti-dobel di DB, S6 hapus invoice,
// S7 potong stok relatif.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const USER = "user-itest-pos-fase1";

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

async function expectedCash() {
  const { eq } = await import("drizzle-orm");
  const [session] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"));
  return session.expectedCash as number;
}

async function openBill(name: string, key?: string) {
  const created = await svc.createCustomerOrder({
    orderType: "takeaway",
    outletId,
    customerMode: "guest",
    guestName: name,
    source: "qr_takeaway",
    staffOrder: true,
    paymentMethod: "Cash",
    items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
    ...(key ? { clientRequestKey: key } : {}),
  });
  if (created.order.status === "pending_cashier" || created.order.status === "awaiting_payment") {
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, as("Kasir"), { openBill: true });
  }
  const [order] = await rowsWhere(t.schema.orders, t.schema.orders.id, created.order.id);
  return order;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: USER })).outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("S3 Final Bayar tunai", () => {
  it("uang diterima kurang dari tagihan ditolak, laci tidak berubah", async () => {
    const order = await openBill("Sari");
    const before = await expectedCash();
    await expect(
      svc.updateCustomerOrderStatus(order.id, { action: "paid", paymentMethod: "Cash", cashReceived: 10_000 }, as("Kasir")),
    ).rejects.toThrow(/kurang dari total/);
    expect(await expectedCash()).toBe(before);
    const [still] = await rowsWhere(t.schema.orders, t.schema.orders.id, order.id);
    expect(still.status).not.toBe("paid");
    // Nominal cukup → lunas, laci + total.
    await svc.updateCustomerOrderStatus(order.id, { action: "paid", paymentMethod: "Cash", cashReceived: 50_000 }, as("Kasir"));
    expect(await expectedCash()).toBe(before + order.total);
  });
});

describe("S2 bayar ulang setelah batalkan pelunasan (split tender)", () => {
  it("semua baris pending ikut lunas & laci menerima seluruh tagihan tunai", async () => {
    const created = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        splits: [
          { method: "Cash", amount: 30_000 },
          { method: "QRIS", amount: 20_000, reference: "QRIS-S2-REF-001" },
        ],
        items: [
          { itemId: "itm-food", variantId: "reg", qty: 1 },
          { itemId: "itm-coffee", variantId: "reg", qty: 1 },
        ],
      },
      as("Kasir"),
    );
    expect(created.total).toBe(50_000);
    const base = await expectedCash();
    await svc.revertOrderPayment(created.orderId, "Salah tekan lunas", as("Manajer"));
    expect(await expectedCash()).toBe(base - 30_000);
    let pays = await rowsWhere(t.schema.payments, t.schema.payments.orderId, created.orderId);
    expect(pays.filter((p: any) => p.status === "pending")).toHaveLength(2);

    await expect(
      svc.confirmOrderPayment(created.orderId, { paymentMethod: "Cash", cashReceived: 30_000, reason: "bayar ulang" }, as("Manajer")),
    ).rejects.toThrow(/kurang dari total/);

    await svc.confirmOrderPayment(created.orderId, { paymentMethod: "Cash", cashReceived: 50_000, reason: "bayar ulang tunai" }, as("Manajer"));
    pays = await rowsWhere(t.schema.payments, t.schema.payments.orderId, created.orderId);
    expect(pays.every((p: any) => p.status === "captured")).toBe(true);
    expect(pays.reduce((sum: number, p: any) => sum + p.amount, 0)).toBe(50_000);
    expect(pays.every((p: any) => p.method === "Cash")).toBe(true);
    // Laci: sebelum revert base; revert −30rb; bayar ulang tunai +50rb.
    expect(await expectedCash()).toBe(base - 30_000 + 50_000);
  });
});

describe("S4 kunci anti-dobel POS", () => {
  const body = (qty: number, method = "QRIS") => ({
    orderType: "takeaway",
    paymentMethod: method,
    items: [{ itemId: "itm-coffee", variantId: "reg", qty }],
  });

  it("isi sama = order yang sama; isi berbeda dengan kunci sama ditolak", async () => {
    const first = await svc.createOrder(body(1), as("Kasir"), { requestKey: `${USER}:key-s4-0001` });
    const replay = await svc.createOrder(body(1), as("Kasir"), { requestKey: `${USER}:key-s4-0001` });
    expect(replay.orderId).toBe(first.orderId);
    expect(replay.replayed).toBe(true);
    await expect(svc.createOrder(body(2), as("Kasir"), { requestKey: `${USER}:key-s4-0001` })).rejects.toMatchObject({
      code: "IDEMPOTENCY_MISMATCH",
    });
    await expect(
      svc.createOrder(body(1, "Bank Transfer"), as("Kasir"), { requestKey: `${USER}:key-s4-0001` }),
    ).rejects.toThrow(/isi berbeda/);
  });

  it("sidik isi tidak bergantung urutan item & nominal uang diterima", () => {
    const a = svc.posOrderFingerprint({
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 50_000,
      items: [
        { itemId: "a", variantId: "x", qty: 1 },
        { itemId: "b", variantId: "y", qty: 2 },
      ],
    });
    const b = svc.posOrderFingerprint({
      orderType: "takeaway",
      paymentMethod: "cash",
      cashReceived: 100_000,
      items: [
        { itemId: "b", variantId: "y", qty: 2 },
        { itemId: "a", variantId: "x", qty: 1 },
      ],
    });
    expect(a).toBe(b);
  });
});

describe("S5 Bayar nanti anti-dobel tersimpan di DB", () => {
  it("kunci sama (memori kosong, mis. restart) tidak membuat bill kedua", async () => {
    const first = await openBill("Rudi", `${USER}:open-bill-key-1`);
    const again = await openBill("Rudi", `${USER}:open-bill-key-1`);
    expect(again.id).toBe(first.id);
    await expect(
      svc.createCustomerOrder({
        orderType: "takeaway",
        outletId,
        customerMode: "guest",
        guestName: "Rudi",
        source: "qr_takeaway",
        staffOrder: true,
        paymentMethod: "Cash",
        items: [{ itemId: "itm-food", variantId: "reg", qty: 3 }],
        clientRequestKey: `${USER}:open-bill-key-1`,
      }),
    ).rejects.toThrow(/pesanan berbeda/);
  });
});

describe("S6 hapus invoice", () => {
  it("invoice yang sudah ada pembayaran lunas tidak bisa dihapus lewat jalur hapus", async () => {
    const order = await openBill("Tono");
    await svc.updateCustomerOrderStatus(order.id, { action: "paid", paymentMethod: "QRIS" }, as("Kasir"));
    await expect(
      svc.deleteUnpaidInvoice(order.id, { reason: "salah input", confirmOrderNo: order.orderNo }, as("Owner")),
    ).rejects.toThrow(/LUNAS/);
    const unpaid = await openBill("Wati");
    await svc.deleteUnpaidInvoice(unpaid.id, { reason: "salah input", confirmOrderNo: unpaid.orderNo }, as("Owner"));
    const [voided] = await rowsWhere(t.schema.orders, t.schema.orders.id, unpaid.id);
    expect(voided.status).toBe("voided");
  });
});

describe("S7 potong stok penjualan", () => {
  it("dua penjualan memotong stok outlet secara berurutan (relatif), status ikut diperbarui", async () => {
    const { and, eq } = await import("drizzle-orm");
    await t.getDb().insert(t.schema.inventoryItems).values({
      sku: "S7-BEAN",
      name: "Biji kopi S7",
      alternativeName: "",
      category: "Bahan",
      unit: "gr",
      packageSize: "1kg",
      unitCost: 1,
      onHand: 100,
      min: 0,
      status: "safe",
      movement: "Test",
    });
    await t.getDb().insert(t.schema.menuRecipes).values({ menuItemId: "itm-coffee", variantId: "all", inventorySku: "S7-BEAN", qty: 10, unit: "gr", wastePct: 0 });
    const sale = () =>
      svc.createOrder({ orderType: "takeaway", paymentMethod: "QRIS", items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] }, as("Kasir"));
    await sale();
    const stockRow = async () => {
      const [row] = await t
        .getDb()
        .select()
        .from(t.schema.inventoryLocationStocks)
        .where(and(eq(t.schema.inventoryLocationStocks.itemSku, "S7-BEAN"), eq(t.schema.inventoryLocationStocks.locationType, "outlet")));
      return row;
    };
    const afterOne = (await stockRow()).onHand;
    await sale();
    const afterTwo = await stockRow();
    expect(afterTwo.onHand).toBeCloseTo(afterOne - 10, 4);
    expect(typeof afterTwo.status).toBe("string");
  });
});
