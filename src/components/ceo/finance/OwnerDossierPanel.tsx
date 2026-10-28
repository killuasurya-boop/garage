"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileText, RefreshCw, ShieldAlert } from "lucide-react";

import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import type { CashLedgerReport } from "@/lib/cash-ledger-report";
import type { DailyDossier, MonthlyLedger } from "@/lib/owner-reports-build";
import { RISK_DISPOSITION_LABEL, type RiskDisposition } from "@/lib/risk-rules";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const money = (value: number | null | undefined) => (value === null || value === undefined ? "-" : idr.format(value));
const signed = (value: number | null) => (value === null ? "-" : value === 0 ? idr.format(0) : `${value > 0 ? "+" : ""}${idr.format(value)}`);
const pct = (value: number | null) => (value === null ? "-" : `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`);

const FINAL_LABEL: Record<string, string> = {
  pending: "Menunggu final",
  approved: "Final",
  approved_with_exception: "Final + pengecualian",
  returned: "Dikembalikan",
  legacy: "Sebelum B4",
};
const CASE_STATUS_LABEL: Record<string, string> = { open: "Terbuka", investigating: "Diperiksa", resolved: "Diputuskan", dismissed: "Ditutup" };
const finalTone = (status: string) => (status === "approved" ? "success" : status === "approved_with_exception" ? "amber" : status === "returned" ? "red" : "muted");
const statusTone = (status: DailyDossier["status"]) => (status === "final" ? "success" : status === "returned" ? "red" : status === "empty" ? "muted" : "amber");
const levelTone = (level: number) => (level >= 4 ? "red" : level === 3 ? "amber" : "chrome");

function jakartaToday() {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json.data;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" }) {
  const color = tone === "red" ? "text-[#ffb1b1]" : tone === "amber" ? "text-[#ffd8a8]" : "text-zinc-50";
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
      <p className="text-[11px] font-semibold uppercase text-zinc-300">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-white/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-black uppercase text-zinc-100 hover:bg-white/5"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {title}
      </button>
      {open ? <div className="border-t border-white/10 p-3">{children}</div> : null}
    </div>
  );
}

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-zinc-300";
const td = "px-2 py-1.5 text-xs text-zinc-100";
const tdNum = `${td} whitespace-nowrap text-right font-mono`;

/**
 * B7b — Owner Approval 360 (PRD §13.5): satu tanggal operasional, semua shift, custody,
 * penjelasan selisih, risiko, timeline, kasus & konteks bulan berjalan + PDF resmi §20.2.
 * Keputusan final per shift tetap di Riwayat Shift (kartu Final Owner + 2FA).
 */
export function OwnerDossierPanel() {
  const [date, setDate] = useState(jakartaToday);
  const [data, setData] = useState<DailyDossier | null>(null);
  const [month, setMonth] = useState<MonthlyLedger | null>(null);
  const [ledger, setLedger] = useState<CashLedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [daily, monthly, cash] = await Promise.all([
        api<DailyDossier>(`/api/reports/owner-official?type=closing&date=${date}`),
        api<MonthlyLedger>(`/api/reports/owner-official?type=monthly&month=${date.slice(0, 7)}`),
        api<CashLedgerReport>(`/api/reports/owner-official?type=ledger&month=${date.slice(0, 7)}`),
      ]);
      setData(daily);
      setMonth(monthly);
      setLedger(cash);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat Owner 360");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const inputClass = "rounded-lg border border-white/15 bg-[var(--garage-bg-3)] px-2 py-1.5 text-sm text-zinc-100";
  const pdfButton =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_16%,transparent)] px-3 text-xs font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_26%,transparent)]";

  return (
    <Panel title="Owner 360 · Closing Harian" subtitle="Berapa uang seharusnya ada, berapa fisiknya, apa sebab selisih, siapa memegang uang, dan apa keputusan finalnya.">
      <div className="space-y-4" data-testid="owner-dossier">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-zinc-300">
            Tanggal operasional
            <input type="date" value={date} max={jakartaToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[var(--garage-bg-3)] px-3 text-xs font-semibold uppercase text-zinc-100 hover:bg-white/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Segarkan
          </button>
          <a href={`/api/reports/owner-official?type=closing&date=${date}&format=pdf`} className={pdfButton} data-testid="owner-dossier-pdf-closing">
            <Download className="h-3.5 w-3.5" /> PDF Closing harian
          </a>
          <a href={`/api/reports/owner-official?type=monthly&month=${date.slice(0, 7)}&format=pdf`} className={pdfButton} data-testid="owner-dossier-pdf-monthly">
            <Download className="h-3.5 w-3.5" /> PDF Audit bulanan
          </a>
        </div>

        {error ? (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3 text-xs text-[#ffb1b1]">{error}</div>
        ) : null}

        {data ? (
          <>
            {/* P0 Executive Decision Strip */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
              <Badge tone={statusTone(data.status)}>{data.statusLabel}</Badge>
              <span className="text-xs text-zinc-300">
                {data.strip.shiftCount} shift · masuk {money(data.strip.moneyIn)} · keluar {money(data.strip.moneyOut)} · data lengkap {data.completeness.done}/{data.completeness.total}
              </span>
              <span className="ml-auto font-mono text-[11px] text-zinc-400">{data.meta.reportId}</span>
              {data.strip.topExceptions.length ? (
                <ul className="w-full space-y-0.5 pt-1">
                  {data.strip.topExceptions.map((item, index) => (
                    <li key={index} className="text-xs text-[#ffd8a8]">
                      {item.shiftCode} ({item.cashierName ?? "-"}): {item.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* P0 Decision Summary */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Kas seharusnya" value={money(data.summary.expected)} />
              <Stat label="Kas fisik (sah)" value={money(data.summary.actual)} />
              <Stat label="Kurang (tidak dinetkan)" value={money(data.summary.shortage)} tone={data.summary.shortage ? "red" : undefined} />
              <Stat label="Lebih (tetap pengecualian)" value={money(data.summary.surplus)} tone={data.summary.surplus ? "amber" : undefined} />
              <Stat label="Penjualan bersih" value={money(data.summary.netSales)} />
              <Stat label="QRIS tercatat" value={`${money(data.summary.qris)}${data.summary.qrisUnchecked ? ` · ${data.summary.qrisUnchecked} belum dicocokkan` : ""}`} tone={data.summary.qrisUnchecked ? "amber" : undefined} />
              <Stat label="Setoran belum dikonfirmasi" value={money(data.summary.depositPending)} tone={data.summary.depositPending ? "amber" : undefined} />
              <Stat label="Alert / kasus terbuka" value={`${data.summary.openAlerts} / ${data.summary.openCases}`} tone={data.summary.openAlerts || data.summary.openCases ? "amber" : undefined} />
            </div>

            {/* P0 Custody Map */}
            <Section title="Peta penguasaan uang">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className={th}>Posisi</th>
                      <th className={`${th} text-right`}>Nilai</th>
                      <th className={th}>Pemegang</th>
                      <th className={th}>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.custody.map((row) => (
                      <tr key={row.key} className="border-t border-white/5">
                        <td className={td}>{row.label}</td>
                        <td className={tdNum}>{money(row.amount)}</td>
                        <td className={td}>{row.holder}</td>
                        <td className={`${td} text-zinc-300`}>
                          {row.note}
                          {row.verified ? "" : " · belum terverifikasi"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* P0 Variance Explanation */}
            <Section title="Shift & penjelasan selisih">
              {data.shifts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px]">
                    <thead>
                      <tr>
                        <th className={th}>Shift</th>
                        <th className={th}>Kasir</th>
                        <th className={`${th} text-right`}>Seharusnya</th>
                        <th className={`${th} text-right`}>Hitungan #1 / #2 / #3</th>
                        <th className={`${th} text-right`}>Sah</th>
                        <th className={`${th} text-right`}>Selisih</th>
                        <th className={`${th} text-right`}>Pemeriksa</th>
                        <th className={th}>Final Owner</th>
                        <th className={th}>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shifts.map((shift) => (
                        <tr key={shift.id} className="border-t border-white/5 align-top">
                          <td className={`${td} min-w-[190px]`}>
                            <span className="font-mono">{shift.code}</span>
                            {shift.exceptions.length ? <p className="mt-0.5 text-[11px] text-[#ffd8a8]">{shift.exceptions.join(" · ")}</p> : null}
                          </td>
                          <td className={td}>{shift.cashierName ?? "-"}</td>
                          <td className={tdNum}>{money(shift.expected)}</td>
                          <td className={tdNum}>
                            {money(shift.count1)} / {money(shift.count2)}{shift.count3 === null ? "" : ` / ${money(shift.count3)}`}
                          </td>
                          <td className={tdNum}>{money(shift.actual)}</td>
                          <td className={`${tdNum} ${shift.variance ? (shift.variance < 0 ? "text-[#ffb1b1]" : "text-[#ffd8a8]") : ""}`}>{signed(shift.variance)}</td>
                          <td className={tdNum}>{shift.recountCash === null ? "-" : money(shift.recountCash)}</td>
                          <td className={td}>
                            <Badge tone={finalTone(shift.finalStatus)}>{FINAL_LABEL[shift.finalStatus] ?? shift.finalStatus}</Badge>
                          </td>
                          <td className={td}>
                            <a href={`/api/reports/cashier-accountability?sessionId=${shift.id}`} className="inline-flex items-center gap-1 text-[#ffd8a8] hover:underline">
                              <FileText className="h-3.5 w-3.5" /> Shift
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Tidak ada shift di tanggal ini.</p>
              )}
              <p className="mt-2 text-xs text-zinc-400">
                Keputusan final per shift (Setujui · Setujui dengan pengecualian · Kembalikan, dengan kode 2FA) ada di{" "}
                <a href="/shift" className="text-[#ffd8a8] hover:underline">
                  Riwayat Shift
                </a>
                . Final closing mengesahkan catatan — bukan keputusan kasus & bukan potongan gaji.
              </p>
            </Section>

            {/* P1 Risk + Cases */}
            <Section title={`Alert risiko & kasus (${data.alerts.length} / ${data.cases.length})`} defaultOpen={data.alerts.length > 0}>
              <p className="mb-2 flex items-center gap-1.5 text-xs text-zinc-400">
                <ShieldAlert className="h-3.5 w-3.5" /> Tingkat risiko = prioritas pemeriksaan, bukan kesimpulan.
              </p>
              {data.alerts.length ? (
                <ul className="space-y-1.5">
                  {data.alerts.map((alert) => (
                    <li key={alert.id} className="rounded-md border border-white/10 p-2 text-xs text-zinc-100">
                      <Badge tone={levelTone(alert.riskLevel)}>LV{alert.riskLevel}</Badge> <span className="font-semibold">{alert.title}</span>
                      <span className="text-zinc-400"> · {alert.sessionCode ?? "-"} · {RISK_DISPOSITION_LABEL[alert.disposition as RiskDisposition] ?? alert.disposition}</span>
                      <p className="mt-0.5 text-zinc-300">{alert.explanation}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-400">Tidak ada alert untuk tanggal ini.</p>
              )}
              {data.cases.length ? (
                <ul className="mt-2 space-y-1">
                  {data.cases.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs text-zinc-100">
                      <Badge tone={c.status === "open" || c.status === "investigating" ? "amber" : "muted"}>{CASE_STATUS_LABEL[c.status] ?? c.status}</Badge>
                      {c.title}
                      <a href={`/api/reports/owner-official?type=case&caseId=${c.id}&format=pdf`} className="inline-flex items-center gap-1 text-[#ffd8a8] hover:underline">
                        <Download className="h-3.5 w-3.5" /> PDF kasus
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Section>

            {/* P1 Timeline */}
            <Section title={`Timeline (${data.timeline.length} peristiwa, WIB)`} defaultOpen={false}>
              <ol className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {data.timeline.map((event, index) => (
                  <li key={index} className="grid grid-cols-[96px_1fr_auto] gap-2 text-xs">
                    <span className="font-mono text-zinc-400">{dateTime.format(new Date(event.at))}</span>
                    <span className="text-zinc-100">
                      {event.label}
                      {event.by ? <span className="text-zinc-400"> · {event.by}</span> : null}
                    </span>
                    <span className="font-mono text-zinc-300">{event.amount === null ? "" : money(event.amount)}</span>
                  </li>
                ))}
              </ol>
            </Section>

            {/* P2 Monthly Context */}
            {month ? (
              <Section title={`Bulan berjalan · ${month.from} s/d ${month.to}`} defaultOpen={false}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Shift ditutup" value={String(month.totals.closedShifts)} />
                  <Stat label="Shift berselisih" value={`${month.totals.shiftsWithVariance} (${pct(month.totals.varianceFrequency)})`} tone={month.totals.shiftsWithVariance ? "amber" : undefined} />
                  <Stat label="Total kurang" value={money(month.totals.shortage)} tone={month.totals.shortage ? "red" : undefined} />
                  <Stat label="Total lebih" value={money(month.totals.surplus)} tone={month.totals.surplus ? "amber" : undefined} />
                  <Stat label="Rasio kurang / kas" value={pct(month.totals.shortageRate)} />
                  <Stat label="Kasus terbuka (akhir)" value={String(month.cases.closingBalance)} tone={month.cases.closingBalance ? "amber" : undefined} />
                  <Stat label="Hitungan #3 / darurat" value={`${month.totals.thirdCounts} / ${month.totals.emergencyCloses}`} />
                  <Stat label="Koreksi metode bayar" value={String(month.totals.tenderCorrections)} />
                </div>
                {month.cashiers.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[620px]">
                      <thead>
                        <tr>
                          <th className={th}>Kasir</th>
                          <th className={`${th} text-right`}>Shift</th>
                          <th className={`${th} text-right`}>Frekuensi selisih</th>
                          <th className={`${th} text-right`}>Kurang</th>
                          <th className={`${th} text-right`}>Lebih</th>
                          <th className={`${th} text-right`}>Rasio kurang</th>
                        </tr>
                      </thead>
                      <tbody>
                        {month.cashiers.map((row) => (
                          <tr key={row.name} className="border-t border-white/5">
                            <td className={td}>{row.name}</td>
                            <td className={tdNum}>{row.shifts}</td>
                            <td className={tdNum}>{pct(row.frequency)}</td>
                            <td className={tdNum}>{money(row.shortage)}</td>
                            <td className={tdNum}>{money(row.surplus)}</td>
                            <td className={tdNum}>{pct(row.shortageRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-zinc-400">Frekuensi & rasio dibandingkan terhadap shift dan kas kasir itu sendiri — bukan peringkat atau vonis.</p>
              </Section>
            ) : null}

            {/* F35/F38: arus kas Owner & buku kas rinci (semua akun, bulan berjalan) */}
            {ledger ? (
              <Section title={`Arus kas & buku kas · ${ledger.from} s/d ${ledger.to}`} defaultOpen={false}>
                <div className="mb-2 flex flex-wrap gap-2">
                  <a href={`/api/reports/owner-official?type=ledger&month=${date.slice(0, 7)}&format=pdf`} className={pdfButton} data-testid="owner-dossier-pdf-ledger">
                    <Download className="h-3.5 w-3.5" /> PDF Buku kas
                  </a>
                  <a href={`/api/reports/owner-official?type=ledger&month=${date.slice(0, 7)}&format=xlsx`} className={pdfButton} data-testid="owner-dossier-xlsx-ledger">
                    <Download className="h-3.5 w-3.5" /> Excel Buku kas
                  </a>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px]">
                    <thead>
                      <tr>
                        <th className={th}>Akun</th>
                        <th className={`${th} text-right`}>Saldo awal</th>
                        <th className={`${th} text-right`}>Masuk</th>
                        <th className={`${th} text-right`}>Keluar</th>
                        <th className={`${th} text-right`}>Saldo akhir</th>
                        <th className={th}>Cek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.accounts.map((row) => (
                        <tr key={row.account} className="border-t border-white/5">
                          <td className={td}>{row.label}</td>
                          <td className={tdNum}>{money(row.opening)}</td>
                          <td className={tdNum}>{money(row.inflow)}</td>
                          <td className={tdNum}>{money(row.outflow)}</td>
                          <td className={tdNum}>{money(row.closing)}</td>
                          <td className={td}>
                            <Badge tone={row.reconciled ? "success" : "red"}>{row.reconciled ? "Cocok" : "Beda"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-zinc-300">
                  Saldo laci = kas seharusnya menurut buku kas (bukan hitungan fisik — selisih fisik ada di tabel shift di atas). Arus dengan pihak luar (non-laci):{" "}
                  {ledger.external.bySource.length
                    ? ledger.external.bySource.map((row) => `${row.label} ${row.inflow ? `+${money(row.inflow)}` : ""}${row.outflow ? ` −${money(row.outflow)}` : ""}`).join(" · ")
                    : "tidak ada"}
                  . {ledger.totals.entries} baris buku kas, {ledger.totals.reversals} pembalik.
                </p>
              </Section>
            ) : null}

            <Section title="Data yang belum tercatat" defaultOpen={false}>
              <ul className="space-y-1">
                {data.unavailable.map((item) => (
                  <li key={item.key} className="text-xs text-zinc-300">
                    <span className="font-semibold text-zinc-100">{item.label}:</span> {item.reason}
                  </li>
                ))}
              </ul>
            </Section>
          </>
        ) : loading ? (
          <p className="text-sm text-zinc-400">Memuat Owner 360…</p>
        ) : null}
      </div>
    </Panel>
  );
}
