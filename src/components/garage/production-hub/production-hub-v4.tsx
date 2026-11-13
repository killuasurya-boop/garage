"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BarChart3,
  Bike,
  ChefHat,
  Clock,
  Gauge,
  History,
  Lightbulb,
  LayoutGrid,
  Layers,
  LogOut,
  Maximize2,
  Minimize2,
  MessageCircle,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  WifiOff,
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
import { hubStatusOf, slaLevelOf, sortHubTickets, type HubAction } from "@/lib/production-hub-v4";
import {
  boardColumns,
  fifoPositions,
  orderProgress,
  productionIndicators,
  productionKpis,
  stationName,
  syncHealth,
  type ProductionIndicator,
} from "@/lib/production-v7";
import { busyExtraByStation, DEFAULT_SLA_CONFIG } from "@/lib/production-sla";
import { soundAreaFor } from "@/lib/hub-sound-rules";
import { useProductionStream } from "@/lib/use-production-stream";

import { BatchView, type BatchActions } from "./batch-view";
import { HistoryPanel } from "./history-panel";
import { HubSheet, Segmented, SelectBox } from "./hub-ui";
import { OrderDetail, OrderDetailFooter } from "./order-detail";
import { OrderCard, tableText, type SiblingInfo } from "./order-card";
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
const READY_STALE_MS = 2 * 60_000;
// V7: kunci baru supaya preferensi lama (filter "Produksi" + urut "Prioritas" + halaman) tidak terbawa —
// papan kini selalu tiga kolom, urut FIFO, tanpa halaman.
const PREFS_KEY = "garage:phv7:prefs";

type Area = "all" | "Bar" | "Food";
type Sheet = null | "batch" | "history" | "printer" | "more" | "waiter" | "insight";
type MobileTab = "produksi" | "batch" | "ready" | "history" | "more";
type MobileColumn = "waiting" | "processing";

// zoom = Layar LCD/TV yang dibaca dari 1–3 m (fitur layar lama, audit P3).
type HubZoom = "100" | "125" | "150";
type Prefs = { zoom: HubZoom };
const DEFAULT_PREFS: Prefs = { zoom: "100" };

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    return { zoom: (["100", "125", "150"] as const).includes(raw?.zoom as HubZoom) ? (raw?.zoom as HubZoom) : DEFAULT_PREFS.zoom };
  } catch {
    return DEFAULT_PREFS;
  }
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const INDICATOR_TONE: Record<ProductionIndicator["level"], string> = {
  critical: "border-[var(--phv4-critical)] bg-[var(--phv4-critical)]/12",
  warn: "border-[var(--phv4-wait)]/70 bg-[var(--phv4-wait)]/10",
  info: "border-[var(--phv4-border)] bg-[var(--phv4-card)]",
};
const INDICATOR_KIND: Record<ProductionIndicator["kind"], string> = { fakta: "Fakta", hitungan: "Hitungan", saran: "Saran" };

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
  const [mobileColumn, setMobileColumn] = useState<MobileColumn>("waiting");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const online = useOnline();
  const [sheet, setSheet] = useState<Sheet>(null);
  // Desktop/tablet: tampilan utama Produksi (grid order) atau Batch Produksi (tabel batch).
  const [view, setView] = useState<"produksi" | "batch">("produksi");
  const [mobileTab, setMobileTab] = useState<MobileTab>("produksi");
  const [readyTab, setReadyTab] = useState<ReadyTab>("ready");
  const [detail, setDetail] = useState<string | null>(null);
  const [waiterFor, setWaiterFor] = useState<string | null>(null);
  const [batchStation, setBatchStation] = useState<"Bar" | "Food">(stationOfDevice === "Food" ? "Food" : "Bar");
  // V7: tiket terakhir yang dibuka — bila tiket hilang dari papan (diantar/dibatalkan) panel detail TIDAK
  // menutup diam-diam atau berganti ke pesanan lain; ia menampilkan pemberitahuan dengan data terakhir.
  const lastDetailRef = useRef<ProductionTicketView | null>(null);
  // V7: tiket yang sudah pernah tampil per kolom → kartu baru/baru pindah kolom disorot singkat sekali.
  const seenRef = useRef<Map<string, string>>(new Map());
  const [freshSet, setFreshSet] = useState<ReadonlySet<string>>(() => new Set());
  const [done, setDone] = useState<ProductionHistoryOrder[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [ayaOn, setAyaOn] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shiftReport, setShiftReport] = useState<KitchenShiftReport | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
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
      setLastSyncAt(Date.now());
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
  }

  // ---------------------------------------------------------------- derived
  const tickets = useMemo(() => board?.tickets ?? [], [board]);
  const inArea = useCallback((station: "Bar" | "Food") => area === "all" || area === station, [area]);
  const areaTickets = useMemo(() => tickets.filter((t) => inArea(t.station)), [tickets, inArea]);
  // SLA v2: konfigurasi outlet + mode ramai per station (target tampilan +X menit).
  const slaCfg = board?.sla ?? DEFAULT_SLA_CONFIG;
  const busyExtra = useMemo(() => busyExtraByStation(tickets, slaCfg), [tickets, slaCfg]);
  const lateIds = useMemo(
    () =>
      new Set(
        tickets.filter((t) => slaLevelOf(t, now, slaCfg, busyExtra[t.station]) === "critical").map((t) => t.ticketNo),
      ),
    [tickets, now, slaCfg, busyExtra],
  );
  // V2: perangkat stasiun hanya bersuara untuk stasiunnya walau tampilan "Semua".
  const { soundEnabled, toggleSound, audioState, testSound } = useHubSound(board, soundAreaFor(stationOfDevice, area), lateIds, now);
  const soundLabel = !soundEnabled
    ? "Suara OFF"
    : audioState === "ready"
      ? "Suara ON · siap"
      : audioState === "unsupported"
        ? "Suara ON · audio tidak didukung"
        : "Suara ON · ketuk layar";
  const runTestSound = async () => {
    const ok = await testSound();
    setToast(ok ? { tone: "ok", text: "Tes suara diputar. Tidak terdengar? Cek volume perangkat." } : { tone: "error", text: "Audio belum aktif — ketuk layar sekali lalu coba lagi." });
  };

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
  // Pencarian hanya menyaring TAMPILAN (dengan tanda jelas); tanpa pencarian semua tiket aktif selalu tampil.
  const shownTickets = useMemo(() => {
    if (!q) return areaTickets;
    return areaTickets.filter((t) =>
      [t.orderNo ?? "", t.ticketNo, t.table, tableText(t.table), t.identity, t.queueNo ? `#${t.queueNo}` : "", ...t.items.map((i) => i.label)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [areaTickets, q]);
  // Kolom & posisi FIFO: murni dari waktu masuk server (lihat production-v7.ts). `dayKey` berganti saat ganti hari WIB.
  const dayKey = Math.floor((now + 7 * 3_600_000) / 86_400_000);
  const columns = useMemo(
    () => boardColumns(shownTickets, dayKey * 86_400_000 - 7 * 3_600_000 + 1),
    [shownTickets, dayKey],
  );
  const positions = useMemo(() => fifoPositions(tickets), [tickets]);
  const byNo = useMemo(() => new Map(tickets.map((t) => [t.ticketNo, t])), [tickets]);

  const readyTickets = useMemo(
    () =>
      sortHubTickets(
        areaTickets.filter((t) => t.status === "ready"),
        now,
        "oldest",
      ),
    [areaTickets, now],
  );
  // V7: kolom SIAP selalu tampil di tablet/desktop (tidak lagi disembunyikan di balik tombol).
  const showReadyPanel = isDesktop;
  // Pesanan siap > 2 menit belum diantar → tanda mencolok di header (waiter lupa dipanggil).
  const readyStale = readyTickets.filter((t) => t.readyAt && now - Date.parse(t.readyAt) > READY_STALE_MS).length;
  const suggestions = useMemo(() => board?.suggestions ?? [], [board?.suggestions]);
  const batches = useMemo(() => board?.batches ?? [], [board?.batches]);
  const batchCount = suggestions.filter((s) => inArea(s.station)).length + batches.filter((b) => inArea(b.station)).length;
  const cancelled = (board?.cancelled ?? []).filter((c) => inArea(c.station));
  const canOperate = board?.canOperate ?? { Bar: false, Food: false };
  const canHandover = board?.canHandover ?? { Bar: false, Food: false };
  const jobs = useMemo(() => board?.completionPrints ?? [], [board]);
  const printer = useCompletionPrintWorker(jobs, me.device ?? workstationLabel(me.workstation), () => void load(true));
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const queuedJobs = jobs.filter((j) => j.status === "pending" || j.status === "printing").length;
  const printerTone = failedJobs ? "bg-[var(--phv4-critical)]" : printer.enabled ? "bg-[var(--phv4-success)]" : "bg-[var(--phv4-wait)]";
  // V7: KPI, indikator dan status sinkron — semuanya dari data papan yang sebenarnya.
  const coarseNow = Math.floor(now / 5000) * 5000;
  const kpi = useMemo(
    () =>
      productionKpis({
        tickets: areaTickets,
        batches: batches.filter((b) => inArea(b.station)),
        suggestions: suggestions.filter((s) => inArea(s.station)),
        now: coarseNow,
        sla: slaCfg,
        busyExtra,
      }),
    [areaTickets, batches, suggestions, inArea, coarseNow, slaCfg, busyExtra],
  );
  const indicators = useMemo(
    () =>
      productionIndicators({
        tickets: areaTickets,
        suggestions: suggestions.filter((s) => inArea(s.station)),
        load: (board?.load ?? []).filter((l) => inArea(l.station)),
        now: coarseNow,
        sla: slaCfg,
        busyExtra,
        truncated: board?.truncated ?? null,
      }),
    [areaTickets, suggestions, board?.load, board?.truncated, inArea, coarseNow, slaCfg, busyExtra],
  );
  const urgentIndicators = indicators.filter((i) => i.level !== "info").length;
  const sync = syncHealth({ online, streamConnected: live, lastError: loadError, lastSyncAt, now });
  const liveDetail = detail ? byNo.get(detail) ?? null : null;
  useEffect(() => {
    if (liveDetail) lastDetailRef.current = liveDetail;
    else if (!detail) lastDetailRef.current = null;
  }, [liveDetail, detail]);
  // eslint-disable-next-line react-hooks/refs -- snapshot terakhir hanya dipakai saat tiket sudah keluar dari papan
  const detailTicket = liveDetail ?? (detail && lastDetailRef.current?.ticketNo === detail ? lastDetailRef.current : null);
  const detailGone = Boolean(detail && !liveDetail && detailTicket);
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
    const readyVisible = showReadyPanel || mobileTab === "ready";
    if (readyTab !== "done" || !readyVisible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch saat tab Selesai dibuka
    void loadDone();
  }, [readyTab, showReadyPanel, mobileTab, loadDone, board?.generatedAt]);

  // Catat kolom tiap tiket SETELAH render, supaya sorotan "baru" hanya muncul sekali per perpindahan.
  useEffect(() => {
    const next = new Map<string, string>();
    for (const t of columns.waiting) next.set(t.ticketNo, "waiting");
    for (const t of columns.processing) next.set(t.ticketNo, "processing");
    for (const t of [...columns.ready, ...columns.readyEarlier]) next.set(t.ticketNo, "ready");
    const prev = seenRef.current;
    const moved = new Set<string>();
    // Muat pertama (prev kosong) tidak disorot: semua kartu "baru" sekaligus hanya jadi kebisingan.
    if (prev.size) for (const [no, column] of next) if (prev.get(no) !== column) moved.add(no);
    if (!next.size) next.set("__init", "init");
    seenRef.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sorotan sekali per perpindahan kolom
    setFreshSet((current) => (moved.size || current.size ? moved : current));
  }, [columns]);

  // ---------------------------------------------------------------- actions
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

  function setOverride(ticket: ProductionTicketView, prioritize: boolean, reason: string) {
    return runAction(
      `fifo:${ticket.ticketNo}`,
      () => ticketPost(ticket, { action: prioritize ? "prioritize" : "unprioritize", reason }),
      prioritize ? "Pesanan didahulukan (tercatat di audit)." : "Pesanan kembali ke urutan FIFO.",
    );
  }
  // ---------------------------------------------------------------- pieces
  const clock = new Date(now).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const areaSelect = (
    <SelectBox
      label="Area"
      value={area}
      onChange={(v) => setArea(v)}
      options={[
        { value: "all", label: "Semua" },
        { value: "Bar", label: "Bar" },
        { value: "Food", label: "Dapur" },
      ]}
    />
  );
  // V7 header: status sinkron berlabel (bukan hanya warna).
  const syncTone =
    sync.state === "connected" ? "border-[var(--phv4-success)]/60 text-[var(--phv4-success)]" : sync.state === "offline" ? "border-[var(--phv4-critical)] bg-[var(--phv4-critical)]/15 text-[#fecaca]" : "border-[var(--phv4-sync)] bg-[var(--phv4-sync)]/12 text-[var(--phv4-sync)]";
  const syncChip = (
    <span role="status" aria-live="polite" className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12px] font-bold ${syncTone}`}>
      {sync.state === "offline" ? <WifiOff className="size-3.5" aria-hidden /> : <span className={`size-2 rounded-full ${sync.state === "connected" ? "bg-[var(--phv4-success)]" : "bg-[var(--phv4-sync)]"}`} aria-hidden />}
      {sync.label}
      <span className="phv4-mono hidden text-[12px] font-semibold text-[var(--phv4-muted)] sm:inline">{clock}</span>
    </span>
  );
  const stationLoads = (board?.load ?? []).filter((l) => inArea(l.station));
  const stationLoadText = stationLoads.map((l) => String(l.waiting + l.processing)).join(" · ");
  const stationLoadLabel = `Beban ${stationLoads.map((l) => stationName(l.station)).join(" · ") || "stasiun"}`;
  const kpiCells: Array<{ key: string; label: string; value: string; hint?: string; tone: string; icon: typeof Clock; onClick?: () => void }> = [
    { key: "waiting", label: "Menunggu", value: String(kpi.waiting), tone: "text-[var(--phv4-wait)]", icon: Clock, onClick: () => setMobileColumn("waiting") },
    { key: "processing", label: "Diproses", value: String(kpi.processing), tone: "text-[var(--phv4-process)]", icon: ChefHat, onClick: () => setMobileColumn("processing") },
    { key: "ready", label: "Siap", value: String(kpi.ready), tone: "text-[var(--phv4-success)]", icon: Bike, onClick: () => (!isDesktop ? setMobileTab("ready") : undefined) },
    { key: "overdue", label: "Lewat target", value: String(kpi.overdue), tone: kpi.overdue ? "text-[var(--phv4-overdue)]" : "text-white", icon: AlertTriangle, onClick: () => setSheet("insight") },
    {
      key: "oldest",
      label: "Tunggu terlama",
      value: kpi.oldestWaitingMinutes === null ? "—" : `${kpi.oldestWaitingMinutes} mnt`,
      hint: kpi.oldestWaitingMinutes === null ? "tidak ada antrean" : undefined,
      tone: "text-white",
      icon: Clock,
    },
    {
      key: "batch",
      label: "Batch aktif",
      value: String(kpi.activeBatches),
      hint: kpi.batchSuggestions ? `${kpi.batchSuggestions} peluang` : undefined,
      tone: "text-[var(--phv4-batch)]",
      icon: Layers,
      onClick: () => (isDesktop ? setView("batch") : setMobileTab("batch")),
    },
    { key: "load", label: stationLoadLabel, value: stationLoadText || "—", hint: "tiket aktif", tone: "text-white", icon: Gauge },
    {
      key: "sync",
      label: "Sinkron",
      value: sync.state === "connected" ? "Baik" : sync.state === "offline" ? "Terputus" : "Tertunda",
      hint: sync.ageSeconds === null ? "belum pernah" : `${sync.ageSeconds} dtk lalu`,
      tone: sync.state === "connected" ? "text-[var(--phv4-success)]" : sync.state === "offline" ? "text-[var(--phv4-critical)]" : "text-[var(--phv4-sync)]",
      icon: RefreshCw,
      onClick: () => void load(),
    },
  ];
  const kpiStrip = (
    <ul aria-label="Ringkasan produksi" className="garage-scroll-x flex shrink-0 gap-1.5 overflow-x-auto px-2 py-1.5 md:px-3 [scrollbar-width:none]">
      {kpiCells.map((cell) => {
        const body = (
          <>
            <span className="flex items-center gap-1 text-[12px] font-semibold leading-4 text-[var(--phv4-muted)]">
              <cell.icon className="hidden size-3.5 shrink-0 md:block" aria-hidden /> {cell.label}
            </span>
            <span className={`phv4-mono block truncate text-[18px] font-bold leading-6 ${cell.tone}`}>{cell.value}</span>
            {cell.hint ? <span className="block truncate text-[12px] text-[var(--phv4-muted)]">{cell.hint}</span> : null}
          </>
        );
        const cls = "min-w-[86px] flex-1 rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-bg2)] px-2 py-1.5 text-left md:min-w-[112px] md:px-2.5";
        return (
          <li key={cell.key} className="flex min-w-[86px] flex-1 md:min-w-[112px]">
            {cell.onClick ? (
              <button type="button" onClick={cell.onClick} className={`${cls} hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}>
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
  const busyPills = (["Bar", "Food"] as const)
    .filter((st) => inArea(st) && busyExtra[st] > 0)
    .map((st) => (
      <span
        key={st}
        title={`Antrean ${st === "Bar" ? "Bar" : "Dapur"} ≥ ${slaCfg.busyThreshold} tiket: target tampilan +${busyExtra[st]} menit`}
        className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-[var(--phv4-wait)]/60 bg-[var(--phv4-wait)]/12 px-2 text-[12px] font-bold text-[var(--phv4-wait)]"
      >
        RAMAI {st === "Bar" ? "BAR" : "DAPUR"} +{busyExtra[st]} mnt
      </span>
    ));
  const indicatorButton = (
    <button
      type="button"
      onClick={() => setSheet("insight")}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold hover:bg-white/5 ${urgentIndicators ? "border-[var(--phv4-wait)] text-[var(--phv4-wait)]" : "border-[var(--phv4-border)]"}`}
      aria-label={`Indikator produksi, ${indicators.length} catatan, ${urgentIndicators} perlu perhatian`}
    >
      <Lightbulb className="size-4" aria-hidden /> <span className="hidden sm:inline">Indikator</span>
      <span className="phv4-mono rounded bg-white/10 px-1 text-[12px]">{urgentIndicators || indicators.length}</span>
    </button>
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
          {soundLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void runTestSound()}>
          <Volume2 className="mr-2 size-4" /> Tes suara
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
      slaCfg={slaCfg}
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

  // Kartu memakai waktu kasar (5 dtk) untuk SLA; timer detik berdetak sendiri di kartu (audit P2).
  const cardNow = coarseNow;
  const renderCard = (ticket: ProductionTicketView) => {
    return (
      <OrderCard
        key={ticket.ticketNo}
        ticket={ticket}
        now={cardNow}
        maxLines={6}
        busy={busyKey?.endsWith(`:${ticket.ticketNo}`) ?? false}
        canOperate={canOperate[ticket.station]}
        canHandover={canHandover[ticket.station]}
        sibling={siblingOf(ticket)}
        slaCfg={slaCfg}
        busyExtraMinutes={busyExtra[ticket.station]}
        position={ticket.status === "queue" ? positions.get(ticket.ticketNo) ?? null : null}
        positionLabel={area === "all" ? (ticket.station === "Bar" ? "BAR" : "DAPUR") : "URUTAN"}
        selected={detail === ticket.ticketNo}
        fresh={freshSet.has(ticket.ticketNo)}
        onAction={onAction}
        onOpen={onOpen}
      />
    );
  };
  const columnDefs = [
    { id: "waiting" as const, label: "MENUNGGU", hint: "urut FIFO — yang masuk dulu, dikerjakan dulu", list: columns.waiting, accent: "bg-[var(--phv4-wait)]", empty: "Tidak ada pesanan menunggu." },
    { id: "processing" as const, label: "DIPROSES", hint: "sedang dibuat", list: columns.processing, accent: "bg-[var(--phv4-process)]", empty: "Belum ada pesanan yang diproses." },
  ];
  const columnBody = (def: (typeof columnDefs)[number]) =>
    def.list.length ? (
      <div className="phv7-col-grid grid content-start gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 250px), 1fr))" }}>
        {def.list.map((ticket) => renderCard(ticket))}
      </div>
    ) : (
      <p className="grid h-full min-h-[120px] place-items-center rounded-[8px] border border-dashed border-[var(--phv4-border)] px-3 text-center text-[13px] text-[var(--phv4-muted)]">
        {q ? `Tidak ada yang cocok dengan "${query.trim()}".` : loadError && !board ? "Data belum bisa dimuat." : def.empty}
      </p>
    );
  // ---------------------------------------------------------------- render
  // Portal ke <body>: hub menutupi shell (chat FAB, widget SOP) tanpa terjebak stacking context induk.
  if (!portalTarget) return null;
  return createPortal(
    <div
      className="phv4 fixed inset-0 z-[45] flex flex-col overflow-hidden"
      aria-label="Production Hub"
      style={prefs.zoom !== "100" ? { zoom: Number(prefs.zoom) / 100 } : undefined}
    >
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
        <h1 className="hidden text-[13px] font-bold tracking-wide text-white lg:block">
          {view === "batch" && isDesktop ? "BATCH PRODUKSI" : "PRODUCTION"}
          <span className="ml-1.5 font-semibold text-[var(--phv4-muted)]">· {area === "all" ? "BAR + DAPUR" : area === "Bar" ? "BAR" : "DAPUR"}</span>
        </h1>
        {syncChip}
        {isDesktop ? (
          <>
            {areaSelect}
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">{busyPills}</div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-pressed={view === "batch"}
                onClick={() => setView((v) => (v === "batch" ? "produksi" : "batch"))}
                className={`${toolButton} border-[var(--phv4-red)]/60 ${view === "batch" ? "bg-[var(--phv4-red)] text-white hover:bg-[var(--phv4-red-hover)]" : ""}`}
              >
                <Layers className="size-4 text-[var(--phv4-red)]" /> BATCH
                {batchCount ? <span className="phv4-mono rounded bg-[var(--phv4-red)] px-1 text-[12px] text-white">{batchCount}</span> : null}
              </button>
              <button type="button" onClick={() => setSheet("printer")} className={toolButton} aria-label="Printer">
                <Printer className="size-4" />
                <span className="hidden xl:inline">PRINTER</span>
                <span className={`size-2 rounded-full ${printerTone}`} />
                {failedJobs ? <span className="phv4-mono text-[12px] text-[#fca5a5]">{failedJobs}</span> : null}
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

      {/* Data basi / gagal sinkron: selalu diberi tahu — antrean lama tidak pernah tampil seolah-olah baru. */}
      {sync.stale && board ? (
        <p role="alert" className={`flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[13px] font-bold ${sync.state === "offline" ? "border-[var(--phv4-critical)] bg-[var(--phv4-critical)]/20 text-[#fecaca]" : "border-[var(--phv4-sync)] bg-[var(--phv4-sync)]/15 text-[var(--phv4-sync)]"}`}>
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {sync.state === "offline" ? "KONEKSI TERPUTUS" : "MENYAMBUNG ULANG"} — data terakhir pukul{" "}
            <span className="phv4-mono">{new Date(board.generatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>, bisa sudah berubah. Pesanan di layar tetap
            ditampilkan; aksi baru belum bisa disimpan sampai tersambung lagi.
          </span>
          <button type="button" onClick={() => void load()} className="h-9 shrink-0 rounded-md border border-current px-2.5 text-[12px] font-bold">
            Coba lagi
          </button>
        </p>
      ) : null}
      {board?.truncated ? (
        <p role="alert" className="shrink-0 border-b border-[var(--phv4-critical)] bg-[var(--phv4-critical)]/15 px-3 py-1.5 text-[13px] font-bold text-[#fecaca]">
          Hanya {board.truncated.shown} dari {board.truncated.total} tiket aktif yang dimuat (yang terlama lebih dulu). Tutup pesanan Siap yang sudah diterima pelanggan.
        </p>
      ) : null}

      {/* Toolbar ringkas */}
      {(isDesktop && view === "produksi") || (!isDesktop && mobileTab === "produksi") ? (
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 md:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {!isDesktop ? (
              <Segmented
                label="Kolom"
                value={mobileColumn}
                onChange={setMobileColumn}
                options={[
                  { value: "waiting", label: "Menunggu", count: columns.waiting.length },
                  { value: "processing", label: "Diproses", count: columns.processing.length },
                ]}
              />
            ) : null}
            {!isDesktop ? indicatorButton : null}
            {!isDesktop ? areaSelect : null}
            <label className={`flex h-8 min-w-[150px] max-w-[280px] flex-1 items-center gap-1.5 rounded-md border px-2 ${q ? "border-white bg-white/10" : "border-[var(--phv4-border)] bg-[var(--phv4-bg)]"}`}>
              <Search className="size-3.5 shrink-0 text-[var(--phv4-muted)]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari order / meja / antrean…"
                aria-label="Cari order, meja, atau nomor antrean"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </label>
            {q ? (
              <button type="button" onClick={() => setQuery("")} className="h-8 shrink-0 rounded-md border border-white px-2 text-[12px] font-bold">
                Tampilkan semua ({areaTickets.length})
              </button>
            ) : null}
            {isDesktop ? indicatorButton : null}
            {isDesktop ? (
              <>
                <SelectBox
                  label="Zoom"
                  value={prefs.zoom}
                  onChange={(zoom) => savePrefs({ zoom })}
                  options={[
                    { value: "100" as HubZoom, label: "100%" },
                    { value: "125" as HubZoom, label: "125% (LCD)" },
                    { value: "150" as HubZoom, label: "150% (TV)" },
                  ]}
                />
                <button type="button" onClick={() => setSheet("history")} className={toolButton}>
                  <History className="size-4" aria-hidden /> Riwayat
                </button>
                <div className="hidden xl:flex">{toolsRow}</div>
              </>
            ) : null}
          </div>
          <span className="hidden shrink-0 text-[12px] font-semibold text-[var(--phv4-muted)] lg:inline">Urut FIFO · tanpa halaman</span>
        </div>
      ) : null}

      {(isDesktop && view === "produksi") || (!isDesktop && mobileTab === "produksi") ? kpiStrip : null}

      {/* Isi utama */}
      {isDesktop && view === "batch" ? (
        <div className="flex min-h-0 flex-1">{batchView}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
            {/* Toast HP: strip di alur konten (mendorong daftar, tidak menutupi kartu). */}
            {toast && !isDesktop ? (
              <p
                role="status"
                className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${
                  toast.tone === "error" ? "border-[var(--phv4-critical)] bg-[#2a1215] text-[#fecaca]" : "border-[var(--phv4-success)]/60 bg-[#0f2418] text-[#bbf7d0]"
                }`}
              >
                {toast.text}
              </p>
            ) : null}
            {cancelledStrip}
            {!board ? (
              <div role={loadError ? "alert" : "status"} className="grid flex-1 place-items-center px-4 text-center text-[14px] text-[var(--phv4-muted)]">
                {loadError ? (
                  <span>
                    <b className="block text-white">Papan produksi belum bisa dimuat.</b>
                    {loadError} — antrean BELUM diketahui (bukan kosong).
                    <button type="button" onClick={() => void load()} className="mx-auto mt-3 block h-11 rounded-md bg-[var(--phv4-red)] px-4 text-[13px] font-bold text-white">
                      Coba lagi
                    </button>
                  </span>
                ) : (
                  "Memuat papan produksi…"
                )}
              </div>
            ) : isDesktop ? (
              <div className="flex min-h-0 flex-1 gap-2">
                {columnDefs.map((def) => (
                  <section key={def.id} aria-label={`Kolom ${def.label}`} className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--phv4-border)] bg-[var(--phv4-bg2)] ${def.id === "waiting" ? "flex-[1.25]" : "flex-1"}`}>
                    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--phv4-border)] px-3">
                      <span className={`h-4 w-1.5 rounded-full ${def.accent}`} aria-hidden />
                      <h2 className="text-[14px] font-bold tracking-wide">{def.label}</h2>
                      <span className="phv4-mono rounded bg-white/10 px-1.5 text-[13px] font-bold">{def.list.length}</span>
                      <span className="ml-auto hidden truncate text-[12px] text-[var(--phv4-muted)] xl:inline">{def.hint}</span>
                    </header>
                    <div className="garage-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{columnBody(def)}</div>
                  </section>
                ))}
              </div>
            ) : mobileTab === "produksi" ? (
              <div className="garage-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                {columnBody(columnDefs.find((def) => def.id === mobileColumn) ?? columnDefs[0])}
              </div>
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
                          {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} {soundLabel}
                        </button>
                        <button type="button" onClick={() => void runTestSound()} className={toolButton}>
                          <Volume2 className="size-4" /> Tes suara
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
            <aside aria-label="Kolom Siap Antar" className="my-2 mr-2 flex w-[290px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-[var(--phv4-border)] bg-[var(--phv4-bg2)] lg:w-[320px] min-[1600px]:w-[360px]">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--phv4-border)] px-3">
                <span className="h-4 w-1.5 rounded-full bg-[var(--phv4-success)]" aria-hidden />
                <h2 className="text-[14px] font-bold tracking-wide">SIAP</h2>
                <span className="phv4-mono rounded bg-white/10 px-1.5 text-[13px] font-bold">{readyTickets.length}</span>
                {readyStale ? (
                  <span className="ml-auto flex items-center gap-1 rounded bg-[var(--phv4-critical)]/20 px-1.5 text-[12px] font-bold text-[#fecaca]">
                    <Bike className="size-3.5" aria-hidden /> {readyStale} &gt; 2 mnt
                  </span>
                ) : null}
              </div>
              {columns.readyEarlier.length ? (
                <p className="shrink-0 border-b border-[var(--phv4-border)] bg-[var(--phv4-wait)]/10 px-3 py-1 text-[12px] font-semibold text-[var(--phv4-wait)]">
                  {columns.readyEarlier.length} dari hari sebelumnya belum ditutup — tetap ada di daftar ini.
                </p>
              ) : null}
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
            {printer.enabled && printer.printerReady === false ? (
              <span className="font-semibold text-[#fca5a5]">printer tidak terdeteksi — job dibiarkan untuk perangkat lain</span>
            ) : null}
          </span>
          {printer.notice && now - printer.notice.at < 15_000 ? (
            <span className={`min-w-0 truncate ${printer.notice.tone === "ok" ? "text-[#86efac]" : "text-[#fca5a5]"}`}>{printer.notice.text}</span>
          ) : null}
          {/* Beban per station (fitur layar lama, audit P3): antre, terlama, rata-rata, risiko SLA. */}
          {(board?.load ?? [])
            .filter((l) => inArea(l.station))
            .map((l) => (
              <span key={l.station} className="flex shrink-0 items-center gap-1.5 text-[var(--phv4-muted)]">
                <span className="font-bold text-white">{l.station === "Bar" ? "BAR" : "DAPUR"}</span>
                antre <span className="phv4-mono text-white">{l.waiting}</span>
                · terlama <span className="phv4-mono text-white">{l.oldestWaitingMinutes != null ? `${l.oldestWaitingMinutes}m` : "-"}</span>
                · rata <span className="phv4-mono text-white">{l.avgProductionMinutes != null ? `${l.avgProductionMinutes}m` : "-"}</span>
                {l.slaRisk ? <span className="font-bold text-[#fca5a5]">· risiko {l.slaRisk}</span> : null}
              </span>
            ))}
          <span className="ml-auto hidden shrink-0 min-[1600px]:flex items-center gap-2 text-[var(--phv4-muted)]">
            SLA:
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--phv4-success)]" />aman</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--phv4-wait)]" />mendekati target / belum dimulai</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--phv4-critical)]" />lewat target (urutan tetap FIFO)</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center min-[1600px]:ml-0 gap-1.5 text-[var(--phv4-muted)]">
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
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${
                mobileTab === id ? "text-white" : "text-[var(--phv4-muted)]"
              }`}
            >
              {mobileTab === id ? <span className="absolute inset-x-3 top-0 h-0.5 rounded bg-[var(--phv4-red)]" /> : null}
              <Icon className="size-5" />
              {label}
              {badge ? (
                <span className="phv4-mono absolute right-[18%] top-1.5 min-w-4 rounded-full bg-[var(--phv4-red)] px-1 text-[12px] text-white">
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
      {/* Panel detail dirender PALING AWAL: lembar lain (pilih waiter, indikator, riwayat, printer) yang dibuka saat
          panel ini terbuka selalu tampil DI ATASNYA — tidak pernah tertutup olehnya. */}
      <HubSheet
        open={Boolean(detailTicket)}
        onClose={() => setDetail(null)}
        title={detailTicket ? `Detail · ${tableText(detailTicket.table)} · #${detailTicket.orderNo ?? detailTicket.ticketNo}` : "Detail"}
        icon={LayoutGrid}
        modal={false}
        tall
        width="md:w-[min(540px,58vw)]"
        footer={
          detailTicket ? (
            <OrderDetailFooter
              key={detailTicket.ticketNo}
              ticket={detailTicket}
              canOperate={canOperate[detailTicket.station]}
              canHandover={canHandover[detailTicket.station]}
              gone={detailGone}
              offline={sync.state === "offline"}
              busy={Boolean(busyKey)}
              onAction={onAction}
              override={{ can: Boolean(board?.canOverrideFifo), onSet: (prioritize, reason) => setOverride(detailTicket, prioritize, reason) }}
            />
          ) : null
        }
      >
        {detailTicket ? (
          <OrderDetail
            key={detailTicket.ticketNo}
            ticket={detailTicket}
            siblings={detailTicket.orderId ? siblings.get(detailTicket.orderId) ?? [detailTicket] : [detailTicket]}
            jobs={jobs.filter((j) => j.orderId && j.orderId === detailTicket.orderId)}
            canOperate={canOperate}
            now={coarseNow}
            position={detailTicket.status === "queue" ? positions.get(detailTicket.ticketNo) ?? null : null}
            progress={orderProgress(detailTicket.orderId ? siblings.get(detailTicket.orderId) ?? [detailTicket] : [detailTicket])}
            gone={detailGone}
            onOpenBatch={() => {
              setDetail(null);
              if (isDesktop) setView("batch");
              else setMobileTab("batch");
            }}
            reopenBusy={Boolean(busyKey?.startsWith("reopen:"))}
            onReopen={reopen}
            cancel={{
              canRequest: canWrite && (canOperate.Bar || canOperate.Food || canHandover.Bar || canHandover.Food),
              isManager: me.role === "Owner" || me.role === "Manajer",
              busy: Boolean(busyKey?.startsWith("cancel-req:")),
              onSubmit: (body) =>
                runAction(
                  `cancel-req:${body.orderId}`,
                  () => garageApi.post("/api/production/cancel-requests", body),
                  me.role === "Owner" || me.role === "Manajer"
                    ? "Pembatalan dieksekusi."
                    : "Pengajuan batal terkirim — menunggu persetujuan Owner/Manajer.",
                ),
            }}
          />
        ) : null}
      </HubSheet>

      <HubSheet open={sheet === "insight"} onClose={() => setSheet(null)} title="Indikator produksi" icon={Lightbulb} width="md:w-[min(520px,100vw)]">
        {indicators.length ? (
          <ul className="space-y-2">
            {indicators.map((item) => (
              <li key={item.code} className={`rounded-[8px] border p-3 ${INDICATOR_TONE[item.level]}`}>
                <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-bold text-white">
                  {item.level !== "info" ? <AlertTriangle className="size-4 shrink-0 text-[var(--phv4-wait)]" aria-hidden /> : null}
                  <span className="min-w-0 flex-1 break-words">{item.title}</span>
                  <span className="shrink-0 rounded border border-[var(--phv4-border)] px-1.5 text-[12px] font-semibold text-[var(--phv4-muted)]">{INDICATOR_KIND[item.kind]}</span>
                </p>
                <p className="mt-1 break-words text-[13px] text-[var(--phv4-muted)]">
                  <b className="text-white">Kenapa:</b> {item.why}
                </p>
                <p className="mt-1 break-words text-[13px] text-[var(--phv4-muted)]">
                  <b className="text-white">Tindakan:</b> {item.action}
                </p>
                {item.ticketNos.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      if (!isDesktop) setMobileTab("produksi");
                      setDetail(item.ticketNos[0]);
                    }}
                    className="mt-2 h-10 rounded-md border border-[var(--phv4-border)] px-3 text-[13px] font-bold hover:bg-white/5"
                  >
                    Buka pesanan{item.ticketNos.length > 1 ? ` pertama (dari ${item.ticketNos.length})` : ""}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[8px] border border-dashed border-[var(--phv4-border)] p-4 text-center text-[13px] text-[var(--phv4-muted)]">
            Tidak ada catatan saat ini. Indikator hanya muncul bila didukung data papan.
          </p>
        )}
        <p className="mt-3 text-[12px] text-[var(--phv4-muted)]">
          Fakta = langsung dari data tersimpan. Hitungan = dihitung dari waktu & target di Pengaturan. Saran = usulan tindakan, bukan perintah.
        </p>
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

