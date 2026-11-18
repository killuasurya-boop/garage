"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Clock3, ListOrdered, Plus, RefreshCw, Users, Wallet } from "lucide-react";

import { garageApi, GarageApiError } from "@/lib/api-client";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/event-lineup-rules";
import type { PanitiaWorkspace } from "@/lib/event-panitia-service";

// Ruang Panitia (Owner 17 Nov 2026): untuk anggota panitia yang ditautkan Owner ke akun login stafnya.
// Semua hak dicek di server; layar ini hanya menampilkan & mengirim perubahan.

type EventView = PanitiaWorkspace["events"][number];

const errText = (e: unknown) => (e instanceof GarageApiError || e instanceof Error ? e.message : "Gagal memuat.");
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const dateLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : null;
const dueLabel = (d: string | null) => (d ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : null);
const card = "rounded-lg border border-white/10 bg-[var(--garage-bg-2,#17171b)] p-4";
const input = "h-11 w-full rounded-md border border-white/15 bg-black/30 px-3 text-base text-zinc-50 focus:border-amber-300 focus:outline-none";

export function PanitiaWorkspaceView() {
  const [data, setData] = useState<PanitiaWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await garageApi.get<PanitiaWorkspace>("/api/panitia", { cache: "no-store" }));
      setError(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<PanitiaWorkspace>("/api/panitia", { cache: "no-store" })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 text-zinc-100" data-testid="panitia-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/os" className="inline-flex min-h-11 items-center gap-1 text-sm text-zinc-300 hover:text-white">
          <ArrowLeft size={16} /> Garage OS
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-zinc-100 hover:bg-white/10"
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "animate-spin motion-reduce:animate-none" : ""} /> Segarkan
        </button>
      </div>
      <header className="space-y-1">
        <h1 className="text-2xl font-black uppercase tracking-wide">Ruang Panitia</h1>
        <p className="text-sm text-zinc-300">
          {data ? `Halo, ${data.name}. ` : ""}Rundown, tugas, dan ringkasan event tempat Anda menjadi panitia.
        </p>
      </header>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {data && !data.events.length ? (
        <div className={`${card} space-y-2`}>
          <p className="flex items-center gap-2 font-bold">
            <Users size={18} className="text-amber-300" /> Akun Anda belum ditautkan ke panitia event mana pun.
          </p>
          <p className="text-sm text-zinc-300">
            Minta Owner membuka <b>Lineup &amp; Panitia → tab Panitia</b>, klik <b>Ubah</b> pada nama Anda, lalu pilih akun login Anda di kolom <b>Akun login</b>.
          </p>
        </div>
      ) : null}

      {data?.events.map((ev) => <EventSection key={ev.key} ev={ev} onChanged={load} />)}
    </main>
  );
}

function EventSection({ ev, onChanged }: { ev: EventView; onChanged: () => Promise<void> }) {
  const [filter, setFilter] = useState<"mine" | "all">(ev.tasks.some((t) => t.mine) ? "mine" : "all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tasks = ev.tasks.filter((t) => (filter === "mine" ? t.mine : true));
  const openMine = ev.tasks.filter((t) => t.mine && (t.status === "todo" || t.status === "proses")).length;

  const setStatus = async (taskId: string, status: TaskStatus) => {
    setBusyId(taskId);
    setError(null);
    try {
      await garageApi.patch(`/api/panitia/tasks/${taskId}`, { status });
      await onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3" aria-label={ev.title}>
      <div className={`${card} space-y-2`}>
        <h2 className="text-xl font-black uppercase leading-tight text-zinc-50">{ev.title}</h2>
        {ev.startsAt ? (
          <p className="flex items-center gap-1.5 text-sm text-zinc-200">
            <CalendarDays size={15} className="text-zinc-400" /> {dateLabel(ev.startsAt)} WIB{ev.venue ? ` · ${ev.venue}` : ""}
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-1.5" aria-label="Jabatan Anda">
          {ev.roles.map((r) => (
            <li key={r.role} className="rounded border border-amber-300/50 px-2 py-0.5 text-xs font-semibold text-amber-200">
              {r.label}
            </li>
          ))}
        </ul>
        <p className="text-sm text-zinc-300">{openMine ? `${openMine} tugas Anda belum selesai.` : "Tidak ada tugas Anda yang terbuka."}</p>
      </div>

      <div className={`${card} space-y-2`}>
        <h3 className="flex items-center gap-2 font-bold">
          <ListOrdered size={16} className="text-[#ff6b75]" /> Rundown
        </h3>
        {!ev.rundown.length ? <p className="text-sm text-zinc-400">Belum ada penampil terkonfirmasi.</p> : null}
        <ol className="divide-y divide-white/10">
          {ev.rundown.map((r) => (
            <li key={`${r.slot}-${r.name}`} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="mr-2 font-mono text-xs text-[#ff6b75]">#{String(r.slot).padStart(2, "0")}</span>
                <span className="font-semibold uppercase">{r.name}</span>
              </span>
              <span className={`flex shrink-0 items-center gap-1 text-sm tabular-nums ${r.overlap ? "text-amber-200" : "text-zinc-200"}`}>
                <Clock3 size={13} className="text-zinc-400" />
                {r.start ? `${r.start}${r.end ? `–${r.end}` : ""}` : "jam belum diatur"}
                {r.overlap ? " · bertumpuk" : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold">
            <ClipboardList size={16} className="text-[#ff6b75]" /> Tugas
          </h3>
          <div className="flex gap-1.5" role="tablist" aria-label="Saring tugas">
            {(
              [
                ["mine", "Tugas saya"],
                ["all", "Semua"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`min-h-10 rounded-md border px-3 text-sm ${filter === key ? "border-[var(--garage-red,#e10613)] bg-[color-mix(in_srgb,var(--garage-red,#e10613)_20%,transparent)] text-zinc-50" : "border-white/15 text-zinc-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {!tasks.length ? <p className="text-sm text-zinc-400">{filter === "mine" ? "Belum ada tugas untuk Anda." : "Belum ada tugas."}</p> : null}
        <ul className="grid gap-2">
          {tasks.map((t) => (
            <li key={t.id} className={`rounded-md border p-3 ${t.overdue ? "border-amber-300/50" : "border-white/10"} bg-black/20`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-zinc-50">{t.title}</p>
                  <p className="text-xs text-zinc-300">
                    {t.crewName ? `PIC ${t.crewName}` : "Belum ada PIC"}
                    {t.dueDate ? ` · tenggat ${dueLabel(t.dueDate)}` : ""}
                    {t.priority === "tinggi" ? " · prioritas tinggi" : ""}
                  </p>
                  {t.overdue ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-200">
                      <AlertTriangle size={12} /> Terlambat
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-xs text-zinc-200">{TASK_STATUS_LABEL[t.status]}</span>
              </div>
              {t.canUpdate ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["todo", "proses", "selesai"] as TaskStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busyId === t.id || t.status === s}
                      onClick={() => void setStatus(t.id, s)}
                      className={`inline-flex min-h-10 items-center gap-1 rounded-md border px-3 text-sm disabled:cursor-not-allowed ${
                        t.status === s ? "border-emerald-400/50 text-emerald-200" : "border-white/15 text-zinc-100 hover:bg-white/10"
                      }`}
                    >
                      {t.status === s ? <CheckCircle2 size={14} /> : null}
                      {TASK_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {ev.canManageTasks ? <NewTaskForm ev={ev} onSaved={onChanged} /> : null}
      </div>

      {ev.finance ? (
        <div className={`${card} space-y-2`}>
          <h3 className="flex items-center gap-2 font-bold">
            <Wallet size={16} className="text-[#ff6b75]" /> Ringkasan anggaran
          </h3>
          <p className="text-xs text-zinc-300">Hanya baca. Pembayaran dicatat oleh Owner di Keuangan Event.</p>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[
              ["Anggaran", ev.finance.planned],
              ["Sudah dibayar", ev.finance.paid],
              ["Sisa", Math.max(0, ev.finance.planned - ev.finance.paid)],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0 rounded-md border border-white/10 p-2">
                <dt className="text-xs text-zinc-400">{label}</dt>
                <dd className="font-mono font-bold tabular-nums text-zinc-50">{rp(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <ul className="divide-y divide-white/10 text-sm">
            {ev.finance.categories.map((c) => (
              <li key={c.category} className="flex items-baseline justify-between gap-2 py-1.5">
                <span className="min-w-0 text-zinc-200">{c.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-zinc-100">
                  {rp(c.paid)} <span className="text-zinc-400">/ {rp(c.planned)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function NewTaskForm({ ev, onSaved }: { ev: EventView; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [crewId, setCrewId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"rendah" | "normal" | "tinggi">("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[var(--garage-red,#e10613)] px-4 text-sm font-bold text-white">
        <Plus size={16} /> Tambah tugas
      </button>
    );
  }
  return (
    <form
      className="grid gap-2 rounded-md border border-white/10 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await garageApi.post("/api/panitia/tasks", { eventKey: ev.key, title, crewId: crewId || null, dueDate: dueDate || null, priority });
          setTitle("");
          setCrewId("");
          setDueDate("");
          setOpen(false);
          await onSaved();
        } catch (err) {
          setError(errText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="grid gap-1 text-xs font-semibold text-zinc-300" htmlFor={`task-title-${ev.key}`}>
        Judul tugas
        <input id={`task-title-${ev.key}`} className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} placeholder="mis. Konfirmasi sound system" />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold text-zinc-300" htmlFor={`task-pic-${ev.key}`}>
          Penanggung jawab
          <select id={`task-pic-${ev.key}`} className={input} value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            <option value="">Belum ditentukan</option>
            {ev.assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.role}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-300" htmlFor={`task-due-${ev.key}`}>
          Tenggat
          <input id={`task-due-${ev.key}`} type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-300" htmlFor={`task-prio-${ev.key}`}>
          Prioritas
          <select id={`task-prio-${ev.key}`} className={input} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="rendah">Rendah</option>
            <option value="normal">Normal</option>
            <option value="tinggi">Tinggi</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-md border border-white/15 px-4 text-sm text-zinc-100">
          Batal
        </button>
        <button type="submit" disabled={busy} className="min-h-11 rounded-md bg-[var(--garage-red,#e10613)] px-4 text-sm font-bold text-white disabled:opacity-60">
          {busy ? "Menyimpan…" : "Simpan tugas"}
        </button>
      </div>
    </form>
  );
}
