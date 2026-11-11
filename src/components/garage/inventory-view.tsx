"use client";

import { BulkImportDialog } from "@/components/garage/bulk-import-dialog";
import type { MenuImportResult } from "@/lib/menu-import";
import { reportFileName } from "@/lib/report-file-name";
import { todayWibKey } from "@/lib/date-range";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Boxes,
  Check,
  Download,
  FileText,
  History,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Settings,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { garageApi, GarageApiError } from "@/lib/api-client";
import { GARAGE_TAGS, subscribeGarageCache } from "@/lib/garage-cache";
import {
  currency,
  type MenuCategory,
  type ModuleId,
  type Role,
} from "@/lib/garage-data";
import type { InventoryItem, MenuItem } from "@/lib/garage-api-types";
import type { ProductCategoryRow, ProductType } from "@/lib/product-catalog-types";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";
import { ProductFormPanel } from "@/components/garage/inventory/product-form";
import { DigitalMenuManager } from "@/components/garage/inventory/digital-menu-manager";
import { CategoryManagerDialog } from "@/components/garage/inventory/category-manager-dialog";
import { ProductCatalogCenter } from "@/components/garage/inventory/product-catalog-center";
import {
  productVariantDraftId,
  recipeCostForVariantDraft,
  type ProductDraftState,
  type ProductRecipeDraft,
  type ProductVariantDraft,
} from "@/components/garage/inventory/product-draft";

const GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY = "garage-add-product-draft";

type ManagedProductItem = MenuItem & {
  status?: "active" | "archived";
};

type ProductHistoryRow = {
  id: string;
  time: string;
  actor: string;
  action: string;
  object: string;
  device: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export function InventoryView({
  role,
  menuItems,
  inventoryItems: inventoryItemsProp,
  onMenuChanged,
  onNavigateModule,
}: {
  role: Role;
  menuItems: MenuItem[];
  inventoryItems: InventoryItem[];
  // Tidak dipakai lagi sejak UI gudang lama dihapus; tetap diterima demi kompatibilitas pemanggil.
  stockMovements: string[];
  onMenuChanged: () => Promise<void>;
  onNavigateModule?: (module: ModuleId) => void;
  // productsOnly: modul "Produk" mandiri — komponen kini selalu mode produk; UI gudang
  // lama dihapus (digantikan WMS /warehouse). Prop tetap diterima demi kompatibilitas.
  productsOnly?: boolean;
}) {
  // Seleksi massal produk untuk export aman (NAV_ACTION_AUDIT §1.7, non-destruktif).
  const [productBulkIds, setProductBulkIds] = useState<Set<string>>(new Set());

  function toggleProductBulk(id: string) {
    setProductBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleProductBulkAll(ids: string[]) {
    setProductBulkIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }
  function exportSelectedProductsCsv() {
    const picked = visibleProductItems.filter((p) => productBulkIds.has(p.id));
    if (picked.length === 0) return;
    const head = ["SKU", "Nama", "Kategori", "Section", "Jumlah Varian"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const body = picked.map((p) =>
      [p.sku ?? "", p.name, p.category, p.section, p.variants.length].map(esc).join(","),
    );
    const csv = [head.map(esc).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFileName({ kind: "PRODUK_TERPILIH", from: todayWibKey(), to: todayWibKey(), ext: "csv" });
    a.click();
    URL.revokeObjectURL(url);
  }
  const [menuImportOpen, setMenuImportOpen] = useState(false);
  const [exportingInventory, setExportingInventory] = useState<"xlsx" | "pdf" | null>(null);
  const canManageMenuProducts = role === "Owner" || role === "Manajer";
  const [productItems, setProductItems] = useState<ManagedProductItem[]>(
    menuItems as ManagedProductItem[],
  );
  const [productListMode, setProductListMode] = useState<"catalog" | "active" | "archived" | "digital">("catalog");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [catalogFocusCategoryId, setCatalogFocusCategoryId] = useState<string | null>(null);
  // Filter & sort daftar produk (B2). Default urut A-Z by nama.
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<"all" | MenuCategory>("all");
  const [productStockFilter, setProductStockFilter] = useState<"all" | "ready" | "limited" | "sold_out">("all");
  const [productSortBy, setProductSortBy] = useState<"name-asc" | "name-desc" | "sku-asc" | "price-asc" | "price-desc">("name-asc");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productEditId, setProductEditId] = useState("");
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productPromoActive, setProductPromoActive] = useState(false);
  const [productPromoPrice, setProductPromoPrice] = useState("");
  // Production Hub: "" = station otomatis dari kategori.
  const [productStation, setProductStation] = useState<"" | "bar" | "dapur" | "none">("");
  // Master data produk (Okt 2026): tipe ("" = ikut kategori), merek, barcode.
  const [productType, setProductType] = useState<"" | ProductType>("");
  const [productBrand, setProductBrand] = useState("");
  const [productBarcode, setProductBarcode] = useState("");
  // Master kategori dinamis (product_categories) untuk form & filter.
  const [productCategories, setProductCategories] = useState<ProductCategoryRow[]>([]);
  const [productBatchEligible, setProductBatchEligible] = useState(true);
  const [productShowInDigitalMenu, setProductShowInDigitalMenu] = useState(true);
  const [productFeatured, setProductFeatured] = useState(false);
  const [productDescription, setProductDescription] = useState("");
  const [productCategory, setProductCategory] = useState<MenuCategory>("Cemilan");
  const [productSection, setProductSection] = useState("Dapur");
  const [productPrep, setProductPrep] = useState("10m");
  const [productStock, setProductStock] =
    useState<"ready" | "limited" | "sold_out">("ready");
  const [productVariants, setProductVariants] = useState<ProductVariantDraft[]>([
    { key: "regular", label: "Regular", price: "", baseCost: "" },
  ]);
  const [productRecipes, setProductRecipes] = useState<ProductRecipeDraft[]>([]);
  // Resep usulan (draft) produk yang sedang diedit + daftar bahan terbaru setelah
  // stok awal / bahan baru dibuat dari form (prop dari app shell tidak ikut refresh).
  const [productDraftRecipes, setProductDraftRecipes] = useState<ProductRecipeDraft[]>([]);
  const [freshInventory, setFreshInventory] = useState<InventoryItem[] | null>(null);
  const inventoryItems = freshInventory ?? inventoryItemsProp;
  const [productTags, setProductTags] = useState("");
  // Foto produk: file dipilih owner saat tambah/edit; di-upload setelah produk
  // tersimpan (butuh id). Preview menampilkan file baru atau imageUrl existing.
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const productImageInputRef = useRef<HTMLInputElement | null>(null);
  const [productAction, setProductAction] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [productNotice, setProductNotice] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productHistoryOpen, setProductHistoryOpen] = useState(false);
  const [productHistoryLoading, setProductHistoryLoading] = useState(false);
  const [productHistoryProduct, setProductHistoryProduct] = useState<ManagedProductItem | null>(null);
  const [productHistoryRows, setProductHistoryRows] = useState<ProductHistoryRow[]>([]);

  const activeProductItems = useMemo(
    () => productItems.filter((item) => (item.status ?? "active") === "active"),
    [productItems],
  );
  const archivedProductItems = useMemo(
    () => productItems.filter((item) => item.status === "archived"),
    [productItems],
  );
  const baseProductItems =
    productListMode === "archived" ? archivedProductItems : activeProductItems;
  const visibleProductItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const lowestPrice = (item: ManagedProductItem) =>
      item.variants.length
        ? Math.min(...item.variants.map((variant) => variant.price))
        : 0;
    const filtered = baseProductItems.filter((item) => {
      if (productCategoryFilter !== "all" && item.category !== productCategoryFilter) {
        return false;
      }
      if (productStockFilter !== "all" && item.stock !== productStockFilter) {
        return false;
      }
      if (q) {
        const haystack = `${item.name} ${item.sku ?? ""} ${item.barcode ?? ""} ${item.brand ?? ""} ${item.category} ${item.section} ${item.variants.map((variant) => `${variant.sku ?? ""} ${variant.barcode ?? ""}`).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (productSortBy) {
        case "name-desc":
          return b.name.localeCompare(a.name, "id");
        case "sku-asc":
          return (a.sku ?? "~").localeCompare(b.sku ?? "~", "id");
        case "price-asc":
          return lowestPrice(a) - lowestPrice(b);
        case "price-desc":
          return lowestPrice(b) - lowestPrice(a);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name, "id");
      }
    });
    return sorted;
  }, [baseProductItems, productSearch, productCategoryFilter, productStockFilter, productSortBy]);
  const recipeCostPreview = useMemo(
    () =>
      productVariants[0]
        ? recipeCostForVariantDraft(
            productRecipes,
            inventoryItems,
            productVariantDraftId(productVariants[0], 0),
          )
        : 0,
    [inventoryItems, productRecipes, productVariants],
  );
  const marginPreview = useMemo(() => {
    const valid = productVariants
      .map((variant) => {
        const price = Number(variant.price);
        // HPP resep (bahan baku) didahulukan; angka ketik hanya untuk varian tanpa resep.
        const baseCost = Number(recipeCostPreview || variant.baseCost || 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        return {
          label: variant.label.trim() || "Regular",
          price,
          baseCost: Number.isFinite(baseCost) ? baseCost : 0,
        };
      })
      .filter((row): row is { label: string; price: number; baseCost: number } =>
        Boolean(row),
      );
    if (!valid.length) return null;
    const first = valid[0];
    const margin = first.price - first.baseCost;
    const marginPct = first.price > 0 ? Math.round((margin / first.price) * 100) : 0;
    return { ...first, margin, marginPct };
  }, [productVariants, recipeCostPreview]);

  useEffect(() => {
    if (!canManageMenuProducts) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync bootstrap menu into local owner/admin manager
    setProductItems(menuItems as ManagedProductItem[]);
    void loadProductItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProductItems stable, mount-only fetch
  }, [canManageMenuProducts, menuItems]);

  // Cross-module refresh: order/void di POS invalidate tag `inventory`
  // (recipe auto-deduct / stock reverse) → refetch produk.
  useEffect(() => {
    return subscribeGarageCache(GARAGE_TAGS.inventory, () => {
      void loadProductItems();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loader stabil, subscribe sekali
  }, []);

  async function loadProductItems() {
    if (!canManageMenuProducts) return;
    setProductLoading(true);
    try {
      const [rows, categoryData] = await Promise.all([
        garageApi.get<ManagedProductItem[]>(`/api/menu?includeArchived=1&_=${Date.now()}`, { cache: "no-store" }),
        garageApi.get<{ categories: ProductCategoryRow[] }>("/api/products/categories?includeArchived=1", { cache: "no-store" }),
      ]);
      setProductItems(rows);
      setProductCategories(categoryData.categories);
      setCatalogRefreshKey((key) => key + 1);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Gagal memuat produk.");
    } finally {
      setProductLoading(false);
    }
  }

  async function refreshInventoryItems() {
    try {
      setFreshInventory(await garageApi.get<InventoryItem[]>(`/api/inventory?_=${Date.now()}`, { cache: "no-store" }));
    } catch {
      /* daftar lama tetap dipakai */
    }
  }

  function applyDraftRecipes() {
    setProductRecipes(productDraftRecipes.map((recipe, index) => ({ ...recipe, key: `draft-${Date.now()}-${index}` })));
  }

  function addRecipeLineFor(sku: string, unit: string) {
    setProductRecipes((current) => [
      ...current,
      { key: `recipe-${Date.now()}`, variantId: "all", inventorySku: sku, qty: "", unit, wastePct: "0" },
    ]);
  }

  function resetProductForm() {
    setProductDraftRecipes([]);
    setProductEditId("");
    setProductName("");
    setProductSku("");
    setProductPromoActive(false);
    setProductPromoPrice("");
    setProductStation("");
    setProductType("");
    setProductBrand("");
    setProductBarcode("");
    setProductBatchEligible(true);
    setProductShowInDigitalMenu(true);
    setProductFeatured(false);
    setProductDescription("");
    setProductCategory(productCategories.find((entry) => entry.status === "active")?.name ?? "Cemilan");
    setProductSection("Dapur");
    setProductPrep("10m");
    setProductStock("ready");
    setProductTags("");
    setProductVariants([{ key: "regular", label: "Regular", price: "", baseCost: "" }]);
    setProductRecipes([]);
    setProductImageFile(null);
    setProductImagePreview(null);
  }

  function onProductImageSelected(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setProductError("Format foto harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProductError("Ukuran foto maksimal 8 MB.");
      return;
    }
    setProductError(null);
    setProductImageFile(file);
    setProductImagePreview(URL.createObjectURL(file));
  }

  function clearProductImage() {
    setProductImageFile(null);
    setProductImagePreview(null);
    if (productImageInputRef.current) productImageInputRef.current.value = "";
  }

  function saveProductDraft() {
    if (typeof window === "undefined") return;
    const draft: ProductDraftState = {
      editId: productEditId,
      name: productName,
      sku: productSku,
      promoActive: productPromoActive,
      promoPrice: productPromoPrice,
      station: productStation,
      productType,
      brand: productBrand,
      barcode: productBarcode,
      batchEligible: productBatchEligible,
      showInDigitalMenu: productShowInDigitalMenu,
      featured: productFeatured,
      description: productDescription,
      category: productCategory,
      section: productSection,
      prep: productPrep,
      stock: productStock,
      tags: productTags,
      variants: productVariants,
      recipes: productRecipes,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
    setProductNotice("Draft produk tersimpan di browser ini.");
  }

  function clearProductDraft() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY);
  }

  function restoreProductDraft() {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY);
    if (!raw) return false;

    try {
      const draft = JSON.parse(raw) as Partial<ProductDraftState>;
      const category = draft.category ?? "Cemilan";
      // Kategori draft harus masih aktif di master kategori.
      const activeCategories = productCategories.filter((entry) => entry.status === "active");
      const validCategory: MenuCategory =
        !activeCategories.length || activeCategories.some((entry) => entry.name === category)
          ? category
          : activeCategories[0].name;
      const validStock =
        draft.stock === "ready" ||
        draft.stock === "limited" ||
        draft.stock === "sold_out"
          ? draft.stock
          : "ready";

      setProductEditId(typeof draft.editId === "string" ? draft.editId : "");
      setProductName(typeof draft.name === "string" ? draft.name : "");
      setProductSku(typeof draft.sku === "string" ? draft.sku : "");
      setProductPromoActive(Boolean(draft.promoActive));
      setProductPromoPrice(typeof draft.promoPrice === "string" ? draft.promoPrice : "");
      setProductStation(draft.station === "bar" || draft.station === "dapur" || draft.station === "none" ? draft.station : "");
      setProductType(draft.productType === "menu" || draft.productType === "retail" || draft.productType === "bundle" ? draft.productType : "");
      setProductBrand(typeof draft.brand === "string" ? draft.brand : "");
      setProductBarcode(typeof draft.barcode === "string" ? draft.barcode : "");
      setProductBatchEligible(draft.batchEligible !== false);
      setProductShowInDigitalMenu(draft.showInDigitalMenu !== false);
      setProductFeatured(Boolean(draft.featured));
      setProductDescription(typeof draft.description === "string" ? draft.description : "");
      setProductCategory(validCategory);
      setProductSection(typeof draft.section === "string" ? draft.section : "Dapur");
      setProductPrep(typeof draft.prep === "string" ? draft.prep : "10m");
      setProductStock(validStock);
      setProductTags(typeof draft.tags === "string" ? draft.tags : "");
      setProductVariants(
        Array.isArray(draft.variants) && draft.variants.length
          ? draft.variants
          : [{ key: "regular", label: "Regular", price: "", baseCost: "" }],
      );
      setProductRecipes(Array.isArray(draft.recipes) ? draft.recipes : []);
      setProductNotice("Draft terakhir dipulihkan.");
      return true;
    } catch {
      clearProductDraft();
      return false;
    }
  }

  function openAddProductDialog() {
    resetProductForm();
    setProductError(null);
    if (!restoreProductDraft()) {
      setProductNotice(null);
    }
    setProductDialogOpen(true);
  }

  function addProductVariant() {
    setProductVariants((current) => [
      ...current,
      { key: `variant-${Date.now()}`, label: "", price: "", baseCost: "" },
    ]);
  }

  function updateProductVariant(
    key: string,
    field: "label" | "price" | "baseCost" | "sku" | "barcode" | "sellUnit" | "unitContents",
    value: string,
  ) {
    setProductVariants((current) =>
      current.map((variant) =>
        variant.key === key ? { ...variant, [field]: value } : variant,
      ),
    );
  }

  function removeProductVariant(key: string) {
    setProductVariants((current) =>
      current.length <= 1 ? current : current.filter((variant) => variant.key !== key),
    );
  }

  function addProductRecipe() {
    const firstItem = inventoryItems[0];
    setProductRecipes((current) => [
      ...current,
      {
        key: `recipe-${Date.now()}`,
        variantId: "all",
        inventorySku: firstItem?.sku ?? "",
        qty: "",
        unit: firstItem?.unit ?? "unit",
        wastePct: "0",
      },
    ]);
  }

  function updateProductRecipe(
    key: string,
    field: "variantId" | "inventorySku" | "qty" | "unit" | "wastePct",
    value: string,
  ) {
    setProductRecipes((current) =>
      current.map((recipe) => {
        if (recipe.key !== key) return recipe;
        if (field === "inventorySku") {
          const item = inventoryItems.find((entry) => entry.sku === value);
          return { ...recipe, inventorySku: value, unit: item?.unit ?? recipe.unit };
        }
        return { ...recipe, [field]: value };
      }),
    );
  }

  function removeProductRecipe(key: string) {
    setProductRecipes((current) => current.filter((recipe) => recipe.key !== key));
  }

  async function uploadProductImage(itemId: string, file: File) {
    const imageForm = new FormData();
    imageForm.append("image", file);

    const imgRes = await fetch(`/api/menu/${encodeURIComponent(itemId)}/image`, {
      method: "POST",
      body: imageForm,
      credentials: "same-origin",
      cache: "no-store",
    });
    const imgPayload = (await imgRes.json().catch(() => ({}))) as {
      data?: { imageUrl?: string; product?: MenuItem | null };
      error?: { message?: string };
    };

    if (!imgRes.ok) {
      throw new Error(imgPayload.error?.message ?? "Upload foto gagal.");
    }

    const imageUrl = imgPayload.data?.imageUrl ?? imgPayload.data?.product?.imageUrl;
    if (!imageUrl) {
      throw new Error("Upload foto selesai, tapi server tidak mengembalikan URL foto.");
    }

    setProductItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...(imgPayload.data?.product ?? {}),
              imageUrl,
            }
          : item,
      ),
    );

    return imageUrl;
  }

  function buildProductVariantsPayload() {
    const variants = productVariants
      .map((variant, index) => {
        const label = variant.label.trim() || (index === 0 ? "Regular" : `Varian ${index + 1}`);
        const price = Number(variant.price);
        const variantId = productVariantDraftId(variant, index);
        const recipeBaseCost = recipeCostForVariantDraft(
          productRecipes,
          inventoryItems,
          variantId,
        );
        // Varian ber-resep: HPP dari bahan (server juga menghitung ulang live).
        const baseCost = Number(recipeBaseCost || variant.baseCost || 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        const unitContents = Number(variant.unitContents);
        return {
          id: variantId,
          label,
          price: Math.round(price),
          baseCost: Number.isFinite(baseCost) ? Math.max(0, Math.round(baseCost)) : 0,
          sortOrder: index,
          sku: variant.sku?.trim() || null,
          barcode: variant.barcode?.trim() || null,
          sellUnit: variant.sellUnit?.trim() || null,
          unitContents: Number.isFinite(unitContents) && unitContents > 0 ? unitContents : null,
        };
      })
      .filter(
        (
          variant,
        ): variant is {
          id: string;
          label: string;
          price: number;
          baseCost: number;
          sortOrder: number;
          sku: string | null;
          barcode: string | null;
          sellUnit: string | null;
          unitContents: number | null;
        } => Boolean(variant),
      );
    return variants;
  }

  function buildProductRecipesPayload() {
    return productRecipes
      .map((recipe) => {
        const qty = Number(recipe.qty);
        const wastePct = Number(recipe.wastePct || 0);
        if (!recipe.inventorySku || !Number.isFinite(qty) || qty <= 0) return null;
        return {
          variantId: recipe.variantId || "all",
          inventorySku: recipe.inventorySku,
          qty,
          unit: recipe.unit.trim() || "unit",
          wastePct: Number.isFinite(wastePct) ? Math.max(0, Math.min(100, wastePct)) : 0,
        };
      })
      .filter(
        (
          recipe,
        ): recipe is {
          variantId: string;
          inventorySku: string;
          qty: number;
          unit: string;
          wastePct: number;
        } => Boolean(recipe),
      );
  }

  function beginEditProduct(product: ManagedProductItem) {
    // Produk mitra: harga (riwayat harga mitra), foto, deskripsi dan Tersedia/Habis diatur di Partner Hub.
    if ((product.productType as string | undefined) === "partner") {
      setProductNotice(null);
      setProductError(
        `${product.name} adalah produk mitra${product.partner?.name ? ` ${product.partner.name}` : ""}. Ubah harga, foto, deskripsi dan Tersedia/Habis di Partner Hub → Kelola Mitra (menu samping "Partner Hub" atau alamat /partners).`,
      );
      return;
    }
    setProductEditId(product.id);
    setProductName(product.name);
    setProductSku(product.sku ?? "");
    setProductPromoActive(Boolean(product.promoActive));
    setProductPromoPrice(product.promoPrice ? String(product.promoPrice) : "");
    // Station sama dengan default kategori = "ikut kategori" (tampil Otomatis).
    const productCategoryRow = productCategories.find((entry) => entry.name === product.category);
    setProductStation(
      (product.station === "bar" || product.station === "dapur" || product.station === "none") &&
        product.station !== productCategoryRow?.station
        ? product.station
        : "",
    );
    setProductType(product.productType && product.productType !== productCategoryRow?.defaultProductType ? product.productType : "");
    setProductBrand(product.brand ?? "");
    setProductBarcode(product.barcode ?? "");
    setProductBatchEligible(product.batchEligible !== false);
    setProductShowInDigitalMenu(product.showInDigitalMenu !== false);
    setProductFeatured(Boolean(product.featured));
    setProductDescription(product.description ?? "");
    setProductCategory(product.category);
    setProductSection(product.section || (product.category === "Coffee" || product.category === "Non-Coffee" ? "Bar" : "Dapur"));
    setProductPrep(product.prep || "10m");
    setProductStock(product.stock);
    setProductTags(product.tags.join(", "));
    setProductImageFile(null);
    setProductImagePreview(product.imageUrl ?? null);
    setProductVariants(
      product.variants.length
        ? product.variants.map((variant, index) => ({
            key: `${product.id}-${variant.id}-${index}`,
            id: variant.id,
            label: variant.label,
            price: String(variant.price),
            baseCost: String(variant.baseCost ?? ""),
            sku: variant.sku ?? "",
            barcode: variant.barcode ?? "",
            sellUnit: variant.sellUnit ?? "",
            unitContents: variant.unitContents ? String(variant.unitContents) : "",
          }))
        : [{ key: "regular", label: "Regular", price: "", baseCost: "" }],
    );
    setProductRecipes(
      product.recipes?.length
        ? product.recipes.map((recipe, index) => ({
            key: `${product.id}-recipe-${index}`,
            variantId: recipe.variantId || "all",
            inventorySku: recipe.inventorySku,
            qty: String(recipe.qty),
            unit: recipe.unit,
            wastePct: String(recipe.wastePct ?? 0),
          }))
        : [],
    );
    setProductDraftRecipes(
      (product.draftRecipes ?? []).map((recipe, index) => ({
        key: `${product.id}-draft-${index}`,
        variantId: recipe.variantId || "all",
        inventorySku: recipe.inventorySku,
        qty: String(recipe.qty),
        unit: recipe.unit,
        wastePct: String(recipe.wastePct ?? 0),
      })),
    );
    setProductError(null);
    setProductNotice(null);
    setProductDialogOpen(true);
  }

  async function createProduct() {
    if (!productName.trim()) {
      setProductError("Nama produk wajib diisi.");
      return;
    }

    // Cegah "varian hilang diam-diam": varian yang sudah diisi (punya label atau
    // harga) tapi harga jualnya kosong/invalid harus memunculkan pesan jelas,
    // bukan di-drop tanpa kabar. Hanya baris benar-benar kosong yang diabaikan.
    const invalidVariants = productVariants
      .map((variant, index) => ({ variant, index }))
      .filter(({ variant }) => {
        const touched =
          variant.label.trim() !== "" ||
          variant.price.trim() !== "" ||
          variant.baseCost.trim() !== "";
        const price = Number(variant.price);
        const priceValid = Number.isFinite(price) && price > 0;
        return touched && !priceValid;
      });
    if (invalidVariants.length) {
      const names = invalidVariants
        .map(
          ({ variant, index }) =>
            `"${variant.label.trim() || (index === 0 ? "Regular" : `Varian ${index + 1}`)}"`,
        )
        .join(", ");
      setProductError(
        `Harga jual varian ${names} belum valid. Isi harga jual (> 0) atau hapus varian itu sebelum simpan.`,
      );
      return;
    }

    const variants = buildProductVariantsPayload();
    if (!variants.length) {
      setProductError("Isi minimal 1 varian dengan harga jual yang valid.");
      return;
    }

    // Promo aktif wajib punya harga promo valid (> 0).
    if (productPromoActive) {
      const promoNum = Number(productPromoPrice);
      if (!Number.isFinite(promoNum) || promoNum <= 0) {
        setProductError("Promo aktif tapi harga promo belum diisi. Isi harga promo (> 0) atau matikan promo.");
        return;
      }
    }
    const recipes = buildProductRecipesPayload();

    setProductAction(productEditId ? "edit" : "create");
    setProductError(null);
    setProductNotice(null);
    try {
      const tags = productTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const promoPriceNum = Number(productPromoPrice);
      const payload = {
        name: productName.trim(),
        sku: productSku.trim() || undefined,
        promoActive: productPromoActive,
        promoPrice:
          productPromoActive && Number.isFinite(promoPriceNum) && promoPriceNum > 0
            ? Math.round(promoPriceNum)
            : null,
        // Kosong = ikut kategori: kirim station/tipe default kategori agar edit
        // tidak mengunci nilai lama saat kategori diganti.
        station: productStation || productCategories.find((entry) => entry.name === productCategory)?.station || null,
        productType: productType || productCategories.find((entry) => entry.name === productCategory)?.defaultProductType || undefined,
        brand: productBrand.trim() || null,
        barcode: productBarcode.trim() || null,
        batchEligible: productBatchEligible,
        showInDigitalMenu: productShowInDigitalMenu,
        featured: productFeatured,
        description: productDescription.trim() || null,
        category: productCategory,
        stock: productStock,
        status: "active" as const,
        prep: productPrep.trim() || "10m",
        tags,
        variants,
        recipes,
      };
      const response = productEditId
        ? await garageApi.patch<{ product: MenuItem | null }>(
            `/api/menu/${encodeURIComponent(productEditId)}`,
            payload,
          )
        : await garageApi.post<{ product: MenuItem | null }>("/api/menu", payload);

      // Upload foto produk bila owner memilih file (butuh id produk).
      const savedId = productEditId || response.product?.id;
      let uploadedImageUrl: string | null = null;
      if (productImageFile && savedId) {
        try {
          uploadedImageUrl = await uploadProductImage(savedId, productImageFile);
        } catch (imgErr) {
          // Produk tetap tersimpan; jangan tutup dialog supaya owner bisa upload ulang.
          setProductError(
            imgErr instanceof Error
              ? `Produk tersimpan, tapi foto gagal diupload: ${imgErr.message}`
              : "Produk tersimpan, tapi foto gagal diupload.",
          );
          setProductAction(null);
          return;
        }
      }

      setProductNotice(
        `${response.product?.name ?? productName.trim()} berhasil ${productEditId ? "diupdate" : "ditambahkan"} ke POS dan QR menu${uploadedImageUrl ? " dengan foto baru" : ""}.`,
      );
      clearProductDraft();
      resetProductForm();
      setProductDialogOpen(false);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Produk gagal disimpan.");
    } finally {
      setProductAction(null);
    }
  }

  async function archiveProduct(product: ManagedProductItem) {
    if (!product) {
      setProductError("Pilih produk yang akan dihapus.");
      return;
    }

    const confirmed = window.confirm(`Hapus produk "${product.name}"?\n\nProduk hilang dari POS & menu digital.`);
    if (!confirmed) return;

    setProductAction(`archive:${product.id}`);
    setProductError(null);
    setProductNotice(null);
    try {
      // guard=1: produk yang pernah terjual tidak dihapus permanen (laporan & HPP tetap utuh).
      const response = await garageApi.delete<{
        deleted: { id: string; name: string; usedInOrders: number; status: string };
      }>(`/api/menu/${encodeURIComponent(product.id)}?guard=1`);
      setProductNotice(`${response.deleted.name} dihapus.`);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      const code = err instanceof GarageApiError ? err.code : null;
      if (code === "MENU_DELETE_BLOCKED" || code === "MENU_IN_EVENT") {
        // Sudah terjual / dipakai event → tawarkan Arsipkan (bisa dipulihkan kapan saja).
        const archive = window.confirm(
          `${err instanceof Error ? err.message : ""}\n\nArsipkan "${product.name}" sekarang? Bisa dipulihkan kapan saja.`,
        );
        if (archive) {
          try {
            await garageApi.patch(`/api/menu/${encodeURIComponent(product.id)}`, { status: "archived" });
            setProductNotice(`${product.name} diarsipkan — hilang dari POS & menu digital, riwayat tetap utuh.`);
            await onMenuChanged();
            await loadProductItems();
          } catch (archiveErr) {
            setProductError(archiveErr instanceof Error ? archiveErr.message : "Produk gagal diarsipkan.");
          }
        }
      } else {
        setProductError(err instanceof Error ? err.message : "Produk gagal dihapus.");
      }
    } finally {
      setProductAction(null);
    }
  }

  async function restoreProduct(product: ManagedProductItem) {
    setProductAction(`restore:${product.id}`);
    setProductError(null);
    setProductNotice(null);
    try {
      const response = await garageApi.patch<{ product: MenuItem | null }>(
        `/api/menu/${encodeURIComponent(product.id)}`,
        { status: "active" },
      );
      setProductNotice(`${response.product?.name ?? product.name} aktif kembali di POS dan QR menu.`);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Produk gagal direstore.");
    } finally {
      setProductAction(null);
    }
  }

  async function updateProductStock(product: ManagedProductItem, stock: "ready" | "limited" | "sold_out") {
    setProductAction(`stock:${product.id}`);
    setProductError(null);
    setProductNotice(null);
    try {
      await garageApi.patch(`/api/menu/${encodeURIComponent(product.id)}`, { stock });
      setProductNotice(`${product.name} sekarang ${stock === "sold_out" ? "habis" : stock}.`);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Stok produk gagal diupdate.");
    } finally {
      setProductAction(null);
    }
  }

  async function openProductHistory(product: ManagedProductItem) {
    setProductHistoryProduct(product);
    setProductHistoryRows([]);
    setProductHistoryOpen(true);
    setProductHistoryLoading(true);
    setProductError(null);
    try {
      const response = await garageApi.get<{ rows: ProductHistoryRow[] }>(
        `/api/menu/${encodeURIComponent(product.id)}?history=1&limit=30`,
        { cache: "no-store" },
      );
      setProductHistoryRows(response.rows);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Riwayat produk gagal dimuat.");
    } finally {
      setProductHistoryLoading(false);
    }
  }

  async function downloadInventoryExport(format: "xlsx" | "pdf") {
    setExportingInventory(format);
    setProductError(null);
    try {
      const response = await fetch(`/api/inventory/export?format=${format}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export Produk + Gudang gagal.");
      }
      const todayIso = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFileName({ kind: "PRODUK_GUDANG", from: todayIso, to: todayIso, ext: format });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Export Produk + Gudang gagal.");
    } finally {
      setExportingInventory(null);
    }
  }

  return (
    <section className="garage-finance-module min-w-0 space-y-4">
      {onNavigateModule ? (
        <GarageConnectedNav
          role={role}
          preset="inventory"
          activeModule="inventory"
          onNavigate={onNavigateModule}
        />
      ) : null}
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#f5a742]">
              Produk Manajemen
            </p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
              Produk Manajemen & Gudang
            </h1>
            <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
              Produk jualan, resep/BOM, HPP, stok bahan, opname, smart reorder, dan export tetap saling terhubung.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
              onClick={() => void downloadInventoryExport("xlsx")}
              disabled={Boolean(exportingInventory)}
            >
              <FileText className="size-3.5" />
              {exportingInventory === "xlsx" ? "Export..." : "Export Excel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
              onClick={() => void downloadInventoryExport("pdf")}
              disabled={Boolean(exportingInventory)}
            >
              <FileText className="size-3.5" />
              {exportingInventory === "pdf" ? "Export..." : "Export PDF"}
            </Button>
          </div>
        </div>
      </div>

      {menuImportOpen ? (
        <BulkImportDialog<MenuImportResult>
          config={{
            title: "Impor Massal Produk Menu (Excel / CSV)",
            description:
              "1 baris = 1 varian harga. Produk lama dicocokkan lewat SKU lalu nama — tidak dibuat ganda. HPP dihitung dari resep, bukan dari file.",
            endpoint: "/api/menu/import",
            templates: [
              { label: "Template Excel", href: "/api/menu/import/template?format=xlsx" },
              { label: "Template CSV", href: "/api/menu/import/template?format=csv" },
            ],
            summarize: (r) => [
              { label: "Produk baru", value: r.productsCreated, tone: "good" },
              { label: "Produk diubah", value: r.productsUpdated, tone: "warn" },
              { label: "Tidak berubah", value: r.productsUnchanged, tone: "muted" },
              { label: "Baris error", value: r.errorRows, tone: r.errorRows ? "bad" : "muted" },
            ],
            pendingChanges: (r) => r.productsCreated + r.productsUpdated,
          }}
          onClose={() => setMenuImportOpen(false)}
          onImported={() => void onMenuChanged()}
        />
      ) : null}

      {canManageMenuProducts && (
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Produk Manajemen</CardTitle>
                <CardDescription>
                  Produk F&B & retail: kategori dinamis, tipe produk, harga jual, HPP/harga modal, SKU/barcode, status POS/QR, dan ekspor Excel/PDF.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="garage-press h-8 gap-1.5 bg-[#d11a2a] px-3 text-xs text-white hover:bg-[#b91524]"
                  onClick={openAddProductDialog}
                >
                  <Plus className="size-3.5" />
                  Add Produk
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-8 gap-1.5 border-[#f5a742]/55 bg-[#f5a742]/10 px-3 text-xs text-[#ffd08a]"
                  onClick={() => setCategoryManagerOpen(true)}
                >
                  <Boxes className="size-3.5" />
                  Kelola Kategori
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-8 gap-1.5 px-3 text-xs"
                  onClick={() => setMenuImportOpen(true)}
                >
                  <Upload className="size-3.5" />
                  Impor Massal
                </Button>
                <Badge className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]">
                  {activeProductItems.length} aktif
                </Badge>
                <Badge className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]">
                  {archivedProductItems.length} arsip
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-8 gap-1.5 border-[#34343c] bg-white/[0.04] px-2 text-xs"
                  onClick={() => void loadProductItems()}
                  disabled={productLoading}
                >
                  <RefreshCw className={`size-3.5 ${productLoading ? "animate-spin" : ""}`} />
                  Sync
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {productError && (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Produk</AlertTitle>
                <AlertDescription>{productError}</AlertDescription>
              </Alert>
            )}
            {productNotice && (
              <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
                <Check className="size-4" />
                <AlertTitle>Produk tersimpan</AlertTitle>
                <AlertDescription>{productNotice}</AlertDescription>
              </Alert>
            )}

            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
              <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#0b0b0e] p-0 text-[#f4f4f5] shadow-2xl shadow-black/60 sm:max-w-6xl">
                <div className="flex flex-col gap-3 border-b border-[#34343c] bg-[#18181f] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <DialogHeader className="space-y-1 text-left">
                    <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
                      <Boxes className="size-5 text-[#f5a742]" />
                      {productEditId ? "Edit Produk" : "Add New Product"}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-[#d4d4d8]">
                      Setup produk F&B Garage: harga jual, HPP, dan resep bahan stok.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 gap-2 border-[#f5a742]/55 bg-[#f5a742]/10 px-3 text-xs text-[#ffd08a] hover:bg-[#f5a742]/18"
                      onClick={saveProductDraft}
                    >
                      <FileText className="size-3.5" />
                      Save Draft
                    </Button>
                    <Button
                      type="button"
                      className="garage-press h-9 gap-2 bg-[#d11a2a] px-4 text-xs text-white hover:bg-[#b91524]"
                      onClick={() => void createProduct()}
                      disabled={productAction === "create" || productAction === "edit"}
                    >
                      {productEditId ? <Check className="size-4" /> : <Plus className="size-4" />}
                      {productAction === "create" || productAction === "edit"
                        ? "Menyimpan..."
                        : productEditId
                          ? "Save Changes"
                          : "Add Product"}
                    </Button>
                  </div>
                </div>

                <ProductFormPanel
                  name={productName}
                  onNameChange={setProductName}
                  sku={productSku}
                  onSkuChange={setProductSku}
                  promoActive={productPromoActive}
                  onPromoActiveChange={setProductPromoActive}
                  promoPrice={productPromoPrice}
                  onPromoPriceChange={setProductPromoPrice}
                  category={productCategory}
                  onCategoryChange={(value) => {
                    setProductCategory(value);
                    // Section ikut kategori di server (bar → Bar, dapur → Dapur, lainnya → nama kategori).
                    setProductSection("");
                  }}
                  station={productStation}
                  onStationChange={setProductStation}
                  categories={productCategories}
                  productType={productType}
                  onProductTypeChange={setProductType}
                  brand={productBrand}
                  onBrandChange={setProductBrand}
                  barcode={productBarcode}
                  onBarcodeChange={setProductBarcode}
                  batchEligible={productBatchEligible}
                  onBatchEligibleChange={setProductBatchEligible}
                  showInDigitalMenu={productShowInDigitalMenu}
                  onShowInDigitalMenuChange={setProductShowInDigitalMenu}
                  featured={productFeatured}
                  onFeaturedChange={setProductFeatured}
                  description={productDescription}
                  onDescriptionChange={setProductDescription}
                  prep={productPrep}
                  onPrepChange={setProductPrep}
                  stock={productStock}
                  onStockChange={setProductStock}
                  tags={productTags}
                  onTagsChange={setProductTags}
                  onReset={() => {
                    resetProductForm();
                    clearProductDraft();
                    setProductNotice("Form produk direset.");
                  }}
                  variants={productVariants}
                  onAddVariant={addProductVariant}
                  onUpdateVariant={updateProductVariant}
                  onRemoveVariant={removeProductVariant}
                  recipes={productRecipes}
                  onAddRecipe={addProductRecipe}
                  onUpdateRecipe={updateProductRecipe}
                  onRemoveRecipe={removeProductRecipe}
                  draftRecipes={productDraftRecipes}
                  onUseDraftRecipes={applyDraftRecipes}
                  onAddRecipeLine={addRecipeLineFor}
                  onInventoryChanged={refreshInventoryItems}
                  inventoryItems={inventoryItems}
                  recipeCostPreview={recipeCostPreview}
                  marginPreview={marginPreview}
                  imagePreview={productImagePreview}
                  imageInputRef={productImageInputRef}
                  onImageSelected={onProductImageSelected}
                  onClearImage={clearProductImage}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={productHistoryOpen} onOpenChange={setProductHistoryOpen}>
              <DialogContent className="max-h-[86svh] overflow-hidden border-[#34343c] bg-[#0b0b0e] text-[#f4f4f5] sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="size-5 text-[#f5a742]" />
                    Riwayat Produk
                  </DialogTitle>
                  <DialogDescription>
                    {productHistoryProduct?.name ?? "Produk"} - perubahan harga, HPP, resep, status, dan delete permanen.
                  </DialogDescription>
                </DialogHeader>
                <div className="garage-scrollbar max-h-[62svh] space-y-2 overflow-y-auto pr-1">
                  {productHistoryLoading ? (
                    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4 text-sm text-[#d6d6dc]">
                      Memuat riwayat produk...
                    </div>
                  ) : productHistoryRows.length ? (
                    productHistoryRows.map((row) => {
                      const fields = Array.isArray(row.metadata?.fields)
                        ? row.metadata.fields.join(", ")
                        : null;
                      const variants = Array.isArray(row.metadata?.variants)
                        ? row.metadata.variants.length
                        : null;
                      const recipeLines =
                        typeof row.metadata?.recipeLines === "number"
                          ? row.metadata.recipeLines
                          : null;
                      return (
                        <div key={row.id} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-black text-white">{row.action}</p>
                              <p className="mt-1 text-xs text-[#a1a1aa]">
                                {new Date(row.createdAt).toLocaleString("id-ID")} - {row.actor}
                              </p>
                            </div>
                            <Badge className="w-fit border-[#34343c] bg-black/20 text-[#d6d6dc]">
                              {row.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[#d6d6dc]">
                            {fields ? (
                              <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                                Field: {fields}
                              </span>
                            ) : null}
                            {variants !== null ? (
                              <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                                Varian: {variants}
                              </span>
                            ) : null}
                            {recipeLines !== null ? (
                              <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                                Resep: {recipeLines} bahan
                              </span>
                            ) : null}
                            <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                              Device: {row.device}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-md border border-dashed border-[#34343c] p-4 text-center text-sm text-[#888]">
                      Belum ada riwayat audit untuk produk ini.
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#34343c] bg-white/[0.04]"
                    onClick={() => setProductHistoryOpen(false)}
                  >
                    Tutup
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Separator className="bg-[#34343c]" />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1 rounded-md border border-[#34343c] bg-white/[0.04] p-1">
                {(["catalog", "active", "archived", "digital"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProductListMode(mode)}
                    className={`rounded px-3 py-1.5 text-xs font-black transition ${
                      productListMode === mode
                        ? "bg-[#d11a2a] text-white"
                        : "text-garage-dim hover:text-white"
                    }`}
                  >
                    {mode === "catalog"
                      ? "Dashboard Produk"
                      : mode === "active"
                        ? "Produk Aktif"
                        : mode === "archived"
                          ? "Produk Arsip"
                          : "Menu Digital"}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                onClick={() => void loadProductItems()}
                disabled={productLoading}
              >
                <RefreshCw className={`size-3.5 ${productLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <CategoryManagerDialog
              open={categoryManagerOpen}
              onOpenChange={setCategoryManagerOpen}
              categories={productCategories}
              products={productItems}
              onChanged={async () => {
                await loadProductItems();
                await onMenuChanged();
              }}
              onShowProducts={(categoryId) => {
                setCatalogFocusCategoryId(categoryId);
                setProductListMode("catalog");
                setCategoryManagerOpen(false);
              }}
            />

            {productListMode === "catalog" ? (
              <ProductCatalogCenter
                refreshKey={catalogRefreshKey}
                focusCategoryId={catalogFocusCategoryId}
                onOpenCategories={() => setCategoryManagerOpen(true)}
                onChanged={async () => {
                  await loadProductItems();
                  await onMenuChanged();
                }}
                onEditProduct={(productId) => {
                  const product = productItems.find((item) => item.id === productId);
                  if (product) beginEditProduct(product);
                  else setProductError("Produk belum termuat. Klik Refresh lalu coba lagi.");
                }}
              />
            ) : productListMode === "digital" ? (
              <DigitalMenuManager
                items={activeProductItems}
                onChanged={async () => {
                  await loadProductItems();
                  await onMenuChanged();
                }}
              />
            ) : (
            <>
            {/* Toolbar filter & sort produk (B2) */}
            <div className="grid gap-2 rounded-md border border-[#34343c] bg-white/[0.03] p-2 sm:grid-cols-2 lg:grid-cols-[1fr_150px_140px_160px]">
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Cari nama atau SKU produk…"
                className="h-9 border-[#34343c] bg-black/20 text-sm"
              />
              <Select
                value={productCategoryFilter}
                onValueChange={(value) => setProductCategoryFilter(value as "all" | MenuCategory)}
              >
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua kategori</SelectItem>
                  {productCategories
                    .filter((entry) => entry.status !== "archived")
                    .map((entry) => (
                      <SelectItem key={entry.id} value={entry.name}>
                        {entry.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select
                value={productStockFilter}
                onValueChange={(value) =>
                  setProductStockFilter(value as "all" | "ready" | "limited" | "sold_out")
                }
              >
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Stok" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua stok</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                  <SelectItem value="sold_out">Habis</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={productSortBy}
                onValueChange={(value) =>
                  setProductSortBy(value as typeof productSortBy)
                }
              >
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Nama A → Z</SelectItem>
                  <SelectItem value="name-desc">Nama Z → A</SelectItem>
                  <SelectItem value="sku-asc">SKU A → Z</SelectItem>
                  <SelectItem value="price-asc">Harga termurah</SelectItem>
                  <SelectItem value="price-desc">Harga termahal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="px-1 text-xs text-[#888]">
              Menampilkan {visibleProductItems.length} produk
              {productSearch.trim() || productCategoryFilter !== "all" || productStockFilter !== "all"
                ? " (terfilter)"
                : ""}
              .
            </p>

            {/* Select-all + bar aksi massal aman — export produk terpilih (NAV_ACTION_AUDIT §1.7). */}
            {visibleProductItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 px-1">
                <label className="flex items-center gap-2 text-xs text-[#b8b8bf]">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua produk"
                    className="size-4 cursor-pointer accent-[#d11a2a]"
                    checked={visibleProductItems.length > 0 && visibleProductItems.every((p) => productBulkIds.has(p.id))}
                    onChange={() => toggleProductBulkAll(visibleProductItems.map((p) => p.id))}
                  />
                  Pilih semua
                </label>
                {productBulkIds.size > 0 && (
                  <>
                    <span className="text-xs font-semibold text-white">{productBulkIds.size} terpilih</span>
                    <button
                      type="button"
                      onClick={exportSelectedProductsCsv}
                      className="inline-flex items-center gap-1.5 rounded border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-1 text-xs font-semibold text-[#ffd79a] hover:border-[#f5a742]/70 hover:text-white"
                    >
                      <Download className="size-3.5" /> Export CSV terpilih
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductBulkIds(new Set())}
                      className="rounded border border-white/15 px-2.5 py-1 text-xs text-[#d0d0d6] hover:border-white/40 hover:text-white"
                    >
                      Batal pilih
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-md border border-[#34343c]">
              {visibleProductItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#888]">
                  {baseProductItems.length === 0
                    ? productListMode === "active"
                      ? "Belum ada produk aktif."
                      : "Belum ada produk arsip."
                    : "Tidak ada produk yang cocok dengan filter."}
                </div>
              ) : (
                <div className="divide-y divide-[#34343c]">
                  {visibleProductItems.map((item) => (
                    <div
                      key={item.id}
                      className={`grid gap-3 p-3 lg:grid-cols-[1fr_140px_130px_260px] lg:items-center ${productBulkIds.has(item.id) ? "bg-[#d11a2a]/10" : "bg-white/[0.03]"}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${item.name}`}
                          className="size-4 shrink-0 cursor-pointer accent-[#d11a2a]"
                          checked={productBulkIds.has(item.id)}
                          onChange={() => toggleProductBulk(item.id)}
                        />
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#34343c] bg-[#15151b]">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <ImageIcon className="size-5 text-[#5b5b66]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            {item.sku ? (
                              <span className="shrink-0 rounded border border-[#34343c] bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-[#d4d4d8]">
                                {item.sku}
                              </span>
                            ) : null}
                            <p className="truncate font-black text-white">{item.name}</p>
                            {item.promoActive && item.promoPrice ? (
                              <span className="shrink-0 rounded bg-[#d11a2a] px-1.5 py-0.5 text-[10px] font-black text-white">
                                PROMO
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-[#888]">
                            {item.category} · {item.section} · {item.prep} · {item.variants.length} varian
                            {item.promoActive && item.promoPrice ? (
                              <span className="ml-1 text-[#ffb4bd]">
                                · Promo {currency.format(item.promoPrice)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={
                          item.stock === "sold_out"
                            ? "w-fit border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]"
                            : item.stock === "limited"
                              ? "w-fit border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]"
                              : "w-fit border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]"
                        }
                      >
                        {item.stock === "sold_out" ? "Habis" : item.stock}
                      </Badge>
                      <Select
                        value={item.stock}
                        onValueChange={(value) =>
                          void updateProductStock(
                            item,
                            value as "ready" | "limited" | "sold_out",
                          )
                        }
                        disabled={productAction === `stock:${item.id}` || item.status === "archived"}
                      >
                        <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ready">Ready</SelectItem>
                          <SelectItem value="limited">Limited</SelectItem>
                          <SelectItem value="sold_out">Habis</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {productListMode === "active" ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                              onClick={() => void openProductHistory(item)}
                            >
                              <History className="size-3.5" />
                              Riwayat
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                              onClick={() => beginEditProduct(item)}
                            >
                              <Settings className="size-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#d11a2a]/55 bg-[#d11a2a]/10 px-3 text-xs text-[#ffc2c8] hover:bg-[#d11a2a]/18"
                              onClick={() => void archiveProduct(item)}
                              disabled={productAction === `archive:${item.id}`}
                            >
                              <Archive className="size-3.5" />
                              Hapus
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                              onClick={() => void openProductHistory(item)}
                            >
                              <History className="size-3.5" />
                              Riwayat
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#22c55e]/45 bg-[#22c55e]/12 px-3 text-xs text-[#bbf7d0]"
                              onClick={() => void restoreProduct(item)}
                              disabled={productAction === `restore:${item.id}`}
                            >
                              <Check className="size-3.5" />
                              Restore
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ─── SETTINGS VIEW ───────────────────────────────────────────
// Central pengaturan untuk semua fitur Garage OS. Tabbed UI:
// POS Billing, Approval, Branding, Notifikasi, Printer, Loyalty.
// Setiap field punya default dari server (DEFAULT_APP_SETTINGS) supaya
// kosong terisi fallback yang masuk akal.
// Alias ke AppSettings canonical — sebelumnya duplikat yang sering ketinggalan
// saat key baru ditambah. Sekarang tipe sinkron otomatis.
