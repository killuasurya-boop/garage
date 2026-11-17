"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Archive, Ban, Banknote, Camera, Pencil, Plus, Printer, RefreshCw, TrendingDown, TrendingUp, X } from "lucide-react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Badge } from "@/components/ceo/ui/Badge";
import { garageApi, GarageApiError } from "@/lib/api-client";

// Keuangan Event (GIGS EO Fase 2, Owner 17 Nov 2026): Owner saja. Semua angka dihitung server
// (anggaran vs realisasi, sponsor, penjualan menu, untung/rugi); layar ini menampilkan & mengirim perubahan.

type Option = { value: string; label: string };
type MasterEvent = { id: string; title: string; date: string };
type BudgetRow = {
  id: string;
  category: string;
  title: string;
  plannedAmount: number;
  status: "aktif" | "arsip";
  paid: number;
  remaining: number;
  over: number;
  performerId: string | null;
  performerName: string | null;
  notes: string | null;
};
type Payment = {
  id: string;
  budgetLineId: string;
  lineTitle: string;
  amount: number;
  paidAt: string;
  source: string;
  sourceLabel: string;
  payee: string;
  reference: string | null;
  note: string | null;
  hasProof: boolean;
  status: "posted" | "void";
  voidReason: string | null;
};
type FinanceView = {
  masterEvents: MasterEvent[];
  today?: string;
  event: { id: string; title: string; startsAt: string; endsAt: string; status: string } | null;
  categories?: Option[];
  sources?: Option[];
  performers?: Array<{ id: string; name: string; status: string }>;
  budget?: {
    rows: BudgetRow[];
    categories: Array<{ category: string; label: string; planned: number; paid: number; over: number }>;
    totals: { planned: number; paid: number; remaining: number; over: number };
  };
  payments?: Payment[];
  sponsor?: { count: number; agreed: number; paid: number; remaining: number; inkind: number };
  menu?: { available: boolean; netSales: number; cost: number | null; paidBills: number; note: string | null };
  profit?: { menuContribution: number; menuMarginKnown: boolean; income: number; current: number; projected: number; status: "untung" | "rugi"; projectedStatus: "untung" | "rugi" };
  review?: { rating: number | null; highlights: string | null; issues: string | null; incidents: string | null; nextTime: string | null; updatedAt: string } | null;
  comparison?: Array<{ id: string; title: string; date: string; costPaid: number; sponsorPaid: number; net: number; checkins: number; rating: number | null; current: boolean }>;
};

const idr = (value: number) => `${value < 0 ? "-" : ""}Rp${Math.abs(Math.round(value)).toLocaleString("id-ID")}`;
const errText = (error: unknown) => (error instanceof GarageApiError || error instanceof Error ? error.message : "Gagal menyimpan.");
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[color-mix(in_srgb,var(--garage-amber)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--garage-amber)_40%,transparent)]";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_60%,transparent)] bg-[var(--garage-red)] px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const smallBtn =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-white/15 px-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const cardClass = "rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-4";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-semibold text-zinc-300">
      {label}
      {children}
      {hint ? <span className="font-normal text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-white/15 bg-[var(--garage-bg-2)] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-zinc-50">{title}</h2>
          <button type="button" className={smallBtn} onClick={onClose} aria-label="Tutup">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-[#a8f0c4]" : tone === "bad" ? "text-[#ff8a8a]" : "text-zinc-50";
  return (
    <div className={cardClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 break-words text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-400">{sub}</p> : null}
    </div>
  );
}

export function EventFinancePanel() {
  const [view, setView] = useState<FinanceView | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<null | { kind: "line"; row: BudgetRow | null } | { kind: "pay"; row: BudgetRow } | { kind: "void"; payment: Payment }>(null);

  const load = useCallback(async (id: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<FinanceView>(`/api/event-finance${id ? `?eventId=${id}` : ""}`, { cache: "no-store" });
      setView(data);
      setEventId(data.event?.id ?? null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<FinanceView>("/api/event-finance", { cache: "no-store" })
      .then((data) => {
        if (!alive) return;
        setView(data);
        setEventId(data.event?.id ?? null);
      })
      .catch((e) => alive && setError(errText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load(eventId);
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    }
  };

  const profit = view?.profit;
  const budget = view?.budget;

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Event"
        title="Keuangan Event"
        subtitle="Anggaran vs realisasi, biaya yang dibayar (tercatat di buku kas), uang sponsor, penjualan menu event, dan untung/rugi per event."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" className={ghostBtn} onClick={() => void load(eventId)} disabled={loading}>
              <RefreshCw size={16} /> Muat ulang
            </button>
            <button type="button" className={ghostBtn} onClick={() => window.print()} disabled={!view?.event}>
              <Printer size={16} /> Cetak / PDF
            </button>
          </div>
        }
      />

      <div className={`${cardClass} grid gap-2 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:items-end print:hidden`}>
        <Field label="Event">
          <select className={inputClass} value={eventId ?? ""} onChange={(e) => void load(e.target.value || null)}>
            {!view?.masterEvents.length ? <option value="">Belum ada event — buat di menu Event</option> : null}
            {view?.masterEvents.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {m.date}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-sm text-zinc-400">Biaya dari rekening tercatat di buku kas; uang pribadi Owner tetap dihitung sebagai biaya event.</p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] px-3 py-2 text-sm text-[#ffc4c4]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {loading && !view ? <p className="text-sm text-zinc-400">Memuat keuangan event…</p> : null}

      {view?.event && profit && budget ? (
        <>
          <h2 className="text-lg font-bold text-zinc-50">{view.event.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={`Saat ini · ${profit.status}`}
              value={idr(profit.current)}
              sub="Uang masuk (menu + sponsor) − biaya dibayar"
              tone={profit.current >= 0 ? "good" : "bad"}
            />
            <Stat
              label={`Proyeksi · ${profit.projectedStatus}`}
              value={idr(profit.projected)}
              sub="Bila sponsor lunas & sisa anggaran dibayar"
              tone={profit.projected >= 0 ? "good" : "bad"}
            />
            <Stat label="Biaya dibayar" value={idr(budget.totals.paid)} sub={`Anggaran ${idr(budget.totals.planned)} · sisa ${idr(budget.totals.remaining)}`} />
            <Stat
              label="Sponsor masuk"
              value={idr(view.sponsor?.paid ?? 0)}
              sub={`${view.sponsor?.count ?? 0} sponsor · belum masuk ${idr(view.sponsor?.remaining ?? 0)}`}
            />
          </div>

          <div className={`${cardClass} grid gap-2 text-sm`}>
            <h3 className="font-bold text-zinc-100">Rincian untung/rugi</h3>
            <Row label="Penjualan menu event (bersih)" value={idr(view.menu?.netSales ?? 0)} />
            {view.menu?.cost !== null && view.menu?.cost !== undefined ? <Row label="HPP menu event" value={`− ${idr(view.menu.cost)}`} /> : null}
            <Row label="Kontribusi menu" value={idr(profit.menuContribution)} />
            <Row label="Uang sponsor masuk" value={idr(view.sponsor?.paid ?? 0)} />
            <Row label="Biaya event dibayar" value={`− ${idr(budget.totals.paid)}`} />
            <Row label="Hasil saat ini" value={idr(profit.current)} strong />
            {view.sponsor?.inkind ? <Row label="Sponsor barang (info, tidak dihitung)" value={idr(view.sponsor.inkind)} /> : null}
            {view.menu?.note ? (
              <p className="flex items-start gap-2 text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {view.menu.note}
              </p>
            ) : null}
            <p className="text-xs text-zinc-500">Tiket dari platform GIGS belum terhubung ke Garage OS dan belum dihitung di sini.</p>
          </div>

          <section className={`${cardClass} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-zinc-100">Anggaran & realisasi</h3>
              <button type="button" className={`${primaryBtn} print:hidden`} onClick={() => setDialog({ kind: "line", row: null })}>
                <Plus size={16} /> Tambah pos biaya
              </button>
            </div>
            {!budget.rows.length ? <p className="text-sm text-zinc-400">Belum ada pos anggaran. Mulai dari honor penampil, sound, dan venue.</p> : null}
            {/* HP: kartu per pos (tombol selalu terlihat); tablet/desktop: tabel. */}
            <ul className="grid gap-2 sm:hidden">
              {budget.rows.map((row) => (
                <li key={row.id} className="rounded-md border border-white/10 bg-[var(--garage-bg-3)] p-3">
                  <p className="font-semibold text-zinc-100">{row.title}</p>
                  <p className="text-xs text-zinc-400">
                    {view.categories?.find((c) => c.value === row.category)?.label ?? row.category}
                    {row.performerName ? ` · ${row.performerName}` : ""}
                    {row.status === "arsip" ? " · diarsipkan" : ""}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-zinc-400">Anggaran</dt>
                      <dd className="font-semibold tabular-nums text-zinc-100">{idr(row.plannedAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400">Dibayar</dt>
                      <dd className="font-semibold tabular-nums text-zinc-100">{idr(row.paid)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400">{row.over ? "Lebih" : "Sisa"}</dt>
                      <dd className={`font-semibold tabular-nums ${row.over ? "text-[#ff8a8a]" : "text-zinc-100"}`}>{idr(row.over || row.remaining)}</dd>
                    </div>
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1 print:hidden">
                    {row.status === "aktif" ? (
                      <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "pay", row })}>
                        <Banknote size={13} /> Bayar
                      </button>
                    ) : null}
                    <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "line", row })}>
                      <Pencil size={13} /> Ubah
                    </button>
                    {row.status === "aktif" ? (
                      <button type="button" className={smallBtn} onClick={() => void run(() => garageApi.patch(`/api/event-finance/lines/${row.id}`, { status: "arsip" }))}>
                        <Archive size={13} /> Arsipkan
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              {budget.rows.length ? (
                <li className="flex justify-between rounded-md border border-white/15 p-3 text-sm font-bold text-zinc-50">
                  <span>Total dibayar</span>
                  <span className="tabular-nums">
                    {idr(budget.totals.paid)} / {idr(budget.totals.planned)}
                  </span>
                </li>
              ) : null}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs uppercase text-zinc-400">
                  <tr>
                    <th className="py-2 pr-2">Pos biaya</th>
                    <th className="py-2 pr-2 text-right">Anggaran</th>
                    <th className="py-2 pr-2 text-right">Dibayar</th>
                    <th className="py-2 pr-2 text-right">Sisa / lebih</th>
                    <th className="py-2 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {budget.rows.map((row) => (
                    <tr key={row.id} className="border-t border-white/10 align-top">
                      <td className="py-2 pr-2">
                        <p className="font-semibold text-zinc-100">{row.title}</p>
                        <p className="text-xs text-zinc-400">
                          {view.categories?.find((c) => c.value === row.category)?.label ?? row.category}
                          {row.performerName ? ` · ${row.performerName}` : ""}
                          {row.status === "arsip" ? " · diarsipkan" : ""}
                        </p>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{idr(row.plannedAmount)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{idr(row.paid)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.over ? <Badge tone="red">lebih {idr(row.over)}</Badge> : idr(row.remaining)}
                      </td>
                      <td className="py-2 print:hidden">
                        <div className="flex flex-wrap justify-end gap-1">
                          {row.status === "aktif" ? (
                            <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "pay", row })}>
                              <Banknote size={13} /> Bayar
                            </button>
                          ) : null}
                          <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "line", row })} aria-label={`Ubah ${row.title}`}>
                            <Pencil size={13} />
                          </button>
                          {row.status === "aktif" ? (
                            <button
                              type="button"
                              className={smallBtn}
                              aria-label={`Arsipkan ${row.title}`}
                              onClick={() => void run(() => garageApi.patch(`/api/event-finance/lines/${row.id}`, { status: "arsip" }))}
                            >
                              <Archive size={13} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {budget.rows.length ? (
                  <tfoot>
                    <tr className="border-t border-white/20 font-bold">
                      <td className="py-2 pr-2">Total</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{idr(budget.totals.planned)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{idr(budget.totals.paid)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{idr(budget.totals.remaining)}</td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </section>

          <section className={`${cardClass} space-y-2`}>
            <h3 className="font-bold text-zinc-100">Riwayat pembayaran</h3>
            {!view.payments?.length ? <p className="text-sm text-zinc-400">Belum ada pembayaran.</p> : null}
            <ul className="divide-y divide-white/10">
              {view.payments?.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-start justify-between gap-2 py-2 ${p.status === "void" ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100">
                      {idr(p.amount)} · {p.lineTitle}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {dateTime(p.paidAt)} · {p.sourceLabel} · ke {p.payee}
                      {p.reference ? ` · Ref ${p.reference}` : ""}
                    </p>
                    {p.status === "void" ? <p className="text-xs text-[#ffb4b4]">Dibatalkan: {p.voidReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1 print:hidden">
                    {p.hasProof ? (
                      <a className={smallBtn} href={`/api/event-finance/payments/${p.id}/proof`} target="_blank" rel="noreferrer">
                        <Camera size={13} /> Bukti
                      </a>
                    ) : p.status === "posted" ? (
                      <ProofUpload paymentId={p.id} onDone={() => void load(eventId)} onError={setError} />
                    ) : null}
                    {p.status === "posted" ? (
                      <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "void", payment: p })}>
                        <Ban size={13} /> Batalkan
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <ReviewCard key={view.event.id} eventId={view.event.id} review={view.review ?? null} onSave={(body) => run(() => garageApi.put("/api/event-finance/review", body))} />

          {view.comparison?.length ? (
            <section className={`${cardClass} space-y-2`}>
              <h3 className="font-bold text-zinc-100">Banding antar event</h3>
              <p className="text-xs text-zinc-400">Sponsor masuk − biaya dibayar (tanpa penjualan menu) · orang check-in · nilai evaluasi.</p>
              <ul className="divide-y divide-white/10">
                {view.comparison.map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm ${c.current ? "font-bold text-zinc-50" : "text-zinc-300"}`}>
                    <span className="min-w-0">
                      {c.title} · {c.date}
                    </span>
                    <span className="tabular-nums">
                      {idr(c.net)} · {c.checkins} org{c.rating ? ` · ${c.rating}/5` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : !loading && !view?.event ? (
        <div className={`${cardClass} text-sm text-zinc-300`}>Belum ada event. Buat event di menu Event (Garage OS) lebih dulu.</div>
      ) : null}

      {dialog?.kind === "line" && view?.event ? (
        <LineForm
          eventId={view.event.id}
          row={dialog.row}
          categories={view.categories ?? []}
          performers={view.performers ?? []}
          onClose={() => setDialog(null)}
          onSave={(body) => run(() => (dialog.row ? garageApi.patch(`/api/event-finance/lines/${dialog.row.id}`, body) : garageApi.post("/api/event-finance", body)))}
        />
      ) : null}
      {dialog?.kind === "pay" ? (
        <PayForm row={dialog.row} sources={view?.sources ?? []} today={view?.today ?? ""} onClose={() => setDialog(null)} onSave={(body) => run(() => garageApi.post("/api/event-finance/payments", body))} />
      ) : null}
      {dialog?.kind === "void" ? (
        <VoidForm payment={dialog.payment} onClose={() => setDialog(null)} onSave={(reason) => run(() => garageApi.post(`/api/event-finance/payments/${dialog.payment.id}/void`, { reason }))} />
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "border-t border-white/15 pt-2 font-bold text-zinc-50" : "text-zinc-300"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function ProofUpload({ paymentId, onDone, onError }: { paymentId: string; onDone: () => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`${smallBtn} cursor-pointer`}>
      <Camera size={13} /> {busy ? "Mengunggah…" : "Foto bukti"}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const form = new FormData();
          form.append("image", file);
          try {
            const res = await fetch(`/api/event-finance/payments/${paymentId}/proof`, { method: "POST", body: form });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Gagal mengunggah bukti.");
            onDone();
          } catch (err) {
            onError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

function LineForm({
  eventId,
  row,
  categories,
  performers,
  onClose,
  onSave,
}: {
  eventId: string;
  row: BudgetRow | null;
  categories: Option[];
  performers: Array<{ id: string; name: string; status: string }>;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [category, setCategory] = useState(row?.category ?? categories[0]?.value ?? "honor");
  const [title, setTitle] = useState(row?.title ?? "");
  const [planned, setPlanned] = useState(row ? String(row.plannedAmount) : "");
  const [performerId, setPerformerId] = useState(row?.performerId ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={row ? "Ubah pos biaya" : "Pos biaya baru"} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const body: Record<string, unknown> = {
            category,
            title: title.trim(),
            plannedAmount: Number(planned || 0),
            performerId: category === "honor" && performerId ? performerId : null,
            notes: notes.trim() || null,
          };
          if (!row) body.eventId = eventId;
          if (await onSave(body)) onClose();
          setBusy(false);
        }}
      >
        <Field label="Kategori">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nama pos biaya">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} placeholder="Mis. Sewa sound system" />
        </Field>
        <Field label="Anggaran (Rp)">
          <input className={inputClass} inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value.replace(/\D/g, ""))} placeholder="0" />
        </Field>
        {category === "honor" ? (
          <Field label="Penampil (opsional)" hint="Honor tertaut ke penampil di Lineup event ini.">
            <select className={inputClass} value={performerId} onChange={(e) => setPerformerId(e.target.value)}>
              <option value="">— Tidak ditautkan —</option>
              {performers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Catatan (opsional)">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        <button type="submit" className={primaryBtn} disabled={busy || title.trim().length < 2}>
          Simpan
        </button>
      </form>
    </Modal>
  );
}

function PayForm({
  row,
  sources,
  today,
  onClose,
  onSave,
}: {
  row: BudgetRow;
  sources: Option[];
  today: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState(row.remaining ? String(row.remaining) : "");
  const [paidAt, setPaidAt] = useState(today);
  const [source, setSource] = useState(sources[0]?.value ?? "bank_jago");
  const [payee, setPayee] = useState(row.performerName ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Satu kunci per form: tekan ganda tidak menggandakan pembayaran.
  const [idempotencyKey] = useState(() => `evpay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return (
    <Modal title={`Bayar: ${row.title}`} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await onSave({
            budgetLineId: row.id,
            amount: Number(amount || 0),
            paidAt,
            source,
            payee: payee.trim(),
            reference: reference.trim() || null,
            note: note.trim() || null,
            idempotencyKey,
          });
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <p className="text-sm text-zinc-400">
          Anggaran {idr(row.plannedAmount)} · sudah dibayar {idr(row.paid)} · sisa {idr(row.remaining)}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nominal (Rp)">
            <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
          </Field>
          <Field label="Tanggal bayar">
            <input className={inputClass} type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} required />
          </Field>
        </div>
        <Field label="Dibayar dari" hint="Rekening tercatat di buku kas. Uang pribadi Owner tidak ke buku kas tetapi tetap biaya event.">
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dibayar ke">
          <input className={inputClass} value={payee} onChange={(e) => setPayee(e.target.value)} required minLength={2} maxLength={120} placeholder="Nama penerima" />
        </Field>
        <Field label="No. referensi transfer (opsional)">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Catatan (opsional)">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <button type="submit" className={primaryBtn} disabled={busy || !Number(amount) || payee.trim().length < 2}>
          <Banknote size={16} /> Catat pembayaran
        </button>
      </form>
    </Modal>
  );
}

function VoidForm({ payment, onClose, onSave }: { payment: Payment; onClose: () => void; onSave: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Batalkan pembayaran" onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await onSave(reason.trim());
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <p className="text-sm text-zinc-300">
          {idr(payment.amount)} · {payment.lineTitle} · {payment.sourceLabel}. Riwayat tetap tersimpan; buku kas mendapat baris pembalik.
        </p>
        <Field label="Alasan">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} placeholder="Mis. salah nominal" />
        </Field>
        <button type="submit" className={primaryBtn} disabled={busy || reason.trim().length < 3}>
          {payment.amount > 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />} Batalkan
        </button>
      </form>
    </Modal>
  );
}

function ReviewCard({
  eventId,
  review,
  onSave,
}: {
  eventId: string;
  review: NonNullable<FinanceView["review"]> | null;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [rating, setRating] = useState(review?.rating ? String(review.rating) : "");
  const [highlights, setHighlights] = useState(review?.highlights ?? "");
  const [issues, setIssues] = useState(review?.issues ?? "");
  const [incidents, setIncidents] = useState(review?.incidents ?? "");
  const [nextTime, setNextTime] = useState(review?.nextTime ?? "");
  const [busy, setBusy] = useState(false);
  const area = `${inputClass.replace("h-10", "min-h-20 py-2")}`;
  return (
    <section className={`${cardClass} space-y-3`}>
      <h3 className="font-bold text-zinc-100">Evaluasi pasca-event</h3>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave({ eventId, rating: rating ? Number(rating) : null, highlights, issues, incidents, nextTime });
          setBusy(false);
        }}
      >
        <Field label="Nilai keseluruhan">
          <select className={inputClass} value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">Belum dinilai</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Yang berhasil">
          <textarea className={area} value={highlights} onChange={(e) => setHighlights(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Kendala">
          <textarea className={area} value={issues} onChange={(e) => setIssues(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Insiden (keamanan, medis, keluhan)">
          <textarea className={area} value={incidents} onChange={(e) => setIncidents(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Perbaikan untuk event berikutnya">
          <textarea className={area} value={nextTime} onChange={(e) => setNextTime(e.target.value)} maxLength={2000} />
        </Field>
        <button type="submit" className={`${primaryBtn} sm:col-span-2 print:hidden`} disabled={busy}>
          Simpan evaluasi
        </button>
      </form>
      {review?.updatedAt ? <p className="text-xs text-zinc-500">Terakhir disimpan {dateTime(review.updatedAt)}</p> : null}
    </section>
  );
}
