import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — Export/Import Excel produk (upsert by SKU + dry-run).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let catBar = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.getWmsProducts(); // trigger seed contoh (BEAN-ARB dll)
  const cats = await svc.listWmsCategories();
  catBar = (cats.find((c: any) => c.area === "bar") ?? cats[0]).name;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function buildBuffer(rows: Array<Record<string, unknown>>, opts?: { withBarcode?: boolean }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produk");
  ws.columns = [
    { header: "SKU", key: "sku" },
    { header: "Nama", key: "name" },
    { header: "Kategori", key: "category" },
    { header: "Satuan", key: "unit" },
    { header: "Min Stok", key: "minStock" },
    { header: "HPP", key: "hpp" },
    ...(opts?.withBarcode === false ? [] : [{ header: "Barcode", key: "barcode" }]),
  ];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("WMS export/import Excel", () => {
  it("export menghasilkan workbook berisi produk", async () => {
    const buf = await svc.exportWmsProductsWorkbook();
    expect(buf.length).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.rowCount).toBeGreaterThan(1); // header + data
  });

  it("dry-run menghitung created/updated/skipped tanpa menulis", async () => {
    const buf = await buildBuffer([
      { sku: "BEAN-ARB", name: "Kopi Arabika EDIT", category: catBar, unit: "gram", minStock: 2500, hpp: 0.13 },
      { sku: "NEW-XYZ", name: "Bahan Baru", category: catBar, unit: "pcs", minStock: 10, hpp: 500 },
      { sku: "BAD-ROW", name: "", category: "", unit: "pcs" }, // baru tanpa nama/kategori → skip
    ]);
    const res = await svc.importWmsProductsFromBuffer(buf, { dryRun: true });
    expect(res.updated).toBe(1);
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors.length).toBe(1);

    // Tidak menulis: BEAN-ARB nama belum berubah, NEW-XYZ belum ada.
    const prods = await svc.getWmsProducts();
    expect(prods.find((p: any) => p.sku === "BEAN-ARB").name).toBe("Kopi Arabika");
    expect(prods.some((p: any) => p.sku === "NEW-XYZ")).toBe(false);
  });

  it("import nyata: upsert by SKU (update + create)", async () => {
    const buf = await buildBuffer([
      { sku: "BEAN-ARB", name: "Kopi Arabika EDIT", category: catBar, unit: "gram", minStock: 2500, hpp: 0.13, barcode: "899123" },
      { sku: "NEW-XYZ", name: "Bahan Baru", category: catBar, unit: "pcs", minStock: 10, hpp: 500 },
    ]);
    const res = await svc.importWmsProductsFromBuffer(buf, { dryRun: false });
    expect(res.created).toBe(1);
    expect(res.updated).toBe(1);

    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    expect(bean.name).toBe("Kopi Arabika EDIT");
    expect(bean.barcode).toBe("899123");
    const neu = prods.find((p: any) => p.sku === "NEW-XYZ");
    expect(neu).toBeTruthy();
    expect(neu.onHand).toBe(0); // import tak mengubah stok
  });

  it("barcode lama tidak terhapus bila kolom Barcode tidak ada / kosong", async () => {
    const buf = await buildBuffer([{ sku: "BEAN-ARB", name: "Kopi Arabika EDIT 2", category: catBar, unit: "gram" }], { withBarcode: false });
    const res = await svc.importWmsProductsFromBuffer(buf, { dryRun: false });
    expect(res.updated).toBe(1);
    const bean = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    expect(bean.name).toBe("Kopi Arabika EDIT 2");
    expect(bean.barcode).toBe("899123");
    // Tanpa perubahan → "tidak berubah", tidak ditulis ulang.
    const again = await svc.importWmsProductsFromBuffer(buf, { dryRun: true });
    expect(again.unchanged).toBe(1);
    expect(again.updated).toBe(0);
  });

  it("validasi per baris: SKU ganda, kategori tak dikenal, angka salah, barcode bentrok", async () => {
    const buf = await buildBuffer([
      { sku: "IMP-1", name: "Bahan Satu", category: catBar, unit: "ml", hpp: 10 },
      { sku: "imp-1", name: "Bahan Satu Lagi", category: catBar, unit: "ml" },
      { sku: "IMP-2", name: "Bahan Dua", category: "Kategori Fiktif", unit: "ml" },
      { sku: "IMP-3", name: "Bahan Tiga", category: catBar, unit: "ml", hpp: "sepuluh" },
      { sku: "IMP-4", name: "Bahan Empat", category: catBar, unit: "ml", minStock: -5 },
      { sku: "IMP-5", name: "Bahan Lima", category: catBar, unit: "ml", barcode: "899123" },
      { sku: "bad sku!", name: "x", category: catBar },
    ]);
    const res = await svc.importWmsProductsFromBuffer(buf, { dryRun: false });
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(6);
    const messages = res.rows.filter((r: any) => r.action === "error").map((r: any) => `${r.row}:${r.message}`);
    expect(messages[0]).toMatch(/^3:SKU ganda dalam file \(sudah ada di baris 2\)/);
    expect(messages[1]).toMatch(/^4:Kategori "Kategori Fiktif" belum ada/);
    expect(messages[2]).toMatch(/^5:HPP "sepuluh"/);
    expect(messages[3]).toMatch(/^6:Min Stok/);
    expect(messages[4]).toMatch(/^7:Barcode 899123 sudah dipakai bahan BEAN-ARB/);
    expect(messages[5]).toMatch(/^8:SKU hanya boleh/);
    const prods = await svc.getWmsProducts();
    expect(prods.filter((p: any) => p.sku.toLowerCase() === "imp-1")).toHaveLength(1);
    expect(prods.some((p: any) => p.sku === "IMP-2" || p.sku === "IMP-3")).toBe(false);
  });

  it("CSV (titik koma, angka format Indonesia) + template bisa dibaca ulang", async () => {
    const csv = `\uFEFFSKU;Nama;Kategori;Satuan;Min Stok;HPP\r\nCSV-1;"Gula; Aren";${catBar};gr;1.500;0,25\r\n`;
    const res = await svc.importWmsProductsFromBuffer(Buffer.from(csv, "utf8"), { dryRun: false, filename: "bahan.csv", actorName: "Tes" });
    expect(res.created).toBe(1);
    const prod = (await svc.getWmsProducts()).find((p: any) => p.sku === "CSV-1");
    expect(prod.name).toBe("Gula; Aren");
    expect(Number(prod.minStock)).toBe(1500);
    expect(Number(prod.hpp)).toBeCloseTo(0.25, 4);

    for (const format of ["xlsx", "csv"] as const) {
      const template = await svc.wmsImportTemplate(format);
      const dry = await svc.importWmsProductsFromBuffer(template, { dryRun: true, filename: `t.${format}` });
      // Baris contoh punya kategori kosong → error yang jelas, bukan crash.
      expect(dry.rows).toHaveLength(1);
      expect(dry.rows[0].action).toBe("error");
    }

    const { like } = await import("drizzle-orm");
    const logs = await t.getDb().select().from(t.schema.auditLogs).where(like(t.schema.auditLogs.action, "Impor massal bahan baku"));
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("file tanpa kolom SKU / format salah ditolak dengan pesan jelas", async () => {
    await expect(svc.importWmsProductsFromBuffer(Buffer.from("Nama,Kategori\nA,B\n"), { dryRun: true, filename: "x.csv" })).rejects.toThrow(/Kolom wajib tidak ditemukan: SKU/);
    await expect(svc.importWmsProductsFromBuffer(Buffer.from("abc"), { dryRun: true, filename: "x.pdf" })).rejects.toThrow(/\.xlsx atau \.csv/);
    await expect(svc.importWmsProductsFromBuffer(Buffer.from("not a zip"), { dryRun: true, filename: "x.xlsx" })).rejects.toThrow(/rusak/);
  });
});
