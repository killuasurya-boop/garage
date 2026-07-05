"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Plus, RefreshCw, Sparkles, X } from "lucide-react";

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
  source?: "os-sync" | "manual";
};

type RecipeCoverage = {
  totalProducts: number;
  withMenuRecipes: number;
  syncedToWms: number;
  coveragePct: number;
  missingMenuRecipes: Array<{ id: string; name: string; category: string }>;
  pendingSync: Array<{ id: string; name: string; category: string }>;
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
  const [coverage, setCoverage] = useState<RecipeCoverage | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load() {
    const [recs, prods, cov] = await Promise.all([
      garageApi.get<RecipeRow[]>("/api/wms/recipes"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
      garageApi.get<RecipeCoverage>("/api/wms/recipes/coverage"),
    ]);
    setList(recs);
    setProducts(prods);
    setCoverage(cov);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [recs, prods, cov] = await Promise.all([
          garageApi.get<RecipeRow[]>("/api/wms/recipes"),
          garageApi.get<WmsProductRow[]>("/api/wms/products"),
          garageApi.get<RecipeCoverage>("/api/wms/recipes/coverage"),
        ]);
        if (alive) {
          setList(recs);
          setProducts(prods);
          setCoverage(cov);
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

  async function syncFromProducts() {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const res = await garageApi.post<{
        recipes: { created: number; updated: number; skipped: number };
        coverage: RecipeCoverage;
      }>("/api/wms/recipes/sync", {});
      setSyncMsg(
        `Sinkron selesai: ${res.recipes.created} resep baru, ${res.recipes.updated} diperbarui. Cakupan ${res.coverage.coveragePct}%.`,
      );
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Gagal sinkron resep dari produk OS.");
    } finally {
      setSyncBusy(false);
    }
  }

  const needsAttention = coverage && coverage.coveragePct < 100;

  return (
    <div className="space-y-4">
      {/* Coverage banner */}
      {coverage && (
        <div
          className={`rounded-xl border p-4 ${
            needsAttention ? "border-[#F59E0B]/40 bg-[#FFFBEB]" : "border-[#16A34A]/30 bg-[#F0FDF4]"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                <Sparkles className="size-3.5 text-[#C8102E]" /> Sumber Resep · Produk Manajemen OS
              </p>
              <p className="mt-1 text-[15px] font-extrabold text-[#111111]">
                {coverage.syncedToWms}/{coverage.totalProducts} produk punya BOM di WMS ({coverage.coveragePct}%)
              </p>
              <p className="mt-0.5 text-[12.5px] text-[#6B7280]">
                Resep/BOM di WMS ditarik dari <b>menu_recipes</b> Produk Manajemen. Edit resep di OS, lalu sinkron
                ulang agar COGS & potong stok POS selalu sama.
              </p>
              {coverage.missingMenuRecipes.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[#D97706]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {coverage.missingMenuRecipes.length} produk belum punya bahan/resep di Produk Manajemen.
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void syncFromProducts()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#C8102E] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26] disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${syncBusy ? "animate-spin" : ""}`} />
              {syncBusy ? "Menarik data…" : "Tarik dari Produk OS"}
            </button>
          </div>
          {syncMsg && <p className="mt-2 text-[12.5px] font-semibold text-[#111111]">{syncMsg}</p>}
          {coverage.pendingSync.length > 0 && (
            <div className="mt-3 rounded-lg border border-[#E8E8E8] bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                Menunggu sinkron ({coverage.pendingSync.length})
              </p>
              <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[12.5px] text-[#111111]">
                {coverage.pendingSync.slice(0, 8).map((p) => (
                  <li key={p.id}>· {p.name}</li>
                ))}
                {coverage.pendingSync.length > 8 && (
                  <li className="text-[#9CA3AF]">+{coverage.pendingSync.length - 8} lainnya</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Recipe / BOM</h1>
          <p className="text-[13px] text-[#6B7280]">
            Resep & bill of materials — COGS, food cost, margin otomatis dari HPP bahan.{" "}
            <Link href="/warehouse/settings?sync=1" className="font-semibold text-[#C8102E] hover:underline">
              Sinkron penuh OS
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"
        >
          <Plus className="size-4" /> Resep Manual
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E8E8E8] bg-white py-12 text-center">
          <BookOpen className="mx-auto mb-2 size-6 text-[#D1D5DB]" />
          <p className="text-[13px] text-[#6B7280]">Belum ada resep. Klik &quot;Tarik dari Produk OS&quot; untuk mengisi dari menu.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => void openDetail(r.id)}
              className="rounded-xl border border-[#E8E8E8] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-bold text-[#111111]">{r.name}</p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: `${foodCostColor(r.foodCostPct)}22`, color: foodCostColor(r.foodCostPct) }}
                >
                  {r.foodCostPct}%
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-[#6B7280]">{r.category || "—"}</p>
                {r.source === "os-sync" ? (
                  <span className="rounded-full bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#2563EB]">
                    OS Sync
                  </span>
                ) : (
                  <span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#6B7280]">
                    Manual
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label="COGS" value={currency.format(r.cogs)} />
                <Metric label="Jual" value={currency.format(r.sellPrice)} />
                <Metric label="Margin" value={currency.format(r.margin)} accent />
              </div>
            </button>
          ))}
        </div>
      )}

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
                <p className="text-[12px] text-[#6B7280]">
                  {detail.category || "—"} · yield {detail.yieldQty}
                  {detail.source === "os-sync" ? " · dari Produk OS" : ""}
                </p>
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
          <h2 className="text-[15px] font-bold text-[#111111]">Buat Resep Manual</h2>
          <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="rounded-lg bg-[#F8F9FB] px-3 py-2 text-[12px] text-[#6B7280]">
            Resep manual untuk item khusus. Untuk menu POS, edit BOM di Produk Manajemen lalu gunakan &quot;Tarik dari Produk OS&quot;.
          </p>
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
