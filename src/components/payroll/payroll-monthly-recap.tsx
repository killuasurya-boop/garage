"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Printer, RefreshCw } from "lucide-react";

import type { MonthlyRecap, RecapDayStatus, RecapEmployee } from "@/lib/garage-payroll-report";

const rupiah = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : "—";

const dayLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

const STATUS: Record<RecapDayStatus, { label: string; tone: string }> = {
  hadir: { label: "Hadir", tone: "text-[var(--garage-fg)]" },
  telat: { label: "Telat", tone: "text-[var(--garage-amber)]" },
  hangus: { label: "Hangus (telat)", tone: "text-[var(--garage-red-bright)]" },
  tidak_valid: { label: "Tidak valid", tone: "text-[var(--garage-red-bright)]" },
  tidak_hadir: { label: "Tidak hadir", tone: "text-[var(--garage-red-bright)]" },
  berjalan: { label: "Sedang shift", tone: "text-[var(--garage-amber)]" },
  belum_absen: { label: "Belum absen", tone: "text-[var(--garage-dim)]" },
  libur: { label: "Toko tutup", tone: "text-[var(--garage-dim)]" },
  akan_datang: { label: "—", tone: "text-[var(--garage-mute)]" },
  belum_terdaftar: { label: "Belum terdaftar", tone: "text-[var(--garage-mute)]" },
  izin: { label: "Izin", tone: "text-[var(--garage-dim)]" },
  sakit: { label: "Sakit", tone: "text-[var(--garage-dim)]" },
  cuti: { label: "Cuti", tone: "text-[var(--garage-dim)]" },
};

const BONUS_TONE: Record<RecapEmployee["bonus"]["status"], string> = {
  dapat: "text-[var(--garage-fg)]",
  berpeluang: "text-[var(--garage-amber)]",
  gugur: "text-[var(--garage-red-bright)]",
  nonaktif: "text-[var(--garage-dim)]",
};

function currentMonth() {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" })
    .slice(0, 7);
}

const card = "rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-2)] p-4";
const th = "px-3 py-2 text-left text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const td = "px-3 py-3 text-base";

export function PayrollMonthlyRecap() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<MonthlyRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/reports/monthly?month=${m}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat rekap.");
      setData(json.data as MonthlyRecap);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(month);
  }, [load, month]);

  const kpis = data
    ? [
        { label: "Total gaji", value: data.totals.gaji, tone: "text-[var(--garage-fg)]" },
        { label: "Total fee", value: data.totals.fee, tone: "text-[var(--garage-amber)]" },
        { label: "Lembur", value: data.totals.overtime, tone: "text-[var(--garage-fg)]" },
        { label: "Bonus kehadiran", value: data.totals.bonus, tone: "text-[var(--garage-fg)]" },
        { label: "Total gaji + fee", value: data.totals.total, tone: "text-[var(--garage-fg)]" },
      ]
    : [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--garage-fg)]">Rekap bulanan karyawan</h2>
          <p className="text-base text-[var(--garage-dim)]">
            Absen, telat, lembur, fee, dan bonus per karyawan. Klik baris untuk rincian harian.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-base text-[var(--garage-dim)]">
            Bulan
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="min-h-11 rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-3 text-base text-[var(--garage-fg)] [color-scheme:dark]"
            />
          </label>
          <button
            type="button"
            onClick={() => window.open(`/api/payroll/payslips?month=${month}`, "_blank", "noopener")}
            disabled={!data || data.employees.length === 0}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Printer className="size-4" aria-hidden />
            Cetak semua slip
          </button>
          <button
            type="button"
            onClick={() => void load(month)}
            disabled={loading}
            aria-label="Muat ulang rekap"
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--garage-line-2)] text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white"
        >
          {error}
        </p>
      )}

      {loading && !data && <p className="text-base text-[var(--garage-dim)]">Memuat rekap…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className={card}>
                <div className="text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]">
                  {k.label}
                </div>
                <div className={`mt-1 break-words text-xl font-bold tabular-nums ${k.tone}`}>
                  {rupiah(k.value)}
                </div>
              </div>
            ))}
            <div className={card}>
              <div className="text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]">
                Produk terjual
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-[var(--garage-fg)]">
                {new Intl.NumberFormat("id-ID").format(data.totals.productsSold)}
              </div>
            </div>
          </div>

          {data.employees.length === 0 ? (
            <p className={`${card} text-base text-[var(--garage-dim)]`}>
              Belum ada karyawan payroll. Jalankan <code>npm run payroll:seed</code>.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-1)]">
              <table className="w-full min-w-[1080px]">
                <thead className="bg-[var(--garage-bg-2)]">
                  <tr>
                    <th className={`${th} min-w-[280px]`}>Karyawan</th>
                    <th className={`${th} text-right`}>Hadir</th>
                    <th className={`${th} text-right`}>Telat</th>
                    <th className={`${th} text-right`}>Hangus</th>
                    <th className={`${th} text-right`}>Tidak hadir</th>
                    <th className={th}>Bonus</th>
                    <th className={`${th} text-right`}>Lembur</th>
                    <th className={`${th} text-right`}>Gaji</th>
                    <th className={`${th} text-right`}>Fee</th>
                    <th className={`${th} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((e) => {
                    const isOpen = open === e.staffUserId;
                    return (
                      <Fragment key={e.staffUserId}>
                        <tr
                          onClick={() => setOpen(isOpen ? null : e.staffUserId)}
                          className="cursor-pointer border-t border-[var(--garage-line)] transition-colors hover:bg-[var(--garage-bg-2)]"
                          aria-expanded={isOpen}
                        >
                          <td className={td}>
                            <div className="flex items-start gap-2">
                              {isOpen ? (
                                <ChevronDown className="mt-1 size-4 shrink-0 text-[var(--garage-dim)]" aria-hidden />
                              ) : (
                                <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--garage-dim)]" aria-hidden />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-[var(--garage-fg)]">{e.name}</div>
                                <div className="text-sm text-[var(--garage-dim)]">
                                  {e.code ?? "—"} · {e.position ?? "Karyawan"} · masuk {e.shiftStart}
                                  {e.excludeFromFee ? " · tanpa fee" : ""}
                                  {e.active ? "" : " · nonaktif"}
                                </div>
                              </div>
                              {e.code && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    window.open(
                                      `/api/payroll/payslips?month=${month}&code=${encodeURIComponent(e.code!)}`,
                                      "_blank",
                                      "noopener",
                                    );
                                  }}
                                  className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)]"
                                  aria-label={`Slip gaji ${e.name}`}
                                >
                                  <FileText className="size-4" aria-hidden />
                                  Slip
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums text-[var(--garage-fg)]`}>
                            {e.summary.presentDays}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                            <span className={e.summary.lateDays ? "text-[var(--garage-amber)]" : "text-[var(--garage-fg)]"}>
                              {e.summary.lateDays}
                            </span>
                            {e.summary.lateMinutes > 0 && (
                              <div className="text-sm text-[var(--garage-dim)]">{e.summary.lateMinutes} mnt</div>
                            )}
                          </td>
                          <td
                            className={`${td} whitespace-nowrap text-right tabular-nums ${e.summary.forfeitedDays ? "text-[var(--garage-red-bright)]" : "text-[var(--garage-fg)]"}`}
                          >
                            {e.summary.forfeitedDays}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                            <span
                              className={
                                e.summary.absentDays > data.rules.allowedOffDays
                                  ? "text-[var(--garage-red-bright)]"
                                  : "text-[var(--garage-fg)]"
                              }
                            >
                              {e.summary.absentDays}
                            </span>
                            <span className="text-sm text-[var(--garage-dim)]"> / jatah {data.rules.allowedOffDays}</span>
                            {e.summary.leaveDays > 0 && (
                              <div className="text-sm text-[var(--garage-dim)]">izin {e.summary.leaveDays} hari</div>
                            )}
                          </td>
                          <td className={`${td} text-sm ${BONUS_TONE[e.bonus.status]}`}>{e.bonus.label}</td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums text-[var(--garage-fg)]`}>
                            {rupiah(e.summary.overtime)}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums text-[var(--garage-fg)]`}>
                            {rupiah(e.summary.gaji)}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums text-[var(--garage-amber)]`}>
                            {rupiah(e.summary.fee)}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums text-[var(--garage-fg)]`}>
                            {rupiah(e.summary.total)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-[var(--garage-line)] bg-[var(--garage-bg-0)]">
                            <td colSpan={10} className="p-3">
                              <div className="max-h-[420px] overflow-y-auto rounded-xl border border-[var(--garage-line)]">
                                <table className="w-full">
                                  <thead className="sticky top-0 bg-[var(--garage-bg-2)]">
                                    <tr>
                                      <th className={th}>Tanggal</th>
                                      <th className={th}>Status</th>
                                      <th className={th}>Masuk</th>
                                      <th className={th}>Keluar</th>
                                      <th className={`${th} text-right`}>Telat</th>
                                      <th className={`${th} text-right`}>Lembur</th>
                                      <th className={`${th} text-right`}>Gaji</th>
                                      <th className={`${th} text-right`}>Fee</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {e.days
                                      .filter((d) => d.status !== "akan_datang")
                                      .map((d) => (
                                        <tr key={d.date} className="border-t border-[var(--garage-line)]">
                                          <td className="whitespace-nowrap px-3 py-2 text-base text-[var(--garage-fg)]">{dayLabel(d.date)}</td>
                                          <td className={`px-3 py-2 text-base ${STATUS[d.status].tone}`}>
                                            {STATUS[d.status].label}
                                          </td>
                                          <td className="px-3 py-2 text-base tabular-nums text-[var(--garage-fg)]">
                                            {clock(d.checkinAt)}
                                          </td>
                                          <td className="px-3 py-2 text-base tabular-nums text-[var(--garage-fg)]">
                                            {clock(d.checkoutAt)}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-right text-base tabular-nums text-[var(--garage-fg)]">
                                            {d.lateMinutes ? `${d.lateMinutes} mnt` : "—"}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-right text-base tabular-nums text-[var(--garage-fg)]">
                                            {d.overtimeMinutes ? `${d.overtimeMinutes} mnt` : "—"}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-right text-base tabular-nums text-[var(--garage-fg)]">
                                            {d.wage ? rupiah(d.wage) : "—"}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-right text-base tabular-nums text-[var(--garage-amber)]">
                                            {d.fee ? rupiah(d.fee) : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
