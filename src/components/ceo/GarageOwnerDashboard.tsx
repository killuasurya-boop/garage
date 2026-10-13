"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChefHat,
  Gauge,
  RadioTower,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";

import styles from "./garage-owner-dashboard.module.css";
import { garageApi } from "@/lib/api-client";
import type { OpsCenterData } from "@/lib/ops-center-types";
import type { SalesReport } from "@/lib/sales-report";

// =============================================================================
// Owner Command Center (/control). Semua angka dari data nyata:
//   - /api/reports/sales (hari ini, WIB): omzet, transaksi, per jam, metode bayar
//   - /api/ops-center: antrean, produksi, ketepatan waktu, peringatan, stok menipis
// Sebelumnya halaman ini menampilkan angka contoh (hardcode) seolah "live".
// =============================================================================

type Tone = "red" | "amber" | "chrome" | "success" | "danger";

const toneColor: Record<Tone, string> = {
  red: "var(--garage-red-bright)",
  amber: "var(--garage-amber)",
  chrome: "var(--garage-silver)",
  success: "var(--garage-success)",
  danger: "var(--garage-red)",
};

const STATUS_TONE: Record<OpsCenterData["status"]["level"], Tone> = {
  normal: "success",
  busy: "amber",
  rush: "red",
  critical: "danger",
};

const rupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;

function compactIdr(value: number) {
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (value >= 1_000) return `Rp ${Math.round(value / 1_000)}rb`;
  return `Rp ${Math.round(value)}`;
}

function todayWib() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function MetricTile({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: ReactNode }) {
  return (
    <article className={styles.metricTile} style={{ "--tone": toneColor[tone] } as CSSProperties}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricCopy}>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </article>
  );
}

/** Omzet per jam hari ini (06.00–23.00) dari laporan penjualan. */
function HourlyChart({ hours }: { hours: SalesReport["hours"] }) {
  const width = 720;
  const height = 210;
  const byHour = new Map(hours.map((h) => [Number(h.key), h.revenue]));
  const values = Array.from({ length: 18 }, (_, i) => byHour.get(i + 6) ?? 0);
  const max = Math.max(...values, 1);
  const step = width / values.length;
  return (
    <svg className={styles.liveSvg} viewBox={`0 0 ${width} ${height + 22}`} role="img" aria-label="Omzet per jam hari ini">
      <g className={styles.gridLines}>
        {Array.from({ length: 4 }, (_, index) => (
          <line key={index} x1="0" x2={width} y1={(index + 1) * (height / 4)} y2={(index + 1) * (height / 4)} />
        ))}
      </g>
      {values.map((value, index) => {
        const h = (value / max) * (height - 16);
        return (
          <g key={index}>
            <rect x={index * step + 6} y={height - h} width={step - 12} height={Math.max(h, value > 0 ? 2 : 0)} rx="4" fill={toneColor.red} opacity={value > 0 ? 0.85 : 0} />
            {index % 2 === 0 ? (
              <text x={index * step + step / 2} y={height + 16} textAnchor="middle" fontSize="12" fill="#a1a1aa">
                {String(index + 6).padStart(2, "0")}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function GarageOwnerDashboard() {
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [ops, setOps] = useState<OpsCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = todayWib();
    const [salesResult, opsResult] = await Promise.allSettled([
      garageApi.get<{ report: SalesReport | null }>(`/api/reports/sales?from=${today}&to=${today}`, { cache: "no-store" }),
      garageApi.get<OpsCenterData>("/api/ops-center", { cache: "no-store" }),
    ]);
    if (salesResult.status === "fulfilled") setSales(salesResult.value.report);
    if (opsResult.status === "fulfilled") setOps(opsResult.value);
    const failed = [salesResult, opsResult].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failed.length) setError(failed.map((f) => (f.reason instanceof Error ? f.reason.message : "Gagal memuat data")).join(" · "));
    setUpdatedAt(new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date()));
    setLoading(false);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const summary = sales?.summary;
  const live = ops?.live;
  const statusTone = ops ? STATUS_TONE[ops.status.level] : "chrome";
  const dash = (value: number | null | undefined, suffix = "") => (value === null || value === undefined ? "—" : `${value}${suffix}`);

  return (
    <section className={styles.shell}>
      <div className={styles.signalLayer} />
      <div className={styles.noiseLayer} />

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <Gauge size={15} />
            GARAGE OS Control
          </span>
          <h1>Owner Command Center</h1>
          <p>Ringkasan hari ini dari data nyata POS, Production Hub, dan gudang — diperbarui otomatis tiap menit.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/os?module=dashboard">
              <Gauge size={16} />
              OS Dashboard
            </Link>
            <Link className={styles.secondaryButton} href="/control/financial">
              <TrendingUp size={16} />
              Kontrol Finance
            </Link>
            <Link className={styles.secondaryButton} href="/os?module=finance&tab=reports">
              <ReceiptText size={16} />
              Pusat Laporan
            </Link>
          </div>
        </div>

        <div className={styles.enginePanel}>
          <div className={styles.engineHeader}>
            <span>
              <RadioTower size={16} />
              Status Operasional
            </span>
            <strong style={{ color: toneColor[statusTone] }}>{ops?.status.label ?? (loading ? "Memuat…" : "—")}</strong>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-200">
            {(ops?.status.reasons.length ? ops.status.reasons : [ops ? "Tidak ada antrean bermasalah." : "Menunggu data Control Center."]).slice(0, 4).map((reason) => (
              <li key={reason} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
            <span>{updatedAt ? `Diperbarui ${updatedAt} WIB` : "Belum dimuat"}</span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden /> Muat ulang
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mx-auto mb-3 flex max-w-6xl items-center gap-2 rounded-lg border border-[#d11a2a]/50 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
          <AlertTriangle size={16} /> {error}
        </p>
      ) : null}

      <div className={styles.metricGrid}>
        <MetricTile label="Omzet Hari Ini" value={summary ? compactIdr(summary.gross) : "—"} note={summary ? `Bersih ${rupiah(summary.netSales)}` : "Laporan penjualan"} tone="red" icon={<TrendingUp size={18} />} />
        <MetricTile label="Transaksi Lunas" value={summary ? `${summary.transactions} trx` : "—"} note={summary ? `Rata-rata ${rupiah(summary.averageTicket)}` : "Hari ini (WIB)"} tone="amber" icon={<Wallet size={18} />} />
        <MetricTile label="Pesanan Aktif" value={dash(live?.activeOrders)} note={live ? `${live.waiting} antre · ${live.inProduction} dibuat · ${live.readyToServe} siap` : "Production Hub"} tone={statusTone} icon={<ChefHat size={18} />} />
        <MetricTile label="Tepat Waktu" value={dash(live?.onTimePct, "%")} note={live?.avgPrepMinutes != null ? `Rata-rata ${live.avgPrepMinutes} mnt/pesanan` : "Belum ada pesanan selesai"} tone="success" icon={<Timer size={18} />} />
      </div>

      <div className={styles.mainGrid}>
        <article className={styles.chartPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Hari ini · per jam</span>
              <h2>Omzet per Jam</h2>
            </div>
          </div>
          {sales && sales.hours.length ? (
            <HourlyChart hours={sales.hours} />
          ) : (
            <p className="py-16 text-center text-sm text-zinc-300">{loading ? "Memuat…" : "Belum ada penjualan lunas hari ini."}</p>
          )}
          <div className={styles.chartFooter}>
            {(sales?.paymentMethods ?? []).map((method) => (
              <span key={method.key}>
                {method.label} {compactIdr(method.revenue)}
              </span>
            ))}
          </div>
        </article>

        <article className={styles.sidePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Production Hub</span>
              <h2>Beban Station</h2>
            </div>
            <Activity size={18} />
          </div>
          <div className="space-y-3">
            {(ops?.stations ?? []).map((station) => (
              <div key={station.station}>
                <div className="mb-1 flex justify-between gap-3 text-sm text-zinc-200">
                  <strong>{station.station === "Bar" ? "Bar" : "Dapur"}</strong>
                  <span>
                    {station.waiting} antre · {station.processing} dibuat · {station.overSla} lewat target
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, station.loadPct)}%`, background: station.loadPct >= 80 ? toneColor.red : station.loadPct >= 50 ? toneColor.amber : toneColor.success }} />
                </div>
              </div>
            ))}
            {!ops?.stations.length ? <p className="text-sm text-zinc-300">{loading ? "Memuat…" : "Data station belum tersedia."}</p> : null}
          </div>
          <div className="mt-5 border-t border-white/10 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-300">
              <Boxes size={14} aria-hidden /> Stok menipis (prioritas)
            </p>
            <ul className="space-y-1 text-sm">
              {(ops?.prep.low ?? []).slice(0, 5).map((line) => (
                <li key={line.name} className="flex justify-between gap-2 text-zinc-100">
                  <span className="truncate">{line.name}</span>
                  <span className="shrink-0 tabular-nums text-[#ffb4b4]">
                    {line.onHand} / min {line.min} {line.unit}
                  </span>
                </li>
              ))}
              {ops && ops.prep.low.length === 0 ? <li className="text-zinc-300">Tidak ada stok di bawah minimum.</li> : null}
            </ul>
            <Link href="/warehouse/inventory" className="mt-2 inline-block text-xs font-semibold text-[#ffd79a] hover:underline">
              Buka gudang →
            </Link>
          </div>
        </article>
      </div>

      <div className="relative z-[1] grid gap-4 lg:grid-cols-2">
        <article className={styles.activityPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Control Center</span>
              <h2>Peringatan Aktif</h2>
            </div>
            <ShieldCheck size={18} />
          </div>
          <ul className="space-y-2">
            {(ops?.alerts ?? []).slice(0, 6).map((alert) => (
              <li key={alert.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm text-zinc-100">{alert.title}</strong>
                  <span
                    className="shrink-0 rounded px-2 py-0.5 text-xs font-bold"
                    style={{ color: toneColor[alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "amber" : "chrome"] }}
                  >
                    {alert.severity === "critical" ? "Kritis" : alert.severity === "warning" ? "Perhatian" : "Info"} · {alert.source}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-300">{alert.description}</p>
              </li>
            ))}
            {ops && ops.alerts.length === 0 ? <li className="text-sm text-zinc-300">Tidak ada peringatan saat ini.</li> : null}
          </ul>
        </article>

        <article className={styles.activityPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Penjualan hari ini</span>
              <h2>Produk Terlaris</h2>
            </div>
            <ReceiptText size={18} />
          </div>
          <ol className="space-y-1.5">
            {(sales?.products ?? []).slice(0, 8).map((product, index) => (
              <li key={product.key} className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 text-sm">
                <span className="min-w-0 truncate text-zinc-100">
                  <span className="mr-2 text-zinc-400">#{index + 1}</span>
                  {product.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-200">
                  {product.qty}× · {compactIdr(product.revenue)}
                </span>
              </li>
            ))}
            {sales && sales.products.length === 0 ? <li className="text-sm text-zinc-300">Belum ada produk terjual hari ini.</li> : null}
          </ol>
        </article>
      </div>
    </section>
  );
}
