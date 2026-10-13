import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Impor massal produk menu (CSV/XLSX): pratinjau, validasi per baris, tanpa
// duplikasi, varian digabung, HPP dari resep (bukan dari file), satu transaksi.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let mod: typeof import("@/lib/menu-import");
let outletId = "";
const USER = "user-menu-import";

function owner(): GarageSession {
  return {
    user: { id: USER, name: "Owner Test" },
    profile: {
      id: "sp",
      role: "Owner",
      shiftLabel: "Pagi",
      deviceLabel: "Laptop",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function xlsx(rows: string[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produk");
  ws.addRow(["SKU", "Nama Produk", "Kategori", "Varian", "Harga", "Station", "Tampil di Menu Digital", "Deskripsi"]);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function variantsOf(itemId: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, itemId));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: USER }));
  mod = await import("@/lib/menu-import");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Impor massal produk menu", () => {
  it("pratinjau tidak menulis; simpan membuat produk + varian, SKU otomatis, HPP dari resep", async () => {
    const file = await xlsx([
      ["", "Es Kopi Aren", "Coffee", "Hot", "22000", "Bar", "Ya", "Kopi gula aren"],
      ["", "Es Kopi Aren", "Coffee", "Cold", "Rp 24.000", "Bar", "Ya", ""],
      ["", "Roti Bakar", "Cemilan", "", "18.000", "", "Tidak", ""],
    ]);
    const preview = await mod.importMenuProducts(file, { dryRun: true, filename: "menu.xlsx" }, owner());
    expect(preview).toMatchObject({ productsCreated: 2, variantsAdded: 3, errorRows: 0 });
    const { eq } = await import("drizzle-orm");
    expect(await t.getDb().select().from(t.schema.menuItems).where(eq(t.schema.menuItems.id, "es-kopi-aren"))).toHaveLength(0);

    const saved = await mod.importMenuProducts(file, { dryRun: false, filename: "menu.xlsx" }, owner());
    expect(saved.productsCreated).toBe(2);
    const [item] = await t.getDb().select().from(t.schema.menuItems).where(eq(t.schema.menuItems.id, "es-kopi-aren"));
    expect(item).toMatchObject({ name: "Es Kopi Aren", category: "Coffee", section: "Bar", station: "bar", showInDigitalMenu: true });
    expect(item.sku).toMatch(/^COF-\d{3}$/);
    const variants = await variantsOf("es-kopi-aren");
    expect(variants.map((v: any) => [v.label, v.price, v.baseCost]).sort()).toEqual([
      ["Cold", 24_000, 0],
      ["Hot", 22_000, 0],
    ]);
    const [roti] = await t.getDb().select().from(t.schema.menuItems).where(eq(t.schema.menuItems.id, "roti-bakar"));
    expect(roti).toMatchObject({ section: "Dapur", showInDigitalMenu: false });
    expect((await variantsOf("roti-bakar"))[0]).toMatchObject({ label: "Regular", price: 18_000 });
  });

  it("impor ulang: tidak membuat produk ganda; harga berubah & varian baru ditambah; varian lama tetap", async () => {
    const file = await xlsx([
      ["", "es kopi aren", "Coffee", "Hot", "23000", "", "", ""],
      ["", "Es Kopi Aren", "Coffee", "Large", "28000", "", "", ""],
      ["", "Roti Bakar", "Cemilan", "Regular", "18000", "", "", ""],
    ]);
    const res = await mod.importMenuProducts(file, { dryRun: false, filename: "menu2.xlsx" }, owner());
    expect(res).toMatchObject({ productsCreated: 0, productsUpdated: 1, productsUnchanged: 1, pricesChanged: 1, variantsAdded: 1 });
    const items = await t.getDb().select().from(t.schema.menuItems);
    expect(items.filter((i: any) => i.name.toLowerCase() === "es kopi aren")).toHaveLength(1);
    const variants = await variantsOf("es-kopi-aren");
    expect(variants.map((v: any) => [v.label, v.price]).sort()).toEqual([
      ["Cold", 24_000],
      ["Hot", 23_000],
      ["Large", 28_000],
    ]);
    expect(res.rows.find((r) => r.row === 2)?.changes?.[0]).toBe("Harga Hot: Rp22.000 → Rp23.000");
  });

  it("validasi per baris & produk: kategori, harga, varian ganda, SKU bentrok, station", async () => {
    const file = await xlsx([
      ["", "Teh Tarik", "Minuman", "", "15000", "", "", ""],
      ["", "Teh Manis", "Non-Coffee", "", "0", "", "", ""],
      ["", "Teh Lemon", "Non-Coffee", "Ice", "15000", "", "", ""],
      ["", "Teh Lemon", "Non-Coffee", "ice", "16000", "", "", ""],
      ["", "Teh Jahe", "Non-Coffee", "", "12500,5", "", "", ""],
      ["", "Teh Hijau", "Non-Coffee", "", "15000", "Gudang", "", ""],
      ["", "Teh Melati", "Non-Coffee", "", "14000", "", "Mungkin", ""],
      ["COF-001", "Produk Lain", "Coffee", "", "20000", "", "", ""],
      ["", "Teh Sereh", "Non-Coffee", "", "13000", "", "", ""],
    ]);
    const res = await mod.importMenuProducts(file, { dryRun: false, filename: "menu3.xlsx" }, owner());
    const err = (row: number) => res.rows.find((r) => r.row === row);
    expect(err(2)?.message).toMatch(/Kategori "Minuman" tidak dikenal/);
    expect(err(3)?.message).toMatch(/Harga "0"/);
    expect(err(4)?.message).toMatch(/muncul lebih dari sekali/);
    expect(err(5)?.action).toBe("error");
    expect(err(6)?.message).toMatch(/Harga "12500,5"/);
    expect(err(7)?.message).toMatch(/Station "Gudang"/);
    expect(err(8)?.message).toMatch(/Ya\/Tidak/);
    // COF-001 sudah dipakai Es Kopi Aren → cocok ke produk itu, tapi nama beda → ditolak.
    expect(err(9)?.message).toMatch(/SKU COF-001 sudah dipakai produk "Es Kopi Aren"/);
    expect(err(10)?.action).toBe("create");
    expect(res.productsCreated).toBe(1);
    expect(res.productsUpdated).toBe(0);
    expect(res.errorRows).toBe(8);
    // Es Kopi Aren tidak tersentuh oleh baris SKU bentrok.
    expect((await variantsOf("es-kopi-aren")).map((v: any) => v.label).sort()).toEqual(["Cold", "Hot", "Large"]);
  });

  it("CSV + template; kolom wajib hilang ditolak; jejak audit tercatat", async () => {
    const csv = "Nama Produk,Kategori,Harga\r\n\"Kopi, Susu\",Coffee,\"21.000\"\r\n";
    const res = await mod.importMenuProducts(Buffer.from(csv, "utf8"), { dryRun: false, filename: "menu.csv" }, owner());
    expect(res.productsCreated).toBe(1);
    const { eq, like } = await import("drizzle-orm");
    const [item] = await t.getDb().select().from(t.schema.menuItems).where(eq(t.schema.menuItems.name, "Kopi, Susu"));
    expect(item).toBeTruthy();

    await expect(mod.importMenuProducts(Buffer.from("Nama Produk,Harga\r\nA,1\r\n"), { dryRun: true, filename: "x.csv" }, owner())).rejects.toThrow(/Kategori/);

    for (const format of ["xlsx", "csv"] as const) {
      const template = await mod.menuImportTemplate(format);
      const dry = await mod.importMenuProducts(template, { dryRun: true, filename: `t.${format}` }, owner());
      expect(dry.errorRows).toBe(0);
      expect(dry.productsCreated).toBe(1);
    }
    const logs = await t.getDb().select().from(t.schema.auditLogs).where(like(t.schema.auditLogs.action, "Impor massal produk menu"));
    expect(logs.length).toBe(4);
  });
});
