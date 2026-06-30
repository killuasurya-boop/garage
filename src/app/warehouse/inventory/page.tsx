"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { WMS_STATUS_COLOR, type WmsProductRow } from "@/lib/wms-types";

export default function WmsInventoryPage() {
  const [rows, setRows] = useState<WmsProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      setRows(await garageApi.get<WmsProductRow[]>("/api/wms/products"));
    } catch {
      /* abaikan */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await garageApi.get<WmsProductRow[]>("/api/wms/products");
        if (alive) setRows(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.category)))],
    [rows],
  );

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (cat !== "all" && r.category !== cat) return false;
    if (needle && !`${r.sku} ${r.name} ${r.category}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const selectedCount = Object.keys(selected).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Inventory</h1>
          <p className="text-[13px] text-[#6B7280]">{rows.length} produk · stok di gudang aktif.</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26]"
        >
          <Plus className="size-4" /> Tambah Produk
        </button>
      </div>

      {adding && <AddForm onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />}

      {/* Filter bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-[#E8E8E8] bg-white/95 p-2 backdrop-blur">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKU / nama…"
            className="h-9 w-full rounded-md border border-[#E8E8E8] bg-white pl-8 pr-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                cat === c
                  ? "border-[#C8102E] bg-[#FDF1F3] text-[#C8102E]"
                  : "border-[#E8E8E8] bg-white text-[#6B7280] hover:bg-[#F8F9FB]"
              }`}
            >
              {c === "all" ? "Semua kategori" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Nama</th>
              <th className="px-3 py-2.5">Kategori</th>
              <th className="px-3 py-2.5 text-right">Min</th>
              <th className="px-3 py-2.5">Stok / Status</th>
              <th className="px-3 py-2.5 text-right">HPP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[#6B7280]">Memuat…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[#6B7280]">
                  Tidak ada produk. Tambahkan produk untuk mulai.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const sc = WMS_STATUS_COLOR[r.status];
                const pct = r.minStock > 0 ? Math.min(100, Math.round((r.onHand / (r.minStock * 2)) * 100)) : 100;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[#F0F1F4] last:border-0"
                    style={{ background: r.status === "out" ? "#FEF4F4" : undefined }}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const n = { ...prev };
                            if (e.target.checked) n[r.id] = true;
                            else delete n[r.id];
                            return n;
                          })
                        }
                        className="size-4 accent-[#C8102E]"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] font-bold text-[#C8102E]">{r.sku}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#111111]">{r.name}</td>
                    <td className="px-3 py-2.5 text-[#6B7280]">{r.category}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.minStock}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#111111]">
                          {r.onHand} <span className="text-[11px] font-normal text-[#9CA3AF]">{r.unit}</span>
                        </span>
                        <span
                          className="rounded-full px-1.5 py-px text-[9.5px] font-bold"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          {sc.label}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-[#EEF0F3]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: sc.text }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#111111]">{currency.format(Math.round(r.hpp))}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-full bg-[#2F3136] px-4 py-2.5 text-[13px] text-white shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
          <span className="font-semibold">{selectedCount} item dipilih</span>
          <span className="h-4 w-px bg-white/20" />
          {["Print Labels", "Export", "Update Min Stok"].map((b) => (
            <button key={b} type="button" className="rounded-md px-2 py-1 text-white/70 hover:bg-white/10" title="Fase berikutnya">
              {b}
            </button>
          ))}
          <button type="button" onClick={() => setSelected({})} className="grid size-7 place-items-center rounded-full hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function AddForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ sku: "", name: "", category: "", unit: "gram", minStock: "", hpp: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!f.sku.trim() || !f.name.trim() || !f.category.trim() || busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/products", {
        sku: f.sku.trim(),
        name: f.name.trim(),
        category: f.category.trim(),
        unit: f.unit.trim() || "pcs",
        minStock: Number(f.minStock) || 0,
        hpp: Number(f.hpp) || 0,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan produk.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";

  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
      <p className="mb-3 text-[14px] font-bold text-[#111111]">Tambah Produk</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="SKU (mis. BEAN-ROB)" className={`${input} font-mono`} />
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nama produk" className={`${input} sm:col-span-2`} />
        <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Kategori (mis. Bahan Bar)" className={input} />
        <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="Satuan (gram/ml/pcs)" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input value={f.minStock} onChange={(e) => setF({ ...f, minStock: e.target.value })} inputMode="decimal" placeholder="Min stok" className={input} />
          <input value={f.hpp} onChange={(e) => setF({ ...f, hpp: e.target.value })} inputMode="decimal" placeholder="HPP/satuan" className={input} />
        </div>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB]">
          Batal
        </button>
        <button
          type="button"
          disabled={busy || !f.sku.trim() || !f.name.trim() || !f.category.trim()}
          onClick={() => void submit()}
          className="rounded-md bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26] disabled:opacity-50"
        >
          Simpan produk
        </button>
      </div>
    </div>
  );
}
