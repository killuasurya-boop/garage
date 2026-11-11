"use client";

// Bagian Portal Mitra: penghasilan per periode, riwayat per tanggal, transfer dari Garage, info kerja sama,
// ganti PIN, dan pilihan alasan tolak pesanan. Semua data milik mitra yang login (partner_id dari sesi server).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, CircleX, KeyRound, Loader2, Receipt, Store } from "lucide-react";

export const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? "Permintaan gagal."), { status: res.status });
  return json?.data as T;
}

const card = "rounded-xl border border-[#34343c] bg-[#17171c] p-4";
const chip = (on: boolean) =>
  `min-h-11 rounded-lg border px-3 text-sm font-semibold ${on ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`;

function wibKey(at: Date) {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

type PeriodId = "today" | "7d" | "month" | "custom";
function periodRange(id: PeriodId, custom: { from: string; to: string }) {
  const today = wibKey(new Date());
  if (id === "today") return { from: today, to: today };
  if (id === "7d") return { from: wibKey(new Date(Date.now() - 6 * 86_400_000)), to: today };
  if (id === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return custom;
}

type Finance = { totalQty: number; grossSales: number; netSales: number; liabilityTotal: number; orderCount: number; paidAmount: number; outstanding: number };
type HistoryTicket = { ticketNo: string; orderNo: string; status: string; createdAt: string; items: Array<{ name: string; qty: number }> };

/** Penghasilan & riwayat pesanan per periode (Hari ini / 7 hari / Bulan ini / pilih tanggal). */
export function PartnerEarnings() {
  const [period, setPeriod] = useState<PeriodId>("today");
  const [custom, setCustom] = useState(() => ({ from: wibKey(new Date()), to: wibKey(new Date()) }));
  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [history, setHistory] = useState<HistoryTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setFinance(null);
    setHistory(null);
    const q = `from=${range.from}&to=${range.to}`;
    try {
      const [f, h] = await Promise.all([api<Finance>(`/api/partner/finance?${q}`), api<HistoryTicket[]>(`/api/partner/tickets?scope=history&${q}`)]);
      setFinance(f);
      setHistory(h);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [range.from, range.to]);
  useEffect(() => {
    // Ambil data saat periode berubah (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const dateTime = useMemo(() => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }), []);
  const shown = showAll ? history ?? [] : (history ?? []).slice(0, 10);

  return (
    <section className={card} aria-labelledby="pe-title">
      <h2 id="pe-title" className="flex items-center gap-2 text-base font-bold text-white">
        <CalendarDays className="size-4 text-[#ff5a66]" /> Penghasilan & riwayat
      </h2>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pilih periode">
        {(
          [
            ["today", "Hari ini"],
            ["7d", "7 hari"],
            ["month", "Bulan ini"],
            ["custom", "Pilih tanggal"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)} className={chip(period === id)}>
            {label}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-[#b8b8bf]">
            Dari
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-11 rounded-lg border border-[#3a3a42] bg-black/30 px-2 text-sm text-white" />
          </label>
          <label className="grid gap-1 text-xs text-[#b8b8bf]">
            Sampai
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-11 rounded-lg border border-[#3a3a42] bg-black/30 px-2 text-sm text-white" />
          </label>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[#ffd0d4]">{error}</p> : null}
      {finance ? (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Hak mitra (HPP)" value={rp(finance.liabilityTotal)} strong />
          <Stat label="Penjualan di Garage" value={rp(finance.netSales)} />
          <Stat label="Item siap" value={`${finance.totalQty} item`} />
          <Stat label="Pesanan" value={`${finance.orderCount} order`} />
        </dl>
      ) : !error ? (
        <p className="mt-3 text-sm text-[#b8b8bf]">Memuat…</p>
      ) : null}
      <h3 className="mt-4 text-sm font-bold text-white">Riwayat pesanan</h3>
      {history === null ? null : history.length === 0 ? (
        <p className="mt-2 text-sm text-[#b8b8bf]">Belum ada pesanan selesai pada periode ini.</p>
      ) : (
        <>
          <ul className="mt-2 grid gap-2">
            {shown.map((ticket) => (
              <li key={ticket.ticketNo} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#3a3a42] bg-black/20 px-3 py-2 text-sm">
                <span className="min-w-0 text-white">
                  {ticket.orderNo} · {ticket.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </span>
                <span className="text-xs text-[#d4d4d8]">
                  {dateTime.format(new Date(ticket.createdAt))} · {HISTORY_LABEL[ticket.status] ?? ticket.status}
                </span>
              </li>
            ))}
          </ul>
          {history.length > 10 ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-11 text-sm font-semibold text-[#ffd08a] underline">
              {showAll ? "Tampilkan lebih sedikit" : `Lihat semua (${history.length})`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

const HISTORY_LABEL: Record<string, string> = { delivered: "Diantar", rejected: "Ditolak", cancelled: "Dibatalkan", done: "Selesai" };

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-[#3a3a42] bg-black/20 p-3">
      <dt className="text-xs text-[#b8b8bf]">{label}</dt>
      <dd className={`mt-1 font-black ${strong ? "text-lg text-[#ffd08a]" : "text-base text-white"}`}>{value}</dd>
    </div>
  );
}

export type PartnerPayout = { id: string; amount: number; reference: string; status: string; paidAt: string; settlementNo: string };

/** Transfer dari Garage (tercatat / terverifikasi). */
export function PartnerPayouts({ payouts }: { payouts: PartnerPayout[] }) {
  const fmt = useMemo(() => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }), []);
  return (
    <section className={card} aria-labelledby="pp-title">
      <h2 id="pp-title" className="flex items-center gap-2 text-base font-bold text-white">
        <Banknote className="size-4 text-[#ff5a66]" /> Transfer dari Garage
      </h2>
      {payouts.length === 0 ? (
        <p className="mt-3 text-sm text-[#b8b8bf]">Belum ada transfer tercatat.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#3a3a42] bg-black/20 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-bold text-white">{rp(p.amount)}</span>
                <span className="block text-xs text-[#d4d4d8]">
                  {fmt.format(new Date(p.paidAt))} · {p.settlementNo} · Ref {p.reference}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === "verified" ? "bg-[#14532d] text-[#bbf7d0]" : "bg-[#78350f] text-[#fde68a]"}`}>
                {p.status === "verified" ? "Terverifikasi" : "Diperiksa Garage"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type PartnerProfile = {
  lastOrderByDay: Record<string, string | null>;
  handoverPoint: string | null;
  payoutSchedule: string | null;
  terms: string | null;
  bank: { bankName: string; accountName: string; accountMasked: string } | null;
};
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Info kerja sama (hanya baca): last order, titik serah-terima, jadwal & rekening penerima. */
export function PartnerInfo({ profile }: { profile: PartnerProfile | null }) {
  const [todayIdx] = useState(() => new Date(Date.now() + 7 * 3_600_000).getUTCDay());
  if (!profile) return null;
  return (
    <section className={card} aria-labelledby="pi-title">
      <h2 id="pi-title" className="flex items-center gap-2 text-base font-bold text-white">
        <Store className="size-4 text-[#ff5a66]" /> Info kerja sama
      </h2>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="text-xs text-[#b8b8bf]">Last order (WIB)</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {DAYS.map((day, i) => (
              <span key={day} className={`rounded-md border px-2 py-1 text-xs ${i === todayIdx ? "border-[#ffd08a] text-[#ffd08a]" : "border-[#3a3a42] text-[#e4e4e8]"}`}>
                {day.slice(0, 3)} {profile.lastOrderByDay?.[String(i)] ?? "bebas"}
              </span>
            ))}
          </dd>
        </div>
        <Row label="Titik serah-terima" value={profile.handoverPoint ?? "Belum diatur — tanyakan ke Garage"} />
        <Row label="Jadwal pembayaran" value={profile.payoutSchedule ?? "Sesuai kesepakatan"} />
        <Row label="Rekening penerima" value={profile.bank ? `${profile.bank.bankName} · ${profile.bank.accountName} · ${profile.bank.accountMasked}` : "Belum terverifikasi"} />
        {profile.terms ? <Row label="Kesepakatan" value={profile.terms} /> : null}
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#b8b8bf]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-[#f4f4f5]">{value}</dd>
    </div>
  );
}

/** Ganti PIN sendiri (PIN lama wajib). HP lain otomatis keluar. */
export function PartnerPinChange() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ oldPin: "", newPin: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const mismatch = form.confirm.length === 6 && form.confirm !== form.newPin;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/partner/auth/pin", { method: "POST", body: JSON.stringify({ oldPin: form.oldPin, newPin: form.newPin }) });
      setForm({ oldPin: "", newPin: "", confirm: "" });
      setMsg({ ok: true, text: "PIN berhasil diganti. HP lain yang masih masuk otomatis keluar." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const input = "h-12 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 text-base tracking-[0.3em] text-white";
  return (
    <section className={card}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-11 w-full items-center gap-2 text-left text-base font-bold text-white">
        <KeyRound className="size-4 text-[#ff5a66]" /> Ganti PIN
        <span className="ml-auto text-sm font-normal text-[#b8b8bf]">{open ? "Tutup" : "Buka"}</span>
      </button>
      {open ? (
        <form onSubmit={submit} className="mt-2 grid gap-2">
          <label className="grid gap-1 text-sm text-[#e4e4e8]">
            PIN lama
            <input type="password" inputMode="numeric" autoComplete="current-password" value={form.oldPin} onChange={(e) => setForm({ ...form, oldPin: digits(e.target.value) })} className={input} required />
          </label>
          <label className="grid gap-1 text-sm text-[#e4e4e8]">
            PIN baru (6 angka)
            <input type="password" inputMode="numeric" autoComplete="new-password" value={form.newPin} onChange={(e) => setForm({ ...form, newPin: digits(e.target.value) })} className={input} required />
          </label>
          <label className="grid gap-1 text-sm text-[#e4e4e8]">
            Ulangi PIN baru
            <input type="password" inputMode="numeric" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: digits(e.target.value) })} className={input} required />
          </label>
          {mismatch ? <p className="text-sm text-[#ffd0d4]">PIN baru dan ulangan belum sama.</p> : null}
          {msg ? (
            <p role={msg.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-[#22c55e]/40 bg-[#0f2a1a] text-[#bbf7d0]" : "border-[#ff5a66]/50 bg-[#3a1015] text-[#ffd0d4]"}`}>
              {msg.text}
            </p>
          ) : null}
          <button type="submit" disabled={busy || form.oldPin.length !== 6 || form.newPin.length !== 6 || form.confirm !== form.newPin} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#d11a2a] font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Simpan PIN baru
          </button>
        </form>
      ) : null}
    </section>
  );
}

const REJECT_REASONS = ["Produk habis", "Sedang tutup / di luar jam", "Terlalu ramai", "Bahan tidak tersedia"];

/** Panel tolak pesanan: alasan pilihan + catatan; kasir diberi tahu & menyelesaikan uang pelanggan. */
export function RejectPanel({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const reason = [choice, note.trim()].filter(Boolean).join(" — ");
  return (
    <div className="mt-3 rounded-lg border border-[#ff5a66]/50 bg-[#2a0f13] p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-white">
        <CircleX className="size-4 text-[#ff8a95]" /> Alasan menolak
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REJECT_REASONS.map((r) => (
          <button key={r} type="button" aria-pressed={choice === r} onClick={() => setChoice(choice === r ? null : r)} className={chip(choice === r)}>
            {r}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan tambahan (opsional)" maxLength={160} className="mt-2 h-11 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 text-sm text-white" />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !reason} onClick={() => onConfirm(reason)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />} Tolak pesanan
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-[#3a3a42] px-4 text-sm text-[#e4e4e8]">
          Batal
        </button>
      </div>
    </div>
  );
}
