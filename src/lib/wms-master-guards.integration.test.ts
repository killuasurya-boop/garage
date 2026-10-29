import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Master Data — pengaman: SKU otomatis unik, HPP dari kemasan, master tidak
// mengubah stok, satuan dasar terkunci, arsip dijaga resep/stok, kategori rename
// & arsip, supplier (WA, alamat, bahan disuplai, riwayat harga), audit log, impor.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let md: any;
let gulaId = ""; // nama "Gula Aren Cair" juga dipakai produk contoh seed → cari by id
const STRICT = { userId: null, name: "Owner Test", strict: true };

async function stockOf(productId: string) {
  const rows = await wms.getWmsProducts({ warehouseId: "all" });
  return Number(rows.find((r: any) => r.id === productId)?.onHand ?? NaN);
}

async function ledgerCount(productId: string) {
  const { eq } = await import("drizzle-orm");
  const rows = await t.getDb().select().from(t.schema.wmsStockMovement).where(eq(t.schema.wmsStockMovement.productId, productId));
  return rows.length;
}

async function auditFor(object: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.object, object));
}

async function xlsx(header: string[], rows: Array<Array<string | number>>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bahan");
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: "user-itest" });
  wms = await import("@/lib/wms-service");
  md = await import("@/lib/wms-master-data");
  await wms.listWmsWarehouses();
  await wms.createWmsCategory({ name: "Kopi", area: "bar" });
  await wms.createWmsCategory({ name: "Susu", area: "bar" });
  await wms.createWmsCategory({ name: "Bumbu", area: "dapur" });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("SKU otomatis & duplikat", () => {
  it("tanpa SKU → prefix kategori berurutan, bahan arsip ikut dihitung", async () => {
    const a = await wms.createWmsProduct({ name: "Kopi Arabika", category: "Kopi", unit: "gram" }, null, undefined, STRICT);
    const b = await wms.createWmsProduct({ name: "Kopi Robusta", category: "Kopi", unit: "gram" }, null, undefined, STRICT);
    expect(a.sku).toBe("KOP-001");
    expect(b.sku).toBe("KOP-002");
    await wms.archiveWmsProduct(b.id);
    const c = await wms.createWmsProduct({ name: "Kopi Liberika", category: "Kopi", unit: "gram" }, null, undefined, STRICT);
    expect(c.sku).toBe("KOP-003"); // tidak memakai ulang KOP-002 yang diarsipkan
  });

  it("simpan bersamaan tetap menghasilkan SKU unik", async () => {
    const made = await Promise.all(
      [1, 2, 3].map((i) => wms.createWmsProduct({ name: `Susu Paralel ${i}`, category: "Susu", unit: "ml" }, null, undefined, STRICT)),
    );
    const skus = made.map((p: any) => p.sku);
    expect(new Set(skus).size).toBe(3);
    expect(skus.every((s: string) => /^SUS-00[1-3]$/.test(s))).toBe(true);
  });

  it("SKU ganda (beda huruf besar) & barcode ganda ditolak dengan pesan jelas", async () => {
    await expect(wms.createWmsProduct({ sku: "kop-001", name: "Dobel", category: "Kopi", unit: "gram" }, null, undefined, STRICT)).rejects.toMatchObject({
      code: "SKU_DUPLICATE",
    });
    await wms.createWmsProduct({ sku: "BC-1", name: "Berkode", category: "Kopi", unit: "pcs", barcode: "8991001" }, null, undefined, STRICT);
    await expect(
      wms.createWmsProduct({ sku: "BC-2", name: "Berkode 2", category: "Kopi", unit: "pcs", barcode: "8991001" }, null, undefined, STRICT),
    ).rejects.toMatchObject({ code: "BARCODE_DUPLICATE" });
  });

  it("mode ketat: kategori tak terdaftar ditolak", async () => {
    await expect(wms.createWmsProduct({ name: "Asing", category: "Tidak Ada", unit: "pcs" }, null, undefined, STRICT)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
  });
});

describe("Satuan & kemasan → HPP per satuan", () => {
  it("contoh Garage: susu 1 karton = 12.000 ml, syrup 1 botol = 760 ml, kopi 1 pack = 1.000 gram", async () => {
    const milk = await wms.createWmsProduct(
      { name: "Susu UHT", category: "Susu", unit: "ml", packName: "karton", packQty: 12_000, packPrice: 222_000 },
      null,
      undefined,
      STRICT,
    );
    const syrup = await wms.createWmsProduct(
      { name: "Syrup Vanilla", category: "Kopi", unit: "ml", packName: "botol", packQty: 760, packPrice: 125_000 },
      null,
      undefined,
      STRICT,
    );
    const beans = await wms.createWmsProduct(
      { name: "Coffee Beans House", category: "Kopi", unit: "gram", packName: "pack", packQty: 1000, packPrice: 180_000 },
      null,
      undefined,
      STRICT,
    );
    expect(Number(milk.hpp)).toBe(18.5);
    expect(Number(syrup.hpp)).toBeCloseTo(164.4737, 4);
    expect(Number(beans.hpp)).toBe(180);
    const row = (await wms.getWmsProducts()).find((p: any) => p.id === milk.id);
    expect(row.packQty).toBe(12_000);
    expect(row.packPrice).toBe(222_000);
    expect(row.area).toBe("bar");
  });
});

describe("Master tidak mengubah stok", () => {
  it("edit nama/min/harga kemasan → stok & ledger tetap", async () => {
    const p = await wms.createWmsProduct(
      { name: "Gula Aren", category: "Kopi", unit: "gram", initialStock: 500, packQty: 1000, packPrice: 30_000 },
      null,
      undefined,
      STRICT,
    );
    gulaId = p.id;
    const ledgerBefore = await ledgerCount(p.id);
    expect(await stockOf(p.id)).toBe(500);
    await wms.updateWmsProduct(p.id, { name: "Gula Aren Cair", minStock: 200, packQty: 1000, packPrice: 36_000, brand: "Aren Jaya" }, undefined, STRICT);
    expect(await stockOf(p.id)).toBe(500);
    expect(await ledgerCount(p.id)).toBe(ledgerBefore);
    const row = (await wms.getWmsProducts()).find((r: any) => r.id === p.id);
    expect(row.hpp).toBe(36);
    expect(row.brand).toBe("Aren Jaya");
  });

  it("audit log mencatat before/after", async () => {
    const p = (await wms.getWmsProducts()).find((r: any) => r.id === gulaId);
    const logs = await auditFor(p.sku);
    const edit = logs.find((l: any) => l.action === "Ubah master bahan");
    expect(edit?.actor).toBe("Owner Test");
    expect(edit?.metadata?.changes?.name).toEqual({ before: "Gula Aren", after: "Gula Aren Cair" });
    expect(edit?.metadata?.changes?.hpp).toEqual({ before: 30, after: 36 });
    expect(logs.some((l: any) => l.action === "Tambah bahan baku")).toBe(true);
  });
});

describe("Satuan dasar terkunci (cegah salah konversi)", () => {
  it("bahan baru tanpa stok/resep boleh ganti satuan", async () => {
    const p = await wms.createWmsProduct({ name: "Bumbu Baru", category: "Bumbu", unit: "pcs" }, null, undefined, STRICT);
    const row = await wms.updateWmsProduct(p.id, { unit: "gram" }, undefined, STRICT);
    expect(row.unit).toBe("gram");
  });

  it("bahan dengan ledger → UNIT_LOCKED, satuan tetap", async () => {
    const p = (await wms.getWmsProducts()).find((r: any) => r.id === gulaId);
    await expect(wms.updateWmsProduct(p.id, { unit: "ml" }, undefined, STRICT)).rejects.toMatchObject({ code: "UNIT_LOCKED" });
    expect((await wms.getWmsProducts()).find((r: any) => r.id === p.id).unit).toBe("gram");
  });

  it("bahan dipakai resep menu (tanpa stok) → UNIT_LOCKED", async () => {
    const p = await wms.createWmsProduct({ sku: "T-RCP", name: "Susu Resep", category: "Susu", unit: "ml" }, null, undefined, STRICT);
    await t.getDb().insert(t.schema.menuRecipes).values({ menuItemId: "itm-coffee", variantId: "all", inventorySku: "T-RCP", qty: 100, unit: "ml" });
    await expect(wms.updateWmsProduct(p.id, { unit: "gram" }, undefined, STRICT)).rejects.toThrow(/dipakai resep menu/);
  });
});

describe("Arsip bahan dijaga", () => {
  it("dipakai resep aktif → PRODUCT_IN_RECIPE", async () => {
    const p = (await wms.getWmsProducts()).find((r: any) => r.sku === "T-RCP");
    await expect(wms.archiveWmsProduct(p.id)).rejects.toMatchObject({ code: "PRODUCT_IN_RECIPE" });
  });

  it("masih ada stok → PRODUCT_HAS_STOCK", async () => {
    const p = (await wms.getWmsProducts()).find((r: any) => r.id === gulaId);
    await expect(wms.archiveWmsProduct(p.id)).rejects.toMatchObject({ code: "PRODUCT_HAS_STOCK" });
  });

  it("bahan bersih → terarsip, bisa dipulihkan; tidak ada hapus permanen", async () => {
    const p = await wms.createWmsProduct({ name: "Bumbu Arsip", category: "Bumbu", unit: "gram" }, null, undefined, STRICT);
    await wms.archiveWmsProduct(p.id, STRICT);
    expect((await wms.getWmsProducts()).some((r: any) => r.id === p.id)).toBe(false);
    expect((await wms.getWmsProducts({ archived: "archived" })).some((r: any) => r.id === p.id)).toBe(true);
    await wms.updateWmsProduct(p.id, { archivedAt: null }, undefined, STRICT);
    expect((await wms.getWmsProducts()).some((r: any) => r.id === p.id)).toBe(true);
    expect((await auditFor(p.sku)).map((l: any) => l.action)).toEqual(expect.arrayContaining(["Arsipkan bahan", "Pulihkan bahan dari arsip"]));
  });
});

describe("Kategori", () => {
  it("rename diteruskan ke bahan & katalog OS, area tetap", async () => {
    const cat = await wms.createWmsCategory({ name: "Sirup Lama", area: "bar" });
    const p = await wms.createWmsProduct({ name: "Sirup Karamel", category: "Sirup Lama", unit: "ml" }, null, undefined, STRICT);
    await wms.updateWmsCategory(cat.id, { name: "Syrup" }, STRICT);
    const row = (await wms.getWmsProducts()).find((r: any) => r.id === p.id);
    expect(row.category).toBe("Syrup");
    expect(row.area).toBe("bar");
    const { eq } = await import("drizzle-orm");
    const [os] = await t.getDb().select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, p.sku));
    expect(os.category).toBe("Syrup");
  });

  it("rename ke nama yang sudah ada ditolak", async () => {
    const cats = await wms.listWmsCategories();
    const syrup = cats.find((c: any) => c.name === "Syrup");
    await expect(wms.updateWmsCategory(syrup.id, { name: "kopi" })).rejects.toMatchObject({ code: "CATEGORY_DUPLICATE" });
  });

  it("arsip: ditolak bila dipakai; kosong → terarsip, hilang dari dropdown, bisa dipulihkan", async () => {
    const kopi = (await wms.listWmsCategories()).find((c: any) => c.name === "Kopi");
    expect((await wms.archiveWmsCategory(kopi.id)).reason).toBe("in_use");

    const empty = await wms.createWmsCategory({ name: "Kategori Kosong", area: "umum" });
    expect((await wms.archiveWmsCategory(empty.id)).ok).toBe(true);
    expect((await wms.listWmsCategories()).some((c: any) => c.id === empty.id)).toBe(false);
    expect((await wms.listWmsCategories({ includeArchived: true })).find((c: any) => c.id === empty.id).archived).toBe(true);
    await expect(wms.createWmsProduct({ name: "X", category: "Kategori Kosong", unit: "pcs" }, null, undefined, STRICT)).rejects.toMatchObject({
      code: "CATEGORY_ARCHIVED",
    });
    // Tambah dengan nama sama = pulihkan (bukan dobel).
    await wms.createWmsCategory({ name: "kategori kosong", area: "umum" });
    const all = await wms.listWmsCategories({ includeArchived: true });
    expect(all.filter((c: any) => c.name.toLowerCase() === "kategori kosong")).toHaveLength(1);
    expect(all.find((c: any) => c.id === empty.id).archived).toBe(false);
  });

  it("pasang kategori standar Bar/Dapur/Umum idempoten", async () => {
    const first = await wms.installStandardWmsCategories(STRICT);
    expect(first.names).toEqual(expect.arrayContaining(["Protein", "Frozen Food", "Kebersihan", "Kebutuhan Operasional", "Packaging Bar"]));
    expect(first.names).not.toContain("Kopi"); // sudah ada sebelumnya
    const second = await wms.installStandardWmsCategories(STRICT);
    expect(second.added).toBe(0);
    const cats = await wms.listWmsCategories();
    expect(cats.find((c: any) => c.name === "Protein").area).toBe("dapur");
    expect(cats.find((c: any) => c.name === "Kebersihan").area).toBe("umum");
  });
});

describe("Supplier", () => {
  let supplierId = "";

  it("tambah dengan WA & alamat; nomor dinormalisasi; nomor salah ditolak", async () => {
    const s = await wms.createWmsSupplier({ name: "CV Susu Segar", phone: "+62 812-1111-2222", address: "Jl. Raya Bogor 12" }, STRICT);
    supplierId = s.id;
    expect(s.phone).toBe("081211112222");
    expect(s.address).toBe("Jl. Raya Bogor 12");
    await expect(wms.updateWmsSupplier(s.id, { phone: "12ab" })).rejects.toMatchObject({ code: "PHONE_INVALID" });
  });

  it("bahan yang disuplai + riwayat perubahan harga dari penerimaan", async () => {
    const milk = (await wms.getWmsProducts()).find((r: any) => r.name === "Susu UHT");
    await wms.updateWmsProduct(milk.id, { defaultSupplierId: supplierId }, undefined, STRICT);
    expect((await wms.getWmsProducts({ supplierId })).map((r: any) => r.id)).toContain(milk.id);

    const d = t.getDb();
    const s = t.schema;
    for (const [doc, price, day] of [
      ["RCV-T1", 18.5, "2026-10-01"],
      ["RCV-T2", 20.35, "2026-10-15"],
    ] as const) {
      const [rec] = await d
        .insert(s.wmsReceiving)
        .values({ doc, supplier: "CV Susu Segar", supplierId, status: "completed", completedAt: new Date(`${day}T08:00:00+07:00`) })
        .returning();
      await d.insert(s.wmsReceivingItem).values({ receivingId: rec.id, productId: milk.id, orderedQty: 12_000, receivedQty: 12_000, hpp: price });
    }

    const detail = await md.getWmsSupplierDetail(supplierId);
    const prod = detail.products.find((p: any) => p.id === milk.id);
    expect(prod.isDefault).toBe(true);
    expect(prod.lastPrice).toBe(20.35);
    expect(prod.receipts).toBe(2);
    expect(detail.priceHistory[0]).toMatchObject({ doc: "RCV-T2", price: 20.35, previousPrice: 18.5, changePct: 10 });
    expect(detail.priceHistory[1]).toMatchObject({ doc: "RCV-T1", previousPrice: null });
    expect((await wms.listWmsSuppliers()).find((x: any) => x.id === supplierId).productCount).toBe(1);
  });

  it("arsip supplier: hilang dari daftar aktif, bisa dipulihkan, tak bisa dipilih untuk bahan", async () => {
    await wms.archiveWmsSupplier(supplierId, STRICT);
    expect((await wms.listWmsSuppliers()).some((x: any) => x.id === supplierId)).toBe(false);
    const p = await wms.createWmsProduct({ name: "Bumbu Sup", category: "Bumbu", unit: "gram" }, null, undefined, STRICT);
    await expect(wms.updateWmsProduct(p.id, { defaultSupplierId: supplierId }, undefined, STRICT)).rejects.toMatchObject({ code: "SUPPLIER_ARCHIVED" });
    await wms.updateWmsSupplier(supplierId, { archived: false }, STRICT);
    expect((await wms.listWmsSuppliers()).some((x: any) => x.id === supplierId)).toBe(true);
  });
});

describe("Impor master (pratinjau & kolom baru)", () => {
  const header = ["SKU", "Nama", "Kategori", "Satuan", "Supplier", "Satuan Beli", "Isi Kemasan", "Harga Beli Kemasan", "Brand"];

  it("pratinjau: satuan terkunci & supplier tak dikenal = error per baris, tidak menulis", async () => {
    const gula = (await wms.getWmsProducts()).find((r: any) => r.id === gulaId);
    const buf = await xlsx(header, [
      [gula.sku, "", "", "ml", "", "", "", "", ""],
      ["IMP-001", "Bahan Impor", "Bumbu", "gram", "PT Tidak Ada", "", "", "", ""],
      ["IMP-002", "Saus Impor", "Bumbu", "ml", "CV Susu Segar", "botol", "500", "25000", "Saori"],
    ]);
    const res = await wms.importWmsProductsFromBuffer(buf, { dryRun: true, filename: "m.xlsx" });
    expect(res.skipped).toBe(2);
    expect(res.created).toBe(1);
    expect(res.errors.map((e: any) => e.message).join(" ")).toMatch(/tidak bisa diganti/);
    expect(res.errors.map((e: any) => e.message).join(" ")).toMatch(/PT Tidak Ada/);
    expect((await wms.getWmsProducts()).some((r: any) => r.sku === "IMP-002")).toBe(false);
  });

  it("simpan: kemasan → HPP per satuan, supplier & brand terisi, stok 0", async () => {
    const buf = await xlsx(header, [["IMP-002", "Saus Impor", "Bumbu", "ml", "CV Susu Segar", "botol", "500", "25000", "Saori"]]);
    const res = await wms.importWmsProductsFromBuffer(buf, { dryRun: false, filename: "m.xlsx", actorName: "Owner Test" });
    expect(res.created).toBe(1);
    const row = (await wms.getWmsProducts()).find((r: any) => r.sku === "IMP-002");
    expect(row.hpp).toBe(50);
    expect(row.brand).toBe("Saori");
    expect(row.supplierName).toBe("CV Susu Segar");
    expect(row.onHand).toBe(0);
    expect((await auditFor("IMP-002")).some((l: any) => l.actor === "Owner Test")).toBe(true);
  });
});
