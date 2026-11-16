"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Gift,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Badge } from "@/components/ceo/ui/Badge";
import { garageApi, GarageApiError } from "@/lib/api-client";
import { INSTALLMENT_STATE_LABEL, OBLIGATION_STATE_LABEL, SPONSOR_STATUS_LABEL, type InstallmentState, type ObligationState } from "@/lib/event-sponsor-rules";
import type { SponsorView } from "@/lib/event-sponsor-service";

// Sponsor Event (owner 16 Nov 2026): Owner saja. Uang sponsor selalu masuk Rekening Jago dan tercatat di buku kas;
// sponsor barang hanya catatan. Semua angka dari server — layar ini tidak menghitung uang sendiri.

type ListData = {
  today: string;
  sponsors: SponsorView[];
  events: string[];
  totals: { sponsors: number; agreed: number; paid: number; remaining: number; overdue: number; inkind: number; obligationsLate: number };
};

const idr = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;
const dateLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+07:00` : iso)) : "—";
const digits = (value: string, max = 12) => value.replace(/[^\d]/g, "").slice(0, max);
const errText = (error: unknown) => (error instanceof GarageApiError || error instanceof Error ? error.message : "Gagal menyimpan.");
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[color-mix(in_srgb,var(--garage-amber)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--garage-amber)_40%,transparent)]";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_60%,transparent)] bg-[var(--garage-red)] px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const STATE_TONE: Record<InstallmentState, "success" | "amber" | "muted" | "red" | "info"> = {
  lunas: "success",
  sebagian: "amber",
  belum: "muted",
  hari_ini: "amber",
  terlambat: "red",
};
const OBLIGATION_TONE: Record<ObligationState, "success" | "amber" | "muted" | "red"> = { selesai: "success", belum: "muted", hari_ini: "amber", terlambat: "red" };

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block min-w-0 space-y-1" htmlFor={htmlFor}>
      <span className="block text-xs font-semibold text-zinc-300">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-zinc-400">{hint}</span> : null}
    </label>
  );
}

function Kpi({ label, value, tone = "default", hint, icon: Icon }: { label: string; value: string; tone?: "default" | "good" | "bad" | "warn"; hint?: string; icon: typeof Landmark }) {
  const color = tone === "good" ? "text-[#a8f0c4]" : tone === "bad" ? "text-[#ffb1b1]" : tone === "warn" ? "text-[#ffd8a8]" : "text-zinc-50";
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {label}
      </p>
      <p className={`mt-1 whitespace-nowrap font-mono text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function Progress({ paid, agreed }: { paid: number; agreed: number }) {
  const ratio = agreed > 0 ? Math.min(1, paid / agreed) : paid > 0 ? 1 : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={agreed} aria-valuenow={paid} aria-label="Uang sudah masuk" className="h-2 overflow-hidden rounded-full bg-white/10">
      <div className="h-full origin-left rounded-full bg-[#4ade80] transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

export function SponsorsPanel() {
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<null | { mode: "new" } | { mode: "edit"; sponsor: SponsorView }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await garageApi.get<ListData>("/api/sponsors", { cache: "no-store" });
      setData(next);
      setError(null);
    } catch (err) {
      setError(errText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const replaceSponsor = useCallback((view: SponsorView) => {
    setData((current) => {
      if (!current) return current;
      const exists = current.sponsors.some((s) => s.id === view.id);
      return { ...current, sponsors: exists ? current.sponsors.map((s) => (s.id === view.id ? view : s)) : [view, ...current.sponsors] };
    });
    // Ringkasan atas dihitung server: muat ulang di belakang.
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.sponsors ?? []).filter(
      (s) => (!eventFilter || s.eventName === eventFilter) && (!q || [s.name, s.sponsorNo, s.packageName ?? "", s.eventName].join(" ").toLowerCase().includes(q)),
    );
  }, [data, eventFilter, query]);
  const selected = data?.sponsors.find((s) => s.id === selectedId) ?? null;
  const totals = data?.totals;

  return (
    <div className="space-y-4" data-testid="sponsors-panel">
      <PageHeader
        kicker="Event"
        title="Sponsor"
        subtitle="Khusus Owner. Uang sponsor masuk Rekening Jago dan otomatis tercatat di buku kas serta laba rugi sebagai pendapatan lain."
        actions={
          <>
            <button type="button" onClick={() => void load()} className={ghostBtn} aria-label="Muat ulang">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
            </button>
            <button type="button" onClick={() => setForm({ mode: "new" })} className={primaryBtn} data-testid="sponsor-new">
              <Plus className="h-4 w-4" aria-hidden /> Sponsor baru
            </button>
          </>
        }
      />

      {error ? (
        <p role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] px-3 py-2 text-sm text-[#ffb1b1]">
          {error}
        </p>
      ) : null}

      {totals ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={HandCoins} label="Disepakati" value={idr(totals.agreed)} hint={`${totals.sponsors} sponsor aktif`} />
          <Kpi icon={Landmark} label="Sudah masuk (Jago)" value={idr(totals.paid)} tone="good" hint="tercatat di buku kas" />
          <Kpi icon={CircleDollarSign} label="Sisa tagihan" value={idr(totals.remaining)} tone={totals.remaining ? "warn" : "default"} />
          <Kpi icon={AlertTriangle} label="Terlambat" value={idr(totals.overdue)} tone={totals.overdue ? "bad" : "default"} hint="cicilan lewat jatuh tempo" />
          <Kpi icon={Gift} label="Sponsor barang" value={idr(totals.inkind)} hint="perkiraan, tidak masuk kas" />
          <Kpi icon={ClipboardCheck} label="Kewajiban lewat" value={String(totals.obligationsLate)} tone={totals.obligationsLate ? "bad" : "default"} hint="janji ke sponsor" />
        </div>
      ) : !error ? (
        <p className="text-sm text-zinc-400">Memuat sponsor…</p>
      ) : null}

      {data ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Event">
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={`${inputClass} w-auto min-w-[200px]`}>
              <option value="">Semua event</option>
              {data.events.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 sm:max-w-sm">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari sponsor, paket, nomor…"
              aria-label="Cari sponsor"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </label>
        </div>
      ) : null}

      {data && !data.sponsors.length ? (
        <div className="rounded-lg border border-dashed border-white/15 p-6 text-center">
          <p className="text-sm font-semibold text-zinc-200">Belum ada sponsor.</p>
          <p className="mt-1 text-sm text-zinc-400">Catat kesepakatan sponsor pertama, lalu jadwal cicilan dan kewajibannya.</p>
        </div>
      ) : null}

      {shown.length ? (
        <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3" aria-label="Daftar sponsor">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                  selectedId === s.id ? "border-white/60 bg-white/[0.06]" : "border-white/10 bg-[var(--garage-bg-2)]"
                }`}
                data-testid="sponsor-card"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-bold text-zinc-50">{s.name}</p>
                    <p className="break-words text-xs text-zinc-400">
                      {s.sponsorNo} · {s.eventName}
                      {s.packageName ? ` · ${s.packageName}` : ""}
                    </p>
                  </div>
                  <Badge tone={s.status === "aktif" ? "chrome" : s.status === "selesai" ? "success" : "muted"}>{SPONSOR_STATUS_LABEL[s.status]}</Badge>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-zinc-400">Masuk</span>
                  <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-zinc-100">
                    {idr(s.money.paid)} <span className="text-zinc-400">/ {idr(s.money.agreed)}</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Progress paid={s.money.paid} agreed={s.money.agreed} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {s.health.overdueAmount ? (
                    <Badge tone="red">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> Terlambat {idr(s.health.overdueAmount)}
                    </Badge>
                  ) : s.health.nextDue ? (
                    <Badge tone="info">
                      {s.health.nextDue.label} {idr(s.health.nextDue.amount)} · {dateLabel(s.health.nextDue.dueDate)}
                    </Badge>
                  ) : s.money.remaining === 0 && s.money.agreed > 0 ? (
                    <Badge tone="success">Lunas</Badge>
                  ) : null}
                  {s.health.obligationsTotal ? (
                    <Badge tone={s.health.obligationsLate ? "red" : "muted"}>
                      Kewajiban {s.health.obligationsDone}/{s.health.obligationsTotal}
                    </Badge>
                  ) : null}
                  {s.health.inkindValue ? <Badge tone="muted">Barang {idr(s.health.inkindValue)}</Badge> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : data && data.sponsors.length ? (
        <p className="text-sm text-zinc-400">Tidak ada sponsor yang cocok dengan filter.</p>
      ) : null}

      {selected ? (
        <Drawer title={selected.name} subtitle={`${selected.sponsorNo} · ${selected.eventName}`} onClose={() => setSelectedId(null)}>
          <SponsorDetail key={selected.id} sponsor={selected} today={data?.today ?? ""} onChanged={replaceSponsor} onEdit={() => setForm({ mode: "edit", sponsor: selected })} />
        </Drawer>
      ) : null}

      {form ? (
        <Drawer title={form.mode === "new" ? "Sponsor baru" : `Ubah ${form.sponsor.name}`} onClose={() => setForm(null)} narrow>
          <SponsorForm
            initial={form.mode === "edit" ? form.sponsor : null}
            eventNames={data?.events ?? []}
            onSaved={(view) => {
              setForm(null);
              replaceSponsor(view);
              setSelectedId(view.id);
            }}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

/** Panel samping: tablet/desktop di kanan, HP layar penuh. Tombol tutup selalu terlihat; Esc menutup. */
function Drawer({ title, subtitle, onClose, children, narrow = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; narrow?: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button type="button" aria-label="Tutup" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col border-l border-white/10 bg-[var(--garage-bg-1,#141418)] shadow-2xl outline-none motion-safe:animate-[sponsor-drawer-in_200ms_ease-out] ${narrow ? "md:w-[min(520px,100vw)]" : "md:w-[min(680px,100vw)]"}`}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-black text-zinc-50">{title}</h2>
            {subtitle ? <p className="break-words text-xs text-zinc-400">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-zinc-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
      <style>{`@keyframes sponsor-drawer-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

// ─── Form kesepakatan ──────────────────────────────────────────────────────

function SponsorForm({ initial, eventNames, onSaved }: { initial: SponsorView | null; eventNames: string[]; onSaved: (view: SponsorView) => void }) {
  const [eventName, setEventName] = useState(initial?.eventName ?? eventNames[0] ?? "");
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [packageName, setPackageName] = useState(initial?.packageName ?? "");
  const [agreed, setAgreed] = useState(initial ? String(initial.money.agreed) : "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      eventName: eventName.trim(),
      eventDate: eventDate || null,
      name: name.trim(),
      packageName: packageName.trim() || null,
      agreedAmount: Number(agreed || 0),
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      const view = initial ? await garageApi.patch<SponsorView>(`/api/sponsors/${initial.id}`, body) : await garageApi.post<SponsorView>("/api/sponsors", body);
      onSaved(view);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Nama event" hint="Contoh: GIGS AKHIR TAHUN 2026. Pilih dari daftar atau ketik baru.">
        <input list="sponsor-event-names" value={eventName} onChange={(e) => setEventName(e.target.value)} required minLength={2} maxLength={120} className={inputClass} />
        <datalist id="sponsor-event-names">
          {eventNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tanggal event">
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Paket (opsional)">
          <input value={packageName} onChange={(e) => setPackageName(e.target.value)} maxLength={60} placeholder="Gold, Silver, Media…" className={inputClass} />
        </Field>
      </div>
      <Field label="Nama sponsor">
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} className={inputClass} />
      </Field>
      <Field label="Nilai uang yang disepakati" hint={`${agreed ? idr(Number(agreed)) : "Rp0"} · sponsor barang dicatat terpisah, tidak termasuk di sini.`}>
        <input inputMode="numeric" value={agreed} onChange={(e) => setAgreed(digits(e.target.value))} placeholder="5000000" className={`${inputClass} font-mono`} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama kontak (opsional)">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={80} className={inputClass} />
        </Field>
        <Field label="WhatsApp kontak (opsional)">
          <input inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={24} placeholder="0812…" className={inputClass} />
        </Field>
      </div>
      <Field label="Catatan (opsional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className={`${inputClass} h-auto py-2`} />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-[#ffb1b1]">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy || name.trim().length < 2 || eventName.trim().length < 2} className={`${primaryBtn} w-full`} data-testid="sponsor-save">
        {busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Simpan sponsor"}
      </button>
    </form>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────

type Tab = "cicilan" | "uang" | "kewajiban" | "barang";

function SponsorDetail({ sponsor, today, onChanged, onEdit }: { sponsor: SponsorView; today: string; onChanged: (view: SponsorView) => void; onEdit: () => void }) {
  const [tab, setTab] = useState<Tab>("uang");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = sponsor.status === "batal";

  async function setStatus(status: "selesai" | "batal" | "aktif") {
    setBusy(true);
    setError(null);
    try {
      onChanged(await garageApi.post<SponsorView>(`/api/sponsors/${sponsor.id}/status`, { status, reason: status === "batal" ? reason.trim() : null }));
      setCancelOpen(false);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; count: number | null }> = [
    { id: "uang", label: "Uang masuk", count: sponsor.payments.filter((p) => p.status === "posted").length },
    { id: "cicilan", label: "Cicilan", count: sponsor.installments.length },
    { id: "kewajiban", label: "Kewajiban", count: sponsor.obligations.length },
    { id: "barang", label: "Barang", count: sponsor.inkind.length },
  ];

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={sponsor.status === "aktif" ? "chrome" : sponsor.status === "selesai" ? "success" : "muted"}>{SPONSOR_STATUS_LABEL[sponsor.status]}</Badge>
          {sponsor.packageName ? <Badge tone="amber">{sponsor.packageName}</Badge> : null}
          {sponsor.eventDate ? <span className="text-xs text-zinc-400">Event {dateLabel(sponsor.eventDate)}</span> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
          {[
            ["Disepakati", idr(sponsor.money.agreed), "text-zinc-50"],
            ["Sudah masuk", idr(sponsor.money.paid), "text-[#a8f0c4]"],
            ["Sisa", idr(sponsor.money.remaining), sponsor.money.remaining ? "text-[#ffd8a8]" : "text-zinc-50"],
            ["Terlambat", idr(sponsor.health.overdueAmount), sponsor.health.overdueAmount ? "text-[#ffb1b1]" : "text-zinc-50"],
          ].map(([label, value, tone]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-zinc-400">{label}</dt>
              <dd className={`whitespace-nowrap font-mono font-bold tabular-nums ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <Progress paid={sponsor.money.paid} agreed={sponsor.money.agreed} />
        {sponsor.money.overpaid ? <p className="text-xs text-[#ffd8a8]">Uang masuk melebihi kesepakatan {idr(sponsor.money.overpaid)}. Cek nilai kesepakatan atau batalkan pembayaran yang salah.</p> : null}
        <p className="text-xs text-zinc-400">
          Total dukungan {idr(sponsor.health.totalSupport)} (uang + perkiraan nilai barang {idr(sponsor.health.inkindValue)}).
          {sponsor.contactName || sponsor.contactPhone ? (
            <>
              {" "}
              Kontak: {sponsor.contactName ?? "—"}
              {sponsor.contactPhone ? (
                <>
                  {" · "}
                  <a className="font-semibold text-[#ffd8a8] underline-offset-2 hover:underline" href={`https://wa.me/62${sponsor.contactPhone.replace(/^0/, "")}`} target="_blank" rel="noreferrer">
                    {sponsor.contactPhone}
                  </a>
                </>
              ) : null}
            </>
          ) : null}
        </p>
        {sponsor.notes ? <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{sponsor.notes}</p> : null}
        {sponsor.cancelReason ? <p className="text-sm text-[#ffb1b1]">Dibatalkan: {sponsor.cancelReason}</p> : null}
        {!locked ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className={ghostBtn}>
              <Pencil className="h-4 w-4" aria-hidden /> Ubah kesepakatan
            </button>
            {sponsor.status === "aktif" ? (
              <button type="button" disabled={busy} onClick={() => void setStatus("selesai")} className={ghostBtn}>
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Tandai selesai
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void setStatus("aktif")} className={ghostBtn}>
                Aktifkan lagi
              </button>
            )}
            <button type="button" onClick={() => setCancelOpen((v) => !v)} className={`${ghostBtn} text-[#ffb1b1]`} aria-expanded={cancelOpen}>
              <Ban className="h-4 w-4" aria-hidden /> Batalkan sponsor
            </button>
          </div>
        ) : null}
        {cancelOpen ? (
          <div className="space-y-2 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] p-2">
            <Field label="Alasan pembatalan (wajib, tercatat di audit)" hint="Uang yang sudah masuk tetap tercatat. Bila harus dikembalikan, batalkan pembayarannya satu per satu.">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} />
            </Field>
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void setStatus("batal")} className={`${primaryBtn} w-full`}>
              Batalkan sponsor
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[#ffb1b1]">
            {error}
          </p>
        ) : null}
      </section>

      <div role="tablist" aria-label="Rincian sponsor" className="grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`min-h-10 rounded-md px-1 text-xs font-semibold sm:text-sm ${tab === item.id ? "bg-white/10 text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            {item.label}
            {item.count ? <span className="ml-1 font-mono text-[11px] text-zinc-400">{item.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "uang" ? <PaymentsTab sponsor={sponsor} today={today} locked={locked} onChanged={onChanged} /> : null}
        {tab === "cicilan" ? <InstallmentsTab sponsor={sponsor} locked={locked} onChanged={onChanged} /> : null}
        {tab === "kewajiban" ? <ObligationsTab sponsor={sponsor} locked={locked} onChanged={onChanged} /> : null}
        {tab === "barang" ? <InkindTab sponsor={sponsor} locked={locked} onChanged={onChanged} /> : null}
      </div>
    </div>
  );
}

async function uploadProof(path: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(path, { method: "POST", body: form, credentials: "same-origin" });
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `Gagal mengunggah (${res.status}).`);
}

function ProofButtons({ path, hasProof, onUploaded, disabled }: { path: string; hasProof: boolean; onUploaded: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {hasProof ? (
        <a href={path} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#ffd8a8] underline-offset-2 hover:underline">
          Lihat bukti
        </a>
      ) : null}
      {!disabled ? (
        <>
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex h-9 items-center gap-1 rounded-md border border-white/15 px-2 text-xs font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-50">
            <Camera className="h-3.5 w-3.5" aria-hidden /> {busy ? "Mengunggah…" : hasProof ? "Ganti foto" : "Foto bukti"}
          </button>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                await uploadProof(path, file);
                onUploaded();
              } catch (err) {
                setError(errText(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : null}
      {error ? <span className="text-xs text-[#ffb1b1]">{error}</span> : null}
    </span>
  );
}

function PaymentsTab({ sponsor, today, locked, onChanged }: { sponsor: SponsorView; today: string; locked: boolean; onChanged: (view: SponsorView) => void }) {
  const [amount, setAmount] = useState(sponsor.health.nextDue ? String(sponsor.health.nextDue.amount) : "");
  const [receivedAt, setReceivedAt] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const refresh = async () => onChanged(await garageApi.get<SponsorView>(`/api/sponsors/${sponsor.id}`, { cache: "no-store" }));

  async function record() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await garageApi.post<{ sponsor: SponsorView; lockedDayWarning: string | null; replay: boolean }>(`/api/sponsors/${sponsor.id}/payments`, {
        amount: Number(amount),
        receivedAt,
        reference: reference.trim(),
        note: note.trim() || null,
        idempotencyKey: key,
      });
      onChanged(res.sponsor);
      setNotice(res.lockedDayWarning ?? `${idr(Number(amount))} tercatat masuk Rekening Jago.`);
      setAmount("");
      setReference("");
      setNote("");
      setKey(newKey());
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment(id: string) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await garageApi.post<SponsorView>(`/api/sponsors/payments/${id}/void`, { reason: voidReason.trim() }));
      setVoidFor(null);
      setVoidReason("");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!locked ? (
        <form
          className="space-y-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void record();
          }}
        >
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-100">
            <Landmark className="h-4 w-4 text-[#a8f0c4]" aria-hidden /> Catat uang masuk Rekening Jago
          </h3>
          <p className="text-xs text-zinc-400">Catat setelah mutasi terlihat di Rekening Jago. Satu catatan = satu baris buku kas, tidak bisa diedit (salah catat → batalkan).</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Nominal" hint={amount ? idr(Number(amount)) : undefined}>
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value))} required className={`${inputClass} font-mono`} data-testid="sponsor-pay-amount" />
            </Field>
            <Field label="Tanggal masuk">
              <input type="date" value={receivedAt} max={today} onChange={(e) => setReceivedAt(e.target.value)} required className={inputClass} />
            </Field>
          </div>
          <Field label="No. referensi mutasi Jago" hint="Dari detail transaksi di aplikasi Jago. Satu referensi hanya bisa dicatat sekali.">
            <input value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} maxLength={80} className={inputClass} data-testid="sponsor-pay-ref" />
          </Field>
          <Field label="Catatan (opsional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="mis. DP paket Gold" className={inputClass} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-[#ffb1b1]">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-[#a8f0c4]">
              {notice}
            </p>
          ) : null}
          <button type="submit" disabled={busy || !Number(amount) || reference.trim().length < 4} className={`${primaryBtn} w-full`} data-testid="sponsor-pay-save">
            {busy ? "Menyimpan…" : "Catat uang masuk"}
          </button>
        </form>
      ) : null}

      {sponsor.payments.length ? (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10" aria-label="Riwayat uang masuk">
          {sponsor.payments.map((p) => (
            <li key={p.id} className={`space-y-1.5 p-3 ${p.status === "void" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`whitespace-nowrap font-mono text-base font-bold tabular-nums ${p.status === "void" ? "text-zinc-400 line-through" : "text-[#a8f0c4]"}`}>{idr(p.amount)}</span>
                <span className="text-sm text-zinc-300">{dateLabel(p.receivedAt)}</span>
                {p.status === "void" ? <Badge tone="muted">Dibatalkan</Badge> : <Badge tone="success">Masuk Jago</Badge>}
              </div>
              <p className="break-words text-xs text-zinc-400">
                Ref {p.reference}
                {p.note ? ` · ${p.note}` : ""}
                {p.voidReason ? ` · batal: ${p.voidReason}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ProofButtons path={`/api/sponsors/payments/${p.id}/proof`} hasProof={p.hasProof} onUploaded={() => void refresh()} disabled={p.status === "void"} />
                {p.status === "posted" ? (
                  <button type="button" onClick={() => setVoidFor(voidFor === p.id ? null : p.id)} className="inline-flex h-9 items-center rounded-md px-2 text-xs font-semibold text-[#ffb1b1] hover:bg-white/5" aria-expanded={voidFor === p.id}>
                    Batalkan
                  </button>
                ) : null}
              </div>
              {voidFor === p.id ? (
                <div className="flex flex-wrap gap-2">
                  <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Alasan pembatalan (wajib)…" aria-label="Alasan pembatalan" maxLength={300} className={`${inputClass} flex-1`} />
                  <button type="button" disabled={busy || voidReason.trim().length < 3} onClick={() => void voidPayment(p.id)} className={primaryBtn}>
                    Batalkan
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400">Belum ada uang masuk.</p>
      )}
    </div>
  );
}

function InstallmentsTab({ sponsor, locked, onChanged }: { sponsor: SponsorView; locked: boolean; onChanged: (view: SponsorView) => void }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => sponsor.installments.map((i) => ({ label: i.label, amount: String(i.amount), dueDate: i.dueDate })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const over = total > sponsor.money.agreed;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onChanged(
        await garageApi.put<SponsorView>(`/api/sponsors/${sponsor.id}/installments`, {
          installments: rows.map((r) => ({ label: r.label.trim(), amount: Number(r.amount), dueDate: r.dueDate })),
        }),
      );
      setEditing(false);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-white/10 p-2 sm:grid-cols-[minmax(0,1fr)_9rem_10rem_auto]">
            <input value={row.label} onChange={(e) => setRows((list) => list.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))} placeholder="DP / Termin 2 / Pelunasan" aria-label={`Nama cicilan ${index + 1}`} maxLength={40} className={`${inputClass} col-span-2 sm:col-span-1`} />
            <input inputMode="numeric" value={row.amount} onChange={(e) => setRows((list) => list.map((r, i) => (i === index ? { ...r, amount: digits(e.target.value) } : r)))} placeholder="Nominal" aria-label={`Nominal cicilan ${index + 1}`} className={`${inputClass} font-mono`} />
            <input type="date" value={row.dueDate} onChange={(e) => setRows((list) => list.map((r, i) => (i === index ? { ...r, dueDate: e.target.value } : r)))} aria-label={`Jatuh tempo cicilan ${index + 1}`} className={inputClass} />
            <button type="button" onClick={() => setRows((list) => list.filter((_, i) => i !== index))} aria-label={`Hapus cicilan ${index + 1}`} className="grid h-10 w-10 place-items-center rounded-md text-zinc-400 hover:bg-white/5 hover:text-[#ffb1b1]">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((list) => [...list, { label: list.length ? "Pelunasan" : "DP", amount: "", dueDate: "" }])} className={ghostBtn}>
          <Plus className="h-4 w-4" aria-hidden /> Tambah cicilan
        </button>
        <p className={`text-sm ${over ? "text-[#ffb1b1]" : "text-zinc-300"}`}>
          Total jadwal <span className="font-mono font-semibold">{idr(total)}</span> dari kesepakatan <span className="font-mono font-semibold">{idr(sponsor.money.agreed)}</span>
          {over ? " — melebihi kesepakatan." : total < sponsor.money.agreed ? ` · ${idr(sponsor.money.agreed - total)} belum dijadwalkan.` : " · pas."}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-[#ffb1b1]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className={ghostBtn}>
            Batal
          </button>
          <button type="button" disabled={busy || over || rows.some((r) => !r.label.trim() || !Number(r.amount) || !r.dueDate)} onClick={() => void save()} className={`${primaryBtn} flex-1`}>
            {busy ? "Menyimpan…" : "Simpan jadwal"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">Uang masuk dibagikan otomatis ke cicilan dengan jatuh tempo paling awal. Pengingat ke HP Owner: 3 hari sebelum, hari H, dan bila terlambat.</p>
      {sponsor.installments.length ? (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10" aria-label="Jadwal cicilan">
          {sponsor.installments.map((i) => (
            <li key={i.id ?? i.seq} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-100">{i.label}</p>
                <p className="text-xs text-zinc-400">
                  Jatuh tempo {dateLabel(i.dueDate)}
                  {i.daysLate ? ` · terlambat ${i.daysLate} hari` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="whitespace-nowrap font-mono text-sm font-bold tabular-nums text-zinc-100">{idr(i.amount)}</p>
                {i.paidPart && i.remainingPart ? <p className="whitespace-nowrap font-mono text-xs text-zinc-400">sisa {idr(i.remainingPart)}</p> : null}
              </div>
              <Badge tone={STATE_TONE[i.state]}>{INSTALLMENT_STATE_LABEL[i.state]}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400">Belum ada jadwal cicilan.</p>
      )}
      {sponsor.unscheduled ? <p className="text-sm text-[#ffd8a8]">{idr(sponsor.unscheduled)} dari kesepakatan belum dijadwalkan (tanpa pengingat).</p> : null}
      {!locked ? (
        <button
          type="button"
          onClick={() => {
            setRows(sponsor.installments.length ? sponsor.installments.map((i) => ({ label: i.label, amount: String(i.amount), dueDate: i.dueDate })) : [{ label: "DP", amount: "", dueDate: "" }]);
            setEditing(true);
          }}
          className={ghostBtn}
        >
          <Pencil className="h-4 w-4" aria-hidden /> {sponsor.installments.length ? "Ubah jadwal" : "Buat jadwal cicilan"}
        </button>
      ) : null}
    </div>
  );
}

function ObligationsTab({ sponsor, locked, onChanged }: { sponsor: SponsorView; locked: boolean; onChanged: (view: SponsorView) => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => onChanged(await garageApi.get<SponsorView>(`/api/sponsors/${sponsor.id}`, { cache: "no-store" }));

  async function run(action: () => Promise<SponsorView>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!locked ? (
        <form
          className="grid gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const sent = title;
            void run(() => garageApi.post<SponsorView>(`/api/sponsors/${sponsor.id}/obligations`, { title: sent.trim(), dueDate: dueDate || null })).then(() => {
              // Hanya kosongkan bila belum diketik ulang selama menyimpan.
              setTitle((current) => (current === sent ? "" : current));
              setDueDate("");
            });
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Janji ke sponsor: logo di poster, disebut MC, booth…" aria-label="Kewajiban baru" maxLength={160} className={inputClass} />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Tenggat kewajiban" className={inputClass} />
          <button type="submit" disabled={busy || title.trim().length < 2} className={primaryBtn}>
            <Plus className="h-4 w-4" aria-hidden /> Tambah
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#ffb1b1]">
          {error}
        </p>
      ) : null}
      {sponsor.obligations.length ? (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10" aria-label="Kewajiban ke sponsor">
          {sponsor.obligations.map((o) => (
            <li key={o.id} className="space-y-1.5 p-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={o.state === "selesai"}
                  disabled={busy || locked}
                  onChange={(e) => void run(() => garageApi.patch<SponsorView>(`/api/sponsors/obligations/${o.id}`, { done: e.target.checked }))}
                  aria-label={`Tandai selesai: ${o.title}`}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#4ade80]"
                />
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-sm font-semibold ${o.state === "selesai" ? "text-zinc-400" : "text-zinc-100"}`}>{o.title}</p>
                  <p className="text-xs text-zinc-400">
                    {o.dueDate ? `Tenggat ${dateLabel(o.dueDate)}` : "Tanpa tenggat"}
                    {o.doneAt ? ` · selesai ${dateLabel(o.doneAt)}` : ""}
                    {o.doneNote ? ` · ${o.doneNote}` : ""}
                  </p>
                </div>
                <Badge tone={OBLIGATION_TONE[o.state]}>{OBLIGATION_STATE_LABEL[o.state]}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-7">
                <ProofButtons path={`/api/sponsors/obligations/${o.id}/proof`} hasProof={o.hasProof} onUploaded={() => void refresh()} disabled={locked} />
                {!locked && o.state !== "selesai" ? (
                  <button type="button" disabled={busy} onClick={() => void run(() => garageApi.patch<SponsorView>(`/api/sponsors/obligations/${o.id}`, { archive: true }))} className="inline-flex h-9 items-center rounded-md px-2 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-[#ffb1b1]">
                    Hapus
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400">Belum ada kewajiban. Catat semua yang dijanjikan ke sponsor supaya tidak ada yang terlewat.</p>
      )}
    </div>
  );
}

function InkindTab({ sponsor, locked, onChanged }: { sponsor: SponsorView; locked: boolean; onChanged: (view: SponsorView) => void }) {
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [value, setValue] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function run(action: () => Promise<SponsorView>, done?: () => void) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
      done?.();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">Barang dari sponsor (produk, peralatan, voucher). Nilai hanya perkiraan untuk laporan dukungan; tidak masuk buku kas atau laba rugi.</p>
      {!locked ? (
        <form
          className="space-y-2 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                garageApi.post<SponsorView>(`/api/sponsors/${sponsor.id}/inkind`, {
                  item: item.trim(),
                  qty: Number(qty || 1),
                  unit: unit.trim() || null,
                  estimatedValue: Number(value || 0),
                  receivedAt: receivedAt || null,
                }),
              () => {
                setItem("");
                setQty("1");
                setUnit("");
                setValue("");
                setReceivedAt("");
              },
            );
          }}
        >
          <Field label="Barang">
            <input value={item} onChange={(e) => setItem(e.target.value)} maxLength={120} placeholder="mis. Kopi bubuk 1 kg" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Jumlah">
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(digits(e.target.value, 7))} className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Satuan">
              <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="pak, dus…" className={inputClass} />
            </Field>
            <Field label="Perkiraan nilai" hint={value ? idr(Number(value)) : undefined}>
              <input inputMode="numeric" value={value} onChange={(e) => setValue(digits(e.target.value))} className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Diterima">
              <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <button type="submit" disabled={busy || item.trim().length < 2 || !Number(qty)} className={`${primaryBtn} w-full`}>
            <Gift className="h-4 w-4" aria-hidden /> Catat barang
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#ffb1b1]">
          {error}
        </p>
      ) : null}
      {sponsor.inkind.length ? (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10" aria-label="Sponsor barang">
          {sponsor.inkind.map((k) => (
            <li key={k.id} className="space-y-1.5 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="min-w-0 flex-1 break-words text-sm font-semibold text-zinc-100">
                  {k.qty} {k.unit ?? "×"} {k.item}
                </span>
                <span className="whitespace-nowrap font-mono text-sm tabular-nums text-zinc-200">{idr(k.estimatedValue)}</span>
              </div>
              <p className="text-xs text-zinc-400">
                {k.receivedAt ? `Diterima ${dateLabel(k.receivedAt)}` : "Belum diterima"}
                {k.note ? ` · ${k.note}` : ""}
              </p>
              {!locked ? (
                removeFor === k.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan hapus (wajib)…" aria-label="Alasan hapus" maxLength={300} className={`${inputClass} flex-1`} />
                    <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => garageApi.post<SponsorView>(`/api/sponsors/inkind/${k.id}/archive`, { reason: reason.trim() }), () => setReason(""))} className={primaryBtn}>
                      Hapus
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setRemoveFor(k.id)} className="inline-flex h-9 items-center rounded-md px-2 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-[#ffb1b1]">
                    Hapus
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400">Belum ada sponsor barang.</p>
      )}
    </div>
  );
}
