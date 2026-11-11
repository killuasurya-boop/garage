"use client";

// Portal Mitra — fitur pertumbuhan (Owner, Nov 2026, backlog P1/P2 Partner Hub):
//   • Ajukan harga setor baru per varian (harga berubah hanya setelah Owner setuju).
//   • Rapor kinerja milik mitra sendiri (waktu terima/siap, tolak, jam ramai, terlaris).
// Semua data milik mitra yang login (partner_id dari sesi server).

import { useCallback, useEffect, useState } from "react";
import { Gauge, Loader2, Tags } from "lucide-react";

import { rp } from "./partner-portal-extras";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? "Permintaan gagal."), { status: res.status });
  return json?.data as T;
}

const card = "rounded-xl border border-[#34343c] bg-[#17171c] p-4";
const input = "min-h-11 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 text-base text-white placeholder:text-[#8e8e96] focus:border-[#ff5a66] focus:outline-none";
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const digits = (value: string) => Number(value.replace(/\D/g, "") || 0);

export type PortalProduct = {
  linkId: string;
  name: string;
  active: boolean;
  variants: Array<{ variantId?: string; label: string; sellPrice: number; unitCost?: number }>;
};

type Proposal = {
  id: string;
  proposalNo: string;
  itemName: string;
  variantLabel: string;
  currentUnitCost: number;
  proposedUnitCost: number;
  suggestedSellPrice: number | null;
  reason: string;
  status: string;
  statusLabel: string;
  decidedUnitCost: number | null;
  decisionNote: string | null;
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[#78350f] text-[#fde68a]",
  approved: "bg-[#14532d] text-[#bbf7d0]",
  rejected: "bg-[#3f1d22] text-[#fecdd3]",
  cancelled: "bg-white/10 text-[#d4d4d8]",
};

/** Ajukan harga setor (HPP) baru. Harga jual di kasir tetap keputusan Owner. */
export function PartnerPricePanel({ products, refreshKey = "" }: { products: PortalProduct[]; refreshKey?: string }) {
  const options = products
    .filter((p) => p.active)
    .flatMap((p) => p.variants.filter((v) => v.variantId).map((v) => ({ key: `${p.linkId}|${v.variantId}`, linkId: p.linkId, variantId: v.variantId!, label: v.label && v.label !== "Regular" ? `${p.name} (${v.label})` : p.name, unitCost: v.unitCost ?? null, sellPrice: v.sellPrice })));
  const [selected, setSelected] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [reason, setReason] = useState("");
  const [list, setList] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const current = options.find((o) => o.key === selected) ?? options[0] ?? null;

  const load = useCallback(async () => {
    try {
      setList(await api<Proposal[]>("/api/partner/price-proposals"));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    setBusy("submit");
    setMessage(null);
    try {
      await api("/api/partner/price-proposals", {
        method: "POST",
        body: JSON.stringify({ linkId: current.linkId, variantId: current.variantId, proposedUnitCost: digits(cost), suggestedSellPrice: sell.trim() ? digits(sell) : null, reason: reason.trim() }),
      });
      setCost("");
      setSell("");
      setReason("");
      setMessage({ tone: "ok", text: "Pengajuan terkirim. Harga lama tetap berlaku sampai Owner menyetujui." });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      await api(`/api/partner/price-proposals/${id}/cancel`, { method: "POST" });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!options.length) return null;
  const costValue = digits(cost);
  const delta = current?.unitCost != null && costValue > 0 ? costValue - current.unitCost : null;

  return (
    <section className={card} aria-labelledby="partner-price-title">
      <h2 id="partner-price-title" className="flex items-center gap-2 text-base font-bold text-white">
        <Tags className="size-4 text-[#ff5a66]" aria-hidden /> Ajukan harga setor
      </h2>
      <p className="text-xs text-[#b8b8bf]">Harga bahan naik/turun? Ajukan di sini. Harga lama tetap dipakai sampai Owner menyetujui; pesanan lama tidak berubah.</p>
      <form className="mt-3 grid gap-3" onSubmit={(event) => void submit(event)}>
        <label className="grid gap-1 text-sm text-[#e4e4e8]">
          Produk
          <select className={input} value={current?.key ?? ""} onChange={(event) => setSelected(event.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {current ? (
          <p className="rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-[#f4f4f5]">
            Harga setor sekarang <b>{current.unitCost != null ? rp(current.unitCost) : "—"}</b> · harga jual di Garage <b>{rp(current.sellPrice)}</b>
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#e4e4e8]">
            Harga setor baru
            <input className={input} inputMode="numeric" required value={cost} onChange={(event) => setCost(event.target.value.replace(/\D/g, ""))} placeholder="mis. 24000" />
            {delta !== null && delta !== 0 ? (
              <span className={`text-xs font-semibold ${delta > 0 ? "text-[#ffd08a]" : "text-[#bbf7d0]"}`}>
                {delta > 0 ? "Naik" : "Turun"} {rp(Math.abs(delta))}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm text-[#e4e4e8]">
            Usulan harga jual (opsional)
            <input className={input} inputMode="numeric" value={sell} onChange={(event) => setSell(event.target.value.replace(/\D/g, ""))} placeholder="Owner yang menentukan" />
          </label>
        </div>
        <label className="grid gap-1 text-sm text-[#e4e4e8]">
          Alasan
          <textarea className={`${input} min-h-20 py-2`} required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="mis. harga alpukat naik dari pemasok" />
        </label>
        <button
          type="submit"
          disabled={busy !== null || costValue <= 0 || reason.trim().length < 5}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white hover:bg-[#b3121f] disabled:opacity-50"
        >
          {busy === "submit" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Kirim pengajuan
        </button>
      </form>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-[#ff5a66]/50 bg-[#3a1015] text-[#ffd0d4]" : "border-[#22c55e]/40 bg-[#0f2a1a] text-[#bbf7d0]"}`}>
          {message.text}
        </p>
      ) : null}
      {list && list.length ? (
        <ul className="mt-4 grid gap-2">
          {list.slice(0, 10).map((p) => (
            <li key={p.id} className="rounded-lg border border-[#3a3a42] bg-black/20 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  {p.itemName}
                  {p.variantLabel && p.variantLabel !== "Regular" ? ` (${p.variantLabel})` : ""}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? "bg-white/10"}`}>{p.statusLabel}</span>
              </div>
              <p className="mt-1 text-[#e4e4e8]">
                {rp(p.currentUnitCost)} → <b>{rp(p.proposedUnitCost)}</b>
                {p.status === "approved" && p.decidedUnitCost != null && p.decidedUnitCost !== p.proposedUnitCost ? ` · disetujui ${rp(p.decidedUnitCost)}` : ""}
              </p>
              <p className="text-xs text-[#b8b8bf]">
                {p.proposalNo} · {dateTime(p.createdAt)} · {p.reason}
              </p>
              {p.decisionNote ? <p className="mt-1 text-xs text-[#ffd08a]">Catatan Owner: {p.decisionNote}</p> : null}
              {p.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => void cancel(p.id)}
                  disabled={busy !== null}
                  className="mt-2 min-h-11 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10 disabled:opacity-50"
                >
                  {busy === p.id ? "Membatalkan…" : "Batalkan pengajuan"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export type PerformanceReport = {
  totalTickets: number;
  completed: number;
  rejected: number;
  cancelled: number;
  rejectRatePct: number | null;
  accept: { count: number; avg: number | null; p90: number | null; late: number; onTimePct: number | null };
  prep: { count: number; avg: number | null; p90: number | null; late: number; onTimePct: number | null };
  pickup: { count: number; avg: number | null; late: number };
  serviceScore: number | null;
  serviceGrade: string;
  peakHours: Array<{ hour: number; count: number }>;
  rejectReasons: Array<{ reason: string; count: number }>;
  bestSellers: Array<{ itemName: string; variantLabel: string; qty: number; gross: number }>;
  settings: { acceptSlaMinutes: number; prepTargetMinutes: number };
};

const PERIODS = [
  { id: "7d", label: "7 hari", days: 6 },
  { id: "30d", label: "30 hari", days: 29 },
] as const;

function wibKey(at: Date) {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function performanceQuery(days: number) {
  return `from=${wibKey(new Date(Date.now() - days * 86_400_000))}&to=${wibKey(new Date())}`;
}

const minutes = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("id-ID")} mnt`);
const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("id-ID")}%`);

/** Isi rapor kinerja — dipakai Portal Mitra dan meja staf (Kelola Mitra). */
export function PerformanceBody({ report, showPickup = false }: { report: PerformanceReport; showPickup?: boolean }) {
  const scoreTone = report.serviceScore === null ? "text-[#e4e4e8]" : report.serviceScore >= 75 ? "text-[#bbf7d0]" : report.serviceScore >= 60 ? "text-[#ffd08a]" : "text-[#fecdd3]";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-lg bg-white/[0.06] p-3">
        <div>
          <p className="text-xs text-[#b8b8bf]">Skor layanan</p>
          <p className={`text-3xl font-black ${scoreTone}`}>{report.serviceScore ?? "—"}</p>
          <p className="text-sm font-semibold text-[#e4e4e8]">{report.serviceGrade}</p>
        </div>
        <p className="max-w-[16rem] text-xs text-[#b8b8bf]">
          Dihitung dari terima ≤ {report.settings.acceptSlaMinutes} mnt, siap ≤ {report.settings.prepTargetMinutes} mnt, dan pesanan tidak ditolak.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Pesanan" value={`${report.totalTickets}`} hint={`${report.completed} selesai`} />
        <Stat label="Rata-rata terima" value={minutes(report.accept.avg)} hint={`tepat waktu ${percent(report.accept.onTimePct)}`} />
        <Stat label="Rata-rata siap" value={minutes(report.prep.avg)} hint={`tepat waktu ${percent(report.prep.onTimePct)}`} />
        <Stat label="Ditolak" value={`${report.rejected}`} hint={`tingkat ${percent(report.rejectRatePct)}`} />
        {showPickup ? <Stat label="Tunggu diambil waiter" value={minutes(report.pickup.avg)} hint={`${report.pickup.late} lewat batas`} /> : null}
      </dl>
      {report.peakHours.length ? (
        <p className="text-sm text-[#e4e4e8]">
          <span className="font-semibold text-[#ffd08a]">Jam ramai:</span>{" "}
          {report.peakHours.map((h) => `${String(h.hour).padStart(2, "0")}.00 (${h.count})`).join(" · ")}
        </p>
      ) : null}
      {report.bestSellers.length ? (
        <div>
          <p className="text-sm font-semibold text-white">Terlaris</p>
          <ol className="mt-1 grid gap-1 text-sm text-[#e4e4e8]">
            {report.bestSellers.map((b, i) => (
              <li key={`${b.itemName}-${b.variantLabel}`} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">
                  {i + 1}. {b.itemName}
                  {b.variantLabel && b.variantLabel !== "Regular" ? ` (${b.variantLabel})` : ""}
                </span>
                <span className="shrink-0 font-semibold">{b.qty}×</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {report.rejectReasons.length ? (
        <p className="text-xs text-[#b8b8bf]">Alasan tolak: {report.rejectReasons.map((r) => `${r.reason} (${r.count})`).join(" · ")}</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[#3a3a42] bg-black/20 p-2.5">
      <dt className="text-xs text-[#b8b8bf]">{label}</dt>
      <dd className="text-base font-bold text-white">{value}</dd>
      {hint ? <dd className="text-xs text-[#c4c4cc]">{hint}</dd> : null}
    </div>
  );
}

/** Rapor kinerja milik mitra (Portal Mitra). */
export function PartnerPerformancePanel() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("7d");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const days = PERIODS.find((p) => p.id === period)!.days;
    api<PerformanceReport>(`/api/partner/performance?${performanceQuery(days)}`)
      .then((data) => {
        if (alive) {
          setReport(data);
          setError(null);
        }
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [period]);

  return (
    <section className={card} aria-labelledby="partner-perf-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="partner-perf-title" className="flex items-center gap-2 text-base font-bold text-white">
          <Gauge className="size-4 text-[#ff5a66]" aria-hidden /> Kinerja layanan
        </h2>
        <div className="flex gap-2" role="group" aria-label="Periode kinerja">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => {
                setReport(null);
                setPeriod(p.id);
              }}
              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${period === p.id ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        {error ? (
          <p role="alert" className="text-sm text-[#ffd0d4]">
            {error}
          </p>
        ) : report ? (
          <PerformanceBody report={report} />
        ) : (
          <Loader2 className="size-5 animate-spin text-[#b8b8bf]" aria-label="Memuat kinerja" />
        )}
      </div>
    </section>
  );
}
