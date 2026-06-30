"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2, X } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow } from "@/lib/wms-types";

type RecipeRow = {
  id: string;
  name: string;
  category: string;
  sellPrice: number;
  cogs: number;
  foodCostPct: number;
  margin: number;
};
type RecipeDetail = RecipeRow & {
  yieldQty: string;
  bom: Array<{ id: string; productName: string; unit: string; qty: number; hpp: number; lineCost: number; contribPct: number }>;
};

function foodCostColor(pct: number) {
  if (pct <= 30) return "#16A34A";
  if (pct <= 38) return "#D97706";
  return "#DC2626";
}

export default function WmsRecipePage() {
  const [list, setList] = useState<RecipeRow[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [recs, prods] = await Promise.all([
      garageApi.get<RecipeRow[]>("/api/wms/recipes"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
    ]);
    setList(recs);
    setProducts(prods);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [recs, prods] = await Promise.all([
          garageApi.get<RecipeRow[]>("/api/wms/recipes"),
          garageApi.get<WmsProductRow[]>("/api/wms/products"),
        ]);
        if (alive) {
          setList(recs);
          setProducts(prods);
        }
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function openDetail(id: string) {
    setDetail(await garageApi.get<RecipeDetail>(`/api/wms/recipes/${id}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Recipe / BOM</h1>
          <p className="text-[13px] text-[#6B7280]">Resep & bill of materials — COGS, food cost, margin otomatis dari HPP bahan.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26]">
          <Plus className="size-4" /> Buat Resep
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E8E8E8] bg-white py-12 text-center">
          <BookOpen className="mx-auto mb-2 size-6 text-[#D1D5DB]" />
          <p className="text-[13px] text-[#6B7280]">Belum ada resep. Buat resep untuk menghitung HPP & margin.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <button key={r.id} type="button" onClick={() => void openDetail(r.id)} className="rounded-xl border border-[#E8E8E8] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-bold text-[#111111]">{r.name}</p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${foodCostColor(r.foodCostPct)}22`, color: foodCostColor(r.foodCostPct) }}>
                  {r.foodCostPct}%
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280]">{r.category || "—"}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label="COGS" value={currency.format(r.cogs)} />
                <Metric label="Jual" value={currency.format(r.sellPrice)} />
                <Metric label="Margin" value={currency.format(r.margin)} accent />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail slide-over */}
      {detail && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDetail(null)} />}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-[-16px_0_50px_rgba(0,0,0,0.28)] transition-transform duration-300"
        style={{ transform: detail ? "translateX(0)" : "translateX(100%)", transitionTimingFunction: "cubic-bezier(.22,1,.36,1)" }}
      >
        {detail && (
          <>
            <div className="flex items-start justify-between border-b border-[#E8E8E8] p-4">
              <div>
                <h2 className="text-[16px] font-extrabold text-[#111111]">{detail.name}</h2>
                <p className="text-[12px] text-[#6B7280]">{detail.category || "—"} · yield {detail.yieldQty}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="grid size-8 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="COGS" value={currency.format(detail.cogs)} big />
                <Metric label="Harga Jual" value={currency.format(detail.sellPrice)} big />
                <Metric label="Margin" value={currency.format(detail.margin)} big accent />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-[#6B7280]">Food Cost Ratio</span>
                  <span className="font-bold" style={{ color: foodCostColor(detail.foodCostPct) }}>{detail.foodCostPct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EEF0F3]">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, detail.foodCostPct)}%`, background: foodCostColor(detail.foodCostPct) }} />
                </div>
                <p className="mt-1 text-[10.5px] text-[#9CA3AF]">Target: hijau ≤30% · amber ≤38% · merah &gt;38%</p>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Bill of Materials</p>
                <div className="space-y-1.5">
                  {detail.bom.map((b) => (
                    <div key={b.id} className="rounded-lg border border-[#E8E8E8] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#111111]">{b.productName}</span>
                        <span className="font-mono text-[12.5px] text-[#111111]">{currency.format(b.lineCost)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[#6B7280]">
                        <span className="font-mono">{b.qty} {b.unit}</span>
                        <span>{b.contribPct}% dari COGS</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      {creating && <CreateRecipe products={products} onDone={() => { setCreating(false); void load(); }} onCancel={() => setCreating(false)} />}
    </div>
  );
}

function Metric({ label, value, accent, big }: { label: string; value: string; accent?: boolean; big?: boolean }) {
  return (
    <div className="rounded-lg bg-[#F8F9FB] px-2 py-2">
      <p className={`font-mono font-extrabold ${big ? "text-[15px]" : "text-[13px]"} ${accent ? "text-[#16A34A]" : "text-[#111111]"}`}>{value}</p>
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#6B7280]">{label}</p>
    </div>
  );
}

function CreateRecipe({ products, onDone, onCancel }: { products: WmsProductRow[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [bom, setBom] = useState<Array<{ productId: string; qty: string }>>([{ productId: "", qty: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !Number(sellPrice) || busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/recipes", {
        name: name.trim(),
        category: category.trim() || undefined,
        sellPrice: Number(sellPrice),
        bom: bom.filter((b) => b.productId && Number(b.qty) > 0).map((b) => ({ productId: b.productId, qty: Number(b.qty) })),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan resep.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-[13px] outline-none focus:border-[#C8102E]";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCancel} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-[-16px_0_50px_rgba(0,0,0,0.28)]">
        <div className="flex items-center justify-between border-b border-[#E8E8E8] p-4">
          <h2 className="text-[15px] font-bold text-[#111111]">Buat Resep</h2>
          <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama resep" className={`${input} w-full`} />
          <div className="grid grid-cols-2 gap-2">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategori" className={input} />
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="numeric" placeholder="Harga jual" className={input} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Bahan (BOM)</p>
          {bom.map((b, i) => (
            <div key={i} className="flex gap-2">
              <select value={b.productId} onChange={(e) => setBom((p) => p.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))} className={`${input} flex-1`}>
                <option value="">Pilih bahan…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </select>
              <input value={b.qty} onChange={(e) => setBom((p) => p.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" placeholder="qty" className={`${input} w-20 text-right`} />
              {bom.length > 1 && (
                <button type="button" onClick={() => setBom((p) => p.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-md text-[#DC2626] hover:bg-[#FEE2E2]"><Trash2 className="size-4" /></button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setBom((p) => [...p, { productId: "", qty: "" }])} className="flex items-center gap-1 text-[12.5px] font-semibold text-[#C8102E]">
            <Plus className="size-3.5" /> Tambah bahan
          </button>
          {err && <p className="text-[12.5px] text-[#DC2626]">{err}</p>}
        </div>
        <div className="border-t border-[#E8E8E8] p-4">
          <button type="button" disabled={!name.trim() || !Number(sellPrice) || busy} onClick={() => void submit()} className="w-full rounded-lg bg-[#C8102E] py-3 text-[14px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
            Simpan Resep
          </button>
        </div>
      </aside>
    </>
  );
}
