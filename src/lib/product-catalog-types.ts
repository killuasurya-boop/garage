// Tipe & konstanta Manajemen Produk (aman untuk klien — tanpa akses DB).
// Kategori produk dinamis (tabel product_categories) + tipe produk yang
// menentukan cara HPP & kelengkapan data dinilai.

export const PRODUCT_TYPES = ["menu", "retail", "bundle"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  menu: "Menu siap jual",
  retail: "Produk retail",
  bundle: "Paket / bundle",
};

export const CATEGORY_KINDS = ["fnb", "retail", "operational"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  fnb: "F&B",
  retail: "Retail",
  operational: "Operasional",
};

export const CATEGORY_STATIONS = ["bar", "dapur", "none"] as const;
export type CategoryStation = (typeof CATEGORY_STATIONS)[number];
export const CATEGORY_STATION_LABEL: Record<CategoryStation, string> = {
  bar: "Bar (tiket bar)",
  dapur: "Dapur (tiket dapur)",
  none: "Langsung kasir (tanpa tiket)",
};

export const POS_GROUPS = ["Dapur", "Bar", "Lainnya"] as const;
export type PosGroup = (typeof POS_GROUPS)[number];

export const CATEGORY_STATUSES = ["active", "inactive", "archived"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];
export const CATEGORY_STATUS_LABEL: Record<CategoryStatus, string> = {
  active: "Aktif",
  inactive: "Nonaktif",
  archived: "Arsip",
};

export type ProductCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  kind: CategoryKind;
  defaultProductType: ProductType;
  station: CategoryStation;
  posGroup: PosGroup;
  skuPrefix: string | null;
  icon: string | null;
  sortOrder: number;
  status: CategoryStatus;
  archivedAt: string | null;
  activeProducts: number;
  archivedProducts: number;
  createdAt: string;
  updatedAt: string;
};

/** Contoh struktur kategori (master prompt owner). Hanya saran — dibuat bila owner klik. */
export const SUGGESTED_CATEGORIES: Array<{
  name: string;
  kind: CategoryKind;
  defaultProductType: ProductType;
  station: CategoryStation;
  posGroup: PosGroup;
  skuPrefix: string;
  /** Nama kategori lama yang setara → jangan sarankan bila sudah ada (anti duplikat). */
  aliases?: string[];
}> = [
  { name: "Coffee Based", kind: "fnb", defaultProductType: "menu", station: "bar", posGroup: "Bar", skuPrefix: "COF", aliases: ["Coffee", "Kopi"] },
  { name: "Non-Coffee", kind: "fnb", defaultProductType: "menu", station: "bar", posGroup: "Bar", skuPrefix: "NCOF" },
  { name: "Tea", kind: "fnb", defaultProductType: "menu", station: "bar", posGroup: "Bar", skuPrefix: "TEA", aliases: ["Teh"] },
  { name: "Chocolate", kind: "fnb", defaultProductType: "menu", station: "bar", posGroup: "Bar", skuPrefix: "CHO", aliases: ["Coklat"] },
  { name: "Signature Drinks", kind: "fnb", defaultProductType: "menu", station: "bar", posGroup: "Bar", skuPrefix: "SIG", aliases: ["Signature"] },
  { name: "Manual Brew", kind: "fnb", defaultProductType: "menu", station: "bar", posGroup: "Bar", skuPrefix: "MBR" },
  { name: "Makanan Berat", kind: "fnb", defaultProductType: "menu", station: "dapur", posGroup: "Dapur", skuPrefix: "FOOD", aliases: ["Makanan"] },
  { name: "Snack", kind: "fnb", defaultProductType: "menu", station: "dapur", posGroup: "Dapur", skuPrefix: "SNCK", aliases: ["Cemilan"] },
  { name: "Bakery", kind: "fnb", defaultProductType: "menu", station: "dapur", posGroup: "Dapur", skuPrefix: "BKR" },
  { name: "Rokok", kind: "retail", defaultProductType: "retail", station: "none", posGroup: "Lainnya", skuPrefix: "RKK" },
  { name: "Air Mineral", kind: "retail", defaultProductType: "retail", station: "none", posGroup: "Lainnya", skuPrefix: "MIN", aliases: ["Minuman Botol", "Mineral"] },
  { name: "Minuman Kemasan", kind: "retail", defaultProductType: "retail", station: "none", posGroup: "Lainnya", skuPrefix: "MKM" },
  { name: "Snack Kemasan", kind: "retail", defaultProductType: "retail", station: "none", posGroup: "Lainnya", skuPrefix: "SKM" },
  { name: "Produk Retail Lainnya", kind: "retail", defaultProductType: "retail", station: "none", posGroup: "Lainnya", skuPrefix: "RTL" },
];

/** Satuan jual umum — bebas diketik, ini hanya saran isian. */
export const SELL_UNIT_SUGGESTIONS = ["cup", "porsi", "pcs", "botol", "gelas", "galon", "bungkus", "batang", "slop", "karton"];

export const HPP_STATUSES = ["complete", "unverified", "partial", "missing"] as const;
export type HppStatus = (typeof HPP_STATUSES)[number];
export const HPP_STATUS_LABEL: Record<HppStatus, string> = {
  complete: "Lengkap",
  unverified: "Manual (belum ada resep)",
  partial: "Sebagian varian",
  missing: "Belum ada",
};

export const PRODUCT_ISSUES = ["no_category", "no_sku", "no_barcode", "no_price", "hpp_incomplete", "no_sell_unit"] as const;
export type ProductIssue = (typeof PRODUCT_ISSUES)[number];
export const PRODUCT_ISSUE_LABEL: Record<ProductIssue, string> = {
  no_category: "Tanpa kategori aktif",
  no_sku: "Tanpa SKU",
  no_barcode: "Retail tanpa barcode",
  no_price: "Tanpa harga jual",
  hpp_incomplete: "HPP belum lengkap",
  no_sell_unit: "Retail tanpa satuan jual",
};

export type CatalogVariant = {
  id: string;
  label: string;
  price: number;
  baseCost: number;
  sku: string | null;
  barcode: string | null;
  sellUnit: string | null;
  unitContents: number | null;
  hasRecipe: boolean;
};

export type CatalogRow = {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  category: string;
  categoryKind: CategoryKind | null;
  categoryStatus: CategoryStatus | null;
  productType: ProductType;
  status: "active" | "archived";
  stock: "ready" | "limited" | "sold_out";
  showInDigitalMenu: boolean;
  station: string | null;
  sortOrder: number;
  variants: CatalogVariant[];
  variantCount: number;
  priceMin: number;
  priceMax: number;
  costMin: number;
  costMax: number;
  recipeLines: number;
  hppStatus: HppStatus;
  /** Margin kotor terendah antar varian (%) — null bila HPP belum lengkap. */
  marginPct: number | null;
  /** Laba kotor per unit terendah antar varian — null bila HPP belum lengkap. */
  grossProfitMin: number | null;
  salesQty: number;
  salesRevenue: number;
  issues: ProductIssue[];
  createdAt: string;
  updatedAt: string;
};

export const CATALOG_KPI_KEYS = [
  "total",
  "active",
  "archived",
  "categories",
  "ready",
  "limited",
  "soldOut",
  "noSku",
  "noBarcode",
  "noPrice",
  "hppIncomplete",
  "menu",
  "retail",
  "bundle",
  "variants",
  "incomplete",
] as const;
export type CatalogKpiKey = (typeof CATALOG_KPI_KEYS)[number];
export type CatalogKpis = Record<CatalogKpiKey, number>;

export const CATALOG_SORT_KEYS = ["name", "sku", "category", "price", "cost", "margin", "salesQty", "updatedAt"] as const;
export type CatalogSortKey = (typeof CATALOG_SORT_KEYS)[number];

export type CatalogQuery = {
  q?: string;
  categoryId?: string;
  productType?: ProductType;
  status?: "active" | "archived" | "all";
  stock?: "ready" | "limited" | "sold_out";
  hpp?: "has" | "missing" | "complete" | "incomplete";
  issue?: ProductIssue | "any";
  digital?: "shown" | "hidden";
  /** Periode penjualan (YYYY-MM-DD, WIB) untuk kolom qty terjual. */
  from?: string;
  to?: string;
  sort?: CatalogSortKey;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export const CATALOG_BULK_ACTIONS = ["activate", "archive", "stock", "digital", "move_category", "product_type"] as const;
export type CatalogBulkAction = (typeof CATALOG_BULK_ACTIONS)[number];

export const PRODUCT_EXPORT_TYPES = [
  { id: "master", label: "Master seluruh produk", file: "Master_Produk" },
  { id: "kategori", label: "Master kategori", file: "Master_Kategori" },
  { id: "varian", label: "Daftar varian & SKU", file: "Varian_SKU" },
  { id: "barcode", label: "Daftar barcode", file: "Barcode" },
  { id: "harga", label: "Daftar harga modal & harga jual", file: "Harga_Modal_Jual" },
  { id: "hpp-margin", label: "Laporan HPP & margin", file: "HPP_Margin" },
  { id: "retail", label: "Laporan produk retail", file: "Produk_Retail" },
  { id: "status-stok", label: "Produk limited & habis", file: "Status_Stok_Produk" },
  { id: "penjualan", label: "Kuantitas penjualan / terlaris", file: "Penjualan_Produk" },
  { id: "kelengkapan", label: "Produk dengan data belum lengkap", file: "Data_Belum_Lengkap" },
] as const;
export type ProductExportType = (typeof PRODUCT_EXPORT_TYPES)[number]["id"];

/** Nama file ekspor: GarageOS_Master_Produk_2026-10-19.xlsx */
export function productExportFileName(type: ProductExportType, date: string, ext: "xlsx" | "pdf") {
  const entry = PRODUCT_EXPORT_TYPES.find((item) => item.id === type);
  return `GarageOS_${entry?.file ?? "Produk"}_${date}.${ext}`;
}
