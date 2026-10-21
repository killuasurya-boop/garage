import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

let t: GarageTestDb;
let outletId = "";
let eventId = "";
let entryId = "";

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

  it("menolak event berakhir, tapi tetap bisa mengulang hasil order yang sudah sah", async () => {
    const { createCustomerOrder } = await import("@/lib/garage-service");
    const valid = await createCustomerOrder(input("event-before-end-0003"));
    await t.getDb().update(t.schema.events).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(t.schema.events.id, eventId));
    await expect(createCustomerOrder(input("event-after-end-0004"))).rejects.toThrow();
    const replay = await createCustomerOrder(input("event-before-end-0003"));
    expect(replay.order.id).toBe(valid.order.id);
  });
});
