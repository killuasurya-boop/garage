import fs from "node:fs";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { menuItems as seedMenu } from "@/lib/garage-data";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";
import { MASTER_WORKBOOK_PATH } from "@/lib/test-helpers/master-workbook-fixture";

// =============================================================================
// Impor master Excel v3.1 → bahan Dapur + resep draft, tanpa mengubah data POS.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let mi: any;
let baseline: any;
const ACTOR = { id: "owner-master", name: "Owner Master" };
// Workbook asli = data bisnis privat (tidak ada di repo publik, PR #210): tes ini jalan bila berkasnya ada.
// Alur yang sama diuji di CI dengan workbook sintetis: master-import-synthetic.integration.test.ts.
const HAS_WORKBOOK = fs.existsSync(MASTER_WORKBOOK_PATH);
const buffer = HAS_WORKBOOK ? fs.readFileSync(MASTER_WORKBOOK_PATH) : Buffer.alloc(0);

beforeAll(async () => {
  if (!HAS_WORKBOOK) return;
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: ACTOR.id });
  const d = t.getDb();
  const food = seedMenu.filter((m) => m.category === "Makanan" || m.category === "Cemilan");
  await d.insert(t.schema.menuItems).values(
    food.map((m) => ({ id: m.id, name: m.name, category: m.category, section: m.section, prep: m.prep })),
  );
  await d.insert(t.schema.menuVariants).values(
    food.flatMap((m) => m.variants.map((v) => ({ itemId: m.id, variantId: v.id, label: v.label, price: v.price }))),
  );
  mi = await import("@/lib/master-import");
  baseline = await import("@/lib/pos-baseline");
}, 60_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe.skipIf(!HAS_WORKBOOK)("Impor master Excel (berkas privat)", () => {
  it("preview tidak menulis data operasional", async () => {
    const res = await mi.previewMasterImport({ buffer, fileName: "master.xlsx" }, ACTOR);
    expect(res.summary.materialsToCreate).toBe(40);
    expect(res.summary.recipesNewDraft).toBe(10);
    const items = await t.getDb().select().from(t.schema.inventoryItems);
    expect(items.filter((i: any) => i.sku.startsWith("KIT-")).length).toBe(0);
  });

  it("apply: 40 bahan Dapur + 10 resep draft; POS tidak berubah; draft tidak masuk HPP", async () => {
    const before = await baseline.getPosBaseline();
    const res = await mi.applyMasterImport({ buffer, fileName: "master.xlsx" }, ACTOR);
    expect(res.materialsCreated).toBe(40);
    expect(res.recipesDrafted).toBe(10);

    const after = await baseline.getPosBaseline();
    expect(after.hash).toBe(before.hash);

    const { eq } = await import("drizzle-orm");
    const d = t.getDb();
    const egg = (await d.select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, "KIT-027")))[0];
    expect(egg).toMatchObject({ unit: "pcs", packageQty: 30, purchasePrice: 48000 });
    expect(Number(egg.unitCost)).toBe(1600);
    const wmsEgg = (await d.select().from(t.schema.wmsProduct).where(eq(t.schema.wmsProduct.sku, "KIT-027")))[0];
    expect(wmsEgg.category).toBe("Dapur · Bahan Baku");

    const drafts = await d.select().from(t.schema.menuRecipes).where(eq(t.schema.menuRecipes.status, "draft"));
    expect(new Set(drafts.map((r: any) => r.menuItemId)).size).toBe(10);
    const [nasiVariant] = await d.select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "makanan-nasi"));
    expect(nasiVariant.baseCost).toBe(0);
  });

  it("apply ulang idempoten (tidak membuat bahan/resep dobel)", async () => {
    const res = await mi.applyMasterImport({ buffer, fileName: "master.xlsx" }, ACTOR);
    expect(res.materialsCreated).toBe(0);
    expect(res.recipesDrafted).toBe(0);
  });

  it("setujui draft → aktif & HPP varian terhitung; tolak → arsip dengan alasan", async () => {
    const list = await mi.listDraftRecipes();
    const nasi = list.find((r: any) => r.menuItemId === "makanan-nasi");
    expect(nasi.referenceHpp).toBe(Math.round(70 * 15.5));

    await mi.approveDraftRecipe("makanan-nasi", ACTOR);
    const { eq } = await import("drizzle-orm");
    const d = t.getDb();
    const [variant] = await d.select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "makanan-nasi"));
    expect(variant.baseCost).toBe(Math.round(70 * 15.5));
    expect(variant.price).toBe(5000);
    await expect(mi.approveDraftRecipe("makanan-nasi", ACTOR)).rejects.toThrow(/Tidak ada resep draft/);

    await expect(mi.rejectDraftRecipe("cemilan-nugget", "x", ACTOR)).rejects.toThrow(/Alasan/);
    await mi.rejectDraftRecipe("cemilan-nugget", "Gramasi belum diuji", ACTOR);
    const nugget = await d.select().from(t.schema.menuRecipes).where(eq(t.schema.menuRecipes.menuItemId, "cemilan-nugget"));
    expect(nugget.every((r: any) => r.status === "archived")).toBe(true);
  });
});
