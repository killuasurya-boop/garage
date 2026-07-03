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

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.getWmsProducts(); // trigger seed contoh (BEAN-ARB dll)
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function buildBuffer(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produk");
  ws.columns = [
    { header: "SKU", key: "sku" },
    { header: "Nama", key: "name" },
    { header: "Kategori", key: "category" },
    { header: "Satuan", key: "unit" },
    { header: "Min Stok", key: "minStock" },
    { header: "HPP", key: "hpp" },
    { header: "Barcode", key: "barcode" },
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
      { sku: "BEAN-ARB", name: "Kopi Arabika EDIT", category: "Bahan Bar", unit: "gram", minStock: 2500, hpp: 0.13 },
      { sku: "NEW-XYZ", name: "Bahan Baru", category: "Umum", unit: "pcs", minStock: 10, hpp: 500 },
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
      { sku: "BEAN-ARB", name: "Kopi Arabika EDIT", category: "Bahan Bar", unit: "gram", minStock: 2500, hpp: 0.13, barcode: "899123" },
      { sku: "NEW-XYZ", name: "Bahan Baru", category: "Umum", unit: "pcs", minStock: 10, hpp: 500 },
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
});
