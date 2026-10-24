import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Kemasan bertingkat (ERPNext UOM Conversion): stok & HPP tetap per satuan dasar
// (ml), kemasan (kotak/botol/dus) hanya untuk input & tampilan. Biang Teh 1 kotak =
// 1000 ml, Es Teh 250 ml → 4 porsi per kotak; PO per kotak disimpan per ml.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let uom: any;
let po: any;
let teaId = "";
let plainId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  uom = await import("@/lib/wms-uom");
  po = await import("@/lib/wms-purchase");
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · UOM Test", area: "bar" }).onConflictDoNothing();
  teaId = (await wms.createWmsProduct({ sku: "T-UOM-TEH", name: "Biang Teh Test", category: "Bar · UOM Test", unit: "ml", packPrice: 3000, packQty: 1000, packName: "kotak" })).id;
  plainId = (await wms.createWmsProduct({ sku: "T-UOM-PLAIN", name: "Gula Test", category: "Bar · UOM Test", unit: "gr", packPrice: 0, packQty: 1 })).id;
  await t.getDb().insert(t.schema.menuItems).values({ id: "itm-uom-esteh", name: "Es Teh UOM", category: "Non Coffee", section: "Non Coffee", prep: "1m", showInDigitalMenu: true });
  await t.getDb().insert(t.schema.menuVariants).values({ itemId: "itm-uom-esteh", variantId: "reg", label: "Regular", price: 10_000 });
  await t.getDb().insert(t.schema.menuRecipes).values({ menuItemId: "itm-uom-esteh", variantId: "all", inventorySku: "T-UOM-TEH", qty: 250, unit: "ml", wastePct: 0 });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("kemasan bahan", () => {
  it("default dari katalog: kotak 1000 ml; bahan tanpa kemasan → kosong", async () => {
    const map = await uom.loadProductUoms([teaId, plainId]);
    expect(map.get(teaId)).toEqual([{ uom: "kotak", factor: 1000, isPurchase: true, isCount: true }]);
    expect(map.has(plainId)).toBe(false);
    const listed = await uom.listProductUoms(teaId);
    expect(listed.stored).toBe(false);
  });

  it("hasil porsi: Es Teh 250 ml → 1 kotak ≈ 4 porsi", async () => {
    const rows = await uom.getPortionYield(teaId);
    expect(rows).toEqual([expect.objectContaining({ menu: "Es Teh UOM", perPortion: 250, pack: "kotak", portions: 4 })]);
  });

  it("simpan kemasan: validasi + satu default beli & hitung", async () => {
    await expect(uom.saveProductUoms(teaId, [{ uom: "ml", factor: 10 }])).rejects.toThrow(/satuan dasar/);
    await expect(uom.saveProductUoms(teaId, [{ uom: "kotak", factor: 1 }])).rejects.toThrow(/lebih dari 1/);
    await expect(uom.saveProductUoms(teaId, [{ uom: "kotak", factor: 1000 }, { uom: "Kotak", factor: 500 }])).rejects.toThrow(/ganda/);
    await expect(uom.saveProductUoms(teaId, [{ uom: "kotak1", factor: 1000 }])).rejects.toThrow(/tidak valid/);
    const saved = await uom.saveProductUoms(teaId, [
      { uom: "Karton", factor: 12_000, isPurchase: true, isCount: false },
      { uom: "kotak", factor: 1000, isPurchase: true, isCount: true },
    ]);
    expect(saved).toEqual(
      expect.arrayContaining([
        { uom: "karton", factor: 12_000, isPurchase: true, isCount: false },
        { uom: "kotak", factor: 1000, isPurchase: false, isCount: true },
      ]),
    );
    expect((await uom.listProductUoms(teaId)).stored).toBe(true);
    // Produk WMS membawa kemasan tersimpan.
    const products = await wms.getWmsProducts();
    expect(products.find((p: any) => p.id === teaId).uoms).toHaveLength(2);
    // Kosongkan → kembali ke default katalog.
    expect(await uom.saveProductUoms(teaId, [])).toEqual([{ uom: "kotak", factor: 1000, isPurchase: true, isCount: true }]);
  });

  it("PO per kotak disimpan per ml + snapshot kemasan", async () => {
    const supplier = await wms.createWmsSupplier({ name: "Supplier UOM Test" });
    // 4 kotak @ Rp45.000 → 4000 ml @ Rp45/ml.
    const created = await po.createPurchaseOrder({ supplierId: supplier.id, items: [{ productId: teaId, orderedQty: 4 * 1000, unitPrice: 45_000 / 1000, uom: "kotak", uomFactor: 1000 }] });
    const detail = await po.getPurchaseOrder(created.id);
    expect(detail.items[0]).toMatchObject({ orderedQty: 4000, unitPrice: 45, uom: "kotak", uomFactor: 1000 });
    // Kemasan 1 (satuan dasar) tidak disimpan sebagai snapshot.
    const base = await po.createPurchaseOrder({ supplierId: supplier.id, items: [{ productId: plainId, orderedQty: 500, unitPrice: 20, uom: "gr", uomFactor: 1 }] });
    expect((await po.getPurchaseOrder(base.id)).items[0]).toMatchObject({ uom: null, uomFactor: null });
  });
});

describe("migrasi 0157", () => {
  it("backfill idempoten: Biang Teh kotak 1000 ml, Fresh Milk dus beli + botol 946 hitung", async () => {
    const fs = await import("node:fs");
    const db = t.getDb();
    const { eq, inArray } = await import("drizzle-orm");
    await db
      .insert(t.schema.inventoryItems)
      .values([
        { sku: "BAR-035", name: "Biang Teh Prendjak", alternativeName: "seduhan", category: "Bar", unit: "ml", packageSize: "1 ml", packageQty: 1, onHand: 0, min: 0, status: "safe", movement: "", unitCost: 3, purchasePrice: 0 },
        { sku: "BAR-018", name: "Fresh Milk", alternativeName: "susu", category: "Bar", unit: "ml", packageSize: "dus 24 x 946 ml", packageQty: 22_704, onHand: 0, min: 0, status: "safe", movement: "", unitCost: 1, purchasePrice: 22_704 },
      ] as any)
      .onConflictDoNothing();
    await db.insert(t.schema.wmsProduct).values([
      { sku: "BAR-035", name: "Biang Teh Prendjak", category: "Bar · UOM Test", unit: "ml" },
      { sku: "BAR-018", name: "Fresh Milk", category: "Bar · UOM Test", unit: "ml" },
    ]).onConflictDoNothing();
    const sql = fs.readFileSync("./drizzle/0157_wms_product_uom.sql", "utf8");
    const dataStatements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => /^(--.*\n)*\s*(UPDATE|INSERT)/i.test(s));
    expect(dataStatements.length).toBe(4);
    const client = t.getPgPool() as any;
    for (let run = 0; run < 2; run++) for (const stmt of dataStatements) await client.exec(stmt);

    const [tea] = await db.select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, "BAR-035"));
    expect(Number(tea.packageQty)).toBe(1000);
    expect(tea.packageSize).toBe("kotak 1000 ml");
    expect(Number(tea.purchasePrice)).toBe(3000);

    const prods = await db.select().from(t.schema.wmsProduct).where(inArray(t.schema.wmsProduct.sku, ["BAR-035", "BAR-018"]));
    const idOf = (sku: string) => prods.find((p: any) => p.sku === sku)!.id;
    const map = await uom.loadProductUoms(prods.map((p: any) => p.id));
    expect(map.get(idOf("BAR-035"))).toEqual([{ uom: "kotak", factor: 1000, isPurchase: true, isCount: true }]);
    expect(map.get(idOf("BAR-018"))).toEqual(
      expect.arrayContaining([
        { uom: "dus", factor: 22_704, isPurchase: true, isCount: false },
        { uom: "botol", factor: 946, isPurchase: false, isCount: true },
      ]),
    );
    expect(map.get(idOf("BAR-018"))).toHaveLength(2);
  });
});
