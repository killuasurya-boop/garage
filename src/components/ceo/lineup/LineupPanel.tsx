"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ListOrdered,
  MessageCircle,
  Mic2,
  Music2,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Badge } from "@/components/ceo/ui/Badge";
import { garageApi, GarageApiError } from "@/lib/api-client";
import {
  CREW_ROLE_LABEL,
  CREW_ROLES,
  LINEUP_KIND_LABEL,
  LINEUP_KIND_ORDER,
  PERFORMER_STATUS_LABEL,
  performerScheduleMessage,
  TASK_STATUS_LABEL,
  type CrewRole,
  type LineupKind,
  type PerformerStatus,
  type RundownRow,
  type TaskStatus,
} from "@/lib/event-lineup-rules";
import type { CrewView, PerformerView, TaskView } from "@/lib/event-lineup-service";

// Lineup & Panitia Event (owner 16 Nov 2026): Owner saja. Semua data & aturan (rundown, kesiapan, tugas terlambat)
// dihitung di server; layar ini hanya menampilkan dan mengirim perubahan.

type Board = {
  today: string;
  events: string[];
  eventName: string | null;
  performers: PerformerView[];
  rundown: RundownRow[];
  crew: CrewView[];
  tasks: TaskView[];
  readiness: { items: Array<{ key: string; label: string; done: boolean; detail: string }>; done: number; total: number };
};

type Tab = "lineup" | "rundown" | "panitia" | "tugas";

const errText = (error: unknown) => (error instanceof GarageApiError || error instanceof Error ? error.message : "Gagal menyimpan.");
const waLink = (phone: string, text?: string) => `https://wa.me/62${phone.replace(/^0/, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
const dateLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${iso}T12:00:00+07:00`)) : "—";

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-3)] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[color-mix(in_srgb,var(--garage-amber)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--garage-amber)_40%,transparent)]";
const areaClass = inputClass.replace("h-10", "min-h-20 py-2");
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_60%,transparent)] bg-[var(--garage-red)] px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const smallBtn =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-white/15 px-2.5 text-xs font-semibold text-zinc-100 hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const cardClass = "rounded-lg border border-white/10 bg-[var(--garage-bg-2)] p-4";

const STATUS_TONE: Record<PerformerStatus, "success" | "amber" | "muted"> = { konfirmasi: "success", calon: "amber", batal: "muted" };
const TASK_TONE: Record<TaskStatus, "success" | "amber" | "muted" | "info"> = { selesai: "success", proses: "amber", todo: "info", batal: "muted" };
const KIND_ICON: Record<LineupKind, typeof Music2> = { band: Music2, standup: Mic2, akustik: Music2, dj: Music2, kreator: Users };

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

export function LineupPanel() {
  const [board, setBoard] = useState<Board | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lineup");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newEvent, setNewEvent] = useState("");
  const [dialog, setDialog] = useState<
    | { kind: "performer"; row: PerformerView | null }
    | { kind: "cancel"; row: PerformerView }
    | { kind: "crew"; row: CrewView | null }
    | { kind: "task"; row: TaskView | null }
    | null
  >(null);

  const load = useCallback(async (name: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<Board>(`/api/event-lineup${name ? `?event=${encodeURIComponent(name)}` : ""}`, { cache: "no-store" });
      setBoard(data);
      setEvent(data.eventName);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Muat pertama: state hanya diubah di callback setelah data datang (bukan sinkron di effect).
  useEffect(() => {
    let alive = true;
    garageApi
      .get<Board>("/api/event-lineup", { cache: "no-store" })
      .then((data) => {
        if (!alive) return;
        setBoard(data);
        setEvent(data.eventName);
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
      await load(event);
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    }
  };

  const confirmedCount = board?.performers.filter((p) => p.status === "konfirmasi").length ?? 0;
  const openTasks = board?.tasks.filter((t) => t.status === "todo" || t.status === "proses").length ?? 0;
  const lateTasks = board?.tasks.filter((t) => t.overdue).length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Event"
        title="Lineup & Panitia"
        subtitle="Band, stand-up, rundown tampil, panitia, dan tugas per event. Penampil terkonfirmasi tampil di website GIGS."
        actions={
          <button type="button" className={ghostBtn} onClick={() => void load(event)} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin motion-reduce:animate-none" : ""} /> Muat ulang
          </button>
        }
      />

      {/* Pilih / buat event */}
      <div className={`${cardClass} grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start`}>
        <Field label="Event">
          <select className={inputClass} value={event ?? ""} onChange={(e) => void load(e.target.value || null)}>
            {!board?.events.length ? <option value="">Belum ada event</option> : null}
            {board?.events.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <form
          className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newEvent.trim();
            if (name.length < 2) return;
            setNewEvent("");
            setBoard((b) => (b ? { ...b, eventName: name, events: [name, ...b.events.filter((x) => x !== name)], performers: [], rundown: [], crew: [], tasks: [] } : b));
            setEvent(name);
          }}
        >
          <Field label="Event baru" hint="Pakai nama persis seperti di platform event (mis. GIGS AKHIR TAHUN 2026) agar lineup tampil di website.">
            <input className={inputClass} value={newEvent} onChange={(e) => setNewEvent(e.target.value)} placeholder="Nama event" maxLength={120} />
          </Field>
          <button type="submit" className={`${ghostBtn} sm:mt-[1.375rem]`}>
            <Plus size={16} /> Pakai
          </button>
        </form>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] px-3 py-2 text-sm text-[#ffc4c4]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {event && board ? (
        <>
          {/* Ringkasan + kesiapan */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Penampil terkonfirmasi" value={`${confirmedCount}`} sub={`${board.performers.filter((p) => p.status === "calon").length} calon`} />
            <Stat label="Panitia aktif" value={`${board.crew.filter((c) => c.status === "aktif").length}`} sub={`${new Set(board.crew.filter((c) => c.status === "aktif").map((c) => c.role)).size} peran`} />
            <Stat label="Tugas terbuka" value={`${openTasks}`} sub={lateTasks ? `${lateTasks} terlambat` : "Tidak ada yang terlambat"} tone={lateTasks ? "red" : undefined} />
            <Stat label="Kesiapan acara" value={`${board.readiness.done}/${board.readiness.total}`} sub="Checklist di bawah" tone={board.readiness.done === board.readiness.total ? "success" : undefined} />
          </div>
          <div className={cardClass}>
            <h2 className="mb-2 text-sm font-bold uppercase text-zinc-200">Checklist kesiapan</h2>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {board.readiness.items.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-sm">
                  {item.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />}
                  <span className="min-w-0">
                    <span className="text-zinc-100">{item.label}</span> <span className="text-zinc-400">· {item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tab */}
          <div className="flex flex-wrap gap-2" role="tablist">
            {(
              [
                ["lineup", "Lineup", Music2],
                ["rundown", "Rundown", ListOrdered],
                ["panitia", "Panitia", Users],
                ["tugas", "Tugas", ClipboardList],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`${smallBtn} h-9 px-3 text-sm ${tab === key ? "border-[color-mix(in_srgb,var(--garage-red)_70%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_20%,transparent)]" : ""}`}
                onClick={() => setTab(key)}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {tab === "lineup" ? (
            <LineupTab
              board={board}
              onAdd={() => setDialog({ kind: "performer", row: null })}
              onEdit={(row) => setDialog({ kind: "performer", row })}
              onCancel={(row) => setDialog({ kind: "cancel", row })}
              onStatus={(row, status) => void run(() => garageApi.patch(`/api/event-lineup/performers/${row.id}`, { status }))}
              onMove={(ids) => void run(() => garageApi.post("/api/event-lineup/reorder", { eventName: event, ids }))}
            />
          ) : null}
          {tab === "rundown" ? <RundownTab board={board} /> : null}
          {tab === "panitia" ? (
            <CrewTab
              board={board}
              onAdd={() => setDialog({ kind: "crew", row: null })}
              onEdit={(row) => setDialog({ kind: "crew", row })}
              onToggle={(row) => void run(() => garageApi.patch(`/api/event-lineup/crew/${row.id}`, { status: row.status === "aktif" ? "nonaktif" : "aktif" }))}
            />
          ) : null}
          {tab === "tugas" ? (
            <TaskTab
              board={board}
              onAdd={() => setDialog({ kind: "task", row: null })}
              onEdit={(row) => setDialog({ kind: "task", row })}
              onStatus={(row, status) => void run(() => garageApi.patch(`/api/event-lineup/tasks/${row.id}`, { status }))}
            />
          ) : null}
        </>
      ) : !loading ? (
        <div className={`${cardClass} text-sm text-zinc-300`}>Belum ada event. Isi “Event baru” di atas untuk mulai menyusun lineup dan panitia.</div>
      ) : null}

      {dialog?.kind === "performer" && event ? (
        <PerformerForm event={event} row={dialog.row} onClose={() => setDialog(null)} onSave={(body) => run(() => (dialog.row ? garageApi.patch(`/api/event-lineup/performers/${dialog.row.id}`, body) : garageApi.post("/api/event-lineup", { ...body, eventName: event })))} />
      ) : null}
      {dialog?.kind === "cancel" ? (
        <CancelForm row={dialog.row} onClose={() => setDialog(null)} onSave={(reason) => run(() => garageApi.patch(`/api/event-lineup/performers/${dialog.row.id}`, { status: "batal", cancelReason: reason }))} />
      ) : null}
      {dialog?.kind === "crew" && event ? (
        <CrewForm row={dialog.row} onClose={() => setDialog(null)} onSave={(body) => run(() => (dialog.row ? garageApi.patch(`/api/event-lineup/crew/${dialog.row.id}`, body) : garageApi.post("/api/event-lineup/crew", { ...body, eventName: event })))} />
      ) : null}
      {dialog?.kind === "task" && event && board ? (
        <TaskForm row={dialog.row} crew={board.crew.filter((c) => c.status === "aktif" || c.id === dialog.row?.crewId)} onClose={() => setDialog(null)} onSave={(body) => run(() => (dialog.row ? garageApi.patch(`/api/event-lineup/tasks/${dialog.row.id}`, body) : garageApi.post("/api/event-lineup/tasks", { ...body, eventName: event })))} />
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "red" | "success" }) {
  const color = tone === "red" ? "text-[#ff8a8a]" : tone === "success" ? "text-emerald-300" : "text-zinc-50";
  return (
    <div className={cardClass}>
      <p className="text-xs font-semibold uppercase text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-zinc-400">{sub}</p>
    </div>
  );
}

// ─── Lineup ────────────────────────────────────────────────────────────────

function LineupTab({
  board,
  onAdd,
  onEdit,
  onCancel,
  onStatus,
  onMove,
}: {
  board: Board;
  onAdd: () => void;
  onEdit: (row: PerformerView) => void;
  onCancel: (row: PerformerView) => void;
  onStatus: (row: PerformerView, status: PerformerStatus) => void;
  onMove: (ids: string[]) => void;
}) {
  const slotOf = new Map(board.rundown.map((r) => [r.id, r]));
  const order = board.rundown.map((r) => r.id);
  const move = (id: string, delta: number) => {
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onMove(next);
  };
  const groups = LINEUP_KIND_ORDER.map((kind) => ({ kind, items: board.performers.filter((p) => p.kind === kind) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">Urutan slot mengikuti rundown. Naik/turun mengubah urutan tampil.</p>
        <button type="button" className={primaryBtn} onClick={onAdd}>
          <Plus size={16} /> Tambah penampil
        </button>
      </div>
      {!groups.length ? <div className={`${cardClass} text-sm text-zinc-300`}>Belum ada penampil di event ini.</div> : null}
      {groups.map(({ kind, items }) => {
        const Icon = KIND_ICON[kind];
        return (
          <section key={kind} aria-label={LINEUP_KIND_LABEL[kind]}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase text-zinc-100">
              <Icon size={16} className={kind === "standup" ? "text-amber-300" : "text-[var(--garage-red)]"} /> {LINEUP_KIND_LABEL[kind]}
              <Badge tone="chrome">{items.filter((i) => i.status === "konfirmasi").length} terkonfirmasi</Badge>
            </h3>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((row) => {
                const rd = slotOf.get(row.id);
                return (
                  <li key={row.id} className={`${cardClass} flex min-w-0 flex-col gap-2 ${row.status === "batal" ? "opacity-70" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-[#ff6b75]">{rd ? `SLOT #${String(rd.slot).padStart(2, "0")}` : "—"}</span>
                      <Badge tone={STATUS_TONE[row.status as PerformerStatus]}>{PERFORMER_STATUS_LABEL[row.status as PerformerStatus]}</Badge>
                    </div>
                    <strong className="break-words text-lg font-black uppercase text-zinc-50">{row.name}</strong>
                    <p className="text-sm text-zinc-300">
                      {[row.genre, row.memberCount ? `${row.memberCount} orang` : null].filter(Boolean).join(" · ") || LINEUP_KIND_LABEL[kind]}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-zinc-200">
                      <Clock3 size={14} className="text-zinc-400" />
                      {rd?.start ? `${rd.start}${rd.end ? `–${rd.end}` : ""} WIB` : "Jam tampil belum diatur"}
                      {rd?.overlap ? <Badge tone="red">Bertumpuk</Badge> : null}
                    </p>
                    {row.contactPhone ? (
                      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                        {row.contactName ?? "Kontak"} ·
                        <a className="inline-flex items-center gap-1 text-zinc-100 underline-offset-2 hover:underline" href={`tel:${row.contactPhone}`}>
                          <Phone size={13} /> {row.contactPhone}
                        </a>
                        {rd ? (
                          <a className="inline-flex items-center gap-1 text-emerald-300 underline-offset-2 hover:underline" href={waLink(row.contactPhone, performerScheduleMessage(board.eventName ?? "", rd))} target="_blank" rel="noreferrer">
                            <MessageCircle size={13} /> Kirim jadwal
                          </a>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-300">Kontak belum diisi</p>
                    )}
                    {row.status === "batal" && row.cancelReason ? <p className="text-xs text-zinc-400">Alasan batal: {row.cancelReason}</p> : null}
                    {!row.showOnWebsite ? <p className="text-xs text-zinc-400">Tidak ditampilkan di website</p> : null}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {row.status === "calon" ? (
                        <button type="button" className={smallBtn} onClick={() => onStatus(row, "konfirmasi")}>
                          <CheckCircle2 size={13} /> Konfirmasi
                        </button>
                      ) : null}
                      {row.status === "batal" ? (
                        <button type="button" className={smallBtn} onClick={() => onStatus(row, "calon")}>
                          Aktifkan lagi
                        </button>
                      ) : null}
                      <button type="button" className={smallBtn} onClick={() => onEdit(row)}>
                        <Pencil size={13} /> Ubah
                      </button>
                      {rd ? (
                        <>
                          <button type="button" className={smallBtn} onClick={() => move(row.id, -1)} disabled={rd.slot === 1} aria-label={`Naikkan ${row.name}`}>
                            <ArrowUp size={13} />
                          </button>
                          <button type="button" className={smallBtn} onClick={() => move(row.id, 1)} disabled={rd.slot === order.length} aria-label={`Turunkan ${row.name}`}>
                            <ArrowDown size={13} />
                          </button>
                        </>
                      ) : null}
                      {row.status !== "batal" ? (
                        <button type="button" className={smallBtn} onClick={() => onCancel(row)}>
                          <Ban size={13} /> Batalkan
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ─── Rundown ───────────────────────────────────────────────────────────────

function RundownTab({ board }: { board: Board }) {
  const contact = new Map(board.performers.map((p) => [p.id, p.contactPhone]));
  return (
    <div className={`${cardClass} space-y-3 print:border-0 print:bg-white print:text-black`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase text-zinc-100 print:text-black">Rundown penampil · {board.eventName}</h3>
        <button type="button" className={`${smallBtn} print:hidden`} onClick={() => window.print()}>
          <Printer size={13} /> Cetak
        </button>
      </div>
      {!board.rundown.length ? <p className="text-sm text-zinc-300">Belum ada penampil aktif.</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-2 pr-3">Slot</th>
              <th className="py-2 pr-3">Jam</th>
              <th className="py-2 pr-3">Penampil</th>
              <th className="py-2 pr-3">Jenis</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Catatan</th>
              <th className="py-2 print:hidden">Kabari</th>
            </tr>
          </thead>
          <tbody>
            {board.rundown.map((row) => {
              const phone = contact.get(row.id);
              return (
                <tr key={row.id} className="border-t border-white/10 align-top text-zinc-100">
                  <td className="py-2 pr-3 font-mono">#{String(row.slot).padStart(2, "0")}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{row.start ? `${row.start}${row.end ? `–${row.end}` : ""}` : "—"}</td>
                  <td className="py-2 pr-3 font-semibold">{row.name}</td>
                  <td className="py-2 pr-3">{LINEUP_KIND_LABEL[row.kind]}</td>
                  <td className="py-2 pr-3">{PERFORMER_STATUS_LABEL[row.status]}</td>
                  <td className="py-2 pr-3 text-xs">
                    {row.overlap ? <span className="text-[#ff8a8a]">Bertumpuk dengan slot sebelumnya</span> : row.gapMinutes && row.gapMinutes > 0 ? <span className="text-zinc-400">Jeda {row.gapMinutes} menit</span> : null}
                  </td>
                  <td className="py-2 print:hidden">
                    {phone ? (
                      <a className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline" href={waLink(phone, performerScheduleMessage(board.eventName ?? "", row))} target="_blank" rel="noreferrer">
                        <MessageCircle size={13} /> WA
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Panitia ───────────────────────────────────────────────────────────────

function CrewTab({ board, onAdd, onEdit, onToggle }: { board: Board; onAdd: () => void; onEdit: (row: CrewView) => void; onToggle: (row: CrewView) => void }) {
  const roles = CREW_ROLES.filter((role) => board.crew.some((c) => c.role === role));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">Panitia dikelompokkan per peran. Nonaktif tidak dihapus agar riwayat tugas tetap ada.</p>
        <button type="button" className={primaryBtn} onClick={onAdd}>
          <UserPlus size={16} /> Tambah panitia
        </button>
      </div>
      {!roles.length ? <div className={`${cardClass} text-sm text-zinc-300`}>Belum ada panitia. Mulai dari Ketua Panitia dan Stage Manager.</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {roles.map((role) => (
          <section key={role} className={cardClass} aria-label={CREW_ROLE_LABEL[role]}>
            <h3 className="mb-2 text-sm font-bold uppercase text-amber-200">{CREW_ROLE_LABEL[role]}</h3>
            <ul className="space-y-2">
              {board.crew
                .filter((c) => c.role === role)
                .map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-start justify-between gap-2 border-t border-white/10 pt-2 first:border-0 first:pt-0 ${c.status === "nonaktif" ? "opacity-60" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-50">
                        {c.name} {c.status === "nonaktif" ? <Badge tone="muted">Nonaktif</Badge> : null}
                      </p>
                      {c.duties ? <p className="whitespace-pre-line text-sm text-zinc-300">{c.duties}</p> : null}
                      <p className="text-xs text-zinc-400">{c.openTasks} tugas terbuka</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.phone ? (
                        <a className={smallBtn} href={waLink(c.phone)} target="_blank" rel="noreferrer">
                          <MessageCircle size={13} /> WA
                        </a>
                      ) : null}
                      <button type="button" className={smallBtn} onClick={() => onEdit(c)}>
                        <Pencil size={13} /> Ubah
                      </button>
                      <button type="button" className={smallBtn} onClick={() => onToggle(c)}>
                        {c.status === "aktif" ? <UserMinus size={13} /> : <UserPlus size={13} />} {c.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Tugas ─────────────────────────────────────────────────────────────────

function TaskTab({ board, onAdd, onEdit, onStatus }: { board: Board; onAdd: () => void; onEdit: (row: TaskView) => void; onStatus: (row: TaskView, status: TaskStatus) => void }) {
  const [filter, setFilter] = useState<"terbuka" | "terlambat" | "semua">("terbuka");
  const rows = useMemo(
    () =>
      board.tasks.filter((t) => (filter === "semua" ? true : filter === "terlambat" ? t.overdue : t.status === "todo" || t.status === "proses")),
    [board.tasks, filter],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["terbuka", "terlambat", "semua"] as const).map((key) => (
            <button key={key} type="button" className={`${smallBtn} ${filter === key ? "bg-white/10" : ""}`} onClick={() => setFilter(key)} aria-pressed={filter === key}>
              {key === "terbuka" ? "Terbuka" : key === "terlambat" ? "Terlambat" : "Semua"}
            </button>
          ))}
        </div>
        <button type="button" className={primaryBtn} onClick={onAdd}>
          <Plus size={16} /> Tambah tugas
        </button>
      </div>
      {!rows.length ? <div className={`${cardClass} text-sm text-zinc-300`}>Tidak ada tugas di filter ini.</div> : null}
      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.id} className={`${cardClass} flex flex-wrap items-start justify-between gap-3`}>
            <div className="min-w-0">
              <p className="font-semibold text-zinc-50">
                {t.title} {t.priority === "tinggi" ? <Badge tone="red">Prioritas tinggi</Badge> : null}
              </p>
              <p className="text-sm text-zinc-300">
                {t.crewName ?? "Belum ada penanggung jawab"} · Tenggat {dateLabel(t.dueDate)}
                {t.overdue ? <span className="ml-1 font-semibold text-[#ff8a8a]">· Terlambat</span> : null}
              </p>
              {t.notes ? <p className="mt-1 whitespace-pre-line text-xs text-zinc-400">{t.notes}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={TASK_TONE[t.status as TaskStatus]}>{TASK_STATUS_LABEL[t.status as TaskStatus]}</Badge>
              {t.status === "todo" ? (
                <button type="button" className={smallBtn} onClick={() => onStatus(t, "proses")}>
                  Mulai
                </button>
              ) : null}
              {t.status === "todo" || t.status === "proses" ? (
                <button type="button" className={smallBtn} onClick={() => onStatus(t, "selesai")}>
                  <CheckCircle2 size={13} /> Selesai
                </button>
              ) : null}
              {t.status === "selesai" || t.status === "batal" ? (
                <button type="button" className={smallBtn} onClick={() => onStatus(t, "todo")}>
                  Buka lagi
                </button>
              ) : null}
              <button type="button" className={smallBtn} onClick={() => onEdit(t)}>
                <Pencil size={13} /> Ubah
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Form ──────────────────────────────────────────────────────────────────

const numOrNull = (value: string) => (value.trim() === "" ? null : Number.parseInt(value, 10));

function FormActions({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
    <div className="sticky bottom-0 mt-3 flex justify-end gap-2 bg-[var(--garage-bg-2)] pt-2">
      <button type="button" className={ghostBtn} onClick={onClose}>
        Batal
      </button>
      <button type="submit" className={primaryBtn} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan"}
      </button>
    </div>
  );
}

function useSubmit(onSave: () => Promise<boolean>, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    submit: async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      const ok = await onSave();
      setBusy(false);
      if (ok) onClose();
    },
  };
}

function PerformerForm({ event, row, onClose, onSave }: { event: string; row: PerformerView | null; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [f, setF] = useState({
    name: row?.name ?? "",
    kind: (row?.kind as LineupKind) ?? "band",
    status: (row?.status as PerformerStatus) ?? "calon",
    genre: row?.genre ?? "",
    memberCount: row?.memberCount ? String(row.memberCount) : "",
    contactName: row?.contactName ?? "",
    contactPhone: row?.contactPhone ?? "",
    instagram: row?.instagram ?? "",
    setStart: row?.setStart ?? "",
    setMinutes: row?.setMinutes ? String(row.setMinutes) : "",
    techRider: row?.techRider ?? "",
    notes: row?.notes ?? "",
    showOnWebsite: row?.showOnWebsite ?? true,
  });
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [key]: e.target.value }));
  const { busy, submit } = useSubmit(
    () =>
      onSave({
        name: f.name,
        kind: f.kind,
        ...(row ? {} : { status: f.status }),
        genre: f.genre || null,
        memberCount: numOrNull(f.memberCount),
        contactName: f.contactName || null,
        contactPhone: f.contactPhone || null,
        instagram: f.instagram || null,
        setStart: f.setStart || null,
        setMinutes: numOrNull(f.setMinutes),
        techRider: f.techRider || null,
        notes: f.notes || null,
        showOnWebsite: f.showOnWebsite,
      }),
    onClose,
  );
  return (
    <Modal title={row ? `Ubah ${row.name}` : `Tambah penampil · ${event}`} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="sm:col-span-2">
          <Field label="Nama penampil">
            <input className={inputClass} value={f.name} onChange={set("name")} required minLength={2} maxLength={80} />
          </Field>
        </div>
        <Field label="Jenis">
          <select className={inputClass} value={f.kind} onChange={set("kind")}>
            {LINEUP_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {LINEUP_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {!row ? (
          <Field label="Status">
            <select className={inputClass} value={f.status} onChange={set("status")}>
              <option value="calon">Calon</option>
              <option value="konfirmasi">Terkonfirmasi</option>
            </select>
          </Field>
        ) : (
          <Field label="Genre / materi">
            <input className={inputClass} value={f.genre} onChange={set("genre")} maxLength={60} />
          </Field>
        )}
        {!row ? (
          <Field label="Genre / materi">
            <input className={inputClass} value={f.genre} onChange={set("genre")} maxLength={60} placeholder="mis. pop punk, komedi observasi" />
          </Field>
        ) : null}
        <Field label="Jumlah personel">
          <input className={inputClass} inputMode="numeric" value={f.memberCount} onChange={(e) => setF((s) => ({ ...s, memberCount: e.target.value.replace(/\D/g, "").slice(0, 2) }))} />
        </Field>
        <Field label="Jam tampil (WIB)">
          <input className={inputClass} type="time" value={f.setStart} onChange={set("setStart")} />
        </Field>
        <Field label="Durasi (menit)">
          <input className={inputClass} inputMode="numeric" value={f.setMinutes} onChange={(e) => setF((s) => ({ ...s, setMinutes: e.target.value.replace(/\D/g, "").slice(0, 3) }))} placeholder="mis. 30" />
        </Field>
        <Field label="Nama kontak">
          <input className={inputClass} value={f.contactName} onChange={set("contactName")} maxLength={80} />
        </Field>
        <Field label="WhatsApp kontak">
          <input className={inputClass} inputMode="tel" value={f.contactPhone} onChange={set("contactPhone")} placeholder="08…" maxLength={24} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Instagram">
            <input className={inputClass} value={f.instagram} onChange={set("instagram")} placeholder="@akun" maxLength={60} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Tech rider / kebutuhan panggung">
            <textarea className={areaClass} value={f.techRider} onChange={set("techRider")} maxLength={1000} placeholder="mis. 2 vokal mic, 1 DI bass, drum set lengkap" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Catatan">
            <textarea className={areaClass} value={f.notes} onChange={set("notes")} maxLength={1000} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-200 sm:col-span-2">
          <input type="checkbox" checked={f.showOnWebsite} onChange={(e) => setF((s) => ({ ...s, showOnWebsite: e.target.checked }))} />
          Tampilkan di website saat terkonfirmasi
        </label>
        <div className="sm:col-span-2">
          <FormActions busy={busy} onClose={onClose} />
        </div>
      </form>
    </Modal>
  );
}

function CancelForm({ row, onClose, onSave }: { row: PerformerView; onClose: () => void; onSave: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const { busy, submit } = useSubmit(() => onSave(reason.trim()), onClose);
  return (
    <Modal title={`Batalkan ${row.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-zinc-300">Penampil tidak dihapus; tercatat batal beserta alasannya dan hilang dari rundown & website.</p>
        <Field label="Alasan pembatalan">
          <textarea className={areaClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} />
        </Field>
        <FormActions busy={busy || reason.trim().length < 3} onClose={onClose} />
      </form>
    </Modal>
  );
}

function CrewForm({ row, onClose, onSave }: { row: CrewView | null; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [f, setF] = useState({ name: row?.name ?? "", role: (row?.role as CrewRole) ?? "ketua", phone: row?.phone ?? "", duties: row?.duties ?? "" });
  const { busy, submit } = useSubmit(() => onSave({ name: f.name, role: f.role, phone: f.phone || null, duties: f.duties || null }), onClose);
  return (
    <Modal title={row ? `Ubah ${row.name}` : "Tambah panitia"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <Field label="Nama">
          <input className={inputClass} value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} required minLength={2} maxLength={80} />
        </Field>
        <Field label="Peran">
          <select className={inputClass} value={f.role} onChange={(e) => setF((s) => ({ ...s, role: e.target.value as CrewRole }))}>
            {CREW_ROLES.map((r) => (
              <option key={r} value={r}>
                {CREW_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="WhatsApp">
          <input className={inputClass} inputMode="tel" value={f.phone} onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))} placeholder="08…" maxLength={24} />
        </Field>
        <Field label="Tugas utama">
          <textarea className={areaClass} value={f.duties} onChange={(e) => setF((s) => ({ ...s, duties: e.target.value }))} maxLength={1000} placeholder="mis. memandu urutan tampil, cek sound tiap penampil" />
        </Field>
        <FormActions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function TaskForm({ row, crew, onClose, onSave }: { row: TaskView | null; crew: CrewView[]; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [f, setF] = useState({ title: row?.title ?? "", crewId: row?.crewId ?? "", dueDate: row?.dueDate ?? "", priority: row?.priority ?? "normal", notes: row?.notes ?? "" });
  const { busy, submit } = useSubmit(
    () => onSave({ title: f.title, crewId: f.crewId || null, dueDate: f.dueDate || null, priority: f.priority, notes: f.notes || null }),
    onClose,
  );
  return (
    <Modal title={row ? "Ubah tugas" : "Tambah tugas panitia"} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="sm:col-span-2">
          <Field label="Tugas">
            <input className={inputClass} value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} required minLength={3} maxLength={160} />
          </Field>
        </div>
        <Field label="Penanggung jawab">
          <select className={inputClass} value={f.crewId} onChange={(e) => setF((s) => ({ ...s, crewId: e.target.value }))}>
            <option value="">— Belum ditentukan —</option>
            {crew.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({CREW_ROLE_LABEL[c.role as CrewRole]})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tenggat">
          <input className={inputClass} type="date" value={f.dueDate} onChange={(e) => setF((s) => ({ ...s, dueDate: e.target.value }))} />
        </Field>
        <Field label="Prioritas">
          <select className={inputClass} value={f.priority} onChange={(e) => setF((s) => ({ ...s, priority: e.target.value }))}>
            <option value="rendah">Rendah</option>
            <option value="normal">Normal</option>
            <option value="tinggi">Tinggi</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Catatan">
            <textarea className={areaClass} value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} maxLength={1000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <FormActions busy={busy} onClose={onClose} />
        </div>
      </form>
    </Modal>
  );
}
