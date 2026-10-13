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
// PISAH BILL MEJA PER PRODUK — tamu dalam satu meja bayar item masing-masing.
// Cek: pembagian total, metode bayar per tamu, kas shift, tiket dapur tidak
// dobel, potong/kembali stok konsisten saat bill pisahan dibatalkan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const KASIR = "user-itest-kasir";
const MANAJER = "user-itest-manajer";

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

async function drizzle() {
  return import("drizzle-orm");
}

async function orderById(id: string) {
  const { eq } = await drizzle();
  const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, id));
  return row;
}

async function itemsOf(orderId: string) {
  const { eq } = await drizzle();
  return t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, orderId));
}

async function paymentsOf(orderId: string) {
  const { eq } = await drizzle();
  return t.getDb().select().from(t.schema.payments).where(eq(t.schema.payments.orderId, orderId));
}

async function ticketsOf(orderId: string) {
  const { eq } = await drizzle();
  return t
    .getDb()
    .select()
    .from(t.schema.kitchenTickets)
    .where(eq(t.schema.kitchenTickets.orderId, orderId));
}

async function expectedCash() {
  const { eq } = await drizzle();
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.cashSessions)
    .where(eq(t.schema.cashSessions.code, "CS-ITEST"));
  return row.expectedCash as number;
}

/** Saldo stok outlet BEAN dari buku movement (deduct negatif, pengembalian positif). */
async function beanLedgerNet() {
  const { eq } = await drizzle();
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.stockMovements)
    .where(eq(t.schema.stockMovements.itemSku, "BEAN"));
  return rows
    .filter((r: any) => ["recipe_deduct", "refund_reverse", "void_reverse"].includes(r.type))
    .reduce((sum: number, r: any) => sum + Number(r.qty), 0);
}

async function newTableOrder(tableLabel: string) {
  const created = await svc.createCustomerOrder({
    orderType: "dine-in",
    tableLabel,
    customerMode: "guest",
    guestName: "Rombongan",
    paymentMethod: "Cash",
    items: [
      { itemId: "itm-coffee", variantId: "reg", qty: 2 },
      { itemId: "itm-food", variantId: "reg", qty: 1 },
    ],
  });
  const order = created.order ?? created;
  return orderById(order.id);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;

  await t.getDb().insert(t.schema.user).values({
    id: MANAJER,
    name: "Manajer Test",
    email: `${MANAJER}@garage.id`,
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

describe("Pisah bill SESUDAH diterima dapur", () => {
  let parent: any;
  let child: any;
  let originalTotal = 0;

  it("order meja diterima → tiket dapur dibuat & stok terpotong", async () => {
    parent = await newTableOrder("Meja 07");
    originalTotal = parent.total;
    await svc.updateCustomerOrderStatus(parent.id, { action: "accept" }, kasir());
    expect((await ticketsOf(parent.id)).length).toBeGreaterThan(0);
    expect(await beanLedgerNet()).toBe(-36);
  });

  it("pisah 1 kopi untuk Budi → total terbagi proporsional, jumlahnya tetap", async () => {
    const coffee = (await itemsOf(parent.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const result = await svc.splitCustomerOrder(
      parent.id,
      { items: [{ orderItemId: coffee.id, qty: 1 }], guestName: "Budi" },
      kasir(),
    );
    child = await orderById(result.child.id);
    parent = await orderById(parent.id);

    expect(child.orderNo).toBe(`${parent.orderNo}-2`);
    expect(child.customerName).toBe("Budi");
    expect(child.tableLabel).toBe("Meja 07");
    expect(child.status).toBe(parent.status);
    expect(child.subtotal).toBe(20_000);
    expect(parent.subtotal).toBe(50_000);
    expect(parent.total + child.total).toBe(originalTotal);

    const parentCoffee = (await itemsOf(parent.id)).find((i: any) => i.menuItemId === "itm-coffee");
    expect(parentCoffee.qty).toBe(1);
    expect((await paymentsOf(parent.id))[0].amount).toBe(parent.total);
    expect((await paymentsOf(child.id))[0].amount).toBe(child.total);
  });

  it("Budi bayar QRIS → lunas, TANPA tiket dapur & potong stok baru, kas tunai tidak berubah", async () => {
    const cashBefore = await expectedCash();
    await svc.updateCustomerOrderStatus(child.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    child = await orderById(child.id);
    expect(child.status).toBe("paid");
    expect((await ticketsOf(child.id)).length).toBe(0);
    expect(await beanLedgerNet()).toBe(-36);
    expect(await expectedCash()).toBe(cashBefore);
    const [pay] = await paymentsOf(child.id);
    expect(pay.method).toBe("QRIS");
    expect(pay.status).toBe("captured");
  });

  it("sisa bill bayar tunai → kas shift bertambah sebesar bill sisa saja", async () => {
    const cashBefore = await expectedCash();
    await svc.updateCustomerOrderStatus(
      parent.id,
      { action: "paid", paymentMethod: "Cash", cashReceived: 100_000 },
      kasir(),
    );
    parent = await orderById(parent.id);
    expect(parent.status).toBe("paid");
    expect(await expectedCash()).toBe(cashBefore + parent.total);
  });

  it("batalkan bill Budi lalu bill induk → stok kembali pas, tidak dobel", async () => {
    await svc.requestOrderVoidApproval(child.orderNo, { reasonCode: "salah_input" }, manajer());
    expect(await beanLedgerNet()).toBe(-18);
    await svc.requestOrderVoidApproval(parent.orderNo, { reasonCode: "salah_input" }, manajer());
    expect(await beanLedgerNet()).toBe(0);
  });

  it("batal induk dulu tidak ikut mengembalikan stok milik bill pisahan yang masih hidup", async () => {
    const p = await newTableOrder("Meja 08");
    await svc.updateCustomerOrderStatus(p.id, { action: "accept" }, kasir());
    const before = await beanLedgerNet();
    const coffee = (await itemsOf(p.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const { child: c } = await svc.splitCustomerOrder(
      p.id,
      { items: [{ orderItemId: coffee.id, qty: 2 }] },
      kasir(),
    );
    await svc.requestOrderVoidApproval(p.orderNo, { reasonCode: "pelanggan_batal" }, manajer());
    // Kopi (36 g) pindah ke bill anak yang masih hidup → induk tidak mengembalikan apa-apa.
    expect(await beanLedgerNet()).toBe(before);
    await svc.requestOrderVoidApproval(c.orderNo, { reasonCode: "pelanggan_batal" }, manajer());
    expect(await beanLedgerNet()).toBe(before + 36);
  });
});

describe("Pisah bill vs layar Bar/Dapur", () => {
  async function liveProduction(orderId: string) {
    const { eq } = await drizzle();
    const tickets = await ticketsOf(orderId);
    const items = await t
      .getDb()
      .select()
      .from(t.schema.productionTicketItems)
      .where(eq(t.schema.productionTicketItems.orderId, orderId));
    return {
      tickets,
      liveQty: (menuItemId: string) =>
        items
          .filter((i: any) => i.menuItemId === menuItemId && i.status !== "cancelled")
          .reduce((sum: number, i: any) => sum + i.qty, 0),
    };
  }

  it("void bill induk hanya membatalkan porsinya; porsi bill pisahan tetap dibuat", async () => {
    const p = await newTableOrder("Meja 10");
    await svc.updateCustomerOrderStatus(p.id, { action: "accept" }, kasir());
    const coffee = (await itemsOf(p.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const { child: c } = await svc.splitCustomerOrder(p.id, { items: [{ orderItemId: coffee.id, qty: 1 }] }, kasir());

    await svc.requestOrderVoidApproval(p.orderNo, { reasonCode: "pelanggan_batal" }, manajer());
    let prod = await liveProduction(p.id);
    // 1 kopi milik bill pisahan tetap di Bar; kopi & makanan milik induk batal.
    expect(prod.liveQty("itm-coffee")).toBe(1);
    expect(prod.liveQty("itm-food")).toBe(0);
    expect(prod.tickets.some((ticket: any) => ticket.status !== "cancelled")).toBe(true);

    // Bill pisahan ikut dibatalkan → tidak ada lagi yang dibuat.
    await svc.requestOrderVoidApproval(c.orderNo, { reasonCode: "pelanggan_batal" }, manajer());
    prod = await liveProduction(p.id);
    expect(prod.liveQty("itm-coffee")).toBe(0);
    expect(prod.tickets.every((ticket: any) => ticket.status === "cancelled")).toBe(true);
  });
});

describe("Waste: menu yang sudah dibuat lalu dibatalkan", () => {
  it("porsi yang sedang/sudah dibuat tidak mengembalikan bahan; yang belum dibuat kembali", async () => {
    const { eq, and } = await drizzle();
    const p = await newTableOrder("Meja 11");
    await svc.updateCustomerOrderStatus(p.id, { action: "accept" }, kasir());
    const before = await beanLedgerNet();
    // Barista sudah mulai membuat kopi (2 porsi).
    await t
      .getDb()
      .update(t.schema.productionTicketItems)
      .set({ status: "processing" })
      .where(
        and(
          eq(t.schema.productionTicketItems.orderId, p.id),
          eq(t.schema.productionTicketItems.menuItemId, "itm-coffee"),
        ),
      );
    await svc.requestOrderVoidApproval(p.orderNo, { reasonCode: "pelanggan_batal" }, manajer());
    // 36 g kopi sudah terpakai → dicatat waste, tidak kembali ke stok.
    expect(await beanLedgerNet()).toBe(before);

    const q = await newTableOrder("Meja 12");
    await svc.updateCustomerOrderStatus(q.id, { action: "accept" }, kasir());
    const beforeQ = await beanLedgerNet();
    await svc.requestOrderVoidApproval(q.orderNo, { reasonCode: "pelanggan_batal" }, manajer());
    // Belum mulai dibuat → bahan kembali penuh.
    expect(await beanLedgerNet()).toBe(beforeQ + 36);
  });
});

describe("Pisah bill SEBELUM diterima dapur", () => {
  it("tiap bill diproses sendiri: tiket & potong stok masing-masing, total stok tetap 36 g", async () => {
    const before = await beanLedgerNet();
    const p = await newTableOrder("Meja 09");
    const coffee = (await itemsOf(p.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const { child } = await svc.splitCustomerOrder(
      p.id,
      { items: [{ orderItemId: coffee.id, qty: 1 }], guestName: "Sari" },
      kasir(),
    );
    await svc.updateCustomerOrderStatus(child.id, { action: "paid", paymentMethod: "Cash", cashReceived: 50_000 }, kasir());
    await svc.updateCustomerOrderStatus(p.id, { action: "paid", paymentMethod: "Transfer" }, kasir());

    expect((await ticketsOf(child.id)).length).toBeGreaterThan(0);
    expect((await ticketsOf(p.id)).length).toBeGreaterThan(0);
    expect(await beanLedgerNet()).toBe(before - 36);
  });
});

describe("Aturan pisah bill", () => {
  it("tidak boleh memindah semua item", async () => {
    const p = await newTableOrder("Meja 10");
    const items = await itemsOf(p.id);
    await expect(
      svc.splitCustomerOrder(
        p.id,
        { items: items.map((i: any) => ({ orderItemId: i.id, qty: i.qty })) },
        kasir(),
      ),
    ).rejects.toThrow(/sisakan minimal satu item/i);
  });

  it("bill yang sudah lunas tidak bisa dipisah", async () => {
    const p = await newTableOrder("Meja 11");
    await svc.updateCustomerOrderStatus(p.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    const [item] = await itemsOf(p.id);
    await expect(
      svc.splitCustomerOrder(p.id, { items: [{ orderItemId: item.id, qty: 1 }] }, kasir()),
    ).rejects.toThrow(/tidak bisa dipisah/i);
  });

  it("uang tunai yang sudah dipegang waiter memblokir pisah bill", async () => {
    const p = await newTableOrder("Meja 12");
    const { eq } = await drizzle();
    const [pay] = await paymentsOf(p.id);
    await t
      .getDb()
      .update(t.schema.payments)
      .set({ metadata: { ...pay.metadata, cashFlowStatus: "held_by_waiter" } })
      .where(eq(t.schema.payments.id, pay.id));
    const [item] = await itemsOf(p.id);
    await expect(
      svc.splitCustomerOrder(p.id, { items: [{ orderItemId: item.id, qty: 1 }] }, kasir()),
    ).rejects.toThrow(/dipegang waiter/i);
  });

  it("pisahan kedua dari meja yang sama bernomor -3", async () => {
    const p = await newTableOrder("Meja 13");
    const coffee = (await itemsOf(p.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const first = await svc.splitCustomerOrder(p.id, { items: [{ orderItemId: coffee.id, qty: 1 }] }, kasir());
    const coffeeLeft = (await itemsOf(p.id)).find((i: any) => i.menuItemId === "itm-coffee");
    const second = await svc.splitCustomerOrder(p.id, { items: [{ orderItemId: coffeeLeft.id, qty: 1 }] }, kasir());
    expect(first.child.orderNo).toBe(`${p.orderNo}-2`);
    expect(second.child.orderNo).toBe(`${p.orderNo}-3`);
  });
});
