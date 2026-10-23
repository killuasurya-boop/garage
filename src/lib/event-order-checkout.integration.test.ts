import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

let t: GarageTestDb;
let outletId = "";
let eventId = "";
let entryId = "";
let bundleId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  // Unlike the legacy harness, never hide a failure in the new migration.
  for (const statement of readFileSync("drizzle/0145_event_menu_commerce.sql", "utf8").split("--> statement-breakpoint").filter(s => s.trim())) {
    await t.getPgPool().exec(statement);
  }
  ({ outletId } = await seedGarageBasics(t));
  const [event] = await t.getDb().insert(t.schema.events).values({
    slug: "checkout-food-event", title: "Menu Kopi Event", status: "published", outletId,
    startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000),
    venueName: "Garage", address: "Jalan Garage Coffee", mapsUrl: "https://maps.google.com/",
    contactWhatsapp: "6281234567890",
  }).returning();
  eventId = event.id;
  const [entry] = await t.getDb().insert(t.schema.eventMenuEntries).values({
    eventId, kind: "item", name: "Kopi Khusus Event", menuItemId: "itm-coffee", variantId: "reg",
    price: 15_000, status: "active", quota: null,
    startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000),
  }).returning();
  entryId = entry.id;
  const [bundle] = await t.getDb().insert(t.schema.eventMenuEntries).values({
    eventId, kind: "bundle", name: "Paket Kopi Nasi", price: 40000, status: "active", quota: null,
    startsAt: event.startsAt, endsAt: event.endsAt, groups: [
      { id: "drink", name: "Minuman", quantity: 1, options: [{ itemId: "itm-coffee", variantId: "reg" }] },
      { id: "food", name: "Makanan", quantity: 1, options: [{ itemId: "itm-food", variantId: "reg" }] },
    ],
  }).returning();
  bundleId = bundle.id;
}, 120_000);

afterAll(async () => { if (t) await teardownGarageTestDb(t); });

const input = (key: string) => ({
  orderType: "takeaway" as const, customerMode: "guest" as const, guestName: "Tamu Event", outletId,
  paymentMethod: "Cash", eventId, eventItems: [{ entryId, qty: 2 }], items: [], clientRequestKey: key,
});
const owner = () => ({
  user: { id: "user-itest", name: "Owner Test" },
  profile: { role: "Owner", deviceLabel: "Test", shiftLabel: "Test", outlet: { id: outletId, name: "Outlet Test", code: "TST", timezone: "Asia/Jakarta" } },
}) as unknown as GarageSession;

describe("checkout menu event memakai order Garage existing", () => {
  const bundleCart = () => [{ entryId: bundleId, qty: 1, selections: [
    { groupId: "drink", itemId: "itm-coffee", variantId: "reg" },
    { groupId: "food", itemId: "itm-food", variantId: "reg" },
  ] }];
  it("menggabungkan paket, harga kontekstual satuan, dan harga reguler dalam satu order", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const request = { ...input("main-mixed-cart-001"), eventItems: bundleCart(), items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }, { itemId: "itm-food", variantId: "reg", qty: 1 }] };
    const result = await createCustomerOrder(request);
    const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, result.order.id));
    const lines = await t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, result.order.id));
    expect(order).toMatchObject({ eventId, subtotal: 85000 });
    expect(lines.filter((line: { eventSnapshot: unknown }) => !line.eventSnapshot)).toMatchObject([{ menuItemId: "itm-food", unitPrice: 30000 }]);
    expect(lines.find((line: { eventSnapshot?: { kind: string } }) => line.eventSnapshot?.kind === "item")).toMatchObject({ menuItemId: "itm-coffee", unitPrice: 15000 });
    expect(lines.filter((line: { eventSnapshot?: { kind: string } }) => line.eventSnapshot?.kind === "bundle")).toHaveLength(2);
    const replay = await createCustomerOrder(request);
    expect(replay.order.id).toBe(result.order.id);
    await expect(createCustomerOrder({ ...request, items: [{ itemId: "itm-food", variantId: "reg", qty: 2 }] })).rejects.toThrow(/berbeda/);
  });

  it("menerima keranjang satuan tanpa paket dan hanya memberi label event pada item kontekstual", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const contextual = await createCustomerOrder({ ...input("main-single-only-002"), eventItems: [], items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] });
    const regularRequest = { ...input("main-regular-only-003"), eventItems: [], items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] };
    const regular = await createCustomerOrder(regularRequest);
    const [eventOrder] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, contextual.order.id));
    const [regularOrder] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, regular.order.id));
    expect(eventOrder).toMatchObject({ eventId, subtotal: 15000 });
    expect(regularOrder).toMatchObject({ eventId: null, subtotal: 30000 });
    expect((await createCustomerOrder(regularRequest)).order.id).toBe(regular.order.id);
  });

  it("menyembunyikan produk satuan tetap mengizinkan komponen paket aktif", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const { getPublicEventMenu } = await import("@/lib/event-menu-service");
    await t.getDb().update(t.schema.menuItems).set({ showInDigitalMenu: false }).where(eq(t.schema.menuItems.id, "itm-food"));
    try {
      const result = await createCustomerOrder({ ...input("main-hidden-bundle-004"), eventItems: bundleCart() });
      const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, result.order.id));
      expect(order.subtotal).toBe(40000);
      const menu = await getPublicEventMenu("checkout-food-event");
      expect(menu.products.find(product => product.id === "itm-food")?.showInDigitalMenu).toBe(false);
      expect(menu.entries.some(entry => entry.id === bundleId)).toBe(true);
      await expect(createCustomerOrder({ ...input("main-hidden-single-005"), eventItems: [], items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] })).rejects.toThrow("tidak tersedia di menu digital");
    } finally { await t.getDb().update(t.schema.menuItems).set({ showInDigitalMenu: true }).where(eq(t.schema.menuItems.id, "itm-food")); }
  });

  it("harga event mengalahkan promo produk hanya pada varian yang cocok", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    await t.getDb().insert(t.schema.menuVariants).values({ itemId: "itm-coffee", variantId: "hot", label: "Hot", price: 25000 });
    await t.getDb().update(t.schema.menuItems).set({ promoActive: true, promoPrice: 18000 }).where(eq(t.schema.menuItems.id, "itm-coffee"));
    try {
      const result = await createCustomerOrder({ ...input("main-event-promo-006"), eventItems: [], items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }, { itemId: "itm-coffee", variantId: "hot", qty: 1 }] });
      const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, result.order.id));
      expect(order.subtotal).toBe(33000);
    } finally { await t.getDb().update(t.schema.menuItems).set({ promoActive: false, promoPrice: null }).where(eq(t.schema.menuItems.id, "itm-coffee")); }
  });
  it("menyimpan harga event tanpa mengubah harga reguler dan tanpa pemotongan stok saat checkout", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const result = await createCustomerOrder(input("event-price-check-0001"));
    const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, result.order.id));
    const lines = await t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.id));
    const variants = await t.getDb().select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "itm-coffee"));
    expect(order).toMatchObject({ eventId, subtotal: 30_000, status: "pending_cashier" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ menuItemId: "itm-coffee", unitPrice: 15_000, qty: 2, eventSnapshot: { eventId, entryId } });
    expect(variants[0].price).toBe(20_000);
    expect(result.order.eventTitle).toBe("Menu Kopi Event");
    expect(JSON.stringify(result.order)).not.toContain("unitCost");
    const tickets = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, order.id));
    expect(tickets).toHaveLength(0);
  });

  it("retry order meja tidak membocorkan kode gabung rombongan berikutnya", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const request = { ...input("event-table-replay-0005"), orderType: "dine-in" as const, tableLabel: "Meja 06" };
    const result = await createCustomerOrder(request);
    const newCode = result.joinCode === "9876" ? "8765" : "9876";
    await t.getDb().update(t.schema.tableSessions).set({ joinCode: newCode, cleanedAt: new Date(Date.now() + 1000) }).where(eq(t.schema.tableSessions.tableNumber, "06"));
    const replay = await createCustomerOrder(request);
    expect(replay.joinCode).toBe(result.joinCode);
    expect(replay.joinCode).not.toBe(newCode);
  });

  it("order event belum diterima tidak boleh dipecah sehingga pengembalian kuota tidak ganda", async () => {
    const { createCustomerOrder, splitCustomerOrder } = await import("@/lib/garage-service");
    const order = await createCustomerOrder({ ...input("event-before-split-0006"), orderType: "dine-in", tableLabel: "Meja 07" });
    const [line] = await t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.order.id));
    await expect(splitCustomerOrder(order.order.id, { items: [{ orderItemId: line.id, qty: 1 }] }, owner())).rejects.toThrow("Terima order event");
  });

  it("void invoice event yang belum diterima mengembalikan kuota sekali", async () => {
    const { createCustomerOrder, voidOrder } = await import("@/lib/garage-service");
    const [before] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, entryId));
    const order = await createCustomerOrder(input("event-void-quota-0007"));
    await voidOrder(order.order.id, "Uji pembatalan sebelum produksi", owner());
    const [after] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, entryId));
    expect(after.usedQuantity).toBe(before.usedQuantity);
    await expect(voidOrder(order.order.id, "Uji ulang", owner())).rejects.toThrow("dibatalkan");
  });

  it("retry idempoten tidak membuat order kedua atau menghabiskan kuota dua kali", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const [before] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, entryId));
    const first = await createCustomerOrder(input("event-durable-retry-0002"));
    const second = await createCustomerOrder(input("event-durable-retry-0002"));
    expect(second.order.id).toBe(first.order.id);
    const [entry] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, entryId));
    expect(entry.usedQuantity).toBe(before.usedQuantity + 2);
    await expect(createCustomerOrder({ ...input("event-durable-retry-0002"), eventItems: [{ entryId, qty: 3 }] })).rejects.toThrow(/berbeda|digunakan/i);
  });

  it.each(["quota", "messaging"])("merekonsiliasi order yang commit setelah lookup retry sebelum kegagalan %s", async (failure) => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const menuService = await import("@/lib/event-menu-service");
    const { EventError } = await import("@/lib/event-service");
    const request = input(`event-replay-quote-race-0008-${failure}`);
    const resolver = menuService.resolveEventCheckoutCart;
    let committedOrderId = "";
    const spy = vi.spyOn(menuService, "resolveEventCheckoutCart");
    spy.mockImplementationOnce(async () => {
      // The original request commits while recovery has already missed its
      // optimistic lookup but has not yet reached the locked replay lookup.
      committedOrderId = (await createCustomerOrder(request)).order.id;
      if (failure === "quota") throw new EventError(409, "EVENT_MENU_QUOTA", "Kuota sudah terpakai percobaan pertama.");
      throw new Error("Invoice messaging connection interrupted after commit.");
    }).mockImplementation(resolver);
    const [before] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, entryId));
    try {
      const recovered = await createCustomerOrder(request);
      expect(recovered.order.id).toBe(committedOrderId);
      const [after] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, entryId));
      expect(after.usedQuantity).toBe(before.usedQuantity + 2);
    } finally { spy.mockRestore(); }
  });

  it("harga paket final: tanpa promo QR/service/pajak, menu reguler tetap kena promo", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const only = await createCustomerOrder({ ...input("final-price-bundle-0001"), eventItems: bundleCart() });
    const [bundleOrder] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, only.order.id));
    expect(bundleOrder).toMatchObject({ subtotal: 40000, discount: 0, total: 40000 });
    const mixed = await createCustomerOrder({ ...input("final-price-mixed-0002"), eventItems: bundleCart(), items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] });
    const [mixedOrder] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, mixed.order.id));
    // Promo QR default 10% hanya dari menu reguler Rp 30.000 → Rp 3.000.
    expect(mixedOrder).toMatchObject({ subtotal: 70000, discount: 3000, total: 67000 });
  });

  it("paket berisi rokok dari POS (open bill) diterima tanpa tiket produksi untuk rokok", async () => {
    const { createCustomerOrder, updateCustomerOrderStatus } = await import("@/lib/garage-service");
    await t.getDb().insert(t.schema.menuItems).values({ id: "rokok-itest", name: "Black Matcha", category: "Rokok", section: "Rokok", prep: "0m", showInDigitalMenu: false, productType: "retail" });
    await t.getDb().insert(t.schema.menuVariants).values({ itemId: "rokok-itest", variantId: "regular", label: "Regular", price: 18_000 });
    const [rokokBundle] = await t.getDb().insert(t.schema.eventMenuEntries).values({
      eventId, kind: "bundle", name: "Paket Nongkrong", price: 45_000, status: "active", quota: 10,
      startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000), groups: [
        { id: "rokok", name: "Rokok", quantity: 1, options: [{ itemId: "rokok-itest", variantId: "regular" }] },
        { id: "drink", name: "Minuman", quantity: 1, options: [{ itemId: "itm-coffee", variantId: "reg" }] },
      ],
    }).returning();
    const result = await createCustomerOrder({
      orderType: "takeaway", customerMode: "guest", guestName: "Tamu Paket", outletId, source: "qr_takeaway", staffOrder: true, allowHiddenItems: true,
      paymentMethod: "Cash", eventId, items: [], clientRequestKey: "pos-rokok-bundle-0001",
      eventItems: [{ entryId: rokokBundle.id, qty: 1, selections: [{ groupId: "rokok", itemId: "rokok-itest", variantId: "regular" }, { groupId: "drink", itemId: "itm-coffee", variantId: "reg" }] }],
    });
    await updateCustomerOrderStatus(result.order.id, { action: "accept" }, owner(), { openBill: true });
    const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, result.order.id));
    expect(order).toMatchObject({ eventId, subtotal: 45_000, status: "accepted" });
    const lines = await t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.id));
    expect(lines.map((line: { menuItemId: string }) => line.menuItemId).sort()).toEqual(["itm-coffee", "rokok-itest"]);
    const tickets = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, order.id));
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.flatMap((ticket: { items: string[] }) => ticket.items).join(" ")).not.toContain("Black Matcha");
    const [entry] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, rokokBundle.id));
    expect(entry.usedQuantity).toBe(1);
  });

  it("pisah bill paket harus satu paket utuh", async () => {
    const { createCustomerOrder, updateCustomerOrderStatus, splitCustomerOrder } = await import("@/lib/garage-service");
    const order = await createCustomerOrder({ ...input("bundle-split-whole-0001"), orderType: "dine-in", tableLabel: "Meja 09", eventItems: bundleCart(), items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] });
    await updateCustomerOrderStatus(order.order.id, { action: "accept" }, owner(), { openBill: true });
    const lines = await t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.order.id));
    const bundleLines = lines.filter((line: { eventSnapshot: { kind: string } | null }) => line.eventSnapshot?.kind === "bundle");
    await expect(splitCustomerOrder(order.order.id, { items: [{ orderItemId: bundleLines[0].id, qty: 1 }] }, owner())).rejects.toThrow("satu paket utuh");
    const split = await splitCustomerOrder(order.order.id, { items: bundleLines.map((line: { id: string; qty: number }) => ({ orderItemId: line.id, qty: line.qty })) }, owner());
    // Bill pisahan berisi paket = harga paket final (tanpa service/pajak).
    expect(split.child.total).toBe(40000);
  });

  it("perpanjangan jam event ikut memperpanjang paket yang berakhir bersama event", async () => {
    const svc = await import("@/lib/event-service");
    const [event] = await t.getDb().select().from(t.schema.events).where(eq(t.schema.events.id, eventId));
    const [bundleBefore] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, bundleId));
    expect(bundleBefore.endsAt.getTime()).toBe(event.endsAt.getTime());
    const newEnd = new Date(event.endsAt.getTime() + 2 * 3_600_000);
    await svc.updateEvent(eventId, svc.eventUpdateSchema.parse({
      title: event.title, tagline: null, startsAt: event.startsAt.toISOString(), endsAt: newEnd.toISOString(), venueName: event.venueName,
      address: event.address, mapsUrl: event.mapsUrl, contactWhatsapp: event.contactWhatsapp, highlights: [], about: null, faq: [], gallery: [],
      featuredOnHome: false, rsvpDeadline: null, defaultMaxPax: 2,
    }), "user-itest");
    const [bundleAfter] = await t.getDb().select().from(t.schema.eventMenuEntries).where(eq(t.schema.eventMenuEntries.id, bundleId));
    expect(bundleAfter.endsAt.getTime()).toBe(newEnd.getTime());
  });

  it("menolak event berakhir, tapi tetap bisa mengulang hasil order yang sudah sah", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const valid = await createCustomerOrder(input("event-before-end-0003"));
    await t.getDb().update(t.schema.events).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(t.schema.events.id, eventId));
    await expect(createCustomerOrder(input("event-after-end-0004"))).rejects.toThrow();
    const replay = await createCustomerOrder(input("event-before-end-0003"));
    expect(replay.order.id).toBe(valid.order.id);
  });
});
