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
  Loader2,
  RefreshCw,
  ReceiptText,
  Settings,
  Sparkles,
  Timer,
  UserPlus,
  Volume2,
  VolumeX,
  Vibrate,
  VibrateOff,
} from "lucide-react";

import type {
  ApiEnvelope,
  GarageMe,
  KitchenOrder,
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
import {
  EmptyState,
  POLL_MS,
  formatRupiah,
  hasAwaitingPaymentBill,
  hasOpenBill,
  isPaidOnly,
  isWaiterOperator,
  statusBadge,
  stationIcon,
  stationTone,
  tableTone,
  waitStripe,
  type WaiterBoardTab,
} from "./waiter-view-helpers";
import { SettingsDrawer } from "./waiter-view-settings-drawer";
import { TableDetailDrawer } from "./waiter-view-table-detail-drawer";
import { WaiterOfflineBanner } from "./waiter-offline-banner";
import { enqueueAction } from "@/lib/waiter-offline-queue";
import {
  startSyncWorker,
  stopSyncWorker,
  triggerSyncNow,
} from "@/lib/waiter-offline-sync";

type Props = {
  me: GarageMe;
};

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

  // Mount offline sync worker — drain queue saat online, retry tiap 20s.
  useEffect(() => {
    startSyncWorker();
    return () => stopSyncWorker();
  }, []);

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
      // Optimistic: langsung hapus ticket dari list. Kalau gagal & offline,
      // tetap hilang dari UI tapi action di-queue.
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));

      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      const idemKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!online) {
        try {
          await enqueueAction(idemKey, "deliver", ticket.id, {
            ticketNo: ticket.id,
            tableLabel: String(ticket.table),
            itemCount: ticket.items.length,
          });
          toast.push({
            tone: "info",
            title: `Diantar (offline) - Meja ${ticket.table}`,
            body: "Action disimpan, akan sync saat online.",
            ttl: 3200,
          });
        } catch (err) {
          toast.push({
            tone: "error",
            title: "Gagal queue offline",
            body: err instanceof Error ? err.message : "Coba lagi.",
          });
          await loadAll(true);
        } finally {
          setActingTicket(null);
        }
        return;
      }

      try {
        await fetchJson(`/api/waiter/tickets/${encodeURIComponent(ticket.id)}/deliver`, {
          method: "POST",
          headers: { "X-Idempotency-Key": idemKey },
        });
        toast.push({
          tone: "success",
          title: `Diantar - Meja ${ticket.table}`,
          body: "Ticket ditandai delivered.",
          ttl: 2400,
        });
        await loadAll(true);
      } catch (err) {
        // Network error → queue + biarkan worker retry
        const msg = err instanceof Error ? err.message : "";
        const isNetwork = /fetch|network|failed/i.test(msg);
        if (isNetwork) {
          try {
            await enqueueAction(idemKey, "deliver", ticket.id, {
              ticketNo: ticket.id,
              tableLabel: String(ticket.table),
              itemCount: ticket.items.length,
            });
            toast.push({
              tone: "info",
              title: `Diantar (akan sync) - Meja ${ticket.table}`,
              body: "Koneksi terganggu, action dikirim ulang otomatis.",
              ttl: 3200,
            });
            triggerSyncNow();
          } catch (qErr) {
            toast.push({
              tone: "error",
              title: "Gagal antar",
              body: qErr instanceof Error ? qErr.message : msg,
            });
            await loadAll(true);
          }
        } else {
          toast.push({
            tone: "error",
            title: "Gagal antar",
            body: msg || "Coba lagi.",
          });
          // Restore ticket karena gagal permanen
          await loadAll(true);
        }
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
      <WaiterOfflineBanner />
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
