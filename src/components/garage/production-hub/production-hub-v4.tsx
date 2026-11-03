"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BarChart3,
  Bike,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutGrid,
  Layers,
  LogOut,
  Maximize2,
  Minimize2,
  MessageCircle,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { ProductionMaterialRequestDialog } from "@/components/garage/production-material-request-dialog";
import { ProductionSoldOutDialog } from "@/components/garage/production-sold-out-dialog";
import { useLcdMode } from "@/components/garage/use-lcd-mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, invalidateGarageCache, subscribeGarageCache } from "@/lib/garage-cache";
import { currency } from "@/lib/garage-data";
import type {
  GarageMe,
  KitchenPerformanceData,
  KitchenShiftReport,
  MenuItem,
  ProductionBatchSuggestionView,
  ProductionBatchView,
  ProductionBoard,
  ProductionTicketView,
} from "@/lib/garage-api-types";
import {
  canOperateStation,
  normalizeWorkstation,
  productionStationLabel,
  workstationLabel,
} from "@/lib/garage-production-rules";
import type { CompletionPrintView } from "@/lib/production-completion-print-rules";
import type { ProductionHistoryOrder } from "@/lib/production-hub-history";
import {
  DENSITY_PRESETS,
  groupSiblings,
  hubStatusOf,
  resolveGrid,
  slaLevelOf,
  sortHubTickets,
  stabilizeOrder,
  type DensityId,
  type HubAction,
  type HubSortMode,
} from "@/lib/production-hub-v4";
import { useProductionStream } from "@/lib/use-production-stream";

import { BatchView, type BatchActions } from "./batch-view";
import { HistoryPanel } from "./history-panel";
import { HubSheet, Segmented, SelectBox, StationBadge } from "./hub-ui";
import { customerOf, OrderCard, tableText, type SiblingInfo } from "./order-card";
import { AutoPrintSwitch, PrinterPanel } from "./printer-panel";
import { ReadyQueue, type ReadyTab } from "./ready-queue";
import { useCompletionPrintWorker } from "./use-completion-print";
import { useHubSound } from "./use-hub-sound";

const VoiceSettingsDialog = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceSettingsDialog),
  { ssr: false },
);

const POLL_MS = 4000;
const POLL_LIVE_MS = 15_000;
const GAP = 8;
const PREFS_KEY = "garage:phv4:prefs";

type Area = "all" | "Bar" | "Food";
type GridFilter = "production" | "waiting" | "processing" | "ready" | "all";
type Sheet = null | "batch" | "ready" | "history" | "printer" | "more" | "waiter";
type MobileTab = "produksi" | "batch" | "ready" | "history" | "more";

type Prefs = { density: DensityId; sort: HubSortMode; filter: GridFilter };
const DEFAULT_PREFS: Prefs = { density: "auto", sort: "priority", filter: "production" };

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    return {
      density: (["auto", "8", "12", "15", "18", "24"] as const).includes(raw?.density as DensityId)
        ? (raw?.density as DensityId)
        : DEFAULT_PREFS.density,
      sort: (["priority", "oldest", "newest"] as const).includes(raw?.sort as HubSortMode)
        ? (raw?.sort as HubSortMode)
        : DEFAULT_PREFS.sort,
      filter: (["production", "waiting", "processing", "ready", "all"] as const).includes(raw?.filter as GridFilter)
        ? (raw?.filter as GridFilter)
        : DEFAULT_PREFS.filter,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function sameKeys(a: string[], b: string[]) {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

export function ProductionHubV4({
  me,
  menuItems = [],
  canViewPerformance,
  performance,
  performanceLoading,
  performanceError,
  onRefreshPerformance,
  onNavigateModule,
}: {
  me: GarageMe;
  menuItems?: MenuItem[];
  canViewPerformance: boolean;
  performance: KitchenPerformanceData | null;
  performanceLoading: boolean;
  performanceError: string | null;
  onRefreshPerformance: () => Promise<void> | void;
  onNavigateModule?: (moduleId: string) => void;
}) {
  const workstation = normalizeWorkstation(me.workstation);
  const stationOfDevice: Area =
    workstation === "bar" || workstation === "helper_bar"
      ? "Bar"
      : workstation === "dapur" || workstation === "helper_dapur"
        ? "Food"
        : "all";
  const soldOutStations = (["Bar", "Food"] as const).filter((st) => canOperateStation(me.role, me.workstation, st));
  const materialDivisions: Array<"bar" | "dapur"> =
    stationOfDevice === "Bar" ? ["bar"] : stationOfDevice === "Food" ? ["dapur"] : ["bar", "dapur"];
  const canWrite = me.role !== "Waiter";

  const isDesktop = useMedia("(min-width: 768px)");
  const isLarge = useMedia("(min-width: 1280px)");
  const isWide = useMedia("(min-width: 1600px)");
  const lcd = useLcdMode();

  const [board, setBoard] = useState<ProductionBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [area, setArea] = useState<Area>(stationOfDevice);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Desktop/tablet: tampilan utama Produksi (grid order) atau Batch Produksi (tabel batch).
  const [view, setView] = useState<"produksi" | "batch">("produksi");
  const [mobileTab, setMobileTab] = useState<MobileTab>("produksi");
  const [readyPanel, setReadyPanel] = useState<boolean | null>(null);
  const [readyTab, setReadyTab] = useState<ReadyTab>("ready");
  const [detail, setDetail] = useState<string | null>(null);
  const [waiterFor, setWaiterFor] = useState<string | null>(null);
  const [batchStation, setBatchStation] = useState<"Bar" | "Food">(stationOfDevice === "Food" ? "Food" : "Bar");
  const [reopenReason, setReopenReason] = useState("");
  const [locked, setLocked] = useState<Set<string>>(new Set());
  // Kartu yang baru ditekan tetap di tempat 5 detik (layar sentuh tidak punya hover).
  const [recent, setRecent] = useState<string[]>([]);
  const [lastOrder, setLastOrder] = useState<string[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [done, setDone] = useState<ProductionHistoryOrder[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [ayaOn, setAyaOn] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shiftReport, setShiftReport] = useState<KitchenShiftReport | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const gridHostRef = useRef<HTMLDivElement | null>(null);
  const hasBoard = board !== null;
  const portalTarget = useSyncExternalStore(
    () => () => undefined,
    () => document.body,
    () => null,
  );

  // ---------------------------------------------------------------- data
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
  const { connected: live } = useProductionStream(useCallback(() => void load(true), [load]));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal + preferensi perangkat
    setPrefs(loadPrefs());
    void load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(true);
    };
    const id = window.setInterval(tick, live ? POLL_LIVE_MS : POLL_MS);
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
  }, [load, live]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Hub menutupi shell → tandai <html> (AYA disembunyikan / dikunci kecil, lihat globals.css).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.phv4 = "on";
    return () => {
      delete root.dataset.phv4;
      delete root.dataset.phv4Aya;
    };
  }, []);
  useEffect(() => {
    if (ayaOn) document.documentElement.dataset.phv4Aya = "on";
    else delete document.documentElement.dataset.phv4Aya;
  }, [ayaOn]);

  useEffect(() => {
    const host = gridHostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((current) =>
        Math.abs(current.w - width) < 1 && Math.abs(current.h - height) < 1 ? current : { w: width, h: height },
      );
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [isDesktop, hasBoard]);

  function savePrefs(next: Partial<Prefs>) {
    setPrefs((current) => {
      const value = { ...current, ...next };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(value));
      } catch {
        /* abaikan */
      }
      return value;
    });
    setPage(0);
  }

  // ---------------------------------------------------------------- derived
  const tickets = useMemo(() => board?.tickets ?? [], [board]);
  const inArea = useCallback((station: "Bar" | "Food") => area === "all" || area === station, [area]);
  const areaTickets = useMemo(() => tickets.filter((t) => inArea(t.station)), [tickets, inArea]);
  const lateIds = useMemo(
    () => new Set(tickets.filter((t) => slaLevelOf(t, now) === "critical").map((t) => t.ticketNo)),
    [tickets, now],
  );
  const { soundEnabled, toggleSound } = useHubSound(board, area, lateIds, now);

  const counts = useMemo(() => {
    const c = { waiting: 0, processing: 0, ready: 0, critical: 0 };
    for (const t of areaTickets) {
      const s = hubStatusOf(t);
      if (s === "waiting") c.waiting += 1;
      else if (s === "processing") c.processing += 1;
      else if (s === "ready" || s === "delivering") c.ready += 1;
      if (lateIds.has(t.ticketNo)) c.critical += 1;
    }
    return c;
  }, [areaTickets, lateIds]);

  const siblings = useMemo(() => {
    const map = new Map<string, ProductionTicketView[]>();
    for (const t of tickets) {
      if (!t.orderId) continue;
      map.set(t.orderId, [...(map.get(t.orderId) ?? []), t]);
    }
    return map;
  }, [tickets]);
  const siblingOf = useCallback(
    (t: ProductionTicketView): SiblingInfo => {
      const other = t.orderId ? siblings.get(t.orderId)?.find((s) => s.station !== t.station) : undefined;
      return other ? { station: other.station, status: other.status } : null;
    },
    [siblings],
  );

  const q = query.trim().toLowerCase();
  const gridTickets = useMemo(() => {
    return areaTickets.filter((t) => {
      const s = hubStatusOf(t);
      const okStatus =
        prefs.filter === "all"
          ? true
          : prefs.filter === "production"
            ? s === "waiting" || s === "processing"
            : prefs.filter === "ready"
              ? s === "ready" || s === "delivering"
              : s === prefs.filter;
      if (!okStatus) return false;
      if (!q) return true;
      return [t.orderNo ?? "", t.ticketNo, t.table, tableText(t.table), t.identity, ...t.items.map((i) => i.label)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [areaTickets, prefs.filter, q]);

  const sortedKeys = useMemo(
    () => {
      const sorted = sortHubTickets(gridTickets, now, prefs.sort);
      return (area === "all" ? groupSiblings(sorted, (t) => t.orderId) : sorted).map((t) => t.ticketNo);
    },
    [gridTickets, now, prefs.sort, area],
  );
  const sortedSig = sortedKeys.join("|");
  const order = useMemo(
    () =>
      stabilizeOrder(lastOrder, sortedSig ? sortedSig.split("|") : [], [
        ...locked,
        ...recent,
        ...(busyKey ? [busyKey.split(":")[1]] : []),
      ]),
    [lastOrder, sortedSig, locked, recent, busyKey],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- simpan urutan tampil untuk penstabil berikutnya
    if (!sameKeys(order, lastOrder)) setLastOrder(order);
  }, [order, lastOrder]);
  const byNo = useMemo(() => new Map(tickets.map((t) => [t.ticketNo, t])), [tickets]);
  const ordered = useMemo(
    () => order.map((key) => byNo.get(key)).filter((t): t is ProductionTicketView => Boolean(t)),
    [order, byNo],
  );

  // Antrean siap = panel kanan di layar ≥1280px; tablet = overlay (grid tetap 4×2).
  const showReadyPanel = isLarge && (readyPanel ?? isWide);
  const grid = resolveGrid(prefs.density, box.w, box.h, GAP);
  const pageSize = Math.max(1, grid.cols * grid.rows);
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = isDesktop ? ordered.slice(safePage * pageSize, safePage * pageSize + pageSize) : ordered;
  const cardHeight = grid.rows ? (box.h - GAP * (grid.rows - 1)) / grid.rows : 240;
  const maxLines = isDesktop ? Math.max(1, Math.floor((cardHeight - 128) / 20)) : 8;

  const readyTickets = useMemo(
    () =>
      sortHubTickets(
        areaTickets.filter((t) => t.status === "ready"),
        now,
        "oldest",
      ),
    [areaTickets, now],
  );
  const suggestions = board?.suggestions ?? [];
  const batches = board?.batches ?? [];
  const batchCount = suggestions.filter((s) => inArea(s.station)).length + batches.filter((b) => inArea(b.station)).length;
  const cancelled = (board?.cancelled ?? []).filter((c) => inArea(c.station));
  const canOperate = board?.canOperate ?? { Bar: false, Food: false };
  const canHandover = board?.canHandover ?? { Bar: false, Food: false };
  const jobs = useMemo(() => board?.completionPrints ?? [], [board]);
  const printer = useCompletionPrintWorker(jobs, me.device ?? workstationLabel(me.workstation), () => void load(true));
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const queuedJobs = jobs.filter((j) => j.status === "pending" || j.status === "printing").length;
  const printerTone = failedJobs ? "bg-[var(--phv4-critical)]" : printer.enabled ? "bg-[var(--phv4-success)]" : "bg-[var(--phv4-wait)]";
  const detailTicket = detail ? byNo.get(detail) ?? null : null;
  const waiterTicket = waiterFor ? byNo.get(waiterFor) ?? null : null;

  const loadDone = useCallback(async () => {
    setDoneLoading(true);
    try {
      const data = await garageApi.get<{ orders: ProductionHistoryOrder[] }>("/api/production/history?status=delivered", {
        cache: "no-store",
      });
      setDone(
        data.orders
          .filter((o) => o.tickets.some((t) => (area === "all" ? true : t.station === area)))
          .slice(0, 30),
      );
    } catch {
      /* biarkan data lama */
    } finally {
      setDoneLoading(false);
    }
  }, [area]);
  useEffect(() => {
    const readyVisible = showReadyPanel || sheet === "ready" || mobileTab === "ready";
    if (readyTab !== "done" || !readyVisible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch saat tab Selesai dibuka
    void loadDone();
  }, [readyTab, showReadyPanel, sheet, mobileTab, loadDone, board?.generatedAt]);

  // ---------------------------------------------------------------- actions
  const onInteract = useCallback((ticketNo: string, active: boolean) => {
    setLocked((current) => {
      if (active === current.has(ticketNo)) return current;
      const next = new Set(current);
      if (active) next.add(ticketNo);
      else next.delete(ticketNo);
      return next;
    });
  }, []);

  async function runAction(key: string, fn: () => Promise<unknown>, success?: string) {
    if (busyKey) return false;
    setBusyKey(key);
    try {
      await fn();
      invalidateGarageCache([GARAGE_TAGS.kitchen]);
      await load(true);
      if (success) setToast({ tone: "ok", text: success });
      return true;
    } catch (error) {
      setToast({
        tone: "error",
        text: error instanceof GarageApiError || error instanceof Error ? error.message : "Aksi gagal.",
      });
      await load(true);
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  const ticketPost = (ticket: ProductionTicketView, body: Record<string, unknown>) =>
    garageApi.post(`/api/production/tickets/${encodeURIComponent(ticket.ticketNo)}`, body);

  const onAction = useCallback(
    (ticket: ProductionTicketView, action: HubAction) => {
      const key = `${action}:${ticket.ticketNo}`;
      setRecent((current) => [...current.filter((no) => no !== ticket.ticketNo), ticket.ticketNo]);
      window.setTimeout(() => setRecent((current) => current.filter((no) => no !== ticket.ticketNo)), 5000);
      if (action === "start") void runAction(key, () => ticketPost(ticket, { action: "start" }));
      else if (action === "finish") void runAction(key, () => ticketPost(ticket, { action: "ready", qcConfirmed: true }));
      else if (action === "call") void runAction(key, () => ticketPost(ticket, { action: "ready_call" }), "Waiter dipanggil.");
      else if (action === "serve") void runAction(key, () => ticketPost(ticket, { action: "serve_direct" }), "Pesanan diserahkan.");
      else {
        setWaiterFor(ticket.ticketNo);
        setSheet("waiter");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAction membaca state terbaru tiap render
    [busyKey, load],
  );
  const onOpen = useCallback((ticket: ProductionTicketView) => {
    setDetail(ticket.ticketNo);
    setReopenReason("");
  }, []);

  function pickup(ticket: ProductionTicketView, waiterId: string) {
    void runAction(`pickup:${ticket.ticketNo}`, () => ticketPost(ticket, { action: "pickup", waiterUserId: waiterId }), "Selesai antar.");
  }
  function serve(ticket: ProductionTicketView) {
    void runAction(`serve:${ticket.ticketNo}`, () => ticketPost(ticket, { action: "serve_direct" }), "Pesanan diserahkan.");
  }
  function callWaiters(ticket: ProductionTicketView) {
    void runAction(`call:${ticket.ticketNo}`, () => ticketPost(ticket, { action: "ready_call" }), "Waiter dipanggil.");
  }
  async function reopen(ticketNo: string, reason: string) {
    return runAction(`reopen:${ticketNo}`, () =>
      garageApi.post(`/api/production/tickets/${encodeURIComponent(ticketNo)}`, { action: "reopen", reason }),
    "Tiket dikembalikan ke proses.");
  }
  function startBatch(s: ProductionBatchSuggestionView) {
    return runAction(`batch:${s.key}`, () => garageApi.post("/api/production/batches", { ticketItemIds: s.items.map((i) => i.id) }), `Batch ${s.itemLabel} ×${s.totalQty} dimulai.`);
  }
  function completeBatch(batch: ProductionBatchView, allocationIds: string[]) {
    return runAction(`complete:${batch.id}`, () =>
      garageApi.post(`/api/production/batches/${batch.id}`, { action: "complete", allocationIds }),
    `Batch ${batch.batchNo} selesai.`);
  }
  function cancelBatch(batch: ProductionBatchView, reason: string) {
    return runAction(`cancel:${batch.id}`, () => garageApi.post(`/api/production/batches/${batch.id}`, { action: "cancel", reason }));
  }
  async function retryJob(job: CompletionPrintView) {
    await runAction(`retry:${job.id}`, () => garageApi.post(`/api/production/completion-prints/${job.id}`, { action: "retry" }), "Diantrekan ulang.");
  }
  async function reprint(orderId: string, reason: string) {
    const ok = await runAction(`reprint:${orderId}`, () => garageApi.post("/api/production/completion-prints", { orderId, reason }), "Cetak ulang diantrekan.");
    if (ok) setHistoryKey((k) => k + 1);
    return ok;
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
  function exitHub() {
    if (lcd.active) void lcd.exit();
    onNavigateModule?.("dashboard");
  }

  function openPanel(next: "batch" | "ready" | "history" | "printer") {
    if (next === "printer") return setSheet("printer");
    if (!isDesktop) return setMobileTab(next);
    if (next === "ready") return isLarge ? setReadyPanel(!showReadyPanel) : setSheet("ready");
    if (next === "batch") return setView("batch");
    setSheet(next);
  }


  // ---------------------------------------------------------------- pieces
  const clock = new Date(now).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const areaSelect = (
    <SelectBox
      label="Area"
      value={area}
      onChange={(v) => {
        setArea(v);
        setPage(0);
      }}
      options={[
        { value: "all", label: "Semua" },
        { value: "Bar", label: "Bar" },
        { value: "Food", label: "Dapur" },
      ]}
    />
  );
  const countPills = (
    <>
      {(
        [
          ["WAIT", counts.waiting, "text-[var(--phv4-wait)]", "waiting"],
          ["PROCESS", counts.processing, "text-[#60a5fa]", "processing"],
          ["READY", counts.ready, "text-[var(--phv4-success)]", "ready"],
        ] as const
      ).map(([label, value, tone, filter]) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            if (filter === "ready") return openPanel("ready");
            setView("produksi");
            savePrefs({ filter });
          }}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[11px] font-bold tracking-wide text-[var(--phv4-muted)] hover:text-white"
        >
          {label}
          <span className={`phv4-mono text-[15px] ${tone}`}>{String(value).padStart(2, "0")}</span>
        </button>
      ))}
      {counts.critical ? (
        <span className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-[var(--phv4-critical)]/15 px-2 text-[11px] font-bold text-[#fecaca]">
          <AlertTriangle className="size-3.5" /> SLA <span className="phv4-mono text-[14px]">{counts.critical}</span>
        </span>
      ) : null}
    </>
  );
  const toolButton =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2.5 text-[12px] font-semibold text-[#e5e7eb] hover:bg-white/5";

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Menu lainnya" className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--phv4-border)] hover:bg-white/5">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-[var(--phv4-border)] bg-[#15171b] text-white">
        <DropdownMenuItem onClick={() => void (lcd.active ? lcd.exit() : lcd.enter())}>
          {lcd.active ? <Minimize2 className="mr-2 size-4" /> : <Maximize2 className="mr-2 size-4" />}
          {lcd.active ? "Keluar layar penuh" : "Layar penuh"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleSound}>
          {soundEnabled ? <Volume2 className="mr-2 size-4" /> : <VolumeX className="mr-2 size-4" />}
          Suara {soundEnabled ? "ON" : "OFF"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setVoiceOpen(true)}>
          <Settings2 className="mr-2 size-4" /> Pengaturan suara
        </DropdownMenuItem>
        <DropdownMenuItem className="xl:hidden" onClick={() => setSheet("more")}>
          <Layers className="mr-2 size-4" /> Stok habis & minta bahan
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSheet("history")}>
          <History className="mr-2 size-4" /> Riwayat pesanan
        </DropdownMenuItem>
        {canViewPerformance ? (
          <DropdownMenuItem onClick={() => void openReport()}>
            <BarChart3 className="mr-2 size-4" /> Laporan produksi
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("garage:open-team-chat"))}>
          <MessageCircle className="mr-2 size-4" /> Chat tim
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAyaOn((v) => !v)}>
          <Sparkles className="mr-2 size-4" /> AYA {ayaOn ? "ON" : "OFF"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void load()}>
          <RefreshCw className="mr-2 size-4" /> Muat ulang
        </DropdownMenuItem>
        {onNavigateModule ? (
          <DropdownMenuItem onClick={exitHub}>
            <LogOut className="mr-2 size-4" /> Kembali ke menu OS
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const readyQueue = (
    <ReadyQueue
      tickets={readyTickets}
      done={done}
      doneLoading={doneLoading}
      now={now}
      canHandover={canHandover}
      waiters={board?.waiters ?? []}
      busyKey={busyKey}
      tab={readyTab}
      onTab={setReadyTab}
      onCall={callWaiters}
      onServe={serve}
      onPickup={pickup}
      onOpen={onOpen}
    />
  );
  const batchActions: BatchActions = {
    startRow: async (row) => {
      // Satu POST per sub-batch kompatibel (produk + varian + catatan sama) — aturan server.
      let ok = true;
      for (const s of row.suggestions) ok = (await startBatch(s)) && ok;
      return ok;
    },
    completePartial: (batch, allocationIds) =>
      runAction(`complete:${batch.id}`, () =>
        garageApi.post(`/api/production/batches/${batch.id}`, { action: "complete_partial", allocationIds }),
      `${allocationIds.length} porsi ${batch.itemLabel} selesai.`),
    completeFull: (batch) => completeBatch(batch, batch.allocations.map((a) => a.id)),
    cancel: cancelBatch,
    recall: (ticketNo) =>
      runAction(`call:${ticketNo}`, () =>
        garageApi.post(`/api/production/tickets/${encodeURIComponent(ticketNo)}`, { action: "ready_call" }),
      "Waiter dipanggil ulang."),
  };
  const avgMinutes = {
    Bar: board?.load.find((l) => l.station === "Bar")?.avgProductionMinutes ?? null,
    Food: board?.load.find((l) => l.station === "Food")?.avgProductionMinutes ?? null,
  };
  const batchView = (
    <BatchView
      station={batchStation}
      onStation={setBatchStation}
      batches={batches}
      suggestions={suggestions}
      tickets={tickets}
      menuItems={menuItems}
      lateTicketNos={lateIds}
      avgMinutes={avgMinutes}
      now={now}
      layout={!isDesktop ? "mobile" : isLarge ? "desktop" : "tablet"}
      canOperate={canOperate}
      busyKey={busyKey}
      actions={batchActions}
      readyTickets={readyTickets}
      autoPrint={printer.enabled}
      onAutoPrint={printer.toggle}
      onOpenTicket={(no) => {
        setDetail(no);
        setReopenReason("");
      }}
    />
  );
  const historyPanel = (
    <HistoryPanel canWrite={canWrite} refreshKey={historyKey} onReprint={reprint} onReopen={reopen} />
  );
  const printerPanel = (
    <PrinterPanel
      jobs={jobs}
      autoPrint={printer.enabled}
      onAutoPrint={printer.toggle}
      busyId={printer.busyId}
      notice={printer.notice}
      tickets={tickets}
      chitStation={stationOfDevice}
      canWrite={canWrite}
      onRetry={retryJob}
      onPrintNow={(job) => void printer.printNow(job)}
      onReprint={reprint}
      onChanged={() => void load(true)}
      now={now}
    />
  );
  const toolsRow = (
    <div className="flex flex-wrap gap-1.5 xl:flex-nowrap">
      {soldOutStations.length ? (
        <ProductionSoldOutDialog menuItems={menuItems} stations={soldOutStations} triggerClassName={toolButton} />
      ) : null}
      <ProductionMaterialRequestDialog divisions={materialDivisions} triggerClassName={toolButton} />
    </div>
  );

  const cancelledStrip = cancelled.length ? (
    <div role="alert" className="flex min-w-0 shrink-0 items-center gap-2 rounded-md border border-[var(--phv4-critical)] bg-[var(--phv4-critical)]/12 px-2.5 py-1.5 text-[12px]">
      <X className="size-4 shrink-0 text-[var(--phv4-critical)]" />
      <span className="shrink-0 font-bold uppercase text-[#fecaca]">Dibatalkan — hentikan</span>
      <span className="min-w-0 truncate text-[#fee2e2]">
        {cancelled
          .map((c) => `#${c.orderNo ?? c.ticketNo} ${tableText(c.table)} (${productionStationLabel(c.station)}): ${c.items.join(", ")}`)
          .join("  ·  ")}
      </span>
    </div>
  ) : null;

  const emptyGrid = (
    <div className="grid h-full place-items-center rounded-[8px] border border-dashed border-[var(--phv4-border)] text-center">
      <div>
        <LayoutGrid className="mx-auto size-6 text-[var(--phv4-muted)]" />
        <p className="mt-2 text-[14px] font-semibold">Tidak ada pesanan {prefs.filter === "production" ? "diproduksi" : "di filter ini"}</p>
        <p className="text-[12px] text-[var(--phv4-muted)]">
          {counts.ready ? `${counts.ready} pesanan siap di antrean Siap Antar.` : "Pesanan baru muncul otomatis."}
        </p>
      </div>
    </div>
  );

  const cards = visible.map((ticket) => (
    <OrderCard
      key={ticket.ticketNo}
      ticket={ticket}
      now={now}
      maxLines={maxLines}
      busy={busyKey?.endsWith(`:${ticket.ticketNo}`) ?? false}
      canOperate={canOperate[ticket.station]}
      canHandover={canHandover[ticket.station]}
      sibling={siblingOf(ticket)}
      fixedHeight={isDesktop}
      onAction={onAction}
      onOpen={onOpen}
      onInteract={onInteract}
    />
  ));

  // ---------------------------------------------------------------- render
  // Portal ke <body>: hub menutupi shell (chat FAB, widget SOP) tanpa terjebak stacking context induk.
  if (!portalTarget) return null;
  return createPortal(
    <div className="phv4 fixed inset-0 z-[45] flex flex-col overflow-hidden" aria-label="Production Hub">
      <VoiceSettingsDialog open={voiceOpen} onOpenChange={setVoiceOpen} />

      {/* Header ramping */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--phv4-border)] bg-[var(--phv4-bg2)] px-2 md:h-[52px] md:px-3">
        <div className="flex h-8 shrink-0 items-center rounded-[6px] bg-[#f4f4f5] px-1.5">
          <Image
            src="/garage-brand/garage-coffee-logo.png"
            alt="Garage Coffee"
            width={1200}
            height={282}
            priority
            className="h-5 w-auto object-contain md:h-6"
          />
        </div>
        <span className="hidden text-[12px] font-semibold text-[var(--phv4-muted)] lg:inline">
          {view === "batch" && isDesktop ? "Batch Produksi" : "Production Hub"}
        </span>
        <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--phv4-border)] px-2 text-[11px] font-bold">
          <span className={`size-2 rounded-full ${live ? "bg-[var(--phv4-success)] motion-safe:animate-pulse" : "bg-[var(--phv4-wait)]"}`} />
          {live ? "LIVE" : "POLL"}
          <span className="phv4-mono hidden text-[12px] font-semibold text-[#d1d5db] sm:inline">{clock}</span>
        </span>
        {isDesktop ? (
          <>
            {areaSelect}
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">{countPills}</div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-pressed={view === "batch"}
                onClick={() => setView((v) => (v === "batch" ? "produksi" : "batch"))}
                className={`${toolButton} border-[var(--phv4-red)]/60 ${view === "batch" ? "bg-[var(--phv4-red)] text-white hover:bg-[var(--phv4-red-hover)]" : ""}`}
              >
                <Layers className="size-4 text-[var(--phv4-red)]" /> BATCH
                {batchCount ? <span className="phv4-mono rounded bg-[var(--phv4-red)] px-1 text-[11px] text-white">{batchCount}</span> : null}
              </button>
              <button type="button" onClick={() => setSheet("printer")} className={toolButton} aria-label="Printer">
                <Printer className="size-4" />
                <span className="hidden xl:inline">PRINTER</span>
                <span className={`size-2 rounded-full ${printerTone}`} />
                {failedJobs ? <span className="phv4-mono text-[11px] text-[#fca5a5]">{failedJobs}</span> : null}
              </button>
              <button
                type="button"
                onClick={() => void (lcd.active ? lcd.exit() : lcd.enter())}
                aria-label={lcd.active ? "Keluar layar penuh" : "Layar penuh"}
                className="grid size-8 place-items-center rounded-md border border-[var(--phv4-border)] hover:bg-white/5"
              >
                {lcd.active ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
              {moreMenu}
            </div>
          </>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setSheet("printer")} className="grid size-8 place-items-center rounded-md border border-[var(--phv4-border)]" aria-label="Printer">
              <span className="relative">
                <Printer className="size-4" />
                <span className={`absolute -right-1 -top-1 size-2 rounded-full ${printerTone}`} />
              </span>
            </button>
            {moreMenu}
          </div>
        )}
      </header>

      {/* Toolbar ringkas */}
      {(isDesktop && view === "produksi") || (!isDesktop && mobileTab === "produksi") ? (
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 md:px-3">
          {/* Kiri boleh digulir horizontal; pager di kanan selalu terlihat. */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {!isDesktop ? (
            <>
              {areaSelect}
              {countPills}
            </>
          ) : null}
          <Segmented
            label="Filter status"
            value={prefs.filter}
            onChange={(filter) => savePrefs({ filter })}
            options={[
              { value: "production", label: "Produksi", count: counts.waiting + counts.processing },
              { value: "waiting", label: "Menunggu" },
              { value: "processing", label: "Proses" },
              { value: "ready", label: "Siap" },
              { value: "all", label: "Semua" },
            ]}
          />
          <SelectBox
            label="Urut"
            value={prefs.sort}
            onChange={(sort) => savePrefs({ sort })}
            options={[
              { value: "priority", label: "Prioritas" },
              { value: "oldest", label: "Terlama" },
              { value: "newest", label: "Terbaru" },
            ]}
          />
          {isDesktop ? (
            <SelectBox
              label="Density"
              value={prefs.density}
              onChange={(density) => savePrefs({ density })}
              options={[{ value: "auto" as DensityId, label: `Auto (${grid.cols}×${grid.rows})` }, ...DENSITY_PRESETS.map((p) => ({ value: p.id as DensityId, label: p.label }))]}
            />
          ) : null}
          <label className="flex h-8 min-w-[140px] max-w-[240px] flex-1 items-center gap-1.5 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2">
            <Search className="size-3.5 shrink-0 text-[var(--phv4-muted)]" aria-hidden />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Cari order / meja"
              aria-label="Cari order atau meja"
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            />
          </label>
          {isDesktop ? (
            <>
              <button type="button" onClick={() => setSheet("history")} className={toolButton}>
                <History className="size-4" /> Riwayat
              </button>
              <div className="hidden xl:flex">{toolsRow}</div>
            </>
          ) : null}
          </div>
          {isDesktop ? (
            <>
              <div className="flex shrink-0 items-center gap-1">
                {grid.clamped ? (
                  <span className="text-[11px] text-[var(--phv4-wait)]" title="Preset diturunkan agar teks tetap terbaca">
                    {grid.cols * grid.rows}/{prefs.density}
                  </span>
                ) : null}
                <button type="button" aria-label="Halaman sebelumnya" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="grid size-8 place-items-center rounded-md border border-[var(--phv4-border)] disabled:opacity-40">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="phv4-mono min-w-[44px] text-center text-[12px] font-semibold">
                  {safePage + 1}/{pages}
                </span>
                <button type="button" aria-label="Halaman berikutnya" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} className="grid size-8 place-items-center rounded-md border border-[var(--phv4-border)] disabled:opacity-40">
                  <ChevronRight className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openPanel("ready")}
                  aria-label={showReadyPanel ? "Tutup antrean siap" : "Buka antrean siap"}
                  className="grid size-8 place-items-center rounded-md border border-[var(--phv4-border)] hover:bg-white/5"
                >
                  {showReadyPanel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Isi utama */}
      {isDesktop && view === "batch" ? (
        <div className="flex min-h-0 flex-1">{batchView}</div>
      ) : (
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 md:p-2">
          {/* Toast HP: strip di alur konten (mendorong daftar, tidak menutupi kartu). */}
          {toast && !isDesktop ? (
            <p
              role="status"
              className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${
                toast.tone === "error"
                  ? "border-[var(--phv4-critical)] bg-[#2a1215] text-[#fecaca]"
                  : "border-[var(--phv4-success)]/60 bg-[#0f2418] text-[#bbf7d0]"
              }`}
            >
              {toast.text}
            </p>
          ) : null}
          {cancelledStrip}
          {!board ? (
            <div className="grid flex-1 place-items-center text-[13px] text-[var(--phv4-muted)]">
              {loadError ? `Gagal memuat: ${loadError}` : "Memuat papan produksi…"}
            </div>
          ) : isDesktop ? (
            <div ref={gridHostRef} className="phv4-grid-host min-h-0 flex-1">
              {visible.length ? (
                <div
                  className="grid h-full"
                  style={{
                    gap: GAP,
                    gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
                  }}
                >
                  {cards}
                </div>
              ) : (
                emptyGrid
              )}
            </div>
          ) : mobileTab === "produksi" ? (
            <div className="garage-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">{visible.length ? cards : emptyGrid}</div>
          ) : mobileTab === "batch" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-[var(--phv4-border)]">{batchView}</div>
          ) : (
            <div className="garage-scroll min-h-0 flex-1 overflow-y-auto">
              {mobileTab === "ready" ? (
                readyQueue
              ) : mobileTab === "history" ? (
                <div className="p-1">{historyPanel}</div>
              ) : (
                <div className="space-y-3 p-1">
                  <div className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
                    <p className="text-[12px] text-[var(--phv4-muted)]">
                      {me.role === "Owner" || me.role === "Manajer" ? "Manajemen (override)" : workstationLabel(me.workstation)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={toggleSound} className={toolButton}>
                        {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Suara {soundEnabled ? "ON" : "OFF"}
                      </button>
                      <button type="button" onClick={() => setVoiceOpen(true)} className={toolButton}>
                        <Settings2 className="size-4" /> Suara/voice
                      </button>
                      <button type="button" onClick={() => setSheet("printer")} className={toolButton}>
                        <Printer className="size-4" /> Printer
                      </button>
                      <button type="button" onClick={() => window.dispatchEvent(new Event("garage:open-team-chat"))} className={toolButton}>
                        <MessageCircle className="size-4" /> Chat tim
                      </button>
                      {canViewPerformance ? (
                        <button type="button" onClick={() => void openReport()} className={toolButton}>
                          <BarChart3 className="size-4" /> Laporan
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {toolsRow}
                </div>
              )}
            </div>
          )}
        </main>

        {showReadyPanel ? (
          <aside aria-label="Antrean Siap Antar" className="phv4-drawer-in flex w-[300px] shrink-0 flex-col border-l border-[var(--phv4-border)] bg-[var(--phv4-bg2)] xl:w-[320px]">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--phv4-border)] px-3">
              <Bike className="size-4 text-[var(--phv4-red)]" />
              <h2 className="text-[14px] font-bold">Siap Antar / Ambil</h2>
              <span className="phv4-mono ml-auto rounded bg-[var(--phv4-red)] px-1.5 text-[12px] font-bold">{readyTickets.length}</span>
            </div>
            <div className="min-h-0 flex-1">{readyQueue}</div>
          </aside>
        ) : null}
      </div>
      )}

      {/* Status bar */}
      {isDesktop ? (
        <footer className="flex h-9 shrink-0 items-center gap-3 overflow-hidden border-t border-[var(--phv4-border)] bg-[var(--phv4-bg2)] px-3 text-[12px]">
          <span className="flex shrink-0 items-center gap-2">
            <Printer className="size-3.5 text-[var(--phv4-muted)]" />
            <span className="text-[var(--phv4-muted)]">Auto Print (Selesai)</span>
            <AutoPrintSwitch on={printer.enabled} onChange={printer.toggle} />
            <span className={failedJobs ? "font-semibold text-[#fca5a5]" : "text-[var(--phv4-muted)]"}>
              antre {queuedJobs} · gagal {failedJobs}
            </span>
          </span>
          {printer.notice && now - printer.notice.at < 15_000 ? (
            <span className={`min-w-0 truncate ${printer.notice.tone === "ok" ? "text-[#86efac]" : "text-[#fca5a5]"}`}>{printer.notice.text}</span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-2 text-[var(--phv4-muted)]">
            SLA:
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--phv4-success)]" />aman</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--phv4-wait)]" />≥60% target</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--phv4-critical)]" />lewat (prioritas)</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[var(--phv4-muted)]">
            {loadError ? <span className="text-[var(--phv4-wait)]">Sinkron gagal</span> : null}
            <button type="button" onClick={() => void load()} aria-label="Muat ulang" className="grid size-7 place-items-center rounded hover:bg-white/5">
              <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            </button>
            {board ? new Date(board.generatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
          </span>
        </footer>
      ) : (
        <nav aria-label="Navigasi produksi" className="grid h-14 shrink-0 grid-cols-5 border-t border-[var(--phv4-border)] bg-[var(--phv4-bg2)] pb-[env(safe-area-inset-bottom)]">
          {(
            [
              ["produksi", "Produksi", LayoutGrid, counts.waiting + counts.processing],
              ["batch", "Batch", Layers, batchCount],
              ["ready", "Siap Antar", Bike, readyTickets.length],
              ["history", "Riwayat", History, 0],
              ["more", "Lainnya", MoreHorizontal, failedJobs],
            ] as const
          ).map(([id, label, Icon, badge]) => (
            <button
              key={id}
              type="button"
              aria-current={mobileTab === id ? "page" : undefined}
              onClick={() => setMobileTab(id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                mobileTab === id ? "text-white" : "text-[var(--phv4-muted)]"
              }`}
            >
              {mobileTab === id ? <span className="absolute inset-x-3 top-0 h-0.5 rounded bg-[var(--phv4-red)]" /> : null}
              <Icon className="size-5" />
              {label}
              {badge ? (
                <span className="phv4-mono absolute right-[18%] top-1.5 min-w-4 rounded-full bg-[var(--phv4-red)] px-1 text-[10px] text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      )}

      {/* Toast desktop/tablet: di tengah status bar (bukan di atas grid), di atas laci. */}
      {toast && isDesktop ? (
        <div
          role="status"
          className={`phv4-sheet-in fixed bottom-1 left-1/2 z-[49] flex h-7 max-w-[34vw] -translate-x-1/2 items-center truncate rounded-md border px-3 text-[12px] font-semibold shadow-xl ${
            toast.tone === "error"
              ? "border-[var(--phv4-critical)] bg-[#2a1215] text-[#fecaca]"
              : "border-[var(--phv4-success)]/60 bg-[#0f2418] text-[#bbf7d0]"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      {/* Overlay */}
      <HubSheet open={sheet === "ready"} onClose={() => setSheet(null)} title="Siap Antar / Ambil" icon={Bike} width="md:w-[400px]">
        <div className="-m-3 h-[70svh] md:h-full">{readyQueue}</div>
      </HubSheet>
      <HubSheet open={sheet === "more" && isDesktop} onClose={() => setSheet(null)} title="Alat produksi" icon={Settings2} width="md:w-[380px]">
        {toolsRow}
      </HubSheet>
      <HubSheet open={sheet === "history"} onClose={() => setSheet(null)} title="Riwayat Pesanan" icon={History}>
        {historyPanel}
      </HubSheet>
      <HubSheet open={sheet === "printer"} onClose={() => setSheet(null)} title="Printer & Tiket Selesai" icon={Printer}>
        {printerPanel}
      </HubSheet>
      <HubSheet
        open={sheet === "waiter" && Boolean(waiterTicket)}
        onClose={() => setSheet(null)}
        title={`Selesai antar · #${waiterTicket?.orderNo ?? ""} ${waiterTicket ? tableText(waiterTicket.table) : ""}`}
        icon={Bike}
        width="md:w-[420px]"
      >
        {waiterTicket ? (
          <div className="space-y-2">
            <p className="text-[12px] text-[var(--phv4-muted)]">Siapa yang mengantar ke meja? (fee antar tercatat ke waiter ini)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(board?.waiters ?? []).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    pickup(waiterTicket, w.id);
                  }}
                  className="h-11 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] px-2 text-[13px] font-semibold hover:border-[#86efac]"
                >
                  {w.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSheet(null);
                  serve(waiterTicket);
                }}
                className="h-11 rounded-[6px] border border-[var(--phv4-border)] px-2 text-[13px] font-semibold text-[var(--phv4-muted)] hover:text-white"
              >
                Saya sendiri
              </button>
            </div>
          </div>
        ) : null}
      </HubSheet>
      <HubSheet
        open={Boolean(detailTicket)}
        onClose={() => setDetail(null)}
        title={detailTicket ? `#${detailTicket.orderNo ?? detailTicket.ticketNo} · ${tableText(detailTicket.table)}` : "Detail"}
        icon={LayoutGrid}
        width="md:w-[460px]"
      >
        {detailTicket ? (
          <TicketDetail
            ticket={detailTicket}
            sibling={siblingOf(detailTicket)}
            job={jobs.find((j) => j.orderId && j.orderId === detailTicket.orderId && !j.reprint) ?? null}
            canOperate={canOperate[detailTicket.station]}
            reason={reopenReason}
            onReason={setReopenReason}
            busy={busyKey === `reopen:${detailTicket.ticketNo}`}
            onReopen={async () => {
              if (await reopen(detailTicket.ticketNo, reopenReason.trim())) setDetail(null);
            }}
          />
        ) : null}
      </HubSheet>

      {canViewPerformance ? (
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="max-h-[88svh] overflow-y-auto border-[#343840] bg-[#15171b] text-white sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Laporan Produksi</DialogTitle>
              <DialogDescription className="text-[#d1d5db]">Kinerja per staf (bulan ini) dan item siap per shift hari ini.</DialogDescription>
            </DialogHeader>
            {performanceError ? <p className="text-sm text-[#fde68a]">{performanceError}</p> : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Tiket", performance?.summary.totalTickets ?? 0],
                  ["Tepat waktu", performance?.summary.onTimeTickets ?? 0],
                  ["Telat", performance?.summary.lateTickets ?? 0],
                  ["Item siap (shift)", shiftReport?.totals.totalItems ?? 0],
                ] as Array<[string, number]>
              ).map(([label, value]) => (
                <div key={label} className="rounded-md border border-[#343840] bg-white/[0.04] p-3">
                  <p className="text-xs text-[#9ca3af]">{label}</p>
                  <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            {shiftReport ? (
              <p className="text-sm text-[#d1d5db]">
                Fee produksi shift hari ini: <b className="font-mono text-white">{currency.format(shiftReport.totals.totalFee)}</b>
              </p>
            ) : null}
            <div className="garage-scroll-x overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#343840] text-left text-[#9ca3af]">
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
                      <td colSpan={5} className="p-3 text-center text-[#9ca3af]">Memuat…</td>
                    </tr>
                  ) : (
                    performance?.rows.map((row) => (
                      <tr key={row.staffName} className="border-b border-[#2a2d33]">
                        <td className="p-2 font-semibold">{row.staffName}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{row.totalTickets}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{row.onTimeTickets}</td>
                        <td className="p-2 text-right font-mono tabular-nums text-[#fca5a5]">{row.lateTickets}</td>
                        <td className="p-2 text-right font-mono font-bold tabular-nums">{row.score}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>,
    portalTarget,
  );
}

function TicketDetail({
  ticket,
  sibling,
  job,
  canOperate,
  reason,
  onReason,
  busy,
  onReopen,
}: {
  ticket: ProductionTicketView;
  sibling: SiblingInfo;
  job: CompletionPrintView | null;
  canOperate: boolean;
  reason: string;
  onReason: (value: string) => void;
  busy: boolean;
  onReopen: () => void;
}) {
  const hhmm = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "—";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <StationBadge station={ticket.station} />
        <span className="text-[15px] font-bold">{customerOf(ticket).customer ?? customerOf(ticket).fallback}</span>
        {customerOf(ticket).waiter ? <span className="text-[var(--phv4-muted)]">waiter {customerOf(ticket).waiter}</span> : null}
        <span className="text-[var(--phv4-muted)]">{ticket.channel}</span>
        {ticket.queueNo ? <span className="phv4-mono text-[var(--phv4-muted)]">Antrian {ticket.queueNo}</span> : null}
      </div>
      <ul className="space-y-1">
        {ticket.items.map((item) => (
          <li key={item.id} className="rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] px-2.5 py-1.5">
            <p className="text-[15px] font-semibold">
              <span className="phv4-mono font-bold text-[var(--phv4-wait)]">{item.qty}×</span> {item.label}
              {item.batchNo ? <span className="phv4-mono ml-1 text-[11px] text-[var(--phv4-muted)]">{item.batchNo}</span> : null}
            </p>
            {item.note ? <p className="text-[13px] font-semibold text-[#fde68a]">• {item.note}</p> : null}
          </li>
        ))}
      </ul>
      {ticket.issueReason ? <p className="text-[12px] font-semibold text-[#fca5a5]">{ticket.issueReason}</p> : null}
      <dl className="grid grid-cols-4 gap-1 text-[11px]">
        {(
          [
            ["Masuk", ticket.createdAt],
            ["Mulai", ticket.acceptedAt],
            ["Siap", ticket.readyAt],
            ["Dipanggil", ticket.handoverAt],
          ] as const
        ).map(([label, at]) => (
          <div key={label} className="rounded-[5px] border border-[var(--phv4-border)] px-1.5 py-1">
            <dt className="text-[var(--phv4-muted)]">{label}</dt>
            <dd className="phv4-mono font-bold">{hhmm(at)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-[var(--phv4-muted)]">
        {sibling
          ? `Station lain (${sibling.station === "Bar" ? "Bar" : "Dapur"}): ${sibling.status === "ready" || sibling.status === "delivered" ? "selesai" : "masih diproses"}.`
          : "Order ini hanya untuk satu station."}{" "}
        Tiket SELESAI: {job ? `${job.status === "printed" ? "tercetak" : job.status === "failed" ? "gagal cetak" : "antre cetak"}` : "belum (menunggu semua station)"}.
      </p>
      {ticket.status === "ready" && canOperate && !ticket.claimedByName ? (
        <div className="space-y-1.5 border-t border-[var(--phv4-border)] pt-2">
          <p className="text-[12px] font-semibold">Koreksi: kembalikan ke proses (produk salah/rusak)</p>
          <div className="flex gap-1.5">
            <input
              value={reason}
              onChange={(event) => onReason(event.target.value)}
              placeholder="Alasan (wajib, diaudit)"
              aria-label="Alasan kembalikan"
              className="h-9 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[13px] outline-none focus:border-[var(--phv4-red)]"
            />
            <button
              type="button"
              disabled={reason.trim().length < 3 || busy}
              onClick={onReopen}
              className="h-9 shrink-0 rounded-[6px] bg-[var(--phv4-red)] px-3 text-[12px] font-bold text-white disabled:opacity-50"
            >
              Kembalikan
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
