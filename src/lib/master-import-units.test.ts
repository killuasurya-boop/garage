import { describe, expect, it } from "vitest";
import { planMasterImport, recipeQuantity, type CurrentState, type MasterWorkbookData } from "@/lib/master-import-plan";

const state: CurrentState = {
  materials: [{ sku: "KIT-001", name: "Beras", usageArea: "dapur", unit: "gr", packageQty: 1000, purchasePrice: 10000, unitCost: 10 }],
  menus: [{ id: "nasi", name: "Nasi", category: "Makanan", status: "active", variants: [{ variantId: "reg", label: "Regular", price: 5000 }] }],
  activeRecipes: new Map(), draftRecipeMenuIds: new Set(),
};
function workbook(qty: number, unit: string): MasterWorkbookData {
  return { sheetNames: [], materials: [], warnings: [],
    posRegister: [{ posSku: "POS-001", name: "Nasi", station: "Dapur", variant: "Regular", price: 5000, recipeLink: "KT-001", row: 2 }],
    recipeLines: [{ recipeId: "KT-001", menu: "Nasi", station: "Dapur", materialKey: "KIT-001", qty, unit, confidence: "HIGH", row: 2 }],
  };
}
describe("Safe recipe units", () => {
  it("normalizes kilograms to inventory grams before calculating HPP", () => {
    const [r] = planMasterImport(workbook(0.07, "kg"), state).recipes;
    expect(r.status).toBe("new_draft");
    expect(r.lines[0]).toMatchObject({ qty: 70, unit: "gr" });
    expect(r.referenceHpp).toBe(700);
  });
  it.each([[50, "ml"], [0, "gr"], [-5, "gr"], [NaN, "gr"]])("blocks invalid amount %s %s", (qty, unit) => {
    const [r] = planMasterImport(workbook(qty as number, unit as string), state).recipes;
    expect(r.status).toBe("invalid_lines");
    expect(r.lines).toHaveLength(0);
  });
  it("does not activate a partial recipe when only one line is invalid", () => {
    const data = workbook(50, "gr");
    data.recipeLines.push({ ...data.recipeLines[0], qty: -10, row: 3 });
    expect(planMasterImport(data, state).recipes[0].status).toBe("invalid_lines");
  });
  it("converts volume but never assumes mass equals volume", () => {
    expect(recipeQuantity(1, "l", "ml")).toBe(1000);
    expect(recipeQuantity(1, "ml", "gr")).toBeNull();
  });
});
