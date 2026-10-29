"use client";

import { useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";

import { errorText, ui } from "@/components/wms/master/master-shared";
import { garageApi } from "@/lib/api-client";
import { KIND_LABEL, Notice, ProgressBar, SCOPE_LABEL, StatusBadge, motion, type OpnameKind, type OpnameRow, type OpnameScope, type WarehouseOption } from "./opname-shared";

/** Daftar sesi (kartu, ramah HP). */
export function SessionList({ rows, empty, onOpen }: { rows: OpnameRow[]; empty: string; onOpen: (id: string) => void }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#D9DCE1] bg-white p-8 text-center text-[13px] text-[#6B7280]">
        <ClipboardCheck className="mx-auto mb-2 size-6 text-[#D1D5DB]" aria-hidden="true" />
        {empty}
      </div>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r.id)} className={`w-full rounded-xl border border-[#E8E8E8] bg-white p-3 text-left hover:border-[#C8102E]/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/30 ${motion}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[12.5px] font-bold text-[#C8102E]">{r.doc}</span>
              <StatusBadge status={r.status} rejected={r.rejected} />
            </div>
            <p className="mt-1 text-[13.5px] font-semibold text-[#111111]">{r.warehouse}</p>
            <p className="text-[11.5px] text-[#6B7280]">
              {KIND_LABEL[r.kind] ?? r.kind} · {SCOPE_LABEL[r.scope] ?? r.scope} · {new Date(r.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={r.counted} total={r.lines} />
              <span className="flex-none font-mono text-[11.5px] text-[#4B5563]">{r.counted}/{r.lines}</span>
            </div>
            {r.recount > 0 && <p className="mt-1 text-[11.5px] font-semibold text-[#92400E]">{r.recount} bahan perlu hitung ulang</p>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Mulai sesi baru: pilih ruang, jenis (harian/mingguan/bulanan/insidental), cakupan penuh/sebagian. */
export function StartSession({ warehouses, onStarted }: { warehouses: WarehouseOption[]; onStarted: (id: string) => void }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [kind, setKind] = useState<OpnameKind>("daily");
  const [scope, setScope] = useState<Exclude<OpnameScope, "cycle">>("partial");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!warehouseId) return;
    setBusy(true);
    setError(null);
    try {
      const op = await garageApi.post<{ id: string }>("/api/wms/opname", { warehouseId, kind, scope });
      onStarted(op.id);
    } catch (e) {
      setError(errorText(e, "Gagal membuat sesi opname."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#E8E8E8] bg-white p-3">
      <p className="text-[13px] font-bold text-[#111111]">Mulai opname</p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="min-w-0">
          <span className={ui.label}>Ruang</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={ui.input}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className={ui.label}>Jenis</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as OpnameKind)} className={ui.input}>
            {(Object.keys(KIND_LABEL) as OpnameKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className={ui.label}>Cakupan</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as "full" | "partial")} className={ui.input}>
            <option value="partial">Sebagian (yang dihitung saja)</option>
            <option value="full">Penuh (semua wajib dihitung)</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" disabled={busy || !warehouseId} onClick={() => void start()} className={`${ui.primary} w-full`}>
            <Plus className="size-4" /> {busy ? "Membuat…" : "Mulai"}
          </button>
        </div>
      </div>
      <p className="text-[11.5px] text-[#6B7280]">Stok sistem dicatat saat tiap bahan dihitung, jadi penjualan selama opname tetap aman. Stok baru berubah setelah disetujui.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
