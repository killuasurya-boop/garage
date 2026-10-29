"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, MapPin, MessageCircle, Pencil, Plus, Search, TrendingDown, TrendingUp, X } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGarageToast } from "@/components/garage/garage-toast";
import { garageApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { unitCostCurrency } from "@/lib/garage-data";
import { whatsappLink } from "@/lib/wms-master-form";
import { SUPPLIER_AREA_LABEL, type SupplierArea } from "@/lib/wms-procurement-meta";
import { ConfirmDialog, EmptyRow, Field, errorText, ui, type MasterSupplier } from "./master-shared";
import { SupplierProductsPanel } from "./supplier-products-panel";

type SupplierDetail = {
  id: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  archived: boolean;
  products: Array<{ id: string; sku: string; name: string; unit: string; hpp: number; isDefault: boolean; archived: boolean; lastPrice: number | null; lastAt: string | null; receipts: number }>;
  priceHistory: Array<{ productId: string; doc: string; at: string | null; price: number; qty: number; previousPrice: number | null; changePct: number | null }>;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "—";
const PHONE_RE = /^(\+?62|0)8[\d\s-]{8,16}$/;

function SupplierForm({ supplier, onClose, onSaved }: { supplier: MasterSupplier | null; onClose: () => void; onSaved: () => void }) {
  const toast = useGarageToast();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [note, setNote] = useState(supplier?.note ?? "");
  const [picName, setPicName] = useState(supplier?.picName ?? "");
  const [areas, setAreas] = useState<string[]>(supplier?.areas ?? []);
  const [productCategories, setProductCategories] = useState(supplier?.productCategories ?? "");
  const [paymentMethod, setPaymentMethod] = useState(supplier?.paymentMethod ?? "");
  const [paymentTermDays, setPaymentTermDays] = useState(String(supplier?.paymentTermDays ?? 0));
  const [bankName, setBankName] = useState(supplier?.bankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(supplier?.bankAccountNumber ?? "");
  const [bankAccountName, setBankAccountName] = useState(supplier?.bankAccountName ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errName = name.trim().length < 2 ? "Nama supplier minimal 2 huruf." : null;
  const errPhone = phone.trim() && !PHONE_RE.test(phone.trim()) ? "Nomor WhatsApp diawali 08 atau +62, 10–15 digit." : null;
  const accDigits = bankAccountNumber.replace(/[\s.-]/g, "");
  const errBank = accDigits && !/^\d{5,30}$/.test(accDigits) ? "No. rekening hanya angka (5–30 digit)." : null;

  async function save() {
    setSubmitted(true);
    setServerError(null);
    if (errName || errPhone || errBank || busy) return;
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim(),
        picName: picName.trim(),
        areas,
        productCategories: productCategories.trim(),
        paymentMethod,
        paymentTermDays: paymentMethod === "tempo" ? Math.max(0, Math.min(365, Number(paymentTermDays) || 0)) : 0,
        bankName: bankName.trim(),
        bankAccountNumber: accDigits,
        bankAccountName: bankAccountName.trim(),
      };
      if (supplier) await garageApi.patch(`/api/wms/suppliers/${supplier.id}`, body);
      else await garageApi.post("/api/wms/suppliers", body);
      toast.push({ tone: "success", title: supplier ? "Supplier diperbarui" : "Supplier ditambahkan", body: body.name });
      onSaved();
    } catch (e) {
      setServerError(errorText(e, "Gagal menyimpan supplier."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="[color-scheme:light] w-full gap-0 border-[#E8E8E8] bg-white p-0 text-[#111111] data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="border-b border-[#E8E8E8] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-[17px] font-extrabold text-[#111111]">{supplier ? "Edit Supplier" : "Tambah Supplier"}</SheetTitle>
              <SheetDescription className="text-[12.5px] text-[#4B5563]">Harga beli & riwayatnya tercatat otomatis dari Receiving.</SheetDescription>
            </div>
            <button type="button" aria-label="Tutup" onClick={onClose} className={ui.iconBtn}><X className="size-5" /></button>
          </div>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {serverError && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#991B1B]">{serverError}</p>}
            <Field id="s-name" label="Nama supplier" required error={submitted ? errName : null}>
              <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={ui.input} autoFocus />
            </Field>
            <Field id="s-pic" label="Nama PIC / kontak">
              <input id="s-pic" value={picName} onChange={(e) => setPicName(e.target.value)} maxLength={120} className={ui.input} />
            </Field>
            <Field id="s-phone" label="Nomor WhatsApp" error={errPhone} ok={phone.trim() && !errPhone ? "Format nomor benar" : null} hint="Dipakai untuk kirim PO. mis. 0812 3456 7890">
              <input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={ui.input} />
            </Field>
            <fieldset>
              <legend className={ui.label}>Area yang dilayani</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SUPPLIER_AREA_LABEL) as SupplierArea[]).map((a) => (
                  <label key={a} className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#D9DCE1] px-3 text-[13px] font-semibold text-[#374151]">
                    <input
                      type="checkbox"
                      checked={areas.includes(a)}
                      onChange={(e) => setAreas((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))}
                      className="size-4 accent-[#C8102E]"
                    />
                    {SUPPLIER_AREA_LABEL[a]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="s-cats" label="Kategori produk" hint="mis. Susu, Syrup, Packaging.">
              <input id="s-cats" value={productCategories} onChange={(e) => setProductCategories(e.target.value)} maxLength={200} className={ui.input} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="s-pay" label="Metode bayar">
                <select id="s-pay" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={ui.input}>
                  <option value="">Belum ditentukan</option>
                  <option value="cash">Tunai saat terima</option>
                  <option value="transfer">Transfer</option>
                  <option value="tempo">Tempo</option>
                </select>
              </Field>
              {paymentMethod === "tempo" && (
                <Field id="s-term" label="Termin (hari)" hint="Jatuh tempo dihitung dari tanggal terima.">
                  <input id="s-term" inputMode="numeric" value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value.replace(/\D/g, ""))} className={cn(ui.input, "text-right")} />
                </Field>
              )}
            </div>
            <Field id="s-addr" label="Alamat">
              <textarea id="s-addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={300} className={cn(ui.input, `h-auto py-2`)} />
            </Field>
            <fieldset className="rounded-lg border border-[#E8E8E8] p-3">
              <legend className="px-1 text-[12px] font-bold text-[#374151]">Rekening supplier (untuk transfer)</legend>
              <p className="mb-2 text-[11.5px] text-[#6B7280]">Hanya terlihat oleh Owner & Manajer. Pastikan sesuai invoice/konfirmasi supplier.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="s-bank" label="Nama bank" hint="mis. BCA, BRI, BNI, Mandiri">
                  <input id="s-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={60} className={ui.input} />
                </Field>
                <Field id="s-acc" label="No. rekening" error={errBank}>
                  <input id="s-acc" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} inputMode="numeric" maxLength={40} className={cn(ui.input, "font-mono")} />
                </Field>
                <Field id="s-accname" label="Atas nama" className="sm:col-span-2">
                  <input id="s-accname" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} maxLength={120} className={ui.input} />
                </Field>
              </div>
            </fieldset>
            <Field id="s-note" label="Catatan" hint="mis. hari kirim, minimal order.">
              <input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={ui.input} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#E8E8E8] px-5 py-3">
            <button type="button" onClick={onClose} disabled={busy} className={ui.secondary}>Batal</button>
            <button type="submit" disabled={busy} className={ui.primary}>{busy ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function SupplierTab({ suppliers, canEdit, reload }: { suppliers: MasterSupplier[]; canEdit: boolean; reload: () => Promise<void> }) {
  const toast = useGarageToast();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [form, setForm] = useState<{ open: boolean; supplier: MasterSupplier | null }>({ open: false, supplier: null });
  const [toArchive, setToArchive] = useState<MasterSupplier | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return suppliers.filter((s) => (showArchived || !s.archived) && (!n || `${s.name} ${s.phone} ${s.address}`.toLowerCase().includes(n)));
  }, [suppliers, q, showArchived]);
  const selected = suppliers.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void garageApi.get<SupplierDetail>(`/api/wms/suppliers/${selectedId}`).then((d) => { if (alive) setDetail(d); }).catch(() => { if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [selectedId, suppliers]);

  const nameOf = useMemo(() => new Map((detail?.products ?? []).map((p) => [p.id, p])), [detail]);

  async function archive() {
    if (!toArchive) return;
    setBusy(true);
    try {
      await garageApi.delete(`/api/wms/suppliers/${toArchive.id}`);
      toast.push({ tone: "success", title: "Supplier diarsipkan", body: toArchive.name });
      await reload();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal", body: errorText(e, "Coba lagi.") });
    } finally {
      setBusy(false);
      setToArchive(null);
    }
  }

  async function restore(s: MasterSupplier) {
    try {
      await garageApi.patch(`/api/wms/suppliers/${s.id}`, { archived: false });
      toast.push({ tone: "success", title: "Supplier dipulihkan", body: s.name });
      await reload();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal", body: errorText(e, "Coba lagi.") });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <section className={cn(ui.card, `flex min-h-[320px] flex-col`)}>
        <div className="space-y-2 border-b border-[#E8E8E8] p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" aria-hidden="true" />
              <input type="search" aria-label="Cari supplier" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari supplier…" className={cn(ui.input, `pl-9`)} />
            </div>
            {canEdit && (
              <button type="button" onClick={() => setForm({ open: true, supplier: null })} className={ui.primary} aria-label="Tambah supplier"><Plus className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Tambah</span></button>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#374151]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[#C8102E]" /> Tampilkan arsip
          </label>
        </div>
        <ul className="max-h-[560px] flex-1 divide-y divide-[#EEF0F3] overflow-y-auto" aria-label="Daftar supplier">
          {list.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-[#6B7280]">Belum ada supplier.</li>}
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                aria-current={s.id === selectedId ? "true" : undefined}
                className={`w-full px-4 py-2.5 text-left hover:bg-[#FAFAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8102E]/30 ${s.id === selectedId ? "bg-[#FDF1F3]" : ""}`}
              >
                <p className={`text-[13.5px] font-semibold ${s.archived ? "text-[#6B7280] line-through" : "text-[#111111]"}`}>{s.name}</p>
                <p className="text-[12px] text-[#4B5563]">{s.phone || "Tanpa nomor"} · {s.productCount} bahan utama</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={cn(ui.card, `min-h-[320px] p-4`)} aria-live="polite">
        {!selected ? (
          <p className="py-16 text-center text-[13px] text-[#6B7280]">Pilih supplier untuk melihat bahan yang disuplai dan riwayat harga.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[18px] font-extrabold text-[#111111]">{selected.name}</h3>
                {selected.address && <p className="mt-0.5 flex items-start gap-1 text-[13px] text-[#374151]"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {selected.address}</p>}
                {selected.note && <p className="mt-0.5 text-[12.5px] text-[#4B5563]">{selected.note}</p>}
                <p className="mt-1 text-[12.5px] text-[#374151]">
                  PIC: <b>{selected.picName || "-"}</b>
                  {" · "}Area: {(selected.areas ?? []).length ? (selected.areas ?? []).map((a) => SUPPLIER_AREA_LABEL[a as SupplierArea] ?? a).join(", ") : "-"}
                  {" · "}Bayar: {selected.paymentMethod === "tempo" ? `Tempo ${selected.paymentTermDays ?? 0} hari` : selected.paymentMethod === "cash" ? "Tunai" : selected.paymentMethod === "transfer" ? "Transfer" : "-"}
                  {selected.productCategories && <> · Produk: {selected.productCategories}</>}
                </p>
                {selected.bankAccountNumber && (
                  <p className="mt-1 text-[12.5px] text-[#374151]">
                    Rekening: <b>{selected.bankName || "Bank"}</b> <span className="font-mono">{selected.bankAccountNumber}</span>
                    {selected.bankAccountName && <> a.n. {selected.bankAccountName}</>}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {whatsappLink(selected.phone) && (
                  <a href={whatsappLink(selected.phone) ?? undefined} target="_blank" rel="noopener noreferrer" className={cn(ui.secondary, `text-[#15803D]`)}>
                    <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp {selected.phone}
                  </a>
                )}
                {canEdit && !selected.archived && (
                  <>
                    <button type="button" className={ui.secondary} onClick={() => setForm({ open: true, supplier: selected })}><Pencil className="size-4" aria-hidden="true" /> Edit</button>
                    <button type="button" className={cn(ui.secondary, `text-[#B91C1C]`)} onClick={() => setToArchive(selected)}><Archive className="size-4" aria-hidden="true" /> Arsipkan</button>
                  </>
                )}
                {canEdit && selected.archived && (
                  <button type="button" className={ui.secondary} onClick={() => void restore(selected)}><ArchiveRestore className="size-4" aria-hidden="true" /> Pulihkan</button>
                )}
              </div>
            </div>

            <SupplierProductsPanel key={selected.id} supplierId={selected.id} canEdit={canEdit && !selected.archived} />

            <div>
              <h4 className="mb-2 text-[14px] font-bold text-[#111111]">Riwayat pembelian per bahan</h4>
              <div className="overflow-x-auto rounded-lg border border-[#E8E8E8]">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead className="bg-[#F3F4F6]">
                    <tr>
                      <th className={ui.th}>SKU</th>
                      <th className={ui.th}>Bahan</th>
                      <th className={cn(ui.th, `text-right`)}>Harga terakhir</th>
                      <th className={cn(ui.th, `text-right`)}>HPP rata-rata</th>
                      <th className={ui.th}>Terakhir terima</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0F3]">
                    {!detail || detail.products.length === 0 ? (
                      <EmptyRow colSpan={5}>Belum ada. Pilih supplier ini di form bahan, atau terima barang dari supplier ini lewat Receiving.</EmptyRow>
                    ) : (
                      detail.products.map((p) => (
                        <tr key={p.id}>
                          <td className={cn(ui.td, `font-mono text-[12.5px] font-bold text-[#C8102E]`)}>{p.sku}</td>
                          <td className={ui.td}>
                            {p.name}
                            {p.isDefault && <span className="ml-1.5 rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[10.5px] font-bold text-[#047857]">UTAMA</span>}
                            {p.archived && <span className="ml-1.5 text-[11px] text-[#6B7280]">(arsip)</span>}
                          </td>
                          <td className={cn(ui.td, `text-right font-mono tabular-nums`)}>{p.lastPrice !== null ? `${unitCostCurrency.format(p.lastPrice)}/${p.unit}` : "—"}</td>
                          <td className={cn(ui.td, `text-right font-mono tabular-nums`)}>{unitCostCurrency.format(p.hpp)}/{p.unit}</td>
                          <td className={cn(ui.td, `text-[12.5px]`)}>{fmtDate(p.lastAt)} {p.receipts > 0 && <span className="text-[#6B7280]">· {p.receipts}×</span>}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-[14px] font-bold text-[#111111]">Riwayat perubahan harga</h4>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-[#E8E8E8]">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead className="sticky top-0 bg-[#F3F4F6]">
                    <tr>
                      <th className={ui.th}>Tanggal</th>
                      <th className={ui.th}>Dokumen</th>
                      <th className={ui.th}>Bahan</th>
                      <th className={cn(ui.th, `text-right`)}>Harga / satuan</th>
                      <th className={cn(ui.th, `text-right`)}>Perubahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0F3]">
                    {!detail || detail.priceHistory.length === 0 ? (
                      <EmptyRow colSpan={5}>Belum ada penerimaan dari supplier ini.</EmptyRow>
                    ) : (
                      detail.priceHistory.map((h) => {
                        const p = nameOf.get(h.productId);
                        const up = (h.changePct ?? 0) > 0;
                        return (
                          <tr key={`${h.doc}-${h.productId}`}>
                            <td className={cn(ui.td, `whitespace-nowrap text-[12.5px]`)}>{fmtDate(h.at)}</td>
                            <td className={cn(ui.td, `font-mono text-[12px]`)}>{h.doc}</td>
                            <td className={ui.td}>{p?.name ?? "—"}</td>
                            <td className={cn(ui.td, `whitespace-nowrap text-right font-mono tabular-nums`)}>{unitCostCurrency.format(h.price)}/{p?.unit ?? ""}</td>
                            <td className={cn(ui.td, `whitespace-nowrap text-right text-[12.5px] font-semibold`)}>
                              {h.changePct === null || h.changePct === 0 ? (
                                <span className="text-[#6B7280]">{h.previousPrice === null ? "Pertama" : "Sama"}</span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 ${up ? "text-[#B91C1C]" : "text-[#15803D]"}`}>
                                  {up ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
                                  {up ? "Naik" : "Turun"} {Math.abs(h.changePct)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {form.open && (
        <SupplierForm
          supplier={form.supplier}
          onClose={() => setForm({ open: false, supplier: null })}
          onSaved={() => {
            setForm({ open: false, supplier: null });
            void reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(toArchive)}
        title={`Arsipkan ${toArchive?.name ?? "supplier"}?`}
        confirmLabel="Arsipkan"
        danger
        busy={busy}
        onCancel={() => setToArchive(null)}
        onConfirm={() => void archive()}
        body={<p>Supplier hilang dari pilihan baru. Riwayat penerimaan, PO, dan harga tetap tersimpan.{toArchive?.productCount ? ` ${toArchive.productCount} bahan masih menjadikannya supplier utama.` : ""}</p>}
      />
    </div>
  );
}
