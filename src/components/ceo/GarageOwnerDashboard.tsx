"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  DatabaseZap,
  Gauge,
  Network,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";

import styles from "./garage-owner-dashboard.module.css";

type ModuleTone = "red" | "amber" | "chrome" | "success" | "danger";

type OwnerModule = {
  id: string;
  title: string;
  label: string;
  value: number;
  unit: string;
  tone: ModuleTone;
  icon: ReactNode;
};

type ActivityRow = {
  time: string;
  source: string;
  event: string;
  signal: string;
  tone: "safe" | "watch" | "risk";
};

type ModelStatus = {
  name: string;
  metric: string;
  value: number;
  tone: ModuleTone;
};

const modules: OwnerModule[] = [
  {
    id: "owner-ai",
    title: "Performa Owner AI",
    label: "Kualitas analisa",
    value: 94,
    unit: "%",
    tone: "red",
    icon: <BrainCircuit size={18} />,
  },
  {
    id: "queue-flow",
    title: "Arus Antrian",
    label: "Sinyal order live",
    value: 1280,
    unit: "/m",
    tone: "amber",
    icon: <Network size={18} />,
  },
  {
    id: "sales-signal",
    title: "Sinyal Penjualan",
    label: "Momentum demand",
    value: 87,
    unit: "%",
    tone: "success",
    icon: <TrendingUp size={18} />,
  },
  {
    id: "stock-forecast",
    title: "Prediksi Stok",
    label: "Stabilitas forecast",
    value: 76,
    unit: "%",
    tone: "chrome",
    icon: <DatabaseZap size={18} />,
  },
  {
    id: "system-health",
    title: "Kesehatan Sistem",
    label: "Uptime operasional",
    value: 99,
    unit: "%",
    tone: "success",
    icon: <ShieldCheck size={18} />,
  },
  {
    id: "data-stream",
    title: "Data Realtime",
    label: "Event diproses",
    value: 342,
    unit: "/s",
    tone: "amber",
    icon: <RadioTower size={18} />,
  },
  {
    id: "garage-engine",
    title: "GARAGE Model Engine",
    label: "Decision engine",
    value: 91,
    unit: "%",
    tone: "red",
    icon: <Cpu size={18} />,
  },
];

const activities: ActivityRow[] = [
  { time: "07:42", source: "POS", event: "Omzet breakfast naik di atas baseline", signal: "+18.4%", tone: "safe" },
  { time: "07:39", source: "Stok", event: "Arabica mendekati batas aman", signal: "2.1 hari", tone: "watch" },
  { time: "07:34", source: "Finance", event: "Settlement non-tunai menunggu review owner", signal: "5 item", tone: "watch" },
  { time: "07:28", source: "Dapur", event: "Serve time membaik setelah station dibagi ulang", signal: "-42 dtk", tone: "safe" },
  { time: "07:21", source: "Risiko", event: "Diskon manual anomali perlu validasi", signal: "Tinggi", tone: "risk" },
];

const modelStatus: ModelStatus[] = [
  { name: "Demand Forecast", metric: "Prediksi demand", value: 96, tone: "red" },
  { name: "Cashflow Guard", metric: "Model finance", value: 88, tone: "success" },
  { name: "Ops Pulse", metric: "Model antrian", value: 92, tone: "amber" },
  { name: "Risk Radar", metric: "Anomali outlet", value: 81, tone: "danger" },
];

const toneColor: Record<ModuleTone, string> = {
  red: "var(--garage-red-bright)",
  amber: "var(--garage-amber)",
  chrome: "var(--garage-silver)",
  success: "var(--garage-success)",
  danger: "var(--garage-red)",
};

// Frame statis — chart digambar sekali pada nilai tetap supaya UI tidak terus
// menerus berputar/blink. Dashboard akan re-render saat data nyata tersedia.
const STATIC_FRAME = 1;

function formatCompactIdr(value: number) {
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `Rp ${Math.round(value / 1_000)}rb`;
  return `Rp ${Math.round(value)}`;
}

function makeSignal(seed: number, frame: number, count = 28) {
  return Array.from({ length: count }, (_, index) => {
    const primary = Math.sin(frame * 1.1 + index * 0.52 + seed) * 12;
    const secondary = Math.cos(frame * 0.58 + index * 0.22 + seed * 2) * 6;
    return 48 + primary + secondary;
  });
}

function pathFromValues(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height * 0.7) - height * 0.15;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function areaFromValues(values: number[], width: number, height: number) {
  const line = pathFromValues(values, width, height);
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function MetricTile({
  label,
  value,
  delta,
  tone,
  icon,
}: {
  label: string;
  value: string;
  delta: string;
  tone: ModuleTone;
  icon: ReactNode;
}) {
  return (
    <article className={styles.metricTile} style={{ "--tone": toneColor[tone] } as CSSProperties}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricCopy}>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>
          <ArrowUpRight size={14} />
          {delta}
        </span>
      </div>
    </article>
  );
}

function GarageLineChart({ frame, tone = "red", height = 210 }: { frame: number; tone?: ModuleTone; height?: number }) {
  const width = 720;
  const values = makeSignal(1.2, frame, 34);
  const path = pathFromValues(values, width, height);
  const area = areaFromValues(values, width, height);

  return (
    <svg className={styles.liveSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sinyal omzet realtime">
      <defs>
        <linearGradient id="garage-area-main" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={toneColor[tone]} stopOpacity="0.38" />
          <stop offset="100%" stopColor={toneColor[tone]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={styles.gridLines}>
        {Array.from({ length: 5 }, (_, index) => (
          <line key={index} x1="0" x2={width} y1={(index + 1) * 40} y2={(index + 1) * 40} />
        ))}
      </g>
      <path d={area} fill="url(#garage-area-main)" />
      <path d={path} fill="none" stroke={toneColor[tone]} strokeLinecap="round" strokeWidth="4" />
      <path className={styles.linePulse} d={path} fill="none" stroke="var(--garage-silver)" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function MiniSignal({ frame, seed, tone }: { frame: number; seed: number; tone: ModuleTone }) {
  const width = 170;
  const height = 58;
  const values = makeSignal(seed, frame, 16);
  const path = pathFromValues(values, width, height);
  const area = areaFromValues(values, width, height);

  return (
    <svg className={styles.miniSvg} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={toneColor[tone]} opacity="0.16" />
      <path d={path} fill="none" stroke={toneColor[tone]} strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function BarStream({ frame }: { frame: number }) {
  return (
    <div className={styles.barStream} aria-label="Arus data realtime">
      {Array.from({ length: 16 }, (_, index) => {
        const height = 26 + Math.abs(Math.sin(frame * 1.4 + index * 0.52)) * 72;
        const tone: ModuleTone = index % 4 === 0 ? "red" : index % 4 === 1 ? "amber" : index % 4 === 2 ? "success" : "chrome";
        return (
          <span
            key={index}
            style={
              {
                height: `${height}%`,
                "--tone": toneColor[tone],
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function RadialLoop({ frame, value, label, tone }: { frame: number; value: number; label: string; tone: ModuleTone }) {
  const animated = Math.max(4, Math.min(99, value + Math.sin(frame * 0.9) * 4));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (animated / 100) * circumference;

  return (
    <div className={styles.radialWrap} style={{ "--tone": toneColor[tone] } as CSSProperties}>
      <svg viewBox="0 0 112 112" className={styles.radialSvg} aria-label={`${label} ${Math.round(animated)} persen`}>
        <circle cx="56" cy="56" r={radius} className={styles.radialTrack} />
        <circle cx="56" cy="56" r={radius} className={styles.radialValue} strokeDasharray={circumference} strokeDashoffset={dash} />
      </svg>
      <div className={styles.radialText}>
        <strong>{Math.round(animated)}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function ModuleCard({ module, frame, index }: { module: OwnerModule; frame: number; index: number }) {
  const liveValue = module.value + Math.sin(frame + index * 0.8) * (module.value > 100 ? 32 : 3);
  const display = module.value > 100 ? Math.round(liveValue).toLocaleString("id-ID") : Math.round(liveValue).toString();

  return (
    <article className={styles.moduleCard} style={{ "--tone": toneColor[module.tone] } as CSSProperties}>
      <div className={styles.moduleTop}>
        <span className={styles.moduleIcon}>{module.icon}</span>
        <span className={styles.moduleStatus}>Live</span>
      </div>
      <h3>{module.title}</h3>
      <p>{module.label}</p>
      <div className={styles.moduleValue}>
        {display}
        <span>{module.unit}</span>
      </div>
      <MiniSignal frame={frame} seed={index + 1} tone={module.tone} />
    </article>
  );
}

export function GarageOwnerDashboard() {
  const frame = STATIC_FRAME;
  const headline = {
    revenue: 12_480_000,
    orders: 284,
    health: 92,
    approval: 8,
  };

  return (
    <section className={styles.shell}>
      <div className={styles.signalLayer} />
      <div className={styles.noiseLayer} />

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <Sparkles size={15} />
            GARAGE OS Control
          </span>
          <h1>Owner Command Center</h1>
          <p>Ringkasan live untuk omzet, kas, antrian, stok, approval, dan risiko outlet dalam bahasa operasional.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/os?module=dashboard">
              <Gauge size={16} />
              OS Dashboard
            </Link>
            <Link className={styles.secondaryButton} href="/control/financial">
              <TrendingUp size={16} />
              Kontrol Finance
            </Link>
          </div>
        </div>

        <div className={styles.enginePanel}>
          <div className={styles.engineHeader}>
            <span>
              <RadioTower size={16} />
              GARAGE Engine
            </span>
            <strong>Aman</strong>
          </div>
          <RadialLoop frame={frame} value={91} label="Sinkron data" tone="red" />
          <div className={styles.engineStats}>
            <span>Latency 42ms</span>
            <span>Live data</span>
            <span>Approval on</span>
          </div>
        </div>
      </header>

      <div className={styles.metricGrid}>
        <MetricTile label="Omzet Hari Ini" value={formatCompactIdr(headline.revenue)} delta="+18.4% live" tone="red" icon={<TrendingUp size={18} />} />
        <MetricTile label="Order Aktif" value={`${Math.round(headline.orders)} trx`} delta="+12 trx/jam" tone="amber" icon={<Activity size={18} />} />
        <MetricTile label="Sistem Aman" value={`${Math.round(headline.health)}%`} delta="normal" tone="success" icon={<ShieldCheck size={18} />} />
        <MetricTile label="Approval Pending" value={`${Math.max(0, Math.round(headline.approval))}`} delta="cek owner" tone="chrome" icon={<CheckCircle2 size={18} />} />
      </div>

      <div className={styles.mainGrid}>
        <article className={styles.chartPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Sinyal Realtime</span>
              <h2>Omzet & Antrian</h2>
            </div>
            <button type="button" className={styles.iconButton} title="Perbarui stream">
              <RefreshCw size={16} />
            </button>
          </div>
          <GarageLineChart frame={frame} tone="red" />
          <div className={styles.chartFooter}>
            <span>POS</span>
            <span>QRIS</span>
            <span>Dapur</span>
            <span>Stok</span>
            <span>Finance</span>
          </div>
        </article>

        <article className={styles.sidePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Live Load</span>
              <h2>Data Outlet</h2>
            </div>
            <Zap size={18} />
          </div>
          <BarStream frame={frame} />
          <div className={styles.loadCopy}>
            <strong>342 events/s</strong>
            <p>Stream POS, stok, pembayaran, dan audit masih di bawah threshold aman.</p>
          </div>
        </article>
      </div>

      <div className={styles.moduleGrid}>
        {modules.map((module, index) => (
          <ModuleCard key={module.id} module={module} frame={frame} index={index} />
        ))}
      </div>

      <div className={styles.bottomGrid}>
        <article className={styles.structurePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Struktur Modul</span>
              <h2>Dashboard Owner</h2>
            </div>
            <Cpu size={18} />
          </div>
          <div className={styles.structureList}>
            {modules.map((module, index) => (
              <div key={module.id} className={styles.structureRow} style={{ "--tone": toneColor[module.tone] } as CSSProperties}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{module.title}</strong>
                <em>{module.label}</em>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.activityPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Data Realtime</span>
              <h2>Aktivitas Outlet</h2>
            </div>
            <Activity size={18} />
          </div>
          <div className={styles.activityTable}>
            {activities.map((row) => (
              <div key={`${row.time}-${row.source}`} className={styles.activityRow} data-tone={row.tone}>
                <span>{row.time}</span>
                <strong>{row.source}</strong>
                <p>{row.event}</p>
                <em>{row.signal}</em>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.modelPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>GARAGE Model</span>
              <h2>Status Engine</h2>
            </div>
            <Wrench size={18} />
          </div>
          <div className={styles.modelList}>
            {modelStatus.map((model, index) => (
              <div key={model.name} className={styles.modelRow} style={{ "--tone": toneColor[model.tone] } as CSSProperties}>
                <RadialLoop frame={frame + index * 0.35} value={model.value} label={model.metric} tone={model.tone} />
                <div>
                  <strong>{model.name}</strong>
                  <p>{model.metric} sinkron dan siap untuk review owner.</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
