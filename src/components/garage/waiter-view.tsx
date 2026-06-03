"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BellRing,
  CheckCircle2,
  ChefHat,
  CircleDot,
  Coffee,
  Loader2,
  RefreshCw,
  ReceiptText,
  ArrowRightLeft,
  History,
  Settings,
  Sparkles,
  Sparkle,
  Timer,
  UserPlus,
  X,
  Volume2,
  VolumeX,
  Vibrate,
  VibrateOff,
} from "lucide-react";

import type {
  ApiEnvelope,
  GarageMe,
  KitchenOrder,
  TableHistoryResponse,
  TableLiveRow,
} from "@/lib/garage-api-types";
import {
  loadNotifyPrefs,
  notifyOrderReady,
  reducedMotionPreferred,
  requestBrowserNotifyPermission,
  saveNotifyPrefs,
  type WaiterNotifyPrefs,
} from "@/lib/waiter-notify";
import { useGarageToast } from "@/components/garage/garage-toast";

type Props = {
  me: GarageMe;
};

type WaiterBoardTab = "tables" | "orders" | "ready" | "bills" | "more";

const POLL_MS = 6000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Request gagal (${res.status})`);
  }
  return payload.data as T;
}

function stationTone(station: string): string {
  if (station?.toLowerCase().includes("bar")) return "text-[#fbbf24]";
  return "text-[#a7f3d0]";
}

function stationIcon(station: string) {
  if (station?.toLowerCase().includes("bar")) return <Coffee size={14} />;
  return <ChefHat size={14} />;
}

function statusBadge(status: string) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#22c55e]/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#bbf7d0] ring-1 ring-[#22c55e]/40">
        <Sparkle size={10} /> Siap Antar
      </span>
    );
  }
  if (status === "cooking") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8883a]/16 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ffd08a] ring-1 ring-[#e8883a]/40">
        <Loader2 size={10} className="animate-spin" /> Diproses
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/15">
      <CircleDot size={10} /> Antri
    </span>
  );
}

function hasOpenBill(row: TableLiveRow) {
  return (
    (row.openBillCount ?? 0) > 0 ||
    row.status === "pending" ||
    row.status === "accepted" ||
    row.status === "awaiting_payment" ||
    row.status === "ready" ||
    row.status === "mixed"
  );
}

function hasAwaitingPaymentBill(row: TableLiveRow) {
  return (
    row.status === "awaiting_payment" ||
    (row.bills ?? []).some((bill) => bill.status === "awaiting_payment")
  );
}

function isWaiterOperator(role: GarageMe["role"]) {
  return role === "Waiter 1" || role === "Waiter 2";
}

function isPaidOnly(row: TableLiveRow) {
  return (
    (row.openBillCount ?? 0) === 0 &&
    ((row.paidBillCount ?? 0) > 0 || row.status === "paid")
  );
}

function tableTone(row: TableLiveRow) {
  if (row.needsCleaning || row.status === "needs_cleaning") {
    return {
      ring: "ring-[#ef4444]/60",
      bg: "bg-[#ef4444]/12",
      label: "PERLU BERSIH",
      labelColor: "text-[#ffe1e5]",
      dotBg: "bg-[#ef4444]",
      dotRing: "ring-[#ef4444]/40",
    };
  }
  if (isPaidOnly(row)) {
    return {
      ring: "ring-[#22c55e]/55",
      bg: "bg-[#22c55e]/12",
      label: "LUNAS",
      labelColor: "text-[#bbf7d0]",
      dotBg: "bg-[#22c55e]",
      dotRing: "ring-[#22c55e]/40",
    };
  }
  if (row.status === "empty") {
    // Ready state: meja kosong dan belum ada bill sesi aktif.
    return {
      ring: "ring-white/14",
      bg: "bg-[#11100b]",
      label: "READY",
      labelColor: "text-[#d0c5af]",
      dotBg: "bg-[#d0c5af]/70",
      dotRing: "ring-white/15",
    };
  }
  if (row.status === "mixed") {
    // Ada bill lunas + bill aktif belum bayar (skenario teman gabung).
    return {
      ring: "ring-[#a855f7]/55",
      bg: "bg-gradient-to-br from-[#a855f7]/12 to-[#ef4444]/10",
      label: "MIXED",
      labelColor: "text-[#e9d5ff]",
      dotBg: "bg-[#a855f7]",
      dotRing: "ring-[#a855f7]/40",
    };
  }
  if (
    row.status === "pending" ||
    row.status === "accepted" ||
    row.status === "ready"
  ) {
    return {
      ring: "ring-[#e8883a]/55",
      bg: "bg-[#e8883a]/12",
      label: "BELUM BAYAR",
      labelColor: "text-[#ffd08a]",
      dotBg: "bg-[#e8883a]",
      dotRing: "ring-[#e8883a]/40",
    };
  }
  if (row.status === "awaiting_payment") {
    return {
      ring: "ring-[#fbbf24]/60",
      bg: "bg-[#fbbf24]/14",
      label: "TAGIHAN",
      labelColor: "text-[#fde68a]",
      dotBg: "bg-[#fbbf24]",
      dotRing: "ring-[#fbbf24]/40",
    };
  }
  return {
    ring: "ring-white/15",
    bg: "bg-white/[0.04]",
    label: row.status.replace(/_/g, " ").toUpperCase(),
    labelColor: "text-white/70",
    dotBg: "bg-white/40",
    dotRing: "ring-white/15",
  };
}

// Stripe pinggir kartu meja sebagai indikator urgensi: hijau (fresh) ->
// amber (>15m) -> red (>30m). Hanya untuk meja yang sedang aktif/menunggu,
// bukan READY atau PAID yang sudah selesai.
function waitStripe(row: TableLiveRow): string {
  const inactive =
    row.status === "empty" || isPaidOnly(row) || !row.currentOrderId;
  if (inactive) return "";
  const m = row.timerMinutes ?? 0;
  const base =
    "before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-xl";
  if (m >= 30) return `${base} before:bg-[#d11a2a]`;
  if (m >= 15) return `${base} before:bg-[#e8883a]`;
  return `${base} before:bg-[#22c55e]/70`;
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}d lalu`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m lalu`;
}

export function WaiterView({ me }: Props) {
  const toast = useGarageToast();
  const [tickets, setTickets] = useState<KitchenOrder[]>([]);
  const [tables, setTables] = useState<TableLiveRow[]>([]);
  const canRequestBillRole = isWaiterOperator(me.role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [actingTicket, setActingTicket] = useState<string | null>(null);
  const [actingTable, setActingTable] = useState<string | null>(null);
  const [actingBillTable, setActingBillTable] = useState<string | null>(null);
  const [actingSeatTable, setActingSeatTable] = useState<string | null>(null);
  const [detailTable, setDetailTable] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<
    "all" | "unpaid" | "paid" | "mixed" | "needs_clean" | "ready"
  >("all");
  const [activeBoard, setActiveBoard] = useState<WaiterBoardTab>("tables");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Lazy initial state - baca localStorage 1x saat mount, tanpa effect.
  const [prefs, setPrefs] = useState<WaiterNotifyPrefs>(() => loadNotifyPrefs());
  const [clock, setClock] = useState(() => new Date());
  const [recentlyCleaned, setRecentlyCleaned] = useState<Set<string>>(new Set());
  // Track ticket id -> previous status, dipakai utk deteksi transisi ke "ready".
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  // Skip notif pertama kali load (waiter baru buka tab, semua ticket "baru" buat dia).
  const hasInitialLoadRef = useRef(false);
  const prefsRef = useRef(prefs);

  // Sync ref tiap prefs berubah (di effect, bukan saat render).
  useEffect(() => {
    prefsRef.current = prefs;
    saveNotifyPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tk, tb] = await Promise.all([
        fetchJson<KitchenOrder[]>("/api/waiter/tickets"),
        fetchJson<TableLiveRow[]>("/api/waiter/tables"),
      ]);
      setError(null);
      setTickets(tk);
      setTables(tb);
      setLastSyncedAt(new Date());

      // Deteksi transisi ke "ready" sejak poll terakhir.
      const next = new Map<string, string>();
      const newlyReady: KitchenOrder[] = [];
      for (const t of tk) {
        const prev = prevStatusRef.current.get(t.id);
        if (hasInitialLoadRef.current && prev && prev !== "ready" && t.status === "ready") {
          newlyReady.push(t);
        }
        next.set(t.id, t.status);
      }
      prevStatusRef.current = next;
      hasInitialLoadRef.current = true;

      for (const t of newlyReady) {
        const title = `Order siap antar - Meja ${t.table}`;
        const body = `${t.items.length} item - ${t.station}`;
        notifyOrderReady(prefsRef.current, title, body);
        toast.push({ tone: "success", title, body, ttl: 5200 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal sinkron data waiter.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  // Polling - fetch eksternal yang memang harus update state. Rule
  // set-state-in-effect false-positive untuk subscribe pattern seperti ini.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll(false);
    const id = window.setInterval(() => {
      void loadAll(true);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadAll]);

  const handleDeliver = useCallback(
    async (ticket: KitchenOrder) => {
      setActingTicket(ticket.id);
      try {
        await fetchJson(`/api/waiter/tickets/${encodeURIComponent(ticket.id)}/deliver`, {
          method: "POST",
        });
        toast.push({
          tone: "success",
          title: `Diantar - Meja ${ticket.table}`,
          body: "Ticket ditandai delivered.",
          ttl: 2400,
        });
        await loadAll(true);
      } catch (err) {
        toast.push({
          tone: "error",
          title: "Gagal antar",
          body: err instanceof Error ? err.message : "Coba lagi.",
        });
      } finally {
        setActingTicket(null);
      }
    },
    [loadAll, toast],
  );

  const handleClean = useCallback(
    async (row: TableLiveRow) => {
      setActingTable(row.tableNumber);
      try {
        await fetchJson(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/clean`, {
          method: "POST",
        });
        toast.push({
          tone: "success",
          title: `Meja ${row.tableLabel} READY`,
          body: "Meja siap menerima tamu baru.",
          ttl: 2400,
        });
        if (!reducedMotionPreferred()) {
          setRecentlyCleaned((prev) => {
            const next = new Set(prev);
            next.add(row.tableNumber);
            return next;
          });
          window.setTimeout(() => {
            setRecentlyCleaned((prev) => {
              const next = new Set(prev);
              next.delete(row.tableNumber);
              return next;
            });
          }, 1400);
        }
        await loadAll(true);
      } catch (err) {
        toast.push({
          tone: "error",
          title: "Gagal tandai bersih",
          body: err instanceof Error ? err.message : "Coba lagi.",
        });
      } finally {
        setActingTable(null);
      }
    },
    [loadAll, toast],
  );

  // Skenario "teman datang setelah meja bayar": tutup sesi lama (sudah lunas)
  // dan langsung tandai meja siap pakai tanpa harus jadi NEEDS CLEAR dulu.
  // Backend /clean sudah mengizinkan transisi dari status paid ke empty.
  const handleSeatNew = useCallback(
    async (row: TableLiveRow) => {
      setActingSeatTable(row.tableNumber);
      try {
        await fetchJson(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/seat-next`, {
          method: "POST",
        });
        toast.push({
          tone: "success",
          title: `Meja ${row.tableLabel} siap tamu baru`,
          body: "Bill lunas disimpan. Order baru akan muncul sebagai MIXED bersama bill lama.",
          ttl: 3200,
        });
        if (!reducedMotionPreferred()) {
          setRecentlyCleaned((prev) => {
            const next = new Set(prev);
            next.add(row.tableNumber);
            return next;
          });
          window.setTimeout(() => {
            setRecentlyCleaned((prev) => {
              const next = new Set(prev);
              next.delete(row.tableNumber);
              return next;
            });
          }, 1400);
        }
        await loadAll(true);
      } catch (err) {
        toast.push({
          tone: "error",
          title: "Gagal buka sesi baru",
          body: err instanceof Error ? err.message : "Coba lagi.",
        });
      } finally {
        setActingSeatTable(null);
      }
    },
    [loadAll, toast],
  );

  const handleRequestBill = useCallback(
    async (row: TableLiveRow) => {
      setActingBillTable(row.tableNumber);
      try {
        await fetchJson(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/bill`, {
          method: "POST",
        });
        toast.push({
          tone: "success",
          title: `Bill diminta - ${row.tableLabel}`,
          body: "Kasir bisa lanjutkan pembayaran meja ini.",
          ttl: 2600,
        });
        await loadAll(true);
      } catch (err) {
        toast.push({
          tone: "error",
          title: "Gagal request bill",
          body: err instanceof Error ? err.message : "Coba lagi.",
        });
      } finally {
        setActingBillTable(null);
      }
    },
    [loadAll, toast],
  );

  const ready = useMemo(() => tickets.filter((t) => t.status === "ready"), [tickets]);
  const upcoming = useMemo(
    () => tickets.filter((t) => t.status !== "ready"),
    [tickets],
  );
  const tablesNeedingCleaning = useMemo(
    () =>
      tables.filter(
        (t) => t.needsCleaning || t.status === "needs_cleaning",
      ),
    [tables],
  );
  const readyTables = useMemo(
    () => tables.filter((t) => t.status === "empty" && !t.needsCleaning).length,
    [tables],
  );
  const billRequests = useMemo(
    () => tables.filter((t) => hasAwaitingPaymentBill(t)).length,
    [tables],
  );
  const activeTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          t.status !== "empty" ||
          t.needsCleaning ||
          Boolean(t.currentOrderId) ||
          (t.openBillCount ?? 0) > 0 ||
          (t.paidBillCount ?? 0) > 0,
      ).length,
    [tables],
  );
  // Bucket tiap meja ke salah satu kategori filter. Tujuannya: walau kartu
  // meja tampil "merah" (NEEDS CLEAR) karena perlu bussing, kalau masih ada
  // open bill belum dibayar maka tetap masuk bucket "unpaid" supaya staff bisa
  // cari yang belum bayar tanpa harus tebak dari warna kartu saja.
  const tableBuckets = useMemo(() => {
    const buckets = {
      all: tables.length,
      unpaid: 0,
      paid: 0,
      mixed: 0,
      needs_clean: 0,
      ready: 0,
    };
    for (const t of tables) {
      const open = hasOpenBill(t) ? Math.max(1, t.openBillCount ?? 0) : 0;
      const paid = t.paidBillCount ?? 0;
      const needsClean = t.needsCleaning || t.status === "needs_cleaning";
      if (open > 0 && paid > 0) buckets.mixed += 1;
      if (open > 0) buckets.unpaid += 1;
      if (isPaidOnly(t)) buckets.paid += 1;
      if (needsClean) buckets.needs_clean += 1;
      if (t.status === "empty" && !needsClean) buckets.ready += 1;
    }
    return buckets;
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (tableFilter === "all") return tables;
    return tables.filter((t) => {
      const open = hasOpenBill(t) ? Math.max(1, t.openBillCount ?? 0) : 0;
      const paid = t.paidBillCount ?? 0;
      const needsClean = t.needsCleaning || t.status === "needs_cleaning";
      switch (tableFilter) {
        case "unpaid":
          return open > 0;
        case "paid":
          return isPaidOnly(t);
        case "mixed":
          return open > 0 && paid > 0;
        case "needs_clean":
          return needsClean;
        case "ready":
          return t.status === "empty" && !needsClean;
        default:
          return true;
      }
    });
  }, [tables, tableFilter]);

  // Meja dengan bill open paling lama untuk peringatan urgensi di header.
  const stalest = useMemo(() => {
    let best: TableLiveRow | null = null;
    for (const row of tables) {
      const hasOpen = (row.openBillCount ?? 0) > 0 || row.status === "accepted" || row.status === "ready" || row.status === "mixed" || row.status === "awaiting_payment";
      if (!hasOpen) continue;
      if (!best || row.timerMinutes > best.timerMinutes) best = row;
    }
    return best;
  }, [tables]);

  const urgentTables = useMemo(
    () =>
      tables
        .filter(
          (t) =>
            t.needsCleaning ||
            t.status === "needs_cleaning" ||
            hasAwaitingPaymentBill(t) ||
            t.timerMinutes >= 15,
        )
        .sort((a, b) => {
          const score = (row: TableLiveRow) =>
            (hasAwaitingPaymentBill(row) ? 40 : 0) +
            (row.needsCleaning || row.status === "needs_cleaning" ? 30 : 0) +
            row.timerMinutes;
          return score(b) - score(a);
        })
        .slice(0, 4),
    [tables],
  );

  const billedTables = useMemo(
    () =>
      tables
        .filter((t) => hasOpenBill(t) || isPaidOnly(t) || t.status === "mixed")
        .sort((a, b) => {
          const score = (row: TableLiveRow) =>
            (hasAwaitingPaymentBill(row) ? 40 : 0) +
            (hasOpenBill(row) ? 20 : 0) +
            (row.status === "mixed" ? 10 : 0) +
            row.timerMinutes;
          return score(b) - score(a);
        }),
    [tables],
  );

  const handleEnableSound = useCallback(async () => {
    setPrefs((p) => ({ ...p, sound: !p.sound }));
  }, []);
  const handleEnableVibe = useCallback(() => {
    setPrefs((p) => ({ ...p, vibrate: !p.vibrate }));
  }, []);
  const handleEnableNotif = useCallback(async () => {
    const result = await requestBrowserNotifyPermission();
    if (result === "granted") {
      setPrefs((p) => ({ ...p, browserNotif: true }));
      toast.push({ tone: "info", title: "Notifikasi browser aktif" });
    } else if (result === "denied") {
      toast.push({
        tone: "error",
        title: "Notifikasi diblokir browser",
        body: "Buka pengaturan browser untuk mengizinkan.",
      });
      setPrefs((p) => ({ ...p, browserNotif: false }));
    } else if (result === "unsupported") {
      toast.push({ tone: "error", title: "Browser tidak mendukung notifikasi" });
    }
  }, [toast]);

  const detailRow = useMemo(
    () => (detailTable ? tables.find((t) => t.tableNumber === detailTable) ?? null : null),
    [detailTable, tables],
  );

  return (
    <div className="min-h-screen space-y-5 bg-[#080704] px-1 pb-28 pt-2 text-white sm:px-0">
      <div className="sticky top-2 z-20 rounded-lg border border-[#d4af37]/15 bg-[#080704]/92 px-3.5 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-[#080704]/78 sm:px-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#d4af37]/14 text-[#f2ca50] ring-1 ring-[#d4af37]/35">
            <BellRing size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0c5af]/70">
              Waiter Floor Board
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-base font-black leading-tight text-white">
                {me.user.name}
              </p>
              <span className="rounded-sm bg-[#22c55e]/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#bbf7d0] ring-1 ring-[#22c55e]/30">
                Shift aktif
              </span>
              <span className="font-mono text-[11px] text-[#d0c5af]/70">
                {clock.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Stats versi mobile cuma ready & bill kasir bila ada; versi sm+ tampil lengkap */}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#22c55e]/15 px-2.5 py-1 text-[11px] font-semibold text-[#bbf7d0] ring-1 ring-[#22c55e]/35">
              <Sparkles size={12} /> {ready.length}
              <span className="hidden sm:inline">&nbsp;Siap Antar</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/75 ring-1 ring-white/15">
              {readyTables} meja kosong
            </span>
            {billRequests > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fbbf24]/15 px-2.5 py-1 text-[11px] font-semibold text-[#fde68a] ring-1 ring-[#fbbf24]/35">
                <ReceiptText size={12} /> {billRequests}
                <span className="hidden sm:inline">&nbsp;bill kasir</span>
              </span>
            ) : null}
            {stalest && stalest.timerMinutes >= 15 ? (
              <button
                type="button"
                onClick={() => setDetailTable(stalest.tableNumber)}
                title={`Bill terlama di ${stalest.tableLabel} sudah ${stalest.timerMinutes}m`}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition active:scale-[0.97] ${
                  stalest.timerMinutes >= 30
                    ? "bg-[#d11a2a]/18 text-[#ffd6da] ring-[#d11a2a]/40 motion-safe:animate-pulse"
                    : "bg-[#e8883a]/15 text-[#ffd08a] ring-[#e8883a]/35"
                }`}
              >
                <Timer size={12} /> M{stalest.tableNumber} {stalest.timerMinutes}m
              </button>
            ) : null}

            {/* Toggle bar lengkap hanya di sm+; mobile pakai 1 tombol Settings */}
            <button
              type="button"
              onClick={handleEnableSound}
              className={`hidden sm:grid h-9 w-9 place-items-center rounded-md ring-1 transition ${
                prefs.sound
                  ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                  : "bg-white/[0.04] text-white/55 ring-white/12"
              }`}
              aria-label="Toggle suara notifikasi"
              title={prefs.sound ? "Suara: ON" : "Suara: OFF"}
            >
              {prefs.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              type="button"
              onClick={handleEnableVibe}
              className={`hidden sm:grid h-9 w-9 place-items-center rounded-md ring-1 transition ${
                prefs.vibrate
                  ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                  : "bg-white/[0.04] text-white/55 ring-white/12"
              }`}
              aria-label="Toggle getar"
              title={prefs.vibrate ? "Getar: ON" : "Getar: OFF"}
            >
              {prefs.vibrate ? <Vibrate size={16} /> : <VibrateOff size={16} />}
            </button>
            <button
              type="button"
              onClick={handleEnableNotif}
              className={`hidden sm:grid h-9 w-9 place-items-center rounded-md ring-1 transition ${
                prefs.browserNotif
                  ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                  : "bg-white/[0.04] text-white/55 ring-white/12"
              }`}
              aria-label="Toggle notifikasi browser"
              title="Aktifkan notifikasi browser saat tab background"
            >
              <BellRing size={16} />
            </button>

            {/* Mobile-only: 1 tombol untuk buka settings drawer */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`grid h-9 w-9 place-items-center rounded-md ring-1 transition sm:hidden ${
                prefs.sound || prefs.vibrate || prefs.browserNotif
                  ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                  : "bg-white/[0.04] text-white/55 ring-white/12"
              }`}
              aria-label="Pengaturan notifikasi"
              title="Sound / Getar / Notifikasi"
            >
              <Settings size={16} />
            </button>

            <button
              type="button"
              onClick={() => void loadAll(false)}
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-md bg-white/[0.04] text-white/75 ring-1 ring-white/12 transition hover:bg-white/[0.08] disabled:opacity-50"
              aria-label="Refresh data"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </button>
          </div>
        </div>
        {error ? (
          <p className="mt-1 text-[11px] text-[#ffb4ba]">{error}</p>
        ) : lastSyncedAt ? (
          <p className="mt-1 text-[10px] text-white/45">
            Sinkron {lastSyncedAt.toLocaleTimeString("id-ID")}
          </p>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Meja aktif", value: activeTables, cls: "text-[#f2ca50]" },
          { label: "Panggilan", value: urgentTables.length, cls: "text-[#ffb4ab]" },
          { label: "Siap antar", value: ready.length, cls: "text-[#bbf7d0]" },
          { label: "Tagihan", value: billRequests, cls: "text-[#fde68a]" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg bg-[#15120c] px-3 py-3 ring-1 ring-[#d4af37]/12"
          >
            <p className={`font-mono text-xl font-black leading-none ${item.cls}`}>
              {item.value}
            </p>
            <p className="mt-1 text-[10px] font-semibold leading-tight text-[#d0c5af]/70">
              {item.label}
            </p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-5 gap-2 rounded-xl border border-[#d4af37]/12 bg-[#0b0906] p-2">
        {[
          { key: "tables" as const, label: "Meja", icon: <CircleDot size={16} />, count: tables.length },
          { key: "orders" as const, label: "Order", icon: <ChefHat size={16} />, count: upcoming.length },
          { key: "ready" as const, label: "Siap", icon: <Sparkles size={16} />, count: ready.length },
          { key: "bills" as const, label: "Tagihan", icon: <ReceiptText size={16} />, count: billRequests },
          { key: "more" as const, label: "Lainnya", icon: <Settings size={16} />, count: 0 },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setActiveBoard(item.key);
              if (item.key === "more") setSettingsOpen(true);
            }}
            className={`flex h-14 min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold transition active:scale-[0.97] ${
              activeBoard === item.key
                ? "bg-[#d4af37] text-[#241a00]"
                : "text-[#d0c5af]/68 hover:bg-white/[0.05]"
            }`}
            aria-pressed={activeBoard === item.key}
          >
            <span className="relative">
              {item.icon}
              {item.count > 0 && item.key !== "tables" ? (
                <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-sm bg-[#d11a2a] px-1 text-[8px] leading-4 text-white">
                  {item.count}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        ))}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
        {activeBoard === "tables" ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/85">
              Peta Meja
            </h2>
            <p className="text-[11px] text-[#d0c5af]/60">
              {tablesNeedingCleaning.length} perlu bersih - {readyTables} ready
            </p>
          </div>

          {/* Filter chips: bantu staff cek cepat siapa yang sudah/belum
              bayar, terutama untuk meja MIXED & PERLU BERSIH yang masih
              punya open bill. Mobile: horizontal scroll 1 baris. */}
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { key: "all" as const, label: "Semua", count: tableBuckets.all, tone: "neutral" },
              {
                key: "unpaid" as const,
                label: "Belum Bayar",
                count: tableBuckets.unpaid,
                tone: "amber",
              },
              {
                key: "mixed" as const,
                label: "Mixed",
                count: tableBuckets.mixed,
                tone: "red",
              },
              {
                key: "paid" as const,
                label: "Sudah Bayar",
                count: tableBuckets.paid,
                tone: "green",
              },
              {
                key: "needs_clean" as const,
                label: "Perlu Bersih",
                count: tableBuckets.needs_clean,
                tone: "red",
              },
              {
                key: "ready" as const,
                label: "Ready",
                count: tableBuckets.ready,
                tone: "neutral",
              },
            ].map((chip) => {
              const active = tableFilter === chip.key;
              const toneCls = active
                ? chip.tone === "amber"
                  ? "bg-[#e8883a]/20 text-[#ffd08a] ring-[#e8883a]/55"
                  : chip.tone === "red"
                    ? "bg-[#d11a2a]/20 text-[#ffd6da] ring-[#d11a2a]/55"
                    : chip.tone === "green"
                      ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/45"
                      : "bg-white/[0.12] text-white ring-white/30"
                : "bg-white/[0.04] text-white/70 ring-white/12 hover:bg-white/[0.08]";
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setTableFilter(chip.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition active:scale-[0.97] ${toneCls}`}
                  aria-pressed={active}
                >
                  {chip.label}
                  <span className="rounded-full bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/85">
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {tablesNeedingCleaning.length > 0 ? (
            <div className="rounded-lg border border-[#d11a2a]/35 bg-[#d11a2a]/8 px-3 py-2 text-[12px] text-[#ffd6da]">
              Prioritaskan bersihkan {tablesNeedingCleaning.length} meja agar tamu baru bisa duduk.
            </div>
          ) : null}

          {filteredTables.length === 0 ? (
            <EmptyState
              title={`Tidak ada meja di kategori "${tableFilter}"`}
              body="Coba pilih filter lain atau tap Semua."
            />
          ) : null}

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-2.5">
            {filteredTables.map((row) => {
              const tone = tableTone(row);
              const stripe = waitStripe(row);
              const needs = row.needsCleaning || row.status === "needs_cleaning";
              const isReady = row.status === "empty" && !row.needsCleaning;
              const isPaid = isPaidOnly(row);
              const isMixed = row.status === "mixed";
              // Tombol "Tamu Baru" relevan saat ada minimal 1 bill lunas dan
              // tidak ada open bill aktif (PAID atau NEEDS CLEAR pasca-payment).
              const canSeatNext = isPaidOnly(row);
              const billAlreadyRequested = hasAwaitingPaymentBill(row);
              const canRequestBill =
                canRequestBillRole &&
                Boolean(row.currentOrderId) &&
                (row.status === "accepted" || row.status === "ready" || row.status === "mixed") &&
                !billAlreadyRequested;
              const paidBills = row.paidBillCount ?? 0;
              const openBills = row.openBillCount ?? 0;
              const totalBills = paidBills + openBills;
              const glow = recentlyCleaned.has(row.tableNumber);
              return (
                <div
                  key={row.tableNumber}
                  className={`group relative flex min-h-[112px] sm:min-h-[128px] md:min-h-[142px] flex-col overflow-hidden rounded-lg border border-white/5 ${tone.bg} ring-1 ${tone.ring} p-2 sm:p-2.5 transition ${stripe} ${
                    glow ? "motion-safe:animate-[waiterGlow_1300ms_ease-out]" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setDetailTable(row.tableNumber)}
                    className="text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    title="Lihat detail bill meja ini"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] text-[#d0c5af]/55">
                        Meja
                      </span>
                      <span
                        aria-label={tone.label}
                        title={tone.label}
                        className={`h-2 w-2 shrink-0 rounded-full ${tone.dotBg} ring-1 ${tone.dotRing}`}
                      />
                    </div>
                    <span className="mt-0.5 block font-mono text-[28px] sm:text-3xl md:text-4xl font-black leading-none text-white">
                      {row.tableNumber}
                    </span>
                  </button>
                  <div className="mt-1 min-h-[28px] sm:min-h-[40px] flex-1 text-[10px] sm:text-[11px] leading-tight text-white/65">
                    {row.orderNo ? (
                      <span className="block truncate">#{row.orderNo}</span>
                    ) : isReady ? null : (
                      <span className="block text-white/45">-</span>
                    )}
                    {totalBills > 1 || isMixed ? (
                      <span className="block text-[10px] sm:text-[9px] text-[#fde68a]">
                        {totalBills} bill{openBills > 0 ? ` / ${openBills} open` : ""}
                      </span>
                    ) : null}
                    {row.timerMinutes > 0 ? (
                      <span className="block text-[10px] text-white/45">
                        {row.timerMinutes}m
                      </span>
                    ) : null}
                    {row.total > 0 ? (
                      <span className="block truncate font-mono text-[10px] text-[#f2ca50]/80">
                        {formatRupiah(row.total)}
                      </span>
                    ) : null}
                  </div>
                  {needs && canSeatNext ? (
                    // PAID & menunggu bersih: kasih dua pilihan jelas.
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => void handleClean(row)}
                        disabled={actingTable === row.tableNumber}
                        title="Tamu pergi - bersihkan meja untuk tamu berikutnya"
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#22c55e] text-[11px] sm:text-[10px] font-bold uppercase tracking-wide text-[#052e16] transition active:scale-[0.97] disabled:opacity-60"
                      >
                        {actingTable === row.tableNumber ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        <span className="hidden sm:inline">Bersih</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSeatNew(row)}
                        disabled={actingSeatTable === row.tableNumber}
                        title="Teman gabung - buka order baru tanpa menutup history bill lunas"
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#e2e8f0] text-[11px] sm:text-[10px] font-bold uppercase tracking-wide text-[#0b0b0c] transition active:scale-[0.97] disabled:opacity-60"
                      >
                        {actingSeatTable === row.tableNumber ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <UserPlus size={12} />
                        )}
                        <span className="hidden sm:inline">Tamu+</span>
                      </button>
                    </div>
                  ) : needs ? (
                    <button
                      type="button"
                      onClick={() => void handleClean(row)}
                      disabled={actingTable === row.tableNumber}
                      title="Bersihkan meja"
                      className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-[#22c55e] text-[11px] sm:text-[11px] font-bold uppercase tracking-wide text-[#052e16] transition active:scale-[0.97] disabled:opacity-60"
                    >
                      {actingTable === row.tableNumber ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={12} />
                      )}
                      <span className="hidden sm:inline">Bersih</span>
                    </button>
                  ) : isPaid && canSeatNext ? (
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => void handleClean(row)}
                        disabled={actingTable === row.tableNumber}
                        title="Tamu pergi - bersihkan meja"
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#22c55e] text-[11px] sm:text-[10px] font-bold uppercase tracking-wide text-[#052e16] transition active:scale-[0.97] disabled:opacity-60"
                      >
                        {actingTable === row.tableNumber ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        <span className="hidden sm:inline">Bersih</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSeatNew(row)}
                        disabled={actingSeatTable === row.tableNumber}
                        title="Teman gabung - buka order baru, history lunas dipertahankan"
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#e2e8f0] text-[11px] sm:text-[10px] font-bold uppercase tracking-wide text-[#0b0b0c] transition active:scale-[0.97] disabled:opacity-60"
                      >
                        {actingSeatTable === row.tableNumber ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <UserPlus size={12} />
                        )}
                        <span className="hidden sm:inline">Tamu+</span>
                      </button>
                    </div>
                  ) : canRequestBill ? (
                    <button
                      type="button"
                      onClick={() => void handleRequestBill(row)}
                      disabled={actingBillTable === row.tableNumber}
                      title="Minta bill"
                      className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-[#fbbf24] text-[11px] sm:text-[10px] font-bold uppercase tracking-wide text-[#422006] transition active:scale-[0.97] disabled:opacity-60"
                    >
                      {actingBillTable === row.tableNumber ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ReceiptText size={12} />
                      )}
                      <span className="hidden sm:inline">Bill</span>
                    </button>
                  ) : billAlreadyRequested ? (
                    <div
                      title="Menunggu kasir"
                      className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-[#fbbf24]/35 bg-[#fbbf24]/10 text-[11px] sm:text-[10px] font-semibold uppercase tracking-wide text-[#fde68a]"
                    >
                      <ReceiptText size={12} />
                      <span className="hidden sm:inline">Kasir</span>
                    </div>
                  ) : (
                    <div className="mt-1 h-9" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </section>
        ) : activeBoard === "orders" ? (
          <section className="space-y-3 rounded-xl bg-[#15120c] p-3 ring-1 ring-[#d4af37]/12">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/85">
                  Antrian Order
                </h2>
                <p className="text-[11px] text-[#d0c5af]/60">
                  Queue dan cooking untuk awareness floor.
                </p>
              </div>
              <span className="font-mono text-2xl font-black text-[#f2ca50]">
                {upcoming.length}
              </span>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                title="Tidak ada antrian dapur"
                body="Order baru akan muncul otomatis saat kitchen menerima ticket."
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg bg-[#11100b] p-3 ring-1 ring-white/10"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[#d4af37]/12 font-mono text-lg font-black text-[#f2ca50] ring-1 ring-[#d4af37]/28">
                        {t.table}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {statusBadge(t.status)}
                          <span className={`flex items-center gap-1 text-[11px] ${stationTone(t.station)}`}>
                            {stationIcon(t.station)} {t.station}
                          </span>
                          <span className="font-mono text-[10px] text-white/45">#{t.id}</span>
                        </div>
                        <ul className="mt-2 space-y-1 text-[12px] leading-5 text-white/78">
                          {t.items.slice(0, 4).map((item, idx) => (
                            <li key={`${t.id}-${idx}`} className="truncate">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : activeBoard === "ready" ? (
          <section className="space-y-3 rounded-xl bg-[#15120c] p-3 ring-1 ring-[#22c55e]/25">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/85">
                  Siap Antar
                </h2>
                <p className="text-[11px] text-[#d0c5af]/60">
                  Ticket ready dari Bar dan Food.
                </p>
              </div>
              <span className="font-mono text-2xl font-black text-[#bbf7d0]">
                {ready.length}
              </span>
            </div>
            {ready.length === 0 ? (
              <EmptyState
                title="Belum ada order siap antar"
                body="Notifikasi akan aktif saat kitchen menandai ticket ready."
              />
            ) : (
              <ul className="space-y-2">
                {ready.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg bg-[#0f140d] p-3 ring-1 ring-[#22c55e]/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[#22c55e]/14 font-mono text-2xl font-black text-[#bbf7d0] ring-1 ring-[#22c55e]/35">
                        {t.table}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {statusBadge(t.status)}
                          <span className={`flex items-center gap-1 text-[11px] ${stationTone(t.station)}`}>
                            {stationIcon(t.station)} {t.station}
                          </span>
                          <span className="font-mono text-[10px] text-white/45">#{t.id}</span>
                        </div>
                        <ul className="mt-2 space-y-1 text-[12px] leading-5 text-white/82">
                          {t.items.slice(0, 5).map((item, idx) => (
                            <li key={`${t.id}-${idx}`} className="truncate">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeliver(t)}
                      disabled={actingTicket === t.id}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#22c55e] text-[12px] font-black uppercase tracking-wide text-[#052e16] transition active:scale-[0.98] disabled:opacity-60"
                    >
                      {actingTicket === t.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={15} />
                      )}
                      Antar ke Meja {t.table}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : activeBoard === "bills" ? (
          <section className="space-y-3 rounded-xl bg-[#15120c] p-3 ring-1 ring-[#fbbf24]/25">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/85">
                  Tagihan Meja
                </h2>
                <p className="text-[11px] text-[#d0c5af]/60">
                  Handoff kasir: waiter hanya request bill dan pantau status.
                </p>
              </div>
              <span className="font-mono text-2xl font-black text-[#fde68a]">
                {billRequests}
              </span>
            </div>
            {billedTables.length === 0 ? (
              <EmptyState title="Belum ada tagihan" body="Meja aktif akan tampil di sini saat ada bill." />
            ) : (
              <ul className="space-y-2">
                {billedTables.map((row) => {
                  const tone = tableTone(row);
                  const open = row.openBillCount ?? 0;
                  const paid = row.paidBillCount ?? 0;
                  return (
                    <li
                      key={`bill-${row.tableNumber}`}
                      className="rounded-lg bg-[#11100b] p-3 ring-1 ring-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailTable(row.tableNumber)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[#fbbf24]/12 font-mono text-lg font-black text-[#fde68a] ring-1 ring-[#fbbf24]/28">
                          {row.tableNumber}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-white">
                            {row.tableLabel}
                          </span>
                          <span className="block text-[11px] text-[#d0c5af]/60">
                            {open} open - {paid} lunas {row.total > 0 ? `- ${formatRupiah(row.total)}` : ""}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-sm bg-black/35 px-2 py-1 text-[9px] font-black uppercase tracking-wide ${tone.labelColor}`}>
                          {tone.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <section className="space-y-3 rounded-xl bg-[#15120c] p-3 ring-1 ring-[#d4af37]/12">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/85">
              Lainnya
            </h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#d4af37] text-[12px] font-black uppercase tracking-wide text-[#241a00]"
            >
              <Settings size={16} />
              Pengaturan Notifikasi
            </button>
          </section>
        )}

        <aside className="space-y-3">
          <section className="rounded-xl bg-[#15120c] p-3 ring-1 ring-[#d4af37]/12">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white/85">
                  Prioritas Floor
                </h2>
                <p className="text-[11px] text-[#d0c5af]/60">
                  Panggilan, siap antar, tagihan, dan meja lama.
                </p>
              </div>
              {stalest && stalest.timerMinutes >= 15 ? (
                <button
                  type="button"
                  onClick={() => setDetailTable(stalest.tableNumber)}
                  className={`inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-[11px] font-bold ring-1 ${
                    stalest.timerMinutes >= 30
                      ? "bg-[#d11a2a]/18 text-[#ffd6da] ring-[#d11a2a]/45"
                      : "bg-[#e8883a]/15 text-[#ffd08a] ring-[#e8883a]/35"
                  }`}
                >
                  <Timer size={13} /> M{stalest.tableNumber} {stalest.timerMinutes}m
                </button>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {ready.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg bg-[#0f140d] p-2.5 ring-1 ring-[#22c55e]/28"
                >
                  <div className="flex items-start gap-2">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[#22c55e]/14 font-mono text-lg font-black text-[#bbf7d0] ring-1 ring-[#22c55e]/32">
                      {t.table}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {statusBadge(t.status)}
                        <span className={`flex items-center gap-1 text-[10px] ${stationTone(t.station)}`}>
                          {stationIcon(t.station)} {t.station}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[12px] font-semibold text-white">
                        {t.items[0] ?? "Order siap"}
                      </p>
                      {t.items.length > 1 ? (
                        <p className="text-[10px] text-white/45">
                          +{t.items.length - 1} item lain
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeliver(t)}
                    disabled={actingTicket === t.id}
                    className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#22c55e] text-[12px] font-black uppercase tracking-wide text-[#052e16] transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {actingTicket === t.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Antar
                  </button>
                </div>
              ))}

              {urgentTables.map((row) => (
                <button
                  key={`urgent-${row.tableNumber}`}
                  type="button"
                  onClick={() => setDetailTable(row.tableNumber)}
                  className="flex w-full items-center gap-2 rounded-lg bg-[#1d1610] p-2.5 text-left ring-1 ring-[#e8883a]/20 transition active:scale-[0.99]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#e8883a]/12 font-mono text-sm font-black text-[#ffd08a] ring-1 ring-[#e8883a]/25">
                    {row.tableNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-white">
                      {row.status === "awaiting_payment"
                        ? "Tagihan ke kasir"
                        : row.needsCleaning || row.status === "needs_cleaning"
                          ? "Perlu bersih"
                          : "Durasi meja tinggi"}
                    </span>
                    <span className="block text-[10px] text-[#d0c5af]/60">
                      {row.orderNo ? `#${row.orderNo}` : row.tableLabel} {row.timerMinutes > 0 ? `- ${row.timerMinutes}m` : ""}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold uppercase text-[#f2ca50]">
                    Buka
                  </span>
                </button>
              ))}

              {ready.length === 0 && urgentTables.length === 0 ? (
                <EmptyState
                  title="Floor terkendali"
                  body="Belum ada order siap antar atau meja prioritas."
                />
              ) : null}
            </div>
          </section>

          {upcoming.length > 0 ? (
            <details className="rounded-xl bg-[#15120c] p-3 ring-1 ring-white/10">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-[#d0c5af]/75">
                Antrian dapur ({upcoming.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {upcoming.slice(0, 8).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-2 text-[12px] text-white/75"
                  >
                    <span className="font-mono text-[11px] text-white/55">#{t.id}</span>
                    <span className="font-semibold text-white">Meja {t.table}</span>
                    <span className={`flex items-center gap-1 ${stationTone(t.station)}`}>
                      {stationIcon(t.station)} {t.station}
                    </span>
                    <span className="ml-auto">{statusBadge(t.status)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </aside>
      </div>

      {settingsOpen ? (
        <SettingsDrawer
          prefs={prefs}
          onToggleSound={handleEnableSound}
          onToggleVibe={handleEnableVibe}
          onToggleNotif={handleEnableNotif}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {detailRow ? (
        <TableDetailDrawer
          row={detailRow}
          allTables={tables}
          actingBillTable={actingBillTable}
          actingCleanTable={actingTable}
          actingSeatTable={actingSeatTable}
          canRequestBillRole={canRequestBillRole}
          onClose={() => setDetailTable(null)}
          onClean={(row) => void handleClean(row)}
          onRequestBill={(row) => void handleRequestBill(row)}
          onSeatNew={(row) => void handleSeatNew(row)}
          onMoved={() => {
            void loadAll(true);
            setDetailTable(null);
          }}
          onToast={(t) => toast.push(t)}
        />
      ) : null}

      <style jsx>{`
        @keyframes waiterFadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes waiterGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
          25% {
            box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.45);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }
      `}</style>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-center">
      <p className="text-sm font-semibold text-white/80">{title}</p>
      <p className="mt-1 text-[12px] text-white/55">{body}</p>
    </div>
  );
}

function SettingsDrawer({
  prefs,
  onToggleSound,
  onToggleVibe,
  onToggleNotif,
  onClose,
}: {
  prefs: WaiterNotifyPrefs;
  onToggleSound: () => void | Promise<void>;
  onToggleVibe: () => void;
  onToggleNotif: () => void | Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  type Row = {
    label: string;
    desc: string;
    icon: typeof Volume2;
    activeIcon: typeof Volume2;
    on: boolean;
    onClick: () => void | Promise<void>;
  };
  const rows: Row[] = [
    {
      label: "Suara Notifikasi",
      desc: "Bunyi saat order siap antar.",
      icon: VolumeX,
      activeIcon: Volume2,
      on: prefs.sound,
      onClick: onToggleSound,
    },
    {
      label: "Getar",
      desc: "Getar HP saat order siap (jika didukung).",
      icon: VibrateOff,
      activeIcon: Vibrate,
      on: prefs.vibrate,
      onClick: onToggleVibe,
    },
    {
      label: "Notifikasi Browser",
      desc: "Tampil bahkan saat tab background.",
      icon: BellRing,
      activeIcon: BellRing,
      on: prefs.browserNotif,
      onClick: onToggleNotif,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan notifikasi"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0e10] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/55">Pengaturan</p>
            <p className="text-lg font-bold text-white">Notifikasi</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-md bg-white/[0.05] text-white/75 ring-1 ring-white/12 transition active:scale-[0.97]"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </header>
        <ul className="divide-y divide-white/6">
          {rows.map((row) => {
            const Icon = row.on ? row.activeIcon : row.icon;
            return (
              <li key={row.label}>
                <button
                  type="button"
                  onClick={() => void row.onClick()}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/[0.04]"
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-lg ring-1 ${
                      row.on
                        ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                        : "bg-white/[0.04] text-white/55 ring-white/12"
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white">{row.label}</p>
                    <p className="text-[11px] text-white/55">{row.desc}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                      row.on
                        ? "bg-[#22c55e]/15 text-[#bbf7d0] ring-[#22c55e]/35"
                        : "bg-white/[0.04] text-white/55 ring-white/12"
                    }`}
                  >
                    {row.on ? "ON" : "OFF"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-3 text-[10px] text-white/45">
          Pengaturan tersimpan di perangkat ini.
        </div>
      </div>
    </div>
  );
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function billStatusTone(status: string): { label: string; cls: string } {
  if (status === "paid") {
    return {
      label: "LUNAS",
      cls: "bg-[#22c55e]/12 text-[#bbf7d0] ring-[#22c55e]/35",
    };
  }
  if (status === "awaiting_payment") {
    return {
      label: "DI KASIR",
      cls: "bg-[#fbbf24]/15 text-[#fde68a] ring-[#fbbf24]/35",
    };
  }
  if (status === "rejected") {
    return {
      label: "DITOLAK",
      cls: "bg-white/8 text-white/55 ring-white/15",
    };
  }
  return {
    label: status.replace(/_/g, " ").toUpperCase(),
    cls: "bg-[#e8883a]/15 text-[#ffd08a] ring-[#e8883a]/35",
  };
}

type ToastInput = {
  tone: "success" | "error" | "info";
  title: string;
  body?: string;
  ttl?: number;
};

function TableDetailDrawer({
  row,
  allTables,
  actingBillTable,
  actingCleanTable,
  actingSeatTable,
  canRequestBillRole,
  onClose,
  onClean,
  onMoved,
  onRequestBill,
  onSeatNew,
  onToast,
}: {
  row: TableLiveRow;
  allTables: TableLiveRow[];
  actingBillTable: string | null;
  actingCleanTable: string | null;
  actingSeatTable: string | null;
  canRequestBillRole: boolean;
  onClose: () => void;
  onClean: (row: TableLiveRow) => void;
  onMoved: () => void;
  onRequestBill: (row: TableLiveRow) => void;
  onSeatNew: (row: TableLiveRow) => void;
  onToast: (t: ToastInput) => void;
}) {
  const bills = useMemo(() => row.bills ?? [], [row.bills]);
  const paidTotal = bills
    .filter((b) => b.status === "paid")
    .reduce((sum, b) => sum + b.total, 0);
  const openTotal = bills
    .filter((b) => b.status !== "paid" && b.status !== "rejected")
    .reduce((sum, b) => sum + b.total, 0);

  const [history, setHistory] = useState<TableHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);

  const canMove = Boolean(row.currentOrderId) && (row.openBillCount ?? 0) > 0;
  const billAlreadyRequested = hasAwaitingPaymentBill(row);
  const canRequestBill =
    canRequestBillRole &&
    Boolean(row.currentOrderId) &&
    (row.status === "accepted" || row.status === "ready" || row.status === "mixed") &&
    !billAlreadyRequested;
  const canSeatNext = isPaidOnly(row);
  const canClean =
    row.needsCleaning ||
    row.status === "needs_cleaning" ||
    isPaidOnly(row) ||
    (!row.currentOrderId && row.status !== "empty");
  const moveCandidates = useMemo(
    () =>
      allTables.filter(
        (t) =>
          t.tableNumber !== row.tableNumber &&
          t.status === "empty" &&
          !t.currentOrderId &&
          (t.openBillCount ?? 0) === 0 &&
          (t.paidBillCount ?? 0) === 0 &&
          !t.needsCleaning,
      ),
    [allTables, row.tableNumber],
  );

  // ESC untuk close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch history hari ini (lintas sesi). Pattern fetch-on-mount: setState
  // dipanggil di effect untuk loading + hasil. Aman karena dibungkus
  // cancelled-guard dan tidak loop.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true);
    fetch(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/history`)
      .then((r) => r.json())
      .then((payload: ApiEnvelope<TableHistoryResponse>) => {
        if (cancelled) return;
        if (payload.error) {
          setHistory(null);
        } else {
          setHistory(payload.data ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.tableNumber]);

  const sessionBillIds = useMemo(() => new Set(bills.map((b) => b.id)), [bills]);
  const previousBills = useMemo(
    () => (history?.bills ?? []).filter((b) => !sessionBillIds.has(b.id)),
    [history, sessionBillIds],
  );

  const handleMove = useCallback(async () => {
    if (!moveTarget) return;
    setMoving(true);
    try {
      const res = await fetch(
        `/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: moveTarget }),
        },
      );
      const payload: ApiEnvelope<{ to: string }> = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message ?? "Gagal pindah meja.");
      }
      onToast({
        tone: "success",
        title: `Pindah ke Meja ${moveTarget}`,
        body: `Bill aktif sekarang di Meja ${moveTarget}.`,
        ttl: 2800,
      });
      onMoved();
    } catch (err) {
      onToast({
        tone: "error",
        title: "Gagal pindah meja",
        body: err instanceof Error ? err.message : "Coba lagi.",
      });
    } finally {
      setMoving(false);
    }
  }, [moveTarget, onMoved, onToast, row.tableNumber]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail meja ${row.tableLabel}`}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0e10] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar visual cue swipe-down di mobile */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-gradient-to-br from-[#1a1a1d] to-[#0e0e10] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/55">Detail Sesi</p>
            <p className="text-lg font-bold text-white">{row.tableLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-md bg-white/[0.05] text-white/75 ring-1 ring-white/12 transition active:scale-[0.97]"
            aria-label="Tutup detail"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">

        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div className="rounded-lg bg-[#22c55e]/10 px-3 py-2 ring-1 ring-[#22c55e]/28">
            <p className="text-[10px] uppercase tracking-wider text-[#bbf7d0]/80">Terbayar</p>
            <p className="font-mono text-sm font-bold text-[#bbf7d0]">{formatRupiah(paidTotal)}</p>
            <p className="text-[10px] text-white/55">
              {row.paidBillCount ?? 0} bill lunas
            </p>
          </div>
          <div
            className={`rounded-lg px-3 py-2 ring-1 ${
              openTotal > 0
                ? "bg-[#e8883a]/10 ring-[#e8883a]/35"
                : "bg-white/[0.03] ring-white/12"
            }`}
          >
            <p
              className={`text-[10px] uppercase tracking-wider ${
                openTotal > 0 ? "text-[#ffd08a]" : "text-white/55"
              }`}
            >
              Open
            </p>
            <p
              className={`font-mono text-sm font-bold ${
                openTotal > 0 ? "text-[#ffd08a]" : "text-white/70"
              }`}
            >
              {formatRupiah(openTotal)}
            </p>
            <p className="text-[10px] text-white/55">
              {row.openBillCount ?? 0} bill aktif
            </p>
          </div>
        </div>

        <div className="border-t border-white/8 bg-[#15120c]/70 px-4 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d0c5af]/70">
            Tindakan
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {canRequestBill ? (
              <button
                type="button"
                onClick={() => onRequestBill(row)}
                disabled={actingBillTable === row.tableNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#fbbf24] px-3 text-[12px] font-black uppercase tracking-wide text-[#422006] transition active:scale-[0.97] disabled:opacity-60"
              >
                {actingBillTable === row.tableNumber ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ReceiptText size={14} />
                )}
                Minta Tagihan
              </button>
            ) : billAlreadyRequested ? (
              <div className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#fbbf24]/35 bg-[#fbbf24]/10 px-3 text-[12px] font-bold uppercase tracking-wide text-[#fde68a]">
                <ReceiptText size={14} />
                Tagihan ke Kasir
              </div>
            ) : null}

            {canClean ? (
              <button
                type="button"
                onClick={() => onClean(row)}
                disabled={actingCleanTable === row.tableNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#22c55e] px-3 text-[12px] font-black uppercase tracking-wide text-[#052e16] transition active:scale-[0.97] disabled:opacity-60"
              >
                {actingCleanTable === row.tableNumber ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Bersihkan
              </button>
            ) : null}

            {canSeatNext ? (
              <button
                type="button"
                onClick={() => onSeatNew(row)}
                disabled={actingSeatTable === row.tableNumber}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#e2e8f0] px-3 text-[12px] font-black uppercase tracking-wide text-[#0b0b0c] transition active:scale-[0.97] disabled:opacity-60"
              >
                {actingSeatTable === row.tableNumber ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserPlus size={14} />
                )}
                Tamu Baru
              </button>
            ) : null}
          </div>
        </div>

        {canMove ? (
          <div className="border-t border-white/8 bg-white/[0.02] px-4 py-2">
            {!moveMode ? (
              <button
                type="button"
                onClick={() => setMoveMode(true)}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white/[0.05] text-[12px] font-semibold text-white/85 ring-1 ring-white/15 transition hover:bg-white/[0.1]"
              >
                <ArrowRightLeft size={14} /> Pindah ke meja lain
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-wider text-white/55">
                  Pilih meja tujuan
                </label>
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  className="h-9 w-full rounded-md bg-[#0b0b0c] px-2 text-[12px] text-white ring-1 ring-white/15 focus:outline-none focus:ring-[#d11a2a]/50"
                >
                  <option value="">- pilih meja -</option>
                  {moveCandidates.map((t) => (
                    <option key={t.tableNumber} value={t.tableNumber}>
                      Meja {t.tableNumber} ({t.status})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMoveMode(false);
                      setMoveTarget("");
                    }}
                    className="h-9 rounded-md bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/12 transition hover:bg-white/[0.08]"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMove()}
                    disabled={!moveTarget || moving}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#d11a2a] text-[11px] font-bold uppercase tracking-wide text-white transition active:scale-[0.97] disabled:opacity-50"
                  >
                    {moving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ArrowRightLeft size={12} />
                    )}
                    Pindahkan
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="px-4 pb-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-white/55">
            Bill Sesi Ini
          </p>
          {bills.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.02] px-3 py-6 text-center text-[12px] text-white/55">
              Belum ada bill di sesi ini.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {bills.map((bill) => {
                const tone = billStatusTone(bill.status);
                return (
                  <li
                    key={bill.id}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/8"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-white">
                        #{bill.orderNo}
                      </p>
                      <p className="text-[10px] text-white/55">
                        {relativeFromNow(bill.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${tone.cls}`}
                    >
                      {tone.label}
                    </span>
                    <span className="font-mono text-[12px] font-bold text-white">
                      {formatRupiah(bill.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Riwayat sesi sebelumnya hari ini (sudah di-clean) */}
          <div className="mt-4 flex items-center gap-2">
            <History size={12} className="text-white/55" />
            <p className="text-[10px] uppercase tracking-wider text-white/55">
              Sesi sebelumnya hari ini
              {historyLoading ? " (loading...)" : ""}
            </p>
          </div>
          {!historyLoading && previousBills.length === 0 ? (
            <p className="mt-1 text-[11px] text-white/45">Tidak ada.</p>
          ) : null}
          {previousBills.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {previousBills.map((bill) => {
                const tone = billStatusTone(bill.status);
                return (
                  <li
                    key={bill.id}
                    className="flex items-center gap-2 rounded-md bg-white/[0.02] px-3 py-1.5 ring-1 ring-white/6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-white/75">
                        #{bill.orderNo}
                        {bill.customerName ? (
                          <span className="ml-1 text-white/45">/ {bill.customerName}</span>
                        ) : null}
                      </p>
                      <p className="text-[9px] text-white/45">
                        {relativeFromNow(bill.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1 ${tone.cls}`}
                    >
                      {tone.label}
                    </span>
                    <span className="font-mono text-[11px] text-white/85">
                      {formatRupiah(bill.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
