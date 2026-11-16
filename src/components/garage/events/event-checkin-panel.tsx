"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CameraOff, CheckCircle2, Minus, Plus, RefreshCw, ScanLine, Search, UserPlus, Users, XCircle } from "lucide-react";

import { garageApi, GarageApiError } from "@/lib/api-client";
import { parseCheckinCode } from "@/lib/event-checkin-rules";
import { useCodeScanner } from "@/lib/use-code-scanner";

// Layar pintu event (owner 16 Nov 2026). HP-first: scan QR undangan → konfirmasi jumlah orang → masuk.
// Satu undangan hanya sekali (dicek server). Tanpa QR: cari nama. Tanpa undangan: walk-in.

type EventOption = { id: string; title: string; startsAt: string; status: string; today: boolean };
type Board = {
  event: { id: string; title: string; startsAt: string; status: string };
  summary: {
    invitedGuests: number;
    rsvpAttendingGuests: number;
    rsvpAttendingPax: number;
    arrivedInvitations: number;
    arrivedInvitedPax: number;
    walkinGroups: number;
    walkinPax: number;
    totalPax: number;
    notArrivedInvitations: number;
    rsvpShowRatePct: number | null;
  };
  canUndo: boolean;
  recent: Array<{ id: string; kind: "invited" | "walkin"; method: string; guestName: string | null; pax: number; checkedInAt: string; byName: string | null; note: string | null; undone: boolean; undoReason: string | null }>;
};
type Guest = {
  invitationId: string;
  guestName: string;
  maxPax: number;
  rsvp: { response: string; pax: number } | null;
  activeCheckin: { id: string; checkedInAt: string; byName: string | null; pax: number } | null;
  defaultPax: number;
  allowed?: boolean;
  blockText?: string | null;
  warnings?: string[];
};
type Preview = { found: true; guest: Guest } | { found: false; blockText: string; otherEventId?: string | null };
type Mode = "scan" | "cari" | "walkin";

const EVENT_KEY = "garage:checkin-event";
const clock = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const dateLabel = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const errText = (error: unknown) => (error instanceof GarageApiError || error instanceof Error ? error.message : "Gagal. Coba lagi.");
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const rsvpText = (rsvp: Guest["rsvp"]) => (!rsvp ? "Belum RSVP" : rsvp.response === "attending" ? `RSVP hadir ${rsvp.pax} orang` : "RSVP tidak hadir");

const btn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none motion-reduce:active:scale-100";
const field =
  "h-12 w-full min-w-0 rounded-xl border border-white/15 bg-[#1b1b20] px-4 text-base text-zinc-50 outline-none placeholder:text-zinc-500 focus:border-[#ffb547]";

function Stepper({ value, min = 1, max, onChange, label }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" aria-label="Kurangi" disabled={value <= min} onClick={() => onChange(value - 1)} className={`${btn} w-12 border border-white/20 px-0`}>
        <Minus className="h-5 w-5" aria-hidden />
      </button>
      <span className="min-w-12 text-center font-mono text-3xl font-black tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="Tambah" disabled={value >= max} onClick={() => onChange(value + 1)} className={`${btn} w-12 border border-white/20 px-0`}>
        <Plus className="h-5 w-5" aria-hidden />
      </button>
      <span className="text-sm text-zinc-400">orang</span>
    </div>
  );
}

export function EventCheckinPanel({ staffName, canUndo }: { staffName: string; canUndo: boolean }) {
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("scan");
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pax, setPax] = useState(1);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);

  // Event: pilihan terakhir di perangkat ini → event hari ini → terbaru.
  useEffect(() => {
    void garageApi
      .get<EventOption[]>("/api/event-checkin/events", { cache: "no-store" })
      .then((list) => {
        setEvents(list);
        let saved = "";
        try {
          saved = localStorage.getItem(EVENT_KEY) ?? "";
        } catch {
          /* penyimpanan diblokir — abaikan */
        }
        const pick = list.find((e) => e.id === saved) ?? list.find((e) => e.today) ?? list[0];
        if (pick) setEventId(pick.id);
      })
      .catch((err) => setError(errText(err)));
  }, []);

  const loadBoard = useCallback(async () => {
    if (!eventId) return;
    try {
      setBoard(await garageApi.get<Board>(`/api/event-checkin/${eventId}`, { cache: "no-store" }));
      setError(null);
    } catch (err) {
      setError(errText(err));
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    try {
      localStorage.setItem(EVENT_KEY, eventId);
    } catch {
      /* abaikan */
    }
    const first = window.setTimeout(() => void loadBoard(), 0);
    // Beberapa petugas pintu bisa bekerja bersamaan → angka disegarkan tiap 10 detik.
    const id = window.setInterval(() => void loadBoard(), 10_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [eventId, loadBoard]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const openPreview = useCallback(
    async (body: { code?: string; invitationId?: string }) => {
      if (!eventId || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await garageApi.post<Preview>(`/api/event-checkin/${eventId}/preview`, body);
        setPreview(res);
        if (res.found) setPax(res.guest.defaultPax);
        setCamera(false);
      } catch (err) {
        setFlash({ tone: "bad", text: errText(err) });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [eventId],
  );

  const onCode = useCallback(
    (raw: string) => {
      if (preview || busyRef.current) return;
      if (!parseCheckinCode(raw)) {
        setFlash({ tone: "bad", text: "QR ini bukan undangan Garage. Cari nama tamu secara manual." });
        return;
      }
      void openPreview({ code: raw });
    },
    [openPreview, preview],
  );
  const scanner = useCodeScanner({ videoRef, enabled: camera && mode === "scan" && !preview, onCode });

  async function confirm() {
    if (!preview?.found) return;
    setBusy(true);
    try {
      const res = await garageApi.post<{ guestName: string; pax: number }>(`/api/event-checkin/${eventId}`, {
        invitationId: preview.guest.invitationId,
        pax,
        method: mode === "cari" ? "manual" : "scan",
      });
      try {
        navigator.vibrate?.(60);
      } catch {
        /* tidak semua perangkat */
      }
      setFlash({ tone: "ok", text: `${res.guestName} · ${res.pax} orang masuk` });
      setPreview(null);
      if (mode === "scan") setCamera(true);
      void loadBoard();
    } catch (err) {
      setFlash({ tone: "bad", text: errText(err) });
      // Status terbaru (mis. baru saja dipakai petugas lain).
      void openPreview({ invitationId: preview.guest.invitationId });
    } finally {
      setBusy(false);
    }
  }

  const s = board?.summary;
  const expected = useMemo(() => (s ? Math.max(s.rsvpAttendingPax, 1) : 1), [s]);

  return (
    <main className="min-h-dvh bg-[#0d0d10] text-zinc-100" data-testid="checkin-panel">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <header className="flex items-center gap-2">
          <Link href="/os?module=dashboard" aria-label="Kembali ke Garage OS" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ffb547]">Check-in tamu</p>
            <h1 className="truncate text-lg font-black">{board?.event.title ?? "Pilih event"}</h1>
          </div>
          <button type="button" onClick={() => void loadBoard()} aria-label="Muat ulang" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 hover:bg-white/5">
            <RefreshCw className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {events && events.length > 1 ? (
          <label className="block">
            <span className="sr-only">Event</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={field}>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} · {dateLabel(ev.startsAt)}
                  {ev.today ? " (hari ini)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {events && !events.length ? <p className="rounded-xl border border-white/10 p-4 text-sm text-zinc-300">Belum ada event aktif. Buat event di modul Event (Owner/Manajer).</p> : null}
        {error ? (
          <p role="alert" className="rounded-xl border border-[#e5484d]/50 bg-[#e5484d]/10 px-4 py-3 text-sm text-[#ffb1b1]">
            {error}
          </p>
        ) : null}

        {s ? (
          <section aria-label="Rekap kehadiran" className="rounded-2xl border border-white/10 bg-[#16161b] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-400">Sudah masuk</p>
                <p className="font-mono text-5xl font-black tabular-nums text-zinc-50" data-testid="checkin-total">
                  {s.totalPax}
                  <span className="ml-1 text-lg font-bold text-zinc-400">orang</span>
                </p>
              </div>
              <div className="text-right text-sm text-zinc-300">
                <p>
                  RSVP hadir <b className="font-mono text-zinc-50">{s.rsvpAttendingPax}</b> orang
                </p>
                {s.rsvpShowRatePct !== null ? <p className="text-zinc-400">{s.rsvpShowRatePct}% dari RSVP sudah datang</p> : null}
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={expected} aria-valuenow={s.arrivedInvitedPax} aria-label="Tamu undangan datang dibanding RSVP">
              <div className="h-full origin-left rounded-full bg-[#4ade80] transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `scaleX(${Math.min(1, s.arrivedInvitedPax / expected)})` }} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ["Undangan masuk", `${s.arrivedInvitations}/${s.invitedGuests}`],
                ["Orang (undangan)", String(s.arrivedInvitedPax)],
                ["Walk-in", `${s.walkinPax}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/5 px-2 py-2">
                  <dt className="text-xs text-zinc-400">{label}</dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {flash ? (
          <p
            role="status"
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-base font-bold ${flash.tone === "ok" ? "bg-[#14532d] text-[#bbf7d0]" : "bg-[#5c1a1d] text-[#fecaca]"}`}
            data-testid="checkin-flash"
          >
            {flash.tone === "ok" ? <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> : <XCircle className="h-5 w-5 shrink-0" aria-hidden />}
            {flash.text}
          </p>
        ) : null}

        {board ? (
          <>
            <div role="tablist" aria-label="Cara check-in" className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-[#16161b] p-1">
              {(
                [
                  ["scan", "Scan QR", ScanLine],
                  ["cari", "Cari nama", Search],
                  ["walkin", "Walk-in", UserPlus],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => {
                    setMode(id);
                    setPreview(null);
                    if (id !== "scan") setCamera(false);
                  }}
                  className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-bold ${mode === id ? "bg-white/12 text-zinc-50" : "text-zinc-400"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </button>
              ))}
            </div>

            {preview ? (
              <GuestCard
                preview={preview}
                onSwitchEvent={
                  !preview.found && preview.otherEventId && events?.some((e) => e.id === preview.otherEventId)
                    ? () => {
                        setEventId(preview.otherEventId!);
                        setPreview(null);
                        setFlash({ tone: "ok", text: "Event diganti. Scan QR tamu sekali lagi." });
                      }
                    : undefined
                }
                pax={pax}
                setPax={setPax}
                busy={busy}
                onConfirm={() => void confirm()}
                onCancel={() => {
                  setPreview(null);
                  if (mode === "scan") setCamera(true);
                }}
              />
            ) : mode === "scan" ? (
              <ScanBox camera={camera} setCamera={setCamera} videoRef={videoRef} scannerError={scanner.error} busy={busy} onManual={(code) => onCode(code)} />
            ) : mode === "cari" ? (
              <SearchBox eventId={eventId} onPick={(invitationId) => void openPreview({ invitationId })} />
            ) : (
              <WalkinBox eventId={eventId} onDone={(text) => {
                setFlash({ tone: "ok", text });
                void loadBoard();
              }} onError={(text) => setFlash({ tone: "bad", text })} />
            )}

            <RecentList board={board} canUndo={canUndo} onChanged={() => void loadBoard()} />
          </>
        ) : null}
        <p className="text-center text-xs text-zinc-500">Petugas: {staffName}</p>
      </div>
    </main>
  );
}

function ScanBox({
  camera,
  setCamera,
  videoRef,
  scannerError,
  busy,
  onManual,
}: {
  camera: boolean;
  setCamera: (on: boolean) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scannerError: string | null;
  busy: boolean;
  onManual: (code: string) => void;
}) {
  const [manual, setManual] = useState("");
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-[#16161b] p-4">
      {camera ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" aria-label="Kamera pemindai QR" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-[#ffb547]/80" aria-hidden />
          {busy ? <p className="absolute inset-x-0 bottom-0 bg-black/70 py-2 text-center text-sm font-bold">Memeriksa…</p> : null}
        </div>
      ) : null}
      {scannerError ? <p className="text-sm text-[#ffb1b1]">{scannerError}</p> : null}
      <button type="button" onClick={() => setCamera(!camera)} className={`${btn} w-full ${camera ? "border border-white/20" : "bg-[#e5484d] text-white"}`} data-testid="checkin-camera">
        {camera ? <CameraOff className="h-5 w-5" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
        {camera ? "Matikan kamera" : "Scan QR undangan"}
      </button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onManual(manual.trim());
          setManual("");
        }}
      >
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Scanner USB / tempel tautan undangan…" aria-label="Kode atau tautan undangan" className={field} data-testid="checkin-code" />
        <button type="submit" className={`${btn} border border-white/20`}>
          Cek
        </button>
      </form>
    </section>
  );
}

function GuestCard({
  preview,
  pax,
  setPax,
  busy,
  onConfirm,
  onCancel,
  onSwitchEvent,
}: {
  preview: Preview;
  pax: number;
  setPax: (n: number) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSwitchEvent?: () => void;
}) {
  if (!preview.found) {
    return (
      <section role="alert" className="space-y-3 rounded-2xl border-2 border-[#e5484d] bg-[#2a1215] p-4">
        <p className="flex items-center gap-2 text-lg font-black text-[#fecaca]">
          <XCircle className="h-6 w-6 shrink-0" aria-hidden /> Tidak bisa masuk
        </p>
        <p className="text-base text-[#fecaca]">{preview.blockText}</p>
        {onSwitchEvent ? (
          <button type="button" onClick={onSwitchEvent} className={`${btn} w-full bg-[#ffb547] text-[#1a1203]`}>
            Ganti ke event itu
          </button>
        ) : null}
        <button type="button" onClick={onCancel} className={`${btn} w-full border border-white/20`}>
          Scan lagi
        </button>
      </section>
    );
  }
  const g = preview.guest;
  const ok = g.allowed !== false;
  return (
    <section className={`space-y-3 rounded-2xl border-2 p-4 ${ok ? "border-[#4ade80] bg-[#0f2418]" : "border-[#e5484d] bg-[#2a1215]"}`} data-testid="checkin-guest">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Tamu undangan</p>
        <p className="break-words text-2xl font-black text-zinc-50">{g.guestName}</p>
        <p className="text-sm text-zinc-300">
          Maks {g.maxPax} orang · {rsvpText(g.rsvp)}
        </p>
      </div>
      {g.activeCheckin ? (
        <p className="rounded-xl bg-[#5c1a1d] px-3 py-2 text-base font-bold text-[#fecaca]">
          Sudah masuk pukul {clock(g.activeCheckin.checkedInAt)} ({g.activeCheckin.pax} orang{g.activeCheckin.byName ? `, dicatat ${g.activeCheckin.byName}` : ""}).
        </p>
      ) : !ok && g.blockText ? (
        <p className="rounded-xl bg-[#5c1a1d] px-3 py-2 text-base font-bold text-[#fecaca]">{g.blockText}</p>
      ) : null}
      {g.warnings?.length ? (
        <ul className="space-y-1">
          {g.warnings.map((w) => (
            <li key={w} className="rounded-lg bg-[#ffb547]/12 px-3 py-1.5 text-sm font-semibold text-[#ffd8a8]">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {ok ? (
        <>
          <Stepper value={pax} max={g.maxPax} onChange={setPax} label="Jumlah orang yang datang" />
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={onCancel} className={`${btn} border border-white/20`}>
              Batal
            </button>
            <button type="button" disabled={busy} onClick={onConfirm} className={`${btn} bg-[#16a34a] text-white`} data-testid="checkin-confirm">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> {busy ? "Menyimpan…" : `Masuk · ${pax} orang`}
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={onCancel} className={`${btn} w-full border border-white/20`}>
          Kembali
        </button>
      )}
    </section>
  );
}

function SearchBox({ eventId, onPick }: { eventId: string; onPick: (invitationId: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Guest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      const id = window.setTimeout(() => setRows(null), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      garageApi
        .get<Guest[]>(`/api/event-checkin/${eventId}/search?q=${encodeURIComponent(text)}`, { cache: "no-store" })
        .then((list) => {
          setRows(list);
          setError(null);
        })
        .catch((err) => setError(errText(err)));
    }, 250);
    return () => window.clearTimeout(id);
  }, [q, eventId]);
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-[#16161b] p-4">
      <label className="flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-[#1b1b20] px-4">
        <Search className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama atau nomor HP tamu…" aria-label="Cari tamu" className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-zinc-500" data-testid="checkin-search" />
      </label>
      {error ? <p className="text-sm text-[#ffb1b1]">{error}</p> : null}
      {rows && !rows.length ? <p className="text-sm text-zinc-400">Tidak ada tamu yang cocok. Tamu tanpa undangan → tab Walk-in.</p> : null}
      {rows?.length ? (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {rows.map((g) => (
            <li key={g.invitationId}>
              <button type="button" onClick={() => onPick(g.invitationId)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-bold">{g.guestName}</p>
                  <p className="text-sm text-zinc-400">
                    Maks {g.maxPax} · {rsvpText(g.rsvp)}
                  </p>
                </div>
                {g.activeCheckin ? (
                  <span className="shrink-0 rounded-full bg-[#4ade80]/15 px-2.5 py-1 text-xs font-bold text-[#a8f0c4]">Masuk {clock(g.activeCheckin.checkedInAt)}</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">Belum datang</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function WalkinBox({ eventId, onDone, onError }: { eventId: string; onDone: (text: string) => void; onError: (text: string) => void }) {
  const [pax, setPax] = useState(1);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey);
  async function save() {
    setBusy(true);
    try {
      await garageApi.post(`/api/event-checkin/${eventId}/walkin`, { pax, name: name.trim() || null, idempotencyKey: key });
      onDone(`Walk-in ${name.trim() ? `${name.trim()} · ` : ""}${pax} orang dicatat`);
      setPax(1);
      setName("");
      setKey(newKey());
    } catch (err) {
      onError(errText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-[#16161b] p-4">
      <p className="text-sm text-zinc-400">Tamu tanpa undangan. Dihitung terpisah dari undangan.</p>
      <Stepper value={pax} max={50} onChange={setPax} label="Jumlah orang walk-in" />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nama (opsional)" aria-label="Nama walk-in (opsional)" className={field} />
      <button type="button" disabled={busy} onClick={() => void save()} className={`${btn} w-full bg-[#e5484d] text-white`} data-testid="checkin-walkin-save">
        <Users className="h-5 w-5" aria-hidden /> {busy ? "Menyimpan…" : `Catat walk-in · ${pax} orang`}
      </button>
    </section>
  );
}

function RecentList({ board, canUndo, onChanged }: { board: Board; canUndo: boolean; onChanged: () => void }) {
  const [undoFor, setUndoFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function undo(id: string) {
    try {
      await garageApi.post(`/api/event-checkin/entries/${id}/undo`, { reason: reason.trim() });
      setUndoFor(null);
      setReason("");
      onChanged();
    } catch (err) {
      setError(errText(err));
    }
  }
  if (!board.recent.length) return <p className="text-center text-sm text-zinc-500">Belum ada yang masuk.</p>;
  return (
    <section aria-label="Masuk terakhir" className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-zinc-400">Masuk terakhir</h2>
      {error ? <p className="text-sm text-[#ffb1b1]">{error}</p> : null}
      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#16161b]">
        {board.recent.map((r) => (
          <li key={r.id} className={`space-y-2 px-4 py-3 ${r.undone ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="w-12 shrink-0 font-mono text-sm text-zinc-400">{clock(r.checkedInAt)}</span>
              <div className="min-w-0 flex-1">
                <p className={`break-words text-base font-bold ${r.undone ? "line-through" : ""}`}>{r.guestName ?? (r.kind === "walkin" ? "Walk-in" : "Tamu")}</p>
                <p className="text-xs text-zinc-400">
                  {r.kind === "walkin" ? "Walk-in" : r.method === "manual" ? "Cari nama" : "Scan QR"}
                  {r.byName ? ` · ${r.byName}` : ""}
                  {r.undone ? ` · dibatalkan: ${r.undoReason}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono text-lg font-black tabular-nums">{r.pax}</span>
              {canUndo && board.canUndo && !r.undone ? (
                <button
                  type="button"
                  onClick={() => {
                    setUndoFor(undoFor === r.id ? null : r.id);
                    setReason("");
                  }}
                  aria-label={`Batalkan check-in ${r.guestName ?? "walk-in"}`}
                  className="shrink-0 rounded-lg px-2 py-2 text-xs font-bold text-[#ffb1b1] hover:bg-white/5"
                  aria-expanded={undoFor === r.id}
                >
                  Batalkan
                </button>
              ) : null}
            </div>
            {undoFor === r.id ? (
              <div className="flex gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Alasan (wajib)…" aria-label="Alasan membatalkan check-in" className={field} />
                <button type="button" disabled={reason.trim().length < 3} onClick={() => void undo(r.id)} className={`${btn} shrink-0 bg-[#e5484d] text-white`}>
                  Ya, batalkan
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
