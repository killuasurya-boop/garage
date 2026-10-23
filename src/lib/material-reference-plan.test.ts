import { describe, expect, it } from "vitest";
import { GARAGE_MATERIAL_REFERENCE_HASH, GARAGE_MATERIAL_REFERENCE_SOURCE } from "@/lib/garage-material-reference-source";
import { createHash } from "node:crypto";
import { parseMaterialReferenceCsv, planMaterialReference, referenceUnitQuantity } from "@/lib/material-reference-plan";

const empty = { materials: [], wmsProducts: [] };

describe("Owner material CSV reference", () => {
  it("retains all 76 rows, raw values, source order, areas and unknown stocks from the exact upload", () => {
    expect(createHash("sha256").update(GARAGE_MATERIAL_REFERENCE_SOURCE).digest("hex")).toBe(GARAGE_MATERIAL_REFERENCE_HASH);
    const rows = parseMaterialReferenceCsv(GARAGE_MATERIAL_REFERENCE_SOURCE);
    expect(rows).toHaveLength(76);
    expect(rows.filter((r) => r.sourceCategory === "Bar")).toHaveLength(36);
    expect(rows.filter((r) => r.sourceCategory === "Dapur")).toHaveLength(40);
    expect(rows[0]).toMatchObject({ row: 2, sourceSku: "BAR-901", sourceName: "Drip Strawberry", sourceMin: 760, sourceHpp: 110_000, sourceStock: null });
    expect(rows[0].raw.Nama).toBe("Drip Strawberry ");
    expect(rows.every((r) => r.sourceStock === null)).toBe(true);
    expect(rows.at(-1)?.sourceSku).toBe("KIT-040");
    const plan = planMaterialReference(rows, empty);
    expect(plan.summary).toMatchObject({ total: 76, bar: 36, dapur: 40, needsValidation: 76, readyCreate: 0 });
    expect(plan.rows.every((r) => r.creation === null)).toBe(true);
  });

  it("never treats Min Stok as package contents, even when HPP resembles a package purchase price", () => {
    const [row] = parseMaterialReferenceCsv(GARAGE_MATERIAL_REFERENCE_SOURCE);
    const unconfirmed = planMaterialReference([row], empty).rows[0];
    expect(unconfirmed.status).toBe("needs_validation");
    const confirmed = planMaterialReference([row], empty, [{ sourceSku: "BAR-901", canonicalUnit: "ml", packageQty: 1000, costBasis: "package" }]).rows[0];
    expect(confirmed.creation).toMatchObject({ packageQty: 1000, unitCost: 110, minStock: 760 });
  });

  it("maps BAR-9NN identities, reports known price/unit conflicts, and keeps trusted cost and recipes", () => {
    const rows = parseMaterialReferenceCsv(GARAGE_MATERIAL_REFERENCE_SOURCE).filter((r) => ["BAR-914", "BAR-918"].includes(r.sourceSku));
    const materials = [{ sku: "BAR-014", name: "Coklat", alternativeName: "", category: "Bahan Bar", usageArea: "bar", unit: "gr", min: 1, unitCost: 220_000 / 760, purchasePrice: 220_000, packageQty: 760, stage: "active" },
      { sku: "BAR-018", name: "Fresh Milk", alternativeName: "", category: "Bahan Bar", usageArea: "bar", unit: "ml", min: 1, unitCost: 276_500 / 22_704, purchasePrice: 276_500, packageQty: 22_704, stage: "active" }];
    const plan = planMaterialReference(rows, { materials, wmsProducts: materials.map((m) => ({ id: m.sku, ...m, archived: false })), recipesBySku: {
      "BAR-014": [{ menuItemId: "choco", menuName: "Choco", variantId: "cold", status: "active", qty: 20, unit: "gr", wmsRecipeId: "existing-bom" }],
    } });
    const chocolate = plan.rows[0];
    expect(chocolate.canonicalSku).toBe("BAR-014");
    expect(chocolate.issues.map((i) => i.code)).toContain("price_conflict");
    expect(chocolate.issues.map((i) => i.code)).toContain("unit_conflict");
    expect(chocolate.metadata.canApply).toBe(false);
    expect(chocolate.target?.purchasePrice).toBe(220_000);
    expect(chocolate.recipes[0].wmsRecipeId).toBe("existing-bom");
    const milk = plan.rows[1];
    expect(milk.target?.packageQty).toBe(22_704);
    expect(milk.sourceMin).toBe(1000);
    expect(milk.creation).toBeNull();
  });

  it("converts only known same-dimension quantities and never guesses packaging or density", () => {
    expect(referenceUnitQuantity(1, "Kg", "gr")).toBe(1000);
    expect(referenceUnitQuantity(1, "liter", "ml")).toBe(1000);
    expect(referenceUnitQuantity(1, "ml", "gr")).toBeNull();
    expect(referenceUnitQuantity(1, "bks", "gr")).toBeNull();
    expect(referenceUnitQuantity(1, "ppn", "pcs")).toBeNull();
  });

  it("rejects duplicate identities, negative numbers, wrong area and non-source confirmations", () => {
    const header = "SKU,Nama,Kategori,Satuan,Min Stok,HPP,Barcode,Stok\n";
    expect(() => parseMaterialReferenceCsv(header + "KIT-001,Cabe,Dapur,kg,-1,90000,,\n")).toThrow();
    expect(() => parseMaterialReferenceCsv(header + "KIT-001,Cabe,Bar,kg,1,90000,,\n")).toThrow();
    expect(() => parseMaterialReferenceCsv(header + "KIT-001,Cabe,Dapur,kg,1,90000,,\nKIT-001,Cabe,Dapur,kg,1,90000,,\n")).toThrow();
    const rows = parseMaterialReferenceCsv(header + "KIT-001,Cabe,Dapur,kg,1,90000,,\n");
    expect(() => planMaterialReference(rows, empty, [{ sourceSku: "KIT-999", canonicalUnit: "gr", packageQty: 1000, costBasis: "package" }])).toThrow();
  });
});
