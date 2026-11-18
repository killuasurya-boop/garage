"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, ExternalLink, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { EventControlNav, StepHint } from "@/components/ceo/ui/EventControlNav";
import { garageApi, GarageApiError } from "@/lib/api-client";
import { EMPTY_PUBLIC_FINANCE, PAY_KINDS, PUBLIC_STAGE_LABEL, PUBLIC_STAGES, publicFinanceTotals, type PublicFinance } from "@/lib/event-public-finance-rules";

// Transparansi dana publik (Owner 18 Nov 2026: "bisa diubah bebas"). Angka di layar ini tampil di menu Transparansi
// halaman event GIGS bila diaktifkan. BUKAN buku kas: uang sungguhan tetap dicatat di Sponsor & Keuangan Event.

type MasterEvent = { id: string; title: string; date: string };
type View = {
  masterEvents: MasterEvent[];
  event: { id: string; title: string; eventUrl: string | null } | null;
  enabled?: boolean;
  data?: PublicFinance;
  saved?: boolean;
  updatedAt?: string | null;
};

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[color-mix(in_srgb,var(--garage-amber)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--garage-amber)_40%,transparent)]";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_60%,transparent)] bg-[var(--garage-red)] px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const iconBtn =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-white/15 text-zinc-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const cardClass = "rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-4";

const errText = (e: unknown) => (e instanceof GarageApiError ? e.message : e instanceof Error ? e.message : "Terjadi kesalahan.");
const rp = (n: number) => `${n < 0 ? "−" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;
const digits = (v: string) => Math.min(10_000_000_000, Number(v.replace(/[^0-9]/g, "")) || 0);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const PAY_LABEL: Record<string, string> = { "": "—", dp: "DP", termin: "Termin", pelunasan: "Pelunasan", lunas: "Lunas" };

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid min-w-0 gap-1 text-xs font-semibold text-zinc-300 ${className}`}>
      {label}
      {children}
    </label>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <input className={`${inputClass} text-right tabular-nums`} inputMode="numeric" value={value ? value.toLocaleString("id-ID") : ""} placeholder="0" onChange={(e) => onChange(digits(e.target.value))} />
    </Field>
  );
}

export function TransparencyPanel({ initialEventId }: { initialEventId: string | null }) {
  const [view, setView] = useState<View | null>(null);
  const [eventId, setEventId] = useState<string | null>(initialEventId);
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<PublicFinance>(EMPTY_PUBLIC_FINANCE);
  const [notesText, setNotesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (next: View) => {
    setView(next);
    setEventId(next.event?.id ?? null);
    setEnabled(Boolean(next.enabled));
    setData(next.data ?? EMPTY_PUBLIC_FINANCE);
    setNotesText((next.data?.notes ?? []).join("\n"));
  };

  const load = useCallback(async (id: string | null) => {
    setError(null);
    setNotice(null);
    try {
      apply(await garageApi.get<View>(`/api/event-transparency${id ? `?eventId=${id}` : ""}`, { cache: "no-store" }));
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<View>(`/api/event-transparency${initialEventId ? `?eventId=${initialEventId}` : ""}`, { cache: "no-store" })
      .then((next) => alive && apply(next))
      .catch((e) => alive && setError(errText(e)));
    return () => {
      alive = false;
    };
  }, [initialEventId]);

  const totals = useMemo(() => publicFinanceTotals(data), [data]);
  const set = (patch: Partial<PublicFinance>) => setData((d) => ({ ...d, ...patch }));
  const setLine = (index: number, patch: Partial<PublicFinance["budgetLines"][number]>) =>
    set({ budgetLines: data.budgetLines.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const setIncome = (index: number, patch: Partial<PublicFinance["incomes"][number]>) => set({ incomes: data.incomes.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const setExpense = (index: number, patch: Partial<PublicFinance["expenses"][number]>) => set({ expenses: data.expenses.map((l, i) => (i === index ? { ...l, ...patch } : l)) });

  // Hanya setelah data event termuat (kalau tidak, muatan awal yang datang belakangan menimpa isian).
  const ready = Boolean(view?.event && view.event.id === eventId);
  const prefill = async () => {
    if (!eventId || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await garageApi.get<{ data: PublicFinance }>(`/api/event-transparency/prefill?eventId=${eventId}`, { cache: "no-store" });
      setData(res.data);
      setNotesText(res.data.notes.join("\n"));
      setNotice("Angka platform dimuat ke formulir. Ubah bila perlu, lalu Simpan.");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!eventId || !ready) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = { enabled, data: { ...data, notes: notesText.split("\n").map((n) => n.trim()).filter(Boolean).slice(0, 10) } };
      apply(await garageApi.put<View>(`/api/event-transparency?eventId=${eventId}`, body));
      setNotice(enabled ? "Tersimpan. Angka ini sekarang tampil di halaman event." : "Tersimpan, tetapi belum ditampilkan (centang “Tampilkan” untuk menayangkan).");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Event"
        title="Transparansi Dana"
        subtitle="Angka di menu Transparansi halaman event (target, RAB, dana masuk & keluar). Diisi bebas oleh Owner — bukan buku kas."
        actions={
          <button type="button" className={ghostBtn} onClick={() => void load(eventId)} disabled={busy}>
            <RefreshCw size={16} aria-hidden /> Muat ulang
          </button>
        }
      />
      <EventControlNav current="transparansi" eventId={eventId} />
      <StepHint
        label="Cara mengisi transparansi"
        steps={["“Isi dari angka platform” untuk mulai dari data yang sudah tampil", "Ubah target, pos RAB, dana masuk & keluar sesuka Anda", "Centang “Tampilkan” lalu Simpan → langsung tampil di halaman event"]}
      />

      <div className={`${cardClass} grid gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:items-end`}>
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghostBtn} onClick={() => void prefill()} disabled={busy || !ready}>
            <Download size={16} aria-hidden /> Isi dari angka platform
          </button>
          {ready ? (
            <button type="button" className={primaryBtn} onClick={() => void save()} disabled={busy}>
              <Save size={16} aria-hidden /> Simpan
            </button>
          ) : null}
                    {view?.event?.eventUrl ? (
            <a className={ghostBtn} href={view.event.eventUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden /> Lihat halaman event
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] px-3 py-2 text-sm text-[#ffd0d0]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
          {notice}
        </p>
      ) : null}

      {view?.event ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Ringkasan">
            {[
              ["Target", rp(data.target)],
              ["Dana masuk", rp(totals.income)],
              ["Dana keluar", rp(totals.expense)],
              ["Saldo", rp(totals.balance)],
              ["Terkumpul", `${totals.percent.toLocaleString("id-ID")}%`],
            ].map(([label, value]) => (
              <div key={label} className={`${cardClass} p-3`}>
                <p className="text-xs font-semibold text-zinc-400">{label}</p>
                <p className="break-words text-lg font-black tabular-nums text-zinc-50">{value}</p>
              </div>
            ))}
          </div>

          <section className={`${cardClass} space-y-3`} aria-labelledby="tr-target">
            <h2 id="tr-target" className="text-sm font-black uppercase tracking-wide text-zinc-100">
              Target & sponsor berkomitmen
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Money label="Target dana" value={data.target} onChange={(n) => set({ target: n })} />
              <Field label="Jumlah sponsor berkomitmen">
                <input className={`${inputClass} text-right tabular-nums`} inputMode="numeric" value={data.committedCount || ""} placeholder="0" onChange={(e) => set({ committedCount: Math.min(1000, digits(e.target.value)) })} />
              </Field>
              <Money label="Nilai komitmen (belum masuk)" value={data.committedAmount} onChange={(n) => set({ committedAmount: n })} />
            </div>
          </section>

          <section className={`${cardClass} space-y-3`} aria-labelledby="tr-rab">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="tr-rab" className="text-sm font-black uppercase tracking-wide text-zinc-100">
                Pos RAB · total {rp(totals.rab)}
              </h2>
              <button
                type="button"
                className={ghostBtn}
                onClick={() =>
                  set({ budgetLines: [...data.budgetLines, { code: String(data.budgetLines.length + 1).padStart(2, "0"), name: "", budget: 0, purpose: "", pic: "", needsVendor: true, contracted: 0, stage: "belum-dipesan" }] })
                }
              >
                <Plus size={16} aria-hidden /> Tambah pos
              </button>
            </div>
            {!data.budgetLines.length ? <p className="text-sm text-zinc-400">Belum ada pos. Tambah pos atau isi dari angka platform.</p> : null}
            <ul className="space-y-3">
              {data.budgetLines.map((line, i) => (
                <li key={i} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3 sm:grid-cols-[5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Kode">
                    <input className={inputClass} value={line.code} maxLength={6} onChange={(e) => setLine(i, { code: e.target.value })} />
                  </Field>
                  <Field label="Nama pos">
                    <input className={inputClass} value={line.name} maxLength={80} onChange={(e) => setLine(i, { name: e.target.value })} />
                  </Field>
                  <Money label="Anggaran" value={line.budget} onChange={(n) => setLine(i, { budget: n })} />
                  <Money label="Sudah dipesan" value={line.contracted} onChange={(n) => setLine(i, { contracted: n })} />
                  <Field label="Tahap">
                    <select className={inputClass} value={line.stage} onChange={(e) => setLine(i, { stage: e.target.value as PublicFinance["budgetLines"][number]["stage"] })}>
                      {PUBLIC_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {PUBLIC_STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" className={iconBtn} aria-label={`Hapus pos ${line.code} ${line.name}`} onClick={() => set({ budgetLines: data.budgetLines.filter((_, j) => j !== i) })}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                  <Field label="Untuk apa" className="sm:col-span-3">
                    <input className={inputClass} value={line.purpose} maxLength={300} onChange={(e) => setLine(i, { purpose: e.target.value })} />
                  </Field>
                  <Field label="PIC">
                    <input className={inputClass} value={line.pic} maxLength={60} onChange={(e) => setLine(i, { pic: e.target.value })} />
                  </Field>
                  <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200 sm:col-span-2">
                    <input type="checkbox" className="size-4" checked={line.needsVendor} onChange={(e) => setLine(i, { needsVendor: e.target.checked })} /> Perlu vendor
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${cardClass} space-y-3`} aria-labelledby="tr-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="tr-in" className="text-sm font-black uppercase tracking-wide text-zinc-100">
                Dana masuk · {rp(totals.income)}
              </h2>
              <button type="button" className={ghostBtn} onClick={() => set({ incomes: [...data.incomes, { date: today(), from: "", amount: 0 }] })}>
                <Plus size={16} aria-hidden /> Tambah dana masuk
              </button>
            </div>
            {!data.incomes.length ? <p className="text-sm text-zinc-400">Belum ada dana masuk.</p> : null}
            <ul className="space-y-2">
              {data.incomes.map((row, i) => (
                <li key={i} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-end">
                  <Field label="Tanggal">
                    <input type="date" className={inputClass} value={row.date} onChange={(e) => setIncome(i, { date: e.target.value })} />
                  </Field>
                  <Field label="Dari (nama sponsor/donatur, boleh kosong)">
                    <input className={inputClass} value={row.from} maxLength={120} onChange={(e) => setIncome(i, { from: e.target.value })} />
                  </Field>
                  <Money label="Jumlah" value={row.amount} onChange={(n) => setIncome(i, { amount: n })} />
                  <button type="button" className={iconBtn} aria-label={`Hapus dana masuk ${i + 1}`} onClick={() => set({ incomes: data.incomes.filter((_, j) => j !== i) })}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${cardClass} space-y-3`} aria-labelledby="tr-out">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="tr-out" className="text-sm font-black uppercase tracking-wide text-zinc-100">
                Dana keluar · {rp(totals.expense)}
              </h2>
              <button
                type="button"
                className={ghostBtn}
                disabled={!data.budgetLines.length}
                onClick={() => set({ expenses: [...data.expenses, { date: today(), code: data.budgetLines[0]?.code ?? "", description: "", payKind: "", amount: 0 }] })}
              >
                <Plus size={16} aria-hidden /> Tambah dana keluar
              </button>
            </div>
            {!data.expenses.length ? <p className="text-sm text-zinc-400">{data.budgetLines.length ? "Belum ada dana keluar." : "Tambah pos RAB dulu."}</p> : null}
            <ul className="space-y-2">
              {data.expenses.map((row, i) => (
                <li key={i} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1.2fr)_8rem_minmax(0,11rem)_auto] sm:items-end">
                  <Field label="Tanggal">
                    <input type="date" className={inputClass} value={row.date} onChange={(e) => setExpense(i, { date: e.target.value })} />
                  </Field>
                  <Field label="Pos RAB">
                    <select className={inputClass} value={row.code} onChange={(e) => setExpense(i, { code: e.target.value })}>
                      {data.budgetLines.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code} · {l.name || "Pos"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Keterangan">
                    <input className={inputClass} value={row.description} maxLength={200} onChange={(e) => setExpense(i, { description: e.target.value })} />
                  </Field>
                  <Field label="Jenis">
                    <select className={inputClass} value={row.payKind} onChange={(e) => setExpense(i, { payKind: e.target.value as PublicFinance["expenses"][number]["payKind"] })}>
                      {PAY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {PAY_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Money label="Jumlah" value={row.amount} onChange={(n) => setExpense(i, { amount: n })} />
                  <button type="button" className={iconBtn} aria-label={`Hapus dana keluar ${i + 1}`} onClick={() => set({ expenses: data.expenses.filter((_, j) => j !== i) })}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${cardClass} space-y-2`} aria-labelledby="tr-notes">
            <h2 id="tr-notes" className="text-sm font-black uppercase tracking-wide text-zinc-100">
              Catatan RAB
            </h2>
            <Field label="Satu catatan per baris (maks. 10)">
              <textarea className={`${inputClass} h-24 py-2`} value={notesText} onChange={(e) => setNotesText(e.target.value)} />
            </Field>
          </section>

          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 border-white/20`}>
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <input type="checkbox" className="size-5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Tampilkan angka ini di halaman event
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">
                {view.saved && view.updatedAt ? `Terakhir disimpan ${new Date(view.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB` : "Belum pernah disimpan"}
              </span>
              <button type="button" className={primaryBtn} onClick={() => void save()} disabled={busy}>
                <Save size={16} aria-hidden /> Simpan
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
