"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pencil, Search } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { currency, unitCostCurrency } from "@/lib/garage-data";
import { conversionWarning, packNameFromLabel } from "@/lib/wms-master-form";
import type { WmsProductRow } from "@/lib/wms-types";
import { MaterialDrawer } from "./material-drawer";
import { EmptyRow, errorText, ui, type MasterCategory, type MasterSupplier } from "./master-shared";

const qty = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

/** Ringkasan konversi kemasan per bahan + peringatan konversi yang belum/aneh. */
export function UomTab({ categories, suppliers, canEdit }: { categories: MasterCategory[]; suppliers: MasterSupplier[]; canEdit: boolean }) {
  const [rows, setRows] = useState<WmsProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [editing, setEditing] = useState<{ product: WmsProductRow; key: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await garageApi.get<WmsProductRow[]>("/api/wms/products?warehouse=all"));
      setError(null);
    } catch (e) {
      setError(errorText(e, "Gagal memuat bahan."));
    }
  }, []);
  useEffect(() => {
    let alive = true;
    garageApi
      .get<WmsProductRow[]>("/api/wms/products?warehouse=all")
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setError(errorText(e, "Gagal memuat bahan.")); });
    return () => { alive = false; };
  }, []);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const packName = packNameFromLabel(r.packageLabel);
        const issue = !(r.packQty > 0) ? "Kemasan pembelian belum diisi" : conversionWarning(r.unit, r.packQty, packName);
        return { r, packName, issue };
      }),
    [rows],
  );
  const shown = enriched.filter(({ r, issue }) => (!onlyIssues || issue) && (!q.trim() || `${r.sku} ${r.name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const issueCount = enriched.filter((e) => e.issue).length;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] px-4 py-3 text-[13px] text-[#374151]">
        Contoh konversi: <b>Susu</b> 1 karton = 12.000 ml · <b>Coffee Beans</b> 1 pack = 1.000 gram · <b>Syrup</b> 1 botol = 760 ml · <b>Nugget</b> 1 pack = 1.000 gram.
        Setiap bahan boleh punya konversi sendiri; kemasan bertingkat (1 dus = 12 botol) diatur di drawer Edit bahan.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" aria-hidden="true" />
          <input type="search" aria-label="Cari bahan" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari bahan…" className={cn(ui.input, `pl-9`)} />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-[#D9DCE1] bg-white px-3 text-[13px] font-semibold text-[#374151]">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="size-4 accent-[#C8102E]" />
          Perlu dicek ({issueCount})
        </label>
      </div>
      {error && <p role="alert" className="text-[13px] text-[#B91C1C]">{error}</p>}
      <div className={cn(ui.card, `max-h-[calc(100vh-320px)] min-h-[240px] overflow-auto`)}>
        <table className="w-full min-w-[860px] border-collapse">
          <thead className="sticky top-0 z-[1] bg-[#F3F4F6]">
            <tr>
              <th className={ui.th}>SKU</th>
              <th className={ui.th}>Bahan</th>
              <th className={ui.th}>Satuan dasar</th>
              <th className={ui.th}>Konversi pembelian</th>
              <th className={ui.th}>Kemasan lain</th>
              <th className={cn(ui.th, `text-right`)}>Harga / kemasan</th>
              <th className={cn(ui.th, `text-right`)}>HPP / satuan</th>
              <th className={ui.th}><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF0F3]">
            {shown.length === 0 && <EmptyRow colSpan={8}>Tidak ada bahan.</EmptyRow>}
            {shown.map(({ r, packName, issue }) => (
              <tr key={r.id} className="hover:bg-[#FAFAFB]">
                <td className={cn(ui.td, `font-mono text-[12.5px] font-bold text-[#C8102E]`)}>{r.sku}</td>
                <td className={ui.td}>{r.name}</td>
                <td className={cn(ui.td, `font-semibold`)}>{r.unit}</td>
                <td className={ui.td}>
                  {r.packQty > 0 ? (
                    <span className="whitespace-nowrap">1 {packName || "kemasan"} = <b className="tabular-nums">{qty.format(r.packQty)}</b> {r.unit}</span>
                  ) : null}
                  {issue && (
                    <span className="mt-0.5 flex items-start gap-1 text-[12px] font-medium text-[#92400E]">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {issue}
                    </span>
                  )}
                </td>
                <td className={cn(ui.td, `text-[12.5px] text-[#374151]`)}>
                  {(r.uoms ?? []).filter((u) => u.factor !== r.packQty).map((u) => `1 ${u.uom} = ${qty.format(u.factor)} ${r.unit}`).join(" · ") || "—"}
                </td>
                <td className={cn(ui.td, `whitespace-nowrap text-right font-mono tabular-nums`)}>{r.packQty > 0 ? currency.format(r.packPrice) : "—"}</td>
                <td className={cn(ui.td, `whitespace-nowrap text-right font-mono font-semibold tabular-nums`)}>{unitCostCurrency.format(r.hpp)}/{r.unit}</td>
                <td className={ui.td}>
                  {canEdit && (
                    <button type="button" className={ui.iconBtn} aria-label={`Atur kemasan ${r.name}`} onClick={() => setEditing((e) => ({ product: r, key: (e?.key ?? 0) + 1 }))}>
                      <Pencil className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <MaterialDrawer
          key={editing.key}
          open
          product={editing.product}
          categories={categories}
          suppliers={suppliers}
          subcategoryHints={[]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
