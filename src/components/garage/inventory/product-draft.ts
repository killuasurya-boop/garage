import type { MenuCategory } from "@/lib/garage-data";
import type { InventoryItem } from "@/lib/garage-api-types";

// Tipe & helper draft produk dipakai bersama oleh inventory-view.tsx (pemilik
// state) dan product-form.tsx (komponen presentational form). Satu sumber agar
// perhitungan HPP konsisten.

export type ProductVariantDraft = {
  key: string;
  id?: string;
  label: string;
  price: string;
  baseCost: string;
};

export type ProductRecipeDraft = {
  key: string;
  variantId: string;
  inventorySku: string;
  qty: string;
  unit: string;
  wastePct: string;
};

export type ProductDraftState = {
  editId: string;
  name: string;
  sku?: string;
  promoActive?: boolean;
  promoPrice?: string;
  category: MenuCategory;
  section: string;
  prep: string;
  stock: "ready" | "limited" | "sold_out";
  tags: string;
  variants: ProductVariantDraft[];
  recipes: ProductRecipeDraft[];
  savedAt: string;
};

export function productVariantDraftId(variant: ProductVariantDraft, index: number) {
  const fallback = index === 0 ? "regular" : `variant-${index + 1}`;
  return (
    variant.id ||
    (variant.label || fallback)
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    fallback
  );
}

export function recipeDraftLineCost(
  recipe: ProductRecipeDraft,
  inventoryItems: InventoryItem[],
) {
  const item = inventoryItems.find((entry) => entry.sku === recipe.inventorySku);
  const qty = Number(recipe.qty);
  const wastePct = Number(recipe.wastePct || 0);
  if (!item || !Number.isFinite(qty) || qty <= 0) return 0;

  return Math.round(
    qty * Number(item.unitCost ?? 0) * (1 + Math.max(0, wastePct) / 100),
  );
}

export function recipeCostForVariantDraft(
  recipes: ProductRecipeDraft[],
  inventoryItems: InventoryItem[],
  variantId: string,
) {
  return recipes
    .filter((recipe) => {
      const recipeVariantId = recipe.variantId || "all";
      return recipeVariantId === "all" || recipeVariantId === variantId;
    })
    .reduce((sum, recipe) => sum + recipeDraftLineCost(recipe, inventoryItems), 0);
}
