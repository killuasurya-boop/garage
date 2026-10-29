"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ImageOff, Pencil, Plus, RefreshCw, Search } from "lucide-react";

import { useGarageToast } from "@/components/garage/garage-toast";
import { garageApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { currency, unitCostCurrency } from "@/lib/garage-data";
import { WMS_STATUS_COLOR, type StockStatus, type WmsProductRow } from "@/lib/wms-types";
import { MaterialDrawer } from "./material-drawer";
import { AREA_LABEL, AreaBadge, ConfirmDialog, EmptyRow, errorText, ui, type MasterArea, type MasterCategory, type MasterSupplier } from "./master-shared";

const qty = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const STATUS_LABEL: Record<StockStatus, string> = { in: "Aman", low: "Menipis", out: "Habis" };

function packText(p: WmsProductRow) {
  if (!(p.packQty > 0)) return "—";
  const name = (p.packageLabel ?? "").split(/\d/)[0].trim() || "kemasan";
  return `1 ${name} = ${qty.format(p.packQty)} ${p.unit}`;
}

function StockBadge({ status }: { status: StockStatus }) {
  const c = WMS_STATUS_COLOR[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: c.bg, color: c.text }}>
      <span aria-hidden="true">{status === "in" ? "●" : status === "low" ? "▲" : "■"}</span> {STATUS_LABEL[status]}
    </span>
  );
}

export function MaterialTab({
  categories,
  suppliers,
  canEdit,
}: {
  categories: MasterCategory[];
  suppliers: MasterSupplier[];
  canEdit: boolean;
}) {
  const toast = useGarageToast();
  const [rows, setRows] = useState<WmsProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [area, setArea] = useState<"all" | MasterArea>("all");
  const [cat, setCat] = useState("all");
  const [sup, setSup] = useState("all");
  const [status, setStatus] = useState<"all" | StockStatus>("all");
  const [archived, setArchived] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; product: WmsProductRow | null; key: number }>({ open: false, product: null, key: 0 });
  const [toArchive, setToArchive] = useState<WmsProductRow | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchRows = useCallback(
    () => garageApi.get<WmsProductRow[]>(`/api/wms/products?warehouse=all${archived ? "&archived=1" : ""}`),
    [archived],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await fetchRows());
    } catch (e) {
      setLoadError(errorText(e, "Gagal memuat bahan."));
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  useEffect(() => {
    let alive = true;
    fetchRows()
      .then((r) => { if (alive) { setRows(r); setLoadError(null); } })
      .catch((e) => { if (alive) setLoadError(errorText(e, "Gagal memuat bahan.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (area !== "all" && (r.area ?? "umum") !== area) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (sup === "none" ? r.defaultSupplierId : sup !== "all" && r.defaultSupplierId !== sup) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      return `${r.sku} ${r.name} ${r.category} ${r.subcategory ?? ""} ${r.brand ?? ""} ${r.barcode ?? ""} ${r.supplierName ?? ""}`.toLowerCase().includes(needle);
    });
  }, [rows, q, area, cat, sup, status]);

  const subcategoryHints = useMemo(() => Array.from(new Set(rows.map((r) => r.subcategory).filter(Boolean) as string[])).sort(), [rows]);
  const catOptions = useMemo(() => categories.filter((c) => area === "all" || c.area === area), [categories, area]);
  const counts = useMemo(() => ({ low: rows.filter((r) => r.status === "low").length, out: rows.filter((r) => r.status === "out").length }), [rows]);

  const openDrawer = (product: WmsProductRow | null) => setDrawer((s) => ({ open: true, product, key: s.key + 1 }));

  async function doArchive() {
    if (!toArchive) return;
    setBusy(true);
    try {
      await garageApi.delete(`/api/wms/products/${toArchive.id}`);
      toast.push({ tone: "success", title: "Bahan diarsipkan", body: `${toArchive.sku} · ${toArchive.name}. Riwayat stok & laporan tetap tersimpan.` });
      setToArchive(null);
      await load();
    } catch (e) {
      toast.push({ tone: "error", title: "Tidak bisa diarsipkan", body: errorText(e, "Coba lagi."), ttl: 9000 });
      setToArchive(null);
    } finally {
      setBusy(false);
    }
  }

  async function restore(p: WmsProductRow) {
    try {
      await garageApi.patch(`/api/wms/products/${p.id}`, { restore: true });
      toast.push({ tone: "success", title: "Bahan dipulihkan", body: `${p.sku} · ${p.name}` });
      await load();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal memulihkan", body: errorText(e, "Coba lagi.") });
    }
  }

  const resetFilters = () => {
    setQ("");
    setArea("all");
    setCat("all");
    setSup("all");
    setStatus("all");
  };
  const filtersActive = q || area !== "all" || cat !== "all" || sup !== "all" || status !== "all";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari bahan"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, SKU, brand, barcode, supplier…"
            className={cn(ui.input, `pl-9`)}
          />
        </div>
        {canEdit && !archived && (
          <button type="button" onClick={() => openDrawer(null)} className={ui.primary}>
            <Plus className="size-4" aria-hidden="true" /> Tambah Bahan
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter bahan">
        <select aria-label="Filter area" value={area} onChange={(e) => { setArea(e.target.value as "all" | MasterArea); setCat("all"); }} className={cn(ui.input, `h-9 w-auto`)}>
          <option value="all">Semua area</option>
          {(["bar", "dapur", "umum"] as const).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </select>
        <select aria-label="Filter kategori" value={cat} onChange={(e) => setCat(e.target.value)} className={cn(ui.input, `h-9 w-auto max-w-[200px]`)}>
          <option value="all">Semua kategori</option>
          {catOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select aria-label="Filter supplier" value={sup} onChange={(e) => setSup(e.target.value)} className={cn(ui.input, `h-9 w-auto max-w-[200px]`)}>
          <option value="all">Semua supplier</option>
          <option value="none">Tanpa supplier</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Filter status stok" value={status} onChange={(e) => setStatus(e.target.value as "all" | StockStatus)} className={cn(ui.input, `h-9 w-auto`)}>
          <option value="all">Semua status stok</option>
          <option value="low">Menipis ({counts.low})</option>
          <option value="out">Habis ({counts.out})</option>
          <option value="in">Aman</option>
        </select>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#D9DCE1] bg-white px-3 text-[13px] font-semibold text-[#374151]">
          <input type="checkbox" checked={archived} onChange={(e) => { setLoading(true); setArchived(e.target.checked); }} className="size-4 accent-[#C8102E]" /> Lihat arsip
        </label>
        {filtersActive && (
          <button type="button" onClick={resetFilters} className="h-9 px-2 text-[13px] font-semibold text-[#C8102E] hover:underline">Reset filter</button>
        )}
        <button type="button" onClick={() => void load()} className={cn(ui.iconBtn, `ml-auto`)} aria-label="Muat ulang"><RefreshCw className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /></button>
      </div>

      <p className="text-[12.5px] text-[#4B5563]" aria-live="polite">
        {loading ? "Memuat bahan…" : `${filtered.length} dari ${rows.length} bahan${archived ? " terarsip" : ""}`} · stok = total semua ruang (hanya baca)
      </p>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#991B1B]">
          {loadError}
          <button type="button" onClick={() => void load()} className="font-bold underline">Coba lagi</button>
        </div>
      )}

      {/* Desktop/tablet: tabel */}
      <div className={cn(ui.card, `hidden max-h-[calc(100vh-300px)] min-h-[240px] overflow-auto md:block`)}>
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="sticky top-0 z-[1] bg-[#F3F4F6]">
            <tr>
              <th className={ui.th}><span className="sr-only">Foto</span></th>
              <th className={ui.th}>SKU</th>
              <th className={ui.th}>Bahan</th>
              <th className={ui.th}>Kategori</th>
              <th className={ui.th}>Supplier</th>
              <th className={ui.th}>Kemasan</th>
              <th className={cn(ui.th, `text-right`)}>Harga beli</th>
              <th className={cn(ui.th, `text-right`)}>HPP / satuan</th>
              <th className={cn(ui.th, `text-right`)}>Stok / Min</th>
              <th className={ui.th}>Status</th>
              <th className={ui.th}><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF0F3]">
            {!loading && filtered.length === 0 && (
              <EmptyRow colSpan={11}>{rows.length === 0 ? (archived ? "Tidak ada bahan terarsip." : "Belum ada bahan. Klik Tambah Bahan.") : "Tidak ada bahan yang cocok dengan filter."}</EmptyRow>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-[#FAFAFB]">
                <td className={cn(ui.td, `w-12`)}>
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="size-9 rounded-md border border-[#E8E8E8] object-cover" loading="lazy" />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-md bg-[#F3F4F6] text-[#9CA3AF]"><ImageOff className="size-4" aria-hidden="true" /></span>
                  )}
                </td>
                <td className={cn(ui.td, `whitespace-nowrap font-mono text-[12.5px] font-bold text-[#C8102E]`)}>{r.sku}</td>
                <td className={cn(ui.td, `min-w-[180px]`)}>
                  <p className="font-semibold">{r.name}</p>
                  {(r.brand || r.subcategory) && <p className="text-[12px] text-[#4B5563]">{[r.brand, r.subcategory].filter(Boolean).join(" · ")}</p>}
                </td>
                <td className={ui.td}>
                  <p className="whitespace-nowrap">{r.category}</p>
                  <AreaBadge area={r.area ?? "umum"} />
                </td>
                <td className={cn(ui.td, `text-[12.5px]`)}>{r.supplierName ?? <span className="text-[#6B7280]">—</span>}</td>
                <td className={cn(ui.td, `whitespace-nowrap text-[12.5px]`)}>{packText(r)}</td>
                <td className={cn(ui.td, `whitespace-nowrap text-right font-mono tabular-nums`)}>{r.packQty > 0 ? currency.format(r.packPrice) : "—"}</td>
                <td className={cn(ui.td, `whitespace-nowrap text-right font-mono font-semibold tabular-nums`)}>{unitCostCurrency.format(r.hpp)}<span className="font-sans text-[11.5px] font-normal text-[#4B5563]">/{r.unit}</span></td>
                <td className={cn(ui.td, `whitespace-nowrap text-right tabular-nums`)}>
                  {qty.format(r.onHand)} <span className="text-[#6B7280]">/ {qty.format(r.minStock)} {r.unit}</span>
                </td>
                <td className={ui.td}><StockBadge status={r.status} /></td>
                <td className={cn(ui.td, `whitespace-nowrap`)}>
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      {archived ? (
                        <button type="button" onClick={() => void restore(r)} className={cn(ui.secondary, `h-8 px-2.5 text-[12px]`)}><ArchiveRestore className="size-3.5" aria-hidden="true" /> Pulihkan</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => openDrawer(r)} className={ui.iconBtn} aria-label={`Edit ${r.name}`}><Pencil className="size-4" /></button>
                          <button type="button" onClick={() => setToArchive(r)} className={cn(ui.iconBtn, `hover:text-[#B91C1C]`)} aria-label={`Arsipkan ${r.name}`}><Archive className="size-4" /></button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* HP: kartu */}
      <ul className="space-y-2 md:hidden">
        {!loading && filtered.length === 0 && <li className={cn(ui.card, `p-6 text-center text-[13px] text-[#6B7280]`)}>Tidak ada bahan.</li>}
        {filtered.map((r) => (
          <li key={r.id} className={cn(ui.card, `p-3`)}>
            <button type="button" disabled={!canEdit || archived} onClick={() => openDrawer(r)} className="flex w-full items-start gap-3 text-left">
              {r.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.imageUrl} alt="" className="size-12 shrink-0 rounded-md border border-[#E8E8E8] object-cover" loading="lazy" />
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-md bg-[#F3F4F6] text-[#9CA3AF]"><ImageOff className="size-5" aria-hidden="true" /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[12px] font-bold text-[#C8102E]">{r.sku}</span>
                <span className="block text-[14px] font-semibold text-[#111111]">{r.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#4B5563]">
                  {r.category} <AreaBadge area={r.area ?? "umum"} /> <StockBadge status={r.status} />
                </span>
                <span className="mt-1 block text-[12.5px] text-[#111111]">
                  HPP <b className="font-mono tabular-nums">{unitCostCurrency.format(r.hpp)}</b>/{r.unit} · Stok {qty.format(r.onHand)} {r.unit}
                </span>
              </span>
            </button>
            {canEdit && (
              <div className="mt-2 flex justify-end gap-2 border-t border-[#EEF0F3] pt-2">
                {archived ? (
                  <button type="button" onClick={() => void restore(r)} className={cn(ui.secondary, `h-9`)}><ArchiveRestore className="size-4" aria-hidden="true" /> Pulihkan</button>
                ) : (
                  <button type="button" onClick={() => setToArchive(r)} className={cn(ui.secondary, `h-9 text-[#B91C1C]`)}><Archive className="size-4" aria-hidden="true" /> Arsipkan</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {drawer.open && (
        <MaterialDrawer
          key={drawer.key}
          open
          product={drawer.product}
          categories={categories}
          suppliers={suppliers}
          subcategoryHints={subcategoryHints}
          onClose={() => setDrawer((s) => ({ ...s, open: false }))}
          onSaved={() => {
            setDrawer((s) => ({ ...s, open: false }));
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toArchive)}
        title={`Arsipkan ${toArchive?.name ?? "bahan"}?`}
        confirmLabel="Arsipkan"
        danger
        busy={busy}
        onCancel={() => setToArchive(null)}
        onConfirm={() => void doArchive()}
        body={
          <>
            <p>Bahan hilang dari daftar & pilihan, tapi riwayat stok, penerimaan, dan laporan tetap utuh. Bisa dipulihkan kapan saja.</p>
            <p className="text-[#92400E]">Ditolak otomatis bila bahan masih dipakai resep aktif atau stoknya belum 0.</p>
          </>
        }
      />
    </div>
  );
}
