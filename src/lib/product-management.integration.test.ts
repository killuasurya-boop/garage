import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// MANAJEMEN PRODUK — kategori dinamis (tambah/edit/arsip/pindah), produk retail
// (rokok/mineral) dengan SKU/barcode unik & harga modal, KPI katalog dari DB,
// aksi massal ber-audit, dan ekspor XLSX/PDF berisi seluruh baris sesuai filter.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let pm: typeof import("@/lib/product-management");
let reports: typeof import("@/lib/reports/products");
let engine: typeof import("@/lib/report-engine");
let outletId = "";

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

async function auditActions(action: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, action));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t));
  svc = await import("@/lib/garage-service");
  pm = await import("@/lib/product-management");
  reports = await import("@/lib/reports/products");
  engine = await import("@/lib/report-engine");
}, 60_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("kategori dinamis", () => {
  it("menautkan produk lama ke kategori bawaan migrasi (tanpa duplikat)", async () => {
    const categories = await pm.listProductCategories();
    const names = categories.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Makanan", "Cemilan", "Coffee", "Non-Coffee", "Minuman Botol", "Rokok"]));
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    const coffee = categories.find((c) => c.name === "Coffee")!;
    expect(coffee.activeProducts).toBe(1);
    expect(coffee.station).toBe("bar");
  });

  it("tambah kategori baru, tolak nama duplikat (case-insensitive)", async () => {
    const tea = await pm.createProductCategory({ name: "Tea", kind: "fnb", station: "bar", posGroup: "Bar", skuPrefix: "tea" }, owner());
    expect(tea.skuPrefix).toBe("TEA");
    await expect(pm.createProductCategory({ name: "tea" }, owner())).rejects.toThrow(/sudah ada/);
    expect((await auditActions("Product category created")).length).toBeGreaterThan(0);
  });

  it("produk baru di kategori baru: SKU dari prefix, station & grup POS dari kategori", async () => {
    const product = await svc.createMenuProduct(
      { name: "Lemon Tea", category: "Tea", variants: [{ label: "Regular", price: 15_000 }] },
      owner(),
    );
    expect(product.sku).toBe("TEA-001");
    expect(product.station).toBe("bar");
    expect(product.menuGroup).toBe("Bar");
    expect(product.productType).toBe("menu");
    await expect(
      svc.createMenuProduct({ name: "Teh Gaib", category: "Kategori Tidak Ada", variants: [{ label: "R", price: 1000 }] }, owner()),
    ).rejects.toThrow(/belum terdaftar/);
  });

  it("rename kategori ikut mengganti nama tampilan produk", async () => {
    const [tea] = (await pm.listProductCategories()).filter((c) => c.name === "Tea");
    await pm.updateProductCategory(tea.id, { name: "Tea Series" }, owner());
    const [row] = await svc.getMenuData({ q: "lemon-tea", includeArchived: true });
    expect(row.category).toBe("Tea Series");
  });

  it("arsip kategori yang masih dipakai wajib pindah produk dulu", async () => {
    const [tea] = (await pm.listProductCategories()).filter((c) => c.name === "Tea Series");
    const [nonCoffee] = (await pm.listProductCategories()).filter((c) => c.name === "Non-Coffee");
    await expect(pm.archiveProductCategory(tea.id, {}, owner())).rejects.toThrow(/Pilih kategori tujuan/);
    const archived = await pm.archiveProductCategory(tea.id, { moveToCategoryId: nonCoffee.id, reason: "gabung" }, owner());
    expect(archived.status).toBe("archived");
    const [row] = await svc.getMenuData({ q: "lemon-tea", includeArchived: true });
    expect(row.category).toBe("Non-Coffee");
    // Kategori arsip tidak bisa dipilih produk baru, tapi bisa dipulihkan.
    await expect(
      svc.createMenuProduct({ name: "Peach Tea", category: "Tea Series", variants: [{ label: "R", price: 1000 }] }, owner()),
    ).rejects.toThrow(/diarsipkan/);
    const restored = await pm.updateProductCategory(tea.id, { status: "active" }, owner());
    expect(restored.status).toBe("active");
  });
});

describe("produk retail (rokok & mineral)", () => {
  it("rokok: varian bungkus/batang dengan SKU, barcode, satuan jual & harga modal", async () => {
    const product = await svc.createMenuProduct(
      {
        name: "Rokok Uji",
        category: "Rokok",
        brand: "Djarum",
        variants: [
          { id: "bungkus", label: "Bungkus", price: 25_000, baseCost: 22_000, sku: "RKK-UJI-BKS", barcode: "8991234567890", sellUnit: "bungkus", unitContents: 16 },
          { id: "batang", label: "Batang", price: 2_000, baseCost: 1_375, sku: "RKK-UJI-BTG", sellUnit: "batang", unitContents: 1 },
        ],
      },
      owner(),
    );
    expect(product.productType).toBe("retail");
    expect(product.station).toBe("none");
    expect(product.menuGroup).toBe("Lainnya");
    expect(product.variants.map((v: any) => v.unitContents)).toEqual([16, 1]);
  });

  it("barcode & SKU varian unik lintas produk", async () => {
    await expect(
      svc.createMenuProduct(
        { name: "Rokok Kembar", category: "Rokok", variants: [{ label: "Bungkus", price: 25_000, barcode: "8991234567890" }] },
        owner(),
      ),
    ).rejects.toThrow(/Barcode "8991234567890" sudah dipakai/);
    await expect(
      svc.createMenuProduct(
        { name: "Rokok Kembar 2", category: "Rokok", variants: [{ label: "Bungkus", price: 25_000, sku: "RKK-UJI-BKS" }] },
        owner(),
      ),
    ).rejects.toThrow(/SKU "RKK-UJI-BKS" sudah dipakai/);
    await expect(
      svc.createMenuProduct(
        { name: "Mineral Nol", category: "Minuman Botol", variants: [{ label: "Botol", price: 5_000, unitContents: 0 }] },
        owner(),
      ),
    ).rejects.toThrow(/lebih dari 0/);
  });

  it("edit harga mencatat nilai sebelum & sesudah di audit", async () => {
    await svc.updateMenuProduct(
      "rokok-uji",
      {
        variants: [
          { id: "bungkus", label: "Bungkus", price: 26_000, baseCost: 22_000, sku: "RKK-UJI-BKS", barcode: "8991234567890", sellUnit: "bungkus", unitContents: 16 },
          { id: "batang", label: "Batang", price: 2_000, baseCost: 1_375, sku: "RKK-UJI-BTG", sellUnit: "batang", unitContents: 1 },
        ],
      },
      owner(),
    );
    const rows = await auditActions("Menu product updated");
    const meta = rows.at(-1)!.metadata as any;
    expect(meta.before.variants[0].price).toBe(25_000);
    expect(meta.after.variants[0].price).toBe(26_000);
  });
});

describe("katalog, KPI & aksi massal", () => {
  it("KPI dihitung dari DB dan filter kelengkapan bekerja", async () => {
    const catalog = await pm.getProductCatalog({ status: "all", pageSize: 200 });
    const total = catalog.rows.length;
    expect(catalog.kpis.total).toBe(total);
    expect(catalog.kpis.retail).toBe(catalog.rows.filter((r) => r.productType === "retail").length);
    const rokok = catalog.rows.find((r) => r.id === "rokok-uji")!;
    expect(rokok.hppStatus).toBe("complete");
    // Margin = varian terendah (bungkus: (26.000 − 22.000) ÷ 26.000).
    expect(rokok.marginPct).toBeCloseTo(((26_000 - 22_000) / 26_000) * 100, 0);
    expect(rokok.grossProfitMin).toBe(625);
    // Menu tanpa resep & HPP 0 → HPP belum lengkap, margin tidak dianggap final.
    const kopi = catalog.rows.find((r) => r.id === "itm-coffee")!;
    expect(kopi.hppStatus).toBe("missing");
    expect(kopi.marginPct).toBeNull();
    expect(kopi.issues).toContain("hpp_incomplete");

    const incomplete = await pm.getProductCatalog({ status: "active", hpp: "incomplete", pageSize: 200 });
    expect(incomplete.rows.every((r) => r.hppStatus !== "complete")).toBe(true);
    const search = await pm.getProductCatalog({ q: "8991234567890" });
    expect(search.rows.map((r) => r.id)).toEqual(["rokok-uji"]);
  });

  it("pagination & sort", async () => {
    const page1 = await pm.getProductCatalog({ status: "all", sort: "name", dir: "asc", pageSize: 5, page: 1 });
    expect(page1.rows.length).toBeLessThanOrEqual(5);
    expect(page1.totalPages).toBe(Math.ceil(page1.total / 5));
    const names = page1.rows.map((r) => r.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "id"))).toEqual(names);
  });

  it("aksi massal mengubah status stok & tercatat per produk", async () => {
    const result = await pm.bulkProductAction({ ids: ["itm-coffee", "itm-food"], action: "stock", value: "limited" }, owner());
    expect(result.updated).toBe(2);
    const catalog = await pm.getProductCatalog({ stock: "limited" });
    expect(catalog.rows.map((r) => r.id).sort()).toEqual(["itm-coffee", "itm-food"]);
    expect((await auditActions("Menu product bulk updated")).length).toBe(2);
    await expect(pm.bulkProductAction({ ids: ["itm-coffee"], action: "stock", value: "banyak" }, owner())).rejects.toThrow();
  });
});

describe("ekspor Excel & PDF", () => {
  it("menghasilkan XLSX & PDF valid berisi seluruh baris sesuai filter", async () => {
    const ExcelJS = (await import("exceljs")).default;
    for (const entry of (await import("@/lib/product-catalog-types")).PRODUCT_EXPORT_TYPES) {
      const { doc, rowCount } = await reports.buildProductReport({ type: entry.id, query: { status: "all" }, generatedBy: "Owner Test" });
      expect(doc.generatedBy).toBe("Owner Test");
      const xlsx = await engine.reportToXlsx(doc);
      const pdf = await engine.reportToPdf(doc);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsx as any);
      expect(workbook.getWorksheet("Ringkasan")).toBeTruthy();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    }
    const master = await reports.buildProductReport({ type: "master", query: { status: "all" }, generatedBy: "Owner Test" });
    const all = await pm.getProductCatalog({ status: "all", pageSize: 200 });
    expect(master.rowCount).toBe(all.total);
    const retail = await reports.buildProductReport({ type: "retail", query: { status: "all" }, generatedBy: "Owner Test" });
    expect(retail.doc.tables[0].rows.some((row) => row.sku === "RKK-UJI-BKS")).toBe(true);
  });
});
