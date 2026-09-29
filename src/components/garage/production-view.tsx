"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Check,
  CheckCircle2,
  ChefHat,
  Coffee,
  Flame,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Undo2,
  Volume2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StationPrintPanel } from "@/components/garage/station-print-panel";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, invalidateGarageCache, subscribeGarageCache } from "@/lib/garage-cache";
import { currency } from "@/lib/garage-data";
import type {
  GarageMe,
  KitchenPerformanceData,
  KitchenShiftReport,
  ProductionBatchSuggestionView,
  ProductionBatchView,
  ProductionBoard,
  ProductionTicketView,
} from "@/lib/garage-api-types";
import {
  isHelperWorkstation,
  normalizeWorkstation,
  productionStationLabel,
  workstationLabel,
} from "@/lib/garage-production-rules";
import { isOnlineChannel, voice } from "@/lib/garage-voice";

const VoiceSettingsDialog = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceSettingsDialog),
  { ssr: false },
);
const VoiceStatusBadge = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceStatusBadge),
  { ssr: false },
);

type StationFilter = "all" | "Bar" | "Food";
type StatusColumn = "queue" | "cooking" | "ready";

const POLL_MS = 4000;
const RUSH_WAITING_THRESHOLD = 8;

const COLUMN_META: Record<StatusColumn, { label: string; hint: string; tone: string }> = {
  queue: { label: "Waiting", hint: "Belum dimulai", tone: "text-[#e4e4e7]" },
  cooking: { label: "Processing", hint: "Sedang dibuat", tone: "text-[#ffd08a]" },
  ready: { label: "Ready", hint: "Helper ACC & panggil waiter", tone: "text-[#bbf7d0]" },
};

function fmtElapsed(fromIso: string, now: number, untilIso?: string | null) {
  const end = untilIso ? new Date(untilIso).getTime() : now;
  const sec = Math.max(0, Math.floor((end - new Date(fromIso).getTime()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function elapsedMinutes(fromIso: string, now: number) {
  return Math.max(0, (now - new Date(fromIso).getTime()) / 60000);
}

function tableLabel(table: string) {
  const t = table.trim();
  if (/^(meja|take|delivery|bawa)/i.test(t)) return t.toUpperCase();
  return `MEJA ${t.replace(/^T-?/i, "")}`;
}

function StationChip({ station }: { station: "Bar" | "Food" }) {
  const isBar = station === "Bar";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
        isBar
          ? "border-[#f5a742]/50 bg-[#f5a742]/12 text-[#ffd08a]"
          : "border-[#d11a2a]/50 bg-[#d11a2a]/14 text-[#ffc2c8]"
      }`}
    >
      {isBar ? <Coffee className="size-3" /> : <ChefHat className="size-3" />}
      {productionStationLabel(station)}
    </span>
  );
}

export function ProductionView({
  me,
  canViewPerformance,
  performance,
  performanceLoading,
  performanceError,
  onRefreshPerformance,
}: {
  me: GarageMe;
  canViewPerformance: boolean;
  performance: KitchenPerformanceData | null;
  performanceLoading: boolean;
  performanceError: string | null;
  onRefreshPerformance: () => Promise<void> | void;
}) {
  const workstation = normalizeWorkstation(me.workstation);
  const isHelper = isHelperWorkstation(workstation);
  const [board, setBoard] = useState<ProductionBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [station, setStation] = useState<StationFilter>(
    workstation === "bar" || workstation === "helper_bar"
      ? "Bar"
      : workstation === "dapur" || workstation === "helper_dapur"
        ? "Food"
        : "all",
  );
  // Helper fokus ke kolom Ready (serah-terima) di mobile.
  const [mobileColumn, setMobileColumn] = useState<StatusColumn>(isHelper ? "ready" : "queue");
  const [handoverTicket, setHandoverTicket] = useState<ProductionTicketView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [qcTicket, setQcTicket] = useState<ProductionTicketView | null>(null);
  const [reopenTicket, setReopenTicket] = useState<ProductionTicketView | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [allocBatchId, setAllocBatchId] = useState<string | null>(null);
  const [allocChecked, setAllocChecked] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [shiftReport, setShiftReport] = useState<KitchenShiftReport | null>(null);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const prevStatusRef = useRef<Map<string, string> | null>(null);
  const prevLateRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      const data = await garageApi.get<ProductionBoard>("/api/production", { cache: "no-store" });
      setBoard(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat papan produksi.");
    } finally {
      if (!silent) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal; state di-set di callback async
    void load();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(true);
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsub = subscribeGarageCache(GARAGE_TAGS.kitchen, () => void load(true));
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      unsub();
    };
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem("garage:kds:sound") === "on") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- init sekali dari storage
        setSoundEnabled(true);
      }
    } catch {
      /* localStorage tidak tersedia */
    }
  }, []);

  const playTone = useCallback(
    (kind: "new" | "late") => {
      const ctx = audioRef.current;
      if (!soundEnabled || !ctx || ctx.state === "closed") return;
      try {
        const t = ctx.currentTime;
        const gain = ctx.createGain();
        const osc = ctx.createOscillator();
        osc.type = kind === "new" ? "sine" : "square";
        osc.frequency.setValueAtTime(kind === "new" ? 880 : 440, t);
        if (kind === "new") osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      } catch {
        /* audio ditolak (kiosk) — abaikan */
      }
    },
    [soundEnabled],
  );

  function toggleSound() {
    if (soundEnabled) {
      setSoundEnabled(false);
      try {
        localStorage.setItem("garage:kds:sound", "off");
      } catch {
        /* abaikan */
      }
      return;
    }
    const AudioCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioRef.current || audioRef.current.state === "closed") {
      audioRef.current = new AudioCtor();
    }
    void audioRef.current.resume();
    setSoundEnabled(true);
    try {
      localStorage.setItem("garage:kds:sound", "on");
    } catch {
      /* abaikan */
    }
  }

  const tickets = useMemo(() => board?.tickets ?? [], [board]);
  const lateIds = useMemo(
    () =>
      new Set(
        tickets
          .filter(
            (t) =>
              (t.status === "queue" || t.status === "cooking") &&
              elapsedMinutes(t.createdAt, now) > t.targetMinutes,
          )
          .map((t) => t.ticketNo),
      ),
    [tickets, now],
  );

  // Suara & voice: tiket baru, tiket jadi telat, transisi status.
  useEffect(() => {
    if (!board) return;
    const prev = prevStatusRef.current;
    const next = new Map(board.tickets.map((t) => [t.ticketNo, t.status]));
    if (prev) {
      let hasNew = false;
      for (const t of board.tickets) {
        const before = prev.get(t.ticketNo);
        if (!before) {
          hasNew = true;
          if (isOnlineChannel(t.channel)) {
            void voice.announce("online_new", { channel: t.channel, dedupKey: `${t.ticketNo}:online` });
          }
          continue;
        }
        if (before === "queue" && t.status === "cooking") {
          void voice.announce(t.station === "Bar" ? "bar_mixing" : "kitchen_cooking", {
            table: t.table,
            dedupKey: `${t.ticketNo}:cook`,
          });
        } else if (before !== "ready" && t.status === "ready") {
          void voice.announce("order_ready", { table: t.table, dedupKey: `${t.ticketNo}:ready` });
        }
      }
      if (hasNew) playTone("new");
    }
    prevStatusRef.current = next;
  }, [board, playTone]);

  useEffect(() => {
    let newlyLate = false;
    for (const id of lateIds) {
      if (!prevLateRef.current.has(id)) newlyLate = true;
    }
    if (newlyLate) playTone("late");
    prevLateRef.current = lateIds;
  }, [lateIds, playTone]);

  const inStation = useCallback(
    (s: "Bar" | "Food") => station === "all" || station === s,
    [station],
  );
  const visibleTickets = useMemo(() => tickets.filter((t) => inStation(t.station)), [tickets, inStation]);
  const visibleSuggestions = useMemo(
    () => (board?.suggestions ?? []).filter((s) => inStation(s.station)),
    [board, inStation],
  );
  const visibleBatches = useMemo(
    () => (board?.batches ?? []).filter((b) => inStation(b.station)),
    [board, inStation],
  );
  const visibleCancelled = useMemo(
    () => (board?.cancelled ?? []).filter((c) => inStation(c.station)),
    [board, inStation],
  );

  const columns = useMemo(() => {
    const sortKey = (t: ProductionTicketView) => {
      const late = lateIds.has(t.ticketNo) ? 0 : 1;
      return [late, new Date(t.createdAt).getTime()] as const;
    };
    const by = (status: StatusColumn) =>
      visibleTickets
        .filter((t) => t.status === status)
        .sort((a, b) => {
          const [la, ta] = sortKey(a);
          const [lb, tb] = sortKey(b);
          return la - lb || ta - tb;
        });
    return { queue: by("queue"), cooking: by("cooking"), ready: by("ready") };
  }, [visibleTickets, lateIds]);

  const counts = {
    queue: columns.queue.length,
    cooking: columns.cooking.length + visibleBatches.length,
    ready: columns.ready.length,
  };
  const stationCounts = useMemo(
    () => ({
      all: tickets.length,
      Bar: tickets.filter((t) => t.station === "Bar").length,
      Food: tickets.filter((t) => t.station === "Food").length,
    }),
    [tickets],
  );
  const rush = counts.queue >= RUSH_WAITING_THRESHOLD || lateIds.size > 0;
  const canOperate = board?.canOperate ?? { Bar: false, Food: false };
  const canHandover = board?.canHandover ?? { Bar: false, Food: false };
  const waiters = board?.waiters ?? [];
  const allocBatch = useMemo(
    () => board?.batches.find((b) => b.id === allocBatchId) ?? null,
    [board, allocBatchId],
  );

  async function runAction(key: string, fn: () => Promise<unknown>) {
    if (busyKey) return false;
    setBusyKey(key);
    setActionError(null);
    try {
      await fn();
      invalidateGarageCache([GARAGE_TAGS.kitchen]);
      await load(true);
      return true;
    } catch (error) {
      setActionError(
        error instanceof GarageApiError || error instanceof Error ? error.message : "Aksi gagal.",
      );
      await load(true);
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  function startTicket(ticket: ProductionTicketView) {
    void runAction(`start:${ticket.ticketNo}`, () =>
      garageApi.post(`/api/production/tickets/${encodeURIComponent(ticket.ticketNo)}`, {
        action: "start",
      }),
    );
  }

  async function confirmReady() {
    if (!qcTicket) return;
    const ticket = qcTicket;
    const ok = await runAction(`ready:${ticket.ticketNo}`, () =>
      garageApi.post(`/api/production/tickets/${encodeURIComponent(ticket.ticketNo)}`, {
        action: "ready",
        qcConfirmed: true,
      }),
    );
    if (ok) setQcTicket(null);
  }

  async function confirmReopen() {
    if (!reopenTicket || reopenReason.trim().length < 3) return;
    const ticket = reopenTicket;
    const ok = await runAction(`reopen:${ticket.ticketNo}`, () =>
      garageApi.post(`/api/production/tickets/${encodeURIComponent(ticket.ticketNo)}`, {
        action: "reopen",
        reason: reopenReason.trim(),
      }),
    );
    if (ok) {
      setReopenTicket(null);
      setReopenReason("");
    }
  }

  // Helper ACC serah-terima lalu panggil waiter (null = siapa saja).
  async function callWaiter(waiterUserId: string | null) {
    if (!handoverTicket) return;
    const ticket = handoverTicket;
    const ok = await runAction(`handover:${ticket.ticketNo}`, () =>
      garageApi.post(`/api/production/tickets/${encodeURIComponent(ticket.ticketNo)}`, {
        action: "handover",
        waiterUserId,
      }),
    );
    if (ok) setHandoverTicket(null);
  }

  function startBatch(suggestion: ProductionBatchSuggestionView) {
    void runAction(`batch:${suggestion.key}`, () =>
      garageApi.post("/api/production/batches", {
        ticketItemIds: suggestion.items.map((item) => item.id),
      }),
    );
  }

  function openAllocation(batch: ProductionBatchView) {
    setAllocBatchId(batch.id);
    setAllocChecked(new Set(batch.allocations.filter((a) => a.allocated).map((a) => a.id)));
    setCancelReason("");
    setActionError(null);
  }

  async function completeBatch() {
    if (!allocBatch) return;
    const batch = allocBatch;
    const ok = await runAction(`complete:${batch.id}`, () =>
      garageApi.post(`/api/production/batches/${batch.id}`, {
        action: "complete",
        allocationIds: [...allocChecked],
      }),
    );
    if (ok) setAllocBatchId(null);
  }

  async function cancelBatch() {
    if (!allocBatch || cancelReason.trim().length < 3) return;
    const batch = allocBatch;
    const ok = await runAction(`cancel:${batch.id}`, () =>
      garageApi.post(`/api/production/batches/${batch.id}`, {
        action: "cancel",
        reason: cancelReason.trim(),
      }),
    );
    if (ok) setAllocBatchId(null);
  }

  async function openReport() {
    setReportOpen(true);
    void onRefreshPerformance();
    try {
      setShiftReport(await garageApi.get<KitchenShiftReport>("/api/kitchen/report"));
    } catch {
      setShiftReport(null);
    }
  }

  const allocTotals = useMemo(() => {
    if (!allocBatch) return { allocated: 0, unallocated: 0 };
    const allocated = allocBatch.allocations
      .filter((a) => allocChecked.has(a.id))
      .reduce((sum, a) => sum + a.qty, 0);
    return { allocated, unallocated: Math.max(0, allocBatch.totalQty - allocated) };
  }, [allocBatch, allocChecked]);

  function lockedHint(s: "Bar" | "Food") {
    return canOperate[s] ? null : `Hanya workstation ${productionStationLabel(s)}`;
  }

  function renderTicket(ticket: ProductionTicketView) {
    const late = lateIds.has(ticket.ticketNo);
    const lock = lockedHint(ticket.station);
    const busy = busyKey?.endsWith(`:${ticket.ticketNo}`) ?? false;
    const waitingBatch = ticket.pendingBatchNos.length > 0;
    return (
      <article
        key={ticket.ticketNo}
        className={`rounded-md border-2 p-3 transition-colors ${
          late
            ? "garage-kds-late border-[#d11a2a] bg-[#2a1116]"
            : ticket.status === "ready"
              ? "border-[#22c55e]/45 bg-[#12190f]"
              : "border-[#3a3a42] bg-[#1d1d24]"
        }`}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words text-xl font-black uppercase leading-tight text-white">
              {ticket.identity}
            </p>
            <p className="mt-0.5 font-mono text-lg font-black leading-tight text-[#ffd08a]">
              {tableLabel(ticket.table)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StationChip station={ticket.station} />
            {ticket.addonSequence > 1 ? (
              <span className="rounded-sm border border-[#f5a742]/60 bg-[#f5a742]/18 px-1.5 py-0.5 text-[11px] font-black uppercase text-[#ffd79a]">
                Add-on #{ticket.addonSequence}
              </span>
            ) : null}
          </div>
        </header>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-[#b8b8c2]">
          <span>#{ticket.orderNo ?? ticket.ticketNo}</span>
          {ticket.queueNo ? <span>Antrian {ticket.queueNo}</span> : null}
          <span>{ticket.channel}</span>
        </p>

        {ticket.issueReason && ticket.status !== "ready" ? (
          <p className="mt-2 rounded-sm border border-[#d11a2a]/50 bg-[#d11a2a]/14 px-2 py-1 text-xs font-bold text-[#ffc2c8]">
            Dikembalikan: {ticket.issueReason}
          </p>
        ) : null}

        <ul className="mt-2 space-y-1.5">
          {ticket.items.map((item) => (
            <li key={item.id} className="rounded-sm border border-[#34343c] bg-black/25 px-2.5 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-black leading-snug text-white">
                  <span className="font-mono text-[#ffd08a]">{item.qty}×</span> {item.label}
                </p>
                {item.batchNo ? (
                  <span className="shrink-0 rounded-sm border border-[#f5a742]/50 bg-[#f5a742]/12 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#ffd79a]">
                    {item.status === "ready" ? "✓ " : ""}
                    {item.batchNo}
                  </span>
                ) : null}
              </div>
              {item.note ? (
                <p className="mt-1 rounded-sm bg-[#f5a742]/14 px-2 py-0.5 text-sm font-black text-[#ffe0aa]">
                  Catatan: {item.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className={`font-mono text-sm font-black tabular-nums ${late ? "text-[#ff6b78]" : "text-[#e4e4e7]"}`}>
            {fmtElapsed(ticket.createdAt, now, ticket.readyAt)}
            <span className="ml-1 text-xs font-semibold text-[#9696a1]">/ {ticket.targetMinutes}m</span>
          </span>
          {late ? (
            <span className="inline-flex items-center gap-1 font-black uppercase text-[#ff6b78]">
              <AlertTriangle className="size-3.5" /> Lewat SLA
            </span>
          ) : null}
        </div>

        {ticket.status === "queue" ? (
          <Button
            type="button"
            disabled={Boolean(lock) || busy}
            onClick={() => startTicket(ticket)}
            className="garage-press mt-2 h-12 w-full bg-[#d11a2a] text-sm font-black uppercase tracking-wide text-white hover:bg-[#e83030] disabled:opacity-60"
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
            {lock ?? "Mulai"}
          </Button>
        ) : ticket.status === "cooking" ? (
          <Button
            type="button"
            disabled={Boolean(lock) || busy || waitingBatch}
            onClick={() => setQcTicket(ticket)}
            className="garage-press mt-2 h-12 w-full bg-[#22c55e] text-sm font-black uppercase tracking-wide text-[#052e16] hover:bg-[#34d77f] disabled:opacity-60"
          >
            <CheckCircle2 className="mr-2 size-4" />
            {lock ?? (waitingBatch ? `Menunggu ${ticket.pendingBatchNos.join(", ")}` : "QC · Ready / Pickup")}
          </Button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            {ticket.handoverAt ? (
              <button
                type="button"
                disabled={!canHandover[ticket.station]}
                onClick={() => setHandoverTicket(ticket)}
                title="Ganti waiter yang dipanggil"
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-[#22c55e]/45 bg-[#22c55e]/12 px-2 text-center text-xs font-black uppercase text-[#bbf7d0] transition-colors hover:bg-[#22c55e]/20 disabled:cursor-default disabled:hover:bg-[#22c55e]/12"
              >
                <BellRing className="size-4 shrink-0" />
                {ticket.claimedByName
                  ? `Dipanggil: ${ticket.claimedByName}`
                  : "Dipanggil: siapa saja"}
              </button>
            ) : (
              <Button
                type="button"
                disabled={!canHandover[ticket.station]}
                onClick={() => setHandoverTicket(ticket)}
                className="garage-press h-12 flex-1 bg-[#f5a742] text-sm font-black uppercase tracking-wide text-[#241a00] hover:bg-[#ffb85c] disabled:opacity-60"
              >
                <BellRing className="mr-2 size-4" />
                {canHandover[ticket.station]
                  ? "ACC · Panggil waiter"
                  : `Menunggu helper ${productionStationLabel(ticket.station)}`}
              </Button>
            )}
            {!ticket.claimedByName && !lock ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReopenTicket(ticket);
                  setReopenReason("");
                }}
                className="garage-press h-11 shrink-0 border-[#4a4a54] bg-white/[0.04] px-3 text-xs font-bold text-[#e4e4e7]"
                aria-label="Kembalikan ke processing"
              >
                <Undo2 className="mr-1 size-4" /> Kembalikan
              </Button>
            ) : null}
          </div>
        )}
      </article>
    );
  }

  function renderSuggestion(suggestion: ProductionBatchSuggestionView) {
    const lock = lockedHint(suggestion.station);
    const busy = busyKey === `batch:${suggestion.key}`;
    return (
      <article
        key={suggestion.key}
        className="rounded-md border-2 border-dashed border-[#f5a742]/70 bg-[#221a10] p-3"
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-[#ffd08a]">
              <Layers className="size-3.5" /> Smart Batch
            </p>
            <p className="mt-0.5 break-words text-lg font-black leading-tight text-white">
              {suggestion.itemLabel} <span className="font-mono text-[#ffd08a]">×{suggestion.totalQty}</span>
            </p>
            {suggestion.note ? (
              <p className="mt-1 text-sm font-black text-[#ffe0aa]">Catatan: {suggestion.note}</p>
            ) : null}
          </div>
          <StationChip station={suggestion.station} />
        </header>
        <ul className="mt-2 space-y-1">
          {suggestion.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-sm bg-black/25 px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate font-black text-white">
                {item.identity} · <span className="text-[#ffd08a]">{tableLabel(item.table)}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-[#d0d0d6]">
                #{item.orderNo ?? item.ticketNo} · {item.qty}×
              </span>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          disabled={Boolean(lock) || busy}
          onClick={() => startBatch(suggestion)}
          className="garage-press mt-2 h-12 w-full bg-[#f5a742] text-sm font-black uppercase tracking-wide text-[#241a00] hover:bg-[#ffb85c] disabled:opacity-60"
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Layers className="mr-2 size-4" />}
          {lock ?? `Mulai batch ×${suggestion.totalQty}`}
        </Button>
      </article>
    );
  }

  function renderBatch(batch: ProductionBatchView) {
    const lock = lockedHint(batch.station);
    return (
      <article key={batch.id} className="rounded-md border-2 border-[#f5a742] bg-[#2b2114] p-3">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs font-black text-[#ffd08a]">{batch.batchNo}</p>
            <p className="break-words text-lg font-black leading-tight text-white">
              {batch.itemLabel} <span className="font-mono text-[#ffd08a]">×{batch.totalQty}</span>
            </p>
            {batch.note ? <p className="mt-0.5 text-sm font-black text-[#ffe0aa]">Catatan: {batch.note}</p> : null}
          </div>
          <StationChip station={batch.station} />
        </header>
        <ul className="mt-2 space-y-1">
          {batch.allocations.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-sm bg-black/25 px-2 py-1 text-sm">
              <span className="min-w-0 truncate font-bold text-white">
                {a.identity} · <span className="text-[#ffd08a]">{tableLabel(a.table)}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-[#d0d0d6]">{a.qty}×</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-sm font-black tabular-nums text-[#e4e4e7]">
          {fmtElapsed(batch.startedAt, now)}
          <span className="ml-2 text-xs font-semibold text-[#9696a1]">{batch.startedByName ?? ""}</span>
        </p>
        <Button
          type="button"
          disabled={Boolean(lock)}
          onClick={() => openAllocation(batch)}
          className="garage-press mt-2 h-12 w-full bg-[#22c55e] text-sm font-black uppercase tracking-wide text-[#052e16] hover:bg-[#34d77f] disabled:opacity-60"
        >
          <CheckCircle2 className="mr-2 size-4" />
          {lock ?? "QC + Allocation"}
        </Button>
      </article>
    );
  }

  function renderColumn(column: StatusColumn) {
    const meta = COLUMN_META[column];
    const tickets = columns[column];
    const extras =
      column === "queue"
        ? visibleSuggestions.map(renderSuggestion)
        : column === "cooking"
          ? visibleBatches.map(renderBatch)
          : [];
    const empty = tickets.length === 0 && extras.length === 0;
    return (
      <section
        key={column}
        className={`${mobileColumn === column ? "flex" : "hidden"} min-h-0 flex-col rounded-lg border border-[#34343c] bg-[#141419] lg:flex`}
      >
        <div className="flex items-center justify-between border-b border-[#34343c] px-3 py-2">
          <div>
            <h3 className={`text-sm font-black uppercase tracking-wide ${meta.tone}`}>{meta.label}</h3>
            <p className="text-xs text-[#9696a1]">{meta.hint}</p>
          </div>
          <span className={`font-mono text-2xl font-black tabular-nums ${meta.tone}`}>{counts[column]}</span>
        </div>
        <div className="garage-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2 lg:max-h-[calc(100svh-17rem)]">
          {extras}
          {tickets.map(renderTicket)}
          {empty ? (
            <p className="py-10 text-center text-sm font-semibold text-[#9696a1]">Kosong</p>
          ) : null}
        </div>
      </section>
    );
  }

  const loadByStation = new Map((board?.load ?? []).map((row) => [row.station, row]));

  return (
    <section className="space-y-3 px-2 sm:px-3 lg:px-4">
      <VoiceSettingsDialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen} />

      <div className="sticky top-0 z-30 space-y-2 rounded-lg border border-[#34343c] bg-[#111116] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 rounded-sm border border-[#34343c] px-2 py-0.5 text-xs font-bold text-white">
                <span className="size-2 rounded-full bg-[#22c55e] motion-safe:animate-pulse" />
                LIVE
              </span>
              <span className="font-mono text-xs text-[#b8b8c2]">
                {new Date(now).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              {rush ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-[#d11a2a]/60 bg-[#d11a2a]/20 px-2 py-0.5 text-xs font-black uppercase text-[#ffc2c8]">
                  <Flame className="size-3.5" /> Rush
                </span>
              ) : null}
            </div>
            <h2 className="mt-0.5 text-lg font-black uppercase leading-tight text-white sm:text-xl">
              Production Hub
            </h2>
            <p className="text-xs text-[#b8b8c2]">
              Workstation:{" "}
              <span className="font-bold text-white">
                {me.role === "Owner" || me.role === "Manajer"
                  ? "Manajemen (override)"
                  : workstation
                    ? workstationLabel(workstation)
                    : "Tidak ditugaskan — mode pantau"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Matikan suara" : "Nyalakan suara"}
              className={`flex h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-black transition-colors ${
                soundEnabled
                  ? "border-[#22c55e]/55 bg-[#22c55e]/14 text-[#bbf7d0]"
                  : "border-[#4a4a54] bg-white/[0.04] text-[#b8b8c2]"
              }`}
            >
              <Volume2 className="size-4" />
              <span className="hidden sm:inline">{soundEnabled ? "Suara ON" : "Suara OFF"}</span>
            </button>
            <VoiceStatusBadge onOpen={() => setVoiceDialogOpen(true)} />
            {canViewPerformance ? (
              <button
                type="button"
                onClick={() => void openReport()}
                className="flex h-11 items-center gap-1.5 rounded-md border border-[#4a4a54] bg-white/[0.04] px-3 text-xs font-black text-[#e4e4e7] transition-colors hover:bg-white/[0.08]"
              >
                <BarChart3 className="size-4" />
                <span className="hidden sm:inline">Laporan</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={syncing}
              aria-label="Muat ulang papan produksi"
              className="grid h-11 w-11 place-items-center rounded-md border border-[#4a4a54] bg-white/[0.04] text-[#e4e4e7] transition-colors hover:bg-white/[0.08] disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["all", "Bar", "Food"] as StationFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStation(s)}
              aria-pressed={station === s}
              className={`h-10 rounded-md border px-3 text-sm font-black uppercase transition-colors ${
                station === s
                  ? "border-[#d11a2a] bg-[#d11a2a] text-white"
                  : "border-[#4a4a54] bg-white/[0.04] text-[#d0d0d6] hover:bg-white/[0.08]"
              }`}
            >
              {s === "all" ? "All" : productionStationLabel(s)}
              <span className="ml-1.5 font-mono text-xs opacity-80">{stationCounts[s]}</span>
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            {(["Bar", "Food"] as const)
              .filter((s) => inStation(s))
              .map((s) => {
                const row = loadByStation.get(s);
                if (!row) return null;
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-2 rounded-md border border-[#34343c] bg-black/25 px-2.5 py-1 font-mono text-xs text-[#d0d0d6]"
                  >
                    <b className="text-white">{productionStationLabel(s)}</b>
                    <span>tertua {row.oldestWaitingMinutes ?? 0}m</span>
                    <span>
                      rata² {row.avgProductionMinutes == null ? "-" : `${row.avgProductionMinutes}m`}
                    </span>
                    <span className={row.slaRisk ? "font-black text-[#ff6b78]" : ""}>SLA risk {row.slaRisk}</span>
                  </span>
                );
              })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:hidden">
          {(["queue", "cooking", "ready"] as StatusColumn[]).map((column) => (
            <button
              key={column}
              type="button"
              onClick={() => setMobileColumn(column)}
              aria-pressed={mobileColumn === column}
              className={`h-11 rounded-md border text-xs font-black uppercase transition-colors ${
                mobileColumn === column
                  ? "border-[#f5a742] bg-[#f5a742]/18 text-[#ffd79a]"
                  : "border-[#4a4a54] bg-white/[0.04] text-[#d0d0d6]"
              }`}
            >
              {COLUMN_META[column].label} {counts[column]}
            </button>
          ))}
        </div>
      </div>

      <StationPrintPanel tickets={tickets} station={station} onPrinted={() => void load(true)} />

      {visibleCancelled.length ? (
        <section
          role="alert"
          className="space-y-1.5 rounded-lg border-2 border-[#d11a2a] bg-[#2a1116] p-3"
        >
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#ffc2c8]">
            <X className="size-4" /> Dibatalkan — hentikan produksi
          </p>
          <ul className="space-y-1">
            {visibleCancelled.map((c) => (
              <li
                key={c.ticketNo}
                className="flex flex-wrap items-baseline gap-x-2 rounded-sm bg-black/30 px-2.5 py-1.5 text-sm"
              >
                <span className="font-black uppercase text-white">{c.identity}</span>
                <span className="font-mono font-black text-[#ffd08a]">{tableLabel(c.table)}</span>
                <StationChip station={c.station} />
                <span className="font-mono text-xs text-[#d0d0d6]">#{c.orderNo ?? c.ticketNo}</span>
                <span className="min-w-0 text-sm text-[#ffe0e3]">{c.items.join(", ")}</span>
                {c.reason ? <span className="w-full text-xs text-[#ffb4bd]">{c.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadError ? (
        <p className="rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3 text-sm text-[#ffd08a]">
          Sinkron produksi: {loadError}
        </p>
      ) : null}
      {actionError && !qcTicket && !reopenTicket && !allocBatch && !handoverTicket ? (
        <p className="flex items-center gap-2 rounded-md border border-[#d11a2a]/50 bg-[#d11a2a]/12 p-3 text-sm font-semibold text-[#ffc2c8]">
          <AlertTriangle className="size-4 shrink-0" /> {actionError}
        </p>
      ) : null}

      {!board ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#b8b8c2]">
          <Loader2 className="size-4 animate-spin" /> Memuat papan produksi…
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {renderColumn("queue")}
          {renderColumn("cooking")}
          {renderColumn("ready")}
        </div>
      )}

      {/* QC → READY */}
      <Dialog open={Boolean(qcTicket)} onOpenChange={(open) => !open && setQcTicket(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto border-[#34343c] bg-[#111116] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">QC sebelum Ready</DialogTitle>
            <DialogDescription className="text-[#d0d0d6]">
              Cek item, qty, varian, dan catatan. Tidak ada porsi yang tertinggal.
            </DialogDescription>
          </DialogHeader>
          {qcTicket ? (
            <div className="space-y-3">
              <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
                <p className="text-xl font-black uppercase text-white">{qcTicket.identity}</p>
                <p className="font-mono text-base font-black text-[#ffd08a]">
                  {tableLabel(qcTicket.table)} · #{qcTicket.orderNo ?? qcTicket.ticketNo}
                </p>
              </div>
              <ul className="space-y-1.5">
                {qcTicket.items.map((item) => (
                  <li key={item.id} className="rounded-sm border border-[#34343c] bg-black/20 px-2.5 py-2">
                    <p className="text-base font-black text-white">
                      <span className="font-mono text-[#ffd08a]">{item.qty}×</span> {item.label}
                    </p>
                    {item.note ? (
                      <p className="text-sm font-black text-[#ffe0aa]">Catatan: {item.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {actionError ? <p className="text-sm font-semibold text-[#ffc2c8]">{actionError}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQcTicket(null)}
                  className="h-12 border-[#4a4a54] bg-white/[0.04] font-bold"
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={() => void confirmReady()}
                  disabled={busyKey === `ready:${qcTicket.ticketNo}`}
                  className="garage-press h-12 bg-[#22c55e] font-black uppercase text-[#052e16] hover:bg-[#34d77f]"
                >
                  {busyKey === `ready:${qcTicket.ticketNo}` ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 size-4" />
                  )}
                  QC OK · Ready
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Serah-terima: helper ACC produk lalu panggil waiter */}
      <Dialog open={Boolean(handoverTicket)} onOpenChange={(open) => !open && setHandoverTicket(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto border-[#34343c] bg-[#111116] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">ACC serah-terima</DialogTitle>
            <DialogDescription className="text-[#d0d0d6]">
              Cek fisik produk cocok dengan Nama + Meja, lalu tap waiter yang dipanggil untuk mengantar.
            </DialogDescription>
          </DialogHeader>
          {handoverTicket ? (
            <div className="space-y-3">
              <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
                <p className="text-xl font-black uppercase text-white">{handoverTicket.identity}</p>
                <p className="font-mono text-base font-black text-[#ffd08a]">
                  {tableLabel(handoverTicket.table)} · #{handoverTicket.orderNo ?? handoverTicket.ticketNo}
                </p>
                <ul className="mt-2 space-y-1">
                  {handoverTicket.items.map((item) => (
                    <li key={item.id} className="text-base font-bold text-white">
                      <span className="font-mono text-[#ffd08a]">{item.qty}×</span> {item.label}
                      {item.note ? <span className="ml-1 text-sm text-[#ffe0aa]">({item.note})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm font-semibold text-[#d0d0d6]">Panggil waiter</p>
              {waiters.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {waiters.map((w) => (
                    <Button
                      key={w.id}
                      type="button"
                      aria-label={`Panggil ${w.name} (${w.activeDeliveries} antaran berjalan)`}
                      onClick={() => void callWaiter(w.id)}
                      disabled={busyKey === `handover:${handoverTicket.ticketNo}`}
                      className="garage-press h-14 justify-between bg-[#d11a2a] px-3 text-left font-black text-white hover:bg-[#e83030]"
                    >
                      <span className="truncate text-base">{w.name}</span>
                      <span className="shrink-0 rounded-sm bg-black/30 px-1.5 py-0.5 font-mono text-xs">
                        {w.activeDeliveries} antar
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-[#34343c] bg-black/20 p-3 text-sm text-[#d0d0d6]">
                  Tidak ada waiter yang sedang login. Panggil siapa saja — semua HP waiter mendapat notifikasi.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => void callWaiter(null)}
                disabled={busyKey === `handover:${handoverTicket.ticketNo}`}
                className="h-12 w-full border-[#f5a742]/60 bg-[#f5a742]/10 font-black uppercase text-[#ffd79a]"
              >
                <BellRing className="mr-2 size-4" /> Panggil siapa saja
              </Button>
              {actionError ? <p className="text-sm font-semibold text-[#ffc2c8]">{actionError}</p> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* READY → PROCESSING (alasan wajib) */}
      <Dialog open={Boolean(reopenTicket)} onOpenChange={(open) => !open && setReopenTicket(null)}>
        <DialogContent className="border-[#34343c] bg-[#111116] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Kembalikan ke Processing</DialogTitle>
            <DialogDescription className="text-[#d0d0d6]">
              Untuk produk salah/rusak sebelum diambil waiter. Alasan tercatat di audit.
            </DialogDescription>
          </DialogHeader>
          {reopenTicket ? (
            <div className="space-y-3">
              <p className="text-base font-black text-white">
                {reopenTicket.identity} · {tableLabel(reopenTicket.table)}
              </p>
              <label className="block text-sm font-semibold text-[#d0d0d6]" htmlFor="reopen-reason">
                Alasan
              </label>
              <Input
                id="reopen-reason"
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder="mis. es kurang, salah varian"
                className="h-11 border-[#4a4a54] bg-white/[0.06] text-base"
              />
              {actionError ? <p className="text-sm font-semibold text-[#ffc2c8]">{actionError}</p> : null}
              <Button
                type="button"
                onClick={() => void confirmReopen()}
                disabled={reopenReason.trim().length < 3 || busyKey === `reopen:${reopenTicket.ticketNo}`}
                className="garage-press h-12 w-full bg-[#d11a2a] font-black uppercase text-white hover:bg-[#e83030]"
              >
                <Undo2 className="mr-2 size-4" /> Kembalikan
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Batch: QC + Allocation (coverage 100%) */}
      <Dialog open={Boolean(allocBatch)} onOpenChange={(open) => !open && setAllocBatchId(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto border-[#34343c] bg-[#111116] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Allocation batch</DialogTitle>
            <DialogDescription className="text-[#d0d0d6]">
              Tap setiap porsi setelah dicocokkan ke Nama + Meja + Order. Batch selesai hanya bila semua
              porsi teralokasi.
            </DialogDescription>
          </DialogHeader>
          {allocBatch ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-[#34343c] bg-black/25 p-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[#ffd08a]">{allocBatch.batchNo}</p>
                  <p className="text-lg font-black text-white">
                    {allocBatch.itemLabel} ×{allocBatch.totalQty}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-sm px-2 py-1 font-mono text-sm font-black ${
                    allocTotals.unallocated
                      ? "bg-[#d11a2a]/20 text-[#ffc2c8]"
                      : "bg-[#22c55e]/18 text-[#bbf7d0]"
                  }`}
                >
                  UNALLOCATED = {allocTotals.unallocated}
                </span>
              </div>
              <ul className="space-y-1.5">
                {allocBatch.allocations.map((a) => {
                  const checked = allocChecked.has(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        aria-pressed={checked}
                        onClick={() =>
                          setAllocChecked((current) => {
                            const next = new Set(current);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          })
                        }
                        className={`flex min-h-12 w-full items-center gap-3 rounded-md border-2 px-3 py-2 text-left transition-colors ${
                          checked
                            ? "border-[#22c55e] bg-[#22c55e]/12"
                            : "border-[#4a4a54] bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-sm border-2 ${
                            checked ? "border-[#22c55e] bg-[#22c55e] text-[#052e16]" : "border-[#71717a]"
                          }`}
                        >
                          {checked ? <Check className="size-4" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-black text-white">{a.identity}</span>
                          <span className="block font-mono text-xs text-[#d0d0d6]">
                            {tableLabel(a.table)} · #{a.orderNo ?? a.ticketNo ?? "-"}
                          </span>
                          {a.note ? <span className="block text-sm font-bold text-[#ffe0aa]">{a.note}</span> : null}
                        </span>
                        <span className="shrink-0 font-mono text-lg font-black text-[#ffd08a]">{a.qty}×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {actionError ? <p className="text-sm font-semibold text-[#ffc2c8]">{actionError}</p> : null}
              <Button
                type="button"
                onClick={() => void completeBatch()}
                disabled={allocTotals.unallocated > 0 || busyKey === `complete:${allocBatch.id}`}
                className="garage-press h-12 w-full bg-[#22c55e] font-black uppercase text-[#052e16] hover:bg-[#34d77f] disabled:opacity-60"
              >
                {busyKey === `complete:${allocBatch.id}` ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 size-4" />
                )}
                Batch complete
              </Button>
              <div className="space-y-2 border-t border-[#34343c] pt-3">
                <label className="block text-sm font-semibold text-[#d0d0d6]" htmlFor="cancel-batch-reason">
                  Batalkan batch (porsi kembali ke Waiting)
                </label>
                <div className="flex gap-2">
                  <Input
                    id="cancel-batch-reason"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Alasan batal"
                    className="h-11 border-[#4a4a54] bg-white/[0.06]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void cancelBatch()}
                    disabled={cancelReason.trim().length < 3 || busyKey === `cancel:${allocBatch.id}`}
                    className="h-11 shrink-0 border-[#d11a2a]/60 bg-[#d11a2a]/10 font-bold text-[#ffc2c8]"
                  >
                    <X className="mr-1 size-4" /> Batalkan
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {canViewPerformance ? (
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="max-h-[88svh] overflow-y-auto border-[#34343c] bg-[#101016] text-white sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-black uppercase">Laporan Produksi</DialogTitle>
              <DialogDescription className="text-[#d0d0d6]">
                Kinerja per staf (bulan ini) dan item siap per shift hari ini.
              </DialogDescription>
            </DialogHeader>
            {performanceError ? <p className="text-sm text-[#ffd08a]">{performanceError}</p> : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Tiket", performance?.summary.totalTickets ?? 0],
                  ["Tepat waktu", performance?.summary.onTimeTickets ?? 0],
                  ["Telat", performance?.summary.lateTickets ?? 0],
                  ["Item siap (shift)", shiftReport?.totals.totalItems ?? 0],
                ] as Array<[string, number]>
              ).map(([label, value]) => (
                <div key={label} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="text-xs text-[#b8b8c2]">{label}</p>
                  <p className="mt-1 font-mono text-2xl font-black tabular-nums text-white">{value}</p>
                </div>
              ))}
            </div>
            {shiftReport ? (
              <p className="text-sm text-[#d0d0d6]">
                Fee produksi shift hari ini:{" "}
                <b className="font-mono text-white">{currency.format(shiftReport.totals.totalFee)}</b>
              </p>
            ) : null}
            <div className="garage-scroll-x overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#34343c] text-left text-[#b8b8c2]">
                    <th className="p-2">Nama</th>
                    <th className="p-2 text-right">Tiket</th>
                    <th className="p-2 text-right">Tepat</th>
                    <th className="p-2 text-right">Telat</th>
                    <th className="p-2 text-right">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceLoading && !performance ? (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-[#b8b8c2]">
                        Memuat…
                      </td>
                    </tr>
                  ) : (
                    performance?.rows.map((row) => (
                      <tr key={row.staffName} className="border-b border-[#2a2a32]">
                        <td className="p-2 font-semibold text-white">{row.staffName}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{row.totalTickets}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{row.onTimeTickets}</td>
                        <td className="p-2 text-right font-mono tabular-nums text-[#ff9aa4]">{row.lateTickets}</td>
                        <td className="p-2 text-right font-mono font-black tabular-nums text-white">{row.score}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
