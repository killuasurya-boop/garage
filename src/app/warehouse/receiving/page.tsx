"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Trash2, Truck } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow } from "@/lib/wms-types";

type ReceivingRow = {
  id: string;
  doc: string;
  supplier: string;
  status: string;
  items: number;
  totalValue: number;
  createdAt: string;
};

type ItemDraft = {
  productId: string;
  orderedQty: string;
  receivedQty: string;
  hpp: string;
  qc: "pass" | "discrepancy" | "reject";
  batchNo: string;
  expiredAt: string;
};

const emptyItem = (): ItemDraft => ({
  productId: "",
  orderedQty: "",
  receivedQty: "",
  hpp: "",
  qc: "pass",
  batchNo: "",
  expiredAt: "",
});

export default function WmsReceivingPage() {
  const [list, setList] = useState<ReceivingRow[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [supplier, setSupplier] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  async function load() {
    const [recs, prods] = await Promise.all([
      garageApi.get<ReceivingRow[]>("/api/wms/receiving"),
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
          garageApi.get<ReceivingRow[]>("/api/wms/receiving"),
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

  const totalValue = items.reduce(
    (s, it) => s + (Number(it.receivedQty) || 0) * (Number(it.hpp) || 0),
    0,
  );
  const valid = items.some((it) => it.productId && Number(it.receivedQty) > 0);

  async function submit(complete: boolean) {
    if (!valid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        supplier: supplier.trim() || undefined,
        items: items
          .filter((it) => it.productId && Number(it.receivedQty) >= 0)
          .map((it) => ({
            productId: it.productId,
            orderedQty: Number(it.orderedQty) || 0,
            receivedQty: Number(it.receivedQty) || 0,
            hpp: Number(it.hpp) || 0,
            qc: it.qc,
            batchNo: it.batchNo.trim() || undefined,
            expiredAt: it.expiredAt || null,
          })),
      };
      const rec = await garageApi.post<{ id: string; doc: string }>("/api/wms/receiving", payload);
      if (complete) {
        await garageApi.post(`/api/wms/receiving/${rec.id}/complete`, {});
        setMsg(`Penerimaan ${rec.doc} selesai — stok & HPP diperbarui.`);
      } else {
        setMsg(`Draft ${rec.doc} disimpan.`);
      }
      setSupplier("");
      setItems([emptyItem()]);
      setCreating(false);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan penerimaan.");
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    setBusy(true);
    try {
      await garageApi.post(`/api/wms/receiving/${id}/complete`, {});
      await load();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "h-9 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Receiving</h1>
          <p className="text-[13px] text-[#6B7280]">Penerimaan barang dari supplier → stok + batch + HPP.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26]"
        >
          <Plus className="size-4" /> Penerimaan Baru
        </button>
      </div>

      {msg && <p className="text-[13px] font-semibold text-[#16A34A]">{msg}</p>}

      {creating && (
        <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
            {["Supplier", "Item & Qty", "QC", "Batch"].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-full bg-[#FDF1F3] text-[10px] text-[#C8102E]">
                  {i + 1}
                </span>
                {s}
                {i < 3 && <span className="text-[#D1D5DB]">→</span>}
              </span>
            ))}
          </div>

          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Nama supplier (opsional)"
            className={`${input} mb-3 w-full sm:w-80`}
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                  <th className="py-1.5 pr-2">Produk</th>
                  <th className="py-1.5 px-2 text-right">Dipesan</th>
                  <th className="py-1.5 px-2 text-right">Diterima</th>
                  <th className="py-1.5 px-2 text-right">HPP/unit</th>
                  <th className="py-1.5 px-2">QC</th>
                  <th className="py-1.5 px-2">Batch</th>
                  <th className="py-1.5 px-2">Expired</th>
                  <th className="py-1.5 pl-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-1 pr-2">
                      <select
                        value={it.productId}
                        onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}
                        className={`${input} w-44`}
                      >
                        <option value="">Pilih…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-2"><input value={it.orderedQty} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, orderedQty: e.target.value } : x)))} inputMode="decimal" className={`${input} w-20 text-right`} /></td>
                    <td className="py-1 px-2"><input value={it.receivedQty} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, receivedQty: e.target.value } : x)))} inputMode="decimal" className={`${input} w-20 text-right`} /></td>
                    <td className="py-1 px-2"><input value={it.hpp} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, hpp: e.target.value } : x)))} inputMode="decimal" className={`${input} w-24 text-right`} /></td>
                    <td className="py-1 px-2">
                      <select value={it.qc} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, qc: e.target.value as ItemDraft["qc"] } : x)))} className={`${input} w-32`}>
                        <option value="pass">PASS</option>
                        <option value="discrepancy">DISCREPANCY</option>
                        <option value="reject">REJECT</option>
                      </select>
                    </td>
                    <td className="py-1 px-2"><input value={it.batchNo} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, batchNo: e.target.value } : x)))} placeholder="auto" className={`${input} w-28`} /></td>
                    <td className="py-1 px-2"><input type="date" value={it.expiredAt} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, expiredAt: e.target.value } : x)))} className={`${input} w-36`} /></td>
                    <td className="py-1 pl-2">
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="grid size-8 place-items-center rounded-md text-[#DC2626] hover:bg-[#FEE2E2]">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={() => setItems((p) => [...p, emptyItem()])} className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-[#C8102E]">
            <Plus className="size-3.5" /> Tambah baris
          </button>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F1F4] pt-3">
            <span className="text-[13px] text-[#6B7280]">
              Total nilai diterima: <span className="font-mono font-bold text-[#111111]">{currency.format(Math.round(totalValue))}</span>
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => void submit(false)} disabled={!valid || busy} className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB] disabled:opacity-50">
                Simpan Draft
              </button>
              <button type="button" onClick={() => void submit(true)} disabled={!valid || busy} className="flex items-center gap-1.5 rounded-md bg-[#16A34A] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50">
                <Check className="size-4" /> Simpan &amp; Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
              <th className="px-3 py-2.5">Dokumen</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5 text-right">Item</th>
              <th className="px-3 py-2.5 text-right">Nilai</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#6B7280]">
                  <Truck className="mx-auto mb-2 size-6 text-[#D1D5DB]" />
                  Belum ada penerimaan. Klik &quot;Penerimaan Baru&quot;.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[12px] font-bold text-[#C8102E]">{r.doc}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{r.supplier || "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.items}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#111111]">{currency.format(r.totalValue)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.status !== "completed" && (
                      <button type="button" disabled={busy} onClick={() => void complete(r.id)} className="rounded-md bg-[#16A34A] px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50">
                        Selesaikan
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const done = status === "completed";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
      style={{
        background: done ? "#DCFCE7" : "#FEF3C7",
        color: done ? "#16A34A" : "#D97706",
      }}
    >
      {done ? "Selesai" : "Draft"}
    </span>
  );
}
