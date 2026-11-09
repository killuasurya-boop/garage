"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, Boxes, ChefHat, Code2, Coffee, Cuboid, ExternalLink, Layers, LineChart, Megaphone,
  MessageCircle, Monitor, Play, Settings, Sparkles, UserRound, Users, ImageIcon, Briefcase,
  ReceiptText, Package,
} from "lucide-react";
import {
  SURYA_CAPABILITIES, SURYA_CORE, SURYA_HUD, SURYA_MODULES, SURYA_PATHS, SURYA_PORTFOLIO_URL,
  SURYA_READY, SURYA_SERVICES, SURYA_WA_URL, type SuryaModuleId,
} from "./surya-data";
import type { SuryaSceneControl } from "./surya-scene";
import "./surya-showcase.css";

const SuryaScene = dynamic(() => import("./surya-scene"), { ssr: false });

const MODULE_ICON: Record<SuryaModuleId, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  waiter: UserRound, pos: ReceiptText, bar: Coffee, kitchen: ChefHat, owner: LineChart,
};
const SERVICE_ICON = [Code2, Monitor, Layers, Settings, Megaphone];
const HUD_ICON = [Package, Users, LineChart, Settings, Boxes];
const CAP_ICON = [Cuboid, Play, Sparkles, ImageIcon, Briefcase];
const MOBILE_SERVICES = ["Custom Software", "Website & Web App", "UI/UX Design", "Business Automation", "Digital Marketing"];

function useWebglCapable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const c = document.createElement("canvas");
        const reduceData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
        setOk(!!(c.getContext("webgl2") || c.getContext("webgl")) && !reduceData);
      } catch { setOk(false); }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return ok;
}

export function SuryaShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const control = useRef<SuryaSceneControl>({ progress: 0, focus: null });
  const [focus, setFocus] = useState<SuryaModuleId | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const webgl = useWebglCapable();
  const onReady = useCallback(() => setSceneReady(true), []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const set = () => setDesktop(mq.matches);
    const id = requestAnimationFrame(set);
    mq.addEventListener("change", set);
    return () => { cancelAnimationFrame(id); mq.removeEventListener("change", set); };
  }, []);

  useEffect(() => { control.current.focus = focus; }, [focus]);

  // GSAP: urutan masuk + progres scroll untuk kamera. Dibersihkan saat unmount.
  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { root.classList.add("sdv-in"); return; }
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;
    void (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        ctx = gsap.context(() => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 75%", once: true }, defaults: { ease: "power3.out" } });
          tl.from(".sdv-glow", { opacity: 0, duration: 0.8 })
            .fromTo(".sdv-laser", { xPercent: -110, opacity: 0.9 }, { xPercent: 110, opacity: 0, duration: 1.1, ease: "power2.inOut" }, 0.1)
            .from(".sdv-h1 span", { yPercent: 110, duration: 0.8, stagger: 0.12 }, 0.2)
            .from(".sdv-enter", { opacity: 0, y: 24, duration: 0.7, stagger: 0.08 }, 0.4)
            .from(".sdv-node", { opacity: 0, scale: 0.9, duration: 0.6, stagger: 0.1 }, 0.7)
            .from(".sdv-path", { opacity: 0, duration: 0.8, stagger: 0.08 }, 1.1)
            .add(() => root.classList.add("sdv-in"));
          ScrollTrigger.create({
            trigger: root, start: "top bottom", end: "bottom top",
            onUpdate: (self) => { control.current.progress = self.progress; },
          });
        }, root);
      } catch { root.classList.add("sdv-in"); }
    })();
    return () => { cancelled = true; ctx?.revert(); };
  }, []);

  // Pause animasi CSS saat di luar layar.
  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;
    const io = new IntersectionObserver(([e]) => root.classList.toggle("sdv-paused", !e.isIntersecting), { threshold: 0 });
    io.observe(root);
    return () => io.disconnect();
  }, []);

  const focusPath = (from: string, to: string) => focus && (from === focus || to === focus);

  return (
    <section id="surya-dev" ref={sectionRef} className="sdv" aria-labelledby="sdv-title">
      <div className="sdv-glow" aria-hidden="true" />
      <div className="sdv-laser" aria-hidden="true" />
      <div className="sdv-wrap">
        <div className="sdv-top">
          <div className="sdv-copy">
            <p className="sdv-eyebrow sdv-enter"><i aria-hidden="true" />THE TECHNOLOGY BEHIND GARAGE COFFEE</p>
            <h2 id="sdv-title" className="sdv-h1" aria-label="Kopi di depan. Teknologi di baliknya.">
              <b aria-hidden="true"><span className="sdv-chrome">KOPI DI DEPAN.</span></b>
              <b aria-hidden="true"><span className="sdv-red">TEKNOLOGI DI BALIKNYA.</span></b>
            </h2>
            <p className="sdv-lead sdv-enter">
              Di balik pengalaman digital Garage Coffee, terdapat <strong>Garage OS</strong> — ekosistem teknologi yang dirancang untuk
              menghubungkan pelayanan pelanggan, kasir, bar, kitchen, dan manajemen bisnis.
            </p>
            <ul className="sdv-mini sdv-enter" aria-label="Layanan SURYA.dev">
              {MOBILE_SERVICES.map((s, i) => { const I = SERVICE_ICON[i]; return (<li key={s}><span><I size={22} aria-hidden /></span>{s}</li>); })}
            </ul>
            <div className="sdv-cta sdv-enter">
              <a className="sdv-btn sdv-btn--primary" href={SURYA_WA_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={20} aria-hidden /><span>KONSULTASIKAN PROYEK ANDA</span><ArrowRight size={18} aria-hidden className="sdv-arrow" />
              </a>
              <a className="sdv-btn sdv-btn--ghost" href={SURYA_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={20} aria-hidden /><span>EXPLORE SURYA.dev</span><ArrowRight size={18} aria-hidden className="sdv-arrow" />
              </a>
            </div>
            <div className="sdv-sign sdv-enter">
              <span className="sdv-mono">CONCEPT · DESIGN · DEVELOPMENT</span>
              <span>Created by Surya — <a href={SURYA_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">SURYA.dev</a></span>
            </div>
          </div>

          {/* Mobile: alur modul datar sesuai referensi C */}
          <div className="sdv-flow" role="img" aria-label="Alur Garage OS: Waiter ke POS, lalu Bar dan Kitchen paralel, menuju Owner Dashboard">
            {[["waiter"], ["pos"], ["bar", "kitchen"], ["owner"]].map((ids, i) => (
              <div className="sdv-flow-step" key={i}>
                <div className="sdv-flow-card">
                  {ids.map((id) => { const m = SURYA_MODULES.find((x) => x.id === id)!; const I = MODULE_ICON[m.id]; return (
                    <span key={id}><I size={26} aria-hidden />{m.label === "OWNER DASHBOARD" ? "OWNER DASHBOARD" : m.label}</span>); })}
                </div>
                {i < 3 && <em aria-hidden="true">›</em>}
              </div>
            ))}
            <div className="sdv-flow-core">GARAGE OS</div>
          </div>

          {/* Desktop: panggung 3D + jalur data */}
          <div className="sdv-stage-wrap">
            <div className="sdv-stage" onPointerLeave={() => setFocus(null)}>
              {webgl && desktop && (
                <div className={`sdv-canvas-host${sceneReady ? " is-ready" : ""}`}>
                  <SuryaScene control={control} mobile={false} onReady={onReady} />
                </div>
              )}
              <svg className="sdv-svg" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
                <defs><filter id="sdv-blur"><feGaussianBlur stdDeviation="0.5" /></filter></defs>
                {SURYA_PATHS.map((p) => (
                  <g key={p.id} className={`sdv-path${focusPath(p.from, p.to) ? " is-focus" : ""}`}>
                    <path d={p.d} className="sdv-line-glow" filter="url(#sdv-blur)" />
                    <path d={p.d} className="sdv-line" />
                    <circle r="0.7" className="sdv-dot"><animateMotion dur="3.6s" repeatCount="indefinite" path={p.d} /></circle>
                  </g>
                ))}
              </svg>
              <div className="sdv-core" style={{ left: `${SURYA_CORE.x}%`, top: `${(SURYA_CORE.y / 70) * 100}%` }}>
                <strong>GARAGE OS</strong><span>BUSINESS SYSTEM ECOSYSTEM</span>
              </div>
              <div className="sdv-ready" style={{ left: `${SURYA_READY.x}%`, top: `${(SURYA_READY.y / 70) * 100}%` }}>ORDER READY</div>
              {SURYA_MODULES.map((m) => { const I = MODULE_ICON[m.id]; return (
                <button
                  type="button" key={m.id}
                  className={`sdv-node${focus === m.id ? " is-focus" : ""}`}
                  style={{ left: `${m.x}%`, top: `${(m.y / 70) * 100}%` }}
                  onPointerEnter={() => setFocus(m.id)} onFocus={() => setFocus(m.id)} onBlur={() => setFocus(null)}
                  aria-label={`${m.label}: ${m.sub}`}
                >
                  <I size={18} aria-hidden /><b>{m.label}</b><small>{m.sub}</small>
                </button>); })}
            </div>
            <ul className="sdv-hud" aria-label="Modul pendukung Garage OS">
              {SURYA_HUD.map((h, i) => { const I = HUD_ICON[i]; return (<li key={h.label}><I size={18} aria-hidden /><span><b>{h.label}</b><small>{h.sub}</small></span></li>); })}
            </ul>
            <p className="sdv-note">Ilustrasi alur modul perangkat lunak Garage OS, bukan data transaksi langsung.</p>
          </div>
        </div>

        <div className="sdv-services">
          <div className="sdv-sh sdv-enter">
            <h3><i aria-hidden="true" />LAYANAN <span>SURYA.dev</span></h3>
            <p>Solusi digital untuk membangun, mengembangkan, dan mengoptimalkan bisnis Anda.</p>
          </div>
          <ul className="sdv-cards">
            {SURYA_SERVICES.map((s, i) => { const I = SERVICE_ICON[i]; return (
              <li key={s.id} className="sdv-card sdv-enter"><I size={30} aria-hidden /><h4>{s.title}</h4><p>{s.desc}</p></li>); })}
          </ul>
          <div className="sdv-sh sdv-sh--small sdv-enter"><h3><i aria-hidden="true" />KEMAMPUAN PENDUKUNG</h3></div>
          <ul className="sdv-caps">
            {SURYA_CAPABILITIES.map((c, i) => { const I = CAP_ICON[i]; return (<li key={c} className="sdv-enter"><I size={22} aria-hidden />{c}</li>); })}
          </ul>
        </div>
      </div>
    </section>
  );
}
