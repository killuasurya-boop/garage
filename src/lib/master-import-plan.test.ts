import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { parseMasterWorkbook, planMasterImport } from "@/lib/master-import-plan";
import { MASTER_WORKBOOK_PATH, seedCurrentState as seedState } from "@/lib/test-helpers/master-workbook-fixture";

// Workbook asli = data bisnis privat, tidak ada di repo publik (PR #210). Tes ini jalan bila berkasnya ada
// (letakkan di docs/data/ atau set GARAGE_MASTER_WORKBOOK); di CI dilewati — logika yang sama diuji dengan
// workbook sintetis di master-import-plan.synthetic.test.ts.
const WORKBOOK = MASTER_WORKBOOK_PATH;
const HAS_WORKBOOK = fs.existsSync(WORKBOOK);

describe.skipIf(!HAS_WORKBOOK)("Master workbook v3.1 (berkas privat)", () => {
  // Body describe tetap dievaluasi saat koleksi walau dilewati → jangan parse berkas yang tidak ada.
  const data = (HAS_WORKBOOK ? parseMasterWorkbook(fs.readFileSync(WORKBOOK)) : null) as ReturnType<typeof parseMasterWorkbook>;

  it("membaca sheet master bahan, resep, dan POS register", () => {
    expect(data.warnings).toEqual([]);
    expect(data.materials.length).toBe(88);
    expect(data.posRegister.length).toBe(47);
    expect(new Set(data.recipeLines.map((l) => l.recipeId)).size).toBe(40);
  });

  it("menambah 40 bahan Dapur, melewati virtual, mempertahankan bahan bar", () => {
    const plan = planMasterImport(data, seedState());
    expect(plan.materials.toCreate.length).toBe(40);
    expect(plan.materials.toCreate.every((m) => m.sku.startsWith("KIT-"))).toBe(true);
    expect(plan.materials.alreadyExists.length).toBe(36);
    expect(plan.materials.virtualSkipped.length).toBe(12);
    const egg = plan.materials.toCreate.find((m) => m.sku === "KIT-027")!;
    expect(egg).toMatchObject({ unit: "pcs", packQty: 30, packPrice: 48000, unitCost: 1600, validated: false });
    const rice = plan.materials.toCreate.find((m) => m.sku === "KIT-025")!;
    expect(rice).toMatchObject({ unit: "gr", packQty: 10000, unitCost: 15.5 });
    // Selisih harga bar dilaporkan, tidak ditimpa (Fresh Milk: Garage dus 24×946 ml).
    expect(plan.materials.barDifferences.some((d) => d.sku === "BAR-018")).toBe(true);
  });

  it("10 resep Dapur jadi draft & terpetakan ke menu Garage; allowance dilewati", () => {
    const plan = planMasterImport(data, seedState());
    expect(plan.recipes.length).toBe(10);
    expect(plan.recipes.every((r) => r.status === "new_draft")).toBe(true);
    const nasi = plan.recipes.find((r) => r.recipeId === "KT-005")!;
    expect(nasi.menuItemId).toBe("makanan-nasi");
    expect(nasi.lines).toEqual([expect.objectContaining({ sku: "KIT-025", qty: 70, unit: "gr" })]);
    expect(nasi.skippedLines[0].materialKey).toBe("V-KIT-ENERGY-NASI");
    // Ayam Penyet: baris bahan ganda (minyak, tomat) dijumlah.
    const ayam = plan.recipes.find((r) => r.recipeId === "KT-004")!;
    expect(ayam.lines.find((l) => l.sku === "KIT-026")?.qty).toBe(17);
    expect(ayam.lines.find((l) => l.sku === "KIT-012")?.qty).toBe(18);
  });

  it("rekonsiliasi POS dua arah tanpa membuat produk", () => {
    const plan = planMasterImport(data, seedState());
    const missing = plan.posReconciliation.excelNotInGarage.map((p) => p.name);
    // Menu Event GARAGE (migrasi 0148) menambah Red Velvet, Taro, Strawberry Tea → kini cocok dengan register POS.
    expect(missing).not.toEqual(expect.arrayContaining(["Strawberry Tea (Cold)"]));
    expect(missing).not.toEqual(expect.arrayContaining(["Red Velvet (Cold)"]));
    expect(missing).not.toEqual(expect.arrayContaining(["Taro (Hot)"]));
    const extra = plan.posReconciliation.garageNotInExcel.map((m) => m.name);
    expect(extra).toEqual(expect.arrayContaining(["Choco Kiss", "Dark Charm", "Mineral"]));
    expect(plan.posReconciliation.priceDifferences).toEqual([]);
  });
});
