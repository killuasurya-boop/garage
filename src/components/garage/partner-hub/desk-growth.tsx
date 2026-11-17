"use client";

// Partner Hub — meja staf, fitur lanjutan (Owner, Nov 2026, backlog P1/P2):
//   • Kesehatan mitra: peringatan yang bisa ditindaklanjuti (tiket macet, ketersediaan basi, pengajuan, setoran).
//   • Antrean pengajuan harga dari mitra dengan dampak margin; keputusan hanya Owner (dicek ulang di server).
//   • Rapor kinerja per mitra (dibuka dari Kelola → detail mitra).
// Berisi HPP & margin → hanya Owner/Manajer (route menolak Kasir).

import { useCallback, useEffect, useState } from "react";
import { Activity, Gauge, Tags } from "lucide-react";

import { PerformanceBody, performanceQuery, type PerformanceReport } from "./partner-portal-growth";
import { api, Btn, Card, Chip, dateWib, inputCls, Notice, rp } from "./desk-shared";

type HealthRow = {
  partnerId: string;
  name: string;
  code: string;
  status: string;
  operationalStatus: string;
  alerts: Array<{ level: "info" | "warning" | "critical"; code: string; text: string }>;
};

const LEVEL_TONE = { critical: "red", warning: "amber", info: "blue" } as const;
const LEVEL_LABEL = { critical: "Segera", warning: "Perlu dicek", info: "Info" } as const;

type JobRow = { job: string; label: string; status: "ok" | "failing" | "unknown"; lastOkAt: string | null; lastErrorAt: string | null; consecutiveFailures: number };

const timeWibShort = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

/** Proses otomatis server (jam layanan, eskalasi, pengingat setoran): terakhir berhasil / bermasalah. */
function BackgroundJobsLine({ jobs }: { jobs: JobRow[] }) {
  if (!jobs.length) return null;
  const failing = jobs.filter((j) => j.status === "failing");
  return (
    <div className={`mt-3 rounded-lg border p-3 ${failing.length ? "border-[#ff5a66]/60 bg-[#3a1015]" : "border-[#3a3a42] bg-black/20"}`} data-testid="partner-jobs-health">
      <p className="text-sm font-semibold text-white">Proses otomatis</p>
      <ul className="mt-1 grid gap-1 text-sm">
        {jobs.map((job) => (
          <li key={job.job} className="flex flex-wrap items-center gap-2 text-[#e4e4e8]">
            <Chip tone={job.status === "failing" ? "red" : job.status === "ok" ? "green" : "default"}>
              {job.status === "failing" ? "Bermasalah" : job.status === "ok" ? "Jalan" : "Belum ada data"}
            </Chip>
            <span className="min-w-0 flex-1">{job.label}</span>
            <span className="text-xs text-[#b8b8bf]">
              {job.status === "failing"
                ? `gagal ${job.consecutiveFailures}× · terakhir berhasil ${job.lastOkAt ? timeWibShort(job.lastOkAt) : "-"}`
                : job.lastOkAt
                  ? `terakhir ${timeWibShort(job.lastOkAt)}`
                  : "menunggu putaran pertama"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ringkasan kesehatan semua mitra outlet. Hanya baca; tiap butir menunjuk ke tindakan di tab terkait. */
export function PartnerHealthBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<HealthRow[] | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ enabled: boolean; partners: HealthRow[]; jobs?: JobRow[] }>("/api/partners/health")
        .then((data) => alive && (setRows(data.partners), setJobs(data.jobs ?? []), setError(null)))
        .catch((err: Error) => alive && setError(err.message));
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [refreshKey]);

  if (error) return <Notice message={{ tone: "error", text: error }} />;
  if (!rows || (rows.length === 0 && !jobs.some((j) => j.status === "failing"))) return null;
  const withAlerts = rows.filter((r) => r.alerts.length);

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-bold text-white">
        <Activity className="size-4 text-[#ff5a66]" aria-hidden /> Kesehatan mitra
        <span className="ml-auto text-xs font-normal text-[#b8b8bf]">{rows.length} mitra aktif/dibekukan</span>
      </h2>
      <BackgroundJobsLine jobs={jobs} />
      {withAlerts.length === 0 ? (
        <p className="mt-2 text-sm text-[#bbf7d0]">Semua mitra berjalan normal.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {withAlerts.map((row) => (
            <li key={row.partnerId} className="rounded-lg border border-[#3a3a42] bg-black/20 p-3">
              <p className="font-semibold text-white">
                {row.name} <span className="text-xs text-[#b8b8bf]">#{row.code} · {row.operationalStatus.toUpperCase()}</span>
              </p>
              <ul className="mt-1 grid gap-1">
                {row.alerts.map((alert) => (
                  <li key={alert.code} className="flex flex-wrap items-start gap-2 text-sm text-[#e4e4e8]">
                    <Chip tone={LEVEL_TONE[alert.level]}>{LEVEL_LABEL[alert.level]}</Chip>
                    <span className="min-w-0 flex-1">{alert.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Proposal = {
  id: string;
  proposalNo: string;
  partnerName: string;
  itemName: string;
  variantLabel: string;
  currentUnitCost: number;
  currentSellPrice: number;
  proposedUnitCost: number;
  suggestedSellPrice: number | null;
  reason: string;
  status: string;
  statusLabel: string;
  decidedUnitCost: number | null;
  decidedSellPrice: number | null;
  decisionNote: string | null;
  createdAt: string;
  masterChanged: boolean;
  defaultSellPrice?: number;
  impact?: { costDelta: number; costDeltaPct: number | null; marginBefore: number; marginAfter: number; marginAfterPct: number; belowCost: boolean; bigChange: boolean };
};

const digits = (value: string) => Number(value.replace(/\D/g, "") || 0);

/** Antrean pengajuan harga mitra. Manajer melihat; hanya Owner memutuskan. */
export function PriceProposalQueue({ isOwner, onDecided }: { isOwner: boolean; onDecided?: () => void }) {
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, { cost: string; sell: string; note: string }>>({});

  const load = useCallback(async () => {
    try {
      setRows(await api<Proposal[]>("/api/partners/price-proposals"));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
      setRows([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(row: Proposal, approve: boolean) {
    const d = draft[row.id] ?? { cost: "", sell: "", note: "" };
    if (!approve && !d.note.trim()) {
      setMessage({ tone: "error", text: "Tulis alasan penolakan agar mitra tahu." });
      return;
    }
    setBusy(`${row.id}-${approve ? "ok" : "no"}`);
    setMessage(null);
    try {
      await api(`/api/partners/price-proposals/${row.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ approve, unitCost: d.cost ? digits(d.cost) : null, sellPrice: d.sell ? digits(d.sell) : null, note: d.note.trim() || null }),
      });
      setMessage({ tone: "ok", text: approve ? `${row.proposalNo} disetujui — harga baru berlaku untuk pesanan berikutnya.` : `${row.proposalNo} ditolak.` });
      await load();
      onDecided?.();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) return null;
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");
  if (!pending.length && !done.length) return null;

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-bold text-white">
        <Tags className="size-4 text-[#ff5a66]" aria-hidden /> Pengajuan harga dari mitra
        {pending.length ? <span className="rounded-full bg-[#d11a2a] px-2 py-0.5 text-xs">{pending.length}</span> : null}
      </h2>
      <p className="text-xs text-[#b8b8bf]">Harga master berubah hanya setelah Owner menyetujui. Pesanan lama memakai harga saat dipesan.</p>
      <div className="mt-3 grid gap-3">
        <Notice message={message} />
        {pending.length === 0 ? <p className="text-sm text-[#b8b8bf]">Tidak ada pengajuan yang menunggu.</p> : null}
        {pending.map((row) => {
          const d = draft[row.id] ?? { cost: "", sell: "", note: "" };
          const set = (patch: Partial<typeof d>) => setDraft((all) => ({ ...all, [row.id]: { ...d, ...patch } }));
          const impact = row.impact;
          return (
            <article key={row.id} className="rounded-lg border border-[#3a3a42] bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  {row.partnerName} · {row.itemName}
                  {row.variantLabel !== "Regular" ? ` (${row.variantLabel})` : ""}
                </p>
                <span className="text-xs text-[#b8b8bf]">
                  {row.proposalNo} · {dateWib(row.createdAt)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-[#b8b8bf]">HPP sekarang</dt>
                  <dd className="font-semibold text-white">{rp(row.currentUnitCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#b8b8bf]">HPP diajukan</dt>
                  <dd className="font-semibold text-[#ffd08a]">
                    {rp(row.proposedUnitCost)}
                    {impact?.costDeltaPct != null ? ` (${impact.costDelta > 0 ? "+" : ""}${impact.costDeltaPct}%)` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#b8b8bf]">Harga jual</dt>
                  <dd className="font-semibold text-white">
                    {rp(row.currentSellPrice)}
                    {row.suggestedSellPrice ? ` → usul ${rp(row.suggestedSellPrice)}` : ""}
                  </dd>
                </div>
                {impact ? (
                  <div>
                    <dt className="text-xs text-[#b8b8bf]">Margin Garage</dt>
                    <dd className={`font-semibold ${impact.marginAfter < impact.marginBefore ? "text-[#fecdd3]" : "text-[#bbf7d0]"}`}>
                      {rp(impact.marginBefore)} → {rp(impact.marginAfter)} ({impact.marginAfterPct}%)
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2 text-sm text-[#e4e4e8]">Alasan mitra: {row.reason}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {impact?.bigChange ? <Chip tone="amber">Perubahan HPP besar</Chip> : null}
                {row.masterChanged ? <Chip tone="amber">Harga master sudah berubah sejak diajukan</Chip> : null}
              </div>
              {isOwner ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
                  <input className={inputCls} inputMode="numeric" placeholder={`HPP final (${rp(row.proposedUnitCost)})`} aria-label="HPP final" value={d.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, "") })} />
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    placeholder={`Harga jual (${rp(row.defaultSellPrice ?? row.currentSellPrice)})`}
                    aria-label="Harga jual final"
                    value={d.sell}
                    onChange={(e) => set({ sell: e.target.value.replace(/\D/g, "") })}
                  />
                  <input className={inputCls} placeholder="Catatan (wajib bila ditolak)" aria-label="Catatan keputusan" maxLength={500} value={d.note} onChange={(e) => set({ note: e.target.value })} />
                  <div className="flex flex-wrap gap-2 sm:col-span-3">
                    <Btn tone="success" busy={busy === `${row.id}-ok`} disabled={busy !== null} onClick={() => void decide(row, true)}>
                      Setujui
                    </Btn>
                    <Btn tone="danger" busy={busy === `${row.id}-no`} disabled={busy !== null} onClick={() => void decide(row, false)}>
                      Tolak
                    </Btn>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#b8b8bf]">Menunggu keputusan Owner.</p>
              )}
            </article>
          );
        })}
        {done.length ? (
          <div>
            <Btn onClick={() => setShowDone((v) => !v)}>{showDone ? "Sembunyikan riwayat" : `Riwayat pengajuan (${done.length})`}</Btn>
            {showDone ? (
              <ul className="mt-2 grid gap-1 text-sm text-[#e4e4e8]">
                {done.slice(0, 30).map((row) => (
                  <li key={row.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1">
                    <span className="min-w-0 break-words">
                      {row.proposalNo} · {row.partnerName} · {row.itemName}: {rp(row.currentUnitCost)} → {rp(row.decidedUnitCost ?? row.proposedUnitCost)}
                      {row.decisionNote ? ` · ${row.decisionNote}` : ""}
                    </span>
                    <Chip tone={row.status === "approved" ? "green" : row.status === "rejected" ? "red" : "default"}>{row.statusLabel}</Chip>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

const PERIODS = [
  { id: "7d", label: "7 hari", days: 6 },
  { id: "30d", label: "30 hari", days: 29 },
  { id: "90d", label: "90 hari", days: 89 },
] as const;

/** Rapor kinerja satu mitra (detail mitra di Kelola). Termasuk waktu tunggu diambil waiter (kinerja tim Garage). */
export function PartnerPerformanceStaff({ partnerId }: { partnerId: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("30d");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const days = PERIODS.find((p) => p.id === period)!.days;
    api<PerformanceReport>(`/api/partners/${partnerId}/performance?${performanceQuery(days)}`)
      .then((data) => alive && (setReport(data), setError(null)))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [partnerId, period]);

  return (
    <div className="rounded-lg border border-[#3a3a42] bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-white">
          <Gauge className="size-4 text-[#ff5a66]" aria-hidden /> Rapor kinerja
        </h4>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periode rapor">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => {
                setReport(null);
                setPeriod(p.id);
              }}
              className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${period === p.id ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        {error ? <Notice message={{ tone: "error", text: error }} /> : report ? <PerformanceBody report={report} showPickup /> : <p className="text-sm text-[#b8b8bf]">Memuat rapor…</p>}
      </div>
    </div>
  );
}
