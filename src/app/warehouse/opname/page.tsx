"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Printer } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { printWmsDoc, escapeHtml } from "@/lib/wms-print";
import type { WmsWarehouse } from "@/lib/wms-types";

type OpnameRow = { id: string; doc: string; status: string; warehouse: string; lines: number; createdAt: string };
type OpnameLine = { id: string; productName: string; unit: string; systemQty: number; physicalQty: number; variance: number };
type OpnameDetail = { id: string; doc: string; status: string; lines: OpnameLine[] };

export default function WmsOpnamePage() {
  const [list, setList] = useState<OpnameRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [active, setActive] = useState<OpnameDetail | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadList() {
    setList(await garageApi.get<OpnameRow[]>("/api/wms/opname"));
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [ops, whs] = await Promise.all([
          garageApi.get<OpnameRow[]>("/api/wms/opname"),
          garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
        ]);
        if (alive) {
          setList(ops);
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

  async function start(warehouseId: string) {
    setBusy(true);
    try {
      const op = await garageApi.post<{ id: string }>("/api/wms/opname", { warehouseId });
      setActive(await garageApi.get<OpnameDetail>(`/api/wms/opname/${op.id}`));
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setActive(await garageApi.get<OpnameDetail>(`/api/wms/opname/${id}`));
  }

  async function saveLine(lineId: string, physicalQty: number) {
    if (!active) return;
    await garageApi.patch(`/api/wms/opname/${active.id}`, { lineId, physicalQty });
    setActive((a) => a && { ...a, lines: a.lines.map((l) => (l.id === lineId ? { ...l, physicalQty, variance: physicalQty - l.systemQty } : l)) });
  }

  async function finalize() {
    if (!active || busy) return;
    setBusy(true);
    try {
      await garageApi.post(`/api/wms/opname/${active.id}/finalize`, {});
      setActive(null);
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    const totalVar = active.lines.filter((l) => l.variance !== 0).length;
    const printSheet = () => {
      const rows = active.lines
        .map((l) => `<tr><td>${escapeHtml(l.productName)}</td><td class="c">${escapeHtml(l.unit)}</td><td class="r">${l.systemQty}</td><td style="width:90px"></td><td style="width:90px"></td></tr>`)
        .join("");
      printWmsDoc(
        `Lembar Opname · ${active.doc}`,
        `<table><thead><tr><th>Produk</th><th class="c">Satuan</th><th class="r">Stok Sistem</th><th class="c">Hitung Fisik</th><th class="c">Selisih</th></tr></thead><tbody>${rows}</tbody></table>
         <div class="sign"><div><div class="line">Penghitung</div></div><div><div class="line">Diperiksa Manajer</div></div></div>`,
        `${active.doc} · untuk hitung fisik manual`,
      );
    };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => setActive(null)} className="text-[12px] font-semibold text-[#C8102E]">← Kembali</button>
            <h1 className="font-mono text-[20px] font-extrabold text-[#111111]">{active.doc}</h1>
            <p className="text-[13px] text-[#6B7280]">{totalVar} item ada selisih · {active.status}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={printSheet} className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]">
              <Printer className="size-4 text-[#2563EB]" /> Cetak Lembar
            </button>
            {active.status !== "completed" && (
              <button type="button" disabled={busy} onClick={() => void finalize()} className="rounded-lg bg-[#16A34A] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50">
                Finalisasi &amp; Reconcile Stok
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                <th className="px-3 py-2.5">Produk</th>
                <th className="px-3 py-2.5 text-right">Sistem</th>
                <th className="px-3 py-2.5 text-right">Fisik</th>
                <th className="px-3 py-2.5 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {active.lines.map((l) => {
                const big = Math.abs(l.variance) > l.systemQty * 0.1 && l.systemQty > 0;
                return (
                  <tr key={l.id} className="border-b border-[#F0F1F4] last:border-0" style={{ background: big ? "#FEF4F4" : undefined }}>
                    <td className="px-3 py-2 font-semibold text-[#111111]">{l.productName} <span className="text-[11px] text-[#9CA3AF]">{l.unit}</span></td>
                    <td className="px-3 py-2 text-right font-mono text-[#6B7280]">{l.systemQty}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        defaultValue={l.physicalQty}
                        disabled={active.status === "completed"}
                        onBlur={(e) => void saveLine(l.id, Number(e.target.value) || 0)}
                        inputMode="decimal"
                        className="h-8 w-24 rounded-md border border-[#E8E8E8] text-right font-mono text-[13px] outline-none focus:border-[#C8102E] disabled:bg-[#F8F9FB]"
                      />
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${l.variance === 0 ? "text-[#9CA3AF]" : l.variance > 0 ? "text-[#16A34A]" : "text-[#C8102E]"}`}>
                      {l.variance > 0 ? "+" : ""}{l.variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Stock Opname</h1>
          <p className="text-[13px] text-[#6B7280]">Hitung fisik vs sistem → finalisasi untuk reconcile stok.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <button key={w.id} type="button" disabled={busy} onClick={() => void start(w.id)} className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3 py-2 text-[12.5px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26] disabled:opacity-50">
              <Plus className="size-3.5" /> Opname {w.name}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
              <th className="px-3 py-2.5">Dokumen</th>
              <th className="px-3 py-2.5">Gudang</th>
              <th className="px-3 py-2.5 text-right">Item</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-[#6B7280]"><ClipboardCheck className="mx-auto mb-2 size-6 text-[#D1D5DB]" />Belum ada sesi opname.</td></tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[12px] font-bold text-[#C8102E]">{r.doc}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{r.warehouse}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.lines}</td>
                  <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: r.status === "completed" ? "#DCFCE7" : "#FEF3C7", color: r.status === "completed" ? "#16A34A" : "#D97706" }}>{r.status === "completed" ? "Selesai" : "Draft"}</span></td>
                  <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => void open(r.id)} className="rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[12px] font-semibold text-[#374151] hover:bg-[#F8F9FB]">Buka</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
