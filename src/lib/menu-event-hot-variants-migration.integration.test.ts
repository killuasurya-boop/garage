import fs from "node:fs";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

let t: GarageTestDb;
const statements = fs.readFileSync("drizzle/0148_menu_event_hot_variants.sql", "utf8")
  .split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

async function runMigration() {
  for (const statement of statements) await t.getPgPool().exec(statement);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const db = t.getDb();
  const { schema } = t;
  await db.insert(schema.inventoryItems).values([
    { sku: "BAR-018", name: "Fresh Milk", alternativeName: "", packageSize: "1 L", movement: "", category: "Bar", unit: "ml", onHand: 0, min: 0, status: "safe", unitCost: "30.0000" },
    { sku: "BAR-031", name: "Cup", alternativeName: "", packageSize: "1 pcs", movement: "", category: "Bar", unit: "pcs", onHand: 0, min: 0, status: "safe", unitCost: "800.0000" },
    { sku: "BAR-032", name: "Es Batu", alternativeName: "", packageSize: "1 pcs", movement: "", category: "Bar", unit: "pcs", onHand: 0, min: 0, status: "safe", unitCost: "500.0000" },
  ] as never).onConflictDoNothing();
  await db.insert(schema.menuItems).values({ id: "bar-gula-aren", name: "Gula Aren", category: "Coffee", section: "Kopi Susu", prep: "4m" }).onConflictDoNothing();
  await db.insert(schema.menuVariants).values({ itemId: "bar-gula-aren", variantId: "cold", label: "Cold", price: 23000 }).onConflictDoNothing();
  await db.insert(schema.menuRecipes).values([
    { menuItemId: "bar-gula-aren", variantId: "all", inventorySku: "BAR-018", qty: 60, unit: "ml" },
    { menuItemId: "bar-gula-aren", variantId: "all", inventorySku: "BAR-031", qty: 1, unit: "pcs" },
    { menuItemId: "bar-gula-aren", variantId: "all", inventorySku: "BAR-032", qty: 1, unit: "pcs" },
  ]);
  // Owner sudah mengubah harga Matcha Hot sendiri → migrasi tidak boleh menimpanya.
  await db.insert(schema.menuItems).values({ id: "bar-matcha", name: "Matcha", category: "Non-Coffee", section: "Milk Series", prep: "4m" }).onConflictDoNothing();
  await db.insert(schema.menuVariants).values([
    { itemId: "bar-matcha", variantId: "cold", label: "Cold", price: 22000 },
    { itemId: "bar-matcha", variantId: "hot", label: "Hot", price: 21000 },
  ]).onConflictDoNothing();
  await runMigration();
  await runMigration();
}, 120_000);
afterAll(async () => { await teardownGarageTestDb(t); });

describe("0148 menu event hot variants", () => {
  it("adds Hot variants with the Excel price and never overwrites existing ones", async () => {
    const { schema } = t;
    const [hot] = await t.getDb().select().from(schema.menuVariants).where(and(eq(schema.menuVariants.itemId, "bar-gula-aren"), eq(schema.menuVariants.variantId, "hot")));
    expect(hot).toMatchObject({ label: "Hot", price: 23000 });
    const [matchaHot] = await t.getDb().select().from(schema.menuVariants).where(and(eq(schema.menuVariants.itemId, "bar-matcha"), eq(schema.menuVariants.variantId, "hot")));
    expect(matchaHot.price).toBe(21000);
  });

  it("splits the shared recipe so Hot skips ice, and prices Hot HPP from the recipe", async () => {
    const { schema } = t;
    const rows = await t.getDb().select().from(schema.menuRecipes).where(eq(schema.menuRecipes.menuItemId, "bar-gula-aren"));
    expect(rows.filter((r: { variantId: string }) => r.variantId === "all")).toHaveLength(0);
    expect(rows.filter((r: { variantId: string }) => r.variantId === "cold").map((r: { inventorySku: string }) => r.inventorySku).sort()).toEqual(["BAR-018", "BAR-031", "BAR-032"]);
    expect(rows.filter((r: { variantId: string }) => r.variantId === "hot").map((r: { inventorySku: string }) => r.inventorySku).sort()).toEqual(["BAR-018", "BAR-031"]);
    const [hot] = await t.getDb().select().from(schema.menuVariants).where(and(eq(schema.menuVariants.itemId, "bar-gula-aren"), eq(schema.menuVariants.variantId, "hot")));
    expect(hot.baseCost).toBe(60 * 30 + 800);
  });

  it("inserts the new event products once, with LA Manggo hidden from the digital menu", async () => {
    const { schema } = t;
    const items = await t.getDb().select().from(schema.menuItems);
    const ids = items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["bar-red-velvet", "bar-taro", "bar-tea-pahit", "bar-strawberry-tea", "rokok-la-manggo"]));
    const manggo = items.find((i: { id: string }) => i.id === "rokok-la-manggo");
    expect(manggo).toMatchObject({ showInDigitalMenu: false, productType: "retail" });
    const taro = await t.getDb().select().from(schema.menuVariants).where(eq(schema.menuVariants.itemId, "bar-taro"));
    expect(taro.map((v: { variantId: string; price: number }) => [v.variantId, v.price]).sort()).toEqual([["cold", 22000], ["hot", 20000]]);
  });
});
