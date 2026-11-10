"use client";

import { useProductionStream } from "@/lib/use-production-stream";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CircleDot,
  Loader2,
  NotebookPen,
  RefreshCw,
  ReceiptText,
  Settings,
  Users,
  Volume2,
  VolumeX,
  Vibrate,
  VibrateOff,
} from "lucide-react";

import type {
  ApiEnvelope,
  GarageMe,
  TableLiveRow,
} from "@/lib/garage-api-types";
import {
  loadNotifyPrefs,
  notifyOrderReady,
  reducedMotionPreferred,
  requestBrowserNotifyPermission,
  saveNotifyPrefs,
  vibrate,
  type WaiterNotifyPrefs,
} from "@/lib/waiter-notify";
import { claimSound } from "@/lib/sound-claim";
import { useGarageToast } from "@/components/garage/garage-toast";
import { TablePlate } from "@/components/garage/table-plate";
import {
  EmptyState,
  POLL_MS,
  formatRupiah,
  hasAwaitingPaymentBill,
  hasOpenBill,
  isCleaningTable,
  isDirtyTable,
  isPaidOnly,
  isWaiterOperator,
  TABLE_LEGEND,
  tableTone,
  waitLevel,
  type WaiterBoardTab,
} from "./waiter-view-helpers";
import { TablePicker } from "./waiter-table-picker";
import { SettingsDrawer } from "./waiter-view-settings-drawer";
import { TableDetailDrawer } from "./waiter-view-table-detail-drawer";
import { WaiterOfflineBanner } from "./waiter-offline-banner";
import {
  startSyncWorker,
  stopSyncWorker,
} from "@/lib/waiter-offline-sync";
import { formatTableDuration } from "@/lib/garage-tables";

// Grid peta meja: HP 4 kolom, tablet 6, desktop 8 (6 saat ada panel prioritas).
const TABLE_GRID =
  "grid grid-cols-4 gap-2 min-[480px]:grid-cols-5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-6 2xl:grid-cols-8";

function urgentReason(row: TableLiveRow) {
  if (row.staleFromPreviousDay) return "Cek kasir — bill kemarin";
  if (hasAwaitingPaymentBill(row)) return "Tagihan di kasir";
  if (row.status === "cleaning") return "Sedang dibersihkan";
  if (row.needsCleaning || row.status === "needs_cleaning") return "Perlu dibersihkan";
  return "Menunggu lama";
}

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


type ServiceRequest = {
  id: string;
  tableLabel: string;
  type: string;
  note: string | null;
  createdAt: string;
};

function serviceRequestLabel(type: string) {
  if (type === "bill") return "Minta Bill";
  if (type === "water") return "Air / Tisu";
  if (type === "other") return "Bantuan";
  if (type === "move") return "Minta Pindah Meja";
  return "Panggil Pelayan";
}

export function WaiterView({ me }: Props) {
  const toast = useGarageToast();
  const [tables, setTables] = useState<TableLiveRow[]>([]);
  const [serviceReqs, setServiceReqs] = useState<ServiceRequest[]>([]);
  const [resolvingReq, setResolvingReq] = useState<string | null>(null);
  const prevServiceReqIdsRef = useRef<Set<string>>(new Set());
  const canRequestBillRole = isWaiterOperator(me.role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [actingTable, setActingTable] = useState<string | null>(null);
  const [actingBillTable, setActingBillTable] = useState<string | null>(null);
  const [actingSeatTable, setActingSeatTable] = useState<string | null>(null);
  const [detailTable, setDetailTable] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<
    "all" | "unpaid" | "paid" | "mixed" | "needs_clean" | "ready"
  >("all");
  const [activeBoard, setActiveBoard] = useState<WaiterBoardTab>("tables");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Sheet "Pesankan": pilih nomor meja lalu buka menu digital mode waiter.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Meja yang sedang dibuka menu digitalnya (navigasi berjalan) → cegah tap ganda.
  const [openingTable, setOpeningTable] = useState<string | null>(null);
  // Lazy initial state - baca localStorage 1x saat mount, tanpa effect.
  const [prefs, setPrefs] = useState<WaiterNotifyPrefs>(() => loadNotifyPrefs());
  const [recentlyCleaned, setRecentlyCleaned] = useState<Set<string>>(new Set());
  // Skip notif pertama kali load (waiter baru buka tab, semua ticket "baru" buat dia).
  const hasInitialLoadRef = useRef(false);
  const prefsRef = useRef(prefs);

  // Sync ref tiap prefs berubah (di effect, bukan saat render).
  useEffect(() => {
    prefsRef.current = prefs;
    saveNotifyPrefs(prefs);
  }, [prefs]);

  const inFlightRef = useRef(false);
  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    inFlightRef.current = true;
    try {
      // Antaran diurus Bar/Dapur (helper tap "Diambil oleh"), jadi waiter tidak
      // lagi memuat tiket siap antar — cukup meja & panggilan pelanggan.
      const [tb, sr] = await Promise.all([
        fetchJson<TableLiveRow[]>("/api/waiter/tables"),
        fetchJson<ServiceRequest[]>("/api/waiter/service-requests").catch(() => [] as ServiceRequest[]),
      ]);
      setError(null);
      setTables(tb);
      setServiceReqs(sr);
      setLastSyncedAt(new Date());

      // Toast saat ada panggilan meja baru (skip load pertama).
      const nextReqIds = new Set(sr.map((req) => req.id));
      if (hasInitialLoadRef.current) {
        for (const req of sr) {
          if (!prevServiceReqIdsRef.current.has(req.id)) {
            const title = `Panggilan ${serviceRequestLabel(req.type)} - ${req.tableLabel}`;
            // V2: kunci sama dengan lonceng (dedup_key "service:<id>") → satu bunyi per perangkat.
            const prefsNow = prefsRef.current;
            void claimSound(`notif:service:${req.id}`).then((ok) => {
              if (ok) notifyOrderReady(prefsNow, title, req.note ?? "Pelanggan butuh bantuan");
              else if (prefsNow.vibrate) vibrate([120]);
            });
            toast.push({ tone: "info", title, body: req.note ?? "Pelanggan butuh bantuan", ttl: 6000 });
          }
        }
      }
      prevServiceReqIdsRef.current = nextReqIds;

      hasInitialLoadRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal sinkron data waiter.");
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [toast]);

  const resolveRequest = useCallback(
    async (id: string) => {
      setResolvingReq(id);
      try {
        await fetchJson(`/api/waiter/service-requests/${encodeURIComponent(id)}`, {
          method: "PATCH",
        });
        setServiceReqs((current) => current.filter((req) => req.id !== id));
        prevServiceReqIdsRef.current.delete(id);
      } catch {
        toast.push({ tone: "error", title: "Gagal", body: "Tidak bisa menyelesaikan panggilan." });
      } finally {
        setResolvingReq(null);
      }
    },
    [toast],
  );

  // Mount offline sync worker — drain queue saat online, retry tiap 20s.
  useEffect(() => {
    startSyncWorker();
    return () => stopSyncWorker();
  }, []);

  // Polling - fetch eksternal yang memang harus update state. Rule
  // set-state-in-effect false-positive untuk subscribe pattern seperti ini.
  // Polling berhenti saat layar/tab tidak terlihat (hemat baterai & server),
  // langsung sinkron lagi saat kembali dibuka. Tidak menumpuk request.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll(false);
    // Tab tersembunyi: tetap cek tiap ±30 dtk supaya notifikasi browser
    // ("tampil saat tab di belakang") benar-benar bisa muncul.
    let lastHiddenTick = 0;
    const tick = () => {
      if (inFlightRef.current) return;
      if (document.hidden) {
        if (Date.now() - lastHiddenTick < 30_000) return;
        lastHiddenTick = Date.now();
      }
      void loadAll(true);
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadAll]);

  // Realtime: meja dipilih pelanggan / order masuk / meja dibersihkan langsung
  // tampil tanpa menunggu polling (polling tetap jadi cadangan).
  useProductionStream(
    useCallback(() => {
      if (!inFlightRef.current) void loadAll(true);
    }, [loadAll]),
  );

  // Pesankan: buka menu digital (tampilan pelanggan) untuk meja ini di tab yang sama,
  // mode waiter → nama pemesan otomatis, order masuk ke kasir untuk divalidasi.
  function openWaiterOrder(tableNumber: string) {
    if (openingTable) return;
    setOpeningTable(tableNumber);
    window.location.assign(`/order?table=${encodeURIComponent(tableNumber)}&mode=waiter`);
  }

  const handleClean = useCallback(
    async (row: TableLiveRow) => {
      setActingTable(row.tableNumber);
      try {
        await fetchJson(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/clean`, {
          method: "POST",
        });
        toast.push({
          tone: "success",
          title: `${row.tableLabel} siap dipakai`,
          body: "Meja bersih dan siap menerima tamu baru.",
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

  // Siklus meja: Tamu pergi (→ DIRTY), Mulai bersih (→ CLEANING), reservasi.
  // CLEANING → AVAILABLE tetap lewat handleClean (/clean).
  const handleLifecycle = useCallback(
    async (
      row: TableLiveRow,
      action: "leave" | "start_cleaning" | "reserve" | "unreserve" | "release_hold",
    ) => {
      setActingTable(row.tableNumber);
      try {
        await fetchJson(`/api/waiter/tables/${encodeURIComponent(row.tableNumber)}/lifecycle`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        const title = {
          leave: `${row.tableLabel} perlu dibersihkan`,
          start_cleaning: `${row.tableLabel} sedang dibersihkan`,
          reserve: `${row.tableLabel} ditandai dipesan`,
          unreserve: `${row.tableLabel} kembali kosong`,
          release_hold: `Kunci ${row.tableLabel} dilepas`,
        }[action];
        toast.push({ tone: "success", title, ttl: 2200 });
        await loadAll(true);
      } catch (err) {
        toast.push({
          tone: "error",
          title: "Status meja gagal diubah",
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
          title: `${row.tableLabel}: teman gabung`,
          body: "Bill lunas tetap tersimpan. Pesanan baru tampil sebagai Sebagian lunas.",
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

  const tablesNeedingCleaning = useMemo(
    () =>
      tables.filter(
        (t) => t.needsCleaning || t.status === "needs_cleaning",
      ),
    [tables],
  );
  const billRequests = useMemo(
    () => tables.filter((t) => hasAwaitingPaymentBill(t)).length,
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

  const urgentTables = useMemo(
    () =>
      tables
        .filter(
          (t) =>
            t.staleFromPreviousDay ||
            t.needsCleaning ||
            t.status === "needs_cleaning" ||
            t.status === "cleaning" ||
            hasAwaitingPaymentBill(t) ||
            waitLevel(t) !== "ok",
        )
        .sort((a, b) => {
          const score = (row: TableLiveRow) =>
            (row.staleFromPreviousDay ? 1000 : 0) +
            (hasAwaitingPaymentBill(row) ? 400 : 0) +
            (row.needsCleaning || row.status === "needs_cleaning" ? 300 : 0) +
            Math.min(row.timerMinutes, 240);
          return score(b) - score(a);
        }),
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

  const syncLabel = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;
  const filterChips = [
    { key: "all" as const, label: "Semua", count: tableBuckets.all },
    { key: "unpaid" as const, label: "Belum bayar", count: tableBuckets.unpaid },
    { key: "mixed" as const, label: "Sebagian lunas", count: tableBuckets.mixed },
    { key: "paid" as const, label: "Lunas", count: tableBuckets.paid },
    { key: "needs_clean" as const, label: "Perlu bersih", count: tableBuckets.needs_clean },
    { key: "ready" as const, label: "Kosong", count: tableBuckets.ready },
  ];
  const activeFilterLabel = filterChips.find((chip) => chip.key === tableFilter)?.label ?? "Semua";
  const iconButton =
    "grid size-11 shrink-0 place-items-center rounded-md ring-1 transition disabled:opacity-50";
  const toggleTone = (on: boolean) =>
    on ? "bg-white/10 text-white ring-white/30" : "bg-white/[0.03] text-garage-dim ring-white/12";

  return (
    <div className="space-y-4 pb-28 pt-1 text-white">
      <WaiterOfflineBanner />

      {/* Header ringkas: nama + status sinkron + kontrol notifikasi. */}
      <div className="rounded-lg border border-garage-line bg-garage-bg-1 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight text-white">{me.user.name}</p>
            <p className={`mt-0.5 text-[12px] ${error ? "text-[#ffb3b3]" : "text-garage-dim"}`} role={error ? "alert" : undefined}>
              {error
                ? `Gagal sinkron: ${error}`
                : syncLabel
                  ? `Tersinkron ${syncLabel} · ${tableBuckets.ready} meja kosong`
                  : "Menyinkronkan meja…"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleEnableSound}
              className={`hidden sm:grid ${iconButton} ${toggleTone(prefs.sound)}`}
              aria-label={prefs.sound ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"}
              aria-pressed={prefs.sound}
            >
              {prefs.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              type="button"
              onClick={handleEnableVibe}
              className={`hidden sm:grid ${iconButton} ${toggleTone(prefs.vibrate)}`}
              aria-label={prefs.vibrate ? "Matikan getar" : "Nyalakan getar"}
              aria-pressed={prefs.vibrate}
            >
              {prefs.vibrate ? <Vibrate size={17} /> : <VibrateOff size={17} />}
            </button>
            <button
              type="button"
              onClick={handleEnableNotif}
              className={`hidden sm:grid ${iconButton} ${toggleTone(prefs.browserNotif)}`}
              aria-label="Aktifkan notifikasi browser"
              aria-pressed={prefs.browserNotif}
            >
              <BellRing size={17} />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`sm:hidden ${iconButton} ${toggleTone(prefs.sound || prefs.vibrate || prefs.browserNotif)}`}
              aria-label="Pengaturan notifikasi"
            >
              <Settings size={17} />
            </button>
            <button
              type="button"
              onClick={() => void loadAll(false)}
              disabled={loading}
              className={`${iconButton} bg-white/[0.03] text-white ring-white/12 hover:bg-white/10`}
              aria-label="Muat ulang meja"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            </button>
          </div>
        </div>
      </div>

      {serviceReqs.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-[#ff2a3a]/45 bg-[#d11a2a]/10 p-3" aria-label="Panggilan meja">
          <p className="flex items-center gap-2 text-[13px] font-bold text-white">
            <BellRing size={16} className="text-[#ff8a8a]" aria-hidden />
            Panggilan meja ({serviceReqs.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {serviceReqs.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-md border border-[#ff2a3a]/30 bg-garage-bg-1 p-2.5">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-white">{req.tableLabel}</p>
                  <p className="truncate text-[12px] font-semibold text-[#ffb3b3]">
                    {serviceRequestLabel(req.type)}
                    {req.note ? ` · ${req.note}` : ""}
                  </p>
                  <p className="text-[11px] text-garage-dim">
                    {new Date(req.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={resolvingReq === req.id}
                  onClick={() => void resolveRequest(req.id)}
                  className="garage-press flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-[#f4f4f5] px-3 text-[13px] font-bold text-[#0a0a0c] transition hover:bg-white disabled:opacity-50"
                >
                  {resolvingReq === req.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Selesai
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="garage-press flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-[#d11a2a] text-[17px] font-black text-white shadow-[0_10px_28px_rgba(209,26,42,0.3)] transition hover:bg-[#ff2a3a]"
      >
        <NotebookPen size={21} aria-hidden /> Pesankan
        <span className="text-[13px] font-semibold text-white/85">pilih meja</span>
      </button>

      {/* Tab ringkas: peta meja / tagihan. Pengaturan lewat ikon di header. */}
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-garage-line bg-garage-bg-1 p-1" role="tablist" aria-label="Tampilan waiter">
        {[
          { key: "tables" as const, label: "Peta meja", icon: <CircleDot size={16} />, count: null },
          { key: "bills" as const, label: "Tagihan", icon: <ReceiptText size={16} />, count: billRequests },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={activeBoard === item.key}
            onClick={() => setActiveBoard(item.key)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md text-[13px] font-bold transition ${
              activeBoard === item.key ? "bg-white/12 text-white ring-1 ring-white/25" : "text-garage-dim hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
            {item.count ? (
              <span className="grid min-w-5 place-items-center rounded-sm bg-[#f5a742] px-1 font-mono text-[11px] leading-5 text-[#1a1000]">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {activeBoard === "tables" ? (
          <section className="min-w-0 space-y-3" aria-label="Peta meja">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Peta meja</h2>
              {/* Keterangan warna: setiap kartu juga menulis statusnya. */}
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-garage-dim" aria-label="Keterangan warna meja">
                {TABLE_LEGEND.map((item) => (
                  <li key={item.label} className="inline-flex items-center gap-1.5">
                    <span className={`size-3 rounded-[3px] ${item.swatch}`} aria-hidden />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* Filter: HP digeser ke samping (bayangan kanan = masih ada), desktop 1 baris. */}
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto pb-1 pr-6 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden">
                {filterChips.map((chip) => {
                  const active = tableFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setTableFilter(chip.key)}
                      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold ring-1 transition ${
                        active ? "bg-white/12 text-white ring-white/35" : "bg-white/[0.03] text-garage-dim ring-white/12 hover:bg-white/[0.07] hover:text-white"
                      }`}
                      aria-pressed={active}
                    >
                      {chip.label}
                      <span className="rounded-sm bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-white">{chip.count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-garage-bg-0 to-transparent sm:hidden" aria-hidden />
            </div>

            {tablesNeedingCleaning.length > 0 && tableFilter === "all" ? (
              <button
                type="button"
                onClick={() => setTableFilter("needs_clean")}
                className="flex min-h-11 w-full items-center gap-2 rounded-md border border-[#ff2a3a]/40 bg-[#d11a2a]/10 px-3 text-left text-[13px] text-[#ffd6da]"
              >
                <AlertTriangle size={15} className="shrink-0" aria-hidden />
                {tablesNeedingCleaning.length} meja perlu dibersihkan — tap untuk lihat.
              </button>
            ) : null}

            {loading && tables.length === 0 ? (
              <div className={TABLE_GRID} aria-busy="true" aria-label="Memuat meja">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="h-[92px] animate-pulse rounded-lg border border-garage-line bg-garage-bg-2 motion-reduce:animate-none" />
                ))}
              </div>
            ) : error && tables.length === 0 ? (
              <div className="rounded-lg border border-[#ff2a3a]/40 bg-[#d11a2a]/10 px-4 py-6 text-center" role="alert">
                <p className="text-[14px] font-bold text-white">Peta meja belum bisa dimuat</p>
                <p className="mt-1 text-[13px] text-garage-dim">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadAll(false)}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-white/10 px-4 text-[13px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/15"
                >
                  <RefreshCw size={15} /> Coba lagi
                </button>
              </div>
            ) : filteredTables.length === 0 ? (
              <EmptyState
                title={`Tidak ada meja "${activeFilterLabel}"`}
                body="Pilih filter lain atau tap Semua."
              />
            ) : (
              <div className={TABLE_GRID}>
                {filteredTables.map((row) => {
                  const tone = tableTone(row);
                  const level = waitLevel(row);
                  const dirty = isDirtyTable(row) || isCleaningTable(row);
                  const paidOnly = isPaidOnly(row);
                  const acting = actingTable === row.tableNumber;
                  const glow = recentlyCleaned.has(row.tableNumber);
                  const showDuration = Boolean(row.currentOrderId) && row.timerMinutes > 0 && !row.staleFromPreviousDay;
                  return (
                    <div
                      key={row.tableNumber}
                      className={`relative flex flex-col overflow-hidden rounded-lg border ${tone.card} ${
                        glow ? "motion-safe:animate-[waiterGlow_1300ms_ease-out]" : ""
                      }`}
                    >
                      <span className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden />
                      <button
                        type="button"
                        onClick={() => setDetailTable(row.tableNumber)}
                        className="flex min-h-[104px] flex-1 flex-col gap-1.5 p-2 pl-2.5 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
                        aria-label={`${row.tableLabel}, ${tone.label}${row.total > 0 ? `, ${formatRupiah(row.total)}` : ""}. Buka detail.`}
                      >
                        <span className="flex items-start justify-between gap-1">
                          <TablePlate number={row.tableNumber} size="sm" />
                          {row.capacity ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-garage-dim" title={`${row.capacity} kursi`}>
                              <Users size={10} aria-hidden />
                              {row.capacity}
                            </span>
                          ) : null}
                        </span>
                        <span className={`inline-flex max-w-full items-center gap-1 text-[11px] font-bold leading-tight ${tone.labelColor}`}>
                          <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                          <span className="line-clamp-2">{tone.label}</span>
                        </span>
                        {(row.billTotal ?? row.total) > 0 ? (
                          <span className="truncate font-mono text-[11px] font-semibold leading-tight text-white">
                            {formatRupiah(row.billTotal ?? row.total)}
                          </span>
                        ) : row.area ? (
                          <span className="truncate text-[11px] leading-tight text-garage-dim">{row.area}</span>
                        ) : null}
                        {row.idleWarning && !row.staleFromPreviousDay ? (
                          <span className="mt-1 self-start rounded-sm bg-[#facc15] px-1 py-0.5 text-[10px] font-bold leading-none text-[#1a1400]">
                            Cek meja · {formatTableDuration(row.idleMinutes ?? 0)} diam
                          </span>
                        ) : null}
                        {row.staleFromPreviousDay ? (
                          <span className="mt-1 self-start rounded-sm bg-[#d11a2a] px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                            Cek kasir
                          </span>
                        ) : showDuration ? (
                          <span
                            className={`mt-1 self-start rounded-sm px-1 py-0.5 font-mono text-[11px] font-bold leading-none ${
                              level === "late"
                                ? "bg-[#d11a2a] text-white"
                                : level === "watch"
                                  ? "bg-[#f5a742] text-[#1a1000]"
                                  : "bg-black/35 text-white/85"
                            }`}
                          >
                            {formatTableDuration(row.timerMinutes)}
                          </span>
                        ) : null}
                      </button>
                      {dirty || paidOnly ? (
                        <button
                          type="button"
                          onClick={() => (dirty ? void handleClean(row) : void handleLifecycle(row, "leave"))}
                          disabled={acting}
                          className={`flex min-h-11 items-center justify-center gap-1 border-t text-[12px] font-bold transition disabled:opacity-60 ${
                            dirty
                              ? "border-[#ff2a3a]/40 bg-[#f4f4f5] text-[#0a0a0c] hover:bg-white"
                              : "border-[#d4d4d8]/30 bg-white/[0.06] text-white hover:bg-white/12"
                          }`}
                          aria-label={dirty ? `${row.tableLabel} sudah bersih` : `Tamu ${row.tableLabel} sudah pergi`}
                        >
                          {acting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                          {dirty ? "Bersih" : "Pergi"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-3 rounded-lg border border-garage-line bg-garage-bg-1 p-3" aria-label="Tagihan meja">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Tagihan meja</h2>
                <p className="text-[12px] text-garage-dim">Waiter minta tagihan, kasir yang memproses pembayaran.</p>
              </div>
              <span className="font-mono text-2xl font-black text-[#ffd08a]">{billRequests}</span>
            </div>
            {billedTables.length === 0 ? (
              <EmptyState title="Belum ada tagihan" body="Meja yang punya bill akan tampil di sini." />
            ) : (
              <ul className="space-y-2">
                {billedTables.map((row) => {
                  const tone = tableTone(row);
                  const open = row.openBillCount ?? 0;
                  const paid = row.paidBillCount ?? 0;
                  return (
                    <li key={`bill-${row.tableNumber}`}>
                      <button
                        type="button"
                        onClick={() => setDetailTable(row.tableNumber)}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-2.5 text-left transition hover:bg-white/[0.04] ${tone.card}`}
                      >
                        <TablePlate number={row.tableNumber} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] font-bold ${tone.labelColor}`}>{tone.label}</span>
                          <span className="block truncate text-[12px] text-garage-dim">
                            {open} belum bayar · {paid} lunas{row.total > 0 ? ` · ${formatRupiah(row.total)}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <aside className="space-y-3" aria-label="Prioritas lantai">
          <section className="rounded-lg border border-garage-line bg-garage-bg-1 p-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Prioritas lantai</h2>
            <p className="text-[12px] text-garage-dim">Tagihan, meja kotor, dan meja yang menunggu lama.</p>
            <div className="mt-3 space-y-2">
              {urgentTables.slice(0, 6).map((row) => (
                <button
                  key={`urgent-${row.tableNumber}`}
                  type="button"
                  onClick={() => setDetailTable(row.tableNumber)}
                  className="flex min-h-14 w-full items-center gap-2.5 rounded-md bg-garage-bg-2 p-2 text-left ring-1 ring-garage-line transition hover:ring-white/35"
                >
                  <TablePlate number={row.tableNumber} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white">{urgentReason(row)}</span>
                    <span className="block truncate text-[12px] text-garage-dim">
                      {row.staleFromPreviousDay
                        ? "Bill dari hari sebelumnya"
                        : row.timerMinutes > 0 && row.currentOrderId
                          ? `Duduk ${formatTableDuration(row.timerMinutes)}`
                          : row.tableLabel}
                    </span>
                  </span>
                </button>
              ))}
              {urgentTables.length > 6 ? (
                <p className="text-[12px] text-garage-dim">+{urgentTables.length - 6} meja lain perlu perhatian.</p>
              ) : null}
              {urgentTables.length === 0 ? (
                <EmptyState title="Lantai terkendali" body="Belum ada meja yang perlu prioritas." />
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      {pickerOpen ? (
        <TablePicker
          tables={tables}
          pendingTable={openingTable}
          onPick={openWaiterOrder}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

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
          onLifecycle={(row, action) => void handleLifecycle(row, action)}
          onOrder={openWaiterOrder}
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
        @keyframes waiterGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(244, 244, 245, 0);
          }
          25% {
            box-shadow: 0 0 0 5px rgba(244, 244, 245, 0.45);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(244, 244, 245, 0);
          }
        }
      `}</style>
    </div>
  );
}
