import fs from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders } from "@/db/schema";

import { setupGarageTestDb, seedGarageBasics, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";
import { archiveEventMenuEntry, createCommerceEvent, getEventMenuData, getPublicEventMenu, releaseEventQuotaForOrder, resolveEventCart, saveEventMenuEntry, type EventMenuEntryInput } from "@/lib/event-menu-service";

let t: GarageTestDb;
let eventId: string;
let actor: { userId: string; name: string; outletId: string };
const startsAt = "2026-10-21T08:00:00.000Z";
const endsAt = "2026-10-21T16:00:00.000Z";
const now = new Date("2026-10-21T10:00:00.000Z");

beforeAll(async () => {
  t = await setupGarageTestDb();
  // Unlike the legacy harness, fail on any migration DDL error rather than swallowing it.
  const ddl = fs.readFileSync("drizzle/0145_event_menu_commerce.sql", "utf8");
  for (const statement of ddl.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await t.getPgPool().exec(statement);
  const seed = await seedGarageBasics(t, { userId: "event-menu-owner" });
  actor = { userId: seed.userId, name: "Owner Test", outletId: seed.outletId };
  const event = await createCommerceEvent({ title: "Event Kuliner", slug: "event-kuliner", startsAt, endsAt, address: "Jalan Garage Coffee", mapsUrl: "https://maps.google.com/", contactWhatsapp: "081234567890" }, actor);
  eventId = event.id;
  await t.getDb().update(t.schema.events).set({ status: "published" }).where(eq(t.schema.events.id, eventId));
}, 120_000);
afterAll(async () => { await teardownGarageTestDb(t); });

function item(overrides: Partial<EventMenuEntryInput> = {}): EventMenuEntryInput {
  return { kind: "item", name: "Kopi Acara", menuItemId: "itm-coffee", variantId: "reg", price: 15_000, startsAt, endsAt, ...overrides };
}
function bundle(overrides: Partial<EventMenuEntryInput> = {}): EventMenuEntryInput {
  return { kind: "bundle", name: "Paket Ngopi", price: 45_001, startsAt, endsAt, groups: [
    { id: "drink", name: "Minuman", quantity: 1, options: [{ itemId: "itm-coffee", variantId: "reg" }] },
    { id: "food", name: "Makanan", quantity: 2, options: [{ itemId: "itm-food", variantId: "reg" }] },
  ], ...overrides };
}
const selections = [{ groupId: "drink", itemId: "itm-coffee", variantId: "reg" }, { groupId: "food", itemId: "itm-food", variantId: "reg" }];

describe("Event menu persistence and safe checkout", () => {
  it("migration creates the real table and expected columns", async () => {
    const result = await t.getPgPool().query("select column_name from information_schema.columns where table_name='event_menu_entries'");
    expect(result.rows.map((r: { column_name: string }) => r.column_name)).toEqual(expect.arrayContaining(["groups", "quota", "used_quantity", "event_id"]));
  });
  it("creates, updates, reads and archives event menu without touching master price", async () => {
    const entry = await saveEventMenuEntry(eventId, item(), actor);
    const changed = await saveEventMenuEntry(eventId, item({ name: "Kopi Khusus", price: 12_000, status: "inactive" }), actor, entry.id);
    expect(changed.price).toBe(12_000);
    const data = await getEventMenuData(eventId, { outletId: actor.outletId });
    expect(data.entries.find(e => e.id === entry.id)?.status).toBe("inactive");
    await archiveEventMenuEntry(eventId, entry.id, actor);
    const [master] = await t.getDb().select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "itm-coffee"));
    expect(master.price).toBe(20_000);
    await expect(saveEventMenuEntry(eventId, item(), actor, entry.id)).rejects.toThrow("diarsipkan");
  });
  it("rejects duplicate overlapping active prices but permits adjacent schedules", async () => {
    await saveEventMenuEntry(eventId, item({ startsAt: "2026-10-21T08:00:00Z", endsAt: "2026-10-21T09:00:00Z" }), actor);
    await expect(saveEventMenuEntry(eventId, item({ startsAt: "2026-10-21T08:30:00Z", endsAt: "2026-10-21T09:30:00Z" }), actor)).rejects.toThrow("bertabrakan");
    await saveEventMenuEntry(eventId, item({ startsAt: "2026-10-21T09:00:00Z", endsAt: "2026-10-21T09:30:00Z" }), actor);
  });
  it("rejects schedules outside event and cross-outlet mutation", async () => {
    await expect(saveEventMenuEntry(eventId, item({ startsAt: "2026-10-20T08:00:00Z" }), actor)).rejects.toThrow("periode event");
    await expect(saveEventMenuEntry(eventId, bundle(), { ...actor, outletId: "00000000-0000-4000-8000-000000000001" })).rejects.toThrow("outlet ini");
  });
  it("does not expose draft events", async () => {
    await createCommerceEvent({ title: "Draft Event", slug: "draft-event", startsAt, endsAt }, actor);
    await expect(getPublicEventMenu("draft-event")).rejects.toThrow("belum tersedia");
  });
  it("validates slug uniqueness", async () => {
    await expect(createCommerceEvent({ title: "Event Duplicate", slug: "event-kuliner", startsAt, endsAt }, actor)).rejects.toThrow("sudah dipakai");
  });
  it("allocates bundle whole rupiah exactly while preserving original component identities", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle(), actor);
    const lines = await resolveEventCart(t.getDb(), { eventId, now, items: [{ entryId: entry.id, qty: 3, selections }] });
    expect(lines.reduce((n, line) => n + line.lineTotal, 0)).toBe(45_001 * 3);
    expect(lines.reduce((n, line) => n + (line.itemId === "itm-food" ? line.qty : 0), 0)).toBe(6);
    expect(new Set(lines.map(l => l.eventSnapshot.groupId)).size).toBe(1);
    expect(lines.every(l => l.eventSnapshot.unitCost === null)).toBe(true);
    expect(lines[0].eventSnapshot.componentCount).toBe(lines.length);
  });
  it("rejects malformed and unauthorized bundle choices", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle(), actor);
    await expect(resolveEventCart(t.getDb(), { eventId, now, items: [{ entryId: entry.id, qty: 1, selections: selections.slice(0, 1) }] })).rejects.toThrow("setiap grup");
    await expect(resolveEventCart(t.getDb(), { eventId, now, items: [{ entryId: entry.id, qty: 1, selections: [selections[0], { ...selections[1], itemId: "itm-coffee" }] }] })).rejects.toThrow("tidak valid");
  });
  it("rejects expired and upcoming checkout regardless of browser cart prices", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle(), actor);
    for (const date of [startsAt, endsAt]) {
      const outside = date === startsAt ? new Date(Date.parse(date) - 1) : new Date(date);
      await expect(resolveEventCart(t.getDb(), { eventId, now: outside, items: [{ entryId: entry.id, qty: 1, selections }] })).rejects.toThrow("berakhir");
    }
  });
  it("supports unlimited quota while still counting package sales", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle(), actor);
    await t.getDb().transaction((tx: Parameters<typeof resolveEventCart>[0]) => resolveEventCart(tx, { eventId, now, reserveQuota: true, items: [{ entryId: entry.id, qty: 25, selections }] }));
    const row = (await getEventMenuData(eventId)).entries.find(e => e.id === entry.id);
    expect(row?.quota).toBeNull(); expect(row?.usedQuantity).toBe(25);
  });
  it("claims optional quotas atomically across repeated lines and rolls back failed carts", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle({ quota: 2 }), actor);
    await expect(t.getDb().transaction((tx: Parameters<typeof resolveEventCart>[0]) => resolveEventCart(tx, { eventId, now, reserveQuota: true, items: [{ entryId: entry.id, qty: 2, selections }, { entryId: entry.id, qty: 1, selections }] }))).rejects.toThrow("Kuota");
    expect((await getEventMenuData(eventId)).entries.find(e => e.id === entry.id)?.usedQuantity).toBe(0);
    await t.getDb().transaction((tx: Parameters<typeof resolveEventCart>[0]) => resolveEventCart(tx, { eventId, now, reserveQuota: true, items: [{ entryId: entry.id, qty: 2, selections }] }));
    await expect(t.getDb().transaction((tx: Parameters<typeof resolveEventCart>[0]) => resolveEventCart(tx, { eventId, now, reserveQuota: true, items: [{ entryId: entry.id, qty: 1, selections }] }))).rejects.toThrow("Kuota");
  });
  it("rejects hidden and restricted tobacco products even inside bundles", async () => {
    await t.getDb().insert(t.schema.menuItems).values({ id: "itm-restricted", name: "Rokok", category: "Rokok", section: "Lainnya", prep: "0m", showInDigitalMenu: true });
    await t.getDb().insert(t.schema.menuVariants).values({ itemId: "itm-restricted", variantId: "reg", label: "Regular", price: 20_000 });
    await expect(saveEventMenuEntry(eventId, item({ menuItemId: "itm-restricted" }), actor)).rejects.toThrow("makanan atau minuman");
    const data = await getPublicEventMenu("event-kuliner");
    expect(data.products.some(p => p.id === "itm-restricted")).toBe(false);
  });
  it("allows only one concurrent checkout to claim the final optional quota", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle({ quota: 1 }), actor);
    const claim = () => t.getDb().transaction((tx: Parameters<typeof resolveEventCart>[0]) => resolveEventCart(tx, { eventId, now, reserveQuota: true, items: [{ entryId: entry.id, qty: 1, selections }] }));
    const results = await Promise.allSettled([claim(), claim()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await getEventMenuData(eventId)).entries.find(row => row.id === entry.id)?.usedQuantity).toBe(1);
  });
  it("releases rejected-order quota once per package group", async () => {
    const entry = await saveEventMenuEntry(eventId, bundle({ quota: 2 }), actor);
    await t.getDb().transaction(async (tx: Parameters<typeof resolveEventCart>[0]) => {
      const lines = await resolveEventCart(tx, { eventId, now, reserveQuota: true, items: [{ entryId: entry.id, qty: 2, selections }] });
      const [order] = await tx.insert(orders).values({ orderNo: "EVENT-QUOTA-RETURN", eventId, outletId: actor.outletId, tableLabel: "Take away", channel: "QR Takeaway", status: "rejected", subtotal: 90_002, service: 0, tax: 0, total: 90_002 }).returning();
      await tx.insert(t.schema.orderItems).values(lines.map(l => ({ orderId: order.id, menuItemId: l.itemId, variantId: l.variantId, itemName: l.itemId, variantLabel: l.variantId, qty: l.qty, unitPrice: l.price, lineTotal: l.lineTotal, eventSnapshot: l.eventSnapshot })));
      await releaseEventQuotaForOrder(tx, order.id);
      await releaseEventQuotaForOrder(tx, order.id);
    });
    expect((await getEventMenuData(eventId)).entries.find(e => e.id === entry.id)?.usedQuantity).toBe(0);
  });
  it("snapshots current recipe ingredient costs with four-decimal precision rather than a manual baseCost", async () => {
    await t.getDb().insert(t.schema.inventoryItems).values({ sku: "EVENT-BEAN", name: "Biji kopi", alternativeName: "", category: "Bahan", unit: "gr", packageSize: "1kg", unitCost: 2.3456, onHand: 1000, min: 0, status: "safe", movement: "Test" });
    await t.getDb().insert(t.schema.menuRecipes).values({ menuItemId: "itm-coffee", variantId: "all", inventorySku: "EVENT-BEAN", qty: 10, unit: "gr", wastePct: 10 });
    await t.getDb().update(t.schema.menuVariants).set({ baseCost: 9999 }).where(eq(t.schema.menuVariants.itemId, "itm-coffee"));
    const entry = await saveEventMenuEntry(eventId, bundle(), actor);
    const lines = await resolveEventCart(t.getDb(), { eventId, now, items: [{ entryId: entry.id, qty: 1, selections }] });
    expect(lines.find(l => l.itemId === "itm-coffee")?.eventSnapshot.unitCost).toBe(25.8016);
    expect(lines.find(l => l.itemId === "itm-food")?.eventSnapshot.unitCost).toBeNull();
    expect(JSON.stringify(await getPublicEventMenu("event-kuliner"))).not.toContain("baseCost");
    expect(JSON.stringify(await getPublicEventMenu("event-kuliner"))).not.toContain("unitCost");
    await t.getDb().insert(t.schema.menuRecipes).values({ menuItemId: "itm-coffee", variantId: "reg", inventorySku: null, qty: 1, unit: "gr", wastePct: 0 });
    const incomplete = await resolveEventCart(t.getDb(), { eventId, now, items: [{ entryId: entry.id, qty: 1, selections }] });
    expect(incomplete.find(l => l.itemId === "itm-coffee")?.eventSnapshot.unitCost).toBeNull();
  });
});
