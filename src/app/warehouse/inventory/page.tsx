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

      {adding && <AddForm rows={rows} onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />}

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

// Kategori baku + prefix SKU (pengelompokan bahan). Prefix dipakai untuk SKU otomatis.
const CATEGORY_OPTIONS: Array<{ label: string; prefix: string; hint: string }> = [
  { label: "Bahan Bar", prefix: "BAR", hint: "kopi, susu, sirup, dll" },
  { label: "Bahan Dapur", prefix: "DPR", hint: "beras, ayam, minyak, dll" },
  { label: "Kemasan", prefix: "KMS", hint: "gelas, sedotan, kotak, dll" },
  { label: "Umum / Lainnya", prefix: "UMM", hint: "bahan umum" },
];
const UNIT_OPTIONS = ["gram", "kg", "ml", "liter", "pcs", "pack", "sachet", "botol"];
const CUSTOM = "__custom__";

/** SKU otomatis: prefix kategori + nomor urut tertinggi + 1 (mis. BAR-003). */
function nextSku(prefix: string, rows: WmsProductRow[]): string {
  if (!prefix) return "";
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const r of rows) {
    const m = r.sku.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function AddForm({ rows, onDone, onCancel }: { rows: WmsProductRow[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [categorySel, setCategorySel] = useState(CATEGORY_OPTIONS[0].label);
  const [customCategory, setCustomCategory] = useState("");
  const [unitSel, setUnitSel] = useState(UNIT_OPTIONS[0]);
  const [customUnit, setCustomUnit] = useState("");
  const [autoSku, setAutoSku] = useState(true);
  const [manualSku, setManualSku] = useState("");
  const [minStock, setMinStock] = useState("");
  const [hpp, setHpp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCustomCat = categorySel === CUSTOM;
  const category = (isCustomCat ? customCategory : categorySel).trim();
  const unit = (unitSel === CUSTOM ? customUnit : unitSel).trim();
  const prefix = isCustomCat
    ? customCategory.trim().slice(0, 3).toUpperCase() || "PRD"
    : CATEGORY_OPTIONS.find((c) => c.label === categorySel)?.prefix ?? "PRD";
  const autoSkuValue = useMemo(() => nextSku(prefix, rows), [prefix, rows]);
  const sku = (autoSku ? autoSkuValue : manualSku).trim();
  const catHint = CATEGORY_OPTIONS.find((c) => c.label === categorySel)?.hint;

  async function submit() {
    if (!sku || !name.trim() || !category || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await garageApi.post("/api/wms/products", {
        sku,
        name: name.trim(),
        category,
        unit: unit || "pcs",
        minStock: Number(minStock) || 0,
        hpp: Number(hpp) || 0,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan produk.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";
  const label = "mb-1 block text-[11px] font-semibold text-[#6B7280]";

  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
      <p className="mb-3 text-[14px] font-bold text-[#111111]">Tambah Produk</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Nama */}
        <div className="sm:col-span-2">
          <label className={label}>Nama produk</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kopi Robusta" className={`${input} w-full`} />
        </div>

        {/* Kategori */}
        <div>
          <label className={label}>Kategori {catHint && <span className="font-normal text-[#9CA3AF]">· {catHint}</span>}</label>
          <select value={categorySel} onChange={(e) => setCategorySel(e.target.value)} className={`${input} w-full`}>
            {CATEGORY_OPTIONS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
            <option value={CUSTOM}>+ Kategori lain…</option>
          </select>
          {isCustomCat && (
            <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Nama kategori baru" className={`${input} mt-2 w-full`} />
          )}
        </div>

        {/* Satuan */}
        <div>
          <label className={label}>Satuan</label>
          <select value={unitSel} onChange={(e) => setUnitSel(e.target.value)} className={`${input} w-full`}>
            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value={CUSTOM}>+ Satuan lain…</option>
          </select>
          {unitSel === CUSTOM && (
            <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="mis. lusin" className={`${input} mt-2 w-full`} />
          )}
        </div>

        {/* SKU otomatis */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className={label}>SKU</label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">
              <input type="checkbox" checked={autoSku} onChange={(e) => setAutoSku(e.target.checked)} className="size-3.5 accent-[#C8102E]" />
              Otomatis
            </label>
          </div>
          <input
            value={autoSku ? autoSkuValue : manualSku}
            onChange={(e) => setManualSku(e.target.value)}
            readOnly={autoSku}
            placeholder="mis. BAR-001"
            className={`${input} w-full font-mono ${autoSku ? "bg-[#F8F9FB] text-[#6B7280]" : ""}`}
          />
        </div>

        {/* Min & HPP */}
        <div>
          <label className={label}>Min stok</label>
          <input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="0" className={`${input} w-full`} />
        </div>
        <div>
          <label className={label}>HPP / satuan (Rp)</label>
          <input value={hpp} onChange={(e) => setHpp(e.target.value)} inputMode="decimal" placeholder="0" className={`${input} w-full`} />
        </div>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB]">
          Batal
        </button>
        <button
          type="button"
          disabled={busy || !sku || !name.trim() || !category}
          onClick={() => void submit()}
          className="rounded-md bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26] disabled:opacity-50"
        >
          Simpan produk
        </button>
      </div>
    </div>
  );
}
