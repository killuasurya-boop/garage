import fs from "node:fs";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

const SLUG = "garage-coffee-event-2026-10-24";
let t: GarageTestDb;
let outletId = "";
const statements = fs.readFileSync("drizzle/0150_event_garage_coffee_2026_10_24.sql", "utf8")
  .split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

async function runMigration() {
  for (const statement of statements) await t.getPgPool().exec(statement);
}

const products: Array<[id: string, name: string, category: string, variants: Array<[string, number]>, hidden?: boolean]> = [
  ["rokok-black-matcha", "Black Matcha", "Rokok", [["regular", 18000]], true],
  ["bar-sanger", "Sanger", "Coffee", [["cold", 16000], ["hot", 15000]]],
  ["bar-lychee-tea", "Lychee Tea", "Non-Coffee", [["cold", 15000]]],
  ["bar-lemon-tea", "Lemon Tea", "Non-Coffee", [["cold", 15000], ["hot", 15000]]],
  ["bar-gula-aren", "Gula Aren", "Coffee", [["hot", 23000]]],
  ["bar-caramel-macchiato", "Caramel Macchiato", "Coffee", [["cold", 28000]]],
  ["cemilan-kentang-ori", "Kentang Ori", "Cemilan", [["regular", 12000]]],
  ["cemilan-sosis", "Sosis", "Cemilan", [["regular", 12000]]],
  ["cemilan-nugget", "Nugget", "Cemilan", [["regular", 12000]]],
  ["cemilan-mix-plater", "Mix Plater", "Cemilan", [["regular", 18000]]],
  ["cemilan-kentang-balado", "Kentang Balado", "Cemilan", [["regular", 14000]]],
  ["minuman-mineral", "Mineral", "Minuman Botol", [["regular", 5000]]],
];

beforeAll(async () => {
  t = await setupGarageTestDb();
  const db = t.getDb();
  const { schema } = t;
  // setupGarageTestDb sudah menjalankan 0150 pada DB kosong (tanpa outlet/produk) → hapus hasilnya,
  // lalu uji ulang seperti produksi: outlet & katalog sudah ada sebelum migrasi.
  const [stale] = await db.select().from(schema.events).where(eq(schema.events.slug, SLUG));
  if (stale) {
    await db.delete(schema.eventMenuEntries).where(eq(schema.eventMenuEntries.eventId, stale.id));
    await db.delete(schema.events).where(eq(schema.events.id, stale.id));
  }
  ({ outletId } = await seedGarageBasics(t));
  for (const [id, name, category, variants, hidden] of products) {
    await db.insert(schema.menuItems).values({ id, name, category, section: category, prep: "4m", showInDigitalMenu: !hidden }).onConflictDoNothing();
    for (const [variantId, price] of variants) {
      await db.insert(schema.menuVariants).values({ itemId: id, variantId, label: variantId === "regular" ? "Regular" : variantId === "hot" ? "Hot" : "Cold", price }).onConflictDoNothing();
    }
  }
  await runMigration();
  await runMigration();
}, 120_000);
afterAll(async () => { await teardownGarageTestDb(t); });

describe("0150 Garage Coffee Event seed", () => {
  it("creates one published event with 4 bundles and a la carte prices from the owner's data", async () => {
    const { schema } = t;
    const events = await t.getDb().select().from(schema.events).where(eq(schema.events.slug, SLUG));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: "Garage Coffee Event", status: "published", ageGate: true, outletId });
    const entries = await t.getDb().select().from(schema.eventMenuEntries).where(eq(schema.eventMenuEntries.eventId, events[0].id));
    const bundles = entries.filter((row: { kind: string }) => row.kind === "bundle");
    const items = entries.filter((row: { kind: string }) => row.kind === "item");
    expect(bundles.map((row: { price: number }) => row.price).sort()).toEqual([45000, 50000, 55000, 60000]);
    // 12 produk dari tes + 10 varian dari migrasi 0140/0148 (Choco Kiss, Dark Charm, Red Velvet, Taro,
    // Tea Pahit, Strawberry Tea) = 22 baris a la carte; rokok tidak pernah jadi item.
    expect(items).toHaveLength(22);
    expect(items.some((row: { menuItemId: string | null }) => row.menuItemId?.startsWith("rokok-"))).toBe(false);
    expect(items.find((row: { menuItemId: string | null; variantId: string | null }) => row.menuItemId === "bar-sanger" && row.variantId === "hot")?.price).toBe(15000);
  });

  it("is the main digital menu and its bundles are orderable during the event", async () => {
    const { getMainDigitalMenuEvent } = await import("@/lib/event-main-menu-service");
    const data = await getMainDigitalMenuEvent(outletId, new Date("2026-10-24T12:00:00+07:00"));
    expect(data?.event.title).toBe("Garage Coffee Event");
    expect(data?.entries.filter((entry) => entry.kind === "bundle")).toHaveLength(4);
    expect(await getMainDigitalMenuEvent(outletId, new Date("2026-10-25T04:00:00+07:00"))).toBeNull();
  });

  it("never overrides a main digital menu the owner already chose", async () => {
    const { schema } = t;
    const otherId = "00000000-0000-4000-8000-0000000000aa";
    await t.getDb().update(schema.appSettings).set({ valueJson: { eventId: otherId } })
      .where(and(eq(schema.appSettings.outletId, outletId), eq(schema.appSettings.key, "digitalMenu.featuredEventId")));
    await runMigration();
    const [setting] = await t.getDb().select().from(schema.appSettings)
      .where(and(eq(schema.appSettings.outletId, outletId), eq(schema.appSettings.key, "digitalMenu.featuredEventId")));
    expect(setting.valueJson).toEqual({ eventId: otherId });
  });
});
