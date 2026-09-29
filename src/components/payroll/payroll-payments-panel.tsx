"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Banknote, DatabaseBackup, HandCoins, Undo2, X } from "lucide-react";

import type { PayableRow } from "@/lib/garage-payroll-payments";

// Gajian & kasbon untuk manajer. Bayar = tandai gaji+fee lunas, potong kasbon,
// catat pengeluaran ke Finance (≥ batas approval masuk Approvals). Salah input
// bisa dibatalkan; pengeluaran yang ditolak di Approvals membatalkan otomatis.

type Payment = {
  id: string;
  name: string;
  code: string | null;
  paidUntil: string;
  netPaid: number;
  advanceDeducted: number;
  method: string;
  status: string;
  cancelReason: string | null;
  expenseStatus: string | null;
  createdAt: string;
};
type Advance = {
  id: string;
  name: string;
  code: string | null;
  date: string;
  amount: number;
  settledAmount: number;
  method: string;
  note: string | null;
  status: string;
  cancelReason: string | null;
  expenseStatus: string | null;
};
type Data = {
  until: string;
  payables: PayableRow[];
  pendingDates: string[];
  payments: Payment[];
  advances: Advance[];
};
type Offsite = { ok: boolean; dir: string; file?: string; error?: string; at: string };
type Backup = { file: string; label: string; bytes: number; createdAt: string; offsite?: Offsite | null };
type Method = "Cash" | "Transfer";
type CancelTarget = { kind: "payment" | "advance"; id: string; reason: string };

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
const digits = (s: string) => s.replace(/\D/g, "");
const dateLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
const stampLabel = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
function yesterdayKey() {
  const d = new Date(`${todayKey()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function endOfLastMonthKey() {
  const [y, m] = todayKey().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

const card = "rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-2)] p-4";
const label = "text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const input =
  "w-full min-h-11 rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-3 text-base text-[var(--garage-fg)] placeholder:text-[var(--garage-mute)] [color-scheme:dark]";
const btnGhost =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)] disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60";
const btnSmall =
  "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--garage-dim)] transition-colors hover:text-[var(--garage-red-bright)]";
const alertBox =
  "rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white";
const th = "px-3 py-2 text-left text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const num = "px-3 py-3 whitespace-nowrap text-right text-base tabular-nums";
const badge = "inline-block rounded-md px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide";

function expenseNote(status: string | undefined): string {
  if (!status) return " Tidak ada uang keluar (seluruhnya dipotong kasbon).";
  if (status.startsWith("gagal")) return " Pencatatan ke Finance gagal — catat manual di Finance.";
  if (status === "pending_approval") return " Pengeluaran menunggu persetujuan Owner di Approvals — serahkan uang setelah disetujui.";
  return " Pengeluaran tercatat di Finance.";
}

function StatusBadge({ status, expenseStatus }: { status: string; expenseStatus: string | null }) {
  if (status === "cancelled") {
    return <span className={`${badge} bg-[var(--garage-bg-3)] text-[var(--garage-dim)]`}>Dibatalkan</span>;
  }
  if (expenseStatus === "pending_approval") {
    return <span className={`${badge} bg-[var(--garage-amber)] text-black`}>Menunggu Approvals</span>;
  }
  return null;
}

export function PayrollPaymentsPanel() {
  const [until, setUntil] = useState(endOfLastMonthKey);
  const [data, setData] = useState<Data | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [backupError, setBackupError] = useState(false);
  const [offsite, setOffsite] = useState<{ dir: string | null; last: Offsite | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ code: string; method: Method; note: string } | null>(null);
  const [advanceForm, setAdvanceForm] = useState<{ code: string; amount: string; method: Method; note: string } | null>(null);
  const [cancel, setCancel] = useState<CancelTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (u: string) => {
    setLoading(true);
    try {
      setData(await api<Data>(`/api/payroll/payments?until=${u}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      const res = await api<{ backups: Backup[]; offsite?: { dir: string | null; last: Offsite | null } }>(
        "/api/payroll/backup",
      );
      setBackups(res.backups);
      setOffsite(res.offsite ?? null);
      setBackupError(false);
    } catch {
      setBackupError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(until);
  }, [load, until]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBackups();
  }, [loadBackups]);

  const openForm = (next: "confirm" | "advance" | "cancel") => {
    setFormError(null);
    if (next !== "confirm") setConfirm(null);
    if (next !== "advance") setAdvanceForm(null);
    if (next !== "cancel") setCancel(null);
  };

  const pay = async (row: PayableRow) => {
    if (!confirm) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api<{
        name: string;
        netPaid: number;
        advanceDeducted: number;
        expenses: Array<{ amount: number; status: string }>;
      }>("/api/payroll/payments", {
        method: "POST",
        body: JSON.stringify({ code: row.code, until, method: confirm.method, note: confirm.note || null }),
      });
      setNotice(
        `Gaji ${res.name} s/d ${dateLabel(until)} dibayar ${rupiah(res.netPaid)}${
          res.advanceDeducted ? ` (sudah dipotong kasbon ${rupiah(res.advanceDeducted)})` : ""
        }.${expenseNote(res.expenses[0]?.status)}`,
      );
      setConfirm(null);
      await Promise.all([load(until), loadBackups()]);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submitAdvance = async (e: FormEvent) => {
    e.preventDefault();
    if (!advanceForm) return;
    const amount = Number(advanceForm.amount || 0);
    if (amount < 1_000) return setFormError("Isi nominal kasbon.");
    setSaving(true);
    setFormError(null);
    try {
      const res = await api<{ name: string; amount: number; expenseStatus: string }>("/api/payroll/advances", {
        method: "POST",
        body: JSON.stringify({ code: advanceForm.code, amount, method: advanceForm.method, note: advanceForm.note || null }),
      });
      setNotice(
        res.expenseStatus === "pending_approval"
          ? `Kasbon ${res.name} ${rupiah(res.amount)} menunggu persetujuan Owner di Approvals — serahkan uang setelah disetujui; baru dipotong gajian setelah disetujui.`
          : `Kasbon ${res.name} ${rupiah(res.amount)} tercatat — dipotong otomatis saat gajian.${expenseNote(res.expenseStatus)}`,
      );
      setAdvanceForm(null);
      await load(until);
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
      const path = cancel.kind === "payment" ? "payments" : "advances";
      await api(`/api/payroll/${path}/${cancel.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancel.reason.trim() }),
      });
      setNotice(
        cancel.kind === "payment"
          ? "Gajian dibatalkan — gaji & fee kembali belum dibayar, potongan kasbon dikembalikan, pengeluaran Finance dibatalkan."
          : "Kasbon dibatalkan — pengeluaran Finance-nya ikut dibatalkan.",
      );
      setCancel(null);
      await load(until);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const backupNow = async () => {
    setSaving(true);
    try {
      const b = await api<Backup>("/api/payroll/backup", { method: "POST" });
      const copy = b.offsite
        ? b.offsite.ok
          ? ` Salinan juga ke ${b.offsite.dir}.`
          : ` Salinan ke ${b.offsite.dir} GAGAL: ${b.offsite.error}`
        : " (Belum ada folder salinan di luar laptop — atur di Pengaturan → Salinan Backup.)";
      setNotice(`Backup tersimpan: ${b.file} (${(b.bytes / 1024 / 1024).toFixed(1)} MB).${copy}`);
      await loadBackups();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const rows = data?.payables ?? [];
  const payableRows = rows.filter((r) => r.gaji + r.fee > 0);
  const totals = rows.reduce(
    (t, r) => ({ gaji: t.gaji + r.gaji, fee: t.fee + r.fee, deduction: t.deduction + r.deduction, net: t.net + r.net }),
    { gaji: 0, fee: 0, deduction: 0, net: 0 },
  );
  const pendingDates = data?.pendingDates ?? [];
  const lastBackup = backups?.[0];

  const cancelForm = (kind: CancelTarget["kind"], id: string) =>
    cancel?.kind === kind && cancel.id === id ? (
      <form onSubmit={submitCancel} className="mt-2 space-y-2 rounded-xl border border-[var(--garage-red-bright)] p-3" noValidate>
        <label className="block space-y-1">
          <span className={label}>Alasan pembatalan</span>
          <input
            value={cancel.reason}
            onChange={(e) => setCancel({ ...cancel, reason: e.target.value })}
            maxLength={200}
            placeholder="mis. salah pilih karyawan"
            className={input}
            autoFocus
          />
        </label>
        {formError && <p role="alert" className={alertBox}>{formError}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setCancel(null)} className={btnGhost} disabled={saving}>Kembali</button>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? "Memproses…" : "Ya, batalkan"}</button>
        </div>
      </form>
    ) : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Gajian</h1>
          <p className="text-base text-[var(--garage-dim)]">
            Bayar gaji + fee yang belum dibayar; kasbon dipotong otomatis dan tercatat ke Finance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            openForm("advance");
            setAdvanceForm({ code: rows[0]?.code ?? "", amount: "", method: "Cash", note: "" });
          }}
          className={btnGhost}
          disabled={rows.length === 0}
        >
          <HandCoins className="size-4" aria-hidden />
          Beri kasbon
        </button>
      </div>

      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="block space-y-1">
          <span className={label}>Bayar gaji sampai tanggal</span>
          <input
            type="date"
            value={until}
            max={todayKey()}
            onChange={(e) => e.target.value && setUntil(e.target.value)}
            className={input}
          />
        </label>
        <button type="button" onClick={() => setUntil(endOfLastMonthKey())} className={btnGhost}>
          Akhir bulan lalu
        </button>
        <button type="button" onClick={() => setUntil(yesterdayKey())} className={btnGhost}>
          Sampai kemarin
        </button>
      </div>

      {pendingDates.length > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-[var(--garage-amber)] bg-[var(--garage-bg-3)] px-4 py-3 text-base text-[var(--garage-fg)]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--garage-amber)]" aria-hidden />
          <span>
            {pendingDates.length} hari belum final ({pendingDates.slice(0, 4).map(dateLabel).join(", ")}
            {pendingDates.length > 4 ? ", …" : ""}): ada yang belum check-out atau fee/bonus hari itu belum dihitung
            (dihitung setelah jam 10:00 esok harinya). Bagian itu belum ikut dibayar dan akan masuk gajian berikutnya —
            cek <strong>Absen Hari Ini</strong> untuk koreksi.
          </span>
        </div>
      )}

      {error && <p role="alert" className={alertBox}>{error}</p>}
      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-[var(--garage-amber)] bg-[var(--garage-bg-3)] px-4 py-3 text-base text-[var(--garage-fg)]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Tutup pesan" className="min-h-11 min-w-11 cursor-pointer">
            <X className="mx-auto size-4" aria-hidden />
          </button>
        </div>
      )}

      {advanceForm && (
        <form onSubmit={submitAdvance} className={`${card} space-y-3 border-[var(--garage-amber)]`} noValidate>
          <h2 className="text-lg font-semibold text-[var(--garage-fg)]">Beri kasbon</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1">
              <span className={label}>Karyawan</span>
              <select value={advanceForm.code} onChange={(e) => setAdvanceForm({ ...advanceForm, code: e.target.value })} className={`${input} cursor-pointer`}>
                {rows.map((r) => (
                  <option key={r.code} value={r.code}>{`${r.name} (${r.code})`}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={label}>Nominal</span>
              <input
                value={advanceForm.amount ? new Intl.NumberFormat("id-ID").format(Number(advanceForm.amount)) : ""}
                onChange={(e) => setAdvanceForm({ ...advanceForm, amount: digits(e.target.value).slice(0, 8) })}
                inputMode="numeric"
                placeholder="mis. 200.000"
                className={`${input} tabular-nums`}
              />
            </label>
            <label className="block space-y-1">
              <span className={label}>Metode</span>
              <select value={advanceForm.method} onChange={(e) => setAdvanceForm({ ...advanceForm, method: e.target.value as Method })} className={`${input} cursor-pointer`}>
                <option value="Cash">Tunai (laci kas)</option>
                <option value="Transfer">Transfer</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className={label}>Catatan</span>
              <input value={advanceForm.note} onChange={(e) => setAdvanceForm({ ...advanceForm, note: e.target.value })} maxLength={200} placeholder="mis. keperluan keluarga" className={input} />
            </label>
          </div>
          {formError && <p role="alert" className={alertBox}>{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setAdvanceForm(null)} className={btnGhost} disabled={saving}>Batal</button>
            <button type="submit" className={btnPrimary} disabled={saving}>{saving ? "Menyimpan…" : "Catat kasbon"}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Gaji belum dibayar", v: totals.gaji, tone: "text-[var(--garage-fg)]" },
          { k: "Fee belum dibayar", v: totals.fee, tone: "text-[var(--garage-amber)]" },
          { k: "Kasbon dipotong", v: totals.deduction, tone: "text-[var(--garage-red-bright)]" },
          { k: "Total diserahkan", v: totals.net, tone: "text-[var(--garage-fg)]" },
        ].map((x) => (
          <div key={x.k} className={card}>
            <div className={label}>{x.k}</div>
            <div className={`mt-1 break-words text-xl font-bold tabular-nums ${x.tone}`}>{rupiah(x.v)}</div>
          </div>
        ))}
      </div>

      {!data ? (
        loading && <p className="text-base text-[var(--garage-dim)]">Memuat…</p>
      ) : payableRows.length === 0 ? (
        <p className={`${card} text-base text-[var(--garage-dim)]`}>
          Tidak ada gaji yang belum dibayar sampai {dateLabel(until)}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-1)]">
          <table className="w-full min-w-[820px]">
            <thead className="bg-[var(--garage-bg-2)]">
              <tr>
                <th className={th}>Karyawan</th>
                <th className={`${th} text-right`}>Gaji</th>
                <th className={`${th} text-right`}>Fee</th>
                <th className={`${th} text-right`}>Potong kasbon</th>
                <th className={`${th} text-right`}>Diterima</th>
                <th className={`${th} text-right`}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {payableRows.map((r) => {
                const open = confirm?.code === r.code;
                return (
                  <Fragment key={r.code}>
                    <tr className="border-t border-[var(--garage-line)]">
                      <td className="px-3 py-3 text-base">
                        <div className="font-semibold text-[var(--garage-fg)]">{r.name}</div>
                        <div className="text-sm text-[var(--garage-dim)]">
                          {r.code} · {r.firstDate ? `${dateLabel(r.firstDate)} – ${dateLabel(r.lastDate ?? r.firstDate)}` : "fee saja"}
                          {r.active ? "" : " · nonaktif"}
                        </div>
                        {r.pendingDays > 0 && (
                          <div className="text-sm font-semibold text-[var(--garage-amber)]">
                            {r.pendingDays} hari belum check-out — belum ikut dibayar
                          </div>
                        )}
                        {r.advancePending > 0 && (
                          <div className="text-sm text-[var(--garage-amber)]">
                            Kasbon {rupiah(r.advancePending)} menunggu Approvals (belum dipotong)
                          </div>
                        )}
                      </td>
                      <td className={`${num} text-[var(--garage-fg)]`}>{rupiah(r.gaji)}</td>
                      <td className={`${num} text-[var(--garage-amber)]`}>{rupiah(r.fee)}</td>
                      <td className={`${num} ${r.deduction ? "text-[var(--garage-red-bright)]" : "text-[var(--garage-dim)]"}`}>
                        {r.deduction ? `- ${rupiah(r.deduction)}` : "—"}
                      </td>
                      <td className={`${num} font-semibold text-[var(--garage-fg)]`}>{rupiah(r.net)}</td>
                      <td className="px-3 py-3 text-right">
                        {!open && (
                          <button
                            type="button"
                            onClick={() => {
                              openForm("confirm");
                              setConfirm({ code: r.code, method: "Cash", note: "" });
                            }}
                            className={`${btnPrimary} ml-auto`}
                          >
                            <Banknote className="size-4" aria-hidden />
                            Bayar
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && confirm && (
                      <tr className="border-t border-[var(--garage-line)] bg-[var(--garage-bg-0)]">
                        <td colSpan={6} className="p-3">
                          <div className="space-y-3 rounded-xl border border-[var(--garage-amber)] p-3">
                            <p className="text-base text-[var(--garage-fg)]">
                              Bayar <strong>{r.name}</strong> s/d {dateLabel(until)}: gaji {rupiah(r.gaji)} + fee {rupiah(r.fee)}
                              {r.deduction ? ` − kasbon ${rupiah(r.deduction)}` : ""} = <strong>{rupiah(r.net)}</strong>.
                              {r.carryOver > 0 && ` Sisa kasbon ${rupiah(r.carryOver)} terbawa ke gajian berikutnya.`}
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="block space-y-1">
                                <span className={label}>Metode</span>
                                <select value={confirm.method} onChange={(e) => setConfirm({ ...confirm, method: e.target.value as Method })} className={`${input} cursor-pointer`}>
                                  <option value="Cash">Tunai (laci kas)</option>
                                  <option value="Transfer">Transfer</option>
                                </select>
                              </label>
                              <label className="block space-y-1">
                                <span className={label}>Catatan</span>
                                <input value={confirm.note} onChange={(e) => setConfirm({ ...confirm, note: e.target.value })} maxLength={200} placeholder="opsional" className={input} />
                              </label>
                            </div>
                            {formError && <p role="alert" className={alertBox}>{formError}</p>}
                            <div className="flex flex-wrap justify-end gap-2">
                              <button type="button" onClick={() => setConfirm(null)} className={btnGhost} disabled={saving}>Batal</button>
                              <button type="button" onClick={() => void pay(r)} className={btnPrimary} disabled={saving}>
                                {saving ? "Memproses…" : `Ya, bayar ${rupiah(r.net)}`}
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
      )}

      {data && (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className={`${card} space-y-2`}>
            <h2 className={label}>Riwayat gajian</h2>
            {data.payments.length === 0 ? (
              <p className="text-base text-[var(--garage-dim)]">Belum ada gajian.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-[var(--garage-line)] overflow-y-auto">
                {data.payments.map((p) => {
                  const cancelled = p.status === "cancelled";
                  return (
                    <li key={p.id} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base text-[var(--garage-fg)]">
                            <strong>{p.name}</strong> · s/d {dateLabel(p.paidUntil)}{" "}
                            <StatusBadge status={p.status} expenseStatus={p.expenseStatus} />
                          </div>
                          <div className="text-sm text-[var(--garage-dim)]">
                            {stampLabel(p.createdAt)} · {p.method === "Cash" ? "Tunai" : "Transfer"}
                            {p.advanceDeducted ? ` · potong kasbon ${rupiah(p.advanceDeducted)}` : ""}
                            {cancelled && p.cancelReason ? ` · ${p.cancelReason}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <span className={`text-base font-semibold tabular-nums ${cancelled ? "text-[var(--garage-dim)] line-through" : "text-[var(--garage-fg)]"}`}>
                            {rupiah(p.netPaid)}
                          </span>
                          {!cancelled && cancel?.id !== p.id && (
                            <button
                              type="button"
                              onClick={() => {
                                openForm("cancel");
                                setCancel({ kind: "payment", id: p.id, reason: "" });
                              }}
                              className={btnSmall}
                            >
                              <Undo2 className="size-4" aria-hidden />
                              Batalkan
                            </button>
                          )}
                        </div>
                      </div>
                      {cancelForm("payment", p.id)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className={`${card} space-y-2`}>
            <h2 className={label}>Kasbon</h2>
            {data.advances.length === 0 ? (
              <p className="text-base text-[var(--garage-dim)]">Belum ada kasbon.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-[var(--garage-line)] overflow-y-auto">
                {data.advances.map((a) => {
                  const cancelled = a.status === "cancelled";
                  const left = a.amount - a.settledAmount;
                  return (
                    <li key={a.id} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base text-[var(--garage-fg)]">
                            <strong>{a.name}</strong> · {dateLabel(a.date)}{" "}
                            <StatusBadge status={a.status} expenseStatus={a.expenseStatus} />
                          </div>
                          <div className="text-sm text-[var(--garage-dim)]">
                            {cancelled
                              ? a.cancelReason ?? "Dibatalkan"
                              : a.expenseStatus === "pending_approval"
                                ? "Serahkan & potong setelah disetujui Owner"
                                : left > 0
                                ? `Sisa ${rupiah(left)} dipotong di gajian berikutnya`
                                : "Lunas (dipotong gajian)"}
                            {a.note ? ` · ${a.note}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <span
                            className={`text-base font-semibold tabular-nums ${
                              cancelled
                                ? "text-[var(--garage-dim)] line-through"
                                : left > 0
                                  ? "text-[var(--garage-red-bright)]"
                                  : "text-[var(--garage-dim)]"
                            }`}
                          >
                            {rupiah(a.amount)}
                          </span>
                          {!cancelled && a.settledAmount === 0 && cancel?.id !== a.id && (
                            <button
                              type="button"
                              onClick={() => {
                                openForm("cancel");
                                setCancel({ kind: "advance", id: a.id, reason: "" });
                              }}
                              className={btnSmall}
                            >
                              <Undo2 className="size-4" aria-hidden />
                              Batalkan
                            </button>
                          )}
                        </div>
                      </div>
                      {cancelForm("advance", a.id)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex min-w-0 items-start gap-3">
          <DatabaseBackup className="mt-0.5 size-5 shrink-0 text-[var(--garage-amber)]" aria-hidden />
          <div className="min-w-0">
            <div className="text-base font-semibold text-[var(--garage-fg)]">Backup data</div>
            <div className="text-sm text-[var(--garage-dim)]">
              {backupError
                ? "Status backup tidak bisa dimuat."
                : backups === null
                ? "Memeriksa…"
                : lastBackup
                  ? `Terakhir: ${stampLabel(lastBackup.createdAt)} (${lastBackup.label}, ${(lastBackup.bytes / 1024 / 1024).toFixed(1)} MB) · otomatis sekali sehari & sebelum gajian`
                  : "Belum ada backup — otomatis dibuat sekali sehari & sebelum gajian."}
            </div>
            {offsite && (
              <div
                className={`text-sm ${
                  !offsite.dir || (offsite.last && !offsite.last.ok && offsite.last.dir === offsite.dir)
                    ? "text-[var(--garage-amber)]"
                    : "text-[var(--garage-dim)]"
                }`}
              >
                {!offsite.dir
                  ? "Salinan di luar laptop: belum diatur (Pengaturan → Salinan Backup)."
                  : offsite.last && offsite.last.dir === offsite.dir && !offsite.last.ok
                    ? `Salinan ke ${offsite.dir} gagal: ${offsite.last.error}`
                    : `Salinan di luar laptop: ${offsite.dir}`}
              </div>
            )}
          </div>
        </div>
        <button type="button" onClick={() => void backupNow()} className={btnGhost} disabled={saving}>
          {saving ? "Memproses…" : "Backup sekarang"}
        </button>
      </section>
    </section>
  );
}
