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
  Sparkles,
  Sparkle,
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

type Props = {
  me: GarageMe;
};

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

function tableTone(row: TableLiveRow) {
  if (row.needsCleaning || row.status === "needs_cleaning") {
    return {
      ring: "ring-[#d11a2a]/55",
      bg: "bg-[#d11a2a]/14",
      label: "Perlu Bersih",
      labelColor: "text-[#ffe1e5]",
    };
  }
  if (row.status === "empty") {
    return {
      ring: "ring-[#22c55e]/55",
      bg: "bg-[#22c55e]/12",
      label: "READY",
      labelColor: "text-[#bbf7d0]",
    };
  }
  if (row.status === "paid") {
    return {
      ring: "ring-[#22c55e]/55",
      bg: "bg-[#22c55e]/16",
      label: "LUNAS",
      labelColor: "text-[#bbf7d0]",
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
      label: "Belum Bayar",
      labelColor: "text-[#ffd08a]",
    };
  }
  if (row.status === "awaiting_payment") {
    return {
      ring: "ring-[#fbbf24]/60",
      bg: "bg-[#fbbf24]/14",
      label: "Bill Kasir",
      labelColor: "text-[#fde68a]",
    };
  }
  return {
    ring: "ring-white/15",
    bg: "bg-white/[0.04]",
    label: row.status.replace(/_/g, " ").toUpperCase(),
    labelColor: "text-white/70",
  };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [actingTicket, setActingTicket] = useState<string | null>(null);
  const [actingTable, setActingTable] = useState<string | null>(null);
  const [actingBillTable, setActingBillTable] = useState<string | null>(null);
  // Lazy initial state - baca localStorage 1x saat mount, tanpa effect.
  const [prefs, setPrefs] = useState<WaiterNotifyPrefs>(() => loadNotifyPrefs());
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
    () => tables.filter((t) => t.status === "awaiting_payment").length,
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

  return (
    <div className="space-y-4">
      {/* Header sticky tipis */}
      <div className="sticky top-0 z-20 -mx-3 border-b border-white/8 bg-[#0b0b0c]/85 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#0b0b0c]/70 sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#d11a2a]/15 text-[#ff8a93] ring-1 ring-[#d11a2a]/35">
              <BellRing size={16} />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-wider text-white/55">
                Waiter Station
              </p>
              <p className="text-sm font-semibold text-white">
                {me.user.name}
                <span className="ml-1 text-[11px] font-normal text-white/55">
                  / {me.role}
                </span>
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#22c55e]/15 px-2.5 py-1 text-[11px] font-semibold text-[#bbf7d0] ring-1 ring-[#22c55e]/35">
              <Sparkles size={12} /> {ready.length} Siap Antar
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/75 ring-1 ring-white/15">
              {readyTables} meja kosong
            </span>
            {billRequests > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fbbf24]/15 px-2.5 py-1 text-[11px] font-semibold text-[#fde68a] ring-1 ring-[#fbbf24]/35">
                <ReceiptText size={12} /> {billRequests} bill kasir
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleEnableSound}
              className={`grid h-9 w-9 place-items-center rounded-md ring-1 transition ${
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
              className={`grid h-9 w-9 place-items-center rounded-md ring-1 transition ${
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Ready to Deliver */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              Siap Antar
            </h2>
            <p className="text-[11px] text-white/55">
              {ready.length} order - auto-refresh 6d
            </p>
          </div>

          {ready.length === 0 ? (
            <EmptyState
              title="Belum ada order siap antar"
              body="Dashboard akan berdering & getar saat kitchen menandai order ready."
            />
          ) : (
            <ul className="space-y-2">
              {ready.map((t) => (
                <li
                  key={t.id}
                  className="group relative overflow-hidden rounded-xl border border-[#22c55e]/30 bg-gradient-to-br from-[#0e1a13]/95 to-[#0a0a0b]/95 p-3 shadow-[0_8px_28px_-12px_rgba(34,197,94,0.45)] transition motion-safe:animate-[waiterFadeIn_220ms_ease-out]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-[88px] flex-col items-center justify-center rounded-lg bg-[#22c55e]/12 px-2 py-2 ring-1 ring-[#22c55e]/35">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#86efac]">
                        Meja
                      </span>
                      <span className="text-3xl font-black leading-none text-white">
                        {t.table}
                      </span>
                      <span className={`mt-1 flex items-center gap-1 text-[10px] ${stationTone(t.station)}`}>
                        {stationIcon(t.station)} {t.station}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {statusBadge(t.status)}
                        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10px] font-mono text-white/70">
                          #{t.id}
                        </span>
                        {t.readyAt ? (
                          <span className="text-[10px] text-white/55">
                            ready {relativeFromNow(t.readyAt)}
                          </span>
                        ) : null}
                      </div>
                      <ul className="space-y-0.5 text-[13px] leading-snug text-white/85">
                        {t.items.slice(0, 6).map((item, idx) => (
                          <li key={`${t.id}-${idx}`} className="truncate">
                            - {item}
                          </li>
                        ))}
                        {t.items.length > 6 ? (
                          <li className="text-[11px] text-white/55">
                            +{t.items.length - 6} item lainnya
                          </li>
                        ) : null}
                      </ul>
                      {t.internalNotes ? (
                        <p className="mt-1 rounded bg-[#e8883a]/10 px-2 py-1 text-[11px] text-[#ffd08a] ring-1 ring-[#e8883a]/30">
                          Catatan: {t.internalNotes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeliver(t)}
                    disabled={actingTicket === t.id}
                    className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#22c55e] text-sm font-bold uppercase tracking-wide text-[#052e16] shadow-[0_6px_18px_-8px_rgba(34,197,94,0.7)] transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {actingTicket === t.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    Antar ke Meja {t.table}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Upcoming preview - awareness saja */}
          {upcoming.length > 0 ? (
            <details className="rounded-lg border border-white/8 bg-white/[0.025] p-2">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-white/55">
                Antrian Dapur ({upcoming.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {upcoming.slice(0, 8).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/75"
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
        </section>

        {/* Tables grid */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              Status Meja
            </h2>
            <p className="text-[11px] text-white/55">
              {tablesNeedingCleaning.length} perlu bersih - {readyTables} ready
            </p>
          </div>

          {tablesNeedingCleaning.length > 0 ? (
            <div className="rounded-lg border border-[#d11a2a]/35 bg-[#d11a2a]/8 px-3 py-2 text-[12px] text-[#ffd6da]">
              Prioritaskan bersihkan {tablesNeedingCleaning.length} meja agar tamu baru bisa duduk.
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
            {tables.map((row) => {
              const tone = tableTone(row);
              const needs = row.needsCleaning || row.status === "needs_cleaning";
              const isReady = row.status === "empty" && !row.needsCleaning;
              const canRequestBill =
                Boolean(row.currentOrderId) &&
                (row.status === "accepted" || row.status === "ready");
              const billAlreadyRequested = row.status === "awaiting_payment";
              const glow = recentlyCleaned.has(row.tableNumber);
              return (
                <div
                  key={row.tableNumber}
                  className={`group relative flex flex-col rounded-xl ${tone.bg} ring-1 ${tone.ring} p-2 transition ${
                    glow ? "motion-safe:animate-[waiterGlow_1300ms_ease-out]" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-white/55">
                      Meja
                    </span>
                    <span className={`text-[9px] font-semibold uppercase ${tone.labelColor}`}>
                      {tone.label}
                    </span>
                  </div>
                  <span className="text-2xl font-black leading-none text-white">
                    {row.tableNumber}
                  </span>
                  <div className="mt-1 min-h-[28px] text-[10px] leading-tight text-white/65">
                    {row.orderNo ? (
                      <span className="block truncate">#{row.orderNo}</span>
                    ) : isReady ? (
                      <span className="block text-[#86efac]">Siap pakai</span>
                    ) : (
                      <span className="block text-white/45">-</span>
                    )}
                    {row.timerMinutes > 0 ? (
                      <span className="block text-[9px] text-white/45">
                        {row.timerMinutes}m
                      </span>
                    ) : null}
                  </div>
                  {needs ? (
                    <button
                      type="button"
                      onClick={() => void handleClean(row)}
                      disabled={actingTable === row.tableNumber}
                      className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-[#22c55e] text-[11px] font-bold uppercase tracking-wide text-[#052e16] transition active:scale-[0.97] disabled:opacity-60"
                    >
                      {actingTable === row.tableNumber ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={12} />
                      )}
                      Bersih
                    </button>
                  ) : canRequestBill ? (
                    <button
                      type="button"
                      onClick={() => void handleRequestBill(row)}
                      disabled={actingBillTable === row.tableNumber}
                      className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-[#fbbf24] text-[10px] font-bold uppercase tracking-wide text-[#422006] transition active:scale-[0.97] disabled:opacity-60"
                    >
                      {actingBillTable === row.tableNumber ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ReceiptText size={12} />
                      )}
                      Bill
                    </button>
                  ) : billAlreadyRequested ? (
                    <div className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-[#fbbf24]/35 bg-[#fbbf24]/10 text-[10px] font-semibold uppercase tracking-wide text-[#fde68a]">
                      <ReceiptText size={12} />
                      Kasir
                    </div>
                  ) : (
                    <div className="mt-1 h-9" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

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
