import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GARAGE_MATERIAL_REFERENCE_SOURCE } from "@/lib/garage-material-reference-source";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

let t: GarageTestDb;
let service: typeof import("@/lib/material-reference");
let baseline: typeof import("@/lib/pos-baseline");
const actor = { id: "owner-reference", name: "Owner Reference" };
const source = { buffer: Buffer.from(GARAGE_MATERIAL_REFERENCE_SOURCE), fileName: "DATA GUDANG.csv" };
const csv = (sku: string, name: string, unit: string, min: number, price: number, stock = "") => ({
  buffer: Buffer.from(`SKU,Nama,Kategori,Satuan,Min Stok,HPP,Barcode,Stok\n${sku},${name},Dapur,${unit},${min},${price},,${stock}\n`), fileName: "new.csv",
});

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: actor.id });
  service = await import("@/lib/material-reference");
  baseline = await import("@/lib/pos-baseline");
  const { createWmsProduct } = await import("@/lib/wms-service");
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar", area: "bar" });
  await createWmsProduct({ sku: "BAR-001", name: "Drip Strawberry", category: "Bar", unit: "ml", minStock: 10, packPrice: 110000, packQty: 760 }, actor.id);
  await createWmsProduct({ sku: "BAR-014", name: "Coklat", category: "Bar", unit: "gr", minStock: 10, packPrice: 220000, packQty: 760 }, actor.id);
  await t.getDb().insert(t.schema.menuRecipes).values({ menuItemId: "itm-coffee", variantId: "reg", inventorySku: "BAR-001", qty: 25, unit: "ml", status: "active" });
}, 60_000);

afterAll(async () => { await teardownGarageTestDb(t); });

describe("CSV reference import integration", () => {
  it("previews without writes, saves 76 source references, and preserves POS, costs, recipes and physical stock", async () => {
    const before = await baseline.getPosBaseline();
    const beforeRecipes = await t.getDb().select().from(t.schema.menuRecipes);
    const beforeIngredients = await t.getDb().select().from(t.schema.inventoryItems);
    const preview = await service.previewMaterialReference(source);
    expect(preview.plan.summary.total).toBe(76);
    expect(await t.getDb().select().from(t.schema.masterImports)).toHaveLength(0);
    const result = await service.applyMaterialReference(source, actor);
    expect(result.materialsCreated).toBe(0);
    expect((await baseline.getPosBaseline()).hash).toBe(before.hash);
    expect(await t.getDb().select().from(t.schema.menuRecipes)).toEqual(beforeRecipes);
    const afterIngredients = await t.getDb().select().from(t.schema.inventoryItems);
    for (const before of beforeIngredients) {
      const after = afterIngredients.find((r: { sku: string }) => r.sku === before.sku);
      expect(after).toMatchObject({ sku: before.sku, onHand: before.onHand, unitCost: before.unitCost,
        purchasePrice: before.purchasePrice, packageQty: before.packageQty, unit: before.unit, category: before.category });
    }
    expect(afterIngredients).toHaveLength(beforeIngredients.length);
    expect(await t.getDb().select().from(t.schema.wmsStockMovement)).toHaveLength(0);
    expect(await t.getDb().select().from(t.schema.masterCrosswalk).where(eq(t.schema.masterCrosswalk.kind, "material_reference"))).toHaveLength(76);
    const live = await service.getMaterialReference();
    expect(live.plan?.rows[0].recipes).toEqual([expect.objectContaining({ menuItemId: "itm-coffee", qty: 25, status: "active" })]);
    expect(live.plan?.summary.blankStock).toBe(76);
    expect(live.plan?.rows[13].target?.purchasePrice).toBe(220000);
    const [chocolateLink] = await t.getDb().select().from(t.schema.masterCrosswalk)
      .where(and(eq(t.schema.masterCrosswalk.kind, "material_reference"), eq(t.schema.masterCrosswalk.sourceKey, "BAR-914")));
    expect(chocolateLink.validated).toBe(false);
    const [sourceLog] = await t.getDb().select().from(t.schema.masterImports)
      .where(eq(t.schema.masterImports.mode, "material-reference:apply"));
    expect(sourceLog.summary.sourceText).toBe(GARAGE_MATERIAL_REFERENCE_SOURCE);
  });

  it("returns the same import for repeated or concurrent identical requests", async () => {
    const results = await Promise.all([service.applyMaterialReference(source, actor), service.applyMaterialReference(source, actor)]);
    expect(results.every((r) => r.alreadyApplied && r.materialsCreated === 0 && r.metadataUpdated === 0)).toBe(true);
    const logs = await t.getDb().select().from(t.schema.masterImports).where(eq(t.schema.masterImports.mode, "material-reference:apply"));
    expect(logs).toHaveLength(1);
    expect(results[0].importId).toBe(logs[0].id);
  });

  it("creates a missing material only after explicit unit/package validation, never posting blank or numeric source stock", async () => {
    const input = csv("KIT-991", "Cabe test", "kg", 1, 90000, "12");
    expect((await service.previewMaterialReference(input)).plan.summary.needsValidation).toBe(1);
    expect((await service.applyMaterialReference(input, actor)).materialsCreated).toBe(0);
    const validated = { ...input, confirmations: [{ sourceSku: "KIT-991", canonicalUnit: "gr", packageQty: 1000, costBasis: "package" as const }] };
    const result = await service.applyMaterialReference(validated, actor);
    expect(result.materialsCreated).toBe(1);
    const [material] = await t.getDb().select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, "KIT-991"));
    expect(material).toMatchObject({ unit: "gr", unitCost: 90, packageQty: 1000, purchasePrice: 90000, min: 1000, onHand: 0 });
    const [link] = await t.getDb().select().from(t.schema.masterCrosswalk)
      .where(and(eq(t.schema.masterCrosswalk.kind, "material_reference"), eq(t.schema.masterCrosswalk.sourceKey, "KIT-991")));
    expect(link.targetSku).toBe("KIT-991");
    expect(link.validated).toBe(true);
    expect(await t.getDb().select().from(t.schema.wmsStockMovement)).toHaveLength(0);
    const [audit] = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Impor referensi bahan CSV"));
    expect(audit.metadata.noStockPosting).toBe(true);
  });

  it("serializes concurrent first-time validated imports without duplicate material or opening stock", async () => {
    const input = { ...csv("KIT-992", "Bahan test concurrency", "gr", 200, 10000),
      confirmations: [{ sourceSku: "KIT-992", canonicalUnit: "gr", packageQty: 500, costBasis: "package" as const }] };
    const results = await Promise.all([service.applyMaterialReference(input, actor), service.applyMaterialReference(input, actor)]);
    expect(results.reduce((sum, r) => sum + (r.materialsCreated ?? 0), 0)).toBe(1);
    expect(results.filter((r) => r.alreadyApplied)).toHaveLength(1);
    expect(await t.getDb().select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, "KIT-992"))).toHaveLength(1);
    expect(await t.getDb().select().from(t.schema.wmsStockMovement)).toHaveLength(0);
  });
});
