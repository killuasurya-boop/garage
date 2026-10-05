"use client";

// =============================================================================
// GARAGE CONTROL CENTER — layar keputusan operasional bersama (semua staf).
// Menjawab dalam 2–3 detik: Apa yang terjadi? Apa yang urgent? Apa yang harus
// dikerjakan SEKARANG? Apakah Garage membaik? Data: GET /api/ops-center
// (satu sumber: Production Hub + tabel yang ada). Aksi MULAI BATCH memakai API
// batch Production Hub yang sama (atomik, anti dobel).
// =============================================================================

import {
  Activity,
  BellRing,
  Boxes,
  ChefHat,
  Clock3,
  Coffee,
  Gauge,
  Layers,
  ListOrdered,
  Radar,
  RefreshCw,
  Sparkles,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Chip,
  elapsedMin,
  fmtClock,
  fmtPct,
  KpiTile,
  LoadBar,
  Panel,
  SEVERITY_STYLE,
  STATUS_STYLE,
  TrendText,
} from "@/components/garage/ops-center/ops-parts";
import { GarageApiError, garageApi } from "@/lib/api-client";
import type { GarageMe } from "@/lib/garage-api-types";
import { GARAGE_TAGS, invalidateGarageCache, subscribeGarageCache } from "@/lib/garage-cache";
import type { ModuleId } from "@/lib/garage-data";
import { voice } from "@/lib/garage-voice";
import type { OpsStation } from "@/lib/ops-center-engine";
import type { OpsCenterData, OpsStationView } from "@/lib/ops-center-types";
import { useProductionStream } from "@/lib/use-production-stream";
import { chitCustomerName } from "@/lib/station-print";

const POLL_MS = 10_000;
// Saat stream realtime terhubung, polling hanya cadangan.
const POLL_LIVE_MS = 30_000;
const SOUND_KEY = "garage:ops-center-sound";
const stationLabel = (s: OpsStation) => (s === "Bar" ? "Bar" : "Dapur");
/** "Meja 05 · Andi" — nama pemesan tanpa mengulang label meja. */
const tableAndName = (row: { identity: string; table: string }) => {
  const name = chitCustomerName(row);
  return name ? `${row.table} · ${name}` : row.table;
};

function readSound() {
  try {
    return typeof window !== "undefined" && localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export function OpsCenterView({ me, onNavigate }: { me: GarageMe; onNavigate: (module: ModuleId) => void }) {
  const [data, setData] = useState<OpsCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(readSound);
  const lastLevel = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      setData(await garageApi.get<OpsCenterData>("/api/ops-center", { cache: "no-store" }));
      setError(null);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Control Center gagal dimuat.");
    } finally {
      if (!silent) setSyncing(false);
    }
  }, []);

  const refreshSilently = useCallback(() => void load(true), [load]);
  const { connected: streamLive } = useProductionStream(refreshSilently);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal; state di-set di callback async
    void load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void load(true);
    };
    const id = window.setInterval(tick, streamLive ? POLL_LIVE_MS : POLL_MS);
    document.addEventListener("visibilitychange", tick);
    const unsub = subscribeGarageCache(GARAGE_TAGS.kitchen, () => void load(true));
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      unsub();
    };
  }, [load, streamLive]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Bunyi lembut hanya saat status NAIK ke RUSH/KRITIS (bukan tiap refresh).
  useEffect(() => {
    const level = data?.status.level ?? null;
    const prev = lastLevel.current;
    lastLevel.current = level;
    if (!sound || !level || !prev) return;
    const rank = ["normal", "busy", "rush", "critical"];
    if (rank.indexOf(level) > rank.indexOf(prev) && rank.indexOf(level) >= 2) {
      void voice.playDing("alert");
    }
  }, [data?.status.level, sound]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* abaikan */
    }
    if (next) void voice.playDing("soft");
  }

  async function startBatch(ids: string[], key: string) {
    if (busyKey) return;
    setBusyKey(key);
    setActionMsg(null);
    try {
      await garageApi.post("/api/production/batches", { ticketItemIds: ids });
      invalidateGarageCache([GARAGE_TAGS.kitchen]);
      setActionMsg("Batch dimulai — lanjutkan alokasi & QC di Production.");
      await load(true);
    } catch (err) {
      // Status di layar tidak berubah bila server menolak (mis. diambil staf lain).
      setActionMsg(err instanceof GarageApiError ? err.message : "Batch gagal dimulai.");
      await load(true);
    } finally {
      setBusyKey(null);
    }
  }

  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(now)),
    [now],
  );

  if (!data) {
    return (
      <section className="space-y-3 px-2 sm:px-3 lg:px-4">
        <div className="rounded-lg border border-[#34343c] bg-[#131318] p-6 text-center text-sm text-[#d0d0d6]">
          {error ? (
            <>
              <p className="font-bold text-[#ffb3b3]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 h-11 rounded-md border border-[#4a4a54] px-4 font-black text-white"
              >
                Coba lagi
              </button>
            </>
          ) : (
            "Memuat Control Center…"
          )}
        </div>
      </section>
    );
  }

  const st = STATUS_STYLE[data.status.level];
  const StatusIcon = st.icon;
  const live = data.live;
  const oldestQueue = data.queue.find((q) => q.status === "queue");

  return (
    <section className="flex flex-col gap-3 px-2 sm:px-3 lg:px-4" aria-label="Garage Control Center">
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <header className="rounded-lg border border-[#34343c] bg-[#111116] p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-black uppercase leading-tight text-white sm:text-2xl">
              <Radar className="size-6 text-[#d11a2a]" aria-hidden />
              Garage Control Center
            </h2>
            <p className="text-sm text-[#b8b8c2]">Real-Time Operations • Smart Production • Team KPI</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px] font-black uppercase ${
                streamLive ? "border-[#4a4a54] text-white" : "border-[#f5a742]/50 text-[#ffd79a]"
              }`}
              title={streamLive ? "Update langsung dari server" : "Koneksi realtime belum tersambung — memuat ulang tiap 10 detik"}
            >
              <span className={`size-2 rounded-full ${streamLive ? "bg-[#d4d4d8] motion-safe:animate-pulse" : "bg-[#f5a742]"}`} aria-hidden />
              {streamLive ? "Live" : "Polling"}
            </span>
            <span className="font-mono text-2xl font-black tabular-nums text-white" aria-label="Jam WIB">
              {clock}
            </span>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? "Matikan suara peringatan" : "Nyalakan suara peringatan"}
              className={`grid size-11 place-items-center rounded-md border transition-colors ${
                sound ? "border-[#f5a742]/60 bg-[#f5a742]/12 text-[#ffd79a]" : "border-[#4a4a54] bg-white/[0.04] text-[#b8b8c2]"
              }`}
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={syncing}
              aria-label="Muat ulang"
              className="grid size-11 place-items-center rounded-md border border-[#4a4a54] bg-white/[0.04] text-[#e4e4e7] disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${syncing ? "motion-safe:animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 ${st.box}`} role="status">
          <span className={`size-2.5 rounded-full ${st.dot}`} aria-hidden />
          <StatusIcon className="size-5" aria-hidden />
          <span className="font-mono text-lg font-black tracking-wide">STATUS: {data.status.label}</span>
          <span className="text-sm font-semibold">{data.status.reasons.join(" · ")}</span>
        </div>
        {error ? <p className="mt-2 text-xs text-[#ffb3b3]">Gagal memperbarui: {error} (menampilkan data terakhir)</p> : null}
        {actionMsg ? <p className="mt-2 text-sm font-semibold text-[#ffd79a]" role="status">{actionMsg}</p> : null}
      </header>

      {/* ── LIVE KPI ────────────────────────────────────────────── */}
      {/* Di HP: Status → Sekarang kerjakan → KPI → sisanya. */}
      <div className="grid grid-cols-2 gap-2 max-md:order-2 sm:grid-cols-4 xl:grid-cols-8">
        <KpiTile label="Order aktif" value={String(live.activeOrders)} />
        <KpiTile label="Menunggu" value={String(live.waiting)} tone={live.waiting >= 8 ? "red" : live.waiting >= 4 ? "amber" : "neutral"} />
        <KpiTile label="Diproses" value={String(live.inProduction)} tone="amber" />
        <KpiTile label="Siap antar" value={String(live.readyToServe)} tone={data.serving.delayed ? "red" : "silver"} sub={data.serving.delayed ? `${data.serving.delayed} tertunda` : undefined} />
        <KpiTile
          label="Tertua"
          value={oldestQueue ? fmtClock(elapsedMin(oldestQueue.createdAt, now)) : "—"}
          tone={oldestQueue?.overSla ? "red" : oldestQueue?.slaRisk ? "amber" : "neutral"}
          sub={oldestQueue ? `${oldestQueue.table} · ${stationLabel(oldestQueue.station)}` : "Tidak ada antrean"}
        />
        <KpiTile label="Rata-rata saji" value={fmtClock(live.avgPrepMinutes)} sub="hari ini" />
        <KpiTile label="Tepat waktu" value={fmtPct(live.onTimePct)} tone={live.onTimePct != null && live.onTimePct < 80 ? "red" : "neutral"} sub="hari ini" />
        <KpiTile label="Efisiensi batch" value={fmtPct(live.batchEfficiencyPct)} sub={`${live.batchOpportunities} peluang batch`} />
      </div>

      {/* ── NOW ─────────────────────────────────────────────────── */}
      <Panel
        className="max-md:order-1"
        title="Sekarang kerjakan"
        icon={Activity}
        right={<span className="text-xs text-[#b8b8c2]">FIFO + Smart Batch + perlindungan SLA</span>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {data.stations.map((s) => (
            <NowCard
              key={s.station}
              station={s}
              now={now}
              canOperate={data.canOperate[s.station]}
              busyKey={busyKey}
              onStart={startBatch}
              onOpen={() => onNavigate("kitchen")}
            />
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-3 max-md:order-3">
      {/* ── ALERT · ANTREAN · BEBAN ─────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Peringatan" icon={BellRing} right={<span className="font-mono text-xs text-[#b8b8c2]">{data.alerts.length}</span>}>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-[#d0d0d6]">Tidak ada peringatan. Operasional aman.</p>
          ) : (
            <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {data.alerts.map((a) => {
                const sv = SEVERITY_STYLE[a.severity];
                const Icon = sv.icon;
                return (
                  <li key={a.id} className={`rounded-md border p-2.5 ${sv.box}`}>
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 size-4 shrink-0 text-[#ffd79a]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black leading-snug text-white">
                          <span className="mr-1.5 font-mono text-[10px] text-[#d4d4d8]">{sv.label}</span>
                          {a.title}
                        </p>
                        <p className="text-xs leading-snug text-[#d0d0d6]">{a.description}</p>
                      </div>
                      {a.actionModule && a.actionLabel ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(a.actionModule!)}
                          className="h-9 shrink-0 rounded-md border border-[#4a4a54] bg-white/[0.05] px-2.5 text-xs font-black text-white hover:bg-white/[0.1]"
                        >
                          {a.actionLabel}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Antrean pelanggan (FIFO)" icon={ListOrdered} right={<span className="font-mono text-xs text-[#b8b8c2]">urut jam order</span>}>
          {data.queue.length === 0 ? (
            <p className="text-sm text-[#d0d0d6]">Antrean kosong.</p>
          ) : (
            <ol className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
              {data.queue.map((q, idx) => (
                <li
                  key={q.ticketNo}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${
                    q.overSla ? "border-[#d11a2a]/70 bg-[#2a1116]" : q.slaRisk ? "border-[#f5a742]/50 bg-[#f5a742]/[0.06]" : "border-[#34343c] bg-[#16161b]"
                  }`}
                >
                  <span className="w-5 shrink-0 font-mono text-xs font-black text-[#a8a8b2]">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-black leading-tight text-white">
                      {tableAndName(q)} <span className="font-semibold text-[#d0d0d6]">· {stationLabel(q.station)}</span>
                    </p>
                    <p className="truncate text-xs text-[#b8b8c2]" title={q.items.join(", ")}>
                      {q.status === "cooking" ? "Diproses · " : ""}
                      {q.items.join(", ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-base font-black tabular-nums text-white">{fmtClock(elapsedMin(q.createdAt, now))}</p>
                    <p className="font-mono text-[10px] font-bold uppercase text-[#d4d4d8]">
                      {q.overSla ? "Lewat SLA" : q.slaRisk ? "Hampir SLA" : `Target ${q.targetMinutes}m`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Beban station" icon={Gauge}>
          <div className="space-y-4">
            {data.stations.map((s) => (
              <LoadBar
                key={s.station}
                label={stationLabel(s.station)}
                pct={s.loadPct}
                level={s.loadLevel}
                detail={`${s.waiting} menunggu · ${s.processing} diproses · ${s.staffOnShift || "belum ada"} staf absen`}
              />
            ))}
            <LoadBar
              label="Serving"
              pct={data.serving.loadPct}
              level={data.serving.loadLevel}
              detail={`${data.serving.ready.length} siap antar · ${data.serving.waitersOnShift || "belum ada"} waiter absen`}
            />
          </div>
          {data.bottlenecks.length ? (
            <div className="mt-4 space-y-2 border-t border-[#34343c] pt-3">
              {data.bottlenecks.map((b) => (
                <div key={b.area} className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/[0.06] p-2">
                  <p className="text-sm font-black text-white">⚠ {b.area} tertahan</p>
                  <p className="text-xs text-[#d0d0d6]">Saran: {b.recommendation}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 border-t border-[#34343c] pt-3 text-xs text-[#d0d0d6]">Tidak ada bottleneck.</p>
          )}
        </Panel>
      </div>

      {/* ── SIAP ANTAR ──────────────────────────────────────────── */}
      <Panel
        title="Siap antar"
        icon={Clock3}
        right={
          <span className="font-mono text-xs text-[#b8b8c2]">
            rata-rata ambil {fmtClock(data.serving.avgServingDelayMinutes)}
          </span>
        }
      >
        {data.serving.ready.length === 0 ? (
          <p className="text-sm text-[#d0d0d6]">Belum ada pesanan siap.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {data.serving.ready.map((r) => {
              const mins = elapsedMin(r.readyAt, now);
              const delayed = mins > 3;
              return (
                <div
                  key={r.ticketNo}
                  className={`rounded-md border p-2.5 ${delayed ? "border-[#d11a2a]/70 bg-[#2a1116]" : "border-[#34343c] bg-[#16161b]"}`}
                >
                  <p className="break-words text-base font-black leading-tight text-white">{r.table}</p>
                  <p className="break-words text-xs text-[#d0d0d6]">
                    {chitCustomerName(r) ? `${chitCustomerName(r)} · ` : ""}
                    {stationLabel(r.station)} · {r.items} porsi
                  </p>
                  <p className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-lg font-black tabular-nums text-white">{fmtClock(mins)}</span>
                    <Chip tone={delayed ? "red" : r.called ? "amber" : "neutral"}>
                      {delayed ? "Menunggu runner" : r.called ? "Waiter dipanggil" : "Siap"}
                    </Chip>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── KPI TIM · KPI SAYA ──────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="KPI tim hari ini" icon={TrendingUp} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiTile label="Order" value={String(data.team.ordersToday)} sub={`${data.team.completedToday} lunas`} />
            <KpiTile label="Tepat waktu" value={fmtPct(data.team.today.onTimePct)} sub={`${data.team.today.ready} tiket siap`} />
            <KpiTile label="Rata-rata saji" value={fmtClock(data.team.today.avgPrepMinutes)} sub={`antre ${fmtClock(data.team.today.avgQueueMinutes)}`} />
            <KpiTile label="Efisiensi batch" value={fmtPct(data.team.today.batchEfficiencyPct)} />
            <KpiTile label="Lewat SLA" value={String(data.team.today.overSla)} tone={data.team.today.overSla ? "amber" : "neutral"} />
            <KpiTile label="Dikembalikan" value={String(data.team.remakeToday)} sub="remake / QC ulang" />
            <KpiTile label="Batal" value={String(data.team.cancelledToday)} />
            <KpiTile label="Ambil pesanan" value={fmtClock(data.team.today.avgServingDelayMinutes)} sub="siap → diantar" />
          </div>
          <div className="mt-3 grid gap-2 rounded-md border border-[#34343c] bg-[#16161b] p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase text-[#a8a8b2]">Rata-rata saji</p>
              <p className="text-white">
                Hari ini <b className="font-mono">{fmtClock(data.team.today.avgPrepMinutes)}</b> · Kemarin{" "}
                <b className="font-mono">{fmtClock(data.team.yesterday.avgPrepMinutes)}</b> · 7 hari{" "}
                <b className="font-mono">{fmtClock(data.team.week.avgPrepMinutes)}</b>
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] font-bold uppercase text-[#a8a8b2]">vs 7 hari</p>
              <TrendText change={data.team.trend.avgPrepVsWeekPct} />
            </div>
            <div>
              <p className="font-mono text-[11px] font-bold uppercase text-[#a8a8b2]">Tepat waktu vs 7 hari</p>
              <TrendText change={data.team.trend.onTimeVsWeekPts} lowerIsBetter={false} suffix=" poin" />
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.stations.map((s) => (
              <div key={s.station} className="rounded-md border border-[#34343c] bg-[#16161b] p-2.5 text-sm text-[#d0d0d6]">
                <p className="font-black text-white">{stationLabel(s.station)}</p>
                <p>
                  {s.kpi.ready} tiket · tepat waktu {fmtPct(s.kpi.onTimePct)} · rata-rata {fmtClock(s.kpi.avgPrepMinutes)} · batch{" "}
                  {fmtPct(s.kpi.batchEfficiencyPct)}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Performa saya" icon={User}>
          <p className="mb-2 break-words text-sm font-bold text-white">{data.me.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <KpiTile label="Tiket dibuat" value={String(data.me.handled)} />
            <KpiTile label="Diantar" value={String(data.me.served)} />
            <KpiTile label="Tepat waktu" value={fmtPct(data.me.onTimePct)} />
            <KpiTile label="Rata-rata" value={fmtClock(data.me.avgPrepMinutes)} />
          </div>
          <p className="mt-2 text-xs leading-snug text-[#a8a8b2]">
            Hanya terlihat oleh Anda. Dihitung dari nama yang tercatat di tiket hari ini. Tidak ada peringkat publik.
          </p>
        </Panel>
      </div>

      {/* ── INSIGHT · FORECAST · PREP ───────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Smart insight" icon={Sparkles}>
          {data.insights.length === 0 ? (
            <p className="text-sm text-[#d0d0d6]">Data belum cukup untuk insight. Insight muncul otomatis setelah ada riwayat order.</p>
          ) : (
            <ul className="space-y-2">
              {data.insights.map((i) => (
                <li key={i.id} className="rounded-md border border-[#34343c] bg-[#16161b] p-2.5">
                  <p className="text-sm font-black text-white">⚡ {i.title}</p>
                  <p className="text-xs text-[#d0d0d6]">{i.detail}</p>
                  <p className="mt-1 text-xs font-bold text-[#ffd79a]">Saran: {i.recommendation}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Perkiraan 60 menit" icon={Clock3}>
          {data.forecast.status === "insufficient" ? (
            <p className="text-sm text-[#d0d0d6]">
              Data historis belum cukup ({data.forecast.weeksWithData} dari minimal 2 minggu di jam & hari yang sama). Perkiraan
              tidak ditampilkan agar tidak mengarang.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#d0d0d6]">Perkiraan order masuk</p>
              <p className="font-mono text-4xl font-black tabular-nums text-white">
                {data.forecast.expectedMin}–{data.forecast.expectedMax}
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip tone={data.forecast.bar === "TINGGI" ? "red" : data.forecast.bar === "SEDANG" ? "amber" : "neutral"}>
                  Bar {data.forecast.bar}
                </Chip>
                <Chip tone={data.forecast.kitchen === "TINGGI" ? "red" : data.forecast.kitchen === "SEDANG" ? "amber" : "neutral"}>
                  Dapur {data.forecast.kitchen}
                </Chip>
              </div>
              <p className="text-xs text-[#a8a8b2]">Dari {data.forecast.weeksWithData} minggu terakhir, jam & hari yang sama.</p>
            </div>
          )}
        </Panel>

        <Panel title="Persiapan & stok" icon={Boxes} right={
          <button type="button" onClick={() => onNavigate("inventory")} className="h-8 rounded-md border border-[#4a4a54] px-2 text-xs font-black text-white">
            Cek stok
          </button>
        }>
          {data.prep.low.length === 0 && data.prep.watch.length === 0 ? (
            <p className="text-sm text-[#d0d0d6]">Semua bahan di atas batas minimum.</p>
          ) : (
            <ul className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {[...data.prep.low.map((r) => ({ ...r, low: true })), ...data.prep.watch.map((r) => ({ ...r, low: false }))].map((r) => (
                <li key={`${r.name}-${r.low}`} className="flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#16161b] px-2.5 py-1.5">
                  <span className="min-w-0 break-words text-sm font-bold text-white">{r.name}</span>
                  <span className="shrink-0 text-right">
                    <Chip tone={r.low ? "red" : "amber"}>{r.low ? "Menipis" : "Pantau"}</Chip>
                    <span className="ml-1.5 font-mono text-xs text-[#d0d0d6]">
                      {r.onHand}/{r.min} {r.unit}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-[#a8a8b2]">Rekomendasi persiapan saja — stok tidak dipotong dari sini.</p>
        </Panel>
      </div>

      </div>

      <p className="pb-2 text-center text-[11px] text-[#8f8f99] max-md:order-4">
        Diperbarui {new Date(data.generatedAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · batch window{" "}
        {Math.round(data.batchWindowSec / 60)} menit · {me.role}
      </p>
    </section>
  );
}

function NowCard({
  station,
  now,
  canOperate,
  busyKey,
  onStart,
  onOpen,
}: {
  station: OpsStationView;
  now: number;
  canOperate: boolean;
  busyKey: string | null;
  onStart: (ids: string[], key: string) => void;
  onOpen: () => void;
}) {
  const nba = station.nextBestAction;
  const Icon = station.station === "Bar" ? Coffee : ChefHat;
  const others = station.suggestions.filter((s) => nba.kind !== "batch" || s.key !== nba.suggestion.key).slice(0, 2);

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-[#34343c] bg-[#16161b] p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-base font-black uppercase text-white">
          <Icon className="size-5 text-[#d4d4d8]" aria-hidden /> {stationLabel(station.station)}
        </h4>
        <span className="font-mono text-xs text-[#d0d0d6]">
          Beban <b className="text-white">{station.loadPct}%</b> · {station.waiting} menunggu · {station.processing} diproses
        </span>
      </header>

      <div className="mt-3 flex-1">
        {nba.kind === "idle" ? (
          <p className="rounded-md border border-[#34343c] bg-black/20 p-4 text-sm text-[#d0d0d6]">
            Tidak ada antrean. Siap menerima order.
          </p>
        ) : nba.kind === "batch" ? (
          <div className="rounded-md border-2 border-[#f5a742]/60 bg-[#f5a742]/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="amber">
                <Layers className="size-3" aria-hidden /> Smart batch
              </Chip>
              <Chip tone={nba.score.label === "TINGGI" ? "amber" : "neutral"}>Skor {nba.score.score} · {nba.score.label}</Chip>
              <Chip tone={nba.score.slaRisk === "BERISIKO" ? "red" : "neutral"}>SLA {nba.score.slaRisk}</Chip>
            </div>
            <p className="mt-2 break-words text-2xl font-black leading-tight text-white">
              {nba.suggestion.itemLabel} <span className="text-[#ffd79a]">×{nba.suggestion.totalQty}</span>
            </p>
            {nba.suggestion.note ? <p className="text-sm font-bold text-[#ffd79a]">Catatan: {nba.suggestion.note}</p> : null}
            <p className="text-xs text-[#d0d0d6]">
              {nba.score.orders} order · hemat {nba.score.setupsSaved}× mulai · tertua {fmtClock(elapsedMin(nba.suggestion.oldestAt, now))}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {nba.suggestion.items.map((i) => (
                <li key={i.id} className="rounded-sm border border-[#4a4a54] bg-black/25 px-2 py-1 text-xs font-bold text-white">
                  {tableAndName(i)} ×{i.qty}
                </li>
              ))}
            </ul>
            {station.suggestions.find((s) => s.key === nba.suggestion.key)?.stockRisk.length ? (
              <p className="mt-2 text-xs font-bold text-[#ffb3b3]">
                ⚠ Stok menipis: {(() => {
                  const list = station.suggestions.find((s) => s.key === nba.suggestion.key)!.stockRisk;
                  return list.length > 4 ? `${list.slice(0, 4).join(", ")} +${list.length - 4} lainnya` : list.join(", ");
                })()}
              </p>
            ) : null}
            {canOperate ? (
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => onStart(nba.suggestion.items.map((i) => i.id), nba.suggestion.key)}
                className="mt-3 h-12 w-full rounded-md bg-[#d11a2a] text-sm font-black uppercase text-white shadow-[0_0_18px_rgba(209,26,42,0.35)] transition active:scale-[0.99] disabled:opacity-60"
              >
                {busyKey === nba.suggestion.key ? "Memulai…" : `Mulai batch ×${nba.suggestion.totalQty}`}
              </button>
            ) : (
              <button type="button" onClick={onOpen} className="mt-3 h-11 w-full rounded-md border border-[#4a4a54] text-sm font-black text-white">
                Buka Production
              </button>
            )}
          </div>
        ) : (
          <div
            className={`rounded-md border-2 p-3 ${
              nba.reason === "SLA_PROTECTION" ? "border-[#d11a2a]/80 bg-[#2a1116]" : "border-[#4a4a54] bg-black/20"
            }`}
          >
            <Chip tone={nba.reason === "SLA_PROTECTION" ? "red" : "neutral"}>
              {nba.reason === "SLA_PROTECTION" ? "Lindungi SLA — order tertua" : "FIFO — order berikutnya"}
            </Chip>
            <p className="mt-2 break-words text-2xl font-black leading-tight text-white">
              {nba.ticket.table}
              {chitCustomerName(nba.ticket) ? (
                <span className="text-lg text-[#d0d0d6]"> · {chitCustomerName(nba.ticket)}</span>
              ) : null}
            </p>
            <p className="text-sm text-[#e4e4e7]">
              {nba.ticket.items.map((i) => `${i.qty}× ${i.label}${i.note ? ` (${i.note})` : ""}`).join(", ")}
            </p>
            <p className="mt-1 font-mono text-sm font-black text-white">
              Menunggu {fmtClock(elapsedMin(nba.ticket.createdAt, now))} · target {nba.ticket.targetMinutes}m
            </p>
            <button type="button" onClick={onOpen} className="mt-3 h-11 w-full rounded-md border border-[#4a4a54] text-sm font-black text-white">
              {canOperate ? "Kerjakan di Production" : "Buka Production"}
            </button>
          </div>
        )}
      </div>

      {others.length ? (
        <div className="mt-3 border-t border-[#34343c] pt-2">
          <p className="mb-1 font-mono text-[11px] font-bold uppercase text-[#a8a8b2]">Peluang batch lain</p>
          <ul className="space-y-1">
            {others.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-2 text-sm text-white">
                <span className="min-w-0 break-words">
                  {s.itemLabel} ×{s.totalQty}
                  {s.note ? <span className="text-[#ffd79a]"> ({s.note})</span> : null}
                  <span className="text-xs text-[#b8b8c2]"> · {s.score.orders} order</span>
                </span>
                <span className="shrink-0 font-mono text-xs font-black text-[#d4d4d8]">Skor {s.score.score}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
