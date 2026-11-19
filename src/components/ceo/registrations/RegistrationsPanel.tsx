"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ExternalLink, MessageCircle, Pencil, RefreshCw, XCircle } from "lucide-react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { EventControlNav, StepHint } from "@/components/ceo/ui/EventControlNav";
import { Badge } from "@/components/ceo/ui/Badge";
import { garageApi, GarageApiError } from "@/lib/api-client";

// Pendaftar GIGS (Owner 18 Nov 2026, satu pintu): isian form "Daftar" halaman event masuk ke sini. Setujui = penampil /
// sponsor / panitia dibuat & langsung tampil; Minta revisi & Tolak wajib catatan (terbaca pendaftar lewat ID + kode).

type MasterEvent = { id: string; title: string; date: string };
type Registration = {
  id: string;
  type: "creator" | "sponsor" | "crew";
  status: "diajukan" | "revisi" | "disetujui" | "ditolak";
  name: string;
  pic: string;
  whatsapp: string;
  instagram: string | null;
  description: string | null;
  category: string | null;
  address: string | null;
  amount: number | null;
  members: number | null;
  role: string | null;
  attendance: string | null;
  portfolio: string | null;
  tech: string | null;
  diet: string | null;
  logoUrl: string | null;
  setlist: Array<{ title: string; writer: string; kind: string }>;
  reviewNote: string | null;
  linked: boolean;
  createdAt: string;
};
type View = { masterEvents: MasterEvent[]; eventId: string | null; registrations: Registration[] };

const TYPE_LABEL = { creator: "Kreator", sponsor: "Sponsor", crew: "Kru" } as const;
const STATUS: Record<Registration["status"], { label: string; tone: "amber" | "red" | "success" | "muted" }> = {
  diajukan: { label: "Menunggu", tone: "amber" },
  revisi: { label: "Perlu revisi", tone: "amber" },
  disetujui: { label: "Disetujui", tone: "success" },
  ditolak: { label: "Ditolak", tone: "muted" },
};
const ATTEND: Record<string, string> = { persiapan: "Persiapan (H-1)", "hari-h-penuh": "Hari H penuh", "hari-h-sore": "Hari H sore–malam" };

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[color-mix(in_srgb,var(--garage-amber)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--garage-amber)_40%,transparent)]";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_60%,transparent)] bg-[var(--garage-red)] px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const chipBtn = "inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const cardClass = "rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-4";

const errText = (e: unknown) => (e instanceof GarageApiError ? e.message : e instanceof Error ? e.message : "Terjadi kesalahan.");
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const waLink = (wa: string) => `https://wa.me/${wa.replace(/[^0-9]/g, "")}`;
const localWa = (wa: string) => (wa.startsWith("62") ? `0${wa.slice(2)}` : wa);

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-zinc-400">{label}</dt>
      <dd className="break-words text-sm text-zinc-100">{children}</dd>
    </div>
  );
}

export function RegistrationsPanel({ initialEventId }: { initialEventId: string | null }) {
  const [view, setView] = useState<View | null>(null);
  const [eventId, setEventId] = useState<string | null>(initialEventId);
  const [type, setType] = useState<"all" | Registration["type"]>("all");
  const [status, setStatus] = useState<"open" | "all" | Registration["status"]>("open");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<View>(`/api/event-registrations${id ? `?eventId=${id}` : ""}`, { cache: "no-store" });
      setView(data);
      setEventId(data.eventId);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<View>(`/api/event-registrations${initialEventId ? `?eventId=${initialEventId}` : ""}`, { cache: "no-store" })
      .then((data) => {
        if (!alive) return;
        setView(data);
        setEventId(data.eventId);
      })
      .catch((e) => alive && setError(errText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initialEventId]);

  const rows = useMemo(
    () =>
      (view?.registrations ?? []).filter(
        (r) => (type === "all" || r.type === type) && (status === "all" || (status === "open" ? r.status === "diajukan" || r.status === "revisi" : r.status === status)),
      ),
    [view, type, status],
  );
  const counts = useMemo(() => {
    const list = view?.registrations ?? [];
    return { open: list.filter((r) => r.status === "diajukan").length, approved: list.filter((r) => r.status === "disetujui").length, total: list.length };
  }, [view]);

  const decide = async (id: string, decision: "approve" | "revise" | "reject", note: string) => {
    setError(null);
    try {
      await garageApi.post(`/api/event-registrations/${id}/decision`, { decision, note });
      await load(eventId);
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Event"
        title="Pendaftar"
        subtitle="Isian tombol “Daftar” di halaman event (kreator, sponsor, kru). Setujui = langsung masuk Lineup / Sponsor / Panitia dan tampil di website."
        actions={
          <button type="button" className={ghostBtn} onClick={() => void load(eventId)} disabled={loading}>
            <RefreshCw size={16} aria-hidden /> Muat ulang
          </button>
        }
      />
      <EventControlNav current="pendaftar" eventId={eventId} />
      <StepHint
        label="Cara meninjau pendaftar"
        steps={["Baca isian & cek WhatsApp/Instagram", "Setujui → otomatis masuk Lineup/Sponsor/Panitia & tampil", "Minta revisi / Tolak → tulis catatan, pendaftar membacanya di halaman Daftar"]}
      />

      <div className={`${cardClass} grid gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:items-end`}>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-zinc-300">
          Event
          <select className={inputClass} value={eventId ?? ""} onChange={(e) => void load(e.target.value || null)}>
            {!view?.masterEvents.length ? <option value="">Belum ada event — buat di menu Event</option> : null}
            {view?.masterEvents.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {m.date}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-zinc-300">
          <b className="text-amber-200">{counts.open}</b> menunggu · <b className="text-[#a8f0c4]">{counts.approved}</b> disetujui · {counts.total} total
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Saring pendaftar">
        {(["all", "creator", "sponsor", "crew"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={type === key}
            className={`${chipBtn} ${type === key ? "border-[var(--garage-red)] bg-[color-mix(in_srgb,var(--garage-red)_20%,transparent)] text-white" : "border-white/15 text-zinc-200"}`}
            onClick={() => setType(key)}
          >
            {key === "all" ? "Semua jenis" : TYPE_LABEL[key]}
          </button>
        ))}
        <span className="mx-1 hidden w-px bg-white/10 sm:block" aria-hidden />
        {(["open", "disetujui", "ditolak", "all"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={status === key}
            className={`${chipBtn} ${status === key ? "border-amber-300/70 bg-amber-300/15 text-amber-100" : "border-white/15 text-zinc-200"}`}
            onClick={() => setStatus(key)}
          >
            {key === "open" ? "Perlu ditinjau" : key === "all" ? "Semua status" : STATUS[key].label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] px-3 py-2 text-sm text-[#ffd0d0]">
          {error}
        </p>
      ) : null}

      {loading && !view ? <p className="text-sm text-zinc-300">Memuat…</p> : null}
      {view && !rows.length ? (
        <p className={`${cardClass} text-sm text-zinc-300`}>
          {view.registrations.length ? "Tidak ada pendaftar untuk saringan ini." : "Belum ada pendaftar. Pendaftaran baru dari tombol “Daftar” di halaman event akan muncul di sini."}
        </p>
      ) : null}

      <ul className="grid gap-3 lg:grid-cols-2" aria-label="Daftar pendaftar">
        {rows.map((r) => (
          <RegistrationCard key={r.id} row={r} onDecide={decide} />
        ))}
      </ul>
    </div>
  );
}

function RegistrationCard({ row, onDecide }: { row: Registration; onDecide: (id: string, decision: "approve" | "revise" | "reject", note: string) => Promise<boolean> }) {
  const [mode, setMode] = useState<null | "revise" | "reject">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (decision: "approve" | "revise" | "reject") => {
    setBusy(true);
    const ok = await onDecide(row.id, decision, decision === "approve" ? "" : note.trim());
    setBusy(false);
    if (ok) {
      setMode(null);
      setNote("");
    }
  };
  const status = STATUS[row.status];
  return (
    <li className={`${cardClass} min-w-0 space-y-3`} aria-label={row.name}>
      <div className="flex items-start gap-3">
        {row.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.logoUrl} alt={`Logo ${row.name}`} className="size-16 shrink-0 rounded-md border border-white/10 bg-black object-contain" />
        ) : (
          <div className="grid size-16 shrink-0 place-items-center rounded-md border border-white/10 bg-black/40 text-lg font-black text-[#ff6b75]" aria-hidden>
            {row.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-base font-black uppercase leading-tight text-zinc-50">{row.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="chrome">{TYPE_LABEL[row.type]}</Badge>
            {row.category ? <Badge tone="info">{row.category}</Badge> : null}
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-xs text-zinc-400">Masuk {new Date(row.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB</p>
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <Detail label="Penanggung jawab">{row.pic}</Detail>
        <Detail label="WhatsApp">
          <a className="inline-flex items-center gap-1 text-amber-200 underline-offset-2 hover:underline" href={waLink(row.whatsapp)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} aria-hidden /> {localWa(row.whatsapp)}
          </a>
        </Detail>
        {row.instagram ? (
          <Detail label="Instagram">
            <a className="inline-flex items-center gap-1 text-amber-200 underline-offset-2 hover:underline" href={`https://www.instagram.com/${row.instagram}/`} target="_blank" rel="noopener noreferrer">
              @{row.instagram} <ExternalLink size={12} aria-hidden />
            </a>
          </Detail>
        ) : null}
        {row.type === "sponsor" && row.amount !== null ? <Detail label="Nilai dukungan">{rp(row.amount)}</Detail> : null}
        {row.members ? <Detail label="Jumlah orang">{row.members}</Detail> : null}
        {row.role ? <Detail label="Bidang kru">{row.role}</Detail> : null}
        {row.attendance ? <Detail label="Waktu hadir">{ATTEND[row.attendance] ?? row.attendance}</Detail> : null}
        {row.portfolio ? (
          <Detail label="Portofolio">
            <a className="break-all text-amber-200 underline-offset-2 hover:underline" href={row.portfolio} target="_blank" rel="noopener noreferrer">
              {row.portfolio}
            </a>
          </Detail>
        ) : null}
        {row.tech ? <Detail label="Kebutuhan teknis">{row.tech}</Detail> : null}
        {row.diet ? <Detail label="Konsumsi">{row.diet}</Detail> : null}
        {row.address ? <Detail label="Alamat">{row.address}</Detail> : null}
        {row.setlist.length ? <Detail label="Setlist">{row.setlist.length} lagu</Detail> : null}
      </dl>
      {row.description ? <p className="whitespace-pre-line break-words rounded-md bg-black/25 px-3 py-2 text-sm text-zinc-200">{row.description}</p> : null}
      {row.reviewNote ? <p className="break-words text-sm text-amber-100">Catatan untuk pendaftar: {row.reviewNote}</p> : null}

      {mode ? (
        <div className="space-y-2">
          <label className="grid gap-1 text-xs font-semibold text-zinc-300">
            {mode === "revise" ? "Apa yang perlu diperbaiki? (terbaca pendaftar)" : "Alasan penolakan (terbaca pendaftar)"}
            <textarea className={`${inputClass} h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={busy || note.trim().length < 3} onClick={() => void run(mode)}>
              {mode === "revise" ? "Kirim permintaan revisi" : "Tolak pendaftar"}
            </button>
            <button type="button" className={ghostBtn} disabled={busy} onClick={() => setMode(null)}>
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {row.status !== "disetujui" ? (
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => void run("approve")}>
              <CheckCircle2 size={16} aria-hidden /> Setujui &amp; tampilkan
            </button>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#a8f0c4]">
              <CheckCircle2 size={16} aria-hidden /> {row.linked ? "Sudah masuk Lineup / Sponsor / Panitia" : "Disetujui"}
            </p>
          )}
          {row.status !== "ditolak" ? (
            <button type="button" className={ghostBtn} disabled={busy} onClick={() => setMode("revise")}>
              <Pencil size={15} aria-hidden /> Minta revisi
            </button>
          ) : null}
          {row.status !== "ditolak" && row.status !== "disetujui" ? (
            <button type="button" className={ghostBtn} disabled={busy} onClick={() => setMode("reject")}>
              <XCircle size={15} aria-hidden /> Tolak
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
