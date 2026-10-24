import fs from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Migrasi 0158 "resep usulan": bahan Dapur/retail insert-only + resep DRAFT untuk
// menu tanpa resep; daftar draft per varian; Setujui (produk jadi pakai harga modal);
// simpan form produk tidak menghapus draft; stok awal dari form produk.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let mi: any;
let svc: any;
let wms: any;
let outletId = "";
const actor = { id: "user-itest", name: "Owner Test" };
const owner = (): GarageSession =>
  ({
    user: { id: "user-itest", name: "Owner Test", email: "user-itest@garage.id" },
    profile: {
      id: "sp-user-itest",
      role: "Owner" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

const migration = fs.readFileSync("./drizzle/0158_recipe_proposals.sql", "utf8");
const runMigration = () => (t.getPgPool() as any).exec(migration);
const q = async (sql: string) => (await (t.getPgPool() as any).query(sql)).rows as any[];

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t));
  mi = await import("@/lib/master-import");
  svc = await import("@/lib/garage-service");
  wms = await import("@/lib/wms-service");
  const db = t.getDb();
  // Menu POS yang dirujuk resep usulan (sebagian; sisanya harus dilewati diam-diam).
  await db.insert(t.schema.menuItems).values([
    { id: "makanan-nasi", name: "Nasi", category: "Makanan", section: "Nasi", prep: "2m" },
    { id: "makanan-indomie-kuah", name: "Indomie Kuah", category: "Makanan", section: "Indomie", prep: "8m" },
    { id: "bar-tea-pahit", name: "Tea Pahit", category: "Non-Coffee", section: "Tea Series", prep: "4m" },
    { id: "rokok-la-purple", name: "LA Purple", category: "Rokok", section: "Rokok", prep: "0m", productType: "retail", showInDigitalMenu: false },
    { id: "cemilan-nugget", name: "Nugget", category: "Cemilan", section: "Cemilan", prep: "6m" },
  ]).onConflictDoNothing();
  await db.insert(t.schema.menuVariants).values([
    { itemId: "makanan-nasi", variantId: "regular", label: "Regular", price: 5_000 },
    { itemId: "makanan-indomie-kuah", variantId: "regular", label: "Regular", price: 12_000 },
    { itemId: "bar-tea-pahit", variantId: "cold", label: "Cold", price: 8_000 },
    { itemId: "bar-tea-pahit", variantId: "hot", label: "Hot", price: 8_000 },
    { itemId: "rokok-la-purple", variantId: "regular", label: "Regular", price: 37_000 },
    { itemId: "cemilan-nugget", variantId: "regular", label: "Regular", price: 12_000 },
  ]).onConflictDoNothing();
  // Bahan bar yang dirujuk Tea Pahit (biang teh + es/cup/sedotan).
  for (const [sku, name, unit, cost] of [
    ["BAR-035", "Biang Teh Prendjak", "ml", 3],
    ["BAR-032", "Es Batu", "cup", 400],
    ["BAR-031", "Cup", "pcs", 440],
    ["BAR-030", "Sedotan", "pcs", 200],
  ] as const) {
    await db.insert(t.schema.inventoryItems).values({ sku, name, alternativeName: name, category: "Bar", usageArea: "bar", unit, packageSize: `1 ${unit}`, unitCost: cost, onHand: 0, min: 0, status: "safe", movement: "" }).onConflictDoNothing();
    await db.insert(t.schema.wmsProduct).values({ sku, name, category: "Bar", unit, hpp: cost }).onConflictDoNothing();
  }
  // Seolah Impor Master Excel sudah jalan: KIT-016 garam per "bks" (tanpa berat bersih).
  await db.insert(t.schema.inventoryItems).values({ sku: "KIT-016", name: "garam", alternativeName: "-", category: "Dapur · Bahan Baku", usageArea: "dapur", unit: "bks", packageSize: "kemasan 1 bks", unitCost: 12_000, onHand: 0, min: 0, status: "safe", movement: "" });
  await db.insert(t.schema.wmsProduct).values({ sku: "KIT-016", name: "garam", category: "Dapur · Bahan Baku", unit: "bks", hpp: 12_000 });
  // Nugget sudah punya resep aktif → usulan dilewati.
  await db.insert(t.schema.inventoryItems).values({ sku: "T-NUGGET", name: "Nugget Lama", alternativeName: "-", category: "Dapur", usageArea: "dapur", unit: "gr", packageSize: "1 gr", unitCost: 40, onHand: 0, min: 0, status: "safe", movement: "" });
  await db.insert(t.schema.menuRecipes).values({ menuItemId: "cemilan-nugget", variantId: "all", inventorySku: "T-NUGGET", qty: 100, unit: "gr", status: "active" });
  await runMigration();
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("migrasi 0158 resep usulan", () => {
  it("bahan Dapur/retail masuk (OS + WMS + kemasan); satuan bks belum tervalidasi → gr", async () => {
    const [kit] = await q(`select i.unit, i.package_qty, i.unit_cost, w.unit wu, w.hpp from inventory_items i join wms_product w on w.sku=i.sku where i.sku='KIT-028'`);
    expect(kit).toMatchObject({ unit: "pcs", wu: "pcs" });
    expect(Number(kit.package_qty)).toBe(10);
    expect(Number(kit.unit_cost)).toBe(2900);
    const [garam] = await q(`select i.unit, i.unit_cost, w.unit wu from inventory_items i join wms_product w on w.sku=i.sku where i.sku='KIT-016'`);
    expect(garam).toMatchObject({ unit: "gr", wu: "gr" });
    expect(Number(garam.unit_cost)).toBe(12);
    const uoms = await q(`select u.uom, u.factor from wms_product_uom u join wms_product w on w.id=u.product_id where w.sku in ('KIT-025','RTL-004') order by w.sku`);
    expect(uoms.map((u) => [u.uom, Number(u.factor)])).toEqual([["karung", 10_000], ["slop", 10]]);
    const [rtl] = await q(`select unit, unit_cost from inventory_items where sku='RTL-004'`);
    expect(rtl).toMatchObject({ unit: "bks" });
    expect(Number(rtl.unit_cost)).toBe(0);
  });

  it("resep DRAFT hanya untuk menu yang ada & belum punya resep; idempoten", async () => {
    const drafts = await q(`select menu_item_id, variant_id, inventory_sku, qty, unit from menu_recipes where status='draft' order by 1,2,3`);
    const menus = [...new Set(drafts.map((d) => d.menu_item_id))];
    // Menu dari migrasi lain (Mineral, Rokok, Choco Kiss, Dark Charm) juga ikut; Nugget (sudah ber-resep) & menu yang tidak ada dilewati.
    expect(menus).toEqual(expect.arrayContaining(["bar-tea-pahit", "makanan-indomie-kuah", "makanan-nasi", "rokok-la-purple", "minuman-mineral"]));
    expect(menus).not.toContain("cemilan-nugget");
    expect(drafts.find((d) => d.menu_item_id === "makanan-nasi")).toMatchObject({ inventory_sku: "KIT-025", qty: 70, unit: "gr" });
    expect(drafts.filter((d) => d.menu_item_id === "bar-tea-pahit").map((d) => `${d.variant_id}:${d.inventory_sku}`)).toEqual([
      "cold:BAR-030", "cold:BAR-031", "cold:BAR-032", "cold:BAR-035", "hot:BAR-030", "hot:BAR-031", "hot:BAR-035",
    ]);
    const active = await q(`select count(*)::int n from menu_recipes where menu_item_id='cemilan-nugget' and status <> 'active'`);
    expect(active[0].n).toBe(0);
    await runMigration();
    const again = await q(`select count(*)::int n from menu_recipes where status='draft'`);
    expect(again[0].n).toBe(drafts.length);
    const kits = await q(`select count(*)::int n from wms_product where sku like 'KIT-%' or sku like 'RTL-%'`);
    expect(kits[0].n).toBe(57);
  });

  it("daftar draft dirinci per varian (HPP = baris semua varian + baris varian)", async () => {
    const list = await mi.listDraftRecipes();
    const tea = list.find((d: any) => d.menuItemId === "bar-tea-pahit");
    expect(tea.variants).toEqual([
      expect.objectContaining({ variantId: "cold", hpp: 150 * 3 + 400 + 440 + 200, foodCostPct: Math.round(((450 + 1040) / 8000) * 100) }),
      expect.objectContaining({ variantId: "hot", hpp: 150 * 3 + 440 + 200 }),
    ]);
    const rokok = list.find((d: any) => d.menuItemId === "rokok-la-purple");
    expect(rokok.problems).toBe(1);
    expect(rokok.lines[0]).toMatchObject({ sku: "RTL-004", problem: "no_cost" });
  });

  it("Setujui: alasan jelas bila harga beli 0; produk jadi memakai harga modal varian", async () => {
    await expect(mi.approveDraftRecipe("rokok-la-purple", actor)).rejects.toThrow(/Rokok LA Purple: harga beli bahan masih 0/);
    await q(`update menu_variants set base_cost = 31000 where item_id='rokok-la-purple'`);
    await mi.approveDraftRecipe("rokok-la-purple", actor);
    const [rtl] = await q(`select unit_cost, purchase_price from inventory_items where sku='RTL-004'`);
    expect(Number(rtl.unit_cost)).toBe(31_000);
    expect(Number(rtl.purchase_price)).toBe(310_000);
    const [variant] = await q(`select base_cost from menu_variants where item_id='rokok-la-purple'`);
    expect(Number(variant.base_cost)).toBe(31_000);
    const [line] = await q(`select status from menu_recipes where menu_item_id='rokok-la-purple'`);
    expect(line.status).toBe("active");
  });
});

describe("form produk & stok bahan", () => {
  it("simpan produk tanpa resep tidak menghapus draft; resep dari form menggantikan draft", async () => {
    await svc.updateMenuProduct("makanan-nasi", { name: "Nasi", recipes: [] }, owner());
    expect((await q(`select count(*)::int n from menu_recipes where menu_item_id='makanan-nasi' and status='draft'`))[0].n).toBe(1);
    await svc.updateMenuProduct("makanan-nasi", { recipes: [{ variantId: "all", inventorySku: "KIT-025", qty: 80, unit: "gr", wastePct: 0 }] }, owner());
    const rows = await q(`select status, qty from menu_recipes where menu_item_id='makanan-nasi'`);
    expect(rows).toEqual([{ status: "active", qty: 80 }]);
    const [variant] = await q(`select base_cost from menu_variants where item_id='makanan-nasi'`);
    expect(Number(variant.base_cost)).toBe(Math.round(80 * 15.5));
  });

  it("menu daftar produk membawa resep draft terpisah dari resep aktif", async () => {
    const menu = await svc.getMenuData({ includeArchived: true, includeCosting: true });
    const kuah = menu.find((m: any) => m.id === "makanan-indomie-kuah");
    expect(kuah.recipes).toEqual([]);
    expect(kuah.draftRecipes.map((r: any) => r.inventorySku)).toContain("KIT-028");
  });

  it("stok awal dari form produk masuk gudang utama area bahan, HPP rata-rata tetap", async () => {
    await expect(wms.recordOpeningStock({ sku: "KIT-025", qty: 0 })).rejects.toThrow(/lebih dari 0/);
    const res = await wms.recordOpeningStock({ sku: "KIT-025", qty: 20_000 });
    const [stock] = await q(`select s.qty, w.hpp, wh.type, wh.area from wms_warehouse_stock s join wms_product w on w.id=s.product_id join wms_warehouse wh on wh.id=s.warehouse_id where w.sku='KIT-025'`);
    expect(Number(stock.qty)).toBe(20_000);
    expect(Number(stock.hpp)).toBe(15.5);
    expect(stock).toMatchObject({ type: "main", area: "dapur" });
    expect(res.warehouseId).toBeTruthy();
    const [mv] = await q(`select ref_doc from wms_stock_movement m join wms_product w on w.id=m.product_id where w.sku='KIT-025'`);
    expect(mv.ref_doc).toBe("STOK-AWAL");
  });
});
