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
// TEST INTEGRASI V4 — Bar/Dapur mengajukan batal (owner Nov 2026: WAJIB disetujui
// Owner/Manajer). Tidak ada yang berubah sebelum disetujui; setelah disetujui jalur
// resmi bekerja: stok kembali, porsi produksi batal, tiket SELESAI tidak dobel.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let outletId = "";
const KASIR = "user-itest-cx-kasir";
const BAR = "user-itest-cx-bar";
const MANAJER = "user-itest-cx-manajer";

function session(userId: string, role: Role, name: string, workstation: string | null = null): GarageSession {
  return {
    user: { id: userId, name, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "CX-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => session(KASIR, "Kasir" as Role, "Kasir CX");
const bar = () => session(BAR, "Kasir" as Role, "Barista CX", "bar");
const manajer = () => session(MANAJER, "Manajer" as Role, "Manajer CX");

const reason = { reasonCode: "salah_input", note: "kasir salah tekan" };

async function q() {
  return import("drizzle-orm");
}
async function itemsOf(orderId: string) {
  const { eq } = await q();
  return t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, orderId));
}
async function orderById(id: string) {
  const { eq } = await q();
  const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, id));
  return row;
}
async function ticketsOf(orderId: string) {
  const { eq } = await q();
  return t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId));
}
async function portionsOf(orderId: string) {
  const { eq } = await q();
  return t.getDb().select().from(t.schema.productionTicketItems).where(eq(t.schema.productionTicketItems.orderId, orderId));
}
async function beanNet() {
  const { eq } = await q();
  const rows = await t.getDb().select().from(t.schema.stockMovements).where(eq(t.schema.stockMovements.itemSku, "BEAN"));
  return rows
    .filter((r: any) => ["recipe_deduct", "refund_reverse", "void_reverse"].includes(r.type))
    .reduce((sum: number, r: any) => sum + Number(r.qty), 0);
}

/** Bill meja (QR/waiter) BELUM lunas, sudah diterima kasir → tiket Bar & Dapur. */
async function tableBill(table: string, items = [
  { itemId: "itm-coffee", variantId: "reg", qty: 2 },
  { itemId: "itm-food", variantId: "reg", qty: 1 },
]) {
  const created = await svc.createCustomerOrder({
    orderType: "dine-in",
    tableLabel: table,
    customerMode: "guest",
    guestName: "Tamu CX",
    paymentMethod: "Cash",
    items,
  });
  const order = created.order ?? created;
  await svc.updateCustomerOrderStatus(order.id, { action: "accept" }, kasir());
  return orderById(order.id);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: BAR, name: "Barista CX", email: `${BAR}@garage.id` },
    { id: MANAJER, name: "Manajer CX", email: `${MANAJER}@garage.id` },
  ]);
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
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Batal ITEM bill belum lunas dari Bar (APP-PCX)", () => {
  it("pengajuan Bar tidak mengubah apa pun; papan menandai 'menunggu batal'", async () => {
    const order = await tableBill("11");
    const before = await beanNet();
    const coffee = (await itemsOf(order.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const res = await svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: coffee.id, qty: 1 }] }, bar());
    expect(res.status).toBe("pending");
    expect(res.approvalId).toMatch(/^APP-PCX-/);
    // A8: pemohon disimpan sebagai ID user (nama hanya untuk tampilan).
    const { eq } = await import("drizzle-orm");
    const [pcx] = await t.getDb().select().from(t.schema.approvals).where(eq(t.schema.approvals.id, res.approvalId));
    expect((pcx.payload as any).requestedBy).toBe(BAR);
    expect((pcx.payload as any).requestedByName).toBe("Barista CX / Kasir");
    expect((await itemsOf(order.id)).find((i: any) => i.id === coffee.id).qty).toBe(2);
    expect(await beanNet()).toBe(before);
    const board = await prod.getProductionBoard(bar());
    const mine = board.tickets.filter((tk: any) => tk.orderId === order.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((tk: any) => tk.pendingCancel?.approvalId === res.approvalId)).toBe(true);

    // Disetujui Manajer → 1 kopi pindah ke bill pisahan yang di-void: stok kopi kembali 18 g,
    // porsi produksi kopi tinggal 1, bill induk tetap belum lunas.
    await svc.decideApproval(res.approvalId, { status: "approved", reasonDecided: "ok" }, manajer());
    expect((await itemsOf(order.id)).find((i: any) => i.id === coffee.id).qty).toBe(1);
    expect(await beanNet()).toBe(before + 18);
    const livePortions = (await portionsOf(order.id)).filter((p: any) => p.status !== "cancelled");
    expect(livePortions.filter((p: any) => p.menuItemId === "itm-coffee").reduce((s: number, p: any) => s + p.qty, 0)).toBe(1);
    expect((await orderById(order.id)).status).not.toBe("voided");
    const after = await prod.getProductionBoard(bar());
    expect(after.tickets.filter((tk: any) => tk.orderId === order.id).every((tk: any) => !tk.pendingCancel)).toBe(true);

    const audits = await t.getDb().select().from(t.schema.auditLogs);
    expect(audits.some((a: any) => a.action === "Pengajuan batal item (belum bayar)" && a.object === order.orderNo)).toBe(true);
  });

  it("ditolak Manajer → order & stok tidak berubah", async () => {
    const order = await tableBill("12");
    const before = await beanNet();
    const coffee = (await itemsOf(order.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const res = await svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: coffee.id, qty: 2 }] }, bar());
    await svc.decideApproval(res.approvalId, { status: "rejected", reasonDecided: "tamu tetap mau" }, manajer());
    expect((await itemsOf(order.id)).find((i: any) => i.id === coffee.id).qty).toBe(2);
    expect(await beanNet()).toBe(before);
    // Pengaju (Bar) diberi tahu hasilnya — notifikasi pribadi, bukan ke semua staf.
    const { eq } = await import("drizzle-orm");
    const notes = await t
      .getDb()
      .select()
      .from(t.schema.staffNotifications)
      .where(eq(t.schema.staffNotifications.dedupKey, `cancel-decided:${res.approvalId}`));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ audience: "user", userId: BAR, kind: "production_cancel_decided" });
    expect(notes[0].title).toMatch(/ditolak/);
    expect(notes[0].body).toMatch(/tamu tetap mau/);
  });

  it("validasi: alasan wajib, qty tidak melebihi, semua item → harus batal seluruh order, satu pengajuan aktif", async () => {
    const order = await tableBill("13");
    const rows = await itemsOf(order.id);
    const c = rows.find((i: any) => i.menuItemId === "itm-coffee");
    const f = rows.find((i: any) => i.menuItemId === "itm-food");
    await expect(
      svc.requestUnpaidItemCancelApproval(order.id, { reasonCode: "lainnya", note: "", items: [{ orderItemId: c.id, qty: 1 }] }, bar()),
    ).rejects.toThrow();
    await expect(
      svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: c.id, qty: 3 }] }, bar()),
    ).rejects.toThrow(/melebihi/);
    await expect(
      svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: c.id, qty: 2 }, { orderItemId: f.id, qty: 1 }] }, bar()),
    ).rejects.toThrow(/seluruh order/);
    await svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: f.id, qty: 1 }] }, bar());
    await expect(
      svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: c.id, qty: 1 }] }, bar()),
    ).rejects.toThrow(/menunggu persetujuan/);
    await expect(svc.requestOrderVoidApproval(order.id, reason, bar())).rejects.toThrow(/menunggu persetujuan/);
  });

  it("batal item yang belum dibuat membuat sisa order selesai → tiket SELESAI antre sekali", async () => {
    const order = await tableBill("14");
    const barTicket = (await ticketsOf(order.id)).find((tk: any) => tk.station === "Bar");
    await prod.productionTicketAction(barTicket.ticketNo, "start", kasir());
    await prod.productionTicketAction(barTicket.ticketNo, "ready", kasir(), { qcConfirmed: true });
    const food = (await itemsOf(order.id)).find((i: any) => i.menuItemId === "itm-food");
    const res = await svc.requestUnpaidItemCancelApproval(order.id, { ...reason, items: [{ orderItemId: food.id, qty: 1 }] }, bar());
    await svc.decideApproval(res.approvalId, { status: "approved", reasonDecided: "ok" }, manajer());
    const { and, eq } = await q();
    const jobs = await t
      .getDb()
      .select()
      .from(t.schema.printJobs)
      .where(and(eq(t.schema.printJobs.orderId, order.id), eq(t.schema.printJobs.jobType, "order_completion")));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload.items.every((i: any) => i.station === "Bar")).toBe(true);
  });
});

describe("Batal SELURUH order dari Bar (APP-VOID, jalur kasir yang sama)", () => {
  it("Bar mengajukan → menunggu; Manajer setuju → order void, tiket batal, stok kembali", async () => {
    const order = await tableBill("15");
    const before = await beanNet();
    const res = await svc.requestOrderVoidApproval(order.id, reason, bar());
    expect(res.status).toBe("pending");
    expect((await orderById(order.id)).status).not.toBe("voided");
    await svc.decideApproval(res.approvalId, { status: "approved", reasonDecided: "ok" }, manajer());
    expect((await orderById(order.id)).status).toBe("voided");
    expect((await ticketsOf(order.id)).every((tk: any) => tk.status === "cancelled")).toBe(true);
    expect(await beanNet()).toBe(before + 36);
  });
});

describe("Batal ITEM order lunas dari Bar (APP-RFD, refund resmi)", () => {
  it("order lunas tidak boleh lewat jalur belum-bayar; refund item lewat pengajuan + persetujuan", async () => {
    const paid = await svc.createOrder(
      {
        orderType: "dine-in",
        tableNumber: "16",
        guestName: "Lunas CX",
        paymentMethod: "Cash",
        cashReceived: 500_000,
        items: [
          { itemId: "itm-coffee", variantId: "reg", qty: 2 },
          { itemId: "itm-food", variantId: "reg", qty: 1 },
        ],
      },
      kasir(),
    );
    const orderId = (await t.getDb().select().from(t.schema.orders)).find((o: any) => o.orderNo === paid.orderNo).id;
    const coffee = (await itemsOf(orderId)).find((i: any) => i.menuItemId === "itm-coffee");
    await expect(
      svc.requestUnpaidItemCancelApproval(orderId, { ...reason, items: [{ orderItemId: coffee.id, qty: 1 }] }, bar()),
    ).rejects.toThrow(/lunas/);
    const res = await svc.requestOrderRefundApproval(orderId, { ...reason, items: [{ orderItemId: coffee.id, qty: 1 }] }, bar());
    expect(res.status).toBe("pending");
    await svc.decideApproval(res.approvalId, { status: "approved", reasonDecided: "ok" }, manajer());
    expect((await itemsOf(orderId)).find((i: any) => i.id === coffee.id).qty).toBe(1);
  });
});
