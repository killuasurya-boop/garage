"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, PackagePlus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackQtyInput } from "@/components/wms/pack-qty";
import { garageApi } from "@/lib/api-client";
import type { InventoryItem } from "@/lib/garage-api-types";
import { formatPacks, packNameFromLabel, type PackUom } from "@/lib/stock-uom";

// =============================================================================
// Stok bahan langsung di form produk/resep: stok dalam kemasan, cukup untuk berapa
// porsi, stok awal (Owner/Manajer) & bahan baru — tanpa pindah ke modul Gudang.
// Pembelian tetap lewat Gudang → Receiving (masuk Finance sebagai belanja).
// =============================================================================

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** Kemasan bahan dari katalog OS (isi kemasan > 1 + nama di packageSize). */
export function materialUoms(item?: InventoryItem | null): PackUom[] {
  const factor = Number(item?.packageQty ?? 0);
  if (!item || !(factor > 1)) return [];
  const name = packNameFromLabel(item.packageSize);
  return [{ uom: name && name !== item.unit.toLowerCase() ? name : "kemasan", factor, isPurchase: true, isCount: true }];
}

export function materialStockLabel(item: InventoryItem) {
  return formatPacks(Number(item.onHand ?? 0), item.unit, materialUoms(item));
}

/** "Stok 2 kotak + 300 ml · cukup ≈ 9 porsi" + peringatan stok/HPP. */
export function RecipeLineStock({ item, qty, wastePct }: { item: InventoryItem; qty: number; wastePct: number }) {
  const onHand = Number(item.onHand ?? 0);
  const perPortion = qty > 0 ? qty * (1 + Math.max(0, wastePct) / 100) : 0;
  const portions = perPortion > 0 && onHand > 0 ? Math.floor(onHand / perPortion + 1e-9) : 0;
  const pack = materialUoms(item)[0];
  const perPack = pack && perPortion > 0 ? Math.floor(pack.factor / perPortion + 1e-9) : null;
  return (
    <>
      <span className={onHand <= 0 ? "font-semibold text-[#ff8a8a]" : undefined}>
        Stok {materialStockLabel(item)}
        {onHand <= 0 ? " (kosong)" : ""}
      </span>
      {perPortion > 0 && onHand > 0 ? <span>cukup ≈ {numberFormat.format(portions)} porsi</span> : null}
      {pack && perPack !== null ? (
        <span>
          1 {pack.uom} ≈ {numberFormat.format(perPack)} porsi
        </span>
      ) : null}
    </>
  );
}

const panel = "space-y-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/[0.07] p-3";
const label = "block text-[11px] font-semibold text-[#d4d4d8]";
const field = "mt-1 h-9 border-[#34343c] bg-white/[0.06] text-sm";

/** Stok awal (saldo pembukaan) satu bahan → gudang utama area kategorinya. */
export function OpeningStockPanel({ item, onDone, onCancel }: { item: InventoryItem; onDone: (message: string) => void; onCancel: () => void }) {
  const [qty, setQty] = useState<number | null>(null);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!qty || qty <= 0) {
      setError("Isi jumlah stok awal.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await garageApi.post("/api/wms/products/opening-stock", { sku: item.sku, qty, expiredAt: expiry || null });
      onDone(`Stok awal ${item.name} +${formatPacks(qty, item.unit, materialUoms(item))} tercatat di gudang utama.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat stok awal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={panel} data-testid="opening-stock-panel">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-white">Stok awal · {item.name}</p>
        <button type="button" aria-label="Tutup" onClick={onCancel} className="text-[#a1a1aa] hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-[11px] text-[#c4c4cc]">
        Untuk saldo awal / stok yang sudah ada di rak. Barang yang baru dibeli catat lewat Gudang → Receiving supaya masuk belanja.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className={label}>
          Jumlah
          <div className="mt-1">
            <PackQtyInput idPrefix={`open-${item.sku}`} label={`Stok awal ${item.name}`} value={qty} onChange={setQty} unit={item.unit} uoms={materialUoms(item)} tone="dark" />
          </div>
        </div>
        <label className={label}>
          Kedaluwarsa (opsional)
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`${field} w-40`} />
        </label>
        <Button type="button" disabled={busy} onClick={() => void save()} className="garage-press h-9 bg-[#C8102E] px-3 text-xs font-bold text-white">
          Simpan stok awal
        </Button>
      </div>
      {Number(item.unitCost ?? 0) <= 0 && (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-[#ffd08a]">
          <AlertTriangle className="size-3.5" aria-hidden /> Harga beli bahan masih 0 — isi di Gudang → Inventory supaya HPP valid.
        </p>
      )}
      {error && <p className="text-[11px] font-semibold text-[#ff8a8a]">{error}</p>}
    </div>
  );
}

type WmsCategory = { id: string; name: string; area: "bar" | "dapur" | "umum" };
const SKU_PREFIX: Record<WmsCategory["area"], string> = { bar: "BAR", dapur: "KIT", umum: "BHN" };
const UNITS = ["gr", "ml", "pcs", "btl", "bks", "cup"];

function nextSku(prefix: string, items: InventoryItem[]) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = items.reduce((m, it) => Math.max(m, Number(re.exec(it.sku)?.[1] ?? 0)), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Tambah bahan baku baru (+ kemasan, harga beli, stok awal) langsung dari form resep. */
export function NewMaterialPanel({
  inventoryItems,
  defaultArea,
  onCreated,
  onCancel,
}: {
  inventoryItems: InventoryItem[];
  defaultArea: "bar" | "dapur" | "umum";
  onCreated: (sku: string, unit: string, message: string) => void;
  onCancel: () => void;
}) {
  const [categories, setCategories] = useState<WmsCategory[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("gr");
  const [packName, setPackName] = useState("");
  const [packQty, setPackQty] = useState("");
  const [packPrice, setPackPrice] = useState("");
  const [initial, setInitial] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void garageApi
      .get<WmsCategory[]>("/api/wms/categories")
      .then((rows) => {
        if (!alive) return;
        setCategories(rows);
        setCategory((current) => current || rows.find((c) => c.area === defaultArea)?.name || rows[0]?.name || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [defaultArea]);

  const qtyPerPack = Number(packQty.replace(",", ".")) || 0;
  const price = Number(packPrice.replace(/\D/g, "")) || 0;
  const uoms: PackUom[] = qtyPerPack > 1 && packName.trim() ? [{ uom: packName.trim().toLowerCase(), factor: qtyPerPack, isPurchase: true, isCount: true }] : [];
  const area = categories.find((c) => c.name === category)?.area ?? defaultArea;
  const sku = nextSku(SKU_PREFIX[area], inventoryItems);

  async function save() {
    if (name.trim().length < 2) return setError("Nama bahan wajib diisi.");
    if (!category) return setError("Pilih kategori.");
    if (!(qtyPerPack > 0)) return setError(`Isi per kemasan wajib (dalam ${unit}).`);
    setBusy(true);
    setError(null);
    try {
      await garageApi.post("/api/wms/products", {
        sku,
        name: name.trim(),
        category,
        unit,
        minStock: 0,
        packPrice: price,
        packQty: qtyPerPack,
        packName: packName.trim() || "kemasan",
        initialStock: initial && initial > 0 ? initial : undefined,
      });
      onCreated(sku, unit, `Bahan ${name.trim()} (${sku}) ditambahkan${initial ? ` dengan stok awal ${formatPacks(initial, unit, uoms)}` : ""}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menambah bahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={panel} data-testid="new-material-panel">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-white">
          <PackagePlus className="size-4 text-[#f5a742]" aria-hidden /> Bahan baku baru · {sku}
        </p>
        <button type="button" aria-label="Tutup" onClick={onCancel} className="text-[#a1a1aa] hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>
          Nama bahan
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Keju Mozarella" className={field} />
        </label>
        <label className={label}>
          Kategori gudang
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} w-full rounded-md border px-2 text-white`}>
            {categories.map((c) => (
              <option key={c.id} value={c.name} className="bg-[#17171c]">
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Satuan stok (resep & POS memotong satuan ini)
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field} w-full rounded-md border px-2 text-white`}>
            {UNITS.map((u) => (
              <option key={u} value={u} className="bg-[#17171c]">
                {u}
              </option>
            ))}
          </select>
        </label>
        <div className={label}>
          Kemasan beli
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
            <Input aria-label="Nama kemasan" value={packName} onChange={(e) => setPackName(e.target.value.replace(/[^a-zA-Z ]/g, ""))} placeholder="kotak" className="h-9 border-[#34343c] bg-white/[0.06] text-sm" />
            <span className="text-xs text-[#c4c4cc]">isi</span>
            <Input aria-label={`Isi per kemasan (${unit})`} inputMode="decimal" value={packQty} onChange={(e) => setPackQty(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="1000" className="h-9 border-[#34343c] bg-white/[0.06] text-right text-sm" />
            <span className="text-xs text-[#c4c4cc]">{unit}</span>
          </div>
        </div>
        <label className={label}>
          Harga beli per kemasan (Rp)
          <Input inputMode="numeric" value={packPrice} onChange={(e) => setPackPrice(e.target.value.replace(/\D/g, ""))} placeholder="45000" className={field} />
          {price > 0 && qtyPerPack > 0 ? (
            <span className="mt-0.5 block text-[11px] font-normal text-[#c4c4cc]">
              HPP {rupiah(price / qtyPerPack)}/{unit}
            </span>
          ) : null}
        </label>
        <div className={label}>
          Stok awal (opsional)
          <div className="mt-1">
            <PackQtyInput idPrefix="new-material-initial" label="Stok awal bahan baru" value={initial} onChange={setInitial} unit={unit} uoms={uoms} tone="dark" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && <p className="mr-auto text-[11px] font-semibold text-[#ff8a8a]">{error}</p>}
        <Button type="button" disabled={busy} onClick={() => void save()} className="garage-press h-9 gap-1.5 bg-[#C8102E] px-3 text-xs font-bold text-white">
          <Plus className="size-3.5" /> Simpan bahan & pakai di resep
        </Button>
      </div>
    </div>
  );
}
