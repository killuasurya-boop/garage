"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency, type MenuCategory } from "@/lib/garage-data";
import type { InventoryItem } from "@/lib/garage-api-types";
import {
  Camera,
  ChefHat,
  Coffee,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  productVariantDraftId,
  recipeCostForVariantDraft,
  type ProductRecipeDraft,
  type ProductVariantDraft,
} from "@/components/garage/inventory/product-draft";

export interface ProductFormPanelProps {
  // Detail
  name: string;
  onNameChange: (value: string) => void;
  category: MenuCategory;
  onCategoryChange: (value: MenuCategory) => void;
  section: string;
  onSectionChange: (value: string) => void;
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
    field: "label" | "price" | "baseCost",
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

  // Konteks & preview
  inventoryItems: InventoryItem[];
  recipeCostPreview: number;
  marginPreview: { margin: number; marginPct: number; label: string } | null;

  // Foto
  imagePreview: string | null;
  imageInputRef: RefObject<HTMLInputElement | null>;
  onImageSelected: (file: File | null) => void;
  onClearImage: () => void;
}

export function ProductFormPanel({
  name,
  onNameChange,
  category,
  onCategoryChange,
  section,
  onSectionChange,
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
  inventoryItems,
  recipeCostPreview,
  marginPreview,
  imagePreview,
  imageInputRef,
  onImageSelected,
  onClearImage,
}: ProductFormPanelProps) {
  return (
    <div className="garage-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto bg-[#0b0b0e] p-4 lg:grid-cols-[1fr_320px]">
      {/* === FORM PANEL === */}
      <div className="space-y-4 rounded-md border border-[#34343c] bg-[#18181f] p-4 shadow-sm">
        <div>
          <p className="text-sm font-black text-white">Detail Produk</p>
          <p className="text-xs text-[#a1a1aa]">Nama, kategori, station, stok, dan waktu prep.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_150px_130px_100px_130px]">
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-10 border-[#34343c] bg-white/[0.06]"
            placeholder="Nama produk"
          />
          <Select
            value={category}
            onValueChange={(value) => onCategoryChange(value as MenuCategory)}
          >
            <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Makanan">Makanan</SelectItem>
              <SelectItem value="Cemilan">Cemilan</SelectItem>
              <SelectItem value="Coffee">Coffee</SelectItem>
              <SelectItem value="Non-Coffee">Non-Coffee</SelectItem>
            </SelectContent>
          </Select>
          <Select value={section} onValueChange={onSectionChange}>
            <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
              <SelectValue placeholder="Station" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dapur">Dapur</SelectItem>
              <SelectItem value="Bar">Bar</SelectItem>
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
              Harga jual &amp; HPP varian
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
          {variants.map((variant, index) => {
            const variantId = productVariantDraftId(variant, index);
            const autoBaseCost = recipeCostForVariantDraft(recipes, inventoryItems, variantId);
            const manualBaseCost = Number(variant.baseCost);
            const costDiffPct =
              autoBaseCost > 0 && Number.isFinite(manualBaseCost) && manualBaseCost > 0
                ? Math.round((Math.abs(manualBaseCost - autoBaseCost) / autoBaseCost) * 100)
                : 0;
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
                    value={variant.baseCost}
                    onChange={(event) =>
                      onUpdateVariant(variant.key, "baseCost", event.target.value.replace(/[^\d]/g, ""))
                    }
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                    placeholder={autoBaseCost ? `HPP auto ${autoBaseCost}` : "Harga dasar/HPP"}
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
                <p className="text-[11px] text-[#a1a1aa]">
                  HPP resep {currency.format(autoBaseCost)}
                  {costDiffPct > 30 ? (
                    <span className="ml-2 text-[#ffd08a]">
                      Manual beda {costDiffPct}% dari resep.
                    </span>
                  ) : null}
                  {autoBaseCost > 0 ? (
                    <button
                      type="button"
                      className="ml-2 font-bold text-[#bbf7d0] underline-offset-2 hover:underline"
                      onClick={() => onUpdateVariant(variant.key, "baseCost", String(autoBaseCost))}
                    >
                      Pakai HPP Auto
                    </button>
                  ) : null}
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
                {marginPreview ? currency.format(marginPreview.margin) : "Rp 0"}
              </p>
            </div>
            <div className="rounded border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">RASIO MARGIN</p>
              <p className={`mt-1 font-black ${marginPreview && marginPreview.marginPct < 55 ? "text-[#ffd08a]" : "text-[#bbf7d0]"}`}>
                {marginPreview ? `${marginPreview.marginPct}%` : "0%"}
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
                            {item.name} - stok {item.onHand} {item.unit} - HPP {currency.format(Number(item.unitCost ?? 0))}
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
                        <span>
                          Stok {selectedItem.onHand} {selectedItem.unit}
                        </span>
                        <span>Unit cost {currency.format(Number(selectedItem.unitCost ?? 0))}</span>
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
              <Button
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
                {category === "Coffee" || category === "Non-Coffee" ? (
                  <Coffee className="size-8" />
                ) : (
                  <ChefHat className="size-8" />
                )}
              </div>
              <p className="mt-4 text-lg font-black text-white">
                {name.trim() || "Nama Produk"}
              </p>
              <p className="mt-1 text-xs text-[#d4d4d8]">
                {category} · {section || "Station"} · {prep || "10m"}
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
                {currency.format(Number(variants[0]?.baseCost || recipeCostPreview || 0))}
              </p>
            </div>
            <div className="rounded border border-[#34343c] bg-white/[0.04] p-2">
              <p className="text-[10px] font-bold uppercase text-[#8f8f99]">Margin</p>
              <p className={`mt-1 text-xs font-black ${marginPreview && marginPreview.marginPct < 55 ? "text-[#ffd08a]" : "text-[#bbf7d0]"}`}>
                {marginPreview ? `${marginPreview.marginPct}%` : "0%"}
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
          Produk aktif akan tampil di POS kasir dan QR Menu. HPP hanya terlihat Owner/Admin.
        </div>
      </aside>
    </div>
  );
}
