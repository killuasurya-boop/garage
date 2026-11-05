"use client";

// Living Intelligence Dashboard (Batch 6). Jaringan 16 domain asli (registry MCP) di sekitar AYA core.
// Ambient (CSS) hanya visual; partikel cahaya (GSAP) HANYA saat ada aktivitas nyata baru di domain itu.
// Koneksi, kesehatan modul, dan aktivitas bisnis ditampilkan terpisah. Tanpa suara.
import "../decision/decision-center.css";
import "./intelligence.css";

import { gsap } from "gsap";
import { Activity, Bot, Gavel, Moon, Search, SunMedium, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
const PREF_KEY = "garage:intelligence-prefs";
const THEME_KEY = "garage:decision-center-theme";
const GROUP_ORDER: NetworkGroup[] = ["operasional", "bisnis", "manajemen", "infrastruktur"];
const GROUP_ANGLE: Record<NetworkGroup, number> = { operasional: -135, bisnis: -45, manajemen: 45, infrastruktur: 135 };
const W = 1140;
const H = 620;
const CX = W / 2;
const CY = H / 2;
const RX = 330;
const RY = 232;
const MAX_PARTICLES = 3;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—";

function layout(domains: DomainSignal[]) {
  const pos = new Map<string, { x: number; y: number }>();
  for (const group of GROUP_ORDER) {
    const members = domains.filter((d) => d.group === group);
    const span = 70;
    members.forEach((d, i) => {
      const angle = ((GROUP_ANGLE[group] - span / 2 + (members.length === 1 ? span / 2 : (span * i) / (members.length - 1))) * Math.PI) / 180;
      pos.set(d.id, { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) });
    });
  }
  return pos;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const prevActivity = useRef<Map<string, string | null>>(new Map());
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
    const tick = () => {
      if (document.hidden) return;
      void load();
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, 30_000);
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

  const domains = useMemo(() => snapshot?.domains ?? [], [snapshot]);
  const positions = useMemo(() => layout(domains), [domains]);
  const problems = useMemo(() => priorityProblems(domains), [domains]);
  const selectedDomain = domains.find((d) => d.id === selected) ?? null;
  const now = lastFetch ?? 0;

  // Partikel hanya untuk aktivitas nyata BARU (waktu aktivitas berubah & masih segar), maks 3 bersamaan.
  useEffect(() => {
    if (!snapshot || !svgRef.current) return;
    const svg = svgRef.current;
    const fresh: DomainSignal[] = [];
    for (const d of snapshot.domains) {
      const before = prevActivity.current.get(d.id);
      if (before !== undefined && d.lastActivityAt && d.lastActivityAt !== before && isRecentlyActive(d.lastActivityAt, Date.now())) fresh.push(d);
      prevActivity.current.set(d.id, d.lastActivityAt);
    }
    if (intensity === "minimal" || paused) return;
    const tweens: gsap.core.Tween[] = [];
    for (const d of fresh.slice(0, MAX_PARTICLES)) {
      if (particles.current >= MAX_PARTICLES) break;
      const p = positions.get(d.id);
      if (!p) continue;
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", intensity === "cinematic" ? "6" : "4.5");
      dot.setAttribute("class", "li-particle");
      dot.setAttribute("cx", String(p.x));
      dot.setAttribute("cy", String(p.y));
      svg.appendChild(dot);
      particles.current += 1;
      tweens.push(
        gsap.to(dot, {
          attr: { cx: CX, cy: CY },
          duration: intensity === "cinematic" ? 1.2 : 0.9,
          ease: "power2.inOut",
          onComplete: () => {
            dot.remove();
            particles.current -= 1;
          },
        }),
      );
    }
    return () => {
      for (const tween of tweens) tween.kill();
      svg.querySelectorAll(".li-particle").forEach((el) => el.remove());
      particles.current = 0;
    };
  }, [snapshot, positions, intensity, paused]);

  function savePrefs(next: Intensity) {
    setIntensity(next);
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ intensity: next }));
    } catch {
      /* abaikan */
    }
  }

  const visible = (d: DomainSignal) => groupFilter === "all" || d.group === groupFilter;
  const dataAge = lastFetch && snapshot ? Math.round((lastFetch - new Date(snapshot.generatedAt).getTime()) / 1000) : null;

  return (
    <div className="dc-root li-root" data-theme={theme} data-intensity={intensity} data-paused={paused} data-testid="living-intelligence">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="dc-muted flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"><Activity className="size-3.5" aria-hidden /> AYA Intelligence · MCP</p>
          <h1 className="dc-title text-2xl sm:text-3xl">Living Intelligence</h1>
          <p className="dc-muted text-sm">Semua modul Garage OS terhubung lewat AYA. Gerak latar = visual; cahaya pada jalur = aktivitas nyata terbaru.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="dc-soft flex p-1" role="radiogroup" aria-label="Intensitas animasi">
            {(["minimal", "normal", "cinematic"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={intensity === value} className="dc-tab !min-h-9 !border-0" data-active={intensity === value} onClick={() => savePrefs(value)}>
                {value === "minimal" ? "Minimal" : value === "normal" ? "Normal" : "Cinematic"}
              </button>
            ))}
          </div>
          <div className="dc-soft flex p-1" role="radiogroup" aria-label="Tema">
            {(["light", "dark"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} className="dc-tab !min-h-9 !border-0" data-active={theme === value}
                onClick={() => { setTheme(value); try { window.localStorage.setItem(THEME_KEY, value); } catch { /* abaikan */ } }}
                aria-label={value === "light" ? "Tema terang" : "Tema gelap"}>
                {value === "light" ? <SunMedium className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tiga informasi berbeda: koneksi · kesehatan · aktivitas */}
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Status koneksi">
        <span className="li-chip" role="status">
          {online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
          Browser: {online ? "online" : "offline"}
        </span>
        <span className="li-chip" role="status">
          <span className="li-dot" data-health={serverOk === null ? "unverified" : serverOk ? "ok" : "critical"} />
          Server & data: {serverOk === null ? "memeriksa…" : serverOk ? `terbaca ${dataAge !== null ? `(${Math.max(0, dataAge)} dtk)` : ""}` : "gagal dibaca — status di bawah belum terverifikasi"}
        </span>
        <span className="li-chip">Diperbarui {when(snapshot?.generatedAt ?? null)}</span>
        <span className="li-chip"><Bot className="size-3.5" aria-hidden /> AYA: {snapshot?.aya.investigating ? "sedang menganalisis" : `${snapshot?.aya.openCases ?? 0} kasus terbuka`}</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter departemen">
        <button type="button" role="tab" aria-selected={groupFilter === "all"} className="dc-tab" data-active={groupFilter === "all"} onClick={() => setGroupFilter("all")}>Seluruh jaringan</button>
        {GROUP_ORDER.map((group) => (
          <button key={group} type="button" role="tab" aria-selected={groupFilter === group} className="dc-tab" data-active={groupFilter === group} onClick={() => setGroupFilter(group)}>
            {GROUP_LABEL[group]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {/* Desktop/tablet: jaringan SVG. HP: daftar modul (tanpa garis rumit). */}
          <section className="dc-card hidden p-2 md:block" aria-label="Jaringan modul Garage OS">
            <svg ref={svgRef} className="li-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="AYA di tengah, 16 modul Garage OS di sekeliling">
              {domains.filter(visible).map((d) => {
                const p = positions.get(d.id);
                if (!p) return null;
                return (
                  <g key={`l-${d.id}`}>
                    <line className="li-link" x1={CX} y1={CY} x2={p.x} y2={p.y} data-hl={selected === d.id || (snapshot?.aya.investigating && d.health !== "unverified")} />
                    {d.health !== "unverified" ? <line className="li-flow" x1={p.x} y1={p.y} x2={CX} y2={CY} /> : null}
                  </g>
                );
              })}
              <g aria-hidden>
                {snapshot?.aya.investigating ? <circle className="li-wave" cx={CX} cy={CY} r={60} /> : null}
                <circle className="li-ring li-ring-a" cx={CX} cy={CY} r={86} />
                <circle className="li-ring li-ring-b" cx={CX} cy={CY} r={104} />
                <g className="li-orbit" style={{ transformOrigin: `${CX}px ${CY}px` }}>
                  {[0, 120, 240].map((deg) => (
                    <circle key={deg} cx={CX + 118 * Math.cos((deg * Math.PI) / 180)} cy={CY + 118 * Math.sin((deg * Math.PI) / 180)} r={2.5} fill="var(--dc-amber)" opacity={0.6} />
                  ))}
                </g>
                <circle className="li-core-breath" cx={CX} cy={CY} r={64} fill="var(--dc-red-soft)" stroke="var(--dc-red)" strokeWidth={2} />
                <circle cx={CX} cy={CY} r={44} fill="var(--dc-surface)" stroke="var(--dc-red)" strokeOpacity={0.6} />
                <text x={CX} y={CY - 2} textAnchor="middle" className="li-node-label" style={{ fontSize: 18 }}>AYA</text>
                <text x={CX} y={CY + 16} textAnchor="middle" className="li-node-sub">Intelligence</text>
              </g>
              {domains.filter(visible).map((d) => {
                const p = positions.get(d.id);
                if (!p) return null;
                const anchor = p.x < CX - 40 ? "end" : p.x > CX + 40 ? "start" : "middle";
                const dx = anchor === "end" ? -30 : anchor === "start" ? 30 : 0;
                return (
                  <g
                    key={d.id}
                    className="li-node"
                    data-health={d.health}
                    data-selected={selected === d.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${d.label}: ${HEALTH_LABEL[d.health]}. ${d.reason}`}
                    onClick={() => setSelected(d.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? setSelected(d.id) : null)}
                  >
                    <title>{`${d.label} — ${HEALTH_LABEL[d.health]} · data ${when(d.dataAsOf)}`}</title>
                    <circle className="li-node-glow" cx={p.x} cy={p.y} r={26} />
                    <circle className="li-node-ring" cx={p.x} cy={p.y} r={20} />
                    <text x={p.x} y={p.y + 5} textAnchor="middle" className="li-node-label" style={{ fontSize: 12 }}>{d.metric ? d.metric.value : d.toolCount}</text>
                    <text x={p.x + dx} y={p.y - 4} textAnchor={anchor} className="li-node-label">{d.label}</text>
                    <text x={p.x + dx} y={p.y + 13} textAnchor={anchor} className="li-node-sub">
                      {HEALTH_LABEL[d.health]}{isRecentlyActive(d.lastActivityAt, now) ? " · aktif" : ""}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="dc-muted px-2 pb-1 text-[11px]">Angka di lingkaran = ukuran masalah utama modul (atau jumlah tool AI bila belum ada sinyal). Garis putus = belum terverifikasi.</p>
          </section>

          <section className="dc-card p-3 md:hidden" aria-label="Daftar modul">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full border-2" style={{ borderColor: "var(--dc-red)", background: "var(--dc-red-soft)" }}>
                <Bot className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-black">AYA Intelligence</p>
                <p className="dc-muted text-xs">{problems.length} modul perlu perhatian</p>
              </div>
            </div>
            {GROUP_ORDER.filter((g) => groupFilter === "all" || g === groupFilter).map((group) => (
              <div key={group} className="mb-2">
                <p className="dc-muted mb-1 text-[11px] font-black uppercase">{GROUP_LABEL[group]}</p>
                <ul className="space-y-1">
                  {domains.filter((d) => d.group === group).map((d) => (
                    <li key={d.id}>
                      <button type="button" className="dc-row !grid-cols-[auto_minmax(0,1fr)_auto] !min-h-11" onClick={() => setSelected(d.id)}>
                        <span className="li-dot" data-health={d.health} />
                        <span className="min-w-0 truncate text-sm font-bold">{d.label}</span>
                        <span className="dc-muted text-xs">{HEALTH_LABEL[d.health]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {selectedDomain ? (
            <section className="dc-card dc-enter p-4" aria-label="Detail modul" data-testid="li-detail">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="dc-title text-lg">{selectedDomain.label}</h2>
                <span className="li-chip"><span className="li-dot" data-health={selectedDomain.health} /> {HEALTH_LABEL[selectedDomain.health]}</span>
              </div>
              <p className="dc-text-2 mt-1 text-sm">{selectedDomain.reason}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="dc-soft p-2"><dt className="dc-muted text-[11px]">Ukuran</dt><dd className="font-bold">{selectedDomain.metric ? `${selectedDomain.metric.value} · ${selectedDomain.metric.label}` : "—"}</dd></div>
                <div className="dc-soft p-2"><dt className="dc-muted text-[11px]">Aktivitas terakhir</dt><dd className="font-bold">{when(selectedDomain.lastActivityAt)}</dd></div>
                <div className="dc-soft p-2"><dt className="dc-muted text-[11px]">Data dibaca</dt><dd className="font-bold">{when(selectedDomain.dataAsOf)}</dd></div>
                <div className="dc-soft p-2"><dt className="dc-muted text-[11px]">Tool AI (MCP)</dt><dd className="font-bold">{selectedDomain.toolCount}</dd></div>
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

        <aside className="min-w-0 space-y-3">
          <section className="dc-card p-3" aria-label="Masalah prioritas">
            <h3 className="dc-sec-h mb-2">Masalah prioritas</h3>
            {!snapshot ? (
              <p className="dc-muted text-sm">Memuat…</p>
            ) : !problems.length ? (
              <p className="dc-muted text-sm">Tidak ada modul berstatus perhatian/kritis dari sinyal yang terbaca. Modul tanpa sinyal tetap “Belum terverifikasi”.</p>
            ) : (
              <ul className="space-y-1.5">
                {problems.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="dc-row !grid-cols-[auto_minmax(0,1fr)]" onClick={() => setSelected(d.id)}>
                      <span className="li-dot" data-health={d.health} />
                      <span className="min-w-0"><span className="block text-sm font-bold">{d.label}</span><span className="dc-muted block text-xs">{d.reason}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="dc-card p-3" aria-label="Alur persetujuan">
            <h3 className="dc-sec-h mb-2"><Gavel className="size-4" aria-hidden /> Persetujuan</h3>
            <ol className="space-y-1 text-sm">
              <li className="flex justify-between"><span>Menunggu Owner</span><b style={{ color: "var(--dc-amber)" }}>{snapshot?.approvals.pending ?? "—"}</b></li>
              <li className="flex justify-between"><span>Risiko tinggi (R3)</span><b style={{ color: "var(--dc-red)" }}>{snapshot?.approvals.highRisk ?? "—"}</b></li>
              <li className="flex justify-between"><span>Gagal dijalankan</span><b>{snapshot?.approvals.failedExecution ?? "—"}</b></li>
            </ol>
            <p className="dc-muted mt-1 text-[11px]">Disetujui ≠ berhasil: berhasil hanya setelah pelaksanaan tercatat.</p>
            <Link className="dc-btn mt-2 w-full" href="/control/decision">Buka Decision Center</Link>
          </section>
          <section className="dc-card p-3" aria-label="Aktivitas sistem">
            <h3 className="dc-sec-h mb-2"><Activity className="size-4" aria-hidden /> Aktivitas terbaru</h3>
            <ol className="garage-scroll max-h-72 space-y-1 overflow-y-auto text-sm">
              {(snapshot?.activity ?? []).map((row, i) => (
                <li key={i} className="flex gap-2"><span className="dc-muted shrink-0 font-mono text-[11px]">{when(row.at)}</span><span className="min-w-0 truncate">{row.action}</span></li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
