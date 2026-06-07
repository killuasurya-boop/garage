"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Info,
  Plus,
  RefreshCw,
  Settings,
  Timer,
  Volume2,
  Wallet,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { currency, type Role } from "@/lib/garage-data";
import type { KitchenOrder, KitchenPerformanceData, KitchenShiftReport } from "@/lib/garage-api-types";
import { useDateFilterContext } from "@/components/garage/date-filter";
import { isOnlineChannel, voice } from "@/lib/garage-voice";
import { canUseApi } from "@/lib/role-access";

const KitchenModuleFallback = () => (
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat kitchen...</div>
);

const KitchenEtaPanel = dynamic(
  () => import("@/components/garage/kitchen-eta-panel").then((m) => m.KitchenEtaPanel),
  { loading: KitchenModuleFallback },
);
const VoiceSettingsDialog = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceSettingsDialog),
  { loading: KitchenModuleFallback },
);
const VoiceStatusBadge = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceStatusBadge),
  { loading: KitchenModuleFallback },
);
export function KitchenView({
  kitchenOrders,
  role,
  isSyncing,
  lastSyncedAt,
  syncError,
  performance,
  performanceLoading,
  performanceError,
  canViewPerformance,
  onRefresh,
  onRefreshPerformance,
  onChanged,
}: {
  kitchenOrders: KitchenOrder[];
  role: Role;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  performance: KitchenPerformanceData | null;
  performanceLoading: boolean;
  performanceError: string | null;
  canViewPerformance: boolean;
  onRefresh: () => Promise<void> | void;
  onRefreshPerformance: () => Promise<void> | void;
  onChanged: () => Promise<void> | void;
}) {
  const { predicate: kitchenDatePredicate } = useDateFilterContext();
  type KitchenTicketStatus =
    | "all"
    | "queue"
    | "cooking"
    | "ready"
    | "delivered"
    | "rejected"
    | "cancelled";
  type KitchenStationFilter = "all" | "Food" | "Bar" | "Packaging";
  const lockedStation: KitchenStationFilter | null =
    role === "Barista"
      ? "Bar"
      : role === "Koki" || role === "Asisten Koki"
        ? "Food"
        : null;
  type KitchenTicketView = KitchenOrder & {
    prodSec: number;
    prodMin: number;
    targetSec: number;
    isLate: boolean;
    isWarning: boolean;
    slaTone: "late" | "watch" | "safe";
    itemNotes: Record<string, string>;
    internalNotes: string | null;
    pinned: boolean;
  };
  const [status, setStatus] = useState<KitchenTicketStatus>("all");
  const [stationState, setStationState] = useState<KitchenStationFilter>(
    lockedStation ?? "all",
  );
  const station: KitchenStationFilter = lockedStation ?? stationState;
  const setStation = (next: KitchenStationFilter) => {
    if (lockedStation && next !== lockedStation) return;
    setStationState(next);
  };
  const [displayMode, setDisplayMode] = useState<"list" | "board">("board");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState<string | null>(null);
  const [bulkReadyLoading, setBulkReadyLoading] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [feeBalance, setFeeBalance] = useState<number | null>(null);
  const [shiftReport, setShiftReport] = useState<KitchenShiftReport | null>(null);
  const [shiftReportLoading, setShiftReportLoading] = useState(false);
  const [shiftReportError, setShiftReportError] = useState<string | null>(null);
  const canEarn = canUseApi(role, "earnings:read");

  useEffect(() => {
    // SLA ticker â€” 5 detik cukup untuk warn/late tone (toleransi menit),
    // 1 detik bikin seluruh KitchenView re-render tiap detik tanpa benefit visual.
    const id = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(id);
  }, []);

  // â”€â”€â”€ SOUND ALERT SYSTEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Browser policy: audio butuh user gesture untuk unlock.
  // Sound dipakai untuk: (a) order baru masuk, (b) ticket jadi late.
  // Disimpan di localStorage supaya preference persist antar refresh.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousTicketIdsRef = useRef<Set<string>>(new Set());
  const previousLateIdsRef = useRef<Set<string>>(new Set());
  const soundInitializedRef = useRef(false);
  // Voice announcement â€” gaya bandara, beda dari KDS local sound.
  // Snapshot status per ticket untuk diff transition (queueâ†’cookingâ†’readyâ†’delivered).
  const previousTicketStateRef = useRef<
    Map<string, { status: string; station: string; channel: string }>
  >(new Map());
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);

  // Load sound preference dari localStorage sekali di mount
  useEffect(() => {
    if (soundInitializedRef.current) return;
    soundInitializedRef.current = true;
    try {
      const saved = localStorage.getItem("garage:kds:sound");
      if (saved === "on") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from storage
        setSoundEnabled(true);
      }
    } catch {
      // localStorage unavailable (private mode) â€” biarkan default off
    }
  }, []);

  const playKitchenTone = useCallback(
    (kind: "new" | "late") => {
      if (!soundEnabled) return;
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === "closed") return;
      try {
        const startAt = ctx.currentTime;
        const gain = ctx.createGain();
        const oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        if (kind === "new") {
          // Two-tone chime: 880Hz â†’ 1320Hz (cheerful)
          oscillator.frequency.setValueAtTime(880, startAt);
          oscillator.frequency.exponentialRampToValueAtTime(1320, startAt + 0.12);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.36);
        } else {
          // Alert tone: 440Hz square, 3 pulses (urgent)
          oscillator.type = "square";
          oscillator.frequency.setValueAtTime(440, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
          gain.gain.setValueAtTime(0.18, startAt + 0.15);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.55);
        }
      } catch {
        // Audio bisa di-refuse di kiosk mode â€” abaikan
      }
    },
    [soundEnabled],
  );

  const enableSound = useCallback(() => {
    if (typeof window === "undefined") return;
    const AudioCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) {
      setSoundEnabled(false);
      window.alert("Browser ini tidak support audio notifikasi.");
      return;
    }
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioCtor();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
    // Test beep saat enable, supaya user tahu sound jalan
    const ctx = audioContextRef.current;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(660, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.22);
    } catch {
      /* ignore */
    }
    setSoundEnabled(true);
    try {
      localStorage.setItem("garage:kds:sound", "on");
    } catch {
      /* ignore */
    }
  }, []);

  const disableSound = useCallback(() => {
    setSoundEnabled(false);
    try {
      localStorage.setItem("garage:kds:sound", "off");
    } catch {
      /* ignore */
    }
  }, []);

  const loadFeeBalance = useCallback(async () => {
    if (!canEarn) return;
    try {
      const payload = await garageApi.get<{
        summary: { totalAccrued: number };
      }>("/api/earnings/summary");
      setFeeBalance(payload.summary.totalAccrued);
    } catch {
      setFeeBalance(null);
    }
  }, [canEarn]);

  const loadKitchenShiftReport = useCallback(async () => {
    setShiftReportLoading(true);
    setShiftReportError(null);
    try {
      const payload = await garageApi.get<KitchenShiftReport>("/api/kitchen/report");
      setShiftReport(payload);
    } catch (err) {
      setShiftReportError(err instanceof Error ? err.message : "Gagal memuat report dapur");
    } finally {
      setShiftReportLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount, state set inside async callback
    void loadFeeBalance();
  }, [loadFeeBalance]);

  const tickets = useMemo<KitchenTicketView[]>(() =>
    kitchenOrders.filter((order) => kitchenDatePredicate(order.createdAt)).map((order) => {
      const createdAt = new Date(order.createdAt);
      const acceptedAt = order.acceptedAt ? new Date(order.acceptedAt) : null;
      const readyAt = order.readyAt ? new Date(order.readyAt) : null;
      const nextStatus = statusOverrides[order.id] ?? order.status;
      const targetMin = order.targetMinutes > 0 ? order.targetMinutes : order.targetGroup === "drink" ? 5 : 15;
      const targetSec = targetMin * 60;
      const prodStart = acceptedAt && !Number.isNaN(acceptedAt.getTime()) ? acceptedAt : null;
      const prodEnd = readyAt && !Number.isNaN(readyAt.getTime()) ? readyAt : null;
      const prodSec = prodEnd
        ? Math.max(0, Math.floor((prodEnd.getTime() - (prodStart?.getTime() ?? createdAt.getTime())) / 1000))
        : prodStart
          ? Math.max(0, Math.floor((now.getTime() - prodStart.getTime()) / 1000))
          : Math.max(order.elapsed * 60, nextStatus === "queue" ? 0 : 0);
      const remainingSec = targetSec - prodSec;
      const isLate = nextStatus !== "queue" && prodSec > targetSec;
      const isWarning = nextStatus === "cooking" && !isLate && remainingSec <= 120;
      const slaTone = isLate ? "late" : isWarning ? "watch" : "safe";
      return {
        ...order,
        status: nextStatus,
        prodSec,
        prodMin: Math.floor(prodSec / 60),
        targetSec,
        isLate,
        isWarning,
        slaTone,
        itemNotes: order.itemNotes ?? {},
        internalNotes: order.internalNotes ?? null,
        pinned: order.priority === "pinned",
      } as KitchenTicketView;
    }), [kitchenOrders, now, statusOverrides, kitchenDatePredicate]);

  const stationFiltered = useMemo(
    () => tickets.filter(o => station === "all" || o.station === station), [station, tickets]);
  const visibleTickets = useMemo(
    () =>
      stationFiltered.filter(
        (o) =>
          status === "all" ||
          o.status === status ||
          (status === "cancelled" && o.status === "canceled"),
      ),
    [stationFiltered, status],
  );

  const sortedTickets = useMemo(() => {
    const r: Record<Exclude<KitchenTicketStatus, "all">, number> = {
      cooking: 0,
      queue: 1,
      ready: 2,
      delivered: 3,
      rejected: 4,
      cancelled: 4,
    };
    return [...visibleTickets].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
      if (a.isWarning !== b.isWarning) return a.isWarning ? -1 : 1;
      return (r[a.status as Exclude<KitchenTicketStatus, "all">] ?? 99) - (r[b.status as Exclude<KitchenTicketStatus, "all">] ?? 99)
        || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [visibleTickets]);

  const summary = useMemo(() => ({
    queue: tickets.filter(o => o.status === "queue").length,
    cooking: tickets.filter(o => o.status === "cooking").length,
    ready: tickets.filter(o => o.status === "ready").length,
    late: tickets.filter(o => o.isLate).length,
  }), [tickets]);

  const readyableFoodTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          ticket.station === "Food" &&
          (ticket.status === "queue" || ticket.status === "cooking"),
      ),
    [tickets],
  );

  const statusFilters = useMemo<KitchenTicketStatus[]>(() => {
    const filters: KitchenTicketStatus[] = ["all", "queue", "cooking", "ready", "delivered"];
    if (tickets.some((ticket) => ticket.status === "rejected")) filters.push("rejected");
    if (tickets.some((ticket) => ticket.status === "cancelled" || ticket.status === "canceled")) {
      filters.push("cancelled");
    }
    return filters;
  }, [tickets]);

  // â”€â”€â”€ DETECT NEW ORDERS & NEW LATE TICKETS â†’ trigger sound â”€â”€â”€
  // Diff current ticket IDs vs previous snapshot. Kalau ada ID baru
  // yang statusnya "queue" â†’ bunyikan "new order" tone.
  // Kalau ada ticket yang baru jadi late â†’ bunyikan "late alert" tone.
  useEffect(() => {
    if (!soundEnabled) {
      // Tetap update snapshot supaya kalau user enable sound nanti,
      // tidak langsung kena alert untuk ticket lama
      previousTicketIdsRef.current = new Set(tickets.map((t) => t.id));
      previousLateIdsRef.current = new Set(
        tickets.filter((t) => t.isLate).map((t) => t.id),
      );
      return;
    }

    const currentIds = new Set(tickets.map((t) => t.id));
    const currentLateIds = new Set(
      tickets.filter((t) => t.isLate).map((t) => t.id),
    );

    // Detect new order (ID baru yang status queue/cooking)
    let hasNewOrder = false;
    for (const t of tickets) {
      if (
        !previousTicketIdsRef.current.has(t.id) &&
        (t.status === "queue" || t.status === "cooking")
      ) {
        hasNewOrder = true;
        break;
      }
    }

    // Detect newly late (sebelumnya tidak late, sekarang late)
    let hasNewlyLate = false;
    for (const id of currentLateIds) {
      if (!previousLateIdsRef.current.has(id)) {
        hasNewlyLate = true;
        break;
      }
    }

    if (hasNewOrder) playKitchenTone("new");
    // Late lebih urgent â†’ kalau dua-duanya terjadi, late dapat priority
    // dengan delay singkat supaya tidak overlap dengan new order tone
    if (hasNewlyLate) {
      window.setTimeout(() => playKitchenTone("late"), hasNewOrder ? 600 : 0);
    }

    previousTicketIdsRef.current = currentIds;
    previousLateIdsRef.current = currentLateIds;
  }, [tickets, soundEnabled, playKitchenTone]);

  // â”€â”€â”€ VOICE ANNOUNCEMENT (gaya bandara) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Layer terpisah dari KDS local sound. Diff status transition per ticket:
  //   - online ticket baru muncul       â†’ "online_new"
  //   - queue â†’ cooking (Food)          â†’ "kitchen_cooking"
  //   - queue â†’ cooking (Bar)           â†’ "bar_mixing"
  //   - cooking â†’ ready                 â†’ "order_ready"
  //   - ready â†’ delivered               â†’ "order_ready_deliver"
  // First paint: tidak announce ticket lama (cuma seed snapshot).
  // Cooldown 3.5s per (ticketId+scenario) sudah dihandle di garage-voice.ts.
  useEffect(() => {
    const prev = previousTicketStateRef.current;
    const isFirstPaint = prev.size === 0 && tickets.length > 0;
    const nextSnapshot = new Map<
      string,
      { status: string; station: string; channel: string }
    >();

    for (const t of tickets) {
      nextSnapshot.set(t.id, {
        status: t.status,
        station: t.station,
        channel: t.channel,
      });

      if (isFirstPaint) continue;

      const prevEntry = prev.get(t.id);
      if (!prevEntry) {
        // Ticket baru muncul setelah first paint
        if (isOnlineChannel(t.channel)) {
          void voice.announce("online_new", {
            channel: t.channel,
            dedupKey: `${t.id}:online`,
          });
        }
        continue;
      }
      if (prevEntry.status === t.status) continue;

      const station = t.station;
      const table = t.table;
      const ticketId = t.id;

      if (t.status === "cooking" && prevEntry.status === "queue") {
        if (station === "Bar") {
          void voice.announce("bar_mixing", {
            table,
            dedupKey: `${ticketId}:cook`,
          });
        } else {
          void voice.announce("kitchen_cooking", {
            table,
            dedupKey: `${ticketId}:cook`,
          });
        }
      } else if (
        t.status === "ready" &&
        (prevEntry.status === "cooking" || prevEntry.status === "queue")
      ) {
        void voice.announce("order_ready", {
          table,
          dedupKey: `${ticketId}:ready`,
        });
      } else if (t.status === "delivered" && prevEntry.status === "ready") {
        void voice.announce("order_ready_deliver", {
          table,
          dedupKey: `${ticketId}:deliver`,
        });
      }
    }

    previousTicketStateRef.current = nextSnapshot;
  }, [tickets]);

  async function updateStatus(order: KitchenTicketView) {
    const next = order.status === "queue" ? "cooking"
      : order.status === "cooking" ? "ready"
      : order.status === "ready" ? "delivered" : "delivered";
    setUpdatingTicket(order.id);
    setMutationError(null);
    try {
      await garageApi.patch("/api/kitchen/orders/" + order.id + "/status", { status: next });
      setStatusOverrides(prev => ({ ...prev, [order.id]: next }));
      await onChanged();
      if (next === "ready") {
        void loadFeeBalance();
      }
    } catch (err) {
      if (err instanceof GarageApiError && err.code === "INVALID_TRANSITION") {
        setMutationError("Status tiket sudah berubah. Refresh halaman dulu.");
        await onChanged();
      } else {
        setMutationError(err instanceof Error ? err.message : "Gagal update");
      }
    } finally {
      setUpdatingTicket(null);
    }
  }

  async function markAllFoodReady() {
    if (!readyableFoodTickets.length || bulkReadyLoading) return;
    setBulkReadyLoading(true);
    setMutationError(null);
    try {
      const ticketNos = readyableFoodTickets.map((ticket) => ticket.id);
      const result = await garageApi.patch<{
        count: number;
        tickets: string[];
        skipped: Array<{ ticketNo: string; reason: string }>;
      }>("/api/kitchen/orders/bulk", {
        ticketNos,
        status: "ready",
      });
      setStatusOverrides((prev) => {
        const next = { ...prev };
        for (const ticketNo of result.tickets) {
          next[ticketNo] = "ready";
        }
        return next;
      });
      await onChanged();
      void loadFeeBalance();
      void loadKitchenShiftReport();
      if (result.skipped.length) {
        setMutationError(`${result.skipped.length} tiket dilewati karena status sudah berubah.`);
      }
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Gagal ready semua makanan");
    } finally {
      setBulkReadyLoading(false);
    }
  }

  async function togglePin(order: KitchenTicketView) {
    try {
      await garageApi.patch("/api/kitchen/orders/" + order.id + "/details", {
        priority: order.pinned ? "normal" : "pinned",
      });
      await onChanged();
    } catch { /* silent */ }
  }

  function fmtClock(sec: number) {
    return (sec < 0 ? "-" : "") + Math.floor(Math.abs(sec) / 60) + ":" + String(Math.abs(sec) % 60).padStart(2, "0");
  }
  function sLbl(v: KitchenTicketStatus | string) {
    return {
      all: "Semua",
      queue: "Baru",
      cooking: "Diproses",
      ready: "Ready",
      delivered: "Selesai",
      rejected: "Reject",
      cancelled: "Cancel",
      canceled: "Cancel",
    }[v] ?? v;
  }
  function stLbl(v: KitchenStationFilter) { return { all: "Semua Station", Food: "Dapur", Bar: "Bar", Packaging: "Packing" }[v] ?? v; }
  function isTerminalKitchenStatus(value: string) {
    return ["delivered", "rejected", "cancelled", "canceled"].includes(value);
  }
  function stationTitle() {
    if (lockedStation === "Food") return "Dapur Makanan";
    if (lockedStation === "Bar") return "Bar Minuman";
    return "Dapur & Bar";
  }
  function statusClass(value: string) {
    if (value === "queue") return "border-[#888]/50 bg-white/8 text-[#ddd]";
    if (value === "cooking") return "border-[#f5a742]/50 bg-[#f5a742]/14 text-[#ffd08a]";
    if (value === "ready") return "border-[#22c55e]/50 bg-[#22c55e]/14 text-[#dcfce7]";
    if (value === "rejected" || value === "cancelled" || value === "canceled") {
      return "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffb4bd]";
    }
    return "border-[#4a4a54] bg-white/8 text-[#aaa]";
  }
  function statusIcon(value: string) {
    if (value === "queue") return <Clock className="size-3" />;
    if (value === "cooking") return <Timer className="size-3" />;
    if (value === "ready" || value === "delivered") return <Check className="size-3" />;
    if (value === "rejected" || value === "cancelled" || value === "canceled") return <X className="size-3" />;
    return <Info className="size-3" />;
  }
  function statusBadge(order: KitchenTicketView, extraClass = "") {
    return (
      <span
        className={
          "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold " +
          statusClass(order.status) +
          " " +
          extraClass
        }
      >
        {statusIcon(order.status)}
        {sLbl(order.status)}
      </span>
    );
  }
  function itemNote(order: KitchenTicketView, item: string) {
    const value = order.itemNotes[item];
    return typeof value === "string" ? value.trim() : "";
  }
  function dLbl(order: KitchenTicketView) {
    const ch = order.channel.toLowerCase();
    if (ch.includes("delivery")) return "DLV " + order.table;
    if (ch.includes("take")) return "Bawa " + order.table;
    return order.table.toLowerCase().startsWith("meja") ? order.table : "Meja " + order.table;
  }

  function renderBoard(order: KitchenTicketView) {
    const bc = order.slaTone === "late" ? "#d11a2a" : order.slaTone === "watch" ? "#f5a742" : "#3a3a42";
    const bg = order.slaTone === "late" ? "#2a1116" : order.slaTone === "watch" ? "#2b2114" : "#202027";
    const isTerminal = isTerminalKitchenStatus(order.status);
    const tC = order.slaTone === "late" ? "text-[#ff4d5d]" : order.slaTone === "watch" ? "text-[#ffd08a]" : "text-white";
    const bC = order.slaTone === "late" ? "bg-[#d11a2a]" : order.slaTone === "watch" ? "bg-[#f5a742]" : "bg-[#555]";
    const clock = order.status === "queue" ? fmtClock(order.targetSec)
      : order.isLate ? fmtClock(order.prodSec - order.targetSec)
      : fmtClock(order.targetSec - order.prodSec);

    return (
      <div
        key={order.id}
        className={`rounded-lg border-2 p-4 ${order.isLate ? "garage-kds-late" : ""}`}
        style={{ borderColor: bc, backgroundColor: bg }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase text-[#888]">#{order.id}</p>
            <h3 className="truncate text-2xl font-black leading-tight text-white">{order.table}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {order.pinned && <span className="inline-block rounded border border-[#f5a742] bg-[#f5a742]/18 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#ffd08a]">PIN</span>}
              {/* ADD-ON badge â€” order ke-2,3,... di session meja yang sama.
                  Kitchen perlu sadar ini bukan order pertama, supaya tidak
                  duplikasi prep atau confused dengan ticket lama. */}
              {order.addonSequence && order.addonSequence > 1 && (
                <span className="inline-flex items-center gap-0.5 rounded border border-[#f5a742]/65 bg-[#f5a742]/22 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#ffd79a]">
                  <Plus className="size-2.5" />
                  ADD-ON #{order.addonSequence}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {statusBadge(order)}
            {order.isLate && <span className="rounded border border-[#d11a2a]/60 bg-[#d11a2a]/20 px-1.5 py-0.5 text-[10px] font-black text-[#ff9090]">LEWAT</span>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-[#aaa]">
          <span className="flex items-center gap-1"><ArrowRight className="size-3 text-[#f5a742]" /><span className="font-semibold text-white">{dLbl(order)}</span></span>
          <span className="shrink-0 text-[#555]">|</span>
          <span className="shrink-0 font-semibold text-[#bbb]">{stLbl(order.station as KitchenStationFilter)}</span>
        </div>
        <div className="mt-3 rounded border border-[#34343c] bg-black/30 p-3">
          <p className="text-[10px] uppercase text-[#888]">{order.isLate ? "Lewat" : order.status === "queue" ? "Target" : "Sisa"}</p>
          <p className={"mt-0.5 font-mono text-3xl font-black tabular-nums leading-none " + tC}>{clock}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#0d0d12]">
            <div className={"h-full rounded-full transition-all " + bC} style={{ width: Math.min(100, (order.prodSec / order.targetSec) * 100) + "%" }} />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {order.items.slice(0, 5).map((item: string, i: number) => (
            <div key={i} className="rounded border border-[#3a3a42]/70 bg-black/20 px-2.5 py-1.5">
              <p className="text-base font-black leading-snug text-white">{item}</p>
              {itemNote(order, item) && (
                <p className="mt-1 rounded border border-[#f5a742]/45 bg-[#f5a742]/14 px-2 py-1 text-sm font-black leading-snug text-[#ffe0aa]">
                  CATATAN: {itemNote(order, item)}
                </p>
              )}
            </div>
          ))}
          {order.items.length > 5 && <p className="text-center text-xs text-[#666]">+{order.items.length - 5} item</p>}
        </div>
        {order.internalNotes && (
          <p className="mt-2 rounded border border-[#f5a742]/40 bg-[#f5a742]/12 px-2.5 py-2 text-sm font-black leading-snug text-[#ffd08a]">CATATAN ORDER: {order.internalNotes}</p>
        )}
        {!isTerminal && (
          <button onClick={() => void updateStatus(order)} disabled={updatingTicket === order.id}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-[#d11a2a] px-4 py-3 text-sm font-black uppercase tracking-wide text-white active:scale-95 disabled:opacity-50 transition-transform">
            {updatingTicket === order.id ? <RefreshCw className="size-4 animate-spin" /> : <Check className="size-4" />}
            {order.status === "queue" ? "Terima" : order.status === "cooking" ? "Siap" : "Selesai"}
          </button>
        )}
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => void togglePin(order)}
            className={"flex-1 rounded border py-1.5 text-[10px] font-bold uppercase transition " + (order.pinned ? "border-[#f5a742] bg-[#f5a742]/20 text-[#ffd08a]" : "border-[#444] bg-white/5 text-[#888]")}>
            &#128204; {order.pinned ? "Unpin" : "Pin"}
          </button>
          <button onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write("<!DOCTYPE html><html><head><title>KDS " + order.id + "</title><style>body{font-family:monospace;padding:12px;margin:0;font-size:14px}h1{font-size:20px;margin:0 0 8px}p{margin:2px 0}.item{border-bottom:1px dashed #ccc;padding:4px 0}</style></head><body><h1>GARAGE - " + order.id + "</h1><p>Meja: " + order.table + " | Station: " + order.station + "</p><hr>" + order.items.map((i: string) => "<div class=item>" + i + "</div>").join("") + "<hr><p>" + new Date().toLocaleString("id-ID") + "</p></body></html>"); w.document.close(); w.print(); } }}
            className="flex-1 rounded border border-[#444] bg-white/5 py-1.5 text-[10px] font-bold uppercase text-[#888] transition hover:bg-white/10">
            &#128439; Cetak
          </button>
        </div>
      </div>
    );
  }

  function renderList(order: KitchenTicketView) {
    const bg = order.slaTone === "late" ? "#2a1116" : order.slaTone === "watch" ? "#2b2114" : "#202027";
    const bc = order.slaTone === "late" ? "#d11a2a" : order.slaTone === "watch" ? "#f5a742" : "#3a3a42";
    const isTerminal = isTerminalKitchenStatus(order.status);
    const tC = order.slaTone === "late" ? "text-[#ff4d5d]" : order.slaTone === "watch" ? "text-[#ffd08a]" : "text-white";
    const clock = order.status === "queue" ? fmtClock(order.targetSec)
      : order.isLate ? fmtClock(order.prodSec - order.targetSec)
      : fmtClock(order.targetSec - order.prodSec);
    const notes = order.items
      .map((item) => ({ item, note: itemNote(order, item) }))
      .filter((row) => row.note);

    return (
      <div
        key={order.id}
        className={`flex flex-col gap-2 rounded-lg border-2 p-3 sm:flex-row sm:items-center sm:gap-3 ${order.isLate ? "garage-kds-list-danger" : ""}`}
        style={{ borderColor: bc, backgroundColor: bg }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-[#777]">#{order.id}</span>
            <span className="truncate text-xl font-black text-white">{order.table}</span>
            {order.pinned && <span className="rounded border border-[#f5a742] bg-[#f5a742]/18 px-1 py-0.5 text-[9px] font-black text-[#ffd08a]">PIN</span>}
            {order.addonSequence && order.addonSequence > 1 && (
              <span className="inline-flex items-center gap-0.5 rounded border border-[#f5a742]/65 bg-[#f5a742]/22 px-1 py-0.5 text-[9px] font-black uppercase text-[#ffd79a]">
                <Plus className="size-2.5" />
                ADD-ON #{order.addonSequence}
              </span>
            )}
            {order.isLate && <span className="rounded bg-[#d11a2a]/30 px-1 py-0.5 text-[9px] font-black text-[#ff9090]">LEWAT</span>}
            {statusBadge(order, "ml-auto")}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[#aaa]">
            <span className="truncate font-semibold text-white">{dLbl(order)}</span>
            <span className="shrink-0 text-[#555]">|</span>
            <span className="shrink-0 text-[#bbb]">{stLbl(order.station as KitchenStationFilter)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {order.items.slice(0, 3).map((item: string, i: number) => (
              <span key={i} className="rounded border border-[#3a3a42] bg-black/20 px-1.5 py-0.5 text-[11px] font-bold text-white">{item}</span>
            ))}
            {order.items.length > 3 && <span className="text-[10px] text-[#666]">+{order.items.length - 3}</span>}
          </div>
          {notes.length > 0 && (
            <div className="mt-2 space-y-1">
              {notes.slice(0, 2).map((row) => (
                <p key={row.item} className="rounded border border-[#f5a742]/40 bg-[#f5a742]/12 px-2 py-1 text-xs font-black text-[#ffd79a]">
                  {row.item}: {row.note}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:min-w-[130px]">
          <div className="text-center">
            <p className="text-[9px] uppercase text-[#777]">{order.isLate ? "Lewat" : order.status === "queue" ? "Target" : "Sisa"}</p>
            <p className={"font-mono text-2xl font-black " + tC}>{clock}</p>
          </div>
          {!isTerminal ? (
            <button onClick={() => void updateStatus(order)} disabled={updatingTicket === order.id}
              className="flex w-full items-center justify-center gap-1 rounded bg-[#d11a2a] px-3 py-2.5 text-xs font-black uppercase text-white active:scale-95 disabled:opacity-50 transition-transform sm:w-auto sm:px-4">
              {updatingTicket === order.id ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {order.status === "queue" ? "Terima" : order.status === "cooking" ? "Siap" : "Selesai"}
            </button>
          ) : (
            <span className="rounded bg-white/8 px-2 py-1 text-[10px] font-bold text-[#888]">SELESAI</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3 px-2 sm:px-3 lg:px-4">
      <VoiceSettingsDialog
        open={voiceDialogOpen}
        onOpenChange={setVoiceDialogOpen}
      />
      {/* TOP BAR */}
      <div className="sticky top-0 z-30 flex flex-col gap-2 rounded-lg border border-[#34343c] bg-[#111116] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase text-[#f5a742]">KDS</span>
            <span className="flex items-center gap-1 rounded-full border border-[#34343c] bg-[#101016]/76 px-2 py-0.5 text-[10px] font-semibold text-white">
              <span className="size-2 rounded-full bg-[#22c55e] animate-pulse" />LIVE
            </span>
            {lastSyncedAt && <span className="font-mono text-[10px] text-[#888]">{lastSyncedAt.toLocaleTimeString("id-ID")}</span>}
            {canEarn && feeBalance !== null && (
              <span className="flex items-center gap-1 rounded-full border border-[#f5a742]/55 bg-[#f5a742]/14 px-2 py-0.5 text-[10px] font-semibold text-[#ffd79a]">
                <Wallet className="size-3" />
                Fee {currency.format(feeBalance)}
              </span>
            )}
          </div>
          <h2 className="mt-0.5 text-base font-black uppercase leading-tight text-white sm:text-xl">{stationTitle()}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["Baru", summary.queue, "#888"],
            ["Proses", summary.cooking, "#f5a742"],
            ["Ready", summary.ready, "#22c55e"],
            ["Telat", summary.late, "#d11a2a"],
          ] as Array<[string, number, string]>).map(([l, v, c]) => (
            <div key={String(l)} className="flex items-center gap-1.5 rounded-full border border-[#34343c] bg-white/[0.04] px-2.5 py-1">
              <span className="font-mono text-[10px] text-[#888]">{String(l)}</span>
              <span className="text-sm font-black" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CONTROL BAR: status pills + single control button */}
      <div className="flex flex-col gap-2 rounded-lg border border-[#34343c] bg-[#111116]/80 p-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {statusFilters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                "shrink-0 rounded-md border px-2.5 py-2 text-xs font-black transition sm:px-3 sm:py-2.5 " +
                (status === s
                  ? "border-[#d11a2a] bg-[#d11a2a] text-white"
                  : "border-[#444] bg-white/[0.04] text-[#aaa] hover:bg-white/[0.08]")
              }
            >
              {sLbl(s)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 text-[10px] font-mono uppercase text-[#888] sm:flex">
            <span className="rounded-md border border-[#34343c] bg-white/[0.04] px-2 py-1 text-white">
              {stLbl(station)}
            </span>
            <span className="rounded-md border border-[#34343c] bg-white/[0.04] px-2 py-1 text-white">
              {displayMode === "board" ? "Board" : "List"}
            </span>
          </div>
          {/* Sound toggle â€” penting untuk kitchen yang sibuk, biar tidak harus
              terus stare layar. Browser butuh klik user dulu untuk unlock audio. */}
          <button
            type="button"
            onClick={soundEnabled ? disableSound : enableSound}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-black transition ${
              soundEnabled
                ? "border-[#22c55e]/55 bg-[#22c55e]/14 text-[#86efac] hover:bg-[#22c55e]/20"
                : "border-[#4a4a54] bg-white/[0.04] text-[#888] hover:bg-white/[0.06] hover:text-[#d6d6dc]"
            }`}
            aria-label={soundEnabled ? "Matikan suara" : "Nyalakan suara"}
            title={
              soundEnabled
                ? "Suara aktif â€” order baru & late ada alert"
                : "Suara mati â€” klik untuk aktifkan"
            }
          >
            <Volume2 className={`size-4 ${soundEnabled ? "" : "opacity-50"}`} />
            <span className="hidden sm:inline">{soundEnabled ? "Sound ON" : "Sound OFF"}</span>
          </button>
          {/* Voice Announcement gaya bandara â€” status badge dengan dot indicator */}
          <VoiceStatusBadge onOpen={() => setVoiceDialogOpen(true)} />
          <button
            type="button"
            onClick={() => void markAllFoodReady()}
            disabled={!readyableFoodTickets.length || bulkReadyLoading}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-[#22c55e]/55 bg-[#22c55e]/14 px-3 text-xs font-black text-[#bbf7d0] transition hover:bg-[#22c55e]/22 disabled:border-[#333] disabled:bg-white/[0.03] disabled:text-[#666]"
            title="Tandai semua tiket makanan antre/proses menjadi ready"
          >
            {bulkReadyLoading ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            <span className="hidden sm:inline">Ready Semua</span>
            <span>{readyableFoodTickets.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setControlsOpen(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/16 px-3 text-xs font-black text-white transition hover:bg-[#d11a2a]/22"
          >
            <Settings className="size-4" />
            Kontrol
          </button>
        </div>
      </div>

      <Dialog open={controlsOpen} onOpenChange={setControlsOpen}>
        <DialogContent className="max-w-md border-[#34343c] bg-[#101016] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase">Kontrol KDS</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#888]">
                Station
                {lockedStation ? (
                  <span className="ml-2 normal-case tracking-normal text-[#f5a742]">
                    Â· terkunci untuk {role}
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "Food", "Bar", "Packaging"] as KitchenStationFilter[]).map((s) => {
                  const disabled = lockedStation !== null && lockedStation !== s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        if (disabled) return;
                        setStation(s);
                      }}
                      disabled={disabled}
                      className={
                        "rounded-md border px-3 py-2 text-xs font-black transition " +
                        (station === s
                          ? "border-[#f5a742] bg-[#f5a742]/18 text-[#ffd79a]"
                          : disabled
                            ? "border-[#2a2a30] bg-white/[0.02] text-[#555] opacity-60"
                            : "border-[#444] bg-white/[0.04] text-[#aaa] hover:bg-white/[0.08]")
                      }
                    >
                      {stLbl(s)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#888]">Tampilan</p>
              <div className="flex gap-1 rounded-md border border-[#444] bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setDisplayMode("list")}
                  className={
                    "flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-xs font-black transition " +
                    (displayMode === "list" ? "bg-[#d11a2a] text-white" : "text-[#888] hover:text-white")
                  }
                >
                  &#9776; List
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("board")}
                  className={
                    "flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-xs font-black transition " +
                    (displayMode === "board" ? "bg-[#d11a2a] text-white" : "text-[#888] hover:text-white")
                  }
                >
                  &#9632; Board
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[#34343c] pt-3">
              <button
                type="button"
                onClick={() => {
                  void onRefresh();
                }}
                disabled={isSyncing}
                className="flex h-11 items-center justify-center gap-2 rounded-md border border-[#444] bg-white/[0.04] px-3 text-xs font-black text-[#d6d6dc] transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <RefreshCw className={"size-3.5 " + (isSyncing ? "animate-spin" : "")} />
                Sync
              </button>
              {canViewPerformance ? (
                <button
                  type="button"
                  onClick={() => {
                    setControlsOpen(false);
                    setPerformanceOpen(true);
                    void onRefreshPerformance();
                    void loadKitchenShiftReport();
                  }}
                  className="flex h-11 items-center justify-center gap-2 rounded-md border border-[#444] bg-white/[0.04] px-3 text-xs font-black text-[#d6d6dc] transition hover:bg-white/[0.08]"
                >
                  {performanceLoading ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <BarChart3 className="size-3.5" />
                  )}
                  Analisa
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {(syncError || performanceError || shiftReportError) && (
        <div className="flex flex-col gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3 text-xs text-[#ffd08a]">
          {syncError && <p>Sync dapur: {syncError}</p>}
          {performanceError && <p>Analisa dapur: {performanceError}</p>}
          {shiftReportError && <p>Report shift dapur: {shiftReportError}</p>}
        </div>
      )}

      {mutationError && (
        <div className="flex items-center gap-2 rounded-md border border-[#d11a2a]/50 bg-[#d11a2a]/12 p-3 text-xs text-[#ff9090]">
          <AlertTriangle className="size-4 shrink-0" />{mutationError}
        </div>
      )}

      {sortedTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#444] py-16 text-center">
          <span className="text-4xl">&#127858;</span>
          <p className="mt-3 text-base font-bold text-[#777]">Tidak ada pesanan aktif</p>
          <p className="mt-1 text-xs text-[#555]">Pesanan baru akan muncul otomatis</p>
        </div>
      ) : displayMode === "board" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sortedTickets.map(renderBoard)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {sortedTickets.map(renderList)}
        </div>
      )}

      {canViewPerformance && (
        <Dialog open={performanceOpen} onOpenChange={setPerformanceOpen}>
          <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto border-[#34343c] bg-[#101016] p-4 text-white sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase">Report Dapur</DialogTitle>
            </DialogHeader>
            <div className="mt-3 rounded-lg border border-[#34343c] bg-white/[0.04] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#888]">Shift hari ini</p>
                  <p className="text-sm font-bold text-white">
                    Item ready, total fee dapur, Koki, dan Asisten Koki.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadKitchenShiftReport()}
                  disabled={shiftReportLoading}
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#444] bg-black/20 px-3 text-xs font-black text-[#d6d6dc] transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  <RefreshCw className={"size-3.5 " + (shiftReportLoading ? "animate-spin" : "")} />
                  Refresh Report
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ["Item", shiftReport?.totals.totalItems ?? 0, "#f5a742"],
                  ["Fee Dapur", currency.format(shiftReport?.totals.totalFee ?? 0), "#22c55e"],
                  ["Koki", currency.format(shiftReport?.totals.kokiFee ?? 0), "#ffd08a"],
                  ["Asisten", currency.format(shiftReport?.totals.assistantFee ?? 0), "#b8b8d1"],
                ] as Array<[string, string | number, string]>).map(([label, value, color]) => (
                  <div key={label} className="rounded border border-[#34343c] bg-black/20 p-2.5">
                    <p className="font-mono text-[10px] uppercase text-[#888]">{label}</p>
                    <p className="mt-1 text-lg font-black leading-tight" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {shiftReportLoading && !shiftReport ? (
                  <p className="rounded border border-[#34343c] bg-black/20 p-3 text-xs font-bold text-[#888]">
                    Memuat report dapur...
                  </p>
                ) : shiftReport?.shifts.length ? (
                  shiftReport.shifts.map((shift) => (
                    <div
                      key={shift.sessionId}
                      className="grid gap-2 rounded border border-[#34343c] bg-black/20 p-3 text-xs sm:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]"
                    >
                      <div>
                        <p className="text-sm font-black text-white">{shift.shiftLabel}</p>
                        <p className="text-[#888]">{shift.cashierName} Â· {shift.status}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-[#777]">Item Ready</p>
                        <p className="text-lg font-black text-[#ffd08a]">{shift.totalItems}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-[#777]">Fee Dapur</p>
                        <p className="text-lg font-black text-[#86efac]">{currency.format(shift.totalFee)}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase text-[#777]">Bagi 2</p>
                        <p className="font-bold text-[#d6d6dc]">Koki {currency.format(shift.kokiFee)}</p>
                        <p className="font-bold text-[#d6d6dc]">Asisten {currency.format(shift.assistantFee)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded border border-[#34343c] bg-black/20 p-3 text-xs font-bold text-[#888]">
                    Belum ada shift kasir hari ini.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Total", performance?.summary.totalTickets ?? 0, "#888"],
                ["On Time", performance?.summary.onTimeTickets ?? 0, "#22c55e"],
                ["Telat", performance?.summary.lateTickets ?? 0, "#d11a2a"],
                ["Avg Score", performance?.summary.avgScore == null ? "-" : "" + performance.summary.avgScore, "#f5a742"],
              ] as Array<[string, string | number, string]>).map(([l, v, c]) => (
                <div key={String(l)} className="rounded border border-[#34343c] bg-white/[0.04] p-3">
                  <p className="font-mono text-[10px] text-[#888]">{String(l)}</p>
                  <p className="mt-1 text-2xl font-black" style={{ color: c }}>{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#34343c]">
                    <th className="p-2 text-left font-bold text-[#aaa]">Nama</th>
                    <th className="p-2 text-right font-bold text-[#aaa]">Ticket</th>
                    <th className="p-2 text-right font-bold text-[#aaa]">On Time</th>
                    <th className="p-2 text-right font-bold text-[#aaa]">Telat</th>
                    <th className="p-2 text-right font-bold text-[#aaa]">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {performance?.rows.map(r => (
                    <tr key={r.staffName} className="border-b border-[#2a2a32]">
                      <td className="p-2 font-semibold text-white">{r.staffName}</td>
                      <td className="p-2 text-right text-[#aaa]">{r.totalTickets}</td>
                      <td className="p-2 text-right text-[#aaa]">{r.onTimeTickets}</td>
                      <td className="p-2 text-right text-[#ff9090]">{r.lateTickets}</td>
                      <td className="p-2 text-right font-black text-white">{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <KitchenEtaPanel refreshKey={kitchenOrders.length} />
    </section>
  );
}


