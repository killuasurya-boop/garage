"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Calculator, History, ImageOff, Lock, Printer, Upload, X } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGarageToast } from "@/components/garage/garage-toast";
import { WmsProductPackSection } from "@/components/wms/wms-product-pack-section";
import { garageApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { unitCostCurrency } from "@/lib/garage-data";
import { conversionWarning, packNameFromLabel, parseIdNumber, unitCostFromPackText } from "@/lib/wms-master-form";
import type { WmsProductRow } from "@/lib/wms-types";
import { AREA_LABEL, AreaBadge, ConfirmDialog, Field, errorText, ui, type MasterCategory, type MasterSupplier } from "./master-shared";

const BASE_UNITS = ["gram", "ml", "pcs"];
const PURCHASE_UNITS = ["botol", "pack", "dus", "karton", "kotak", "sachet", "jerigen", "kg", "liter"];
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;
const qty = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

type Usage = { activeMenus: string[]; publishedRecipes: string[]; hasLedger: boolean; onHand: number };
type Detail = { usage: Usage; unitLocked: boolean; history: Array<{ id: string; action: string; actor: string; at: string; metadata: Record<string, unknown> | null }> };

type Draft = {
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  supplierId: string;
  unit: string;
  packName: string;
  packQty: string;
  packPrice: string;
  manualHpp: string;
  minStock: string;
  parStock: string;
  barcode: string;
  autoSku: boolean;
  sku: string;
};

function draftFrom(p: WmsProductRow | null, cats: MasterCategory[]): Draft {
  return {
    name: p?.name ?? "",
    category: p?.category ?? cats[0]?.name ?? "",
    subcategory: p?.subcategory ?? "",
    brand: p?.brand ?? "",
    supplierId: p?.defaultSupplierId ?? "",
    unit: p?.unit ?? "gram",
    packName: p && p.packQty > 0 ? packNameFromLabel(p.packageLabel) : "",
    packQty: p && p.packQty > 0 ? String(p.packQty).replace(".", ",") : "",
    packPrice: p && p.packQty > 0 ? String(p.packPrice) : "",
    manualHpp: p ? String(p.hpp).replace(".", ",") : "",
    minStock: p ? String(p.minStock).replace(".", ",") : "",
    parStock: p && p.parStock ? String(p.parStock).replace(".", ",") : "",
    barcode: p?.barcode ?? "",
    autoSku: true,
    sku: p?.sku ?? "",
  };
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export function MaterialDrawer({
  open,
  product,
  categories,
  suppliers,
  subcategoryHints,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: WmsProductRow | null;
  categories: MasterCategory[];
  suppliers: MasterSupplier[];
  subcategoryHints: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useGarageToast();
  const editing = Boolean(product);
  const [d, setD] = useState<Draft>(() => draftFrom(product, categories));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(product?.imageUrl ?? null);
  const [confirmHpp, setConfirmHpp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Muat pemakaian (kunci satuan) + riwayat perubahan saat edit.
  useEffect(() => {
    if (!product) return;
    let alive = true;
    void garageApi.get<Detail>(`/api/wms/products/${product.id}`).then((r) => { if (alive) setDetail(r); }).catch(() => undefined);
    void QRCode.toDataURL(product.sku, { margin: 1, width: 160 }).then((u) => { if (alive) setQr(u); });
    return () => { alive = false; };
  }, [product]);

  // Pratinjau foto lokal sebelum diunggah (URL dilepas saat foto diganti/drawer ditutup).
  const localPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);
  const preview = localPreview ?? photoPreview;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const cat = categories.find((c) => c.name === d.category);
  const unitLocked = Boolean(detail?.unitLocked);
  const unitOptions = useMemo(() => Array.from(new Set([...BASE_UNITS, d.unit].filter(Boolean))), [d.unit]);

  // Kalkulator HPP per satuan dasar.
  const perUnit = unitCostFromPackText(d.packPrice, d.packQty);
  const packQtyNum = parseIdNumber(d.packQty);
  const packPriceNum = parseIdNumber(d.packPrice);
  const hasPackInput = d.packQty.trim() !== "" || d.packPrice.trim() !== "";
  const manualHppNum = parseIdNumber(d.manualHpp);
  const minNum = parseIdNumber(d.minStock);
  const parNum = parseIdNumber(d.parStock);
  const convWarn = conversionWarning(d.unit, packQtyNum, d.packName);

  const errors = {
    name: d.name.trim().length < 2 ? "Nama bahan minimal 2 huruf." : null,
    category: !d.category ? "Pilih kategori." : null,
    unit: !d.unit.trim() ? "Pilih satuan dasar." : null,
    sku: !editing && !d.autoSku && !SKU_RE.test(d.sku.trim()) ? "SKU 2–40 karakter: huruf, angka, titik, strip." : null,
    packQty: hasPackInput && !(packQtyNum > 0) ? `Isi per kemasan harus lebih dari 0 ${d.unit}.` : null,
    packPrice: hasPackInput && !(packPriceNum >= 0) ? "Harga beli harus angka (contoh 222.000)." : null,
    manualHpp: !hasPackInput && d.manualHpp.trim() !== "" && !(manualHppNum >= 0) ? "HPP harus angka ≥ 0." : null,
    minStock: d.minStock.trim() !== "" && !(minNum >= 0) ? "Minimum stok harus angka ≥ 0." : null,
    parStock: d.parStock.trim() !== "" && !(parNum >= 0) ? "Stok target harus angka ≥ 0." : null,
  };
  const firstError = Object.values(errors).find(Boolean) ?? null;
  const show = (k: keyof typeof errors) => (submitted || (k === "packQty" || k === "packPrice") ? errors[k] : null);

  const packChanged =
    !product ||
    d.packName.trim() !== packNameFromLabel(product.packageLabel) ||
    (product.packQty > 0 ? packQtyNum !== product.packQty : hasPackInput) ||
    (product.packQty > 0 ? packPriceNum !== product.packPrice : hasPackInput);
  const nextHpp = perUnit ?? (Number.isFinite(manualHppNum) ? manualHppNum : product?.hpp ?? 0);
  const hppChanges = editing && product && Math.abs(nextHpp - product.hpp) > 1e-4 && (packChanged || !hasPackInput);

  function buildBody() {
    const body: Record<string, unknown> = {
      name: d.name.trim(),
      category: d.category,
      subcategory: d.subcategory.trim(),
      brand: d.brand.trim(),
      defaultSupplierId: d.supplierId || null,
      minStock: Number.isFinite(minNum) ? minNum : 0,
      parStock: Number.isFinite(parNum) ? parNum : 0,
      barcode: d.barcode.trim() || null,
    };
    if (!editing || d.unit !== product?.unit) body.unit = d.unit;
    if (perUnit !== null && packChanged) {
      body.packPrice = packPriceNum;
      body.packQty = packQtyNum;
      if (d.packName.trim()) body.packName = d.packName.trim();
    } else if (!hasPackInput && Number.isFinite(manualHppNum) && (!editing || manualHppNum !== product?.hpp)) {
      body.hpp = manualHppNum;
    }
    if (!editing && !d.autoSku) body.sku = d.sku.trim();
    return body;
  }

  async function uploadPhoto(id: string) {
    if (!photo) return;
    const fd = new FormData();
    fd.append("image", photo);
    const res = await fetch(`/api/wms/products/${id}/image`, { method: "POST", body: fd });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error?.message ?? "Bahan tersimpan, tapi foto gagal diunggah.");
    }
  }

  async function save() {
    setSubmitted(true);
    setServerError(null);
    if (firstError || busy) return;
    if (hppChanges && !confirmHpp) {
      setConfirmHpp(true);
      return;
    }
    setConfirmHpp(false);
    setBusy(true);
    try {
      const body = buildBody();
      const saved = product
        ? await garageApi.patch<{ id: string; sku: string }>(`/api/wms/products/${product.id}`, body)
        : await garageApi.post<{ id: string; sku: string }>("/api/wms/products", body);
      try {
        await uploadPhoto(saved.id);
      } catch (e) {
        toast.push({ tone: "error", title: "Foto gagal diunggah", body: errorText(e, "Coba unggah ulang dari Edit.") });
      }
      toast.push({ tone: "success", title: product ? "Perubahan disimpan" : "Bahan baru ditambahkan", body: `${saved.sku} · ${d.name.trim()}` });
      onSaved();
    } catch (e) {
      const msg = errorText(e, "Gagal menyimpan bahan.");
      setServerError(msg);
      toast.push({ tone: "error", title: "Gagal menyimpan", body: msg });
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!product) {
      setPhoto(null);
      setPhotoPreview(null);
      return;
    }
    try {
      await garageApi.patch(`/api/wms/products/${product.id}`, { imageUrl: null });
      setPhoto(null);
      setPhotoPreview(null);
      toast.push({ tone: "success", title: "Foto dihapus" });
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal hapus foto", body: errorText(e, "") });
    }
  }

  function printQr() {
    if (!qr || !product) return;
    const w = window.open("", "_blank", "width=360,height=420");
    if (!w) return;
    const doc = w.document;
    doc.title = `QR ${product.sku}`;
    const img = doc.createElement("img");
    img.src = qr;
    img.style.width = "200px";
    const sku = doc.createElement("p");
    sku.textContent = product.sku;
    sku.style.cssText = "font:700 14px monospace;margin:4px 0;color:#C8102E";
    const nm = doc.createElement("p");
    nm.textContent = product.name;
    nm.style.cssText = "font:600 13px sans-serif;margin:0";
    doc.body.style.cssText = "text-align:center;padding:16px";
    doc.body.append(img, sku, nm);
    img.onload = () => w.print();
  }

  const usage = detail?.usage;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="[color-scheme:light] w-full gap-0 border-[#E8E8E8] bg-white p-0 text-[#111111] data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]"
      >
        <SheetHeader className="border-b border-[#E8E8E8] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-[17px] font-extrabold text-[#111111]">
                {product ? "Edit Bahan" : "Tambah Bahan"}
                {product && <span className="ml-2 font-mono text-[14px] text-[#C8102E]">{product.sku}</span>}
              </SheetTitle>
              <SheetDescription className="text-[12.5px] text-[#4B5563]">
                Mengubah master tidak mengubah stok. Stok hanya berubah lewat Receiving, Transfer, Opname, Waste, dan penjualan.
              </SheetDescription>
            </div>
            <button type="button" aria-label="Tutup" onClick={onClose} disabled={busy} className={ui.iconBtn}><X className="size-5" /></button>
          </div>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {serverError && (
              <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{serverError}</p>
            )}

            {/* Foto + identitas */}
            <section className="flex flex-col gap-4 sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-2">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={`Foto ${d.name || "bahan"}`} className="size-28 rounded-lg border border-[#E8E8E8] object-cover" />
                ) : (
                  <span className="grid size-28 place-items-center rounded-lg border border-dashed border-[#D9DCE1] bg-[#F8F9FB] text-[#9CA3AF]">
                    <ImageOff className="size-7" aria-hidden="true" />
                  </span>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  aria-label="Pilih foto bahan"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 8 * 1024 * 1024) {
                      toast.push({ tone: "error", title: "Foto terlalu besar", body: "Maksimal 8 MB." });
                      return;
                    }
                    setPhoto(f);
                  }}
                />
                <div className="flex gap-1.5">
                  <button type="button" className={cn(ui.secondary, `h-8 px-2.5 text-[12px]`)} onClick={() => fileRef.current?.click()}>
                    <Upload className="size-3.5 text-[#C8102E]" aria-hidden="true" /> {preview ? "Ganti" : "Foto"}
                  </button>
                  {preview && (
                    <button type="button" className={cn(ui.secondary, `h-8 px-2.5 text-[12px] text-[#B91C1C]`)} onClick={() => void removePhoto()}>
                      Hapus
                    </button>
                  )}
                </div>
                {photo && <p className="max-w-28 truncate text-[11px] text-[#6B7280]">Diunggah saat disimpan</p>}
              </div>

              <div className="grid min-w-0 flex-1 gap-3">
                <Field id="m-name" label="Nama bahan" required error={show("name")}>
                  <input id="m-name" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="mis. Susu UHT Full Cream" className={ui.input} aria-invalid={Boolean(show("name"))} autoFocus={!editing} />
                </Field>
                {!editing ? (
                  <Field
                    id="m-sku"
                    label="SKU"
                    error={show("sku")}
                    hint={d.autoSku ? "Dibuat otomatis & unik saat disimpan, dari 3 huruf kategori (mis. SUS-004)." : "SKU harus unik. Bahan arsip juga dihitung."}
                  >
                    <div className="flex gap-2">
                      <input
                        id="m-sku"
                        value={d.autoSku ? "Otomatis" : d.sku}
                        onChange={(e) => set("sku", e.target.value.toUpperCase())}
                        readOnly={d.autoSku}
                        className={cn(ui.input, `font-mono ${d.autoSku ? "bg-[#F8F9FB] text-[#6B7280]" : ""}`)}
                      />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#374151]">
                        <input type="checkbox" checked={d.autoSku} onChange={(e) => set("autoSku", e.target.checked)} className="size-4 accent-[#C8102E]" />
                        Otomatis
                      </label>
                    </div>
                  </Field>
                ) : (
                  qr && (
                    <div className="flex items-center gap-3 rounded-lg border border-[#E8E8E8] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr} alt={`QR ${product?.sku}`} className="size-16" />
                      <div className="min-w-0 flex-1 text-[12.5px] text-[#374151]">
                        QR berisi SKU — tempel di rak/wadah untuk scan cepat.
                      </div>
                      <button type="button" onClick={printQr} className={cn(ui.secondary, `h-8 px-2.5 text-[12px]`)}><Printer className="size-3.5" aria-hidden="true" /> Cetak</button>
                    </div>
                  )
                )}
              </div>
            </section>

            {/* Klasifikasi */}
            <section className="grid gap-3 sm:grid-cols-2">
              <Field
                id="m-cat"
                label="Kategori"
                required
                error={show("category")}
                hint={cat ? <span className="inline-flex items-center gap-1.5">Area penggunaan: <AreaBadge area={cat.area} /></span> : "Kategori menentukan area Bar / Dapur / Umum."}
              >
                <select id="m-cat" value={d.category} onChange={(e) => set("category", e.target.value)} className={ui.input}>
                  {!d.category && <option value="">Pilih kategori…</option>}
                  {(["bar", "dapur", "umum"] as const).map((area) => {
                    const list = categories.filter((c) => c.area === area);
                    return list.length ? (
                      <optgroup key={area} label={AREA_LABEL[area]}>
                        {list.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </optgroup>
                    ) : null;
                  })}
                  {product && !categories.some((c) => c.name === product.category) && <option value={product.category}>{product.category} (lama)</option>}
                </select>
              </Field>
              <Field id="m-sub" label="Subkategori" hint="Opsional, mis. UHT, Arabika, Saus Sambal.">
                <input id="m-sub" list="m-sub-list" value={d.subcategory} onChange={(e) => set("subcategory", e.target.value)} className={ui.input} />
                <datalist id="m-sub-list">{subcategoryHints.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field id="m-brand" label="Brand" hint="Opsional.">
                <input id="m-brand" value={d.brand} onChange={(e) => set("brand", e.target.value)} placeholder="mis. Diamond" className={ui.input} />
              </Field>
              <Field id="m-sup" label="Supplier utama" hint={suppliers.length ? "Dipakai sebagai default PO & penerimaan." : "Belum ada supplier — tambahkan di tab Supplier."}>
                <select id="m-sup" value={d.supplierId} onChange={(e) => set("supplierId", e.target.value)} className={ui.input}>
                  <option value="">— Tidak ditentukan —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  {product?.defaultSupplierId && !suppliers.some((s) => s.id === product.defaultSupplierId) && (
                    <option value={product.defaultSupplierId}>{product.supplierName ?? "Supplier"} (diarsipkan)</option>
                  )}
                </select>
              </Field>
            </section>

            {/* Satuan, kemasan & HPP */}
            <section className="rounded-xl border border-[#E8E8E8] bg-[#F8F9FB] p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold text-[#111111]"><Calculator className="size-4 text-[#C8102E]" aria-hidden="true" /> Satuan, kemasan & HPP</p>
              <p className="mb-3 mt-0.5 text-[12.5px] text-[#4B5563]">Stok, resep, dan HPP selalu dihitung dalam satuan dasar.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id="m-unit"
                  label="Satuan dasar"
                  required
                  error={show("unit")}
                  hint={
                    unitLocked ? (
                      <span className="inline-flex items-start gap-1 text-[#92400E]">
                        <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" /> Terkunci — bahan sudah punya stok/riwayat/resep. Gunakan kemasan untuk konversi.
                      </span>
                    ) : "gram, ml, atau pcs."
                  }
                >
                  <select id="m-unit" value={d.unit} onChange={(e) => set("unit", e.target.value)} disabled={unitLocked} className={ui.input}>
                    {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field id="m-min" label={`Minimum stok (${d.unit})`} error={show("minStock")} hint="Di bawah angka ini bahan ditandai stok menipis.">
                  <input id="m-min" value={d.minStock} onChange={(e) => set("minStock", e.target.value)} inputMode="decimal" placeholder="0" className={cn(ui.input, `text-right tabular-nums`)} />
                </Field>
                <Field
                  id="m-par"
                  label={`Stok target Bar/Dapur (${d.unit})`}
                  error={show("parStock")}
                  hint="Minta Bahan mengusulkan sampai angka ini. Kosong = 2× minimum."
                >
                  <input id="m-par" value={d.parStock} onChange={(e) => set("parStock", e.target.value)} inputMode="decimal" placeholder="otomatis" className={cn(ui.input, `text-right tabular-nums`)} />
                </Field>
                <Field id="m-pack" label="Satuan pembelian" hint="Kemasan dari supplier.">
                  <input id="m-pack" list="m-pack-list" value={d.packName} onChange={(e) => set("packName", e.target.value)} placeholder="botol / pack / dus / karton" className={ui.input} />
                  <datalist id="m-pack-list">{PURCHASE_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
                </Field>
                <Field
                  id="m-packqty"
                  label={`Isi per kemasan (${d.unit})`}
                  error={show("packQty")}
                  hint={convWarn ? <span className="text-[#92400E]">⚠ {convWarn}</span> : "Contoh: 1 karton susu = 12.000 ml."}
                >
                  <input id="m-packqty" value={d.packQty} onChange={(e) => set("packQty", e.target.value)} inputMode="decimal" placeholder="mis. 12.000" className={cn(ui.input, `text-right tabular-nums`)} />
                </Field>
                <Field id="m-packprice" label="Harga beli per kemasan (Rp)" error={show("packPrice")} className="sm:col-span-2">
                  <input id="m-packprice" value={d.packPrice} onChange={(e) => set("packPrice", e.target.value)} inputMode="decimal" placeholder="mis. 222.000" className={cn(ui.input, `text-right tabular-nums`)} />
                </Field>
              </div>

              <div className="mt-3 rounded-lg border border-[#E8E8E8] bg-white p-3" aria-live="polite">
                {perUnit !== null ? (
                  <>
                    <p className="text-[12px] font-semibold text-[#4B5563]">HPP per {d.unit} (otomatis)</p>
                    <p className="font-mono text-[20px] font-extrabold tabular-nums text-[#C8102E]">{unitCostCurrency.format(perUnit)}</p>
                    <p className="text-[12px] text-[#4B5563]">
                      Rp{qty.format(packPriceNum)} ÷ {qty.format(packQtyNum)} {d.unit} per {d.packName || "kemasan"}
                      {editing && product && Math.abs(perUnit - product.hpp) > 1e-4 && (
                        <> · sebelumnya {unitCostCurrency.format(product.hpp)}</>
                      )}
                    </p>
                  </>
                ) : (
                  <Field id="m-hpp" label={`Belum ada harga kemasan — HPP per ${d.unit} (Rp)`} error={show("manualHpp")} hint="Lebih akurat bila diisi lewat harga kemasan di atas.">
                    <input id="m-hpp" value={d.manualHpp} onChange={(e) => set("manualHpp", e.target.value)} inputMode="decimal" placeholder="0" className={cn(ui.input, `text-right tabular-nums sm:w-1/2`)} disabled={hasPackInput} />
                  </Field>
                )}
                <p className="mt-2 text-[11.5px] text-[#6B7280]">Harga jual POS tidak pernah berubah dari sini. HPP menu yang memakai bahan ini dihitung ulang otomatis.</p>
              </div>
            </section>

            <Field id="m-barcode" label="Barcode kemasan" hint="Opsional — scan/ketik barcode dari supplier (harus unik).">
              <input id="m-barcode" value={d.barcode} onChange={(e) => set("barcode", e.target.value)} className={cn(ui.input, `font-mono`)} />
            </Field>

            {product && (
              <section className="space-y-3">
                <WmsProductPackSection productId={product.id} unit={product.unit} canEdit />
                {usage && !usage.hasLedger && usage.onHand === 0 && (
                  <OpeningStockBox
                    product={product}
                    onDone={async () => {
                      const r = await garageApi.get<Detail>(`/api/wms/products/${product.id}`);
                      setDetail(r);
                      onSaved();
                    }}
                  />
                )}
                {usage && (
                  <div className="rounded-lg border border-[#E8E8E8] p-3 text-[12.5px] text-[#374151]">
                    <p className="font-bold text-[#111111]">Dipakai di</p>
                    <p className="mt-1">
                      Stok total: <b className="tabular-nums">{qty.format(usage.onHand)} {product.unit}</b>
                      {" · "}
                      Resep menu: {usage.activeMenus.length ? usage.activeMenus.slice(0, 6).join(", ") : "—"}
                      {usage.publishedRecipes.length > 0 && <> · Resep WMS: {usage.publishedRecipes.slice(0, 6).join(", ")}</>}
                    </p>
                  </div>
                )}
                {detail && detail.history.length > 0 && (
                  <details className="rounded-lg border border-[#E8E8E8] p-3">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-bold text-[#111111]"><History className="size-4" aria-hidden="true" /> Riwayat perubahan ({detail.history.length})</summary>
                    <ul className="mt-2 space-y-1.5">
                      {detail.history.map((h) => {
                        const changes = (h.metadata?.changes ?? {}) as Record<string, { before: unknown; after: unknown }>;
                        return (
                          <li key={h.id} className="text-[12px] text-[#374151]">
                            <span className="font-semibold text-[#111111]">{h.action}</span> · {h.actor} · {fmtTime(h.at)}
                            {Object.keys(changes).length > 0 && (
                              <span className="block text-[#6B7280]">
                                {Object.entries(changes).map(([k, v]) => `${k}: ${String(v.before ?? "-")} → ${String(v.after ?? "-")}`).join(" · ")}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </section>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#E8E8E8] bg-white px-5 py-3">
            <p className="min-w-0 text-[12px] text-[#6B7280]">
              {submitted && firstError ? <span className="font-semibold text-[#B91C1C]">Periksa isian yang ditandai.</span> : <span><span className="text-[#C8102E]">*</span> wajib diisi</span>}
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={onClose} disabled={busy} className={ui.secondary}>Batal</button>
              <button type="submit" disabled={busy} className={ui.primary}>{busy ? "Menyimpan…" : product ? "Simpan perubahan" : "Simpan bahan"}</button>
            </div>
          </div>
        </form>

        <ConfirmDialog
          open={confirmHpp}
          title="Ubah HPP bahan?"
          confirmLabel="Ya, simpan"
          busy={busy}
          onCancel={() => setConfirmHpp(false)}
          onConfirm={() => void save()}
          body={
            <>
              <p>
                HPP per {d.unit} berubah dari <b>{unitCostCurrency.format(product?.hpp ?? 0)}</b> menjadi <b className="text-[#C8102E]">{unitCostCurrency.format(nextHpp)}</b>.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Estimasi HPP {usage?.activeMenus.length ? `${usage.activeMenus.length} menu` : "menu"} yang memakai bahan ini dihitung ulang.</li>
                <li>Harga jual POS, jumlah stok, dan HPP transaksi lama <b>tidak berubah</b>.</li>
                <li>Penerimaan barang berikutnya tetap menghitung rata-rata HPP seperti biasa.</li>
              </ul>
            </>
          }
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Stok awal (hitung fisik) untuk bahan yang BELUM punya riwayat stok. Masuk ke gudang utama
 * sesuai area kategori dengan HPP saat ini (bukan pembelian). Server menolak bila sudah ada
 * riwayat (`onlyIfEmpty`) — koreksi berikutnya lewat Stock Opname.
 */
function OpeningStockBox({ product, onDone }: { product: WmsProductRow; onDone: () => Promise<void> }) {
  const toast = useGarageToast();
  const packName = product.packQty > 1 ? packNameFromLabel(product.packageLabel) || "kemasan" : null;
  const [inPacks, setInPacks] = useState(Boolean(packName));
  const [amount, setAmount] = useState("");
  const [expiry, setExpiry] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = parseIdNumber(amount);
  const baseQty = Number.isFinite(n) && n > 0 ? Math.round(n * (inPacks && packName ? product.packQty : 1) * 10_000) / 10_000 : 0;

  async function save() {
    if (busy || baseQty <= 0) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/products/opening-stock", { sku: product.sku, qty: baseQty, expiredAt: expiry || null, onlyIfEmpty: true });
      toast.push({ tone: "success", title: "Stok awal dicatat", body: `${product.sku} · ${qty.format(baseQty)} ${product.unit}` });
      setConfirming(false);
      setAmount("");
      await onDone();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal mencatat stok awal", body: errorText(e, ""), ttl: 8000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-[#FCD34D] bg-[#FFFBEB] p-3">
      <p className="text-[13px] font-bold text-[#111111]">Stok awal (hitung fisik)</p>
      <p className="mb-2 text-[12px] text-[#4B5563]">Bahan ini belum punya riwayat stok. Isi jumlah yang ada sekarang — hanya sekali; koreksi berikutnya lewat Stock Opname. Bukan pembelian (belanja tetap lewat Receiving).</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_150px]">
        <input aria-label="Jumlah stok awal" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Jumlah" className={cn(ui.input, "text-right tabular-nums")} />
        {packName ? (
          <select aria-label="Satuan stok awal" value={inPacks ? "pack" : "base"} onChange={(e) => setInPacks(e.target.value === "pack")} className={ui.input}>
            <option value="pack">{packName} ({qty.format(product.packQty)} {product.unit})</option>
            <option value="base">{product.unit}</option>
          </select>
        ) : (
          <span className="self-center text-[13px] font-semibold text-[#374151]">{product.unit}</span>
        )}
        <input aria-label="Tanggal kedaluwarsa (opsional)" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={ui.input} title="Kedaluwarsa (opsional)" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[12px] text-[#374151]" aria-live="polite">{baseQty > 0 ? <>= <b className="tabular-nums">{qty.format(baseQty)} {product.unit}</b></> : " "}</p>
        <button type="button" disabled={busy || baseQty <= 0} onClick={() => setConfirming(true)} className={ui.primary}>Catat stok awal</button>
      </div>
      <ConfirmDialog
        open={confirming}
        busy={busy}
        title={`Catat stok awal ${product.sku}?`}
        confirmLabel="Ya, catat"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void save()}
        body={
          <p>
            Menambah <b>{qty.format(baseQty)} {product.unit}</b> {product.name} ke gudang utama area kategorinya sebagai STOK-AWAL (tercatat di riwayat stok). Hanya bisa sekali untuk bahan ini.
          </p>
        }
      />
    </div>
  );
}
