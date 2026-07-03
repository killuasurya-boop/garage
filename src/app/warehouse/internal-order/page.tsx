"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type IoRow = {
  id: string;
  doc: string;
  status: string;
  totalHpp: number;
  outlet: string;
  items: number;
  createdAt: string;
};
type CartLine = { product: WmsProductRow; qty: number };

export default function WmsInternalOrderPage() {
  const [list, setList] = useState<IoRow[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [open, setOpen] = useState(false);
  const [outletId, setOutletId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  async function load() {
    const [ios, prods, whs] = await Promise.all([
      garageApi.get<IoRow[]>("/api/wms/internal-orders"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
      garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
    ]);
    setList(ios);
    setProducts(prods);
    setWarehouses(whs);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [ios, prods, whs] = await Promise.all([
          garageApi.get<IoRow[]>("/api/wms/internal-orders"),
          garageApi.get<WmsProductRow[]>("/api/wms/products"),
          garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
        ]);
        if (alive) {
          setList(ios);
          setProducts(prods);
          setWarehouses(whs);
        }
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const outlets = warehouses.filter((w) => w.type === "bar" || w.type === "kitchen");
  const estTotal = cart.reduce((s, l) => s + l.qty * l.product.hpp, 0);

  // Sumber = ruang gudang utama sesuai area outlet terpilih (Outlet Bar←Ruang Bar, dst).
  const selectedOutlet = warehouses.find((w) => w.id === outletId);
  const sourceRoom = useMemo(() => {
    if (!selectedOutlet) return null;
    return (
      warehouses.find((w) => w.type === "main" && w.area === selectedOutlet.area) ??
      warehouses.find((w) => w.isPrimary) ??
      null
    );
  }, [selectedOutlet, warehouses]);

  // Muat stok dari ruang sumber (ketersediaan akurat) saat outlet berubah.
  useEffect(() => {
    if (!sourceRoom) return;
    let alive = true;
    void garageApi.get<WmsProductRow[]>(`/api/wms/products?warehouse=${sourceRoom.id}`).then((p) => { if (alive) setProducts(p); });
    return () => { alive = false; };
  }, [sourceRoom]);

  function addItem() {
    const p = products.find((x) => x.id === pick);
    if (!p || cart.some((l) => l.product.id === p.id)) return;
    setCart((c) => [...c, { product: p, qty: 1 }]);
    setPick("");
  }

  async function confirm() {
    if (!outletId || cart.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const io = await garageApi.post<{ doc: string }>("/api/wms/internal-orders", {
        outletWarehouseId: outletId,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
      });
      setOpen(false);
      setCart([]);
      setOutletId("");
      await load();
      setHighlight(io.doc);
      setTimeout(() => setHighlight(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal memproses internal order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Internal Order</h1>
          <p className="text-[13px] text-[#6B7280]">Gudang menyalurkan bahan ke Dapur / Bar (potong stok + HPP).</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26]"
        >
          <Plus className="size-4" /> Buat Internal Order
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
              <th className="px-3 py-2.5">Dokumen</th>
              <th className="px-3 py-2.5">Outlet</th>
              <th className="px-3 py-2.5 text-right">Item</th>
              <th className="px-3 py-2.5 text-right">Total HPP</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[#6B7280]">
                  <ShoppingCart className="mx-auto mb-2 size-6 text-[#D1D5DB]" />
                  Belum ada internal order.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[#F0F1F4] last:border-0 transition-colors"
                  style={{ background: highlight === r.doc ? "#DCFCE7" : undefined }}
                >
                  <td className="px-3 py-2.5 font-mono text-[12px] font-bold text-[#C8102E]">{r.doc}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{r.outlet}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.items}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-[#111111]">{currency.format(r.totalHpp)}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold uppercase text-[#2563EB]">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-over builder */}
      {open && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-[-16px_0_50px_rgba(0,0,0,0.28)] transition-transform duration-300"
        style={{ transform: open ? "translateX(0)" : "translateX(100%)", transitionTimingFunction: "cubic-bezier(.22,1,.36,1)" }}
      >
        <div className="flex items-center justify-between border-b border-[#E8E8E8] p-4">
          <h2 className="text-[15px] font-bold text-[#111111]">Internal Order Baru</h2>
          <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Outlet tujuan</p>
            <div className="flex gap-2">
              {outlets.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setOutletId(o.id); setCart([]); }}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-[13px] font-semibold transition ${
                    outletId === o.id ? "border-[#C8102E] bg-[#FDF1F3] text-[#C8102E]" : "border-[#E8E8E8] text-[#111111] hover:bg-[#F8F9FB]"
                  }`}
                >
                  {o.name}
                </button>
              ))}
            </div>
            {sourceRoom && (
              <p className="mt-1.5 text-[11px] text-[#6B7280]">Sumber otomatis: <b className="text-[#111111]">{sourceRoom.name}</b></p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Tambah bahan</p>
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 flex-1 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-[13px] outline-none focus:border-[#C8102E]">
                <option value="">Pilih bahan…</option>
                {products.filter((p) => !cart.some((l) => l.product.id === p.id)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stok {p.onHand} {p.unit})
                  </option>
                ))}
              </select>
              <button type="button" onClick={addItem} disabled={!pick} className="rounded-md bg-[#2F3136] px-3 text-[13px] font-bold text-white disabled:opacity-40">
                Tambah
              </button>
            </div>
          </div>

          {/* Keranjang */}
          <div className="space-y-2">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#9CA3AF]">Keranjang kosong.</p>
            ) : (
              cart.map((l) => {
                const over = l.qty > l.product.onHand;
                return (
                  <div key={l.product.id} className="rounded-lg border border-[#E8E8E8] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-[#111111]">{l.product.name}</span>
                        <span className="block text-[11px] text-[#6B7280]">stok {l.product.onHand} {l.product.unit}</span>
                      </span>
                      <button type="button" onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))} className="grid size-7 place-items-center rounded-md text-[#DC2626] hover:bg-[#FEE2E2]">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="grid size-7 place-items-center rounded-md border border-[#E8E8E8]">
                          <Minus className="size-3.5" />
                        </button>
                        <input
                          value={l.qty}
                          onChange={(e) => setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                          inputMode="numeric"
                          className="h-7 w-16 rounded-md border border-[#E8E8E8] text-center font-mono text-[13px] outline-none focus:border-[#C8102E]"
                        />
                        <button type="button" onClick={() => setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, qty: x.qty + 1 } : x)))} className="grid size-7 place-items-center rounded-md border border-[#E8E8E8]">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <span className="font-mono text-[12.5px] text-[#6B7280]">≈ {currency.format(Math.round(l.qty * l.product.hpp))}</span>
                    </div>
                    {over && <p className="mt-1 text-[11px] font-semibold text-[#DC2626]">Melebihi stok ({l.product.onHand}).</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t border-[#E8E8E8] p-4">
          {err && <p className="mb-2 text-[12.5px] font-semibold text-[#DC2626]">{err}</p>}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] text-[#6B7280]">Estimasi total HPP</span>
            <span className="font-mono text-[16px] font-extrabold text-[#111111]">{currency.format(Math.round(estTotal))}</span>
          </div>
          <button
            type="button"
            disabled={!outletId || cart.length === 0 || busy || cart.some((l) => l.qty > l.product.onHand)}
            onClick={() => void confirm()}
            className="w-full rounded-lg bg-[#16A34A] py-3 text-[14px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50"
          >
            Konfirmasi &amp; Potong Stok
          </button>
        </div>
      </aside>
    </div>
  );
}
