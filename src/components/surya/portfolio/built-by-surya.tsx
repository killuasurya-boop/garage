"use client";

// Section "BUILT BY SURYA.dev" di homepage Garage Coffee (owner 16 Nov 2026): Garage tetap brand utama,
// SURYA.dev tampil sebagai pengembang di balik pengalaman digitalnya + portofolio + CTA konsultasi.
// Gerak: GSAP (sudah jadi dependency) di-import dinamis, hanya entrance ringan; mati total bila reduced motion.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";

import { SURYA_PORTFOLIO_URL, SURYA_WA_URL } from "../surya-data";
import { EXTERNAL_LINK, PORTFOLIO_PROJECTS, withRef, type PortfolioProject } from "./portfolio-data";
import "./portfolio.css";

/* ───────────────────────── SVG dekoratif (inline, tanpa request) ───────────────────────── */

function RedStroke({ className = "" }: { className?: string }) {
  return (
    <svg className={`bbs-stroke ${className}`} viewBox="0 0 320 14" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path d="M2 9 C 80 3, 190 2, 318 7" pathLength={1} />
    </svg>
  );
}

// Titik ditaruh TEPAT di kurva (Bezier kuadrat M30 10 Q 110 112 30 214), teks di kanan titik.
const ORBIT_STEPS = ["Strategy", "Design", "Development", "Business growth"];
function orbitPoint(t: number) {
  const u = 1 - t;
  return { x: u * u * 30 + 2 * u * t * 110 + t * t * 30, y: u * u * 10 + 2 * u * t * 112 + t * t * 214 };
}

function OrbitDiagram() {
  return (
    <svg className="bbs-orbit" viewBox="0 0 260 224" aria-hidden="true" focusable="false">
      <path className="bbs-orbit-arc" d="M30 10 Q 110 112 30 214" pathLength={1} />
      {ORBIT_STEPS.map((label, i) => {
        const { x, y } = orbitPoint(0.1 + i * 0.267);
        return (
          <g key={label} className="bbs-orbit-step">
            <circle cx={x} cy={y} r={i === 0 ? 5 : 4} className={i === 0 ? "is-hot" : ""} />
            <text x={x + 14} y={y + 4}>{label.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────────────────── Komponen portofolio (reusable) ───────────────────────── */

/** Bingkai browser + screenshot asli; tanpa screenshot = bingkai netral berisi domain (bukan gambar palsu). */
export function ProjectPreview({ project, priority = false, sizes }: { project: PortfolioProject; priority?: boolean; sizes: string }) {
  return (
    <div className="bbs-preview">
      <div className="bbs-preview-bar" aria-hidden="true">
        <span className="bbs-dot" /><span className="bbs-dot" /><span className="bbs-dot" />
        <span className="bbs-url">{project.domain}</span>
      </div>
      <div className="bbs-preview-view">
        {project.image ? (
          <Image
            src={project.image.src}
            alt={`Tampilan website ${project.name} (${project.domain})`}
            width={project.image.width}
            height={project.image.height}
            sizes={sizes}
            priority={priority}
            loading={priority ? undefined : "lazy"}
            className="bbs-preview-img"
          />
        ) : (
          <div className="bbs-preview-empty">
            <span className="bbs-preview-empty-name">{project.name}</span>
            <span className="mono bbs-preview-empty-domain">{project.domain}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lapisan hover/focus: ajakan "Explore Project" di atas preview (dekoratif; link aslinya kartu itu sendiri). */
export function ProjectHoverOverlay() {
  return (
    <span className="bbs-overlay" aria-hidden="true">
      <span className="bbs-overlay-pill">Explore Project <ArrowUpRight size={14} /></span>
    </span>
  );
}

export function FeaturedProject({ project }: { project: PortfolioProject }) {
  return (
    <article className="bbs-featured bbs-reveal" aria-labelledby={`bbs-p-${project.id}`}>
      <a className="bbs-featured-media" href={withRef(project.url, "featured")} {...EXTERNAL_LINK} tabIndex={-1} aria-hidden="true">
        <ProjectPreview project={project} sizes="(max-width: 900px) 100vw, 58vw" />
        <ProjectHoverOverlay />
      </a>
      <div className="bbs-featured-copy">
        <span className="bbs-tag"><span className="bbs-tag-dot" aria-hidden="true" />Featured project</span>
        <h3 id={`bbs-p-${project.id}`} className="bbs-featured-name">{project.name}</h3>
        {project.category ? <p className="mono bbs-cat">{project.category}</p> : null}
        {project.summary ? <p className="bbs-summary">{project.summary}</p> : null}
        <a className="bbs-btn bbs-btn--primary" href={withRef(project.url, "featured")} {...EXTERNAL_LINK}>
          Explore Project <ArrowUpRight size={16} aria-hidden="true" />
          <span className="sr-only"> {project.name} (tab baru)</span>
        </a>
      </div>
    </article>
  );
}

export function ProjectCard({ project }: { project: PortfolioProject }) {
  return (
    <li className="bbs-card bbs-reveal">
      <a className="bbs-card-link" href={withRef(project.url, `card-${project.id}`)} {...EXTERNAL_LINK}>
        <span className="bbs-card-media">
          <ProjectPreview project={project} sizes="(max-width: 640px) 82vw, (max-width: 1100px) 45vw, 22vw" />
          <ProjectHoverOverlay />
        </span>
        <span className="bbs-card-body">
          <span className="bbs-card-name">{project.name}</span>
          <span className="bbs-card-sub">{project.summary ?? project.domain}</span>
          {project.category ? <span className="mono bbs-cat">{project.category}</span> : null}
          <span className="bbs-card-cta">
            Explore Project <ArrowUpRight size={14} aria-hidden="true" />
            <span className="sr-only"> (tab baru)</span>
          </span>
        </span>
      </a>
    </li>
  );
}

/** Tombol geser untuk deretan kartu (mobile = carousel scroll-snap; desktop semua terlihat → tombol disembunyikan). */
export function ProjectNavigation({ trackRef, label }: { trackRef: React.RefObject<HTMLUListElement | null>; label: string }) {
  const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [trackRef]);
  const go = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    el.scrollBy({ left: dir * ((card?.clientWidth ?? 280) + 16), behavior: "smooth" });
  };
  if (edge.start && edge.end) return null;
  return (
    <div className="bbs-nav" role="group" aria-label={label}>
      <button type="button" className="bbs-nav-btn" onClick={() => go(-1)} disabled={edge.start} aria-label="Proyek sebelumnya">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <button type="button" className="bbs-nav-btn is-next" onClick={() => go(1)} disabled={edge.end} aria-label="Proyek berikutnya">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PortfolioShowcase({ projects = PORTFOLIO_PROJECTS }: { projects?: PortfolioProject[] }) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const featured = projects.find((p) => p.featured) ?? projects[0];
  const rest = projects.filter((p) => p !== featured);
  return (
    <div className="bbs-portfolio" aria-labelledby="bbs-portfolio-title">
      <div className="bbs-portfolio-head">
        <div>
          <p className="eyebrow bbs-reveal">Portfolio showcase</p>
          <h2 id="bbs-portfolio-title" className="display bbs-h2 bbs-reveal">
            Selected projects <span className="bbs-nowrap">by SURYA<span className="bbs-red">.dev</span></span>
          </h2>
        </div>
        <ProjectNavigation trackRef={trackRef} label="Navigasi proyek" />
      </div>
      {featured ? <FeaturedProject project={featured} /> : null}
      <ul ref={trackRef} className="bbs-grid" aria-label="Proyek lain SURYA.dev">
        {rest.map((p) => <ProjectCard key={p.id} project={p} />)}
      </ul>
    </div>
  );
}

/* ───────────────────────── Section utama ───────────────────────── */

export function BuiltBySurya() {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("is-static");
      return;
    }
    let ctx: { revert: () => void } | null = null;
    let cancelled = false;
    // GSAP hanya dimuat saat section dekat viewport (tidak membebani hero / LCP).
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      root.classList.add("is-animated");
      ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>(".bbs-reveal").forEach((el) => {
          gsap.fromTo(el, { autoAlpha: 0, y: 28 }, {
            autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
        });
        gsap.utils.toArray<SVGPathElement>(".bbs-stroke path, .bbs-orbit-arc").forEach((path) => {
          gsap.fromTo(path, { strokeDasharray: 1, strokeDashoffset: 1 }, {
            strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut",
            scrollTrigger: { trigger: path, start: "top 90%", once: true },
          });
        });
      }, root);
    }, { rootMargin: "300px 0px" });
    io.observe(root);
    return () => {
      cancelled = true;
      io.disconnect();
      ctx?.revert();
    };
  }, []);

  return (
    <section id="built-by-surya" ref={rootRef} className="section-pad bbs" aria-labelledby="bbs-title">
      <div className="bbs-glow" aria-hidden="true" />
      <div className="shell">
        {/* 1. Intro */}
        <div className="bbs-intro">
          <p className="eyebrow bbs-reveal">The creative &amp; technology behind Garage</p>
          <h2 id="bbs-title" className="display bbs-h1 bbs-reveal">
            <span className="bbs-line">Great experiences are designed.</span>
            <span className="bbs-line">
              Great businesses are <span className="bbs-underlined">built.<RedStroke /></span>
            </span>
          </h2>
          <p className="bbs-lead bbs-reveal">
            Di balik pengalaman digital Garage Coffee, terdapat perpaduan desain, teknologi, dan strategi bisnis.{" "}
            <strong>SURYA.dev</strong> menghadirkan solusi digital yang dibangun sesuai karakter, kebutuhan, dan tujuan
            setiap bisnis.
          </p>
        </div>

        {/* 2. Portofolio */}
        <PortfolioShowcase />

        {/* 3. CTA konsultasi */}
        <div className="bbs-cta">
          <div className="bbs-cta-copy">
            <h2 className="display bbs-h1 bbs-reveal">
              <span className="bbs-line">Your business deserves a</span>
              <span className="bbs-line">
                better digital <span className="bbs-underlined">experience.<RedStroke /></span>
              </span>
            </h2>
            <p className="bbs-lead bbs-reveal">
              Dari website profesional dan UI/UX hingga sistem operasional bisnis, <strong>SURYA.dev</strong> membantu
              mengubah kebutuhan bisnis menjadi pengalaman digital yang efektif.
            </p>
            <div className="bbs-cta-actions bbs-reveal">
              <a className="bbs-btn bbs-btn--primary" href={SURYA_WA_URL} {...EXTERNAL_LINK}>
                <MessageCircle size={16} aria-hidden="true" /> Konsultasikan Proyek Anda
                <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> lewat WhatsApp (tab baru)</span>
              </a>
              <a className="bbs-btn bbs-btn--ghost" href={withRef(SURYA_PORTFOLIO_URL, "cta")} {...EXTERNAL_LINK}>
                Explore SURYA.dev <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> (tab baru)</span>
              </a>
            </div>
          </div>
          <div className="bbs-cta-art bbs-reveal">
            <OrbitDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
