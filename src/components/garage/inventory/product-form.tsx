"use client";

import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency, type MenuCategory, unitCostCurrency } from "@/lib/garage-data";
import type { InventoryItem } from "@/lib/garage-api-types";
import {
  PRODUCT_TYPE_LABEL,
  SELL_UNIT_SUGGESTIONS,
  type ProductCategoryRow,
  type ProductType,
} from "@/lib/product-catalog-types";
import {
  Camera,
  ChefHat,
  Coffee,
  Image as ImageIcon,
  PackagePlus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  productVariantDraftId,
  recipeCostForVariantDraft,
  variantDraftHasRecipe,
  type ProductRecipeDraft,
  type ProductVariantDraft,
} from "@/components/garage/inventory/product-draft";
import {
  NewMaterialPanel,
  OpeningStockPanel,
  RecipeLineStock,
  materialStockLabel,
} from "@/components/garage/inventory/recipe-stock-tools";

export interface ProductFormPanelProps {
  // Detail
  name: string;
  onNameChange: (value: string) => void;
  sku: string;
  onSkuChange: (value: string) => void;
  promoActive: boolean;
  onPromoActiveChange: (value: boolean) => void;
  promoPrice: string;
  onPromoPriceChange: (value: string) => void;
  // Production Hub: routing station ("" = otomatis dari kategori) & Smart Batch.
  station: "" | "bar" | "dapur" | "none";
  onStationChange: (value: "" | "bar" | "dapur" | "none") => void;
  // Master kategori dinamis + tipe produk ("" = ikut default kategori).
  categories: ProductCategoryRow[];
  productType: "" | ProductType;
  onProductTypeChange: (value: "" | ProductType) => void;
  brand: string;
  onBrandChange: (value: string) => void;
  barcode: string;
  onBarcodeChange: (value: string) => void;
  batchEligible: boolean;
  onBatchEligibleChange: (value: boolean) => void;
  // Menu digital (QR /order).
  showInDigitalMenu: boolean;
  onShowInDigitalMenuChange: (value: boolean) => void;
  featured: boolean;
  onFeaturedChange: (value: boolean) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  category: MenuCategory;
  onCategoryChange: (value: MenuCategory) => void;
  prep: string;
  onPrepChange: (value: string) => void;
  stock: "ready" | "limited" | "sold_out";
  onStockChange: (value: "ready" | "limited" | "sold_out") => void;
  tags: string;
  onTagsChange: (value: string) => void;
  onReset: () => void;

  // Varian
  variants: ProductVariantDraft[];
  onAddVariant: () => void;
  onUpdateVariant: (
    key: string,
    field: "label" | "price" | "baseCost" | "sku" | "barcode" | "sellUnit" | "unitContents",
    value: string,
  ) => void;
  onRemoveVariant: (key: string) => void;

  // Resep
  recipes: ProductRecipeDraft[];
  onAddRecipe: () => void;
  onUpdateRecipe: (
    key: string,
    field: "variantId" | "inventorySku" | "qty" | "unit" | "wastePct",
    value: string,
  ) => void;
  onRemoveRecipe: (key: string) => void;
  /** Resep usulan (draft) produk ini — dipakai bila belum ada resep aktif. */
  draftRecipes?: ProductRecipeDraft[];
  onUseDraftRecipes?: () => void;
  /** Tambah baris resep untuk bahan yang baru dibuat dari form. */
  onAddRecipeLine?: (sku: string, unit: string) => void;
  /** Muat ulang daftar bahan setelah stok awal / bahan baru. */
  onInventoryChanged?: () => Promise<void> | void;

  // Konteks & preview
  inventoryItems: InventoryItem[];
  recipeCostPreview: number;
  marginPreview: { margin: number; marginPct: number; label: string; baseCost?: number } | null;

  // Foto
  imagePreview: string | null;
  imageInputRef: RefObject<HTMLInputElement | null>;
  onImageSelected: (file: File | null) => void;
  onClearImage: () => void;
}

export function ProductFormPanel({
  name,
  onNameChange,
  sku,
  onSkuChange,
  promoActive,
  onPromoActiveChange,
  promoPrice,
  onPromoPriceChange,
  station,
  onStationChange,
  categories,
  productType,
  onProductTypeChange,
  brand,
  onBrandChange,
  barcode,
  onBarcodeChange,
  batchEligible,
  onBatchEligibleChange,
  showInDigitalMenu,
  onShowInDigitalMenuChange,
  featured,
  onFeaturedChange,
  description,
  onDescriptionChange,
  category,
  onCategoryChange,
  prep,
  onPrepChange,
  stock,
  onStockChange,
  tags,
  onTagsChange,
  onReset,
  variants,
  onAddVariant,
  onUpdateVariant,
  onRemoveVariant,
  recipes,
  onAddRecipe,
  onUpdateRecipe,
  onRemoveRecipe,
  draftRecipes = [],
  onUseDraftRecipes,
  onAddRecipeLine,
  onInventoryChanged,
  inventoryItems,
  recipeCostPreview,
  marginPreview: rawMarginPreview,
  imagePreview,
  imageInputRef,
  onImageSelected,
  onClearImage,
}: ProductFormPanelProps) {
  const selectedCategory = categories.find((entry) => entry.name.toLowerCase() === category.toLowerCase()) ?? null;
  const categoryOptions = categories.filter((entry) => entry.status === "active" || entry.id === selectedCategory?.id);
  const [openingSku, setOpeningSku] = useState<string | null>(null);
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const openingItem = openingSku ? inventoryItems.find((item) => item.sku === openingSku) ?? null : null;
  const effectiveType: ProductType = productType || selectedCategory?.defaultProductType || "menu";
  const isRetail = effectiveType === "retail";
  const materialArea: "bar" | "dapur" | "umum" =
    selectedCategory?.station === "bar" ? "bar" : selectedCategory?.station === "dapur" ? "dapur" : isRetail ? "bar" : "dapur";
  // Margin hanya ditampilkan bila HPP/harga modal sudah ada (bukan 100% palsu dari biaya 0).
  const marginPreview = rawMarginPreview && Number(rawMarginPreview.baseCost ?? 0) > 0 ? rawMarginPreview : null;
  const shortStation = { bar: "Bar", dapur: "Dapur", none: "Langsung" } as const;
  const autoStationLabel = selectedCategory
    ? shortStation[selectedCategory.station]
    : category === "Coffee" || category === "Non-Coffee"
      ? "Bar"
      : "Dapur";
  const effectiveStationLabel = station ? shortStation[station] : autoStationLabel;
  return (
    <div className="garage-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto bg-[#0b0b0e] p-4 lg:grid-cols-[1fr_320px]">
      {/* === FORM PANEL === */}
      <div className="space-y-4 rounded-md border border-[#34343c] bg-[#18181f] p-4 shadow-sm">
        <div>
          <p className="text-sm font-black text-white">Detail Produk</p>
          <p className="text-xs text-[#a1a1aa]">SKU, nama, kategori, tipe, station, stok, dan waktu prep.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-[#d4d4d8]">Tipe produk</span>
            <Select
              value={productType || "auto"}
              onValueChange={(value) => onProductTypeChange(value === "auto" ? "" : (value as ProductType))}
            >
              <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]" aria-label="Tipe produk">
                <SelectValue placeholder="Tipe produk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Ikut kategori: {PRODUCT_TYPE_LABEL[selectedCategory?.defaultProductType ?? "menu"]}
                </SelectItem>
                {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {PRODUCT_TYPE_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-[#d4d4d8]">Merek / brand</span>
            <Input
              value={brand}
              onChange={(event) => onBrandChange(event.target.value)}
              maxLength={60}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder={isRetail ? "Mis. Djarum, Aqua" : "Opsional"}
            />
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-[#d4d4d8]">
              Barcode produk {isRetail ? "(retail: wajib di produk atau varian)" : "(opsional)"}
            </span>
            <Input
              value={barcode}
              onChange={(event) => onBarcodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              maxLength={40}
              className="h-10 border-[#34343c] bg-white/[0.06] font-mono"
              placeholder="Scan / ketik EAN kemasan"
            />
          </label>
        </div>
        <div className="grid gap-1 sm:max-w-[260px]">
          <label className="text-xs font-semibold text-[#d4d4d8]">SKU Produk</label>
          <Input
            value={sku}
            onChange={(event) =>
              onSkuChange(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
            }
            className="h-10 border-[#34343c] bg-white/[0.06] font-mono"
            placeholder={`Auto (${selectedCategory?.skuPrefix ?? "GEN"}-001)`}
          />
          <p className="text-[11px] leading-4 text-[#a1a1aa]">
            Kosongkan untuk auto sesuai prefix kategori. Bisa diubah manual, wajib unik.
          </p>
        </div>

        {/* Promo produk (harga tetap, toggle on/off) */}
        <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-3">
          <button
            type="button"
            onClick={() => onPromoActiveChange(!promoActive)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-pressed={promoActive}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Promo Produk</p>
              <p className="text-[11px] text-[#a1a1aa]">
                Harga promo tetap, tampil di POS &amp; menu dengan harga coret.
              </p>
            </div>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                promoActive ? "bg-[#d11a2a]" : "bg-[#34343c]"
              }`}
            >
              <span
                className={`inline-block size-4 transform rounded-full bg-white transition ${
                  promoActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>
          {promoActive ? (
            <div className="grid gap-1 sm:max-w-[260px]">
              <label className="text-xs font-semibold text-[#d4d4d8]">Harga Promo (Rp)</label>
              <Input
                inputMode="numeric"
                value={promoPrice}
                onChange={(event) =>
                  onPromoPriceChange(event.target.value.replace(/[^\d]/g, ""))
                }
                className="h-10 border-[#34343c] bg-white/[0.06]"
                placeholder="Mis. 20000"
              />
              <p className="text-[10px] leading-4 text-[#a1a1aa]">
                Harga promo meng-override harga varian saat transaksi.
              </p>
            </div>
          ) : null}
        </div>

        {/* Production Hub: auto routing BAR/DAPUR + Smart Batch (BR-04, BR-14) */}
        <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-3">
          <p className="text-sm font-bold text-white">Production Hub</p>
          <p className="text-[11px] leading-4 text-[#a1a1aa]">
            Station di bawah menentukan tiket masuk BAR, DAPUR, atau langsung diserahkan kasir
            (retail). Otomatis = mengikuti pengaturan kategori.
          </p>
          <button
            type="button"
            onClick={() => onBatchEligibleChange(!batchEligible)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-pressed={batchEligible}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#d4d4d8]">Boleh Smart Batch</p>
              <p className="text-[11px] text-[#a1a1aa]">
                Porsi produk sama dari beberapa order boleh dibuat sekaligus.
              </p>
            </div>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                batchEligible ? "bg-[#d11a2a]" : "bg-[#34343c]"
              }`}
            >
              <span
                className={`inline-block size-4 transform rounded-full bg-white transition ${
                  batchEligible ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>
        </div>
        {/* Menu digital pelanggan (/order): tampil/sembunyi & banner unggulan */}
        <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-3">
          <p className="text-sm font-bold text-white">Menu Digital (QR)</p>
          <FormToggle
            label="Tampil di menu digital"
            hint="Matikan untuk menyembunyikan dari pelanggan QR. Tetap bisa dijual di POS."
            value={showInDigitalMenu}
            onChange={onShowInDigitalMenuChange}
          />
          <FormToggle
            label="Menu unggulan"
            hint="Tampil di banner foto besar paling atas menu digital."
            value={featured}
            onChange={onFeaturedChange}
          />
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#d4d4d8]">Deskripsi singkat (opsional)</span>
            <Input
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              maxLength={120}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Mis. Espresso, susu segar, gula aren"
            />
            <span className="block text-[11px] text-[#a1a1aa]">
              Tampil 1 baris di kartu menu pelanggan. {description.length}/120
            </span>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(200px,1.5fr)_170px_130px_90px_120px]">
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-10 border-[#34343c] bg-white/[0.06]"
            placeholder="Nama produk"
          />
          <Select
            value={selectedCategory?.name ?? category}
            onValueChange={(value) => onCategoryChange(value as MenuCategory)}
          >
            <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]" aria-label="Kategori">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.length ? (
                categoryOptions.map((entry) => (
                  <SelectItem key={entry.id} value={entry.name}>
                    {entry.name}
                    {entry.status !== "active" ? " (nonaktif)" : ""}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={category}>{category}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {/* Station produksi (routing tiket Production Hub). */}
          <Select
            value={station || "auto"}
            onValueChange={(value) =>
              onStationChange(value === "bar" || value === "dapur" || value === "none" ? value : "")
            }
          >
            <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]" aria-label="Station produksi">
              <SelectValue placeholder="Station" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto: {autoStationLabel}</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="dapur">Dapur</SelectItem>
              <SelectItem value="none">Langsung kasir</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={prep}
            onChange={(event) => onPrepChange(event.target.value)}
            className="h-10 border-[#34343c] bg-white/[0.06]"
            placeholder="10m"
          />
          <Select
            value={stock}
            onValueChange={(value) =>
              onStockChange(value as "ready" | "limited" | "sold_out")
            }
          >
            <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
              <SelectValue placeholder="Stok menu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="limited">Limited</SelectItem>
              <SelectItem value="sold_out">Habis</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 gap-2 border-[#34343c] bg-white/[0.04]"
            onClick={onReset}
          >
            <X className="size-4" />
            Reset
          </Button>
        </div>

        {/* Varian harga & HPP */}
        <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#888]">
              {isRetail ? "Harga jual, harga modal & kode varian" : "Harga jual & HPP varian"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-8 gap-1.5 border-[#34343c] bg-white/[0.04] px-2 text-xs"
              onClick={onAddVariant}
              disabled={variants.length >= 8}
            >
              <Plus className="size-3.5" />
              Tambah Varian
            </Button>
          </div>
          <datalist id="garage-sell-units">
            {SELL_UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          {variants.map((variant, index) => {
            const variantId = productVariantDraftId(variant, index);
            const autoBaseCost = recipeCostForVariantDraft(recipes, inventoryItems, variantId);
            // Varian ber-resep: HPP selalu dari bahan (server menghitung ulang live).
            const hasRecipe = variantDraftHasRecipe(recipes, variantId);
            return (
              <div key={variant.key} className="space-y-1">
                <div className="grid gap-2 sm:grid-cols-[1fr_150px_150px_42px]">
                  <Input
                    value={variant.label}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "label", event.target.value)
                    }
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                    placeholder={index === 0 ? "Regular" : "Nama varian"}
                  />
                  <Input
                    inputMode="numeric"
                    value={variant.price}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "price", event.target.value.replace(/[^\d]/g, ""))
                    }
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                    placeholder="Harga jual"
                  />
                  <Input
                    inputMode="numeric"
                    value={hasRecipe ? String(autoBaseCost) : variant.baseCost}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "baseCost", event.target.value.replace(/[^\d]/g, ""))
                    }
                    readOnly={hasRecipe}
                    aria-readonly={hasRecipe}
                    title={hasRecipe ? "HPP otomatis dari bahan baku resep" : undefined}
                    className={`h-10 border-[#34343c] ${hasRecipe ? "cursor-not-allowed bg-black/30 text-[#bbf7d0]" : "bg-white/[0.06]"}`}
                    placeholder={isRetail ? "Harga modal / unit" : "HPP (isi resep agar otomatis)"}
                    aria-label={isRetail ? "Harga modal per unit" : "HPP"}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 border-[#34343c] bg-white/[0.04] px-0"
                    onClick={() => onRemoveVariant(variant.key)}
                    disabled={variants.length <= 1}
                    aria-label="Hapus varian"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_100px]">
                  <Input
                    value={variant.sku ?? ""}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "sku", event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
                    }
                    maxLength={40}
                    className="h-9 border-[#34343c] bg-white/[0.04] font-mono text-xs"
                    placeholder="SKU varian (opsional)"
                    aria-label="SKU varian"
                  />
                  <Input
                    value={variant.barcode ?? ""}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "barcode", event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
                    }
                    maxLength={40}
                    className="h-9 border-[#34343c] bg-white/[0.04] font-mono text-xs"
                    placeholder="Barcode varian"
                    aria-label="Barcode varian"
                  />
                  <Input
                    value={variant.sellUnit ?? ""}
                    onChange={(event) => onUpdateVariant(variant.key, "sellUnit", event.target.value)}
                    list="garage-sell-units"
                    maxLength={20}
                    className="h-9 border-[#34343c] bg-white/[0.04] text-xs"
                    placeholder={isRetail ? "Satuan jual*" : "Satuan jual"}
                    aria-label="Satuan jual"
                  />
                  <Input
                    inputMode="decimal"
                    value={variant.unitContents ?? ""}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "unitContents", event.target.value.replace(/[^\d.]/g, ""))
                    }
                    className="h-9 border-[#34343c] bg-white/[0.04] text-xs"
                    placeholder="Isi"
                    aria-label="Isi per satuan jual"
                    title="Isi per satuan jual dalam satuan dasar (mis. 1 bungkus = 16 batang, 1 karton = 24 botol)"
                  />
                </div>
                <p className="text-[11px] text-[#a1a1aa]">
                  {isRetail
                    ? Number(variant.baseCost) > 0 && Number(variant.price) > 0
                      ? `Margin kotor ${currency.format(Number(variant.price) - Number(variant.baseCost))} (${Math.round(((Number(variant.price) - Number(variant.baseCost)) / Number(variant.price)) * 1000) / 10}%) dari harga modal.`
                      : "Produk retail: isi harga modal per satuan jual (harga beli valid, bukan tebakan). Resep tidak diperlukan."
                    : hasRecipe
                      ? `HPP dari bahan baku resep ${currency.format(autoBaseCost)} — ikut berubah otomatis saat harga bahan berubah.`
                      : "Belum ada resep — isi bahan baku di bawah agar HPP dihitung otomatis."}
                </p>
              </div>
            );
          })}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">HPP RESEP</p>
              <p className="mt-1 font-black text-white">{currency.format(recipeCostPreview)}</p>
            </div>
            <div className="rounded border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">MARGIN PREVIEW</p>
              <p className="mt-1 font-black text-white">
                {marginPreview ? currency.format(marginPreview.margin) : "— (HPP belum ada)"}
              </p>
            </div>
            <div className="rounded border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">RASIO MARGIN</p>
              <p className={`mt-1 font-black ${marginPreview && marginPreview.marginPct < 55 ? "text-[#ffd08a]" : "text-[#bbf7d0]"}`}>
                {marginPreview ? `${marginPreview.marginPct}%` : "—"}
              </p>
            </div>
          </div>
          {marginPreview && marginPreview.marginPct < 55 && (
            <div className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/12 p-3 text-xs text-[#ffd08a]">
              Margin {marginPreview.label} masih {marginPreview.marginPct}%. Untuk F&amp;B Garage, aman MVP biasanya minimal 55%.
            </div>
          )}
        </div>

        {/* Resep bahan stok */}
        <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#888]">
              Resep bahan stok
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-8 gap-1.5 border-[#34343c] bg-white/[0.04] px-2 text-xs"
                onClick={() => setNewMaterialOpen((open) => !open)}
              >
                <PackagePlus className="size-3.5" />
                Bahan Baru
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-8 gap-1.5 border-[#34343c] bg-white/[0.04] px-2 text-xs"
                onClick={onAddRecipe}
                disabled={!inventoryItems.length || recipes.length >= 24}
              >
                <Plus className="size-3.5" />
                Tambah Bahan
              </Button>
            </div>
          </div>
          {isRetail && (
            <p className="text-[11px] text-[#c4c4cc]">
              Produk jadi: hubungkan ke stok barangnya (mis. 1 btl Air Mineral / 1 bks rokok per jual) supaya stok gudang terpotong saat terjual.
            </p>
          )}
          {recipes.length === 0 && draftRecipes.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-3 text-xs text-[#ffd08a] sm:flex-row sm:items-center sm:justify-between" data-testid="draft-recipe-banner">
              <span>
                Ada <b>resep usulan</b> ({draftRecipes.length} bahan) menunggu persetujuan — belum memotong stok. Pakai lalu Simpan untuk
                mengaktifkan, atau setujui di Gudang → Kelola Master.
              </span>
              <Button type="button" onClick={onUseDraftRecipes} className="garage-press h-8 shrink-0 bg-[#f5a742] px-3 text-xs font-bold text-black hover:bg-[#ffb85c]">
                Pakai resep usulan
              </Button>
            </div>
          )}
          {newMaterialOpen && (
            <NewMaterialPanel
              inventoryItems={inventoryItems}
              defaultArea={materialArea}
              onCancel={() => setNewMaterialOpen(false)}
              onCreated={async (newSku, unit, message) => {
                setNewMaterialOpen(false);
                setStockNotice(message);
                await onInventoryChanged?.();
                onAddRecipeLine?.(newSku, unit);
              }}
            />
          )}
          {openingItem && (
            <OpeningStockPanel
              item={openingItem}
              onCancel={() => setOpeningSku(null)}
              onDone={async (message) => {
                setOpeningSku(null);
                setStockNotice(message);
                await onInventoryChanged?.();
              }}
            />
          )}
          {stockNotice && <p className="text-[11px] font-semibold text-[#8be0a4]">{stockNotice}</p>}
          {recipes.length === 0 ? (
            <div className="rounded border border-dashed border-[#34343c] p-3 text-xs text-[#888]">
              Resep opsional. Jika diisi, HPP dihitung dari bahan dan stok bahan akan berkurang saat transaksi POS/QR selesai.
            </div>
          ) : (
            recipes.map((recipe) => {
              const selectedItem = inventoryItems.find((item) => item.sku === recipe.inventorySku);
              const qty = Number(recipe.qty);
              const wastePct = Number(recipe.wastePct || 0);
              const lineCost =
                selectedItem && Number.isFinite(qty) && qty > 0
                  ? Math.round(qty * Number(selectedItem.unitCost ?? 0) * (1 + Math.max(0, wastePct) / 100))
                  : 0;
              return (
                <div
                  key={recipe.key}
                  className="space-y-1 rounded-md border border-[#34343c] bg-black/10 p-2"
                >
                  <div className="grid gap-2 lg:grid-cols-[150px_1fr_110px_90px_95px_42px]">
                    <Select
                      value={recipe.variantId || "all"}
                      onValueChange={(value) => onUpdateRecipe(recipe.key, "variantId", value)}
                    >
                      <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                        <SelectValue placeholder="Varian" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua varian</SelectItem>
                        {variants.map((variant, index) => {
                          const variantId = productVariantDraftId(variant, index);
                          const label = variant.label.trim() || (index === 0 ? "Regular" : `Varian ${index + 1}`);
                          return (
                            <SelectItem key={`${variant.key}-${variantId}`} value={variantId}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Select
                      value={recipe.inventorySku || "__none"}
                      onValueChange={(value) =>
                        onUpdateRecipe(recipe.key, "inventorySku", value === "__none" ? "" : value)
                      }
                    >
                      <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                        <SelectValue placeholder="Bahan stok" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Pilih bahan</SelectItem>
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.sku} value={item.sku}>
                            {item.name} - stok {materialStockLabel(item)} - HPP {unitCostCurrency.format(Number(item.unitCost ?? 0))}/{item.unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      inputMode="decimal"
                      value={recipe.qty}
                      onChange={(event) =>
                        onUpdateRecipe(recipe.key, "qty", event.target.value.replace(/[^\d.]/g, ""))
                      }
                      className="h-10 border-[#34343c] bg-white/[0.06]"
                      placeholder="Qty pakai"
                    />
                    <Input
                      value={recipe.unit}
                      onChange={(event) => onUpdateRecipe(recipe.key, "unit", event.target.value)}
                      className="h-10 border-[#34343c] bg-white/[0.06]"
                      placeholder={selectedItem?.unit ?? "unit"}
                    />
                    <Input
                      inputMode="numeric"
                      value={recipe.wastePct}
                      onChange={(event) =>
                        onUpdateRecipe(recipe.key, "wastePct", event.target.value.replace(/[^\d.]/g, ""))
                      }
                      className="h-10 border-[#34343c] bg-white/[0.06]"
                      placeholder="Waste %"
                      title={`Estimasi HPP bahan: ${currency.format(lineCost)}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-10 border-[#34343c] bg-white/[0.04] px-0"
                      onClick={() => onRemoveRecipe(recipe.key)}
                      aria-label="Hapus bahan resep"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#a1a1aa]">
                    {selectedItem ? (
                      <>
                        <RecipeLineStock item={selectedItem} qty={qty} wastePct={wastePct} />
                        <button
                          type="button"
                          onClick={() => setOpeningSku(selectedItem.sku)}
                          className="font-semibold text-[#f5a742] underline-offset-2 hover:underline"
                        >
                          + Stok awal
                        </button>
                        <span>Unit cost {unitCostCurrency.format(Number(selectedItem.unitCost ?? 0))}/{selectedItem.unit}</span>
                        <span>Line HPP {currency.format(lineCost)}</span>
                        {Number(selectedItem.unitCost ?? 0) <= 0 && (
                          <span className="font-semibold text-[#ffd08a]">
                            Unit cost masih 0, HPP belum valid.
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Pilih bahan untuk melihat stok dan estimasi HPP.</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tags */}
        <div className="grid gap-3">
          <Input
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            className="h-10 border-[#34343c] bg-white/[0.06]"
            placeholder="Tags opsional, pisahkan koma"
          />
        </div>
      </div>

      {/* === PREVIEW ASIDE === */}
      <aside className="space-y-3 rounded-md border border-[#34343c] bg-[#18181f] p-4 shadow-sm">
        <div>
          <p className="text-sm font-black text-white">Preview Produk</p>
          <p className="text-xs text-[#a1a1aa]">Tampilan ringkas sebelum masuk POS dan QR Menu.</p>
        </div>

        <div className="space-y-2 rounded-md border border-[#34343c] bg-[#0b0b0e] p-3">
          <p className="text-xs font-bold text-white">Foto Produk</p>
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-[#34343c] bg-[#15151b]">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Preview foto produk"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-[#5b5b66]">
                <ImageIcon className="size-7" />
                <span className="text-[10px]">Belum ada foto</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 flex-1 gap-2 border-[#34343c] bg-white/[0.04] text-xs"
              onClick={() => imageInputRef.current?.click()}
            >
              <Camera className="size-3.5" />
              {imagePreview ? "Ganti foto" : "Upload foto"}
            </Button>
            {imagePreview ? (
              <Button aria-label="Hapus foto produk"
                type="button"
                variant="outline"
                className="garage-press h-9 gap-2 border-[#d11a2a]/45 bg-[#d11a2a]/10 text-xs text-[#ffb4bd]"
                onClick={onClearImage}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => onImageSelected(event.target.files?.[0] ?? null)}
          />
          <p className="text-[10px] leading-4 text-[#a1a1aa]">
            JPG/PNG/WebP, maks 8 MB. Otomatis dikompres ke WebP. Tampil di POS &amp; QR menu.
          </p>
        </div>

        <div className="overflow-hidden rounded-md border border-[#34343c] bg-[#0b0b0e]">
          <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,#34343c_0%,#18181f_42%,#0b0b0e_100%)] p-5 text-center">
            <div>
              <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f5a742]">
                {effectiveStationLabel === "Bar" ? (
                  <Coffee className="size-8" />
                ) : (
                  <ChefHat className="size-8" />
                )}
              </div>
              <p className="mt-4 text-lg font-black text-white">
                {name.trim() || "Nama Produk"}
              </p>
              <p className="mt-1 text-xs text-[#d4d4d8]">
                {category} ·{" "}
                {effectiveStationLabel}{" "}
                · {prep || "10m"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-[#34343c] bg-[#111116] p-3 text-center">
            <div className="rounded border border-[#34343c] bg-white/[0.04] p-2">
              <p className="text-[10px] font-bold uppercase text-[#8f8f99]">Jual</p>
              <p className="mt-1 text-xs font-black text-white">
                {currency.format(Number(variants[0]?.price || 0))}
              </p>
            </div>
            <div className="rounded border border-[#34343c] bg-white/[0.04] p-2">
              <p className="text-[10px] font-bold uppercase text-[#8f8f99]">HPP</p>
              <p className="mt-1 text-xs font-black text-white">
                {currency.format(Number(recipeCostPreview || variants[0]?.baseCost || 0))}
              </p>
            </div>
            <div className="rounded border border-[#34343c] bg-white/[0.04] p-2">
              <p className="text-[10px] font-bold uppercase text-[#8f8f99]">Margin</p>
              <p className={`mt-1 text-xs font-black ${marginPreview && marginPreview.marginPct < 55 ? "text-[#ffd08a]" : "text-[#bbf7d0]"}`}>
                {marginPreview ? `${marginPreview.marginPct}%` : "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
            <p className="font-bold text-[#a1a1aa]">Varian</p>
            <p className="mt-1 text-lg font-black text-white">{variants.length}</p>
          </div>
          <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
            <p className="font-bold text-[#a1a1aa]">Bahan</p>
            <p className="mt-1 text-lg font-black text-white">{recipes.length}</p>
          </div>
        </div>
        <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3 text-xs text-[#ffd08a]">
          Produk aktif akan tampil di POS kasir dan QR Menu. HPP hanya terlihat Owner/Manajer.
        </div>
      </aside>
    </div>
  );
}

function FormToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 text-left"
      aria-pressed={value}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#d4d4d8]">{label}</p>
        <p className="text-[11px] text-[#a1a1aa]">{hint}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          value ? "bg-[#d11a2a]" : "bg-[#34343c]"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-white transition ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}
