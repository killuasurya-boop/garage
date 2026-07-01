"use client";

import { useEffect, useState } from "react";
import { Sliders } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type Move = { id: string; productName: string; qty: number; refDoc: string; warehouseName: string; createdAt: string };

export default function WmsAdjustmentPage() {
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [recent, setRecent] = useState<Move[]>([]);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadRecent() {
    const rep = await garageApi.get<{ movements: Move[] }>("/api/wms/reports?type=adjustment");
    setRecent(rep.movements.slice(0, 12));
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [prods, whs, rep] = await Promise.all([
          garageApi.get<WmsProductRow[]>("/api/wms/products"),
          garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
          garageApi.get<{ movements: Move[] }>("/api/wms/reports?type=adjustment"),
        ]);
        if (alive) {
          setProducts(prods);
          setWarehouses(whs);
          setWarehouseId(whs.find((w) => w.isPrimary)?.id ?? whs[0]?.id ?? "");
          setRecent(rep.movements.slice(0, 12));
        }
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    const d = Number(delta);
    if (!productId || !warehouseId || !d || note.trim().length < 3 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await garageApi.post("/api/wms/adjustment", { productId, warehouseId, deltaQty: d, note: note.trim() });
      setMsg("Koreksi stok tersimpan.");
      setDelta("");
      setNote("");
      await loadRecent();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal koreksi stok.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 w-full rounded-md border border-[#E8E8E8] bg-white px-2.5 text-[13px] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Adjustment · Koreksi Stok</h1>
        <p className="text-[13px] text-[#6B7280]">Koreksi stok manual (rusak, hilang, kelebihan) — tercatat di ledger.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#111111]"><Sliders className="size-4 text-[#C8102E]" /> Koreksi Baru</h2>
          <div className="space-y-2.5">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={input}>
              <option value="">Pilih produk…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stok {p.onHand} {p.unit})</option>)}
            </select>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="decimal" placeholder="Delta (mis. -50 atau +20)" className={input} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan wajib (rusak, hilang, dll)" className={input} />
            <p className="text-[11px] text-[#9AA0A6]">Alasan wajib diisi (min 3 karakter) — hanya Owner/Admin/Manager.</p>
            {msg && <p className="text-[12.5px] font-semibold text-[#16A34A]">{msg}</p>}
            <button type="button" disabled={!productId || !Number(delta) || note.trim().length < 3 || busy} onClick={() => void submit()} className="w-full rounded-lg bg-[#C8102E] py-2.5 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
              Simpan Koreksi
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <h2 className="mb-3 text-[14px] font-bold text-[#111111]">Koreksi Terbaru</h2>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#6B7280]">Belum ada koreksi.</p>
          ) : (
            <div className="divide-y divide-[#F0F1F4]">
              {recent.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-[#111111]">{m.productName}</span>
                    <span className="block text-[11px] text-[#6B7280]">{m.warehouseName} · {m.refDoc}</span>
                  </span>
                  <span className={`font-mono text-[13px] font-bold ${m.qty > 0 ? "text-[#16A34A]" : "text-[#C8102E]"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
