"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Target } from "lucide-react";

import { errorText, ui } from "@/components/wms/master/master-shared";
import { garageApi } from "@/lib/api-client";
import { DISCLAIMER, Kpi, Notice, motion, num, pct, rupiah, todayWib, type WarehouseOption } from "./opname-shared";

type LossSummary = {
  grossShortage: number; grossSurplus: number; recordedWaste: number; unexplained: number; net: number; totalLoss: number;
  countedLines: number; accurateLines: number; accuracyPct: number | null; valueAccuracyPct: number | null;
  coveredPairs: number; activePairs: number; coveragePct: number | null;
};
type LossRow = { productId: string; sku: string; name: string; unit: string; warehouseId: string; warehouseName: string; shortageQty: number; surplusQty: number; shortageValue: number; surplusValue: number; wasteValue: number; events: number };
export type LossReport = { opnameCount: number; summary: LossSummary; top10: LossRow[]; rows: LossRow[]; wasteByReason: Record<string, number>; fromKey: string; toKey: string };
type Period = "daily" | "weekly" | "monthly";
const PERIOD_LABEL: Record<Period, string> = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" };
const WASTE_REASON: Record<string, string> = { expired: "Kedaluwarsa", damaged: "Rusak", spill: "Tumpah", prep_loss: "Susut prep", other: "Lainnya" };

function lossUrl(p: { period: Period; date: string; warehouseId: string; format?: string }) {
  const sp = new URLSearchParams({ period: p.period, date: p.date });
  if (p.warehouseId) sp.set("warehouseId", p.warehouseId);
  if (p.format) sp.set("format", p.format);
  return `/api/wms/opname/loss?${sp}`;
}

export function LossKpis({ s }: { s: LossSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi label="Kekurangan (gross)" value={rupiah(s.grossShortage)} tone={s.grossShortage ? "bad" : "default"} />
      <Kpi label="Kelebihan (gross)" value={rupiah(s.grossSurplus)} tone={s.grossSurplus ? "good" : "default"} />
      <Kpi label="Waste tercatat" value={rupiah(s.recordedWaste)} tone={s.recordedWaste ? "warn" : "default"} />
      <Kpi label="Tak terjelaskan" value={rupiah(s.unexplained)} hint="Kurang yang tidak tercatat sebagai waste" tone={s.unexplained ? "bad" : "default"} />
      <Kpi label="Selisih bersih" value={rupiah(s.net)} tone={s.net < 0 ? "bad" : s.net > 0 ? "good" : "default"} />
      <Kpi label="Total kerugian" value={rupiah(s.totalLoss)} hint="Waste + tak terjelaskan" tone={s.totalLoss ? "bad" : "default"} />
      <Kpi label="Akurasi hitung" value={pct(s.accuracyPct)} hint={`${s.accurateLines}/${s.countedLines} baris sesuai toleransi`} />
      <Kpi label="Akurasi nilai" value={pct(s.valueAccuracyPct)} />
      <Kpi label="Cakupan hitung" value={pct(s.coveragePct)} hint={`${s.coveredPairs}/${s.activePairs} bahan·ruang`} />
    </div>
  );
}

function Filters({ period, setPeriod, date, setDate, warehouseId, setWarehouseId, warehouses }: {
  period: Period; setPeriod: (p: Period) => void; date: string; setDate: (d: string) => void; warehouseId: string; setWarehouseId: (w: string) => void; warehouses: WarehouseOption[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex gap-1" role="group" aria-label="Periode">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={`h-10 rounded-md border px-3 text-[12.5px] font-semibold ${motion} ${period === p ? "border-[#C8102E] bg-[#C8102E] text-white" : "border-[#D9DCE1] bg-white text-[#374151] hover:bg-[#F8F9FB]"}`}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <label>
        <span className="sr-only">Tanggal acuan</span>
        <input type="date" value={date} max={todayWib()} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${ui.input} w-auto`} />
      </label>
      <label>
        <span className="sr-only">Ruang</span>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={`${ui.input} w-auto`}>
          <option value="">Semua ruang</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
    </div>
  );
}

function useLoss(period: Period, date: string, warehouseId: string) {
  const [data, setData] = useState<LossReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    garageApi
      .get<LossReport>(lossUrl({ period, date, warehouseId }))
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(errorText(e, "Gagal memuat laporan.")); });
    return () => { alive = false; };
  }, [period, date, warehouseId]);
  return { data, error };
}

/** Loss Control: KPI + 10 kerugian terbesar + rincian per bahan. */
export function LossTab({ warehouses }: { warehouses: WarehouseOption[] }) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [date, setDate] = useState(todayWib());
  const [warehouseId, setWarehouseId] = useState("");
  const { data, error } = useLoss(period, date, warehouseId);
  return (
    <div className="space-y-3">
      <Filters {...{ period, setPeriod, date, setDate, warehouseId, setWarehouseId, warehouses }} />
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <>
          <p className="text-[12.5px] text-[#4B5563]">{data.fromKey} s/d {data.toKey} · {data.opnameCount} opname disetujui</p>
          <LossKpis s={data.summary} />
          <LossTable title="10 kerugian terbesar" rows={data.top10} />
          {Object.keys(data.wasteByReason).length > 0 && (
            <div className="rounded-xl border border-[#E8E8E8] bg-white p-3">
              <p className="mb-2 text-[13px] font-bold text-[#111111]">Waste per alasan</p>
              <ul className="flex flex-wrap gap-2">
                {Object.entries(data.wasteByReason).map(([k, v]) => <li key={k} className="rounded-full bg-[#FFFBEB] px-3 py-1 text-[12px] text-[#92400E]">{WASTE_REASON[k] ?? k}: <b>{rupiah(v)}</b></li>)}
              </ul>
            </div>
          )}
          <LossTable title="Semua selisih per bahan" rows={data.rows} />
          <p className="text-[11.5px] text-[#6B7280]">{DISCLAIMER}</p>
        </>
      )}
    </div>
  );
}

function LossTable({ title, rows }: { title: string; rows: LossRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
      <p className="px-3 pt-3 text-[13px] font-bold text-[#111111]">{title}</p>
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="border-b border-[#E8E8E8]">
            <th className={ui.th}>Bahan</th><th className={ui.th}>Ruang</th>
            <th className={`${ui.th} text-right`}>Kejadian</th><th className={`${ui.th} text-right`}>Kurang</th><th className={`${ui.th} text-right`}>Lebih</th><th className={`${ui.th} text-right`}>Waste</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[#6B7280]">Tidak ada selisih di periode ini.</td></tr>
          ) : rows.map((r) => (
            <tr key={`${r.productId}:${r.warehouseId}`} className="border-b border-[#F0F1F4] last:border-0">
              <td className={ui.td}><b>{r.name}</b> <span className="text-[11px] text-[#6B7280]">{r.sku}</span></td>
              <td className={ui.td}>{r.warehouseName}</td>
              <td className={`${ui.td} text-right font-mono`}>{r.events}</td>
              <td className={`${ui.td} text-right font-mono text-[#B91C1C]`}>{r.shortageValue ? `${rupiah(r.shortageValue)} · ${num(r.shortageQty)} ${r.unit}` : "–"}</td>
              <td className={`${ui.td} text-right font-mono text-[#15803D]`}>{r.surplusValue ? rupiah(r.surplusValue) : "–"}</td>
              <td className={`${ui.td} text-right font-mono text-[#92400E]`}>{r.wasteValue ? rupiah(r.wasteValue) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Laporan: unduh harian/mingguan/bulanan dalam PDF, XLSX, CSV (format standar Garage OS). */
export function ReportsTab({ warehouses }: { warehouses: WarehouseOption[] }) {
  const [period, setPeriod] = useState<Period>("daily");
  const [date, setDate] = useState(todayWib());
  const [warehouseId, setWarehouseId] = useState("");
  return (
    <div className="space-y-3">
      <Filters {...{ period, setPeriod, date, setDate, warehouseId, setWarehouseId, warehouses }} />
      <div className="grid gap-2 sm:grid-cols-3">
        {(["pdf", "xlsx", "csv"] as const).map((f) => (
          <a key={f} href={lossUrl({ period, date, warehouseId, format: f })} className={`${ui.secondary} h-14 justify-start`} download>
            <Download className="size-4 text-[#C8102E]" /> Laporan {PERIOD_LABEL[period]} · {f.toUpperCase()}
          </a>
        ))}
      </div>
      <p className="text-[12px] text-[#6B7280]">Isi: ringkasan loss (kurang, lebih, waste, tak terjelaskan, bersih, akurasi, cakupan), 10 kerugian terbesar, selisih per bahan, dan waste per alasan. Laporan bersifat manajerial dan tidak membuat jurnal keuangan.</p>
    </div>
  );
}

type Priority = { productId: string; sku: string; name: string; category: string; unit: string; qty: number; score: number; reasons: string[]; factors: { stockValue: number; usageCount30d: number; varianceEvents90d: number; varianceLoss90d: number; daysToExpiry: number | null; daysSinceCount: number | null } };

/** Cycle count: prioritas berbasis skor risiko → buat sesi cycle untuk N teratas. */
export function CycleTab({ warehouses, onStarted }: { warehouses: WarehouseOption[]; onStarted: (id: string) => void }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [items, setItems] = useState<Priority[]>([]);
  const [take, setTake] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!warehouseId) return;
    let alive = true;
    garageApi
      .get<{ items: Priority[] }>(`/api/wms/opname/priorities?warehouseId=${warehouseId}&limit=50`)
      .then((d) => { if (alive) { setItems(d.items); setError(null); } })
      .catch((e) => { if (alive) setError(errorText(e, "Gagal memuat prioritas.")); });
    return () => { alive = false; };
  }, [warehouseId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const op = await garageApi.post<{ id: string }>("/api/wms/opname", { warehouseId, kind: "daily", scope: "cycle", productIds: items.slice(0, take).map((i) => i.productId) });
      onStarted(op.id);
    } catch (e) {
      setError(errorText(e, "Gagal membuat cycle count."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className={ui.label}>Ruang</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={`${ui.input} w-auto`}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label>
          <span className={ui.label}>Jumlah bahan</span>
          <select value={take} onChange={(e) => setTake(Number(e.target.value))} className={`${ui.input} w-auto`}>
            {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} teratas</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !items.length} onClick={() => void start()} className={ui.primary}><Target className="size-4" /> Mulai cycle count</button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-[11.5px] text-[#6B7280]">Skor 0–100 = bobot nilai stok 25%, pemakaian 30 hari 20%, kejadian selisih 90 hari 15%, kerugian selisih 15%, kedaluwarsa 10%, lama tidak dihitung 15%. Skor adalah prioritas hitung, bukan penilaian orang.</p>
      <ol className="space-y-1.5">
        {items.map((i, idx) => (
          <li key={i.productId} className={`flex items-center gap-3 rounded-xl border bg-white p-2.5 ${idx < take ? "border-[#C8102E]/30" : "border-[#E8E8E8] opacity-70"}`}>
            <span className="w-6 text-right font-mono text-[12px] text-[#6B7280]">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-[#111111]">{i.name}</p>
              <p className="text-[11.5px] text-[#6B7280]">{i.reasons.join(" · ") || "–"} · stok {rupiah(i.factors.stockValue)}{i.factors.daysSinceCount === null ? " · belum pernah dihitung" : ` · terakhir ${i.factors.daysSinceCount} hari lalu`}</p>
            </div>
            <span className="font-mono text-[15px] font-extrabold text-[#C8102E]">{i.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Action = { id: string; rule: string; finding: string; evidence: Record<string, unknown>; confidence: string; limitation: string; impactValue: number; recommendation: string; ownerRole: string; status: string; note: string; createdAt: string };
const CONF: Record<string, string> = { high: "Keyakinan tinggi", medium: "Keyakinan sedang", low: "Keyakinan rendah" };
const ACTION_STATUS: Record<string, string> = { open: "Terbuka", in_progress: "Dikerjakan", done: "Selesai", dismissed: "Diabaikan" };

/** Rekomendasi berbasis aturan + pelacakan tindak lanjut. Tidak mengubah stok/keuangan. */
export function ActionsTab() {
  const [rows, setRows] = useState<Array<{ action: Action; productName: string | null; warehouseName: string | null }>>([]);
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setRows(await garageApi.get(`/api/wms/opname/actions?status=${status}`));
  }, [status]);
  useEffect(() => {
    let alive = true;
    garageApi.get<typeof rows>(`/api/wms/opname/actions?status=${status}`).then((r) => { if (alive) setRows(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [status]);

  async function refresh() {
    setBusy(true);
    try {
      const r = await garageApi.post<{ created: number; total: number }>("/api/wms/opname/actions", {});
      setMsg({ tone: "ok", text: r.created ? `${r.created} temuan baru.` : "Tidak ada temuan baru." });
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "Gagal memperbarui rekomendasi.") });
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, next: string) {
    const note = next === "dismissed" || next === "done" ? (window.prompt(next === "dismissed" ? "Alasan diabaikan (wajib)?" : "Catatan tindak lanjut (opsional)?") ?? undefined) : undefined;
    if (next === "dismissed" && !note?.trim()) return;
    try {
      await garageApi.patch(`/api/wms/opname/actions/${id}`, { status: next, ...(note !== undefined ? { note } : {}) });
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "Gagal memperbarui status.") });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={`${ui.input} w-auto`}>
          <option value="active">Terbuka & dikerjakan</option>
          <option value="done">Selesai</option>
          <option value="dismissed">Diabaikan</option>
          <option value="all">Semua</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void refresh()} className={ui.secondary}><RefreshCw className={`size-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} /> Perbarui temuan</button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-[11.5px] text-[#6B7280]">Temuan dari aturan tetap (bukan tebakan AI), lengkap dengan bukti & batasan. {DISCLAIMER}</p>
      {rows.length === 0 && <div className="rounded-xl border border-dashed border-[#D9DCE1] bg-white p-6 text-center text-[13px] text-[#6B7280]">Belum ada rekomendasi. Tekan “Perbarui temuan”.</div>}
      <ul className="space-y-2">
        {rows.map(({ action: a, warehouseName }) => (
          <li key={a.id} className="rounded-xl border border-[#E8E8E8] bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-[13.5px] font-bold text-[#111111]">{a.finding}</p>
              <span className="font-mono text-[13px] font-bold text-[#B91C1C]">{rupiah(a.impactValue)}</span>
            </div>
            <p className="mt-1 text-[13px] text-[#374151]"><b>Saran:</b> {a.recommendation}</p>
            <p className="mt-1 text-[11.5px] text-[#6B7280]">{CONF[a.confidence] ?? a.confidence} · PJ {a.ownerRole}{warehouseName ? ` · ${warehouseName}` : ""} · Batasan: {a.limitation}</p>
            <details className="mt-1 text-[11.5px] text-[#4B5563]">
              <summary className="cursor-pointer font-semibold">Bukti</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-[#F8F9FB] p-2 text-[11px]">{JSON.stringify(a.evidence, null, 2)}</pre>
            </details>
            {a.note && <p className="mt-1 text-[11.5px] text-[#374151]">Catatan: {a.note}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="mr-auto self-center rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold text-[#374151]">{ACTION_STATUS[a.status] ?? a.status}</span>
              {a.status === "open" && <button type="button" onClick={() => void update(a.id, "in_progress")} className={`${ui.secondary} h-9`}>Kerjakan</button>}
              {(a.status === "open" || a.status === "in_progress") && (
                <>
                  <button type="button" onClick={() => void update(a.id, "done")} className={`${ui.secondary} h-9`}>Selesai</button>
                  <button type="button" onClick={() => void update(a.id, "dismissed")} className={`${ui.secondary} h-9`}>Abaikan</button>
                </>
              )}
              {(a.status === "done" || a.status === "dismissed") && <button type="button" onClick={() => void update(a.id, "open")} className={`${ui.secondary} h-9`}>Buka lagi</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ringkasan (Owner/Manajer): KPI minggu ini + sesi yang butuh perhatian. */
export function OverviewKpis() {
  const { data, error } = useLoss("weekly", todayWib(), "");
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <p className="text-[13px] text-[#6B7280]">Memuat ringkasan…</p>;
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] font-semibold text-[#4B5563]">Minggu ini ({data.fromKey} s/d {data.toKey})</p>
      <LossKpis s={data.summary} />
    </div>
  );
}
