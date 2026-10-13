// Impor massal produk menu POS (CSV / XLSX). 1 baris = 1 varian harga; baris
// dengan SKU / nama produk yang sama digabung menjadi satu produk.
// Aman: pratinjau dulu, error per baris, tidak membuat produk ganda (cocok via
// SKU → nama → ID), tidak menghapus varian yang tidak ada di file, dan HPP
// TIDAK diimpor (selalu dihitung dari resep — syncRecipeBaseCosts).
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, menuItems, menuVariants } from "@/db/schema";
import { parseImportFile, parseLocaleNumber, parseYesNo, templateCsv, templateXlsx, type ImportColumn } from "@/lib/bulk-import";
import type { MenuCategory } from "@/lib/garage-data";
import {
  nextMenuSku,
  normalizeMenuSku,
  normalizeVariantId,
  sectionForMenuCategory,
  slugifyMenuId,
} from "@/lib/garage-service";
import { syncRecipeBaseCosts } from "@/lib/menu-recipe-cost";
import type { GarageSession } from "@/lib/server-auth";
import type { ImportRowResult } from "@/lib/bulk-import";

export const MENU_IMPORT_CATEGORIES: MenuCategory[] = ["Coffee", "Non-Coffee", "Makanan", "Cemilan"];
const MAX_PRICE = 10_000_000;

export const MENU_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "sku", label: "SKU", aliases: ["kode", "kode produk", "sku produk"] },
  { key: "name", label: "Nama Produk", aliases: ["nama", "name", "produk", "nama menu", "menu"], required: true },
  { key: "category", label: "Kategori", aliases: ["category"], required: true },
  { key: "variant", label: "Varian", aliases: ["variant", "variant label", "variant_label", "ukuran"] },
  { key: "price", label: "Harga", aliases: ["price", "harga jual", "harga varian"], required: true },
  { key: "station", label: "Station", aliases: ["stasiun", "dibuat di"] },
  { key: "digital", label: "Tampil di Menu Digital", aliases: ["menu digital", "tampil", "show in digital menu"] },
  { key: "description", label: "Deskripsi", aliases: ["description", "keterangan"] },
];

export type MenuImportResult = {
  dryRun: boolean;
  productsCreated: number;
  productsUpdated: number;
  productsUnchanged: number;
  variantsAdded: number;
  pricesChanged: number;
  errorRows: number;
  rows: ImportRowResult[];
  mapping: Record<string, string>;
  ignored: string[];
};

type RowInput = {
  rowNo: number;
  sku: string | null;
  name: string;
  category: MenuCategory;
  variant: string;
  price: number;
  station: "bar" | "dapur" | null;
  digital: boolean | null;
  description: string;
};

function categoryOf(raw: string): MenuCategory | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (["coffee", "kopi"].includes(value)) return "Coffee";
  if (["non-coffee", "noncoffee", "nonkopi", "non-kopi"].includes(value)) return "Non-Coffee";
  if (["makanan", "food", "makan"].includes(value)) return "Makanan";
  if (["cemilan", "snack", "camilan"].includes(value)) return "Cemilan";
  return null;
}

function stationOf(raw: string): "bar" | "dapur" | null | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "bar") return "bar";
  if (["dapur", "kitchen"].includes(value)) return "dapur";
  return undefined;
}

export async function importMenuProducts(
  buffer: Buffer,
  opts: { dryRun: boolean; filename: string },
  garage: GarageSession,
): Promise<MenuImportResult> {
  const sheet = await parseImportFile(buffer, opts.filename, MENU_IMPORT_COLUMNS);
  if (sheet.missingRequired.length) {
    throw new Error(`Kolom wajib tidak ditemukan: ${sheet.missingRequired.join(", ")}. Gunakan template impor.`);
  }
  const result: MenuImportResult = {
    dryRun: opts.dryRun,
    productsCreated: 0,
    productsUpdated: 0,
    productsUnchanged: 0,
    variantsAdded: 0,
    pricesChanged: 0,
    errorRows: 0,
    rows: [],
    mapping: sheet.mapping,
    ignored: sheet.ignored,
  };
  const rowResult = new Map<number, ImportRowResult>();
  const setRow = (r: ImportRowResult) => rowResult.set(r.row, r);

  // 1) Validasi per baris.
  const valid: RowInput[] = [];
  for (const { rowNo, values } of sheet.rows) {
    const name = (values.name ?? "").trim();
    const error = (message: string) => setRow({ row: rowNo, key: values.sku || name || "-", name, action: "error", message });
    if (!name) {
      error("Nama Produk wajib diisi.");
      continue;
    }
    if (name.length > 80) {
      error("Nama Produk maksimal 80 karakter.");
      continue;
    }
    const category = categoryOf(values.category ?? "");
    if (!category) {
      error(`Kategori "${values.category ?? ""}" tidak dikenal. Pilih: ${MENU_IMPORT_CATEGORIES.join(", ")}.`);
      continue;
    }
    const price = parseLocaleNumber(values.price ?? "");
    if (price === null || Number.isNaN(price) || price <= 0 || !Number.isInteger(price) || price > MAX_PRICE) {
      error(`Harga "${values.price ?? ""}" harus bilangan bulat Rupiah 1–${MAX_PRICE.toLocaleString("id-ID")}.`);
      continue;
    }
    const variant = (values.variant ?? "").trim() || "Regular";
    if (variant.length > 40) {
      error("Varian maksimal 40 karakter.");
      continue;
    }
    const station = stationOf(values.station ?? "");
    if (station === undefined) {
      error(`Station "${values.station}" tidak dikenal (isi Bar, Dapur, atau kosong).`);
      continue;
    }
    const digitalRaw = values.digital ?? "";
    const digital = parseYesNo(digitalRaw);
    if (digitalRaw && digital === null) {
      error(`Tampil di Menu Digital "${digitalRaw}" harus Ya/Tidak.`);
      continue;
    }
    const sku = normalizeMenuSku(values.sku);
    if (values.sku && !sku) {
      error("SKU hanya boleh huruf, angka, dan strip.");
      continue;
    }
    valid.push({ rowNo, sku, name, category, variant, price, station, digital, description: (values.description ?? "").trim() });
  }

  // 2) Kelompokkan per produk (SKU bila ada, kalau tidak nama).
  const groups = new Map<string, RowInput[]>();
  for (const row of valid) {
    const key = row.sku ? `sku:${row.sku}` : `name:${row.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const db = getDb();
  const existingItems = await db
    .select({ id: menuItems.id, sku: menuItems.sku, name: menuItems.name, category: menuItems.category, station: menuItems.station, showInDigitalMenu: menuItems.showInDigitalMenu, description: menuItems.description, status: menuItems.status })
    .from(menuItems);
  const bySku = new Map(existingItems.filter((i) => i.sku).map((i) => [String(i.sku).toUpperCase(), i]));
  const byName = new Map(existingItems.map((i) => [i.name.trim().toLowerCase(), i]));
  const byId = new Map(existingItems.map((i) => [i.id, i]));
  const existingVariants = existingItems.length
    ? await db
        .select({ itemId: menuVariants.itemId, variantId: menuVariants.variantId, label: menuVariants.label, price: menuVariants.price })
        .from(menuVariants)
        .where(inArray(menuVariants.itemId, existingItems.map((i) => i.id)))
    : [];

  type Plan =
    | { kind: "create"; rows: RowInput[]; id: string }
    | { kind: "update"; rows: RowInput[]; id: string; priceUpdates: Array<{ variantId: string; price: number }>; newVariants: RowInput[]; itemPatch: Partial<typeof menuItems.$inferInsert> };
  const plans: Plan[] = [];
  const usedIds = new Set<string>();
  const usedSkus = new Set<string>();

  for (const rows of groups.values()) {
    const first = rows[0];
    const groupError = (message: string) => {
      for (const row of rows) setRow({ row: row.rowNo, key: row.sku ?? row.name, name: row.name, action: "error", message });
    };
    if (rows.some((r) => r.category !== first.category)) {
      groupError("Baris produk yang sama harus punya Kategori yang sama.");
      continue;
    }
    if (rows.some((r) => r.name.toLowerCase() !== first.name.toLowerCase())) {
      groupError("SKU yang sama dipakai untuk nama produk berbeda.");
      continue;
    }
    const labels = rows.map((r) => normalizeVariantId(r.variant, 0));
    const dupLabel = labels.find((label, i) => labels.indexOf(label) !== i);
    if (dupLabel) {
      groupError(`Varian "${rows[labels.lastIndexOf(dupLabel)].variant}" muncul lebih dari sekali untuk produk ini.`);
      continue;
    }

    // Cocokkan produk yang sudah ada: SKU → nama → ID slug.
    const bySkuHit = first.sku ? bySku.get(first.sku) : undefined;
    const byNameHit = byName.get(first.name.toLowerCase());
    const slug = slugifyMenuId(first.name);
    const byIdHit = byId.get(slug);
    if (bySkuHit && bySkuHit.name.trim().toLowerCase() !== first.name.toLowerCase()) {
      groupError(`SKU ${first.sku} sudah dipakai produk "${bySkuHit.name}" (nama di file: "${first.name}"). Impor tidak mengganti nama produk.`);
      continue;
    }
    if (bySkuHit && byNameHit && bySkuHit.id !== byNameHit.id) {
      groupError(`SKU ${first.sku} milik "${bySkuHit.name}", tetapi nama "${first.name}" milik produk lain. Periksa SKU/nama.`);
      continue;
    }
    const existing = bySkuHit ?? byNameHit ?? byIdHit;

    if (!existing) {
      if (!slug) {
        groupError("Nama produk tidak menghasilkan ID yang valid.");
        continue;
      }
      if (usedIds.has(slug) || (first.sku && usedSkus.has(first.sku))) {
        groupError("Produk ganda dalam file (nama/SKU sama dengan baris lain).");
        continue;
      }
      usedIds.add(slug);
      if (first.sku) usedSkus.add(first.sku);
      plans.push({ kind: "create", rows, id: slug });
      for (const row of rows) setRow({ row: row.rowNo, key: row.sku ?? "SKU otomatis", name: row.name, action: "create", changes: [`Varian ${row.variant}: Rp${row.price.toLocaleString("id-ID")}`] });
      result.productsCreated += 1;
      result.variantsAdded += rows.length;
      continue;
    }
    if (usedIds.has(existing.id)) {
      groupError("Produk ganda dalam file (cocok dengan produk yang sama di baris lain).");
      continue;
    }
    usedIds.add(existing.id);

    const variants = existingVariants.filter((v) => v.itemId === existing.id);
    const priceUpdates: Array<{ variantId: string; price: number }> = [];
    const newVariants: RowInput[] = [];
    const itemPatch: Partial<typeof menuItems.$inferInsert> = {};
    const productChanges: string[] = [];
    if (first.category !== existing.category) {
      itemPatch.category = first.category;
      itemPatch.section = sectionForMenuCategory(first.category);
      productChanges.push(`Kategori: ${existing.category} → ${first.category}`);
    }
    if (first.station && first.station !== existing.station) {
      itemPatch.station = first.station;
      productChanges.push(`Station: ${existing.station ?? "otomatis"} → ${first.station}`);
    }
    if (first.digital !== null && first.digital !== existing.showInDigitalMenu) {
      itemPatch.showInDigitalMenu = first.digital;
      productChanges.push(`Menu digital: ${first.digital ? "tampil" : "disembunyikan"}`);
    }
    if (first.description && first.description !== (existing.description ?? "")) {
      itemPatch.description = first.description;
      productChanges.push("Deskripsi diperbarui");
    }
    for (const row of rows) {
      const match = variants.find((v) => v.label.trim().toLowerCase() === row.variant.toLowerCase() || v.variantId === normalizeVariantId(row.variant, 0));
      const changes = row === first ? [...productChanges] : [];
      if (match) {
        if (match.price !== row.price) {
          priceUpdates.push({ variantId: match.variantId, price: row.price });
          changes.push(`Harga ${match.label}: Rp${match.price.toLocaleString("id-ID")} → Rp${row.price.toLocaleString("id-ID")}`);
        }
      } else {
        newVariants.push(row);
        changes.push(`Varian baru ${row.variant}: Rp${row.price.toLocaleString("id-ID")}`);
      }
      setRow({ row: row.rowNo, key: existing.sku ?? existing.id, name: existing.name, action: changes.length ? "update" : "unchanged", changes });
    }
    if (priceUpdates.length || newVariants.length || Object.keys(itemPatch).length) {
      plans.push({ kind: "update", rows, id: existing.id, priceUpdates, newVariants, itemPatch });
      result.productsUpdated += 1;
      result.pricesChanged += priceUpdates.length;
      result.variantsAdded += newVariants.length;
    } else {
      result.productsUnchanged += 1;
    }
  }

  result.rows = [...rowResult.values()].sort((a, b) => a.row - b.row);
  result.errorRows = result.rows.filter((r) => r.action === "error").length;
  if (opts.dryRun || plans.length === 0) return result;

  // 3) Simpan semua produk valid dalam SATU transaksi.
  const actor = `${garage.user.name} / ${garage.profile.role}`;
  await db.transaction(async (tx) => {
    const now = new Date();
    const touched: string[] = [];
    for (const plan of plans) {
      if (plan.kind === "create") {
        const first = plan.rows[0];
        let sku = first.sku;
        if (sku) {
          const [dup] = await tx.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.sku, sku)).limit(1);
          if (dup) throw new Error(`SKU ${sku} sudah dipakai produk lain.`);
        } else {
          sku = await nextMenuSku(tx as never, first.category);
        }
        await tx.insert(menuItems).values({
          id: plan.id,
          sku,
          name: first.name,
          category: first.category,
          section: sectionForMenuCategory(first.category),
          stock: "ready",
          status: "active",
          prep: "10m",
          tags: [],
          station: first.station,
          showInDigitalMenu: first.digital ?? true,
          description: first.description || null,
          sortOrder: 999,
          updatedAt: now,
        });
        await tx.insert(menuVariants).values(
          plan.rows.map((row, index) => ({
            itemId: plan.id,
            variantId: normalizeVariantId(row.variant, index),
            label: row.variant,
            price: row.price,
            baseCost: 0,
            sortOrder: index,
          })),
        );
      } else {
        if (Object.keys(plan.itemPatch).length) {
          await tx.update(menuItems).set({ ...plan.itemPatch, updatedAt: now }).where(eq(menuItems.id, plan.id));
        }
        for (const update of plan.priceUpdates) {
          await tx
            .update(menuVariants)
            .set({ price: update.price, updatedAt: now })
            .where(and(eq(menuVariants.itemId, plan.id), eq(menuVariants.variantId, update.variantId)));
        }
        if (plan.newVariants.length) {
          const current = await tx.select({ variantId: menuVariants.variantId }).from(menuVariants).where(eq(menuVariants.itemId, plan.id));
          await tx.insert(menuVariants).values(
            plan.newVariants.map((row, index) => ({
              itemId: plan.id,
              variantId: normalizeVariantId(row.variant, current.length + index),
              label: row.variant,
              price: row.price,
              baseCost: 0,
              sortOrder: current.length + index,
            })),
          );
        }
      }
      touched.push(plan.id);
    }
    // HPP varian dihitung ulang dari resep (tanpa resep = 0), bukan dari file.
    await syncRecipeBaseCosts(tx as never, { itemIds: touched });
    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(now),
      actor,
      action: "Impor massal produk menu",
      object: opts.filename,
      device: garage.profile.deviceLabel,
      status: "recorded",
      metadata: {
        productsCreated: result.productsCreated,
        productsUpdated: result.productsUpdated,
        variantsAdded: result.variantsAdded,
        pricesChanged: result.pricesChanged,
        errorRows: result.errorRows,
        productIds: touched,
      },
    });
  });
  return result;
}

export async function menuImportTemplate(format: "xlsx" | "csv") {
  const examples = [
    ["", "Contoh Kopi Susu", "Coffee", "Hot", "22000", "Bar", "Ya", "Hapus baris contoh ini"],
    ["", "Contoh Kopi Susu", "Coffee", "Cold", "24000", "Bar", "Ya", ""],
  ];
  if (format === "csv") return Buffer.from(templateCsv(MENU_IMPORT_COLUMNS, examples), "utf8");
  return templateXlsx({
    sheetName: "Produk",
    columns: MENU_IMPORT_COLUMNS,
    examples,
    lists: { category: MENU_IMPORT_CATEGORIES, station: ["Bar", "Dapur"], digital: ["Ya", "Tidak"] },
    notes: [
      "1 baris = 1 varian harga. Produk dengan beberapa varian (Hot/Cold) ditulis beberapa baris dengan Nama Produk yang sama.",
      "Produk yang sudah ada dicocokkan lewat SKU, lalu Nama Produk — tidak dibuat ganda. Harga varian yang cocok diperbarui, varian baru ditambahkan, varian lama tidak dihapus.",
      "SKU boleh kosong (dibuat otomatis, mis. COF-021). Harga dalam Rupiah bulat, mis. 22000 atau 22.000.",
      "HPP tidak diimpor: dihitung otomatis dari resep. Atur resep di Produk → Resep setelah impor.",
      "Hapus baris contoh sebelum mengunggah. Maks. 2.000 baris, 5 MB.",
    ],
  });
}
