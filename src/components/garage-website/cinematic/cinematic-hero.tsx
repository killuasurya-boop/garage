"use client";

// =============================================================================
// Hero sinematik website Garage (Cinematic Laser UI V1, mockup Owner Nov 2026).
// Kiri: headline masked reveal + garis laser. Tengah: kartu produk (foto asli dari menu live) dengan border laser
// berjalan, parallax pointer, cahaya merah, crossfade antarproduk. Kanan: 4 info utama. Semua tombol menuju menu
// digital (tanpa checkout di website). Gerak lewat GSAP (satu timeline masuk + ScrollTrigger keluar), mati saat
// prefers-reduced-motion; sentuh = tanpa hover/parallax. Suara hanya bila pengunjung menyalakan tombol Sound.
// =============================================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { UrlObject } from "url";
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Coffee, ThumbsUp, Users } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { LaserBorder } from "./laser-border";
import { MOTION, coarsePointer, prefersReducedMotion } from "./motion-config";
import { playSiteSfx } from "./site-sfx";

import "./cinematic.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type HeroMenuRow = {
  id?: string;
  name?: string;
  category?: string;
  imageUrl?: string | null;
  stock?: string;
  featured?: boolean;
  promoActive?: boolean;
  showInDigitalMenu?: boolean;
  tags?: string[];
};

export type HeroProduct = { id: string; name: string; imageUrl: string };

/** Produk panggung hero: foto asli dari menu live, unggulan/promo/terlaris & minuman lebih dulu, maks 5. */
export function heroProducts(rows: readonly HeroMenuRow[], limit = 5): HeroProduct[] {
  const score = (row: HeroMenuRow) =>
    (row.featured ? 3 : 0) +
    (row.promoActive ? 2 : 0) +
    ((row.tags ?? []).some((tag) => /bestseller|terlaris|signature|favorit|unggulan/i.test(String(tag))) ? 2 : 0) +
    (row.category === "Coffee" ? 1 : row.category === "Non-Coffee" ? 0.5 : 0);
  return rows
    .filter((row) => row.imageUrl && row.name && row.stock !== "sold_out" && row.showInDigitalMenu !== false)
    .map((row, index) => ({ row, index, s: score(row) }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .slice(0, limit)
    .map(({ row, index }) => ({ id: row.id ?? `p-${index}`, name: String(row.name), imageUrl: String(row.imageUrl) }));
}

const FEATURES = [
  { icon: Users, label: "Nongkrong santai bareng teman" },
  { icon: Coffee, label: "Racikan khas Garage" },
  { icon: ThumbsUp, label: "Favorit pelanggan" },
  { icon: Clock, label: "Siap ambil 15–20 menit" },
];

const TITLE_LINES = ["Racikan", "Garage,", "Bikin", "Nagih."];
const AUTOPLAY_MS = 6500;

export function CinematicHero({
  rows,
  menuHref,
  aboutHref = "#about",
  backdropUrl,
}: {
  rows: readonly HeroMenuRow[];
  menuHref: string | UrlObject;
  aboutHref?: string;
  /** Foto hero dari Pengaturan (opsional) — dipakai sebagai latar redup. */
  backdropUrl?: string | null;
}) {
  const products = useMemo(() => heroProducts(rows), [rows]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLAnchorElement | null>(null);
  const count = products.length;
  const current = count ? Math.min(active, count - 1) : 0;

  // ------------------------------------------------ timeline masuk (sekali) + scroll keluar
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: MOTION.headline.ease } });
        tl.from(".cine-line-inner", {
          yPercent: 112,
          filter: `blur(${MOTION.headline.blur}px)`,
          duration: MOTION.headline.duration,
          stagger: MOTION.headline.stagger,
        })
          .from(".cine-sweep", { scaleX: 0, duration: MOTION.sweep.duration, ease: MOTION.sweep.ease }, "-=0.35")
          .to(".cine-title", { textShadow: "0 0 28px rgba(255,64,64,0.55)", duration: 0.25, yoyo: true, repeat: 1 }, "-=0.1")
          .from(".cine-lead, .cine-actions", { y: 18, opacity: 0, duration: 0.7, stagger: 0.1, ease: "power3.out" }, "-=0.7")
          .from(
            ".cine-card",
            { opacity: 0, scale: MOTION.product.fromScale, filter: `blur(${MOTION.product.blur}px)`, duration: MOTION.product.duration, ease: MOTION.product.ease },
            0.15,
          )
          .from(".cine-feature", { x: 24, opacity: 0, duration: MOTION.features.duration, stagger: MOTION.features.stagger, ease: MOTION.features.ease }, 0.45)
          .from(".cine-sep", { scaleX: 0, transformOrigin: "left center", duration: 0.6, stagger: MOTION.features.stagger }, 0.7);

        // Scroll: lapisan parallax keluar + cahaya latar memudar.
        gsap.to(".cine-copy", { yPercent: -10, opacity: 0.35, ease: "none", scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".cine-stage", { yPercent: -16, ease: "none", scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".cine-features", { yPercent: -6, ease: "none", scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".cine-glow", { opacity: 0.25, scale: 1.25, ease: "none", scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true } });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  // ------------------------------------------------ parallax pointer (desktop, pointer halus)
  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage || prefersReducedMotion() || coarsePointer()) return;
    const card = stage.querySelector<HTMLElement>(".cine-card");
    const light = root.querySelector<HTMLElement>(".cine-light");
    if (!card || !light) return;
    const cardX = gsap.quickTo(card, "x", { duration: 0.8, ease: "power3.out" });
    const cardY = gsap.quickTo(card, "y", { duration: 0.8, ease: "power3.out" });
    const rotY = gsap.quickTo(card, "rotationY", { duration: 0.8, ease: "power3.out" });
    const rotX = gsap.quickTo(card, "rotationX", { duration: 0.8, ease: "power3.out" });
    const lightX = gsap.quickTo(light, "x", { duration: 1.2, ease: "power3.out" });
    const lightY = gsap.quickTo(light, "y", { duration: 1.2, ease: "power3.out" });
    const onMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      cardX(nx * MOTION.parallax.product);
      cardY(ny * MOTION.parallax.product);
      rotY(nx * 6);
      rotX(-ny * 6);
      lightX(nx * MOTION.parallax.light * 2);
      lightY(ny * MOTION.parallax.light);
    };
    const onLeave = () => {
      cardX(0);
      cardY(0);
      rotY(0);
      rotX(0);
      lightX(0);
      lightY(0);
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [count]);

  // ------------------------------------------------ tombol magnetik
  useEffect(() => {
    const btn = primaryRef.current;
    if (!btn || prefersReducedMotion() || coarsePointer()) return;
    const x = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3.out" });
    const y = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3.out" });
    const onMove = (event: PointerEvent) => {
      const rect = btn.getBoundingClientRect();
      x(((event.clientX - rect.left) / rect.width - 0.5) * MOTION.magnetic * 2);
      y(((event.clientY - rect.top) / rect.height - 0.5) * MOTION.magnetic);
    };
    const onLeave = () => {
      x(0);
      y(0);
    };
    btn.addEventListener("pointermove", onMove);
    btn.addEventListener("pointerleave", onLeave);
    return () => {
      btn.removeEventListener("pointermove", onMove);
      btn.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // ------------------------------------------------ autoplay lembut (berhenti saat hover/fokus/tak terlihat)
  useEffect(() => {
    if (count < 2 || paused || prefersReducedMotion()) return;
    const root = rootRef.current;
    let visible = true;
    const io = root ? new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)) : null;
    if (root && io) io.observe(root);
    const timer = window.setInterval(() => {
      if (visible && document.visibilityState === "visible") setActive((index) => (index + 1) % count);
    }, AUTOPLAY_MS);
    return () => {
      window.clearInterval(timer);
      io?.disconnect();
    };
  }, [count, paused]);

  const go = useCallback(
    (next: number) => {
      if (!count) return;
      setActive(((next % count) + count) % count);
      playSiteSfx("carousel");
    },
    [count],
  );

  const product = products[current];

  return (
    <section ref={rootRef} id="beranda" className="cine-hero" aria-label="Garage Coffee">
      <div className="cine-bg" aria-hidden>
        {backdropUrl ? <span className="cine-backdrop" style={{ backgroundImage: `url(${JSON.stringify(backdropUrl)})` } as CSSProperties} /> : null}
        <span className="cine-glow cine-glow-a" />
        <span className="cine-glow cine-glow-b" />
        <span className="cine-curve cine-curve-tl" />
        <span className="cine-curve cine-curve-br" />
      </div>

      <div className="cine-shell">
        {/* Kiri: teks */}
        <div className="cine-copy">
          <p className="cine-eyebrow">
            <span aria-hidden className="cine-eyebrow-line" />
            Garage Coffee
            <span aria-hidden className="cine-eyebrow-line" />
          </p>
          <h1 className="cine-title" aria-label="Racikan Garage, Bikin Nagih.">
            {TITLE_LINES.map((line) => (
              <span key={line} className="cine-line" aria-hidden>
                <span className="cine-line-inner">{line}</span>
              </span>
            ))}
          </h1>
          <span className="cine-sweep" aria-hidden>
            <i />
          </span>
          <p className="cine-lead">Tempat nongkrong santai, kopi dan cemilan khas Garage.</p>
          <div className="cine-actions">
            <Link
              ref={primaryRef}
              href={menuHref}
              className="cine-btn cine-btn-primary"
              onPointerEnter={() => playSiteSfx("tick")}
              onClick={() => {
                playSiteSfx("click");
                playSiteSfx("sweep");
              }}
            >
              <span className="cine-btn-trace" aria-hidden />
              <span className="cine-btn-label">
                Lihat Menu <ArrowRight className="size-5" aria-hidden />
              </span>
            </Link>
            <a href={aboutHref} className="cine-btn cine-btn-ghost" onPointerEnter={() => playSiteSfx("tick")} onClick={() => playSiteSfx("sweep")}>
              Tentang Kami
            </a>
          </div>
        </div>

        {/* Tengah: kartu produk */}
        <div
          ref={stageRef}
          className="cine-stage"
          onPointerEnter={() => {
            setPaused(true);
            playSiteSfx("laser");
          }}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="cine-light" aria-hidden />
          <div className="cine-card">
            <Link href={menuHref} className="cine-card-link" aria-label={product ? `Lihat ${product.name} di menu digital` : "Lihat menu digital"} onClick={() => playSiteSfx("click")}>
              {products.length ? (
                products.map((item, index) => (
                  // Foto menu asli; crossfade = opacity + scale (tanpa distorsi bentuk).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={item.id}
                    src={item.imageUrl}
                    alt={index === current ? item.name : ""}
                    aria-hidden={index === current ? undefined : true}
                    className="cine-card-img"
                    data-active={index === current ? "true" : undefined}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    onLoad={index === current ? () => playSiteSfx("shimmer") : undefined}
                  />
                ))
              ) : (
                <span className="cine-card-empty">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" className="cine-card-logo" />
                </span>
              )}
              <span className="cine-card-sheen" aria-hidden />
            </Link>
            <LaserBorder radius={28} />
          </div>
          {count > 1 ? (
            <>
              <button type="button" className="cine-arrow cine-arrow-prev" aria-label="Produk sebelumnya" onClick={() => go(current - 1)}>
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button type="button" className="cine-arrow cine-arrow-next" aria-label="Produk berikutnya" onClick={() => go(current + 1)}>
                <ChevronRight className="size-5" aria-hidden />
              </button>
              <div className="cine-dots" role="group" aria-label="Pilih produk">
                {products.map((item, index) => (
                  <button key={item.id} type="button" aria-label={`Produk ${index + 1}: ${item.name}`} aria-pressed={index === current} onClick={() => go(index)}>
                    <span />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Kanan: info utama */}
        <ul className="cine-features" aria-label="Kenapa Garage Coffee">
          {FEATURES.map(({ icon: Icon, label }, index) => (
            <li key={label} className="cine-feature">
              {index ? <span className="cine-sep" aria-hidden /> : null}
              <span className="cine-feature-row">
                <span className="cine-feature-icon" aria-hidden>
                  <Icon className="size-6" strokeWidth={1.8} />
                </span>
                <span className="cine-feature-bar" aria-hidden />
                <span className="cine-feature-label">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
