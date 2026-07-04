"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Plus, Printer, Square } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { printWmsDoc, escapeHtml } from "@/lib/wms-print";
import type { WmsWarehouse } from "@/lib/wms-types";

type RunRow = { id: string; type: string; title: string; status: string; warehouse: string; total: number; done: number; createdAt: string };
type Item = { id: string; label: string; checked: boolean; note: string };
type RunDetail = { id: string; type: string; title: string; warehouseName: string | null; status: string; createdAt: string; items: Item[] };

const TYPE_LABEL: Record<string, string> = { daily: "Harian", receiving: "Receiving/QC", opname: "Opname" };

export default function WmsChecklistPage() {
  const [list, setList] = useState<RunRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [active, setActive] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadList() { setList(await garageApi.get<RunRow[]>("/api/wms/checklist")); }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [runs, whs] = await Promise.all([
        garageApi.get<RunRow[]>("/api/wms/checklist"),
        garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
      ]);
      if (!alive) return;
      setList(runs);
      setWarehouses(whs);
    })();
    return () => { alive = false; };
  }, []);

  async function startDaily(warehouseId: string) {
    setBusy(true);
    try {
      const run = await garageApi.post<{ id: string }>("/api/wms/checklist", { type: "daily", warehouseId });
      setActive(await garageApi.get<RunDetail>(`/api/wms/checklist/${run.id}`));
      await loadList();
    } finally { setBusy(false); }
  }

  async function open(id: string) {
    setActive(await garageApi.get<RunDetail>(`/api/wms/checklist/${id}`));
  }

  async function toggle(item: Item) {
    if (!active || active.status === "completed") return;
    const checked = !item.checked;
    setActive((a) => a && { ...a, items: a.items.map((x) => (x.id === item.id ? { ...x, checked } : x)) });
    await garageApi.patch(`/api/wms/checklist/${active.id}/item`, { itemId: item.id, checked });
  }

  async function complete() {
    if (!active || busy) return;
    setBusy(true);
    try {
      await garageApi.post(`/api/wms/checklist/${active.id}`, {});
      setActive(null);
      await loadList();
    } finally { setBusy(false); }
  }

  function printRun(r: RunDetail) {
    const rows = r.items.map((it) => `<tr><td class="c">${it.checked ? "☑" : "☐"}</td><td>${escapeHtml(it.label)}</td><td>${escapeHtml(it.note || "")}</td></tr>`).join("");
    printWmsDoc(r.title, `<table><thead><tr><th class="c">✓</th><th>Item</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table><div class="sign"><div><div class="line">Pelaksana</div></div><div><div class="line">Diperiksa</div></div></div>`, r.warehouseName ?? "");
  }

  if (active) {
    const done = active.items.filter((i) => i.checked).length;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => setActive(null)} className="text-[12px] font-semibold text-[#C8102E]">← Kembali</button>
            <h1 className="text-[20px] font-extrabold text-[#111111]">{active.title}</h1>
            <p className="text-[13px] text-[#6B7280]">{active.warehouseName ?? "—"} · {done}/{active.items.length} selesai · {active.status === "completed" ? "Selesai" : "Berjalan"}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => printRun(active)} className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]"><Printer className="size-4 text-[#2563EB]" /> Cetak</button>
            {active.status !== "completed" && (
              <button type="button" disabled={busy || done < active.items.length} onClick={() => void complete()} className="rounded-lg bg-[#16A34A] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50">Selesaikan</button>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[#E8E8E8] bg-white">
          {active.items.map((it) => (
            <button key={it.id} type="button" onClick={() => void toggle(it)} disabled={active.status === "completed"} className="flex w-full items-center gap-3 border-b border-[#F0F1F4] px-4 py-3 text-left last:border-0 hover:bg-[#F8F9FB] disabled:cursor-default">
              {it.checked ? <CheckSquare className="size-5 shrink-0 text-[#16A34A]" /> : <Square className="size-5 shrink-0 text-[#C7CBD1]" />}
              <span className={`text-[13.5px] ${it.checked ? "text-[#6B7280] line-through" : "font-semibold text-[#111111]"}`}>{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Checklist Gudang</h1>
          <p className="text-[13px] text-[#6B7280]">Checklist harian buka/tutup per ruang. QC receiving & opname otomatis dari alurnya.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {warehouses.filter((w) => w.type === "main").map((w) => (
            <button key={w.id} type="button" disabled={busy} onClick={() => void startDaily(w.id)} className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
              <Plus className="size-3.5" /> Checklist Harian · {w.name}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[600px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
              <th className="px-3 py-2.5">Jenis</th>
              <th className="px-3 py-2.5">Ruang</th>
              <th className="px-3 py-2.5 text-right">Progress</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Tanggal</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-[#6B7280]">Belum ada checklist.</td></tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-[#111111]">{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td className="px-3 py-2.5 text-[#6B7280]">{r.warehouse}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.done}/{r.total}</td>
                  <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: r.status === "completed" ? "#DCFCE7" : "#FEF3C7", color: r.status === "completed" ? "#16A34A" : "#D97706" }}>{r.status === "completed" ? "Selesai" : "Draft"}</span></td>
                  <td className="px-3 py-2.5 text-[12px] text-[#6B7280]">{new Date(r.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</td>
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
