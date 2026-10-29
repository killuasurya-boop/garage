"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, Receipt, Search, ShoppingCart, Trash2 } from "lucide-react";

import { WmsRoomReorderPanel } from "@/components/wms/wms-room-reorder-panel";
import { BillsPanel } from "@/components/wms/procurement/bills-panel";
import { PoDrawer } from "@/components/wms/procurement/po-drawer";
import { ProcurementDashboard, type ProcDashboard } from "@/components/wms/procurement/procurement-dashboard";
import { Skeleton, TonePill } from "@/components/wms/procurement/proc-ui";
import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { formatPacks, purchasePack } from "@/lib/stock-uom";
import { poStatusMeta } from "@/lib/wms-procurement-meta";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type Supplier = { id: string; name: string; phone: string };
type PoRow = { id: string; doc: string; supplierName: string; status: string; revision: number; expectedDate: string | null; items: number; total: number; createdAt: string };
type PriceRow = { productId: string; supplierId: string | null; supplier: string; lastPrice: number; avgPrice: number; receipts: number };
/** qty & harga per `uom` terpilih ("" = satuan dasar); dikonversi ke satuan dasar saat simpan. */
type Line = { productId: string; qty: string; price: string; uom: string };

/** Saringan daftar PO (kartu dashboard memakai kunci yang sama). */
const PO_FILTERS: Array<{ key: string; label: string; match: (status: string) => boolean }> = [
  { key: "active", label: "Aktif", match: (s) => !["received", "cancelled"].includes(s) },
  { key: "draft", label: "Draft", match: (s) => s === "draft" },
  { key: "pending_approval", label: "Persetujuan", match: (s) => s === "pending_approval" },
  { key: "ready", label: "Siap kirim", match: (s) => s === "approved" || s === "wa_opened" },
  { key: "sent", label: "Menunggu supplier", match: (s) => s === "sent" },
  { key: "delivery", label: "Dikirim supplier", match: (s) => s === "confirmed" || s === "processing" },
  { key: "partial", label: "Sebagian", match: (s) => s === "partial" },
  { key: "all", label: "Semua", match: () => true },
];

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

export default function WmsPurchaseOrdersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [list, setList] = useState<PoRow[] | null>(null);
  const [openPoId, setOpenPoId] = useState<string | null>(null);
  const [dash, setDash] = useState<ProcDashboard | null>(null);
  const [tab, setTab] = useState<"po" | "bills">("po");
  const [poFilter, setPoFilter] = useState("active");
  const [billFilter, setBillFilter] = useState<"open" | "verify" | "all">("open");
  const [q, setQ] = useState("");
  const [me, setMe] = useState<{ role: string; userId: string }>({ role: "", userId: "" });
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", qty: "", price: "", uom: "" }]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => {
    const [l, d] = await Promise.all([garageApi.get<PoRow[]>("/api/wms/purchase-orders"), garageApi.get<ProcDashboard>("/api/wms/procurement/dashboard")]);
    setList(l);
    setDash(d);
  }, []);
  const refreshDash = useCallback(() => {
    void garageApi.get<ProcDashboard>("/api/wms/procurement/dashboard").then(setDash).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      garageApi.get<Supplier[]>("/api/wms/suppliers"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
      garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
      garageApi.get<PoRow[]>("/api/wms/purchase-orders"),
      garageApi.get<ProcDashboard>("/api/wms/procurement/dashboard"),
      garageApi.get<{ user: { id: string }; role: string }>("/api/me"),
    ])
      .then(([s, p, w, l, d, m]) => {
        if (!alive) return;
        setSuppliers(s);
        setProducts(p);
        setWarehouses(w);
        setList(l);
        setDash(d);
        setMe({ role: m.role, userId: m.user.id });
      })
      .catch(() => {
        if (alive) setMsg({ ok: false, text: "Gagal memuat data pembelian (khusus Owner/Manajer)." });
      });
    return () => {
      alive = false;
    };
  }, []);

  const chosenIds = useMemo(() => lines.map((l) => l.productId).filter(Boolean), [lines]);
  const chosenKey = chosenIds.join(",");
  useEffect(() => {
    if (!chosenKey) return;
    let alive = true;
    void garageApi
      .get<PriceRow[]>(`/api/wms/purchase-orders/price-history?productIds=${chosenKey}`)
      .then((rows) => { if (alive) setPrices(rows); })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [chosenKey]);

  function priceHint(productId: string) {
    const rows = prices.filter((p) => p.productId === productId);
    const own = rows.find((p) => p.supplierId === supplierId) ?? rows[0];
    return own;
  }

  const factorOf = (line: Line) => {
    const product = products.find((p) => p.id === line.productId);
    return product?.uoms?.find((u) => u.uom === line.uom)?.factor ?? 1;
  };

  function setLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.productId) {
          // Default beli per kemasan beli (kotak/dus); harga terakhir dikonversi ke kemasan itu.
          const product = products.find((p) => p.id === patch.productId);
          next.uom = purchasePack(product?.uoms)?.uom ?? "";
          const hint = priceHint(patch.productId);
          if (hint && !line.price) next.price = String(Math.round(hint.lastPrice * factorOf(next) * 100) / 100);
        }
        if (patch.uom !== undefined && patch.uom !== line.uom && line.price) {
          const perBase = num(line.price) / factorOf(line);
          next.price = String(Math.round(perBase * factorOf(next) * 100) / 100);
        }
        return next;
      }),
    );
  }

  const num = (raw: string) => Number(raw.replace(",", ".")) || 0;
  const total = lines.reduce((sum, l) => sum + num(l.qty) * num(l.price), 0);

  async function create() {
    const items = lines
      .filter((l) => l.productId && num(l.qty) > 0)
      .map((l) => {
        const factor = factorOf(l);
        return {
          productId: l.productId,
          orderedQty: Math.round(num(l.qty) * factor * 10_000) / 10_000,
          unitPrice: Math.round((num(l.price) / factor) * 10_000) / 10_000,
          uom: factor > 1 ? l.uom : null,
          uomFactor: factor > 1 ? factor : null,
        };
      });
    if (!supplierId || !items.length || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const po = await garageApi.post<{ id: string; doc: string }>("/api/wms/purchase-orders", {
        supplierId,
        warehouseId: warehouseId || null,
        expectedDate: expectedDate || null,
        note: note.trim() || undefined,
        items,
      });
      setMsg({ ok: true, text: `${po.doc} dibuat sebagai draft — ajukan persetujuan sebelum dikirim.` });
      setLines([{ productId: "", qty: "", price: "", uom: "" }]);
      setNote("");
      await reload();
      setOpenPoId(po.id);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal membuat PO." });
    } finally {
      setBusy(false);
    }
  }

  const filteredList = useMemo(() => {
    const f = PO_FILTERS.find((x) => x.key === poFilter) ?? PO_FILTERS[0];
    const needle = q.trim().toLowerCase();
    return (list ?? []).filter((po) => f.match(po.status) && (!needle || `${po.doc} ${po.supplierName}`.toLowerCase().includes(needle)));
  }, [list, poFilter, q]);

  const input = "h-10 w-full rounded-md border border-[#dedfe4] bg-white px-2.5 text-[14px] text-[#17191d] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Pengadaan & Purchase Order</h1>
        <p className="text-[13px] text-[#525866]">Bar/Dapur minta → Gudang penuhi → kekurangan jadi PO → disetujui → PDF & WhatsApp ke supplier → terima barang → bayar tagihan.</p>
      </div>
      {msg && <p role="status" className={`text-[13px] font-semibold ${msg.ok ? "text-[#15803D]" : "text-[#C8102E]"}`}>{msg.text}</p>}

      <ProcurementDashboard
        data={dash}
        onFilter={(t) => {
          setTab(t.tab);
          if (t.tab === "po" && t.filter) setPoFilter(t.filter);
          if (t.tab === "po" && !t.filter) document.getElementById("kekurangan")?.scrollIntoView({ behavior: "smooth", block: "start" });
          if (t.tab === "bills") setBillFilter(t.filter === "verify" ? "verify" : "open");
        }}
      />

      <div className="flex gap-1 rounded-xl border border-[#E8E8E8] bg-white p-1" role="tablist" aria-label="Bagian pengadaan">
        {([
          ["po", "Purchase Order", ShoppingCart],
          ["bills", "Tagihan & Pembayaran", Receipt],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none sm:flex-none ${tab === key ? "bg-[#C8102E] text-white" : "text-[#4B5563] hover:text-[#111111]"}`}
          >
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {tab === "bills" && <BillsPanel key={billFilter} filter={billFilter} role={me.role} userId={me.userId} onChanged={refreshDash} />}

      <div className={tab === "po" ? "space-y-5" : "hidden"}>
        <div id="kekurangan" className="scroll-mt-4">
          <WmsRoomReorderPanel onPurchaseOrdersCreated={() => void reload()} />
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr]">
          <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#111111]">
              <FilePlus2 className="size-4 text-[#C8102E]" aria-hidden /> PO baru
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-[12px] font-semibold text-[#525866] sm:col-span-1">
                Supplier
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${input} mt-1`}>
                  <option value="">Pilih supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-[12px] font-semibold text-[#525866]">
                Kirim ke
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={`${input} mt-1`}>
                  <option value="">Gudang utama (otomatis per area)</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="text-[12px] font-semibold text-[#525866]">
                Tanggal dibutuhkan
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={`${input} mt-1`} />
              </label>
            </div>
            {suppliers.length === 0 && <p className="mt-2 text-[12px] text-[#B45309]">Belum ada supplier — tambahkan di Master Data → Supplier.</p>}

            <div className="mt-3 space-y-2">
              {lines.map((line, i) => {
                const product = products.find((p) => p.id === line.productId);
                const hint = line.productId ? priceHint(line.productId) : undefined;
                return (
                  <div key={i} className="grid grid-cols-[1fr_88px_36px] items-end gap-2 sm:grid-cols-[1fr_88px_96px_110px_36px]">
                    <label className="text-[12px] font-semibold text-[#525866]">
                      Bahan
                      <select value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className={`${input} mt-1`}>
                        <option value="">Pilih bahan…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} · stok {formatPacks(p.onHand, p.unit, p.uoms)}</option>)}
                      </select>
                      {hint && (
                        <span className="mt-0.5 block text-[11px] font-normal text-[#525866]">
                          Terakhir {currency.format(hint.lastPrice * factorOf(line))}/{line.uom || product?.unit} ({hint.supplier}) · rata-rata {currency.format(hint.avgPrice * factorOf(line))}
                        </span>
                      )}
                    </label>
                    <label className="text-[12px] font-semibold text-[#525866]">
                      Jumlah
                      <input value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="decimal" className={`${input} mt-1 text-right`} />
                    </label>
                    <label className="order-last col-span-2 text-[12px] font-semibold text-[#525866] sm:order-none sm:col-span-1">
                      Satuan beli
                      <select value={line.uom} onChange={(e) => setLine(i, { uom: e.target.value })} disabled={!product} className={`${input} mt-1`}>
                        <option value="">{product?.unit ?? "satuan"}</option>
                        {(product?.uoms ?? []).map((u) => (
                          <option key={u.uom} value={u.uom}>{u.uom} ({qtyFormat.format(u.factor)} {product?.unit})</option>
                        ))}
                      </select>
                    </label>
                    <label className="order-last col-span-1 text-[12px] font-semibold text-[#525866] sm:order-none">
                      Harga/{line.uom || product?.unit || "satuan"}
                      <input value={line.price} onChange={(e) => setLine(i, { price: e.target.value })} inputMode="decimal" className={`${input} mt-1 text-right`} />
                    </label>
                    <button
                      type="button"
                      aria-label="Hapus baris"
                      onClick={() => setLines((c) => (c.length > 1 ? c.filter((_, x) => x !== i) : c))}
                      className="grid size-10 place-items-center rounded-md text-[#525866] hover:bg-[#FDF1F3] hover:text-[#C8102E]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setLines((c) => [...c, { productId: "", qty: "", price: "", uom: "" }])} className="mt-2 text-[13px] font-semibold text-[#C8102E]">
              + Tambah bahan
            </button>
            <input aria-label="Catatan untuk supplier" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan untuk supplier (opsional)" className={`${input} mt-3`} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E8E8] pt-3">
              <span className="text-[13px] text-[#525866]">Perkiraan total <b className="text-[#111111]">{currency.format(Math.round(total))}</b></span>
              <button type="button" disabled={busy || !supplierId || !lines.some((l) => l.productId && Number(l.qty) > 0)} onClick={() => void create()} className="min-h-11 rounded-lg bg-[#C8102E] px-5 text-[14px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
                {busy ? "Menyimpan…" : "Simpan PO (draft)"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-bold text-[#111111]">Daftar PO</h2>
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" aria-hidden="true" />
                <input type="search" aria-label="Cari PO" value={q} onChange={(e) => setQ(e.target.value)} placeholder="No. PO / supplier" className={`${input} pl-8`} />
              </div>
            </div>
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Saring status PO">
              {PO_FILTERS.map((f) => {
                const count = (list ?? []).filter((po) => f.match(po.status)).length;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={poFilter === f.key}
                    onClick={() => setPoFilter(f.key)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold ${poFilter === f.key ? "border-[#111111] bg-[#111111] text-white" : "border-[#D9DCE1] bg-white text-[#374151] hover:bg-[#F8F9FB]"}`}
                  >
                    {f.label} <span className="tabular-nums opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>
            {!list ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredList.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#525866]">Tidak ada PO di saringan ini.</p>
            ) : (
              <ul className="max-h-[560px] divide-y divide-[#F0F1F4] overflow-y-auto">
                {filteredList.map((po) => {
                  const m = poStatusMeta(po.status);
                  return (
                    <li key={po.id}>
                      <button type="button" onClick={() => setOpenPoId(po.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-left hover:bg-[#F8F9FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8102E]/30">
                        <span className="min-w-0">
                          <span className="block font-mono text-[13px] font-bold text-[#C8102E]">
                            {po.doc}
                            {po.revision > 0 && <span className="ml-1 font-sans text-[11px] text-[#92400E]">R{po.revision}</span>}
                          </span>
                          <span className="block text-[12px] text-[#525866]">{po.supplierName} · {po.items} bahan · {currency.format(po.total)}</span>
                        </span>
                        <TonePill tone={m.tone}>{m.label}</TonePill>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {openPoId && <PoDrawer key={openPoId} poId={openPoId} onClose={() => setOpenPoId(null)} onChanged={() => void reload()} />}
    </div>
  );
}
