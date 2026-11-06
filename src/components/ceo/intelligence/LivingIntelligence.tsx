"use client";

// Living Intelligence Dashboard (Batch 6, upgrade visual Nov 2026).
// Inti AYA (maskot resmi) di tengah, 16 domain registry asli sebagai kartu di kiri-kanan, dihubungkan
// kurva bercahaya. Ambient = visual saja (CSS, opacity rendah). Komet di kurva HANYA untuk aktivitas
// nyata baru (GSAP, maks 3). Koneksi ≠ kesehatan modul ≠ aktivitas. Tanpa suara.
import "../decision/decision-center.css";
import "./intelligence.css";

import { gsap } from "gsap";
import {
  Activity,
  Banknote,
  BarChart3,
  Bell,
  Boxes,
  CalendarHeart,
  ChefHat,
  FileText,
  Gavel,
  Megaphone,
  Moon,
  Package,
  QrCode,
  Search,
  ShieldCheck,
  ShoppingCart,
  SunMedium,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  GROUP_LABEL,
  HEALTH_LABEL,
  isRecentlyActive,
  priorityProblems,
  type DomainSignal,
  type IntelligenceSnapshot,
  type NetworkGroup,
} from "@/lib/intelligence-network";

type Intensity = "minimal" | "normal" | "cinematic";
type Wire = { id: string; d: string; health: string; x1: number; x2: number };
const PREF_KEY = "garage:intelligence-prefs";
const THEME_KEY = "garage:decision-center-theme";
const GROUP_ORDER: NetworkGroup[] = ["operasional", "bisnis", "manajemen", "infrastruktur"];
const MAX_PARTICLES = 3;

const ICON: Record<string, LucideIcon> = {
  pos: ShoppingCart,
  dapur_bar: ChefHat,
  meja_qr: QrCode,
  shift_kas: Wallet,
  keuangan: Banknote,
  gudang: Boxes,
  produk_harga: Package,
  bahan_resep: UtensilsCrossed,
  member_crm: Users,
  karyawan: Users,
  marketing: Megaphone,
  event: CalendarHeart,
  dokumen: FileText,
  dashboard: BarChart3,
  notifikasi: Bell,
  sistem: ShieldCheck,
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—";

/** Kiri: Operasional + Bisnis awal; kanan: sisa Bisnis + Manajemen + Infrastruktur (seimbang 8/8). */
function splitSides(domains: DomainSignal[]) {
  const ordered = GROUP_ORDER.flatMap((group) => domains.filter((d) => d.group === group));
  const half = Math.ceil(ordered.length / 2);
  return { left: ordered.slice(0, half), right: ordered.slice(half) };
}

function NodeCard({
  d,
  index,
  selected,
  active,
  onSelect,
  refCb,
}: {
  d: DomainSignal;
  index: number;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  refCb?: (el: HTMLButtonElement | null) => void;
}) {
  const Icon = ICON[d.id] ?? Activity;
  return (
    <button
      ref={refCb}
      type="button"
      className="li-card"
      data-health={d.health}
      data-selected={selected}
      data-active={active}
      style={{ "--i": index } as React.CSSProperties}
      onClick={onSelect}
      aria-label={`${d.label}: ${HEALTH_LABEL[d.health]}. ${d.reason}`}
      title={`${d.reason} · data ${when(d.dataAsOf)}`}
    >
      <span className="li-card-icon"><Icon className="size-[18px]" aria-hidden /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="li-card-title">{d.label}</span>
        <span className="li-card-status">
          <span className="li-dot" data-health={d.health} />
          {HEALTH_LABEL[d.health]}
          {active ? <span className="li-live">• aktif</span> : null}
        </span>
      </span>
      {d.metric ? <span className="li-card-metric" title={d.metric.label}>{d.metric.value}</span> : null}
    </button>
  );
}

export function LivingIntelligence() {
  const [snapshot, setSnapshot] = useState<IntelligenceSnapshot | null>(null);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [online, setOnline] = useState(true);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<NetworkGroup | "all">("all");
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [paused, setPaused] = useState(false);
  const [wires, setWires] = useState<Wire[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const prevActivity = useRef(new Map<string, string | null>());
  const particles = useRef(0);

  useEffect(() => {
    try {
      const prefs = JSON.parse(window.localStorage.getItem(PREF_KEY) ?? "{}") as { intensity?: Intensity };
      const savedTheme = window.localStorage.getItem(THEME_KEY);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIntensity(reduce ? "minimal" : prefs.intensity === "minimal" || prefs.intensity === "cinematic" ? prefs.intensity : "normal");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      /* preferensi opsional */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/control/intelligence", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { data?: IntelligenceSnapshot } | null;
      if (!res.ok || !json?.data) throw new Error(String(res.status));
      setSnapshot(json.data);
      setServerOk(true);
    } catch {
      setServerOk(false);
    } finally {
      setLastFetch(Date.now());
    }
  }, []);

  // Polling 30 dtk; berhenti saat tab di latar belakang, sinkron lagi saat kembali.
  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (!document.hidden) void load();
      }, 30_000);
    };
    const onVisibility = () => {
      setPaused(document.hidden);
      if (!document.hidden) {
        void load();
        start();
      }
    };
    const onNet = () => setOnline(navigator.onLine);
    const first = window.setTimeout(() => {
      onNet();
      void load();
    }, 0);
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, [load]);

  const domains = useMemo(() => (snapshot?.domains ?? []).filter((d) => groupFilter === "all" || d.group === groupFilter), [snapshot, groupFilter]);
  const sides = useMemo(() => splitSides(domains), [domains]);
  const problems = useMemo(() => priorityProblems(snapshot?.domains ?? []), [snapshot]);
  const selectedDomain = snapshot?.domains.find((d) => d.id === selected) ?? null;
  const now = lastFetch ?? 0;

  // Kurva kartu → inti, dihitung dari posisi elemen nyata (ResizeObserver).
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const hub = hubRef.current;
    if (!stage || !hub) return;
    const s = stage.getBoundingClientRect();
    const h = hub.getBoundingClientRect();
    const hx = h.left - s.left + h.width / 2;
    const hy = h.top - s.top + h.height / 2;
    const r = h.width / 2 - 30;
    const next: Wire[] = [];
    for (const d of domains) {
      const el = cardRefs.current.get(d.id);
      if (!el || el.offsetParent === null) continue;
      const c = el.getBoundingClientRect();
      const left = c.left - s.left + c.width / 2 < hx;
      const x1 = left ? c.right - s.left : c.left - s.left;
      const y1 = c.top - s.top + c.height / 2;
      const angle = Math.atan2(y1 - hy, x1 - hx);
      const x2 = hx + r * Math.cos(angle);
      const y2 = hy + r * Math.sin(angle);
      const mid = (x1 + x2) / 2;
      next.push({ id: d.id, d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, health: d.health, x1, x2 });
    }
    setWires(next);
    setBox({ w: s.width, h: s.height });
  }, [domains]);

  useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measure]);

  // Komet hanya untuk aktivitas nyata BARU (waktu aktivitas berubah & masih segar), maks 3 bersamaan.
  useEffect(() => {
    if (!snapshot || !svgRef.current) return;
    const svg = svgRef.current;
    const fresh: string[] = [];
    for (const d of snapshot.domains) {
      const before = prevActivity.current.get(d.id);
      if (before !== undefined && d.lastActivityAt && d.lastActivityAt !== before && isRecentlyActive(d.lastActivityAt, Date.now())) fresh.push(d.id);
      prevActivity.current.set(d.id, d.lastActivityAt);
    }
    if (intensity === "minimal" || paused) return;
    const tweens: gsap.core.Tween[] = [];
    for (const id of fresh.slice(0, MAX_PARTICLES)) {
      if (particles.current >= MAX_PARTICLES) break;
      const path = svg.querySelector<SVGPathElement>(`path[data-route="${id}"]`);
      if (!path) continue;
      const total = path.getTotalLength();
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", intensity === "cinematic" ? "5" : "4");
      dot.setAttribute("class", "li-comet");
      svg.appendChild(dot);
      particles.current += 1;
      const state = { t: 0 };
      tweens.push(
        gsap.to(state, {
          t: 1,
          duration: intensity === "cinematic" ? 1.2 : 0.95,
          ease: "power2.inOut",
          onUpdate: () => {
            const p = path.getPointAtLength(state.t * total);
            dot.setAttribute("cx", String(p.x));
            dot.setAttribute("cy", String(p.y));
          },
          onComplete: () => {
            dot.remove();
            particles.current -= 1;
          },
        }),
      );
    }
    return () => {
      for (const tween of tweens) tween.kill();
      svg.querySelectorAll(".li-comet").forEach((el) => el.remove());
      particles.current = 0;
    };
  }, [snapshot, intensity, paused]);

  function savePrefs(next: Intensity) {
    setIntensity(next);
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ intensity: next }));
    } catch {
      /* abaikan */
    }
  }

  const dataAge = lastFetch && snapshot ? Math.max(0, Math.round((lastFetch - new Date(snapshot.generatedAt).getTime()) / 1000)) : null;
  const investigating = Boolean(snapshot?.aya.investigating);
  const connected = (snapshot?.domains ?? []).filter((d) => d.health !== "unverified").length;
  const setRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  };

  return (
    <div className="dc-root li-root" data-theme={theme} data-intensity={intensity} data-paused={paused} data-testid="living-intelligence">
      <header className="li-hero mb-4">
        <div className="min-w-0">
          <p className="li-kicker"><Activity className="size-3.5" aria-hidden /> AYA Intelligence · MCP Garage OS</p>
          <h1 className="dc-title text-2xl sm:text-[34px]">Living Intelligence</h1>
          <p className="dc-muted mt-1 max-w-2xl text-sm">Seluruh modul Garage OS terhubung melalui AYA. Cahaya yang mengalir di jalur = aktivitas nyata terbaru; gerak latar hanya visual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="li-seg" role="radiogroup" aria-label="Intensitas animasi">
            {(["minimal", "normal", "cinematic"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={intensity === value} data-active={intensity === value} onClick={() => savePrefs(value)}>
                {value === "minimal" ? "Minimal" : value === "normal" ? "Normal" : "Cinematic"}
              </button>
            ))}
          </div>
          <div className="li-seg" role="radiogroup" aria-label="Tema">
            {(["light", "dark"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} data-active={theme === value} aria-label={value === "light" ? "Tema terang" : "Tema gelap"}
                onClick={() => { setTheme(value); try { window.localStorage.setItem(THEME_KEY, value); } catch { /* abaikan */ } }}>
                {value === "light" ? <SunMedium className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tiga informasi berbeda: koneksi · kesehatan · aktivitas */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Status koneksi">
        <div className="li-stat" role="status">
          <span className="li-stat-icon" data-tone={online ? "ok" : "critical"}>{online ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}</span>
          <span><span className="li-stat-label">Perangkat</span><span className="li-stat-value">{online ? "Online" : "Offline"}</span></span>
        </div>
        <div className="li-stat" role="status">
          <span className="li-stat-icon" data-tone={serverOk === null ? "unverified" : serverOk ? "ok" : "critical"}><ShieldCheck className="size-4" aria-hidden /></span>
          <span><span className="li-stat-label">Server & data</span><span className="li-stat-value">{serverOk === null ? "Memeriksa…" : serverOk ? `Terbaca${dataAge !== null ? ` · ${dataAge} dtk` : ""}` : "Gagal dibaca"}</span></span>
        </div>
        <div className="li-stat">
          <span className="li-stat-icon" data-tone={problems.length ? "attention" : "ok"}><Activity className="size-4" aria-hidden /></span>
          <span><span className="li-stat-label">Modul bersinyal</span><span className="li-stat-value">{connected} / 16 · {problems.length} perlu perhatian</span></span>
        </div>
        <Link href="/control/decision" className="li-stat li-stat-link">
          <span className="li-stat-icon" data-tone={snapshot?.approvals.highRisk ? "critical" : snapshot?.approvals.pending ? "attention" : "ok"}><Gavel className="size-4" aria-hidden /></span>
          <span><span className="li-stat-label">Menunggu Owner</span><span className="li-stat-value">{snapshot?.approvals.pending ?? "—"} pengajuan · {snapshot?.approvals.highRisk ?? 0} R3</span></span>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter departemen">
        {(["all", ...GROUP_ORDER] as const).map((group) => (
          <button key={group} type="button" role="tab" aria-selected={groupFilter === group} className="li-pill" data-active={groupFilter === group} onClick={() => setGroupFilter(group)}>
            {group === "all" ? "Seluruh jaringan" : GROUP_LABEL[group]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <section className="li-stage" ref={stageRef} aria-label="Jaringan modul Garage OS">
            <svg ref={svgRef} className="li-wires" width={box.w} height={box.h} aria-hidden>
              <defs>
                {wires.map((w) => (
                  <linearGradient key={w.id} id={`li-g-${w.id}`} gradientUnits="userSpaceOnUse" x1={w.x1} y1="0" x2={w.x2} y2="0">
                    <stop offset="0" stopColor={`var(--li-${w.health})`} stopOpacity="0.95" />
                    <stop offset="1" stopColor="var(--dc-red)" stopOpacity="0.55" />
                  </linearGradient>
                ))}
              </defs>
              {wires.map((w) => (
                <g key={w.id} data-health={w.health} data-selected={selected === w.id}>
                  <path className="li-wire-glow" d={w.d} stroke={`url(#li-g-${w.id})`} />
                  <path className="li-wire" d={w.d} stroke={`url(#li-g-${w.id})`} data-route={w.id} />
                  {w.health !== "unverified" ? <path className="li-wire-flow" d={w.d} /> : null}
                </g>
              ))}
            </svg>

            <div className="li-col">
              {sides.left.map((d, i) => (
                <NodeCard key={d.id} d={d} index={i} selected={selected === d.id} active={isRecentlyActive(d.lastActivityAt, now)} onSelect={() => setSelected(d.id)} refCb={setRef(d.id)} />
              ))}
            </div>

            <div className="li-hub-wrap">
              <div ref={hubRef} className="li-hub" data-investigating={investigating}>
                <span className="li-hub-aura" aria-hidden />
                <span className="li-hub-ring li-hub-ring-a" aria-hidden />
                <span className="li-hub-ring li-hub-ring-b" aria-hidden />
                {investigating ? <span className="li-hub-wave" aria-hidden /> : null}
                <span className="li-hub-core">
                  <Image src={investigating ? "/garage-brand/aya/v5/aya-thinking.svg" : "/garage-brand/aya/v5/aya-idle.svg"} alt="AYA" width={132} height={132} className="li-hub-aya" priority />
                </span>
              </div>
              <p className="li-hub-title">AYA Intelligence</p>
              <p className="li-hub-sub">{investigating ? "Sedang menganalisis…" : `${connected} modul bersinyal`}</p>
            </div>

            <div className="li-col">
              {sides.right.map((d, i) => (
                <NodeCard key={d.id} d={d} index={i + sides.left.length} selected={selected === d.id} active={isRecentlyActive(d.lastActivityAt, now)} onSelect={() => setSelected(d.id)} refCb={setRef(d.id)} />
              ))}
            </div>
          </section>

          {selectedDomain ? (
            <section className="li-panel dc-enter p-4" aria-label="Detail modul" data-testid="li-detail">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="dc-title text-lg">{selectedDomain.label}</h2>
                <span className="li-pill !cursor-default" data-active="false"><span className="li-dot" data-health={selectedDomain.health} /> {HEALTH_LABEL[selectedDomain.health]}</span>
              </div>
              <p className="dc-text-2 mt-1 text-sm">{selectedDomain.reason}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[
                  ["Ukuran", selectedDomain.metric ? `${selectedDomain.metric.value} · ${selectedDomain.metric.label}` : "—"],
                  ["Aktivitas terakhir", when(selectedDomain.lastActivityAt)],
                  ["Data dibaca", when(selectedDomain.dataAsOf)],
                  ["Tool AI (MCP)", String(selectedDomain.toolCount)],
                ].map(([label, value]) => (
                  <div key={label} className="li-fact"><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedDomain.href ? <Link className="dc-btn" href={selectedDomain.href}>Buka modul</Link> : null}
                <Link className="dc-btn" data-variant="reject" href={`/control/aya-solver?q=${encodeURIComponent(`Periksa ${selectedDomain.label}: ${selectedDomain.reason}`)}`}>
                  <Search className="size-4" aria-hidden /> Investigasi AYA
                </Link>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-1 2xl:content-start">
          <section className="li-panel p-4" aria-label="Masalah prioritas">
            <h3 className="dc-sec-h mb-3">Masalah prioritas</h3>
            {!snapshot ? (
              <p className="dc-muted text-sm">Memuat…</p>
            ) : !problems.length ? (
              <p className="dc-muted text-sm">Tidak ada modul berstatus perhatian/kritis dari sinyal yang terbaca. Modul tanpa sinyal tetap “Belum terverifikasi”.</p>
            ) : (
              <ul className="space-y-2">
                {problems.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="li-problem" data-health={d.health} onClick={() => setSelected(d.id)}>
                      <span className="li-dot" data-health={d.health} />
                      <span className="min-w-0"><span className="block text-sm font-bold">{d.label}</span><span className="dc-muted block text-xs">{d.reason}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="li-panel p-4" aria-label="Aktivitas sistem">
            <h3 className="dc-sec-h mb-3"><Activity className="size-4" aria-hidden /> Aktivitas terbaru</h3>
            <ol className="li-timeline garage-scroll max-h-72 overflow-y-auto">
              {(snapshot?.activity ?? []).map((row, i) => (
                <li key={i}><span className="li-time">{when(row.at)}</span><span className="min-w-0 truncate">{row.action}</span></li>
              ))}
              {!snapshot?.activity.length ? <li className="dc-muted text-sm">Belum ada aktivitas tercatat.</li> : null}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
