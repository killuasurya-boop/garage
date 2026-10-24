"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { PackUom } from "@/lib/stock-uom";

type Portion = { menu: string; perPortion: number; unit: string; pack: string | null; portions: number | null };
type Payload = { stored: boolean; uoms: PackUom[]; portions: Portion[] };
type Row = { uom: string; factor: string; isPurchase: boolean; isCount: boolean };

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
const toRow = (u: PackUom): Row => ({ uom: u.uom, factor: String(u.factor), isPurchase: !!u.isPurchase, isCount: !!u.isCount });

/**
 * Kemasan bahan (1 kotak = 1000 ml, 1 dus = 24 botol) + hasil porsi dari resep aktif
 * ("1 kotak ≈ 4 porsi Es Teh"). Stok & HPP tetap per satuan dasar.
 */
export function WmsProductPackSection({ productId, unit, canEdit }: { productId: string; unit: string; canEdit: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void garageApi
      .get<Payload>(`/api/wms/products/${productId}/uoms`)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setRows(payload.uoms.map(toRow));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [productId]);

  const input = "h-9 w-full rounded-md border border-[#E8E8E8] bg-white px-2 text-[13px] outline-none focus:border-[#C8102E]";

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const payload = await garageApi.put<Omit<Payload, "stored">>(`/api/wms/products/${productId}/uoms`, {
        uoms: rows
          .filter((r) => r.uom.trim())
          .map((r) => ({ uom: r.uom.trim(), factor: Number(r.factor.replace(",", ".")) || 0, isPurchase: r.isPurchase, isCount: r.isCount })),
      });
      setData({ stored: true, ...payload });
      setRows(payload.uoms.map(toRow));
      setMsg({ ok: true, text: "Kemasan tersimpan." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan kemasan." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#E8E8E8] bg-white p-3 sm:col-span-2" data-testid="wms-product-packs">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#111111]">
        <Package className="size-3.5 text-[#C8102E]" aria-hidden /> Kemasan (untuk hitung, minta & beli)
      </p>
      <p className="text-[11px] text-[#525866]">Stok & HPP tetap per {unit}. Contoh: kotak = 1000 {unit}.</p>
      <div className="mt-2 grid gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
            <input aria-label="Nama kemasan" value={r.uom} disabled={!canEdit} onChange={(e) => setRows((c) => c.map((x, j) => (j === i ? { ...x, uom: e.target.value } : x)))} placeholder="kotak" className={input} />
            <label className="flex items-center gap-1 text-[12px] text-[#525866]">
              <span className="shrink-0">=</span>
              <input aria-label={`Isi per kemasan (${unit})`} inputMode="decimal" value={r.factor} disabled={!canEdit} onChange={(e) => setRows((c) => c.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} placeholder="1000" className={`${input} text-right`} />
              <span className="shrink-0">{unit}</span>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-[#525866]">
              <input type="radio" name={`buy-${productId}`} checked={r.isPurchase} disabled={!canEdit} onChange={() => setRows((c) => c.map((x, j) => ({ ...x, isPurchase: j === i })))} /> beli
            </label>
            <label className="flex items-center gap-1 text-[11px] text-[#525866]">
              <input type="radio" name={`count-${productId}`} checked={r.isCount} disabled={!canEdit} onChange={() => setRows((c) => c.map((x, j) => ({ ...x, isCount: j === i })))} /> hitung
            </label>
            {canEdit && (
              <button type="button" aria-label={`Hapus kemasan ${r.uom}`} onClick={() => setRows((c) => c.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-md text-[#525866] hover:bg-[#FDF1F3] hover:text-[#C8102E]">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-[12px] text-[#525866]">Belum ada kemasan — stok dihitung per {unit}.</p>}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setRows((c) => [...c, { uom: "", factor: "", isPurchase: c.length === 0, isCount: c.length === 0 }])} className="flex items-center gap-1 text-[12px] font-semibold text-[#C8102E]">
            <Plus className="size-3.5" aria-hidden /> Tambah kemasan
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="ml-auto min-h-9 rounded-md bg-[#2F3136] px-3 text-[12px] font-bold text-white disabled:opacity-50">
            Simpan kemasan
          </button>
        </div>
      )}
      {data && !data.stored && data.uoms.length > 0 && <p className="mt-1 text-[11px] text-[#525866]">Dari isi kemasan katalog. Simpan untuk mengunci.</p>}
      {msg && <p className={`mt-1 text-[12px] font-semibold ${msg.ok ? "text-[#15803D]" : "text-[#C8102E]"}`}>{msg.text}</p>}
      {data && data.portions.length > 0 && (
        <div className="mt-3 border-t border-[#F0F1F4] pt-2">
          <p className="text-[12px] font-bold text-[#111111]">Hasil porsi dari resep aktif</p>
          <ul className="mt-1 grid gap-0.5 text-[12px] text-[#17191d]">
            {data.portions.map((p) => (
              <li key={p.menu} className="flex flex-wrap justify-between gap-2">
                <span>{p.menu} <span className="text-[#525866]">· {qtyFormat.format(p.perPortion)} {unit}/porsi</span></span>
                <span className="font-semibold">{p.pack && p.portions !== null ? `1 ${p.pack} ≈ ${p.portions} porsi` : "–"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
