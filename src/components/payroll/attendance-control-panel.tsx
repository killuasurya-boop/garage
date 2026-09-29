"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarOff, Pencil, RefreshCw, Smartphone, Trash2, X } from "lucide-react";

import type { BoardRow, BoardState } from "@/lib/garage-absen-control";

// Kontrol absen harian untuk manajer: papan hari ini, koreksi absen, izin/sakit/cuti.

type Board = {
  date: string;
  now: string;
  summary: { total: number; hadir: number; telat: number; belumDatang: number; izin: number; sharedDevice: number };
  rows: BoardRow[];
};
type Leave = { date: string; type: string; reason: string | null; code: string | null; name: string };
type LeaveType = "izin" | "sakit" | "cuti";

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
const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    : "—";
const clockInput = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    : "";
const dayLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });
const shiftDate = (dateKey: string, days: number) => {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const STATE: Record<BoardState, { label: string; tone: string; border: string }> = {
  sedang_shift: { label: "Sedang shift", tone: "text-[var(--garage-fg)]", border: "border-[var(--garage-line)]" },
  selesai: { label: "Sudah pulang", tone: "text-[var(--garage-dim)]", border: "border-[var(--garage-line)]" },
  belum_datang: { label: "Belum datang", tone: "text-[var(--garage-red-bright)]", border: "border-[var(--garage-red-bright)]" },
  belum_waktunya: { label: "Belum jam masuk", tone: "text-[var(--garage-dim)]", border: "border-[var(--garage-line)]" },
  tidak_valid: { label: "Tidak valid", tone: "text-[var(--garage-red-bright)]", border: "border-[var(--garage-red-bright)]" },
  izin: { label: "Izin", tone: "text-[var(--garage-amber)]", border: "border-[var(--garage-amber)]" },
  sakit: { label: "Sakit", tone: "text-[var(--garage-amber)]", border: "border-[var(--garage-amber)]" },
  cuti: { label: "Cuti", tone: "text-[var(--garage-amber)]", border: "border-[var(--garage-amber)]" },
};

function detailOf(r: BoardRow, today: string): string {
  switch (r.state) {
    case "sedang_shift":
      return `Masuk ${clock(r.checkinAt)}${r.lateMinutes ? ` · telat ${r.lateMinutes} mnt` : " · tepat waktu"}${r.shiftDate && r.shiftDate !== today ? " · shift kemarin" : ""}`;
    case "selesai":
    case "tidak_valid":
      return `Masuk ${clock(r.checkinAt)} · Keluar ${clock(r.checkoutAt)}${r.lateMinutes ? ` · telat ${r.lateMinutes} mnt` : ""}`;
    case "belum_datang":
      return r.lateMinutes >= 30
        ? `Lewat ${r.lateMinutes} mnt — bila datang, gaji hari ini hangus`
        : `Lewat ${r.lateMinutes} mnt dari jam masuk ${r.shiftStart}`;
    case "belum_waktunya":
      return `Jam masuk ${r.shiftStart}`;
    default:
      return r.leaveReason ? `Alasan: ${r.leaveReason}` : "Tercatat oleh manajer";
  }
}

const card = "rounded-2xl border bg-[var(--garage-bg-2)] p-4";
const label = "text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const input =
  "w-full min-h-11 rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-3 text-base text-[var(--garage-fg)] placeholder:text-[var(--garage-mute)] [color-scheme:dark]";
const btnGhost =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)] disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60";
const alertBox =
  "rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white";
const okBox = "rounded-xl border border-[var(--garage-amber)] bg-[var(--garage-bg-3)] px-4 py-3 text-base text-[var(--garage-fg)]";

type CorrectionForm = { code: string; date: string; checkin: string; checkout: string; stillWorking: boolean; reason: string };
type LeaveForm = { code: string; type: LeaveType; from: string; to: string; reason: string };

export function AttendanceControlPanel() {
  const [board, setBoard] = useState<Board | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ url: string; label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [correction, setCorrection] = useState<CorrectionForm | null>(null);
  const [leaveForm, setLeaveForm] = useState<LeaveForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, l] = await Promise.all([
        api<Board>("/api/payroll/attendance/today"),
        api<{ leaves: Leave[] }>("/api/payroll/leaves"),
      ]);
      setBoard(b);
      setLeaves(l.leaves);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const today = board?.date ?? "";

  const openCorrection = (r: BoardRow) => {
    setLeaveForm(null);
    setFormError(null);
    setCorrection({
      code: r.code,
      date: r.shiftDate ?? today,
      checkin: clockInput(r.checkinAt) || r.shiftStart,
      checkout: clockInput(r.checkoutAt),
      stillWorking: !r.checkoutAt && (r.state === "sedang_shift" || r.state === "belum_datang"),
      reason: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openLeave = (r?: BoardRow) => {
    setCorrection(null);
    setFormError(null);
    setLeaveForm({ code: r?.code ?? board?.rows[0]?.code ?? "", type: "izin", from: today, to: today, reason: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitCorrection = async (e: FormEvent) => {
    e.preventDefault();
    if (!correction) return;
    if (correction.reason.trim().length < 5) return setFormError("Isi alasan koreksi (minimal 5 huruf).");
    setSaving(true);
    setFormError(null);
    try {
      const res = await api<{ name: string; date: string; lateMinutes: number; wage: number | null; fee: string }>(
        "/api/payroll/attendance/correct",
        {
          method: "POST",
          body: JSON.stringify({
            code: correction.code,
            date: correction.date,
            checkin: correction.checkin,
            checkout: correction.stillWorking ? null : correction.checkout || null,
            reason: correction.reason,
          }),
        },
      );
      const fee =
        res.fee === "added" ? " Fee hari itu ditambahkan." : res.fee === "removed" ? " Fee hari itu ditarik." : "";
      setNotice(
        `Koreksi ${res.name} (${dayLabel(res.date)}) tersimpan. ${res.lateMinutes ? `Telat ${res.lateMinutes} mnt. ` : ""}${
          res.wage === null
            ? "Gaji dihitung saat absen keluar."
            : res.wage === 0 && res.lateMinutes > 0
              ? "Gaji hari itu hangus karena telat melewati batas."
              : `Gaji hari itu ${rupiah(res.wage)}.`
        }${fee}`,
      );
      setCorrection(null);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submitLeave = async (e: FormEvent) => {
    e.preventDefault();
    if (!leaveForm) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api<{ name: string; days: number }>("/api/payroll/leaves", {
        method: "POST",
        body: JSON.stringify(leaveForm),
      });
      setNotice(`${leaveForm.type[0].toUpperCase()}${leaveForm.type.slice(1)} ${res.name} tercatat (${res.days} hari).`);
      setLeaveForm(null);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteLeave = async (l: Leave) => {
    setSaving(true);
    try {
      await api(`/api/payroll/leaves?code=${encodeURIComponent(l.code ?? "")}&date=${l.date}`, { method: "DELETE" });
      setConfirmDelete(null);
      setNotice(`Izin ${l.name} tanggal ${dayLabel(l.date)} dihapus.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const employeeOptions = board?.rows ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Absen Hari Ini</h1>
          <p className="text-base text-[var(--garage-dim)]">
            {today ? dayLabel(today) : "Memuat…"}
            {board ? ` · diperbarui ${clock(board.now)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openLeave()} className={btnGhost} disabled={!board}>
            <CalendarOff className="size-4" aria-hidden />
            Catat izin / sakit
          </button>
          <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading} aria-label="Muat ulang">
            <RefreshCw className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden />
            Muat ulang
          </button>
        </div>
      </div>

      {error && <p role="alert" className={alertBox}>{error}</p>}
      {notice && (
        <div role="status" className={`${okBox} flex items-start justify-between gap-3`}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Tutup pesan" className="min-h-11 min-w-11 cursor-pointer">
            <X className="mx-auto size-4" aria-hidden />
          </button>
        </div>
      )}

      {correction && (
        <form onSubmit={submitCorrection} className={`${card} space-y-3 border-[var(--garage-amber)]`} noValidate>
          <h2 className="text-lg font-semibold text-[var(--garage-fg)]">Koreksi absen</h2>
          <p className="text-base text-[var(--garage-dim)]">
            Langsung berlaku: telat, gaji, dan fee hari itu dihitung ulang. Tercatat di audit log.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1">
              <span className={label}>Karyawan</span>
              <select value={correction.code} onChange={(e) => setCorrection({ ...correction, code: e.target.value })} className={`${input} cursor-pointer`}>
                {employeeOptions.map((r) => (
                  <option key={r.code} value={r.code}>{`${r.name} (${r.code})`}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={label}>Tanggal shift</span>
              <input
                type="date"
                value={correction.date}
                min={shiftDate(today, -35)}
                max={today}
                onChange={(e) => setCorrection({ ...correction, date: e.target.value })}
                className={input}
              />
            </label>
            <label className="block space-y-1">
              <span className={label}>Jam masuk</span>
              <input type="time" value={correction.checkin} onChange={(e) => setCorrection({ ...correction, checkin: e.target.value })} className={input} />
            </label>
            <div className="space-y-1">
              <span className={label}>Jam keluar</span>
              {correction.stillWorking ? (
                <p className="flex min-h-11 items-center text-base text-[var(--garage-dim)]">Masih bekerja</p>
              ) : (
                <input
                  type="time"
                  value={correction.checkout}
                  onChange={(e) => setCorrection({ ...correction, checkout: e.target.value })}
                  className={input}
                  aria-label="Jam keluar"
                />
              )}
              <label className="flex cursor-pointer items-center gap-2 text-base text-[var(--garage-fg)]">
                <input
                  type="checkbox"
                  checked={correction.stillWorking}
                  onChange={(e) => setCorrection({ ...correction, stillWorking: e.target.checked })}
                  className="size-5 cursor-pointer accent-[var(--garage-red)]"
                />
                Belum pulang
              </label>
            </div>
          </div>
          <label className="block space-y-1">
            <span className={label}>Alasan koreksi (wajib)</span>
            <input
              value={correction.reason}
              onChange={(e) => setCorrection({ ...correction, reason: e.target.value })}
              maxLength={200}
              placeholder="mis. HP mati, lupa absen keluar — dicek dari CCTV"
              className={input}
            />
          </label>
          <p className="text-sm text-[var(--garage-dim)]">
            Jam keluar lebih kecil dari jam masuk otomatis dianggap keesokan harinya (shift malam).
          </p>
          {formError && <p role="alert" className={alertBox}>{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setCorrection(null)} className={btnGhost} disabled={saving}>Batal</button>
            <button type="submit" className={btnPrimary} disabled={saving}>{saving ? "Menyimpan…" : "Simpan koreksi"}</button>
          </div>
        </form>
      )}

      {leaveForm && (
        <form onSubmit={submitLeave} className={`${card} space-y-3 border-[var(--garage-amber)]`} noValidate>
          <h2 className="text-lg font-semibold text-[var(--garage-fg)]">Catat izin / sakit / cuti</h2>
          <p className="text-base text-[var(--garage-dim)]">
            Hari izin tidak dihitung tidak hadir (bonus tidak gugur), tapi tetap tidak digaji.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1">
              <span className={label}>Karyawan</span>
              <select value={leaveForm.code} onChange={(e) => setLeaveForm({ ...leaveForm, code: e.target.value })} className={`${input} cursor-pointer`}>
                {employeeOptions.map((r) => (
                  <option key={r.code} value={r.code}>{`${r.name} (${r.code})`}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={label}>Jenis</span>
              <select value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value as LeaveType })} className={`${input} cursor-pointer`}>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
                <option value="cuti">Cuti</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className={label}>Dari</span>
              <input type="date" value={leaveForm.from} onChange={(e) => setLeaveForm({ ...leaveForm, from: e.target.value, to: leaveForm.to < e.target.value ? e.target.value : leaveForm.to })} className={input} />
            </label>
            <label className="block space-y-1">
              <span className={label}>Sampai</span>
              <input type="date" value={leaveForm.to} min={leaveForm.from} onChange={(e) => setLeaveForm({ ...leaveForm, to: e.target.value })} className={input} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={label}>Keterangan</span>
            <input
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              maxLength={200}
              placeholder="mis. demam, ada surat dokter"
              className={input}
            />
          </label>
          {formError && <p role="alert" className={alertBox}>{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setLeaveForm(null)} className={btnGhost} disabled={saving}>Batal</button>
            <button type="submit" className={btnPrimary} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      )}

      {board && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Hadir", value: `${board.summary.hadir}/${board.summary.total}`, tone: "text-[var(--garage-fg)]" },
              { label: "Telat", value: board.summary.telat, tone: board.summary.telat ? "text-[var(--garage-amber)]" : "text-[var(--garage-fg)]" },
              { label: "Belum datang", value: board.summary.belumDatang, tone: board.summary.belumDatang ? "text-[var(--garage-red-bright)]" : "text-[var(--garage-fg)]" },
              { label: "Izin / sakit", value: board.summary.izin, tone: "text-[var(--garage-fg)]" },
            ].map((k) => (
              <div key={k.label} className={`${card} border-[var(--garage-line)]`}>
                <div className={label}>{k.label}</div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${k.tone}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {board.summary.sharedDevice > 0 && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white">
              <Smartphone className="mt-0.5 size-5 shrink-0" aria-hidden />
              {board.summary.sharedDevice} karyawan absen dari HP yang sama dengan orang lain hari ini. Cocokkan selfie
              dengan orangnya — bisa jadi titip absen.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {board.rows.map((r) => {
              const s = STATE[r.state];
              return (
                <article key={r.code} className={`${card} ${s.border} space-y-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="break-words text-lg font-semibold text-[var(--garage-fg)]">{r.name}</div>
                      <div className="text-base text-[var(--garage-dim)]">
                        {r.code} · {r.position ?? "Karyawan"} · masuk {r.shiftStart}
                      </div>
                    </div>
                    <span className={`shrink-0 text-base font-semibold ${s.tone}`}>{s.label}</span>
                  </div>
                  <p className="text-base tabular-nums text-[var(--garage-fg)]">{detailOf(r, today)}</p>
                  {r.sharedDeviceWith.length > 0 && (
                    <p className="flex items-start gap-1.5 text-sm font-semibold text-[var(--garage-red-bright)]">
                      <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
                      HP yang sama dipakai absen oleh {r.sharedDeviceWith.join(", ")} — cek selfie.
                    </p>
                  )}
                  {(r.checkinSelfieUrl || r.checkoutSelfieUrl) && (
                    <div className="flex gap-2">
                      {[
                        { url: r.checkinSelfieUrl, label: `Selfie masuk ${r.name}`, tag: "Masuk" },
                        { url: r.checkoutSelfieUrl, label: `Selfie keluar ${r.name}`, tag: "Keluar" },
                      ]
                        .filter((p): p is { url: string; label: string; tag: string } => Boolean(p.url))
                        .map((p) => (
                          <button
                            key={p.tag}
                            type="button"
                            onClick={() => setPhoto({ url: p.url, label: p.label })}
                            className="group relative size-16 cursor-pointer overflow-hidden rounded-lg border border-[var(--garage-line-2)] hover:border-[var(--garage-amber)]"
                            aria-label={`Lihat ${p.label}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- foto privat lewat API terproteksi */}
                            <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[11px] font-semibold text-white">
                              {p.tag}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {(r.state === "belum_datang" || r.state === "belum_waktunya") && (
                      <button type="button" onClick={() => openLeave(r)} className={btnGhost}>
                        <CalendarOff className="size-4" aria-hidden />
                        Izin
                      </button>
                    )}
                    <button type="button" onClick={() => openCorrection(r)} className={btnGhost}>
                      <Pencil className="size-4" aria-hidden />
                      Koreksi
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <section className={`${card} space-y-2 border-[var(--garage-line)]`}>
            <h2 className={label}>Izin / sakit / cuti terdaftar</h2>
            {leaves.length === 0 ? (
              <p className="text-base text-[var(--garage-dim)]">Belum ada izin tercatat.</p>
            ) : (
              <ul className="max-h-[360px] divide-y divide-[var(--garage-line)] overflow-y-auto">
                {leaves.map((l) => {
                  const key = `${l.code}-${l.date}`;
                  return (
                    <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="text-base text-[var(--garage-fg)]">
                          {dayLabel(l.date)} · <strong>{l.name}</strong> · {l.type}
                        </div>
                        {l.reason && <div className="text-sm text-[var(--garage-dim)]">{l.reason}</div>}
                      </div>
                      {confirmDelete === key ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setConfirmDelete(null)} className={btnGhost} disabled={saving}>Batal</button>
                          <button type="button" onClick={() => void deleteLeave(l)} className={btnPrimary} disabled={saving}>Ya, hapus</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDelete(key)} className={btnGhost} aria-label={`Hapus izin ${l.name} ${l.date}`}>
                          <Trash2 className="size-4" aria-hidden />
                          Hapus
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {photo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={photo.label}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPhoto(null)}
          onKeyDown={(e) => e.key === "Escape" && setPhoto(null)}
        >
          <figure className="max-h-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto privat lewat API terproteksi */}
            <img src={photo.url} alt={photo.label} className="max-h-[75vh] w-full rounded-xl object-contain" />
            <figcaption className="flex items-center justify-between gap-3 text-base text-white">
              <span className="min-w-0 break-words">{photo.label}</span>
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/40 px-3"
                autoFocus
              >
                <X className="size-4" aria-hidden />
                Tutup
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
