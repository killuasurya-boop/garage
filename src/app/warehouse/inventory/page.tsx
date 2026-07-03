"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  Archive,
  FileDown,
  FileUp,
  ImageOff,
  PackagePlus,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { WMS_STATUS_COLOR, type WmsProductRow } from "@/lib/wms-types";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
}

/** Cetak label QR (encode SKU) untuk produk terpilih — client-side, lalu window.print(). */
async function printQrLabels(items: WmsProductRow[]) {
  const cards = await Promise.all(
    items.map(async (p) => {
      const qr = await QRCode.toDataURL(p.sku, { margin: 1, width: 220 });
      return `<div class="lbl"><img src="${qr}" alt="${p.sku}"/><div class="nm">${p.name}</div><div class="sku">${p.sku}</div></div>`;
    }),
  );
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Label Produk</title><style>
    *{font-family:Inter,system-ui,sans-serif;box-sizing:border-box}
    body{margin:0;padding:12px}
    .grid{display:flex;flex-wrap:wrap;gap:10px}
    .lbl{width:180px;border:1px solid #ccc;border-radius:8px;padding:8px;text-align:center;page-break-inside:avoid}
    .lbl img{width:120px;height:120px}
    .nm{font-size:12px;font-weight:700;margin-top:4px;line-height:1.2}
    .sku{font-family:monospace;font-size:12px;color:#C8102E;font-weight:700}
    @media print{.noprint{display:none}}
  </style></head><body>
    <button class="noprint" onclick="window.print()" style="margin-bottom:10px;padding:8px 14px;background:#C8102E;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">Cetak</button>
    <div class="grid">${cards.join("")}</div>
  </body></html>`);
  win.document.close();
}

export default function WmsInventoryPage() {
  const [rows, setRows] = useState<WmsProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WmsProductRow | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleArchive(ids: string[]) {
    if (ids.length === 0 || busyAction) return;
    const withStock = ids.map((id) => rows.find((r) => r.id === id)).filter((r) => r && r.onHand > 0);
    const names = ids.length === 1 ? rows.find((r) => r.id === ids[0])?.name ?? "produk ini" : `${ids.length} produk`;
    let msg = `Arsipkan ${names}? Produk hilang dari daftar, tapi riwayat laporan tetap tersimpan.`;
    if (withStock.length > 0) {
      msg = `⚠️ ${withStock.length} produk MASIH ADA STOK (${withStock.map((r) => r!.name).slice(0, 3).join(", ")}${withStock.length > 3 ? ", …" : ""}). ` + msg;
    }
    if (!window.confirm(msg)) return;
    setBusyAction(true);
    try {
      await Promise.all(ids.map((id) => garageApi.delete(`/api/wms/products/${id}`)));
      setSelected({});
      await load();
    } catch {
      window.alert("Sebagian gagal diarsipkan. Coba lagi.");
    } finally {
      setBusyAction(false);
    }
  }

  async function handleRestore(ids: string[]) {
    if (ids.length === 0 || busyAction) return;
    setBusyAction(true);
    try {
      await Promise.all(ids.map((id) => garageApi.patch(`/api/wms/products/${id}`, { restore: true })));
      setSelected({});
      await load();
    } finally {
      setBusyAction(false);
    }
  }

  async function handleBulkMinStock(ids: string[]) {
    if (ids.length === 0 || busyAction) return;
    const val = window.prompt(`Set Min Stok untuk ${ids.length} produk ke:`, "");
    if (val === null) return;
    const minStock = Number(val);
    if (!Number.isFinite(minStock) || minStock < 0) {
      window.alert("Nilai tidak valid.");
      return;
    }
    setBusyAction(true);
    try {
      await Promise.all(
        ids.map((id) => garageApi.patch(`/api/wms/products/${id}`, { minStock })),
      );
      setSelected({});
      await load();
    } finally {
      setBusyAction(false);
    }
  }

  async function load() {
    try {
      const url = showArchived ? "/api/wms/products?archived=1" : "/api/wms/products";
      setRows(await garageApi.get<WmsProductRow[]>(url));
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
        const url = showArchived ? "/api/wms/products?archived=1" : "/api/wms/products";
        const data = await garageApi.get<WmsProductRow[]>(url);
        if (alive) setRows(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [showArchived]);

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
          <p className="text-[13px] text-[#6B7280]">
            {rows.length} produk {showArchived ? "terarsip" : "· stok di gudang aktif."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
              showArchived ? "border-[#C8102E] bg-[#FDF1F3] text-[#C8102E]" : "border-[#E8E8E8] bg-white text-[#6B7280] hover:bg-[#F8F9FB]"
            }`}
          >
            <Archive className="size-4" /> {showArchived ? "Lihat Aktif" : "Terarsip"}
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/wms/products/export"
            className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"
          >
            <FileDown className="size-4 text-[#16A34A]" /> Export
          </a>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"
          >
            <FileUp className="size-4 text-[#2563EB]" /> Import
          </button>
          {!showArchived && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26]"
            >
              <Plus className="size-4" /> Tambah Produk
            </button>
          )}
        </div>
      </div>

      {adding && <AddForm rows={rows} onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />}
      {editing && (
        <EditForm
          product={editing}
          onDone={() => { setEditing(null); void load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
      {importing && <ImportModal onDone={() => { setImporting(false); void load(); }} onCancel={() => setImporting(false)} />}

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
              <th className="w-12 px-3 py-2.5">Foto</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Nama</th>
              <th className="px-3 py-2.5">Kategori</th>
              <th className="px-3 py-2.5 text-right">Min</th>
              <th className="px-3 py-2.5">Stok / Status</th>
              <th className="px-3 py-2.5 text-right">HPP</th>
              <th className="px-3 py-2.5">Ditambahkan</th>
              <th className="w-20 px-3 py-2.5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[#6B7280]">Memuat…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[#6B7280]">
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
                    <td className="px-3 py-2.5">
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageUrl} alt={r.name} className="size-9 rounded-md border border-[#E8E8E8] object-cover" />
                      ) : (
                        <span className="grid size-9 place-items-center rounded-md border border-dashed border-[#E8E8E8] text-[#C7CBD1]">
                          <ImageOff className="size-4" />
                        </span>
                      )}
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
                    <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-[#6B7280]">{fmtDate(r.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {showArchived ? (
                          <button
                            type="button"
                            onClick={() => void handleRestore([r.id])}
                            disabled={busyAction}
                            className="flex items-center gap-1 rounded-md border border-[#E8E8E8] px-2 py-1 text-[11px] font-semibold text-[#16A34A] hover:bg-[#F0FDF4] disabled:opacity-50"
                            title="Pulihkan produk"
                          >
                            <RotateCcw className="size-3.5" /> Pulihkan
                          </button>
                        ) : (
                          <>
                            <Link
                              href={`/warehouse/receiving?product=${r.id}`}
                              className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F0FDF4] hover:text-[#16A34A]"
                              title="Isi stok (Receiving)"
                            >
                              <PackagePlus className="size-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setEditing(r)}
                              className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB] hover:text-[#111111]"
                              title="Edit produk"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleArchive([r.id])}
                              disabled={busyAction}
                              className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#FDF1F3] hover:text-[#C8102E] disabled:opacity-50"
                              title="Hapus (arsipkan) produk"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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
          {showArchived ? (
            <button
              type="button"
              onClick={() => void handleRestore(Object.keys(selected))}
              disabled={busyAction}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[#9ff0c0] hover:bg-white/10 disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" /> Pulihkan
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void printQrLabels(rows.filter((r) => selected[r.id]))}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-white/80 hover:bg-white/10"
              >
                <QrCode className="size-3.5" /> Print Labels
              </button>
              <button
                type="button"
                onClick={() => void handleBulkMinStock(Object.keys(selected))}
                disabled={busyAction}
                className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                Update Min Stok
              </button>
              <button
                type="button"
                onClick={() => void handleArchive(Object.keys(selected))}
                disabled={busyAction}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[#ffb3bc] hover:bg-white/10 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> Arsipkan
              </button>
            </>
          )}
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
  const [barcode, setBarcode] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

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
      const created = await garageApi.post<{ id: string }>("/api/wms/products", {
        sku,
        name: name.trim(),
        category,
        unit: unit || "pcs",
        minStock: Number(minStock) || 0,
        hpp: Number(hpp) || 0,
        barcode: barcode.trim() || null,
      });
      // Upload foto (bila dipilih) setelah produk dibuat — butuh id produk.
      if (photo && created?.id) {
        const fd = new FormData();
        fd.append("image", photo);
        await fetch(`/api/wms/products/${created.id}/image`, { method: "POST", body: fd });
      }
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

        {/* Barcode kemasan (opsional) */}
        <div>
          <label className={label}>Barcode kemasan <span className="font-normal text-[#9CA3AF]">· opsional</span></label>
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan/ketik barcode supplier" className={`${input} w-full font-mono`} />
        </div>

        {/* Foto */}
        <div>
          <label className={label}>Foto <span className="font-normal text-[#9CA3AF]">· opsional</span></label>
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => photoRef.current?.click()} className="flex h-9 w-full items-center gap-1.5 rounded-md border border-[#E8E8E8] px-3 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]">
            <Upload className="size-3.5 text-[#C8102E]" /> {photo ? photo.name.slice(0, 22) : "Pilih / foto kamera"}
          </button>
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

function EditForm({ product, onDone, onCancel }: { product: WmsProductRow; onDone: () => void; onCancel: () => void }) {
  const knownCat = CATEGORY_OPTIONS.some((c) => c.label === product.category);
  const knownUnit = UNIT_OPTIONS.includes(product.unit);
  const [name, setName] = useState(product.name);
  const [categorySel, setCategorySel] = useState(knownCat ? product.category : CUSTOM);
  const [customCategory, setCustomCategory] = useState(knownCat ? "" : product.category);
  const [unitSel, setUnitSel] = useState(knownUnit ? product.unit : CUSTOM);
  const [customUnit, setCustomUnit] = useState(knownUnit ? "" : product.unit);
  const [minStock, setMinStock] = useState(String(product.minStock));
  const [hpp, setHpp] = useState(String(product.hpp));
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(product.imageUrl);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const category = (categorySel === CUSTOM ? customCategory : categorySel).trim();
  const unit = (unitSel === CUSTOM ? customUnit : unitSel).trim();

  // Generate QR (encode SKU) untuk ditampilkan & dicetak.
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(product.sku, { margin: 1, width: 180 }).then((d) => { if (alive) setQrDataUrl(d); });
    return () => { alive = false; };
  }, [product.sku]);

  async function uploadImage(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`/api/wms/products/${product.id}/image`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal upload foto.");
      setImageUrl(json.data.imageUrl as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal upload foto.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!name.trim() || !category || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await garageApi.patch(`/api/wms/products/${product.id}`, {
        name: name.trim(),
        category,
        unit: unit || "pcs",
        minStock: Number(minStock) || 0,
        hpp: Number(hpp) || 0,
        barcode: barcode.trim() || null,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";
  const label = "mb-1 block text-[11px] font-semibold text-[#6B7280]";

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-xl border border-[#E8E8E8] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] font-bold text-[#111111]">Edit Produk · <span className="font-mono text-[#C8102E]">{product.sku}</span></p>
          <button type="button" onClick={onCancel} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
        </div>

        {/* Foto + QR */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={name} className="size-16 rounded-lg border border-[#E8E8E8] object-cover" />
            ) : (
              <span className="grid size-16 place-items-center rounded-lg border border-dashed border-[#E8E8E8] text-[#C7CBD1]"><ImageOff className="size-6" /></span>
            )}
            <div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); }} />
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md border border-[#E8E8E8] px-3 py-1.5 text-[12px] font-semibold text-[#111111] hover:bg-[#F8F9FB] disabled:opacity-50">
                <Upload className="size-3.5 text-[#C8102E]" /> {uploading ? "Mengunggah…" : imageUrl ? "Ganti foto" : "Unggah foto"}
              </button>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">JPG/PNG/WebP, maks 8 MB.</p>
            </div>
          </div>
          {/* QR label (encode SKU) */}
          <div className="text-center">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt={`QR ${product.sku}`} className="size-16 rounded-md border border-[#E8E8E8]" />
            ) : (
              <span className="grid size-16 place-items-center rounded-md border border-[#E8E8E8] text-[#C7CBD1]"><QrCode className="size-6" /></span>
            )}
            <button type="button" onClick={() => void printQrLabels([product])} className="mt-1 text-[11px] font-semibold text-[#2563EB] hover:underline">Cetak label</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Nama produk</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full`} />
          </div>
          <div>
            <label className={label}>Kategori</label>
            <select value={categorySel} onChange={(e) => setCategorySel(e.target.value)} className={`${input} w-full`}>
              {CATEGORY_OPTIONS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
              <option value={CUSTOM}>+ Kategori lain…</option>
            </select>
            {categorySel === CUSTOM && <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Nama kategori" className={`${input} mt-2 w-full`} />}
          </div>
          <div>
            <label className={label}>Satuan</label>
            <select value={unitSel} onChange={(e) => setUnitSel(e.target.value)} className={`${input} w-full`}>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              <option value={CUSTOM}>+ Satuan lain…</option>
            </select>
            {unitSel === CUSTOM && <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="mis. lusin" className={`${input} mt-2 w-full`} />}
          </div>
          <div>
            <label className={label}>Min stok</label>
            <input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" className={`${input} w-full`} />
          </div>
          <div>
            <label className={label}>HPP / satuan (Rp)</label>
            <input value={hpp} onChange={(e) => setHpp(e.target.value)} inputMode="decimal" className={`${input} w-full`} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Barcode kemasan <span className="font-normal text-[#9CA3AF]">· opsional (EAN/UPC supplier)</span></label>
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan/ketik barcode fisik" className={`${input} w-full font-mono`} />
          </div>
        </div>
        {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB]">Batal</button>
          <button type="button" disabled={busy || !name.trim() || !category} onClick={() => void save()} className="rounded-md bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26] disabled:opacity-50">Simpan perubahan</button>
        </div>
      </div>
    </div>
  );
}

type ImportPreview = { created: number; updated: number; skipped: number; errors: Array<{ row: number; message: string }>; dryRun: boolean };

function ImportModal({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dryRun", dryRun ? "true" : "false");
      const res = await fetch("/api/wms/products/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal import.");
      if (dryRun) setPreview(json.data as ImportPreview);
      else onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl border border-[#E8E8E8] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] font-bold text-[#111111]">Import Produk (Excel)</p>
          <button type="button" onClick={onCancel} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#F8F9FB]"><X className="size-4" /></button>
        </div>

        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/wms/products/export?template=1" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#2563EB] hover:underline">
          <FileDown className="size-3.5" /> Unduh template Excel
        </a>

        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-[#C8102E]/40 bg-[#FDF1F3] px-3 py-3 text-[13px] font-semibold text-[#111111] hover:bg-[#FCE7EB]">
          <Upload className="size-4 text-[#C8102E]" /> {file ? file.name : "Pilih file .xlsx"}
        </button>

        {file && !preview && (
          <button type="button" disabled={busy} onClick={() => void run(true)} className="mt-3 w-full rounded-md bg-[#2F3136] py-2 text-[13px] font-bold text-white hover:bg-black disabled:opacity-50">
            {busy ? "Memeriksa…" : "Pratinjau (cek dulu)"}
          </button>
        )}

        {preview && (
          <div className="mt-3 rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-3 text-[12.5px]">
            <p className="font-bold text-[#111111]">Pratinjau:</p>
            <ul className="mt-1 space-y-0.5 text-[#374151]">
              <li>🆕 Dibuat baru: <b>{preview.created}</b></li>
              <li>♻️ Diupdate (SKU sama): <b>{preview.updated}</b></li>
              <li>⏭️ Dilewati: <b>{preview.skipped}</b></li>
            </ul>
            {preview.errors.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto text-[11.5px] text-[#DC2626]">
                {preview.errors.slice(0, 20).map((e, i) => <p key={i}>Baris {e.row}: {e.message}</p>)}
              </div>
            )}
            <button type="button" disabled={busy || preview.created + preview.updated === 0} onClick={() => void run(false)} className="mt-3 w-full rounded-md bg-[#C8102E] py-2 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
              {busy ? "Menyimpan…" : `Konfirmasi Import (${preview.created + preview.updated})`}
            </button>
          </div>
        )}

        {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
        <p className="mt-3 text-[11px] text-[#9CA3AF]">Cocok berdasarkan SKU. Kolom Stok diabaikan — ubah stok lewat Receiving/Adjustment.</p>
      </div>
    </div>
  );
}
