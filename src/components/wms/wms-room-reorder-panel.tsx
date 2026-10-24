"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, Trash2 } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type Rule = { id: string; productId: string; warehouseId: string; minQty: number; maxQty: number; name: string; unit: string; warehouseName: string };
type Suggestion = {
  ruleId: string;
  productId: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  minQty: number;
  maxQty: number;
  needQty: number;
  transferQty: number;
  sourceWarehouseId: string | null;
  sourceWarehouseName: string | null;
  purchaseQty: number;
  supplier: string | null;
  lastPrice: number | null;
};

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

/**
 * Reorder per ruang (Bar/Dapur/gudang): aturan min–max + saran isi ulang. Outlet
 * diisi dari gudang utama areanya lewat Internal Order; sisanya dibuat PO per supplier.
 */
export function WmsRoomReorderPanel({ onPurchaseOrdersCreated }: { onPurchaseOrdersCreated?: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [form, setForm] = useState({ productId: "", warehouseId: "", minQty: "", maxQty: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      garageApi.get<Rule[]>("/api/wms/reorder-rules"),
      garageApi.get<Suggestion[]>("/api/wms/reorder-rules/suggestions"),
    ]);
    setRules(r);
    setSuggestions(s);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      garageApi.get<Rule[]>("/api/wms/reorder-rules"),
      garageApi.get<Suggestion[]>("/api/wms/reorder-rules/suggestions"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
      garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
    ])
      .then(([r, s, p, w]) => {
        if (!alive) return;
        setRules(r);
        setSuggestions(s);
        setProducts(p);
        setWarehouses(w);
        setForm((f) => ({ ...f, warehouseId: w.find((x) => x.type === "bar")?.id ?? w[0]?.id ?? "" }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    } finally {
      setBusy(false);
    }
  }

  const saveRule = () =>
    run(async () => {
      await garageApi.post("/api/wms/reorder-rules", {
        productId: form.productId,
        warehouseId: form.warehouseId,
        minQty: Number(form.minQty),
        maxQty: Number(form.maxQty),
      });
      setForm((f) => ({ ...f, productId: "", minQty: "", maxQty: "" }));
      return "Aturan reorder tersimpan.";
    });

  const transferGroups = suggestions.filter((s) => s.transferQty > 0 && s.sourceWarehouseId);
  const requestTransfers = () =>
    run(async () => {
      const byOutlet = new Map<string, { source: string; items: Array<{ productId: string; qty: number }> }>();
      for (const s of transferGroups) {
        const key = `${s.warehouseId}|${s.sourceWarehouseId}`;
        const group = byOutlet.get(key) ?? { source: s.sourceWarehouseId as string, items: [] };
        group.items.push({ productId: s.productId, qty: s.transferQty });
        byOutlet.set(key, group);
      }
      const docs: string[] = [];
      for (const [key, group] of byOutlet) {
        const io = await garageApi.post<{ doc: string }>("/api/wms/internal-orders", {
          outletWarehouseId: key.split("|")[0],
          sourceWarehouseId: group.source,
          items: group.items,
        });
        docs.push(io.doc);
      }
      return `Internal Order dibuat: ${docs.join(", ")}.`;
    });

  const createPos = () =>
    run(async () => {
      const result = await garageApi.post<{ created: Array<{ doc: string }>; skipped: string[] }>("/api/wms/reorder-rules/suggestions", {});
      onPurchaseOrdersCreated?.();
      const made = result.created.length ? `PO draft dibuat: ${result.created.map((p) => p.doc).join(", ")}.` : "Tidak ada PO dibuat.";
      return result.skipped.length ? `${made} Tanpa riwayat supplier (buat PO manual): ${result.skipped.join(", ")}.` : made;
    });

  const input = "h-10 w-full rounded-md border border-[#dedfe4] bg-white px-2.5 text-[14px] text-[#17191d] outline-none focus:border-[#C8102E]";
  const buyCount = suggestions.filter((s) => s.purchaseQty > 0).length;

  return (
    <section className="rounded-xl border border-[#E8E8E8] bg-white p-4" data-testid="wms-room-reorder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-[#111111]">
          <Repeat className="size-4 text-[#C8102E]" aria-hidden /> Reorder per ruang (Bar · Dapur · Gudang)
        </h2>
        <button type="button" onClick={() => setShowRules((v) => !v)} className="text-[13px] font-semibold text-[#C8102E]">
          {showRules ? "Tutup aturan" : `Atur min–max (${rules.length})`}
        </button>
      </div>
      {msg && <p className={`mt-2 text-[13px] font-semibold ${msg.ok ? "text-[#15803D]" : "text-[#C8102E]"}`}>{msg.text}</p>}

      {showRules && (
        <div className="mt-3 rounded-lg border border-[#F0F1F4] p-3">
          <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_90px_90px_auto] sm:items-end">
            <label className="text-[12px] font-semibold text-[#525866]">
              Bahan
              <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={`${input} mt-1`}>
                <option value="">Pilih bahan…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-[#525866]">
              Ruang
              <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className={`${input} mt-1`}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-[#525866]">
              Min
              <input value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} inputMode="decimal" className={`${input} mt-1 text-right`} />
            </label>
            <label className="text-[12px] font-semibold text-[#525866]">
              Maks
              <input value={form.maxQty} onChange={(e) => setForm({ ...form, maxQty: e.target.value })} inputMode="decimal" className={`${input} mt-1 text-right`} />
            </label>
            <button type="button" disabled={busy || !form.productId || !form.warehouseId || !(Number(form.maxQty) > 0)} onClick={() => void saveRule()} className="min-h-10 rounded-lg bg-[#C8102E] px-4 text-[13px] font-bold text-white disabled:opacity-50">
              Simpan
            </button>
          </div>
          {rules.length > 0 && (
            <ul className="mt-3 max-h-56 divide-y divide-[#F0F1F4] overflow-y-auto">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px] text-[#17191d]">
                  <span className="min-w-0">{r.name} · <span className="text-[#525866]">{r.warehouseName}</span> · min {qtyFormat.format(r.minQty)} / maks {qtyFormat.format(r.maxQty)} {r.unit}</span>
                  <button
                    type="button"
                    aria-label={`Hapus aturan ${r.name}`}
                    disabled={busy}
                    onClick={() => void run(async () => { await garageApi.delete(`/api/wms/reorder-rules/${r.id}`); return "Aturan dihapus."; })}
                    className="grid size-9 shrink-0 place-items-center rounded-md text-[#525866] hover:bg-[#FDF1F3] hover:text-[#C8102E]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {suggestions.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#525866]">{rules.length ? "Semua ruang di atas batas minimum." : "Belum ada aturan min–max per ruang."}</p>
      ) : (
        <>
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="sticky top-0 bg-white text-[12px] text-[#525866]">
                <tr>
                  <th className="py-1.5 pr-2 font-semibold">Bahan · ruang</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Stok / min</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Butuh</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Ambil dari gudang</th>
                  <th className="py-1.5 text-right font-semibold">Beli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F1F4] text-[#17191d]">
                {suggestions.map((s) => (
                  <tr key={s.ruleId}>
                    <td className="py-1.5 pr-2">{s.name}<span className="block text-[11px] text-[#525866]">{s.warehouseName}</span></td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{qtyFormat.format(s.onHand)} / {qtyFormat.format(s.minQty)} {s.unit}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{qtyFormat.format(s.needQty)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{s.transferQty > 0 ? <>{qtyFormat.format(s.transferQty)}<span className="block text-[11px] text-[#525866]">{s.sourceWarehouseName}</span></> : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.purchaseQty > 0 ? <>{qtyFormat.format(s.purchaseQty)}<span className="block text-[11px] text-[#525866]">{s.supplier ? `${s.supplier}${s.lastPrice ? ` · ${currency.format(s.lastPrice)}` : ""}` : "supplier belum ada"}</span></> : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || transferGroups.length === 0} onClick={() => void requestTransfers()} className="min-h-10 rounded-lg border border-[#E8E8E8] px-3 text-[13px] font-semibold text-[#111111] disabled:opacity-50">
              Buat Internal Order ({transferGroups.length})
            </button>
            <button type="button" disabled={busy || buyCount === 0} onClick={() => void createPos()} className="min-h-10 rounded-lg bg-[#C8102E] px-3 text-[13px] font-bold text-white disabled:opacity-50">
              Buat PO draft ({buyCount})
            </button>
          </div>
        </>
      )}
    </section>
  );
}
