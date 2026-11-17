"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Ban, Camera, CheckCircle2, ClipboardList, Mic2, Play, RefreshCw, RotateCcw, Square, UserPlus, Users } from "lucide-react";

import { garageApi, GarageApiError } from "@/lib/api-client";
import { useCodeScanner } from "@/lib/use-code-scanner";

// Hari-H event (GIGS EO Fase 3, Owner 17 Nov 2026): layar HP panitia (Owner/Manajer).
// Check-in pintu (scan QR undangan / walk-in), panggung (sedang tampil, berikutnya, telat), status tugas panitia.

type DayView = {
  masterEvents: Array<{ id: string; title: string; date: string }>;
  role?: string;
  event: { id: string; title: string; capacity: number | null; date: string } | null;
  checkin?: {
    totalActive: number;
    capacity: number | null;
    byKind: { undangan: number; walkin: number };
    rsvpAttendingPax: number;
    rsvpAttendingInvitations: number;
    recent: Array<{ id: string; guestName: string; pax: number; kind: string; status: string; voidReason: string | null; at: string }>;
  };
  stage?: {
    delayMinutes: number;
    offDay: boolean;
    done: number;
    total: number;
    slots: Array<{
      id: string;
      slot: number;
      name: string;
      plannedStart: string | null;
      plannedEnd: string | null;
      projectedStart: string | null;
      actualStart: string | null;
      actualEnd: string | null;
      live: boolean;
      next: boolean;
    }>;
  };
};
type Task = { id: string; title: string; status: string; dueDate: string | null; overdue: boolean; crewName: string | null };
type Tab = "checkin" | "panggung" | "tugas";

const errText = (error: unknown) => (error instanceof GarageApiError || error instanceof Error ? error.message : "Gagal.");
const clock = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[color-mix(in_srgb,var(--garage-amber)_70%,transparent)]";
const primaryBtn =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_60%,transparent)] bg-[var(--garage-red)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const ghostBtn =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const smallBtn =
  "inline-flex h-9 items-center justify-center gap-1 rounded-md border border-white/15 px-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const cardClass = "rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-4";

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${cardClass} ${className}`}>{children}</div>;
}

export function EventDayPanel({ initialEventId = null }: { initialEventId?: string | null }) {
  const [view, setView] = useState<DayView | null>(null);
  const [eventId, setEventId] = useState<string | null>(initialEventId);
  const [tab, setTab] = useState<Tab>("checkin");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async (id: string | null) => {
    setError(null);
    try {
      const data = await garageApi.get<DayView>(`/api/event-day${id ? `?eventId=${id}` : ""}`, { cache: "no-store" });
      setView(data);
      setEventId(data.event?.id ?? null);
      if (data.event) {
        const board = await garageApi.get<{ tasks: Task[] }>(`/api/event-lineup?eventId=${encodeURIComponent(data.event.id)}`, { cache: "no-store" }).catch(() => null);
        setTasks(board?.tasks ?? []);
      }
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  // Muat pertama + segarkan tiap 15 detik (panitia lain ikut scan / mengubah panggung).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const idRef = useRef(eventId);
  useEffect(() => {
    idRef.current = eventId;
  }, [eventId]);
  useEffect(() => {
    const first = window.setTimeout(() => void loadRef.current(idRef.current), 0);
    const timer = window.setInterval(() => void loadRef.current(idRef.current), 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const act = async (action: () => Promise<unknown>, okText?: string) => {
    setError(null);
    try {
      await action();
      if (okText) setFlash({ tone: "ok", text: okText });
      await load(eventId);
      return true;
    } catch (e) {
      setFlash({ tone: "bad", text: errText(e) });
      return false;
    }
  };

  const c = view?.checkin;
  const full = c && c.capacity !== null && c.totalActive >= c.capacity;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/os" className="inline-flex items-center gap-1 text-sm text-zinc-300 hover:text-white">
          <ArrowLeft size={16} /> Garage OS
        </Link>
        <button type="button" className={smallBtn} onClick={() => void load(eventId)}>
          <RefreshCw size={14} /> Segarkan
        </button>
      </div>
      <h1 className="text-2xl font-black uppercase tracking-wide">Hari-H Event</h1>

      <label className="grid gap-1 text-xs font-semibold text-zinc-300">
        Event
        <select className={inputClass} value={eventId ?? ""} onChange={(e) => void load(e.target.value || null)}>
          {!view?.masterEvents.length ? <option value="">Belum ada event</option> : null}
          {view?.masterEvents.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} · {m.date}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] px-3 py-2 text-sm text-[#ffc4c4]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}
      {flash ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-base font-semibold ${
            flash.tone === "ok" ? "border-[color-mix(in_srgb,var(--garage-success)_50%,transparent)] text-[#a8f0c4]" : "border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] text-[#ffc4c4]"
          }`}
        >
          {flash.text}
        </p>
      ) : null}

      {view?.event && c && view.stage ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <p className="text-xs uppercase text-zinc-400">Sudah masuk</p>
              <p className={`text-2xl font-black tabular-nums ${full ? "text-[#ff8a8a]" : ""}`}>
                {c.totalActive}
                {c.capacity !== null ? <span className="text-sm text-zinc-400">/{c.capacity}</span> : null}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-zinc-400">RSVP hadir</p>
              <p className="text-2xl font-black tabular-nums">{c.rsvpAttendingPax}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-zinc-400">Panggung</p>
              <p className="text-2xl font-black tabular-nums">
                {view.stage.done}/{view.stage.total}
              </p>
            </Card>
          </div>

          <div role="tablist" className="flex gap-2">
            {(
              [
                ["checkin", "Check-in", Users],
                ["panggung", "Panggung", Mic2],
                ["tugas", "Tugas", ClipboardList],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`${ghostBtn} flex-1 ${tab === key ? "border-[color-mix(in_srgb,var(--garage-red)_70%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_18%,transparent)]" : ""}`}
                onClick={() => setTab(key)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          {tab === "checkin" ? <CheckinTab view={view} onAct={act} /> : null}
          {tab === "panggung" ? <StageTab view={view} onAct={act} /> : null}
          {tab === "tugas" ? (
            <Card className="space-y-2">
              {!tasks.length ? <p className="text-sm text-zinc-400">Belum ada tugas panitia untuk event ini.</p> : null}
              <ul className="divide-y divide-white/10">
                {tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className={`font-semibold ${t.status === "selesai" ? "text-zinc-400 line-through" : ""}`}>{t.title}</p>
                      <p className={`text-xs ${t.overdue ? "text-[#ff8a8a]" : "text-zinc-400"}`}>
                        {t.crewName ?? "Belum ada PIC"}
                        {t.dueDate ? ` · tenggat ${t.dueDate}` : ""}
                        {t.overdue ? " · terlambat" : ""}
                      </p>
                    </div>
                    {t.status !== "selesai" && t.status !== "batal" ? (
                      <button type="button" className={smallBtn} onClick={() => void act(() => garageApi.patch(`/api/event-lineup/tasks/${t.id}`, { status: "selesai" }), `Tugas "${t.title}" selesai.`)}>
                        <CheckCircle2 size={14} /> Selesai
                      </button>
                    ) : (
                      <span className="text-xs font-semibold uppercase text-zinc-400">{t.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : view && !view.event ? (
        <Card>Belum ada event. Owner membuat event di menu Event (Garage OS).</Card>
      ) : !error ? (
        <p className="text-sm text-zinc-400">Memuat…</p>
      ) : null}
    </main>
  );
}

function CheckinTab({ view, onAct }: { view: DayView; onAct: (action: () => Promise<unknown>, okText?: string) => Promise<boolean> }) {
  const eventId = view.event!.id;
  const c = view.checkin!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [pax, setPax] = useState(1);
  const [walkName, setWalkName] = useState("");
  const [walkPax, setWalkPax] = useState(1);
  const busy = useRef(false);

  const submitCode = useCallback(
    async (value: string) => {
      if (busy.current || !value.trim()) return;
      busy.current = true;
      await onAct(async () => {
        const res = await garageApi.post<{ guestName: string; pax: number }>("/api/event-day/checkins", { eventId, code: value.trim(), pax });
        return res;
      }, "Check-in berhasil.");
      setCode("");
      busy.current = false;
    },
    [eventId, onAct, pax],
  );
  const scanner = useCodeScanner({ videoRef, enabled: scanning, onCode: (value) => void submitCode(value) });

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <h2 className="font-bold">Scan QR undangan</h2>
        {scanning ? (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <span className="pointer-events-none absolute inset-6 rounded-lg border-2 border-[var(--garage-red)]" />
          </div>
        ) : null}
        {scanner.error && scanning ? <p className="text-sm text-[#ffc4c4]">Kamera tidak bisa dibuka. Ketik kode di bawah.</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={scanning ? ghostBtn : primaryBtn} onClick={() => setScanning((v) => !v)}>
            <Camera size={16} /> {scanning ? "Tutup kamera" : "Buka kamera"}
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            Orang
            <input className={`${inputClass} w-20`} type="number" min={1} max={10} value={pax} onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(code);
          }}
        >
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Tempel tautan / kode undangan" aria-label="Kode undangan" />
          <button type="submit" className={primaryBtn} disabled={!code.trim()}>
            Masuk
          </button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Walk-in (tanpa undangan)</h2>
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await onAct(() => garageApi.post("/api/event-day/checkins", { eventId, walkInName: walkName.trim(), pax: walkPax }), "Walk-in tercatat.");
            if (ok) {
              setWalkName("");
              setWalkPax(1);
            }
          }}
        >
          <input className={inputClass} value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="Nama tamu" minLength={2} maxLength={80} aria-label="Nama tamu walk-in" />
          <input className={inputClass} type="number" min={1} max={50} value={walkPax} onChange={(e) => setWalkPax(Math.max(1, Number(e.target.value) || 1))} aria-label="Jumlah orang walk-in" placeholder="Orang" />
          <button type="submit" className={ghostBtn} disabled={walkName.trim().length < 2}>
            <UserPlus size={16} /> Catat
          </button>
        </form>
        <p className="text-xs text-zinc-400">
          Undangan {c.byKind.undangan} orang · walk-in {c.byKind.walkin} orang
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">Terakhir masuk</h2>
        {!c.recent.length ? <p className="text-sm text-zinc-400">Belum ada yang check-in.</p> : null}
        <ul className="divide-y divide-white/10">
          {c.recent.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${r.status === "batal" ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.guestName} · {r.pax} org
                </p>
                <p className="text-xs text-zinc-400">
                  {clock(r.at)} · {r.kind === "walkin" ? "walk-in" : "undangan"}
                  {r.status === "batal" ? ` · dibatalkan: ${r.voidReason}` : ""}
                </p>
              </div>
              {r.status === "aktif" ? (
                <button
                  type="button"
                  className={smallBtn}
                  onClick={() => {
                    const reason = window.prompt("Alasan membatalkan check-in ini?");
                    if (reason && reason.trim().length >= 3) void onAct(() => garageApi.post(`/api/event-day/checkins/${r.id}/void`, { reason: reason.trim() }), "Check-in dibatalkan.");
                  }}
                >
                  <Ban size={13} /> Batalkan
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StageTab({ view, onAct }: { view: DayView; onAct: (action: () => Promise<unknown>, okText?: string) => Promise<boolean> }) {
  const stage = view.stage!;
  const live = stage.slots.find((s) => s.live) ?? null;
  const next = stage.slots.find((s) => s.next) ?? null;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase text-zinc-400">Sedang tampil</p>
          <p className="text-xl font-black">{live ? live.name : "—"}</p>
          {live?.actualStart ? <p className="text-sm text-zinc-400">mulai {clock(live.actualStart)}</p> : null}
        </Card>
        <Card>
          <p className="text-xs uppercase text-zinc-400">Berikutnya</p>
          <p className="text-xl font-black">{next ? next.name : "—"}</p>
          {next ? (
            <p className="text-sm text-zinc-400">
              rencana {next.plannedStart ?? "—"}
              {next.projectedStart && next.projectedStart !== next.plannedStart ? ` · perkiraan ${next.projectedStart}` : ""}
            </p>
          ) : null}
        </Card>
      </div>
      <p className={`text-sm font-semibold ${stage.delayMinutes > 5 ? "text-amber-200" : "text-zinc-300"}`}>
        {stage.offDay
          ? "Jam tampil nyata di luar tanggal event — telat tidak dihitung."
          : stage.delayMinutes > 0
            ? `Telat ${stage.delayMinutes} menit dari rencana.`
            : stage.delayMinutes < 0
              ? `Lebih cepat ${-stage.delayMinutes} menit.`
              : "Sesuai jadwal."}
      </p>
      {view.role === "Owner" ? (
        <button
          type="button"
          className={ghostBtn}
          onClick={() => void onAct(() => garageApi.post("/api/event-day/agenda", { eventId: view.event!.id }), "Rundown disalin ke agenda undangan.")}
        >
          Salin rundown ke agenda undangan
        </button>
      ) : null}
      <ul className="space-y-2">
        {stage.slots.map((s) => (
          <li
            key={s.id}
            className={`${cardClass} flex flex-wrap items-center justify-between gap-2 ${s.live ? "border-[color-mix(in_srgb,var(--garage-red)_70%,transparent)]" : ""}`}
          >
            <div className="min-w-0">
              <p className="font-bold">
                #{String(s.slot).padStart(2, "0")} {s.name}
              </p>
              <p className="text-xs text-zinc-400">
                rencana {s.plannedStart ?? "—"}
                {s.plannedEnd ? `–${s.plannedEnd}` : ""}
                {s.actualStart ? ` · mulai ${clock(s.actualStart)}` : ""}
                {s.actualEnd ? ` · selesai ${clock(s.actualEnd)}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              {!s.actualStart || s.actualEnd ? (
                <button type="button" className={smallBtn} onClick={() => void onAct(() => garageApi.post(`/api/event-day/slots/${s.id}`, { action: "start" }), `${s.name} mulai tampil.`)}>
                  <Play size={13} /> Mulai
                </button>
              ) : (
                <button type="button" className={smallBtn} onClick={() => void onAct(() => garageApi.post(`/api/event-day/slots/${s.id}`, { action: "end" }), `${s.name} selesai.`)}>
                  <Square size={13} /> Selesai
                </button>
              )}
              {s.actualStart ? (
                <button type="button" className={smallBtn} aria-label={`Batalkan jam tampil ${s.name}`} onClick={() => void onAct(() => garageApi.post(`/api/event-day/slots/${s.id}`, { action: "undo" }))}>
                  <RotateCcw size={13} />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!stage.slots.length ? <p className="text-sm text-zinc-400">Belum ada penampil terkonfirmasi di Lineup.</p> : null}
    </div>
  );
}
