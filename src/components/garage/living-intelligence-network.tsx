"use client";

import { useEffect, useState } from "react";
import { AyaAvatar } from "@/components/garage/aya-avatar";
import { GARAGE_DOMAINS, type GarageDomainId } from "@/lib/mcp-tool-registry";
import "./living-intelligence-network.css";

export type IntelligenceSignal = {
  state: "normal" | "active" | "warning" | "critical" | "offline" | "unknown";
  /** Backend-observed ISO time; missing or older than two minutes = unknown. */
  updatedAt?: string | null;
  detail?: string;
};
type MotionLevel = "minimal" | "normal" | "cinematic" | "off";
type Scenario = "normal" | "risk" | "analysis" | "verified";
type SignalMap = Partial<Record<GarageDomainId, IntelligenceSignal>>;
const LABELS: Record<string, string> = {
  dashboard: "Dashboard", pos: "POS & Order", shift_kas: "Shift & Kas",
  keuangan: "Keuangan", produk_harga: "Produk & Harga",
  bahan_resep: "Bahan & Resep", gudang: "WMS / Stok",
  dapur_bar: "Bar & Kitchen", member_crm: "Member / CRM",
  karyawan: "Karyawan", event: "Event", marketing: "Marketing",
  meja_qr: "Meja & QR", dokumen: "Dokumen",
  notifikasi: "Notifikasi", sistem: "AI / MCP",
};
const NAMES: Record<IntelligenceSignal["state"], string> = {
  normal: "Normal", active: "Diperiksa", warning: "Perhatian",
  critical: "Kritis", offline: "Offline", unknown: "Belum diverifikasi",
};
const COLORS: Record<IntelligenceSignal["state"], string> = {
  normal: "#61dca6", active: "#6ed0f2", warning: "#f1ba74",
  critical: "#ff6877", offline: "#7e8490", unknown: "#8692a3",
};
const RISK: GarageDomainId[] = ["shift_kas", "keuangan"];
const ANALYSIS: GarageDomainId[] = ["pos", "shift_kas", "keuangan", "sistem"];
const STEPS = ["Temuan", "Pemeriksaan", "Analisis AYA", "Persetujuan Owner", "Verifikasi"];
function demoStatus(id: GarageDomainId, scenario: Scenario): IntelligenceSignal["state"] {
  if (scenario === "risk" && RISK.includes(id)) return "warning";
  if (scenario === "analysis" && ANALYSIS.includes(id)) return "active";
  if (scenario === "verified" && RISK.includes(id)) return "normal";
  return "unknown";
}
export function resolveIntelligenceStatus(
  signal: IntelligenceSignal | undefined, clock: number,
): IntelligenceSignal["state"] {
  if (!signal?.updatedAt) return "unknown";
  const t = Date.parse(signal.updatedAt);
  if (!Number.isFinite(t) || t > clock + 30_000 || clock - t > 120_000) return "unknown";
  return signal.state;
}
export function LivingIntelligenceNetwork({
  demo = false,
  signals = {},
}: {
  demo?: boolean;
  /** Inject verified backend status, never inferred from ambient animation. */
  signals?: SignalMap;
}) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [selected, setSelected] = useState<GarageDomainId>("sistem");
  const [motion, setMotion] = useState<MotionLevel>("normal");
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduced(mq.matches);
    const syncVisibility = () => setVisible(document.visibilityState === "visible");
    syncMotion(); syncVisibility();
    mq.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setClock(Date.now());
    }, 30_000);
    return () => {
      mq.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
      window.clearInterval(timer);
    };
  }, []);
  const stateFor = (id: GarageDomainId) => demo
    ? demoStatus(id, scenario) : resolveIntelligenceStatus(signals[id], clock);
  const statusCount = GARAGE_DOMAINS.filter(d => stateFor(d.id) !== "unknown").length;
  const riskCount = GARAGE_DOMAINS.filter(d => ["critical", "warning"].includes(stateFor(d.id))).length;
  const focused = (id: GarageDomainId) => selected === id
    || (demo && scenario === "analysis" && ANALYSIS.includes(id))
    || (demo && scenario === "risk" && RISK.includes(id));
  const activeStage = scenario === "analysis" ? 2 : scenario === "verified" ? 4 : 0;
  const animate = visible && !reduced && motion !== "off";
  const selectedDomain = GARAGE_DOMAINS.find(d => d.id === selected);
  return (
    <section className={"lin lin-" + motion + (animate ? "" : " lin-paused")} aria-label="Living Intelligence Garage OS">
      <header className="lin-header">
        <div>
          <p className="lin-overline">GARAGE OS / AYA INTELLIGENCE</p>
          <h1>Living Intelligence Dashboard</h1>
          <p>16 domain saling terhubung. Gerakan ambient berkelanjutan; status bisnis hanya berdasarkan bukti backend.</p>
        </div>
        <div className="lin-controls">
          <span className="lin-demo-tag">{demo ? "MODE SIMULASI" : "STATUS REAL-TIME BERGANTUNG SUMBER"}</span>
          <label htmlFor="lin-motion">Animasi</label>
          <select id="lin-motion" value={motion} onChange={e => setMotion(e.target.value as MotionLevel)}>
            <option value="minimal">Minimal</option>
            <option value="normal">Normal</option>
            <option value="cinematic">Cinematic</option>
            <option value="off">Nonaktif</option>
          </select>
          <button type="button" onClick={() => setMotion(motion === "off" ? "normal" : "off")}>
            {motion === "off" ? "▶ Lanjut" : "Ⅱ Jeda"}
          </button>
        </div>
      </header>
      <div className="lin-stats">
        <div><small>DOMAIN GARAGE OS</small><strong>{GARAGE_DOMAINS.length}</strong><span>Terdaftar pada registry</span></div>
        <div><small>STATUS TERSEDIA</small><strong>{statusCount}</strong><span>{demo ? "Skenario simulasi" : "Observasi ≤ 2 menit"}</span></div>
        <div><small>PERLU PERHATIAN</small><strong>{riskCount}</strong><span>Tidak mengubah transaksi</span></div>
        <div><small>PENGAMBILAN KEPUTUSAN</small><strong>Owner</strong><span>Persetujuan tetap terpisah</span></div>
      </div>
      <div className="lin-grid">
        <div className="lin-network">
          <div className="lin-panel-title">
            <div><h2>Connected Operational Network</h2><p>Pilih modul untuk melihat status dan keterkaitannya.</p></div>
            <span>◉ AYA CORE</span>
          </div>
          <div className="lin-canvas">
            <svg viewBox="0 0 1000 660" role="img" aria-label="Peta enam belas domain Garage OS yang terhubung ke Aya">
              <defs>
                <radialGradient id="lin-center"><stop stopColor="#4f2c4d"/><stop offset="1" stopColor="#231d32"/></radialGradient>
              </defs>
              <ellipse className="lin-orbit" cx="500" cy="330" rx="289" ry="210"/>
              <ellipse className="lin-orbit reverse" cx="500" cy="330" rx="248" ry="170"/>
              {GARAGE_DOMAINS.map((d, i) => {
                const angle = -Math.PI / 2 + i * Math.PI * 2 / GARAGE_DOMAINS.length;
                const x = 500 + 371 * Math.cos(angle), y = 330 + 267 * Math.sin(angle);
                const dx = x - 500, dy = y - 330;
                const path = ["M",500,330,"Q",
                  (500+dx*.58-dy*.075).toFixed(1),
                  (330+dy*.58+dx*.075).toFixed(1),
                  x.toFixed(1),y.toFixed(1)].join(" ");
                return <g key={"wire-"+d.id}>
                  <path d={path} className="lin-wire"/>
                  <path d={path} className="lin-flow" style={{animationDelay: String(-i*.32)+"s"}}/>
                  {focused(d.id) && <path d={path} className="lin-active-wire"/>}
                </g>;
              })}
              <circle cx="500" cy="330" r="101" className="lin-ring"/>
              <circle cx="500" cy="330" r="87" className="lin-ring reverse"/>
              <circle cx="500" cy="330" r="79" fill="url(#lin-center)" stroke="#bd829c"/>
              <text x="500" y="369" className="lin-central-label">AYA</text>
              <text x="500" y="387" className="lin-central-sub">INTELLIGENCE CORE</text>
              {GARAGE_DOMAINS.map((d,i) => {
                const angle = -Math.PI / 2 + i * Math.PI * 2 / GARAGE_DOMAINS.length;
                const x = 500 + 371 * Math.cos(angle), y = 330 + 267 * Math.sin(angle);
                const status = stateFor(d.id), title = LABELS[d.id] || d.label;
                return <g key={d.id} tabIndex={0} role="button"
                  aria-label={d.label + ", " + NAMES[status]}
                  className={"lin-node" + (selected === d.id ? " chosen" : "")}
                  onClick={() => setSelected(d.id)}
                  onKeyDown={e => {if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(d.id);}}}>
                  <rect x={x-65} y={y-25} width="130" height="50" rx="12" stroke={COLORS[status]}/>
                  <circle cx={x-52} cy={y-4} r="4.7" fill={COLORS[status]}/>
                  <text x={x-42} y={y-2} className="lin-node-name">{title.length>17?title.slice(0,16)+"…":title}</text>
                  <text x={x-42} y={y+13} className="lin-node-meta">{NAMES[status]}</text>
                </g>;
              })}
            </svg>
            <div className="lin-aya" aria-hidden="true"><AyaAvatar size={65} decorative /></div>
          </div>
          <div className="lin-mobile-domains">
            {GARAGE_DOMAINS.map(d => <button type="button" key={d.id} onClick={() => setSelected(d.id)}
              className={selected===d.id?"selected":""}>
              <i style={{backgroundColor: COLORS[stateFor(d.id)]}}/>{LABELS[d.id] || d.label}
            </button>)}
          </div>
          <div className="lin-legend">● Belum diperiksa <span className="blue">● Analisis</span>
            <span className="amber">● Perhatian</span><span className="green">● Normal terverifikasi</span>
          </div>
        </div>
        <aside className="lin-side">
          <div className="lin-box">
            <p className="lin-overline">DECISION FLOW</p>
            <h2>Alur kecerdasan</h2>
            <p>{demo ? ({
              normal:"16 domain divisualisasikan. Belum ada masalah yang didiagnosis.",
              risk:"Contoh: selisih kas mengaktifkan indikator peringatan.",
              analysis:"Simulasi: AYA memeriksa POS, Shift & Kas, dan Keuangan.",
              verified:"Simulasi verifikasi selesai; tidak ada transaksi nyata yang berubah.",
            })[scenario] : "Data aktivitas tersedia setelah sumber backend terintegrasi."}</p>
            <ol className="lin-steps">
              {STEPS.map((s,i) => <li key={s} className={demo&&i===activeStage?"current":""}>
                <span>{i+1}</span>{s}
              </li>)}
            </ol>
          </div>
          <div className="lin-box">
            <p className="lin-overline">DETAIL MODUL</p>
            <h2>{selectedDomain?.label}</h2>
            <p className="lin-info" style={{color:COLORS[stateFor(selected)]}}>{NAMES[stateFor(selected)]}</p>
            <p>{demo ? "Contoh UI: tidak mengubah data bisnis." :
              (signals[selected]?.detail || "Data terbaru belum tersedia; jangan mengasumsikan kondisi normal.")}</p>
            {demo && <div className="lin-scenarios">
              {(["normal","risk","analysis","verified"] as Scenario[]).map((s,i)=><button
                key={s} type="button" onClick={()=>setScenario(s)}
                aria-pressed={scenario===s} className={scenario===s?"active":""}>
                {i+1}. {({normal:"Normal",risk:"Kas bermasalah",analysis:"AYA analisis",verified:"Verifikasi"})[s]}
              </button>)}
            </div>}
          </div>
          <div className="lin-box">
            <p className="lin-overline">KEAMANAN OWNER</p>
            <h2>Hanya indikator</h2>
            <p>Animasi tidak memutuskan approval atau menjalankan MCP. Semua aksi finansial memerlukan jalur konfirmasi resmi dan verifikasi hasil.</p>
          </div>
        </aside>
      </div>
      <footer className="lin-footnote">Desain preview; status normal tidak pernah disimpulkan dari animasi. Data hilang atau usang ditampilkan sebagai belum diverifikasi.</footer>
    </section>
  );
}
