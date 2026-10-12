import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// PERSETUJUAN BATAL / REFUND ORDER — kasir mengajukan, Manajer memutus (PIN di
// POS atau langsung). Cek: total order, pembayaran, kas seharusnya, stok bahan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const KASIR = "user-itest-kasir";
const MANAJER = "user-itest-manajer";
const MANAJER_PIN = "4321";

function session(userId: string, role: Role, name: string): GarageSession {
  return {
    user: { id: userId, name, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => session(KASIR, "Kasir" as Role, "Kasir Test");
const manajer = () => session(MANAJER, "Manajer" as Role, "Manajer Test");

async function q() {
  return import("drizzle-orm");
}

async function expectedCash() {
  const { eq } = await q();
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.cashSessions)
    .where(eq(t.schema.cashSessions.code, "CS-ITEST"));
  return row.expectedCash as number;
}

async function globalOnHand(sku: string) {
  const { eq } = await q();
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.inventoryItems)
    .where(eq(t.schema.inventoryItems.sku, sku));
  return Number(row.onHand);
}

async function orderByNo(orderNo: string) {
  const { eq } = await q();
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.orders)
    .where(eq(t.schema.orders.orderNo, orderNo));
  return row;
}

async function paymentsOf(orderId: string) {
  const { eq } = await q();
  return t.getDb().select().from(t.schema.payments).where(eq(t.schema.payments.orderId, orderId));
}

async function itemsOf(orderId: string) {
  const { eq } = await q();
  return t
    .getDb()
    .select()
    .from(t.schema.orderItems)
    .where(eq(t.schema.orderItems.orderId, orderId));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;

  const { hashPin } = await import("@/lib/attendance");
  await t.getDb().insert(t.schema.user).values({
    id: MANAJER,
    name: "Manajer Test",
    email: `${MANAJER}@garage.id`,
  });
  await t.getDb().insert(t.schema.staffProfiles).values({
    userId: MANAJER,
    outletId,
    role: "Manajer",
    pinHash: hashPin(MANAJER_PIN),
  });

  await t.getDb().insert(t.schema.inventoryItems).values({
    sku: "BEAN",
    name: "Coffee Beans",
    alternativeName: "-",
    category: "Bar",
    usageArea: "bar",
    unit: "gram",
    packageSize: "1000 gram",
    onHand: 1000,
    min: 100,
    status: "safe",
    movement: "stabil",
  });
  await t.getDb().insert(t.schema.menuRecipes).values({
    menuItemId: "itm-coffee",
    variantId: "all",
    inventorySku: "BEAN",
    qty: 18,
    unit: "gram",
    wastePct: 0,
    status: "active",
  });

  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Refund item & batal order lewat Persetujuan", () => {
  let orderNo = "";
  let orderId = "";
  let cashAfterSale = 0;

  it("jual 3 kopi + 1 nasi tunai", async () => {
    const result = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 200_000,
        items: [
          { itemId: "itm-coffee", variantId: "reg", qty: 3 },
          { itemId: "itm-food", variantId: "reg", qty: 1 },
        ],
      },
      kasir(),
    );
    orderNo = result.orderNo ?? result.order?.orderNo ?? result.receipt?.orderNo;
    expect(orderNo).toBeTruthy();
    const order = await orderByNo(orderNo);
    orderId = order.id;
    expect(order.subtotal).toBe(90_000);
    cashAfterSale = await expectedCash();
    expect(await globalOnHand("BEAN")).toBe(1000 - 54);
  });

  it("kasir ajukan refund 1 kopi → menunggu, order belum berubah", async () => {
    const [coffee] = (await itemsOf(orderId)).filter((i: any) => i.menuItemId === "itm-coffee");
    const req = await svc.requestOrderRefundApproval(
      orderNo,
      { reasonCode: "komplain_kualitas", note: "terlalu pahit", items: [{ orderItemId: coffee.id, qty: 1 }] },
      kasir(),
    );
    expect(req.status).toBe("pending");
    expect(req.approvalId).toMatch(/^APP-RFD-/);
    expect((await orderByNo(orderNo)).subtotal).toBe(90_000);

    // Selama refund menunggu, pengajuan lain (refund/batal) untuk order ini ditolak.
    await expect(
      svc.requestOrderRefundApproval(
        orderNo,
        { reasonCode: "salah_input", items: [{ orderItemId: coffee.id, qty: 1 }] },
        kasir(),
      ),
    ).rejects.toThrow(/menunggu persetujuan/i);
    await expect(
      svc.requestOrderVoidApproval(orderNo, { reasonCode: "salah_input" }, kasir()),
    ).rejects.toThrow(/refund yang menunggu/i);

    // Dialog POS yang dibuka ulang menampilkan nominal refund, bukan total order.
    const refundable = await svc.getRefundableOrder(orderNo, kasir());
    expect(refundable.pendingApprovalId).toBe(req.approvalId);
    expect(refundable.pendingAmount).toBe(req.refundAmount);
    expect(refundable.pendingAmount).toBeLessThan(refundable.total);

    (globalThis as any).__refundApprovalId = req.approvalId;
    (globalThis as any).__refundAmount = req.refundAmount;
  });

  it("PIN salah ditolak & tidak mengubah apa pun", async () => {
    const id = (globalThis as any).__refundApprovalId;
    await expect(
      svc.decideApprovalWithPin(id, { pin: "0000", status: "approved" }, kasir()),
    ).rejects.toThrow(/PIN salah/i);
    const approval = await svc.getApprovalById(id);
    expect(approval.status).toBe("pending");
  });

  it("PIN Manajer menyetujui refund → total, pembayaran, kas & stok disesuaikan", async () => {
    const id = (globalThis as any).__refundApprovalId;
    const refundAmount = (globalThis as any).__refundAmount as number;
    const before = await orderByNo(orderNo);

    const approval = await svc.decideApprovalWithPin(
      id,
      { pin: MANAJER_PIN, status: "approved" },
      kasir(),
    );
    expect(approval.status).toBe("approved");
    expect(approval.decidedBy).toBe(MANAJER);
    expect(approval.decidedVia).toBe("pin");

    const after = await orderByNo(orderNo);
    expect(after.status).toBe("paid");
    expect(after.subtotal).toBe(70_000);
    expect(before.total - after.total).toBe(refundAmount);

    const coffee = (await itemsOf(orderId)).find((i: any) => i.menuItemId === "itm-coffee");
    expect(coffee.qty).toBe(2);

    const paid = (await paymentsOf(orderId)).reduce((s: number, p: any) => s + p.amount, 0);
    expect(paid).toBe(after.total);
    expect(await expectedCash()).toBe(cashAfterSale - refundAmount);
    expect(await globalOnHand("BEAN")).toBe(1000 - 36);

    // Bar berhenti membuat kopi yang direfund: porsi produksi tinggal 2.
    const { eq } = await import("drizzle-orm");
    const prodItems = await t
      .getDb()
      .select()
      .from(t.schema.productionTicketItems)
      .where(eq(t.schema.productionTicketItems.orderId, orderId));
    if (prodItems.length) {
      const liveCoffee = prodItems
        .filter((i: any) => i.menuItemId === "itm-coffee" && i.status !== "cancelled")
        .reduce((sum: number, i: any) => sum + i.qty, 0);
      expect(liveCoffee).toBe(2);
    }

    // Tidak bisa diputus dua kali.
    await expect(
      svc.decideApproval(id, { status: "approved" }, manajer()),
    ).rejects.toThrow(/sudah diputuskan/i);
  });

  it("Manajer batalkan sisa order langsung → voided, kas & stok kembali penuh", async () => {
    const before = await orderByNo(orderNo);
    const cashBefore = await expectedCash();

    const res = await svc.requestOrderVoidApproval(
      orderNo,
      { reasonCode: "pelanggan_batal" },
      manajer(),
    );
    expect(res.status).toBe("approved");

    const after = await orderByNo(orderNo);
    expect(after.status).toBe("voided");
    const pays = await paymentsOf(orderId);
    expect(pays.every((p: any) => p.status === "voided")).toBe(true);
    expect(await expectedCash()).toBe(cashBefore - before.total);
    // Stok global kembali penuh tanpa dobel (refund 18 g sudah dihitung).
    expect(await globalOnHand("BEAN")).toBe(1000);

    const approval = await svc.getApprovalById(`APP-VOID-${orderId}`);
    expect(approval.status).toBe("approved");
    expect(approval.decidedVia).toBe("langsung");
  });

  it("alasan 'lainnya' tanpa catatan ditolak", async () => {
    await expect(
      svc.requestOrderVoidApproval(orderNo, { reasonCode: "lainnya", note: "" }, kasir()),
    ).rejects.toThrow(/catatan/i);
  });
});

describe("Pengaman tambahan", () => {
  it("order dari tanggal yang sudah tutup buku tidak bisa dibatalkan/direfund", async () => {
    const { eq } = await q();
    const sale = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 50_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
      },
      kasir(),
    );
    const no = sale.orderNo ?? sale.order?.orderNo ?? sale.receipt?.orderNo;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(twoDaysAgo);
    await t.getDb().update(t.schema.orders).set({ createdAt: twoDaysAgo }).where(eq(t.schema.orders.orderNo, no));
    const { financeDailyClosings } = await import("@/db/schema-finance");
    await t.getDb().insert(financeDailyClosings).values({ date: dateKey, status: "closed" });

    await expect(svc.requestOrderVoidApproval(no, { reasonCode: "salah_input" }, manajer())).rejects.toThrow(
      /sudah di-closing/,
    );
    const [coffee] = await itemsOf((await orderByNo(no)).id);
    await expect(
      svc.requestOrderRefundApproval(
        no,
        { reasonCode: "salah_input", items: [{ orderItemId: coffee.id, qty: 1 }] },
        manajer(),
      ),
    ).rejects.toThrow(/sudah di-closing/);
    await expect(svc.voidOrder(no, "tes", manajer())).rejects.toThrow(/sudah di-closing/);
    expect((await orderByNo(no)).status).toBe("paid");
  });

  it("pengajuan batal ulang setelah ditolak tidak menimpa riwayat penolakan", async () => {
    const sale = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 50_000,
        items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
      },
      kasir(),
    );
    const no = sale.orderNo ?? sale.order?.orderNo ?? sale.receipt?.orderNo;
    const first = await svc.requestOrderVoidApproval(no, { reasonCode: "salah_input" }, kasir());
    await svc.decideApproval(first.approvalId, { status: "rejected", reasonDecided: "Order benar" }, manajer());

    const second = await svc.requestOrderVoidApproval(no, { reasonCode: "pelanggan_batal" }, kasir());
    expect(second.approvalId).not.toBe(first.approvalId);
    expect((await svc.getApprovalById(first.approvalId)).status).toBe("rejected");
    expect((await svc.getApprovalById(second.approvalId)).status).toBe("pending");
    expect((await svc.getRefundableOrder(no, kasir())).pendingApprovalId).toBe(second.approvalId);

    // Dobel pengajuan saat masih menunggu tetap ditolak.
    await expect(svc.requestOrderVoidApproval(no, { reasonCode: "salah_input" }, kasir())).rejects.toThrow(
      /masih menunggu/,
    );
    await svc.decideApproval(second.approvalId, { status: "approved" }, manajer());
    expect((await orderByNo(no)).status).toBe("voided");
  });

  it("server menolak order tunai yang uangnya kurang (kecuali sinkron offline, dicatat)", async () => {
    const cart = {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 10_000,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    };
    await expect(svc.createOrder(cart, kasir())).rejects.toThrow(/kurang dari total/);

    const synced = await svc.createOrder(cart, kasir(), { offlineSync: true });
    const pays = await paymentsOf(synced.orderId);
    expect(pays[0].metadata.cashShortfall).toBe(synced.total - 10_000);
  });

  it("tebak PIN: 5x salah mengunci akun kasir, PIN benar pun ditolak selama terkunci", async () => {
    const id = "APP-VOID-tidak-ada";
    for (let i = 0; i < 5; i += 1) {
      await expect(
        svc.decideApprovalWithPin(id, { pin: "0000", status: "approved" }, kasir()),
      ).rejects.toThrow(/PIN salah/);
    }
    await expect(
      svc.decideApprovalWithPin(id, { pin: MANAJER_PIN, status: "approved" }, kasir()),
    ).rejects.toThrow(/Terlalu banyak percobaan/);
  });
});
