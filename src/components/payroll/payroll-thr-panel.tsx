"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { Gift, Undo2, X } from "lucide-react";

import type { ThrRow } from "@/lib/garage-payroll-thr";

// THR per hari raya: hitung otomatis dari masa kerja, bayar per karyawan,
// tercatat ke Finance (≥ batas approval → Approvals), bisa dibatalkan.

type History = {
  id: string;
  name: string;
  code: string | null;
  holidayName: string;
  holidayDate: string;
  monthsWorked: number;
  amount: number;
  method: string;
  status: string;
  cancelReason: string | null;
  expenseStatus: string | null;
  createdAt: string;
};
type Data = { rows: ThrRow[]; history: History[] };
type Method = "Cash" | "Transfer";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal.");
  return json.data as T;
}

const rupiah = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
const dateLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
const tenure = (months: number) =>
  months >= 12 ? `${Math.floor(months / 12)} th ${months % 12} bln` : `${months} bln`;

const card = "rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-2)] p-4";
const label = "text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const input =
  "w-full min-h-11 rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-3 text-base text-[var(--garage-fg)] placeholder:text-[var(--garage-mute)] [color-scheme:dark]";
const btnGhost =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)] disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60";
const alertBox =
  "rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white";
const th = "px-3 py-2 text-left text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const badge = "inline-block rounded-md px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide";

function expenseNote(status: string): string {
  if (status.startsWith("gagal")) return " Pencatatan ke Finance gagal — catat manual di Finance.";
  if (status === "pending_approval") return " Menunggu persetujuan Owner di Approvals — serahkan uang setelah disetujui.";
  return " Tercatat di Finance.";
}

export function PayrollThrPanel() {
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [shown, setShown] = useState<{ name: string; date: string } | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ code: string; method: Method } | null>(null);
  const [cancel, setCancel] = useState<{ id: string; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (date: string | null) => {
    setLoading(true);
    try {
      setData(await api<Data>(`/api/payroll/thr${date ? `?holidayDate=${date}` : ""}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(null);
  }, [load]);

  const show = (e: FormEvent) => {
    e.preventDefault();
    if (holidayName.trim().length < 3) return setError("Isi nama hari raya, mis. Idul Fitri 2027.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) return setError("Pilih tanggal hari raya.");
    setConfirm(null);
    setShown({ name: holidayName.trim(), date: holidayDate });
    void load(holidayDate);
  };

  const pay = async (row: ThrRow) => {
    if (!confirm || !shown) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api<{ name: string; amount: number; expenseStatus: string }>("/api/payroll/thr", {
        method: "POST",
        body: JSON.stringify({ code: row.code, holidayName: shown.name, holidayDate: shown.date, method: confirm.method }),
      });
      setNotice(`THR ${res.name} ${rupiah(res.amount)} dibayar.${expenseNote(res.expenseStatus)}`);
      setConfirm(null);
      await load(shown.date);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submitCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!cancel) return;
    if (cancel.reason.trim().length < 3) return setFormError("Tulis alasan pembatalan.");
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/payroll/thr/${cancel.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancel.reason.trim() }),
      });
      setNotice("THR dibatalkan — pengeluaran Finance-nya ikut dibatalkan.");
      setCancel(null);
      await load(shown?.date ?? null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const rows = data?.rows ?? [];
  const unpaidTotal = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);
  const paidTotal = rows.reduce((s, r) => s + (r.paid?.amount ?? 0), 0);
  const estimated = rows.filter((r) => r.joinEstimated).length;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--garage-fg)]">THR</h1>
        <p className="text-base text-[var(--garage-dim)]">
          Masa kerja ≥ 12 bulan = 1× gaji bulanan · 1–12 bulan = proporsional (bulan/12) · di bawah 1 bulan belum berhak.
        </p>
      </div>

      <form onSubmit={show} className={`${card} flex flex-wrap items-end gap-3`} noValidate>
        <label className="block min-w-[200px] flex-1 space-y-1">
          <span className={label}>Nama hari raya</span>
          <input
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            maxLength={60}
            placeholder="mis. Idul Fitri 2027"
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>Tanggal hari raya</span>
          <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className={input} />
        </label>
        <button type="submit" className={btnPrimary}>
          <Gift className="size-4" aria-hidden />
          Hitung THR
        </button>
      </form>

      {error && <p role="alert" className={alertBox}>{error}</p>}
      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-[var(--garage-amber)] bg-[var(--garage-bg-3)] px-4 py-3 text-base text-[var(--garage-fg)]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Tutup pesan" className="min-h-11 min-w-11 cursor-pointer">
            <X className="mx-auto size-4" aria-hidden />
          </button>
        </div>
      )}

      {shown && data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className={card}>
              <div className={label}>Hari raya</div>
              <div className="mt-1 break-words text-lg font-bold text-[var(--garage-fg)]">{shown.name}</div>
              <div className="text-sm text-[var(--garage-dim)]">{dateLabel(shown.date)}</div>
            </div>
            <div className={card}>
              <div className={label}>Belum dibayar</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-[var(--garage-amber)]">{rupiah(unpaidTotal)}</div>
            </div>
            <div className={card}>
              <div className={label}>Sudah dibayar</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-[var(--garage-fg)]">{rupiah(paidTotal)}</div>
            </div>
          </div>

          {estimated > 0 && (
            <p role="status" className="rounded-xl border border-[var(--garage-amber)] bg-[var(--garage-bg-3)] px-4 py-3 text-base text-[var(--garage-fg)]">
              {estimated} karyawan belum punya <strong>tanggal mulai kerja</strong> — masa kerjanya dihitung dari tanggal
              akun absen dibuat (bisa lebih pendek dari sebenarnya). Owner bisa mengisinya di Karyawan Absen.
            </p>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-1)]">
            <table className="w-full min-w-[760px]">
              <thead className="bg-[var(--garage-bg-2)]">
                <tr>
                  <th className={th}>Karyawan</th>
                  <th className={th}>Masa kerja</th>
                  <th className={`${th} text-right`}>Gaji bulanan</th>
                  <th className={`${th} text-right`}>THR</th>
                  <th className={`${th} text-right`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = confirm?.code === r.code;
                  return (
                    <Fragment key={r.code}>
                      <tr className="border-t border-[var(--garage-line)]">
                        <td className="px-3 py-3 text-base">
                          <div className="font-semibold text-[var(--garage-fg)]">{r.name}</div>
                          <div className="text-sm text-[var(--garage-dim)]">
                            {r.code} · mulai {dateLabel(r.joinDate)}
                            {r.joinEstimated && <span className="text-[var(--garage-amber)]"> (perkiraan)</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-base tabular-nums text-[var(--garage-fg)]">{tenure(r.monthsWorked)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-base tabular-nums text-[var(--garage-fg)]">
                          {rupiah(r.monthlySalary)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-base font-semibold tabular-nums text-[var(--garage-fg)]">
                          {r.amount ? rupiah(r.amount) : "Belum berhak"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {r.paid ? (
                            <span className="flex flex-col items-end gap-1 text-sm text-[var(--garage-dim)]">
                              <span className={`${badge} bg-[var(--garage-bg-3)] text-[var(--garage-fg)]`}>Dibayar</span>
                              {r.paid.expenseStatus === "pending_approval" && (
                                <span className={`${badge} bg-[var(--garage-amber)] text-black`}>Menunggu Approvals</span>
                              )}
                            </span>
                          ) : r.amount > 0 && !open ? (
                            <button
                              type="button"
                              onClick={() => {
                                setFormError(null);
                                setCancel(null);
                                setConfirm({ code: r.code, method: "Cash" });
                              }}
                              className={`${btnPrimary} ml-auto`}
                            >
                              Bayar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {open && confirm && (
                        <tr className="border-t border-[var(--garage-line)] bg-[var(--garage-bg-0)]">
                          <td colSpan={5} className="p-3">
                            <div className="space-y-3 rounded-xl border border-[var(--garage-amber)] p-3">
                              <p className="text-base text-[var(--garage-fg)]">
                                Bayar THR <strong>{r.name}</strong> untuk {shown.name}:{" "}
                                {r.monthsWorked >= 12
                                  ? `masa kerja ≥ 12 bulan → 1 × ${rupiah(r.monthlySalary)}`
                                  : `${r.monthsWorked}/12 × ${rupiah(r.monthlySalary)}`}{" "}
                                = <strong>{rupiah(r.amount)}</strong>.
                              </p>
                              <label className="block max-w-xs space-y-1">
                                <span className={label}>Metode</span>
                                <select
                                  value={confirm.method}
                                  onChange={(e) => setConfirm({ ...confirm, method: e.target.value as Method })}
                                  className={`${input} cursor-pointer`}
                                >
                                  <option value="Cash">Tunai (laci kas)</option>
                                  <option value="Transfer">Transfer</option>
                                </select>
                              </label>
                              {formError && <p role="alert" className={alertBox}>{formError}</p>}
                              <div className="flex flex-wrap justify-end gap-2">
                                <button type="button" onClick={() => setConfirm(null)} className={btnGhost} disabled={saving}>
                                  Batal
                                </button>
                                <button type="button" onClick={() => void pay(r)} className={btnPrimary} disabled={saving}>
                                  {saving ? "Memproses…" : `Ya, bayar ${rupiah(r.amount)}`}
                                </button>
                              </div>
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
        </>
      )}

      {loading && !data && <p className="text-base text-[var(--garage-dim)]">Memuat…</p>}

      {data && (
        <section className={`${card} space-y-2`}>
          <h2 className={label}>Riwayat THR</h2>
          {data.history.length === 0 ? (
            <p className="text-base text-[var(--garage-dim)]">Belum ada THR dibayar.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-[var(--garage-line)] overflow-y-auto">
              {data.history.map((h) => {
                const cancelled = h.status === "cancelled";
                return (
                  <li key={h.id} className="py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base text-[var(--garage-fg)]">
                          <strong>{h.name}</strong> · {h.holidayName}{" "}
                          {cancelled ? (
                            <span className={`${badge} bg-[var(--garage-bg-3)] text-[var(--garage-dim)]`}>Dibatalkan</span>
                          ) : h.expenseStatus === "pending_approval" ? (
                            <span className={`${badge} bg-[var(--garage-amber)] text-black`}>Menunggu Approvals</span>
                          ) : null}
                        </div>
                        <div className="text-sm text-[var(--garage-dim)]">
                          {dateLabel(h.holidayDate)} · masa kerja {tenure(h.monthsWorked)} ·{" "}
                          {h.method === "Cash" ? "Tunai" : "Transfer"}
                          {cancelled && h.cancelReason ? ` · ${h.cancelReason}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <span
                          className={`text-base font-semibold tabular-nums ${
                            cancelled ? "text-[var(--garage-dim)] line-through" : "text-[var(--garage-fg)]"
                          }`}
                        >
                          {rupiah(h.amount)}
                        </span>
                        {!cancelled && cancel?.id !== h.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormError(null);
                              setConfirm(null);
                              setCancel({ id: h.id, reason: "" });
                            }}
                            className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--garage-dim)] hover:text-[var(--garage-red-bright)]"
                          >
                            <Undo2 className="size-4" aria-hidden />
                            Batalkan
                          </button>
                        )}
                      </div>
                    </div>
                    {cancel?.id === h.id && (
                      <form onSubmit={submitCancel} className="mt-2 space-y-2 rounded-xl border border-[var(--garage-red-bright)] p-3" noValidate>
                        <label className="block space-y-1">
                          <span className={label}>Alasan pembatalan</span>
                          <input
                            value={cancel.reason}
                            onChange={(e) => setCancel({ ...cancel, reason: e.target.value })}
                            maxLength={200}
                            placeholder="mis. salah nominal"
                            className={input}
                            autoFocus
                          />
                        </label>
                        {formError && <p role="alert" className={alertBox}>{formError}</p>}
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => setCancel(null)} className={btnGhost} disabled={saving}>
                            Kembali
                          </button>
                          <button type="submit" className={btnPrimary} disabled={saving}>
                            {saving ? "Memproses…" : "Ya, batalkan"}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
