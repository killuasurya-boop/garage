"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus, Printer, Trash2 } from "lucide-react";

import { printWmsDoc, escapeHtml, signatureRow } from "@/lib/wms-print";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type TransferRow = { doc: string; createdAt: string; qtyOut: number; valueHpp: number; items: number };
type CartLine = { product: WmsProductRow; qty: number };

export default function WmsTransferPage() {
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [history, setHistory] = useState<TransferRow[]>([]);
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadHistory() {
    setHistory(await garageApi.get<TransferRow[]>("/api/wms/transfer"));
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [whs, hist] = await Promise.all([
        garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
        garageApi.get<TransferRow[]>("/api/wms/transfer"),
      ]);
      if (!alive) return;
      setWarehouses(whs);
      setHistory(hist);
      const primary = whs.find((w) => w.isPrimary)?.id ?? whs[0]?.id ?? "";
      setFromWh(primary);
      setToWh(whs.find((w) => w.id !== primary)?.id ?? "");
    })();
    return () => { alive = false; };
  }, []);

  // Muat stok produk sesuai gudang ASAL (ketersediaan transfer).
  useEffect(() => {
    if (!fromWh) return;
    let alive = true;
    void garageApi.get<WmsProductRow[]>(`/api/wms/products?warehouse=${fromWh}`).then((p) => { if (alive) setProducts(p); });
    return () => { alive = false; };
  }, [fromWh]);

  const inCart = new Set(cart.map((l) => l.product.id));
  const available = products.filter((p) => !inCart.has(p.id) && p.onHand > 0);
  const totalValue = cart.reduce((s, l) => s + l.qty * l.product.hpp, 0);

  function addItem() {
    const prod = products.find((p) => p.id === pick);
    if (!prod) return;
    setCart((c) => [...c, { product: prod, qty: 1 }]);
    setPick("");
  }

  async function submit() {
    if (!fromWh || !toWh || fromWh === toWh || cart.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await garageApi.post<{ doc: string; count: number }>("/api/wms/transfer", {
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
      });
      setMsg(`Transfer ${res.doc} berhasil (${res.count} item).`);
      setCart([]);
      await Promise.all([loadHistory(), garageApi.get<WmsProductRow[]>(`/api/wms/products?warehouse=${fromWh}`).then(setProducts)]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal transfer.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-[#111111]"><ArrowLeftRight className="size-6 text-[#C8102E]" /> Transfer Antar-Gudang</h1>
        <p className="text-[13px] text-[#6B7280]">Pindahkan stok bahan dari satu gudang ke gudang lain (FEFO, HPP ikut batch).</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Form */}
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">Dari gudang</label>
              <select value={fromWh} onChange={(e) => { setFromWh(e.target.value); setCart([]); }} className={`${input} w-full`}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">Ke gudang</label>
              <select value={toWh} onChange={(e) => setToWh(e.target.value)} className={`${input} w-full`}>
                {warehouses.filter((w) => w.id !== fromWh).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${input} flex-1`}>
              <option value="">Pilih bahan…</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name} (stok {p.onHand} {p.unit})</option>)}
            </select>
            <button type="button" disabled={!pick} onClick={addItem} className="flex items-center gap-1 rounded-md bg-[#2F3136] px-3 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-50"><Plus className="size-4" /> Tambah</button>
          </div>

          <div className="mt-3 space-y-2">
            {cart.length === 0 && <p className="py-4 text-center text-[12.5px] text-[#9CA3AF]">Belum ada item.</p>}
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center gap-2 rounded-lg border border-[#E8E8E8] p-2">
                <span className="flex-1 text-[13px] font-semibold text-[#111111]">{l.product.name} <span className="text-[11px] font-normal text-[#9CA3AF]">/ {l.product.unit}</span></span>
                <input
                  type="number" min={1} max={l.product.onHand} value={l.qty}
                  onChange={(e) => { const q = Math.max(1, Math.min(l.product.onHand, Number(e.target.value) || 1)); setCart((c) => c.map((x) => x.product.id === l.product.id ? { ...x, qty: q } : x)); }}
                  className={`${input} w-20 text-right`}
                />
                <button type="button" onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#FDF1F3] hover:text-[#C8102E]"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>

          {msg && <p className="mt-3 text-[12.5px] font-semibold text-[#16A34A]">{msg}</p>}
          {err && <p className="mt-3 text-[12.5px] text-[#DC2626]">{err}</p>}

          <div className="mt-3 flex items-center justify-between border-t border-[#E8E8E8] pt-3">
            <span className="text-[12.5px] text-[#6B7280]">Estimasi nilai: <b className="text-[#111111]">{currency.format(Math.round(totalValue))}</b></span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  const from = warehouses.find((w) => w.id === fromWh)?.name ?? "—";
                  const to = warehouses.find((w) => w.id === toWh)?.name ?? "—";
                  const rows = cart.map((l) => `<tr><td>${escapeHtml(l.product.name)}</td><td class="c">${escapeHtml(l.product.unit)}</td><td class="r">${l.qty}</td></tr>`).join("");
                  printWmsDoc(
                    "Slip Transfer Stok",
                    `<table><thead><tr><th>Bahan</th><th class="c">Satuan</th><th class="r">Qty</th></tr></thead><tbody>${rows}</tbody></table>${signatureRow(["Diserahkan", "Diterima"])}`,
                    `${from} → ${to}`,
                  );
                }}
                className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB] disabled:opacity-50"
              >
                <Printer className="size-4 text-[#2563EB]" /> Slip
              </button>
              <button type="button" disabled={busy || cart.length === 0 || !toWh || fromWh === toWh} onClick={() => void submit()} className="rounded-lg bg-[#C8102E] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
                {busy ? "Memproses…" : "Transfer Stok"}
              </button>
            </div>
          </div>
        </section>

        {/* Riwayat */}
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <p className="mb-2 text-[14px] font-bold text-[#111111]">Riwayat Transfer</p>
          <div className="space-y-1.5">
            {history.length === 0 && <p className="py-4 text-center text-[12.5px] text-[#9CA3AF]">Belum ada transfer.</p>}
            {history.map((h) => (
              <div key={h.doc} className="flex items-center justify-between rounded-lg border border-[#F0F1F4] px-3 py-2 text-[12.5px]">
                <div>
                  <p className="font-mono font-bold text-[#C8102E]">{h.doc}</p>
                  <p className="text-[11px] text-[#9CA3AF]">{new Date(h.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[#111111]">{h.items} item · {h.qtyOut} qty</p>
                  <p className="text-[11px] text-[#6B7280]">{currency.format(h.valueHpp)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
