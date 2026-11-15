import ExcelJS from "exceljs";

import { inventoryItems, menuItems } from "@/lib/garage-data";
import type { CurrentState } from "@/lib/master-import-plan";

// Workbook master SINTETIS untuk tes (data palsu, struktur sama dengan "Garage Coffee Master Pro v3.1").
// Workbook asli berisi data bisnis privat (harga pemasok, resep) dan sengaja tidak ada di repo publik
// (PR #210) — tes yang butuh workbook asli hanya jalan bila berkasnya tersedia (lihat MASTER_WORKBOOK_PATH).

export const MASTER_WORKBOOK_PATH = process.env.GARAGE_MASTER_WORKBOOK || "docs/data/Garage_Coffee_Master_Pro_Final_v3.1_POS.xlsx";

/** Kondisi Garage dari data seed (bahan bar + menu + resep aktif) untuk planMasterImport. */
export function seedCurrentState(): CurrentState {
  const activeRecipes = new Map<string, Map<string, number>>();
  for (const menu of menuItems) {
    for (const r of menu.recipes ?? []) {
      const key = `${menu.id}:${r.variantId}`;
      const m = activeRecipes.get(key) ?? new Map<string, number>();
      m.set(r.inventorySku, (m.get(r.inventorySku) ?? 0) + r.qty);
      activeRecipes.set(key, m);
    }
  }
  return {
    materials: inventoryItems.map((i) => ({
      sku: i.sku,
      name: i.name,
      usageArea: i.usageArea,
      unit: i.unit,
      packageQty: i.packageQty,
      purchasePrice: i.purchasePrice,
      unitCost: i.unitCost,
    })),
    menus: menuItems.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      status: "active",
      variants: m.variants.map((v) => ({ variantId: v.id, label: v.label, price: v.price })),
    })),
    activeRecipes,
    draftRecipeMenuIds: new Set(),
  };
}

type Row = Array<string | number | null>;

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, header: string[], rows: Row[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]); // baris judul di atas header (parser mencari baris header)
  ws.addRow([]);
  ws.addRow(header);
  for (const r of rows) ws.addRow(r.map((v) => (v === null ? undefined : v)));
}

/**
 * Isi (diharapkan oleh tes):
 * - Bahan: 5 KIT baru (KIT-025 beras, KIT-027 telur, KIT-026 minyak, KIT-031 bumbu LOW tanpa isi kemasan,
 *   KIT-040 sabun → kategori Gas & Kebersihan), 1 virtual (V-KIT-ENERGY-NASI), 1 bar BAR-918 (= BAR-018 Garage,
 *   isi kemasan beda), 1 kode ganda (peringatan), 1 kode tak dikenal ZZZ-001 (peringatan), 1 baris catatan (diabaikan).
 * - Resep: KT-005 Nasi (draft, 1 baris + 1 allowance), KT-010 Nugget (draft, minyak 10+7 dijumlah, telur LOW),
 *   KT-020 menu tak ada di Garage, KT-021 Indomie Kuah dengan satuan salah (gr untuk bahan pcs).
 * - POS: Nasi 5000, Nugget 12000 (cocok), "Menu Hantu" (tak ada di Garage), Indomie Kuah 13000 (beda harga).
 */
export async function buildSyntheticMasterWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  addSheet(
    wb,
    "Master Bahan",
    "MASTER BAHAN (SINTETIS UNTUK TES)",
    ["Key/SKU", "Station", "Nama Bahan", "Unit Dasar", "Satuan Sumber", "Isi Paket Normalisasi", "Harga Paket Model", "HPP per Unit", "Confidence", "Catatan Audit"],
    [
      ["KIT-025", "Dapur", "beras putih", "gr", "kg", 10000, 155000, 15.5, "HIGH", "uji"],
      ["KIT-027", "Dapur", "Telur ayam", "pcs", "pcs", 30, 48000, 1600, "HIGH", "uji"],
      ["KIT-026", "Dapur", "Minyak goreng", "ml", "liter", 2000, 36000, 18, "MED", "uji"],
      ["KIT-031", "Dapur", "Bumbu rahasia", "gr", "pack", null, 12000, null, "low", "isi belum ditimbang"],
      ["KIT-040", "Dapur", "Sabun cuci Sunlight", "ml", "botol", 800, 15000, 18.75, "HIGH", "uji"],
      ["V-KIT-ENERGY-NASI", "Dapur", "Energi masak nasi", "pcs", "-", 1, 0, 0, "HIGH", "allowance"],
      ["BAR-918", "Bar", "Fresh Milk", "ml", "dus", 24000, 276500, 11.52, "HIGH", "uji"],
      ["KIT-025", "Dapur", "beras putih (dobel)", "gr", "kg", 5000, 80000, 16, "HIGH", "baris ganda"],
      ["ZZZ-001", "Dapur", "Kode aneh", "gr", "kg", 1000, 1000, 1, "HIGH", "pola tak dikenal"],
      ["Catatan akhir", null, null, null, null, null, null, null, null, null],
    ],
  );
  addSheet(
    wb,
    "Recipe Detail",
    "RECIPE DETAIL",
    ["Recipe ID", "Menu", "Station", "Material Key", "Qty per Porsi", "Unit Resep", "Confidence"],
    [
      ["KT-005", "Nasi", "Dapur", "KIT-025", 70, "gr", "HIGH"],
      ["KT-005", "Nasi", "Dapur", "V-KIT-ENERGY-NASI", 1, "pcs", "HIGH"],
      ["KT-010", "Nugget", "Dapur", "KIT-026", 10, "ml", "MED"],
      ["KT-010", "Nugget", "Dapur", "KIT-026", 7, "ml", "MED"],
      ["KT-010", "Nugget", "Dapur", "KIT-027", 1, "pcs", "LOW"],
      ["KT-020", "Menu Hantu", "Dapur", "KIT-025", 50, "gr", "HIGH"],
      ["KT-021", "Indomie Kuah", "Dapur", "KIT-027", 2, "gr", "HIGH"],
    ],
  );
  addSheet(
    wb,
    "POS Menu Register",
    "POS MENU REGISTER",
    ["POS SKU", "Nama Menu POS", "Station", "Varian", "Harga POS Aktif", "Menu HPP Link"],
    [
      ["POS-001", "Nasi", "Dapur", "-", 5000, "KT-005"],
      ["POS-002", "Nugget", "Dapur", "-", 12000, "KT-010"],
      ["POS-003", "Menu Hantu", "Dapur", "-", 9000, "KT-020"],
      ["POS-004", "Indomie Kuah", "Dapur", "-", 13000, "KT-021"],
    ],
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
