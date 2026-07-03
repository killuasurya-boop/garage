"use client";

import { useEffect, useState } from "react";
import { Factory, Play, Plus, Trash2, X } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type Recipe = { id: string; name: string; outputQty: number; outputName: string; outputUnit: string; inputs: number };
type Run = { doc: string; createdAt: string; producedQty: number; cost: number };

export default function WmsProductionPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [history, setHistory] = useState<Run[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [creating, setCreating] = useState(false);
  const [runRecipe, setRunRecipe] = useState<Recipe | null>(null);
  const [batches, setBatches] = useState("1");
  const [runWh, setRunWh] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll() {
    const [prod, whs] = await Promise.all([
      garageApi.get<{ recipes: Recipe[]; history: Run[] }>("/api/wms/production"),
      garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
    ]);
    setRecipes(prod.recipes);
    setHistory(prod.history);
    setWarehouses(whs);
    if (!runWh) setRunWh(whs.find((w) => w.isPrimary)?.id ?? whs[0]?.id ?? "");
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [prod, whs, prods] = await Promise.all([
        garageApi.get<{ recipes: Recipe[]; history: Run[] }>("/api/wms/production"),
        garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
        garageApi.get<WmsProductRow[]>("/api/wms/products"),
      ]);
      if (!alive) return;
      setRecipes(prod.recipes);
      setHistory(prod.history);
      setWarehouses(whs);
      setProducts(prods);
      setRunWh(whs.find((w) => w.isPrimary)?.id ?? whs[0]?.id ?? "");
    })();
    return () => { alive = false; };
  }, []);

  async function run() {
    if (!runRecipe || !runWh || busy) return;
    const b = Number(batches);
    if (!(b > 0)) { setErr("Jumlah batch tidak valid."); return; }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await garageApi.post<{ doc: string; producedQty: number; cost: number }>("/api/wms/production", {
        recipeId: runRecipe.id,
        batches: b,
        warehouseId: runWh,
      });
      setMsg(`Produksi ${res.doc}: ${res.producedQty} ${runRecipe.outputUnit} (biaya ${currency.format(res.cost)}).`);
      setRunRecipe(null);
      setBatches("1");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal produksi.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-[#111111]"><Factory className="size-6 text-[#C8102E]" /> Production</h1>
          <p className="text-[13px] text-[#6B7280]">Olah bahan mentah → produk jadi/setengah-jadi (HPP output otomatis dari bahan).</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#a60d26]">
          <Plus className="size-4" /> Resep Produksi
        </button>
      </div>

      {msg && <p className="text-[12.5px] font-semibold text-[#16A34A]">{msg}</p>}
      {err && <p className="text-[12.5px] text-[#DC2626]">{err}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Resep */}
        <section className="rounded-xl border border-[#E8E8E8] bg-white">
          <p className="border-b border-[#E8E8E8] px-4 py-2.5 text-[14px] font-bold text-[#111111]">Resep Produksi</p>
          <div className="divide-y divide-[#F0F1F4]">
            {recipes.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-[#6B7280]">Belum ada resep. Buat resep untuk mulai produksi.</p>}
            {recipes.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-[#111111]">{r.name}</p>
                  <p className="text-[11px] text-[#9CA3AF]">→ {r.outputQty} {r.outputUnit} {r.outputName} · {r.inputs} bahan</p>
                </div>
                <button type="button" onClick={() => setRunRecipe(r)} className="flex items-center gap-1 rounded-md bg-[#2F3136] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black">
                  <Play className="size-3.5" /> Produksi
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Riwayat */}
        <section className="rounded-xl border border-[#E8E8E8] bg-white">
          <p className="border-b border-[#E8E8E8] px-4 py-2.5 text-[14px] font-bold text-[#111111]">Riwayat Produksi</p>
          <div className="divide-y divide-[#F0F1F4]">
            {history.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-[#6B7280]">Belum ada produksi.</p>}
            {history.map((h) => (
              <div key={h.doc} className="flex items-center justify-between px-4 py-2 text-[12.5px]">
                <div>
                  <p className="font-mono font-bold text-[#C8102E]">{h.doc}</p>
                  <p className="text-[11px] text-[#9CA3AF]">{new Date(h.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[#111111]">+{h.producedQty}</p>
                  <p className="text-[11px] text-[#6B7280]">{currency.format(h.cost)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Modal jalankan produksi */}
      {runRecipe && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={() => setRunRecipe(null)}>
          <div className="w-full max-w-sm rounded-xl border border-[#E8E8E8] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-bold text-[#111111]">Produksi: {runRecipe.name}</p>
              <button type="button" onClick={() => setRunRecipe(null)} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
            </div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">Gudang produksi</label>
            <select value={runWh} onChange={(e) => setRunWh(e.target.value)} className={`${input} mb-3 w-full`}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </select>
            <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">Jumlah batch (× {runRecipe.outputQty} {runRecipe.outputUnit})</label>
            <input value={batches} onChange={(e) => setBatches(e.target.value)} inputMode="decimal" className={`${input} w-full`} />
            <button type="button" disabled={busy} onClick={() => void run()} className="mt-3 w-full rounded-lg bg-[#C8102E] py-2 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
              {busy ? "Memproses…" : "Jalankan Produksi"}
            </button>
          </div>
        </div>
      )}

      {creating && (
        <CreateRecipeModal products={products} onDone={() => { setCreating(false); void loadAll(); }} onCancel={() => setCreating(false)} />
      )}
    </div>
  );
}

function CreateRecipeModal({ products, onDone, onCancel }: { products: WmsProductRow[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [bom, setBom] = useState<Array<{ inputProductId: string; qty: string }>>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";
  const inBom = new Set(bom.map((b) => b.inputProductId));

  async function save() {
    if (!name.trim() || !outputProductId || bom.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await garageApi.post("/api/wms/production/recipes", {
        name: name.trim(),
        outputProductId,
        outputQty: Number(outputQty) || 1,
        bom: bom.map((b) => ({ inputProductId: b.inputProductId, qty: Number(b.qty) || 0 })).filter((b) => b.qty > 0),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan resep.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-xl border border-[#E8E8E8] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] font-bold text-[#111111]">Resep Produksi Baru</p>
          <button type="button" onClick={onCancel} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
        </div>
        <div className="space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama resep (mis. Simple Syrup)" className={`${input} w-full`} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select value={outputProductId} onChange={(e) => setOutputProductId(e.target.value)} className={`${input} w-full`}>
              <option value="">Produk hasil (output)…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
            </select>
            <input value={outputQty} onChange={(e) => setOutputQty(e.target.value)} inputMode="decimal" placeholder="Hasil/batch" className={`${input} w-28`} />
          </div>

          <p className="pt-1 text-[11px] font-semibold text-[#6B7280]">Bahan input (per 1 batch)</p>
          <div className="flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${input} flex-1`}>
              <option value="">Pilih bahan…</option>
              {products.filter((p) => !inBom.has(p.id) && p.id !== outputProductId).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
            </select>
            <button type="button" disabled={!pick} onClick={() => { setBom((b) => [...b, { inputProductId: pick, qty: "1" }]); setPick(""); }} className="rounded-md bg-[#2F3136] px-3 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-50">Tambah</button>
          </div>
          {bom.map((b) => {
            const p = products.find((x) => x.id === b.inputProductId);
            return (
              <div key={b.inputProductId} className="flex items-center gap-2 rounded-lg border border-[#E8E8E8] p-2">
                <span className="flex-1 text-[13px] text-[#111111]">{p?.name} <span className="text-[11px] text-[#9CA3AF]">/ {p?.unit}</span></span>
                <input value={b.qty} onChange={(e) => setBom((arr) => arr.map((x) => x.inputProductId === b.inputProductId ? { ...x, qty: e.target.value } : x))} inputMode="decimal" className={`${input} w-24 text-right`} />
                <button type="button" onClick={() => setBom((arr) => arr.filter((x) => x.inputProductId !== b.inputProductId))} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#FDF1F3] hover:text-[#C8102E]"><Trash2 className="size-3.5" /></button>
              </div>
            );
          })}
        </div>
        {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB]">Batal</button>
          <button type="button" disabled={busy || !name.trim() || !outputProductId || bom.length === 0} onClick={() => void save()} className="rounded-md bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">Simpan resep</button>
        </div>
      </div>
    </div>
  );
}
