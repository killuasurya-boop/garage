import { beforeAll, describe, expect, it } from "vitest";

import { parseMasterWorkbook, planMasterImport, type MasterWorkbookData } from "@/lib/master-import-plan";
import { buildSyntheticMasterWorkbook, seedCurrentState } from "@/lib/test-helpers/master-workbook-fixture";

// Impor master Excel diuji dengan workbook SINTETIS (data palsu) agar jalan di CI repo publik
// tanpa workbook bisnis asli (dihapus dari repo di PR #210).
let data: MasterWorkbookData;
beforeAll(async () => {
  data = parseMasterWorkbook(await buildSyntheticMasterWorkbook());
});

describe("Master workbook sintetis — pembacaan", () => {
  it("membaca 3 sheet; baris judul & catatan dilewati; kode ganda tetap terbaca untuk diperingatkan", () => {
    expect(data.sheetNames).toEqual(["Master Bahan", "Recipe Detail", "POS Menu Register"]);
    expect(data.warnings).toEqual([]);
    expect(data.materials.map((m) => m.key)).toEqual(["KIT-025", "KIT-027", "KIT-026", "KIT-031", "KIT-040", "V-KIT-ENERGY-NASI", "BAR-918", "KIT-025", "ZZZ-001"]);
    expect(data.materials.find((m) => m.key === "KIT-031")).toMatchObject({ packQty: null, confidence: "LOW", sourceUnit: "pack" });
    expect(data.recipeLines).toHaveLength(7);
    expect(data.posRegister.map((p) => p.posSku)).toEqual(["POS-001", "POS-002", "POS-003", "POS-004"]);
  });

  it("sheet yang hilang → peringatan, bukan crash", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Lain").addRow(["x"]);
    const empty = parseMasterWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(empty.warnings).toEqual([
      'Sheet "Master Bahan" tidak ditemukan.',
      'Sheet "Recipe Detail" tidak ditemukan.',
      'Sheet "POS Menu Register" tidak ditemukan.',
    ]);
  });
});

describe("Master workbook sintetis — rencana impor", () => {
  it("bahan: 5 KIT baru, virtual dilewati, bar dipetakan BAR-9NN→BAR-0NN & selisih dilaporkan", () => {
    const plan = planMasterImport(data, seedCurrentState());
    expect(plan.materials.toCreate.map((m) => m.sku)).toEqual(["KIT-025", "KIT-027", "KIT-026", "KIT-031", "KIT-040"]);
    expect(plan.materials.toCreate.find((m) => m.sku === "KIT-025")).toMatchObject({ name: "Beras putih", unit: "gr", packQty: 10000, packPrice: 155000, unitCost: 15.5, validated: true, category: "Dapur · Bahan Baku" });
    expect(plan.materials.toCreate.find((m) => m.sku === "KIT-027")).toMatchObject({ unit: "pcs", packQty: 30, unitCost: 1600 });
    // Tanpa isi kemasan: satuan dari "Satuan Sumber", biaya per kemasan, tidak tervalidasi.
    expect(plan.materials.toCreate.find((m) => m.sku === "KIT-031")).toMatchObject({ unit: "pack", packQty: 1, packPrice: 12000, validated: false });
    expect(plan.materials.toCreate.find((m) => m.sku === "KIT-031")!.note).toMatch(/^Isi kemasan tidak tercatat/);
    expect(plan.materials.toCreate.find((m) => m.sku === "KIT-040")!.category).toBe("Dapur · Gas & Kebersihan");
    expect(plan.materials.virtualSkipped.map((v) => v.key)).toEqual(["V-KIT-ENERGY-NASI"]);
    expect(plan.materials.alreadyExists).toEqual([{ sku: "BAR-018", name: "Fresh Milk" }]);
    expect(plan.materials.barDifferences).toEqual([expect.objectContaining({ sku: "BAR-018", field: "Isi kemasan", excel: "24000", garage: "22704" })]);
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Kode bahan ganda di Excel: KIT-025/), expect.stringMatching(/ZZZ-001.*tidak dikenal/)]));
  });

  it("resep: draft dipetakan ke menu Garage, baris ganda dijumlah, allowance & satuan salah ditangani", () => {
    const plan = planMasterImport(data, seedCurrentState());
    const byId = new Map(plan.recipes.map((r) => [r.recipeId, r]));
    expect(byId.get("KT-005")).toMatchObject({ status: "new_draft", menuItemId: "makanan-nasi", variantId: "all", posSku: "POS-001", referenceHpp: Math.round(70 * 15.5) });
    expect(byId.get("KT-005")!.lines).toEqual([expect.objectContaining({ sku: "KIT-025", qty: 70, unit: "gr", lowConfidence: false })]);
    expect(byId.get("KT-005")!.skippedLines).toEqual([expect.objectContaining({ materialKey: "V-KIT-ENERGY-NASI", reason: expect.stringMatching(/Allowance/) })]);
    const nugget = byId.get("KT-010")!;
    expect(nugget).toMatchObject({ status: "new_draft", menuItemId: "cemilan-nugget" });
    expect(nugget.lines.find((l) => l.sku === "KIT-026")).toMatchObject({ qty: 17, unit: "ml", lowConfidence: false });
    expect(nugget.lines.find((l) => l.sku === "KIT-027")).toMatchObject({ qty: 1, unit: "pcs", lowConfidence: true });
    expect(nugget.referenceHpp).toBe(Math.round(17 * 18 + 1600));
    expect(byId.get("KT-020")).toMatchObject({ status: "menu_not_found", menuItemId: null });
    expect(byId.get("KT-021")).toMatchObject({ status: "invalid_lines", menuItemId: "makanan-indomie-kuah" });
  });

  it("status draft/arsip dihormati (tidak membuat draft kedua)", () => {
    const state = seedCurrentState();
    state.draftRecipeMenuIds = new Set(["makanan-nasi"]);
    state.archivedRecipeMenuIds = new Set(["cemilan-nugget"]);
    const plan = planMasterImport(data, state);
    expect(plan.recipes.find((r) => r.recipeId === "KT-005")!.status).toBe("has_draft");
    expect(plan.recipes.find((r) => r.recipeId === "KT-010")!.status).toBe("has_archived");
  });

  it("rekonsiliasi POS dua arah: menu tak dikenal & selisih harga dilaporkan, tanpa membuat produk", () => {
    const plan = planMasterImport(data, seedCurrentState());
    expect(plan.posReconciliation.excelNotInGarage).toEqual([expect.objectContaining({ posSku: "POS-003", name: "Menu Hantu" })]);
    expect(plan.posReconciliation.priceDifferences).toEqual([expect.objectContaining({ posSku: "POS-004", excel: 13000, garage: 12000 })]);
    const extra = plan.posReconciliation.garageNotInExcel.map((m) => m.menuItemId);
    expect(extra).toEqual(expect.arrayContaining(["cemilan-sosis"]));
    expect(extra).not.toEqual(expect.arrayContaining(["makanan-nasi", "cemilan-nugget", "makanan-indomie-kuah"]));
  });
});
