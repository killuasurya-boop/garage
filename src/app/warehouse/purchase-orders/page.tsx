"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Printer, Trash2, Truck } from "lucide-react";

import { WmsRoomReorderPanel } from "@/components/wms/wms-room-reorder-panel";
import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { printPurchaseOrder } from "@/lib/wms-print";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

type Supplier = { id: string; name: string; phone: string };
type PoRow = { id: string; doc: string; supplierName: string; status: string; expectedDate: string | null; items: number; total: number; createdAt: string };
type PoDetail = {
  id: string;
  doc: string;
  supplierName: string;
  supplierPhone: string;
  status: string;
  expectedDate: string | null;
  note: string;
  items: Array<{ id: string; productId: string | null; name: string | null; sku: string | null; unit: string | null; orderedQty: number; receivedQty: number; remainingQty: number; unitPrice: number }>;
  receivings: Array<{ id: string; doc: string; status: string }>;
};
type PriceRow = { productId: string; supplierId: string | null; supplier: string; lastPrice: number; avgPrice: number; receipts: number };
type Line = { productId: string; qty: string; price: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-[#F3F4F6] text-[#374151]" },
  sent: { label: "Terkirim", cls: "bg-[#DBEAFE] text-[#1E40AF]" },
  partial: { label: "Diterima sebagian", cls: "bg-[#FEF3C7] text-[#92400E]" },
  received: { label: "Diterima", cls: "bg-[#DCFCE7] text-[#166534]" },
  cancelled: { label: "Batal", cls: "bg-[#FEE2E2] text-[#991B1B]" },
};

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

export default function WmsPurchaseOrdersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [list, setList] = useState<PoRow[]>([]);
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", qty: "", price: "" }]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reload() {
    setList(await garageApi.get<PoRow[]>("/api/wms/purchase-orders"));
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([
      garageApi.get<Supplier[]>("/api/wms/suppliers"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
      garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
      garageApi.get<PoRow[]>("/api/wms/purchase-orders"),
    ])
      .then(([s, p, w, l]) => {
        if (!alive) return;
        setSuppliers(s);
        setProducts(p);
        setWarehouses(w);
        setList(l);
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

  function setLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.productId && !line.price) {
          const hint = priceHint(patch.productId);
          if (hint) next.price = String(hint.lastPrice);
        }
        return next;
      }),
    );
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

  async function create() {
    const items = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({ productId: l.productId, orderedQty: Number(l.qty), unitPrice: Number(l.price) || 0 }));
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
      setMsg({ ok: true, text: `${po.doc} dibuat.` });
      setLines([{ productId: "", qty: "", price: "" }]);
      setNote("");
      await reload();
      setDetail(await garageApi.get<PoDetail>(`/api/wms/purchase-orders/${po.id}`));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal membuat PO." });
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setDetail(await garageApi.get<PoDetail>(`/api/wms/purchase-orders/${id}`));
  }

  async function act(action: "send" | "cancel" | "receive") {
    if (!detail || busy) return;
    if (action === "cancel" && !window.confirm(`Batalkan ${detail.doc}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await garageApi.post<{ id?: string; doc?: string }>(`/api/wms/purchase-orders/${detail.id}/${action}`, {});
      if (action === "receive" && result.id) {
        // Lanjut langsung ke draft penerimaan: cek qty, isi expired, lalu Selesai.
        window.location.assign(`/warehouse/receiving?edit=${result.id}`);
        return;
      }
      await reload();
      await open(detail.id);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Aksi PO gagal." });
    } finally {
      setBusy(false);
    }
  }

  const input = "h-10 w-full rounded-md border border-[#dedfe4] bg-white px-2.5 text-[14px] text-[#17191d] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Purchase Order</h1>
        <p className="text-[13px] text-[#525866]">Pesan ke supplier → terima barang (sebagian / penuh) → stok & biaya belanja tercatat saat penerimaan selesai.</p>
      </div>
      {msg && <p className={`text-[13px] font-semibold ${msg.ok ? "text-[#15803D]" : "text-[#C8102E]"}`}>{msg.text}</p>}

      <WmsRoomReorderPanel onPurchaseOrdersCreated={() => void reload()} />

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
              Tanggal kirim
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={`${input} mt-1`} />
            </label>
          </div>
          {suppliers.length === 0 && <p className="mt-2 text-[12px] text-[#B45309]">Belum ada supplier — tambahkan di Master Data → Supplier.</p>}

          <div className="mt-3 space-y-2">
            {lines.map((line, i) => {
              const product = products.find((p) => p.id === line.productId);
              const hint = line.productId ? priceHint(line.productId) : undefined;
              return (
                <div key={i} className="grid grid-cols-[1fr_88px_110px_36px] items-end gap-2">
                  <label className="text-[12px] font-semibold text-[#525866]">
                    Bahan
                    <select value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className={`${input} mt-1`}>
                      <option value="">Pilih bahan…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} · stok {qtyFormat.format(p.onHand)} {p.unit}</option>)}
                    </select>
                    {hint && (
                      <span className="mt-0.5 block text-[11px] font-normal text-[#525866]">
                        Terakhir {currency.format(hint.lastPrice)}/{product?.unit} ({hint.supplier}) · rata-rata {currency.format(hint.avgPrice)}
                      </span>
                    )}
                  </label>
                  <label className="text-[12px] font-semibold text-[#525866]">
                    Qty {product ? `(${product.unit})` : ""}
                    <input value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="decimal" className={`${input} mt-1 text-right`} />
                  </label>
                  <label className="text-[12px] font-semibold text-[#525866]">
                    Harga/satuan
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
          <button type="button" onClick={() => setLines((c) => [...c, { productId: "", qty: "", price: "" }])} className="mt-2 text-[13px] font-semibold text-[#C8102E]">
            + Tambah bahan
          </button>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan untuk supplier (opsional)" className={`${input} mt-3`} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E8E8] pt-3">
            <span className="text-[13px] text-[#525866]">Perkiraan total <b className="text-[#111111]">{currency.format(Math.round(total))}</b></span>
            <button type="button" disabled={busy || !supplierId || !lines.some((l) => l.productId && Number(l.qty) > 0)} onClick={() => void create()} className="min-h-11 rounded-lg bg-[#C8102E] px-5 text-[14px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
              Simpan PO
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          {detail ? (
            <div>
              <button type="button" onClick={() => setDetail(null)} className="text-[12px] font-semibold text-[#C8102E]">← Daftar PO</button>
              <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-mono text-[18px] font-extrabold text-[#111111]">{detail.doc}</h2>
                  <p className="text-[13px] text-[#525866]">{detail.supplierName} · kirim {detail.expectedDate ?? "-"}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${STATUS[detail.status]?.cls ?? ""}`}>{STATUS[detail.status]?.label ?? detail.status}</span>
              </div>
              <div className="mt-3 max-h-72 overflow-auto">
                <table className="w-full min-w-[420px] text-[13px]">
                  <thead className="text-left text-[12px] text-[#525866]">
                    <tr><th className="py-1 pr-2 font-semibold">Bahan</th><th className="py-1 pr-2 text-right font-semibold">Pesan</th><th className="py-1 pr-2 text-right font-semibold">Diterima</th><th className="py-1 text-right font-semibold">Harga</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F1F4] text-[#17191d]">
                    {detail.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-1.5 pr-2">{it.name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{qtyFormat.format(it.orderedQty)} {it.unit}</td>
                        <td className={`py-1.5 pr-2 text-right tabular-nums ${it.remainingQty > 0 ? "text-[#B45309]" : "text-[#15803D]"}`}>{qtyFormat.format(it.receivedQty)}</td>
                        <td className="py-1.5 text-right tabular-nums">{currency.format(it.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.receivings.length > 0 && <p className="mt-2 text-[12px] text-[#525866]">Penerimaan: {detail.receivings.map((r) => `${r.doc} (${r.status})`).join(", ")}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => printPurchaseOrder(detail)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#E8E8E8] px-3 text-[13px] font-semibold text-[#111111]">
                  <Printer className="size-4" aria-hidden /> Cetak PO
                </button>
                {detail.status === "draft" && (
                  <button type="button" disabled={busy} onClick={() => void act("send")} className="min-h-10 rounded-lg border border-[#E8E8E8] px-3 text-[13px] font-semibold text-[#111111] disabled:opacity-50">Tandai terkirim</button>
                )}
                {!["received", "cancelled"].includes(detail.status) && (
                  <>
                    <button type="button" disabled={busy} onClick={() => void act("receive")} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-[#C8102E] px-3 text-[13px] font-bold text-white disabled:opacity-50">
                      <Truck className="size-4" aria-hidden /> Terima barang
                    </button>
                    <button type="button" disabled={busy} onClick={() => void act("cancel")} className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-[#C8102E] disabled:opacity-50">Batalkan</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-[14px] font-bold text-[#111111]">Daftar PO</h2>
              {list.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[#525866]">Belum ada PO.</p>
              ) : (
                <ul className="max-h-[520px] divide-y divide-[#F0F1F4] overflow-y-auto">
                  {list.map((po) => (
                    <li key={po.id}>
                      <button type="button" onClick={() => void open(po.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left hover:bg-[#F8F9FB]">
                        <span className="min-w-0">
                          <span className="block font-mono text-[13px] font-bold text-[#C8102E]">{po.doc}</span>
                          <span className="block text-[12px] text-[#525866]">{po.supplierName} · {po.items} bahan · {currency.format(po.total)}</span>
                        </span>
                        <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${STATUS[po.status]?.cls ?? ""}`}>{STATUS[po.status]?.label ?? po.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
