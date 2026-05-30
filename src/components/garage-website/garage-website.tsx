/* eslint-disable */
// @ts-nocheck
"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteAsset } from "@/lib/site-assets";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PremiumMembershipCard,
  PREMIUM_TIER_OPTIONS,
} from "@/components/garage/premium-membership-card";

const WHATSAPP_PHONE = "6281396186251";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}`;
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Garage%20Coffee%20%26%20Motor";
const DIGITAL_MENU_URL = {
  pathname: "/order",
  query: { source: "qr_takeaway", campaign: "landing_menu" },
};
const TABLE_PANEL_OPEN_EVENT = "garage:open-table-panel";
const tableCheckMenuUrl = (tableNumber) => ({
  pathname: "/order",
  query: { table: tableNumber, source: "campaign", campaign: "landing_table_check" },
});
const LOGIN_URL = "/login";
const MEMBER_LOGIN_URL = "/member-login";
const BRAND_LOGO_URL = "/garage-brand/logo-website.png";
const BRAND_LOGO_ASPECT = 1024 / 325;
const LOGIN_OPTIONS = [
  { label: "Login Karyawan", href: LOGIN_URL, meta: "POS & operasional" },
  { label: "Login Member", href: MEMBER_LOGIN_URL, meta: "Rewards & riwayat" },
  { label: "Daftar Member", href: `${MEMBER_LOGIN_URL}?mode=register`, meta: "Membership Master Pro" },
];
const isLoginHref = (href) => href === LOGIN_URL || href.startsWith(MEMBER_LOGIN_URL);
const goToAccess = (event, href = LOGIN_URL) => {
  event?.stopPropagation?.();
  window.location.href = href;
};
const digitalMenuItemUrl = (itemName) => ({
  pathname: "/order",
  query: { source: "qr_takeaway", campaign: "landing_menu", q: itemName },
});
const reservationWhatsAppUrl = (tableLabel) => {
  const message = tableLabel
    ? `Halo GARAGE, saya mau reservasi ${tableLabel}. Mohon info ketersediaan jamnya.`
    : "Halo GARAGE, saya mau reservasi meja. Mohon info ketersediaan meja.";
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
};
const requestTablePanelOpen = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TABLE_PANEL_OPEN_EVENT));
};

const TABLE_STATUS_COPY = {
  empty: { label: "Kosong", tone: "ready" },
  pending: { label: "Terisi", tone: "full" },
  occupied: { label: "Terisi", tone: "full" },
  needs_cleaning: { label: "Perlu dibersihkan", tone: "full" },
  unavailable: { label: "Sync", tone: "unknown" },
};

async function getPublicTableRows() {
  const response = await fetch("/api/customer/tables/live", {
    cache: "no-store",
    credentials: "include",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? "Status meja gagal dimuat.");
  }
  return json.data ?? [];
}

function tableStatusCopy(row) {
  if (row.needsCleaning) return TABLE_STATUS_COPY.needs_cleaning;
  return TABLE_STATUS_COPY[row.status] ?? TABLE_STATUS_COPY.unavailable;
}

function tableAvailabilityState(row) {
  if (!row) return "unknown";
  if (row.available && !row.needsCleaning) return "ready";
  if (row.needsCleaning || row.status === "needs_cleaning" || !row.available) return "full";
  return "unknown";
}

function formatTableTimestamp(value) {
  if (!value) return "Belum ada aktivitas";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update live";
  return `Update ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}
// Source: garage-website/project/primitives.jsx


// ---------- intersection-observer reveal ----------
function useReveal(opts = {}) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        });
      },
      { threshold: opts.threshold ?? 0.18, rootMargin: opts.rootMargin ?? "0px 0px -8% 0px" }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

// ---------- Reveal wrapper ----------
function Reveal({ as = "div", delay = 0, mask = false, className = "", children, style, ...rest }) {
  const Tag = as;
  const [ref, seen] = useReveal();
  const attr = mask ? "data-reveal-mask" : "data-reveal";
  return (
    <Tag
      ref={ref}
      {...{ [attr]: seen ? "in" : "" }}
      className={className}
      style={{ "--reveal-delay": `${delay}ms`, ...style }}
      {...rest}
    >
      {mask ? <span>{children}</span> : children}
    </Tag>
  );
}

// ---------- Split text into words (each in a mask) for stagger ----------
function SplitWords({ text, delayBase = 0, delayStep = 80, className = "", style }) {
  const words = text.split(" ");
  return (
    <span className={className} style={style}>
      {words.map((w, i) => (
        <Reveal
          key={i}
          mask
          delay={delayBase + i * delayStep}
          as="span"
          style={{ display: "inline-block", marginRight: "0.25em" }}
        >
          {w}
        </Reveal>
      ))}
    </span>
  );
}

// ---------- Magnetic button effect ----------
function useMagnetic(strength = 0.3) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    };
    const onLeave = () => { el.style.transform = "translate(0, 0)"; };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);
  return ref;
}

// ---------- LogoImage — the real brand mark (chrome + red A) ----------
// Renders the actual logo asset with cinematic styling.
function LogoImage({ variant = "wordmark", height, width, shimmer = false, sizes, preload = false, style, className = "" }) {
  const src = BRAND_LOGO_URL;
  const aspect = BRAND_LOGO_ASPECT;
  // Handle numeric and CSS-string sizes alike; use aspect-ratio CSS so any
  // dimension input (number, "min(640px,78vw)", "100%", etc.) yields the
  // correct counterpart automatically.
  const w = width != null ? (typeof width === "number" ? `${width}px` : width) : (typeof height === "number" ? `${height * aspect}px` : undefined);
  const h = height != null ? (typeof height === "number" ? `${height}px` : height) : (typeof width === "number" ? `${width / aspect}px` : undefined);
  const imageSizes =
    sizes ??
    (typeof width === "number"
      ? `${Math.ceil(width)}px`
      : typeof height === "number"
        ? `${Math.ceil(height * aspect)}px`
        : "(max-width: 768px) 80vw, 720px");
  return (
    <div
      className={`logo-image ${className}`}
      style={{
        position: "relative",
        display: "inline-block",
        width: w, height: h,
        aspectRatio: aspect,
        ...style,
      }}
    >
      <Image
        src={src}
        alt="Garage Coffee & Motor"
        fill
        sizes={imageSizes}
        preload={preload}
        style={{
          zIndex: 1,
          objectFit: "contain",
          display: "block",
        }}
        draggable={false}
      />
      {shimmer && (
        <div
          aria-hidden
          className="logo-shimmer"
          style={{
            position: "absolute", inset: 0, zIndex: 2,
            pointerEvents: "none",
            background: "linear-gradient(110deg, transparent 34%, rgba(255,255,255,0.08) 50%, transparent 66%)",
            mixBlendMode: "screen",
          }}
        />
      )}
    </div>
  );
}

// ---------- LogoLockup — typographic GARAGE with red A ----------
function LogoLockup({ size = 80, withSub = true, className = "" }) {
  return (
    <span className={`lockup ${className}`} style={{ fontSize: size, lineHeight: 0.85 }}>
      <span className="chrome">G</span>
      <span className="chrome">A</span>
      <span className="chrome">R</span>
      <span className="red-a">A</span>
      <span className="chrome">G</span>
      <span className="chrome">E</span>
      {withSub && (
        <span
          className="chrome"
          style={{
            fontSize: size * 0.22,
            marginLeft: size * 0.15,
            alignSelf: "flex-end",
            paddingBottom: size * 0.08,
            letterSpacing: "0.04em",
          }}
        >
          COFFEE&nbsp;&amp;&nbsp;MOTOR
        </span>
      )}
    </span>
  );
}

// ---------- Arrow icon ----------
function ArrowRight({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={`arrow ${className}`}>
      <path d="M3 8H13M13 8L8 3M13 8L8 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

// ---------- Star ----------
function Star({ filled = true, size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1">
      <path d="M6 1L7.5 4.5L11 5L8.5 7.5L9 11L6 9.5L3 11L3.5 7.5L1 5L4.5 4.5L6 1Z" />
    </svg>
  );
}

// ---------- ImageSlot — striped placeholder, accepts label ----------
function ImageSlot({ label, height, className = "", dark = false, children }) {
  return (
    <div className={`img-slot ${dark ? "dark" : ""} ${className}`} style={{ height }}>
      {children}
      <span className="img-label">{label}</span>
    </div>
  );
}

// ---------- Scroll progress hook ----------
function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const readScroll = () => Math.round(window.scrollY / 8) * 8;
    let lastY = readScroll();

    setY(lastY);

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nextY = readScroll();
        if (nextY !== lastY) {
          lastY = nextY;
          setY(nextY);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return y;
}

// ---------- Cursor follower (subtle accent) ----------
function CursorGlow() {
  const ref = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? true;
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    setEnabled(finePointer && !reducedMotion);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const el = ref.current;
    if (!el) return;
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    let tx = x, ty = y;
    const move = (e) => { x = e.clientX; y = e.clientY; };
    window.addEventListener("mousemove", move);
    let raf;
    const loop = () => {
      tx += (x - tx) * 0.08;
      ty += (y - ty) * 0.08;
      el.style.transform = `translate3d(${tx - 200}px, ${ty - 200}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { window.removeEventListener("mousemove", move); cancelAnimationFrame(raf); };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "fixed", top: 0, left: 0,
        width: 400, height: 400, pointerEvents: "none",
        background: "radial-gradient(circle, rgba(209,26,42,0.10), transparent 60%)",
        mixBlendMode: "screen",
        zIndex: 3,
      }}
    />
  );
}

// expose


// Source: garage-website/project/coffee-cup.jsx
// Side-view takeaway cup with a chrome sleeve carrying the
// transparent GARAGE logo. Animated steam wisps + subtle
// floating motion. Sits on a transparent canvas so the site
// bg shows through.

function CoffeeCup({ size = 360, floating = true, steam = true, className = "", style }) {
  const w = size;
  const h = size * 1.25;
  return (
    <div
      className={`${className} ${floating ? "logo-float" : ""}`}
      style={{
        position: "relative",
        width: w, height: h,
        ...style,
      }}
    >
      {/* red ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: "-10%",
          background: "radial-gradient(ellipse at 50% 60%, rgba(209,26,42,0.28), transparent 60%)",
          filter: "blur(36px)",
          pointerEvents: "none",
        }}
      />

      <svg
        viewBox="0 0 400 500"
        width="100%" height="100%"
        style={{ position: "relative", zIndex: 1, overflow: "visible", display: "block" }}
      >
        <defs>
          {/* CUP gradients */}
          <linearGradient id="cup-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#0a0a0c" />
            <stop offset="35%" stopColor="#1a1a1e" />
            <stop offset="50%" stopColor="#222226" />
            <stop offset="65%" stopColor="#1a1a1e" />
            <stop offset="100%" stopColor="#050507" />
          </linearGradient>
          <linearGradient id="lid-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#2a2a30" />
            <stop offset="100%" stopColor="#0a0a0c" />
          </linearGradient>
          <linearGradient id="sleeve-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#1a1a1e" />
            <stop offset="50%" stopColor="#3a3a42" />
            <stop offset="100%" stopColor="#0a0a0c" />
          </linearGradient>
          {/* coffee surface */}
          <radialGradient id="coffee-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#5a3a20" />
            <stop offset="60%" stopColor="#2a1a0e" />
            <stop offset="100%" stopColor="#100806" />
          </radialGradient>
          {/* highlight stripe */}
          <linearGradient id="cup-highlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id="rim-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#9a9aa2" />
            <stop offset="50%" stopColor="#3a3a42" />
            <stop offset="100%" stopColor="#9a9aa2" />
          </linearGradient>
          {/* clip the logo to the sleeve area */}
          <clipPath id="sleeve-clip">
            <path d="M 100 220 L 300 220 L 290 360 L 110 360 Z" />
          </clipPath>
        </defs>

        {/* STEAM wisps (animated via CSS) */}
        {steam && (
          <g className="steam">
            <path className="steam-w steam-w1"
              d="M 175 95 Q 165 70 178 50 Q 192 30 180 5"
              stroke="rgba(255,255,255,0.35)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path className="steam-w steam-w2"
              d="M 200 95 Q 215 70 200 50 Q 188 25 205 0"
              stroke="rgba(255,255,255,0.28)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path className="steam-w steam-w3"
              d="M 225 95 Q 215 70 230 50 Q 245 30 225 5"
              stroke="rgba(255,255,255,0.32)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* LID */}
        <ellipse cx="200" cy="100" rx="118" ry="14" fill="url(#lid-grad)" stroke="#3a3a42" strokeWidth="1.5" />
        <path d="M 82 100 L 88 130 Q 200 144 312 130 L 318 100 Z" fill="url(#lid-grad)" stroke="#3a3a42" strokeWidth="1.5" />
        {/* lid sip hole */}
        <ellipse cx="170" cy="100" rx="14" ry="3" fill="#050507" />

        {/* CUP BODY — tapered */}
        <path
          d="M 88 130 L 110 410 Q 200 426 290 410 L 312 130 Q 200 144 88 130 Z"
          fill="url(#cup-body)" stroke="#2a2a30" strokeWidth="1.5"
        />

        {/* CUP rim ring (under the lid) */}
        <ellipse cx="200" cy="130" rx="112" ry="9" fill="url(#rim-grad)" opacity="0.6" />

        {/* CUP body highlight (left-side reflection) */}
        <path
          d="M 110 150 Q 130 145 130 260 L 130 380 Q 118 388 115 392 L 100 150 Z"
          fill="url(#cup-highlight)"
          opacity="0.7"
        />

        {/* SLEEVE — chrome band wrapping middle of cup */}
        <path
          d="M 100 220 L 300 220 L 290 360 L 110 360 Z"
          fill="url(#sleeve-grad)"
          stroke="#4a4a52"
          strokeWidth="1"
        />
        {/* sleeve top/bottom stitching lines */}
        <path d="M 100 220 L 300 220" stroke="#5a5a62" strokeWidth="0.5" opacity="0.5" />
        <path d="M 110 360 L 290 360" stroke="#5a5a62" strokeWidth="0.5" opacity="0.5" />
        {/* sleeve subtle vertical metal highlight */}
        <path d="M 200 220 L 200 360" stroke="rgba(255,255,255,0.06)" strokeWidth="40" />

        {/* LOGO printed on sleeve */}
        <g clipPath="url(#sleeve-clip)">
          <text
            x="200"
            y="292"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#f3f3f5"
            fontSize="42"
            fontWeight="900"
            letterSpacing="4"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}
          >
            GARAGE
          </text>
          <text
            x="200"
            y="330"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#d11a2a"
            fontSize="12"
            fontWeight="800"
            letterSpacing="5"
          >
            COFFEE MOTOR
          </text>
        </g>

        {/* base shadow ellipse */}
        <ellipse cx="200" cy="420" rx="100" ry="6" fill="rgba(0,0,0,0.55)" filter="blur(4px)" />

        {/* COFFEE surface peek through lid hole — small dot */}
        <ellipse cx="170" cy="100" rx="11" ry="2" fill="url(#coffee-grad)" opacity="0.9" />
      </svg>

      <style>{`
        @keyframes steamRise1 {
          0%   { transform: translateY(20px); opacity: 0; }
          25%  { opacity: 0.9; }
          75%  { opacity: 0.9; }
          100% { transform: translateY(-40px); opacity: 0; }
        }
        @keyframes steamRise2 {
          0%   { transform: translateY(15px) translateX(-2px); opacity: 0; }
          30%  { opacity: 0.85; }
          70%  { opacity: 0.85; }
          100% { transform: translateY(-50px) translateX(2px); opacity: 0; }
        }
        @keyframes steamRise3 {
          0%   { transform: translateY(25px) translateX(2px); opacity: 0; }
          25%  { opacity: 0.95; }
          75%  { opacity: 0.95; }
          100% { transform: translateY(-30px) translateX(-3px); opacity: 0; }
        }
        .steam-w  { transform-origin: center; transform-box: fill-box; }
        .steam-w1 { animation: steamRise1 3.8s ease-in-out infinite; }
        .steam-w2 { animation: steamRise2 4.6s ease-in-out 0.4s infinite; }
        .steam-w3 { animation: steamRise3 4.2s ease-in-out 0.8s infinite; }
      `}</style>
    </div>
  );
}



// Source: garage-website/project/hero.jsx

// ---------------- LOADER ----------------
function Loader({ onDone }) {
  const [pct, setPct] = useState(0);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    let p = 0;
    let completed = false;
    let exitTimer;
    let doneTimer;

    const finish = () => {
      if (completed) return;
      completed = true;
      p = 100;
      setPct(100);
      clearInterval(t);
      exitTimer = setTimeout(() => setExiting(true), 80);
      doneTimer = setTimeout(onDone, 320);
    };

    const t = setInterval(() => {
      p += Math.random() * 24 + 18;
      if (p >= 100) finish();
      setPct(Math.floor(p));
    }, 42);

    const fallbackTimer = setTimeout(finish, 900);

    return () => {
      clearInterval(t);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
      clearTimeout(fallbackTimer);
    };
  }, [onDone]);
  return (
    <div
      data-garage-loader
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "radial-gradient(ellipse at center, #0c0c10 0%, #050507 80%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        transition: "transform 1.1s cubic-bezier(0.85,0,0.15,1), opacity 0.6s",
        transform: exiting ? "translateY(-100%)" : "translateY(0)",
        pointerEvents: exiting ? "none" : "auto",
        animation: "loaderAutoDismiss 0.45s cubic-bezier(0.85,0,0.15,1) 1.15s forwards"
      }}>

      <div className="hero-grid" style={{ opacity: 0.35 }} />
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ marginBottom: 36 }} className="mono">
          <span style={{ color: "var(--red)" }}>●</span>&nbsp; MEMANASKAN MESIN
        </div>

        {/* Cinematic logo reveal: blur-in + scale-up + shimmer sweep */}
        <div className="logo-enter" style={{ display: "inline-block" }}>
          <LogoImage
            variant="wordmark"
            width="clamp(280px, 78vw, 720px)"
            shimmer={false}
          />
        </div>

        <div style={{ marginTop: 56, width: "min(420px, 80vw)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }} className="mono">
            <span>MEMUAT</span>
            <span style={{ color: "var(--fg)" }}>{String(pct).padStart(3, "0")} / 100</span>
          </div>
          <div style={{ height: 2, background: "var(--bg-3)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--red), #ff6b75)",
              transition: "width 0.18s ease-out",
              boxShadow: "0 0 14px rgba(209,26,42,0.6)"
            }} />
          </div>
          <div className="mono" style={{ marginTop: 14, opacity: 0.5, fontSize: 9 }}>
            COFFEE · MOTOR · COMMUNITY
          </div>
        </div>
      </div>
      <style>{`
        @keyframes loaderAutoDismiss {
          to {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(-100%);
          }
        }
      `}</style>
    </div>);

}

// ---------------- NAV ----------------
const MEGA_CATS = [
{ icon: "☕", name: "Coffee", desc: "Espresso · V60 · Sanger · Vietnam Drip", count: "11 menu" },
{ icon: "✶", name: "Flavor Coffee", desc: "Butterscotch · Caramel · Mocca", count: "10 varian" },
{ icon: "❄", name: "Non-Coffee", desc: "12 varian dingin — semua Rp 12K", count: "12 menu" },
{ icon: "◆", name: "Makanan", desc: "Nasi Goreng · Indomie · Ayam Richeese", count: "9 menu" },
{ icon: "◼", name: "Burger & Kebab", desc: "30+ kombinasi mulai Rp 8K", count: "30+ varian" },
{ icon: "○", name: "Cemilan", desc: "Kentang · Sosis · Nugget — Rp 10K", count: "3 menu" }];


function Nav() {
  const y = useScrollY();
  const condensed = y > 80;
  const items = [
  ["Tentang", "#about"],
  ["Menu", "#menu", true],
  ["Suasana", "#atmosphere"],
  ["Pengalaman", "#experience"],
  ["Event", "#events"],
  ["Franchise", "/franchise"],
  ["Lokasi", "#location"]];

  const [mobOpen, setMobOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [tablePanelOpen, setTablePanelOpen] = useState(false);
  const [publicTableRows, setPublicTableRows] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");
  const [selectedTableNumber, setSelectedTableNumber] = useState("");
  const [tableLastSync, setTableLastSync] = useState(null);
  const megaTimer = React.useRef(null);
  const loginTimer = React.useRef(null);
  const openMega = () => {clearTimeout(megaTimer.current);setMegaOpen(true);};
  const closeMega = () => {megaTimer.current = setTimeout(() => setMegaOpen(false), 150);};
  const openLogin = () => {clearTimeout(loginTimer.current);setLoginOpen(true);};
  const closeLogin = () => {loginTimer.current = setTimeout(() => setLoginOpen(false), 150);};
  const refreshPublicTables = useCallback(async (options = {}) => {
    if (!options.silent) setTableLoading(true);
    setTableError("");
    try {
      const rows = await getPublicTableRows();
      setPublicTableRows(rows);
      setSelectedTableNumber((current) =>
        rows.some((row) => row.tableNumber === current && row.available) ? current : ""
      );
      setTableLastSync(new Date());
    } catch (error) {
      setTableError(error instanceof Error ? error.message : "Status meja gagal dimuat.");
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tablePanelOpen) return;
    void refreshPublicTables();
    const timer = window.setInterval(() => void refreshPublicTables({ silent: true }), 8000);
    return () => window.clearInterval(timer);
  }, [tablePanelOpen, refreshPublicTables]);

  const openTablePanel = useCallback(() => {
    setMobOpen(false);
    setTablePanelOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(TABLE_PANEL_OPEN_EVENT, openTablePanel);
    return () => window.removeEventListener(TABLE_PANEL_OPEN_EVENT, openTablePanel);
  }, [openTablePanel]);

  const selectedTable = publicTableRows.find((row) => row.tableNumber === selectedTableNumber);
  const selectedTableMenuUrl = selectedTable ? tableCheckMenuUrl(selectedTable.tableNumber) : "#";
  const availableTableCount = publicTableRows.filter((row) => row.available).length;
  const busyTableCount = publicTableRows.length ? publicTableRows.length - availableTableCount : 0;
  const tableSyncLabel = tableLastSync
    ? `Sync ${tableLastSync.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
    : "Menunggu sync";

  return (
    <>
      <nav
        style={{
          position: "fixed", top: condensed ? 50 : 60, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          transition: "all 0.5s var(--ease-out)",
          width: condensed ? "min(960px, calc(100vw - 32px))" : "calc(100vw - 32px)",
          maxWidth: 1400
        }}>
        
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: condensed ? "12px 18px" : "16px 24px",
            background: condensed ? "rgba(15,15,18,0.78)" : "rgba(15,15,18,0.35)",
            backdropFilter: "blur(16px) saturate(140%)",
            WebkitBackdropFilter: "blur(16px) saturate(140%)",
            border: "1px solid var(--line)",
            transition: "all 0.5s var(--ease-out)"
          }}>
          
          <a href="#top" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LogoImage variant="wordmark" height={condensed ? 28 : 34} />
            <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
            <span className="mono" style={{ fontSize: 9 }}>EST. 2026</span>
          </a>

          <ul style={{ display: "flex", gap: 28, listStyle: "none" }} className="nav-desktop">
            {items.map(([label, href, hasMega]) =>
            <li
              key={href}
              onMouseEnter={hasMega ? openMega : undefined}
              onMouseLeave={hasMega ? closeMega : undefined}
              style={{ position: "relative" }}>
              
                {href.startsWith("/") ? (
                  <Link href={href} className="navlink">
                    <span>{label}</span>
                  </Link>
                ) : (
                  <a href={href} className="navlink">
                    <span>{label}{hasMega && <span style={{ marginLeft: 6, opacity: 0.6 }}>▾</span>}</span>
                  </a>
                )}
              </li>
            )}
          </ul>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="login-dropdown"
              onMouseEnter={openLogin}
              onMouseLeave={closeLogin}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={loginOpen}
                onClick={() => setLoginOpen((open) => !open)}
                className="btn btn-primary"
                style={{ padding: "10px 16px", fontSize: 10 }}
              >
                <span>Login</span><span style={{ marginLeft: 2, opacity: 0.72 }}>▾</span>
              </button>
              <div className="login-menu" data-open={loginOpen ? "true" : "false"} role="menu">
                {LOGIN_OPTIONS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className="login-menu-item"
                    onClick={(event) => {
                      setLoginOpen(false);
                      goToAccess(event, item.href);
                    }}
                  >
                    <span>{item.label}</span>
                    <small>{item.meta}</small>
                  </a>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn"
              style={{ padding: "10px 16px", fontSize: 10 }}
              onClick={openTablePanel}
            >
              <span>Cek Meja</span><ArrowRight size={12} />
            </button>
            <button
              className="mob-toggle"
              onClick={() => setMobOpen(true)}
              aria-label="Open menu"
              style={{ display: "none" }}>
              
              <svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 7H19M3 15H19" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </div>
        </div>

        {/* Mega menu panel */}
        <div
          onMouseEnter={openMega}
          onMouseLeave={closeMega}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)", left: 0, right: 0,
            background: "rgba(13,13,16,0.95)",
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
            border: "1px solid var(--line)",
            pointerEvents: megaOpen ? "auto" : "none",
            opacity: megaOpen ? 1 : 0,
            transform: megaOpen ? "translateY(0)" : "translateY(-8px)",
            transition: "opacity 0.3s var(--ease-out), transform 0.3s var(--ease-out)"
          }}>
          
          <div style={{ padding: "32px 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
              <span className="mono" style={{ color: "var(--red)" }}>● MENU GARAGE — 90+ ITEM</span>
              <span className="mono">PILIH KATEGORI</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }} className="mega-grid">
              {MEGA_CATS.map((c, i) =>
              <a
                key={i}
                href="#menu"
                onClick={() => setMegaOpen(false)}
                style={{
                  padding: "20px",
                  borderRight: i % 3 !== 2 ? "1px solid var(--line)" : "0",
                  borderBottom: i < 3 ? "1px solid var(--line)" : "0",
                  display: "flex", flexDirection: "column", gap: 8,
                  transition: "background 0.3s var(--ease-out)",
                  cursor: "pointer"
                }}
                className="mega-cat">
                
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 20, color: "var(--red)" }}>{c.icon}</span>
                    <span className="mono">{c.count}</span>
                  </div>
                  <div style={{
                  fontFamily: "var(--font-display)", fontSize: 22,
                  letterSpacing: "0.02em", textTransform: "uppercase",
                  color: "var(--fg)"
                }}>{c.name}</div>
                  <div style={{ color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.4 }}>{c.desc}</div>
                </a>
              )}
            </div>
            <div style={{
              marginTop: 16, paddingTop: 18,
              borderTop: "1px solid var(--line)",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12
            }}>
              <span className="mono" style={{ color: "var(--amber)" }}>✦ PROMO MEI: BELI 2 KOPI GRATIS CEMILAN</span>
              <a href="#menu" onClick={() => setMegaOpen(false)} className="navlink" style={{ color: "var(--red)" }}>
                LIHAT MENU LENGKAP →
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className="mob-drawer"
        style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(8,8,10,0.96)",
          backdropFilter: "blur(20px)",
          transform: mobOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.5s var(--ease-out)",
          display: "none",
          flexDirection: "column",
          padding: "18px 18px 22px",
          overflowY: "auto"
        }}>
        
        <div className="mob-drawer-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <LogoImage variant="wordmark" height={30} />
          <button
            className="mob-close"
            onClick={() => setMobOpen(false)}
            aria-label="Close"
            style={{
              width: 44,
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,0.04)"
            }}>
            <svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 5L19 19M5 19L19 5" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
        <div className="mono mob-drawer-kicker" style={{ color: "var(--red)", marginBottom: 10 }}>
          ● Navigasi Garage
        </div>
        <ul className="mob-nav-list" style={{ listStyle: "none", display: "grid", gap: 8 }}>
          {items.map(([label, href], i) =>
          <li key={href}>
              {href.startsWith("/") ? (
                <Link
                  className="mob-nav-link"
                  href={href}
                  onClick={() => setMobOpen(false)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    minHeight: 52,
                    padding: "12px 14px",
                    border: "1px solid var(--line)",
                    background: "rgba(255,255,255,0.025)",
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase"
                  }}>

                  {label}
                  <span className="mono">0{i + 1}</span>
                </Link>
              ) : (
                <a
                className="mob-nav-link"
                href={href}
                onClick={() => setMobOpen(false)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  minHeight: 52,
                  padding: "12px 14px",
                  border: "1px solid var(--line)",
                  background: "rgba(255,255,255,0.025)",
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase"
                }}>

                  {label}
                  <span className="mono">0{i + 1}</span>
                </a>
              )}
            </li>
          )}
        </ul>
        <div className="mob-access" style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div className="mono" style={{ marginBottom: 10 }}>Akses cepat</div>
          {LOGIN_OPTIONS.map((item, i) => (
            <a
              className="mob-access-link"
              key={item.href}
              href={item.href}
              onClick={(event) => {
                setMobOpen(false);
                goToAccess(event, item.href);
              }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                minHeight: 48,
                padding: "10px 12px",
                marginBottom: 8,
                border: "1px solid var(--line)",
                background: i === 0 ? "rgba(209,26,42,0.12)" : "rgba(255,255,255,0.035)",
                fontFamily: "var(--font-display)",
                fontSize: 18,
                letterSpacing: "0.02em",
                textTransform: "uppercase"
              }}>
              <span>{item.label}</span>
              <span className="mono">A{i + 1}</span>
            </a>
          ))}
          <button
            type="button"
            className="mob-reserve-link"
            onClick={openTablePanel}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              minHeight: 50,
              padding: "12px 14px",
              border: "1px solid var(--red)",
              background: "var(--red)",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase"
            }}>
            <span>Cek Meja</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <Sheet open={tablePanelOpen} onOpenChange={setTablePanelOpen}>
        <SheetContent
          side="right"
          className="garage-table-sheet z-[80] w-[min(560px,calc(100vw-20px))] max-w-none gap-0 overflow-hidden border-[#34343c] bg-[#0d0d10] p-0 text-white sm:w-[520px]"
        >
          <SheetHeader className="border-b border-[#34343c] p-5 pr-14 text-left">
            <div className="mono" style={{ color: "var(--red)", fontSize: 10 }}>
              LIVE TABLE CHECK
            </div>
            <SheetTitle className="garage-table-title">Cek Meja</SheetTitle>
            <SheetDescription className="text-[#b8b8bf]">
              Pilih meja kosong, lalu lanjut reservasi via WhatsApp. Status refresh otomatis tiap 8 detik.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="garage-table-summary">
              <div>
                <span>Kosong</span>
                <strong>{publicTableRows.length ? availableTableCount : "-"}</strong>
              </div>
              <div>
                <span>Terisi</span>
                <strong>{publicTableRows.length ? busyTableCount : "-"}</strong>
              </div>
              <div>
                <span>Live</span>
                <strong>{tableSyncLabel}</strong>
              </div>
            </div>

            {tableError ? (
              <div className="garage-table-alert">
                <strong>Status meja gagal dimuat.</strong>
                <span>{tableError}</span>
              </div>
            ) : null}

            {tableLoading && !publicTableRows.length ? (
              <div className="garage-table-grid" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="garage-table-skeleton" />
                ))}
              </div>
            ) : (
              <div className="garage-table-grid">
                {publicTableRows.map((row) => {
                  const copy = tableStatusCopy(row);
                  const availability = tableAvailabilityState(row);
                  const selected = selectedTableNumber === row.tableNumber;
                  return (
                    <button
                      key={row.tableNumber}
                      type="button"
                      className="garage-table-card"
                      data-available={row.available ? "true" : "false"}
                      data-tone={copy.tone}
                      data-availability={availability}
                      data-selected={selected ? "true" : "false"}
                      disabled={!row.available}
                      title={`${row.tableLabel} - ${copy.label} - ${formatTableTimestamp(row.lastStatusAt)}`}
                      onClick={() => setSelectedTableNumber(row.tableNumber)}
                    >
                      <span className="garage-table-card-head">
                        <span className="garage-table-label">Meja</span>
                        <i
                          className="garage-table-indicator"
                          data-state={availability}
                          aria-hidden="true"
                        />
                      </span>
                      <strong className="garage-table-number">{row.tableNumber}</strong>
                      <span className="garage-table-state">
                        <i
                          className="garage-table-indicator"
                          data-state={availability}
                          aria-hidden="true"
                        />
                        <em>{copy.label}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <SheetFooter className="gap-3 border-t border-[#34343c] bg-[#111116] p-4">
            <div className="garage-table-picked">
              <span>Meja dipilih</span>
              <strong>{selectedTable?.tableLabel ?? "Pilih meja kosong"}</strong>
            </div>
            <div className="garage-table-actions">
              <button
                type="button"
                className="garage-table-refresh"
                onClick={() => void refreshPublicTables()}
                disabled={tableLoading}
              >
                {tableLoading ? "Refresh..." : "Refresh"}
              </button>
              <Link
                href={selectedTableMenuUrl}
                aria-disabled={!selectedTable}
                className="garage-table-menu"
                onClick={(event) => {
                  if (!selectedTable) event.preventDefault();
                }}
              >
                Menu Digital
              </Link>
              <a
                href={reservationWhatsAppUrl(selectedTable?.tableLabel)}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!selectedTable}
                className="garage-table-whatsapp"
                onClick={(event) => {
                  if (!selectedTable) event.preventDefault();
                }}
              >
                Reservasi via WhatsApp
              </a>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <style>{`
        .navlink {
          position: relative;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--fg-dim);
          padding: 8px 0;
          transition: color 0.3s var(--ease-out);
        }
        .navlink::after {
          content: ""; position: absolute; bottom: 0; left: 0;
          width: 0; height: 1px; background: var(--red);
          transition: width 0.4s var(--ease-out);
        }
        .navlink:hover { color: var(--fg); }
        .navlink:hover::after { width: 100%; }
        .mega-cat:hover { background: rgba(209,26,42,0.06); }
        .login-dropdown {
          position: relative;
          display: inline-flex;
        }
        .login-menu {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: 238px;
          padding: 8px;
          background: rgba(13,13,16,0.96);
          border: 1px solid var(--line);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: 0 24px 60px rgba(0,0,0,0.38), 0 0 32px rgba(209,26,42,0.1);
          opacity: 0;
          pointer-events: none;
          transform: translateY(-8px);
          transition: opacity 0.28s var(--ease-out), transform 0.28s var(--ease-out);
        }
        .login-menu[data-open="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .login-menu-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 13px 14px;
          border: 1px solid transparent;
          transition: background 0.24s var(--ease-out), border-color 0.24s var(--ease-out), transform 0.24s var(--ease-out);
        }
        .login-menu-item span {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--fg);
        }
        .login-menu-item small {
          font-size: 12px;
          color: var(--fg-mute);
        }
        .login-menu-item:hover {
          background: rgba(209,26,42,0.08);
          border-color: rgba(209,26,42,0.26);
          transform: translateX(2px);
        }
        .garage-table-title {
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 34px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .garage-table-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }
        .garage-table-summary > div {
          min-width: 0;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.04);
          padding: 12px;
        }
        .garage-table-summary span,
        .garage-table-picked span {
          display: block;
          color: var(--fg-mute);
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .garage-table-summary strong,
        .garage-table-picked strong {
          display: block;
          margin-top: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--fg);
          font-size: 15px;
          font-weight: 900;
        }
        .garage-table-alert {
          display: grid;
          gap: 4px;
          margin-bottom: 14px;
          border: 1px solid rgba(209,26,42,0.42);
          background: rgba(209,26,42,0.12);
          padding: 12px;
          color: #ffd7da;
          font-size: 13px;
        }
        .garage-table-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }
        .garage-table-card {
          min-height: 94px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          align-items: stretch;
          gap: 7px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.035);
          padding: 10px;
          text-align: left;
          transition: border-color 0.22s var(--ease-out), background 0.22s var(--ease-out), transform 0.22s var(--ease-out);
        }
        .garage-table-card-head {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .garage-table-label {
          color: var(--fg-mute);
          font-family: var(--font-mono);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .garage-table-number {
          align-self: center;
          display: block;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 34px;
          font-weight: 900;
          line-height: 0.9;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .garage-table-state {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          gap: 5px;
          min-height: 22px;
          border: 1px solid var(--line);
          padding: 3px 6px;
          color: var(--fg-dim);
          font-family: var(--font-mono);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .garage-table-card em {
          color: inherit;
          font-size: inherit;
          font-style: normal;
          font-weight: inherit;
        }
        .garage-table-indicator {
          display: inline-flex;
          width: 8px;
          height: 8px;
          flex-shrink: 0;
          border-radius: 999px;
          background: #72727c;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
        }
        .garage-table-indicator[data-state="ready"] {
          animation: garageTableReadyPulse 2s ease-in-out infinite;
          background: #0db86c;
          box-shadow:
            0 0 0 1px rgba(13,184,108,0.36),
            0 0 16px rgba(13,184,108,0.3);
        }
        .garage-table-indicator[data-state="full"] {
          animation: garageTableFullPulse 1.12s ease-in-out infinite;
          background: var(--red);
          box-shadow:
            0 0 0 1px rgba(209,26,42,0.4),
            0 0 18px rgba(209,26,42,0.4);
        }
        .garage-table-indicator[data-state="unknown"] {
          background: #72727c;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
        }
        .garage-table-card[data-available="true"] {
          cursor: pointer;
          background: rgba(13,184,108,0.08);
          border-color: rgba(13,184,108,0.34);
        }
        .garage-table-card[data-available="true"] .garage-table-state {
          border-color: rgba(13,184,108,0.38);
          color: #9af0bf;
        }
        .garage-table-card[data-available="true"] .garage-table-number {
          color: #f5fff9;
        }
        .garage-table-card[data-available="true"]:hover,
        .garage-table-card[data-selected="true"] {
          background: rgba(13,184,108,0.14);
          border-color: rgba(13,184,108,0.74);
          transform: translateY(-1px);
        }
        .garage-table-card[data-availability="full"] {
          border-color: rgba(209,26,42,0.34);
          background: rgba(209,26,42,0.08);
        }
        .garage-table-card[data-availability="full"] .garage-table-state {
          border-color: rgba(209,26,42,0.46);
          color: #ffb8bf;
        }
        .garage-table-card[data-availability="unknown"] .garage-table-state {
          border-color: rgba(150,150,161,0.42);
          color: #d4d4d8;
        }
        .garage-table-card:disabled {
          cursor: not-allowed;
          opacity: 0.78;
        }
        .garage-table-skeleton {
          min-height: 112px;
          border: 1px solid var(--line);
          background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04));
          background-size: 220% 100%;
          animation: garageTableSkeleton 1.2s linear infinite;
        }
        .garage-table-picked {
          min-width: 0;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.04);
          padding: 12px;
        }
        .garage-table-actions {
          display: grid;
          grid-template-columns: 104px minmax(0, 1fr) minmax(0, 1fr);
          gap: 10px;
        }
        .garage-table-refresh,
        .garage-table-menu,
        .garage-table-whatsapp {
          min-height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--line-2);
          padding: 0 14px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: background 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
        }
        .garage-table-refresh {
          color: var(--fg);
          background: rgba(255,255,255,0.04);
        }
        .garage-table-menu {
          border-color: rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.06);
          color: var(--fg);
          text-align: center;
        }
        .garage-table-whatsapp {
          border-color: var(--red);
          background: var(--red);
          color: #fff;
          text-align: center;
        }
        .garage-table-refresh:disabled,
        .garage-table-menu[aria-disabled="true"],
        .garage-table-whatsapp[aria-disabled="true"] {
          cursor: not-allowed;
          opacity: 0.52;
        }
        @keyframes garageTableSkeleton {
          to { background-position: -220% 0; }
        }
        @keyframes garageTableReadyPulse {
          0%, 100% {
            opacity: 0.78;
            transform: scale(1);
            box-shadow:
              0 0 0 1px rgba(13,184,108,0.26),
              0 0 10px rgba(13,184,108,0.2);
          }
          50% {
            opacity: 1;
            transform: scale(1.14);
            box-shadow:
              0 0 0 3px rgba(13,184,108,0.18),
              0 0 20px rgba(13,184,108,0.36);
          }
        }
        @keyframes garageTableFullPulse {
          0%, 100% {
            opacity: 0.82;
            transform: scale(1);
            box-shadow:
              0 0 0 1px rgba(209,26,42,0.3),
              0 0 12px rgba(209,26,42,0.24);
          }
          48% {
            opacity: 1;
            transform: scale(1.2);
            box-shadow:
              0 0 0 4px rgba(209,26,42,0.22),
              0 0 24px rgba(209,26,42,0.46);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .garage-table-indicator {
            animation: none !important;
          }
        }
        @media (max-width: 1000px) {
          .nav-desktop { display: none !important; }
          .login-dropdown { display: none !important; }
          .mob-toggle { display: inline-flex !important; }
          .mob-drawer { display: flex !important; }
        }
        @media (max-width: 700px) {
          .mega-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 430px) {
          .mob-drawer { padding: 16px !important; }
          .mob-drawer-head { margin-bottom: 14px !important; }
          .mob-nav-list { gap: 7px !important; }
          .mob-nav-link { min-height: 48px !important; padding: 10px 12px !important; font-size: 19px !important; }
          .mob-access { margin-top: 12px !important; padding-top: 12px !important; }
          .mob-access-link { min-height: 46px !important; font-size: 16px !important; }
          .garage-table-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .garage-table-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .garage-table-card {
            min-height: 88px;
            padding: 9px;
          }
          .garage-table-number {
            font-size: 30px;
          }
          .garage-table-actions {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 390px) {
          .mob-nav-link { font-size: 18px !important; }
          .mob-access-link { font-size: 15px !important; }
          .mob-reserve-link { min-height: 48px !important; }
        }
        @media (max-width: 350px) {
          .garage-table-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </>);

}

// ---------------- HERO ----------------
function Hero({ landingHero }) {
  const y = useScrollY();
  const parallax = Math.min(y * 0.3, 200);

  // floating particles
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const particleCount = reducedMotion ? 0 : coarsePointer ? 10 : 18;

    setParticles(Array.from({ length: particleCount }, (_, i) => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 8,
      dur: 12 + Math.random() * 10,
      size: 1 + Math.random() * 2.5,
      op: 0.15 + Math.random() * 0.35
    })));
  }, []);

  const hasLandingHero = Boolean(landingHero?.publicUrl);

  if (hasLandingHero) {
    return (
      <section id="top" className="hero-with-image" style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
        <div className="hero-bg">
          <div className="hero-grid" />
          <div className="light-sweep" />
          <div style={{ position: "absolute", inset: 0 }}>
            {particles.map((p, i) =>
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${p.left}%`, top: `${p.top}%`,
                width: p.size, height: p.size,
                background: "rgba(255,255,255,0.7)",
                borderRadius: "50%",
                opacity: p.op,
                animation: `floatUp ${p.dur}s linear ${p.delay}s infinite`,
                boxShadow: "0 0 6px rgba(255,255,255,0.4)"
              }} />

            )}
          </div>
          <div style={{
            position: "absolute", bottom: "-20%", right: "-10%",
            width: 600, height: 600,
            background: "radial-gradient(circle, rgba(209,26,42,0.35), transparent 60%)",
            filter: "blur(60px)",
            transform: `translateY(${parallax}px)`
          }} />
        </div>

        <div className="shell hero-image-shell" style={{ position: "relative", zIndex: 3, paddingTop: 150, paddingBottom: 58 }}>
          <div className="hero-meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 42 }}>
            <Reveal as="div" className="mono" delay={900}>
              ● BUKA — MENYAJIKAN SEKARANG / EST. 2024
            </Reveal>
            <Reveal as="div" className="mono" delay={1000} style={{ textAlign: "right" }}>
              JL. MAYJEN SUTOYO, RAMBUNG, / BUKA 07—23
            </Reveal>
          </div>

          <div className="hero-image-layout">
            <Reveal delay={240} className="hero-image-copy">
              <LogoImage
                variant="wordmark"
                width="min(420px, 82vw)"
                shimmer={false}
                sizes="(max-width: 768px) 82vw, 420px"
              />
              <h1 className="display hero-image-title" aria-label="Lebih dari sekedar kopi.">
                LEBIH DARI SEKEDAR KOPI.
              </h1>
              <p className="hero-image-lead">
                Kopi premium dengan jiwa otomotif. Sebuah bengkel rasa untuk mereka yang masih bertahan duduk lama setelah seruputan terakhir.
              </p>
              <div className="hero-image-actions">
                <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Jelajahi Menu</span><ArrowRight /></Link>
                <button type="button" onClick={requestTablePanelOpen} className="btn"><span>Reservasi Meja</span><ArrowRight /></button>
              </div>
            </Reveal>

            <Reveal delay={420} className="hero-image-media-wrap">
              <div className="hero-image-media">
                <Image
                  src={landingHero.publicUrl}
                  alt={landingHero.alt || "Hero Garage Coffee & Motor"}
                  fill
                  sizes="(max-width: 768px) 92vw, 900px"
                  quality={75}
                  style={{ objectFit: "cover", objectPosition: "center" }}
                />
                <div className="hero-image-sheen" aria-hidden />
              </div>
              <div className="hero-image-meta mono">
                WEBP {Math.max(1, Math.round((landingHero.sizeBytes || 0) / 1024))} KB / LOCAL ASSET
              </div>
            </Reveal>
          </div>

          <Reveal delay={760} className="hero-image-stats">
            <Stat n="14" l="Menu signature" />
            <Stat n="48jam" l="Roasting segar" />
            <Stat n="4.9" l="Rating pelanggan" />
          </Reveal>
        </div>

        <Reveal delay={940} className="marquee" style={{ marginTop: 0 }}>
          <div className="marquee-track">
            {Array.from({ length: 4 }).flatMap((_, k) => [
            <span key={`a${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>SINGLE ORIGIN</span>,
            <span key={`b${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
            <span key={`c${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>SLOW BAR</span>,
            <span key={`d${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
            <span key={`e${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>GARAGE SPESIAL</span>,
            <span key={`f${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
            <span key={`g${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>BUDAYA MOTOR</span>,
            <span key={`h${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>]
            )}
          </div>
        </Reveal>

        <style>{`
          @keyframes floatUp {
            0%   { transform: translateY(20vh) translateX(0); opacity: 0; }
            10%  { opacity: var(--op, 1); }
            90%  { opacity: var(--op, 1); }
            100% { transform: translateY(-110vh) translateX(20px); opacity: 0; }
          }
          .hero-image-layout {
            display: grid;
            grid-template-columns: minmax(0, 0.84fr) minmax(460px, 1.16fr);
            align-items: center;
            gap: clamp(28px, 5vw, 76px);
          }
          .hero-image-title {
            margin: 34px 0 0;
            max-width: 760px;
            color: var(--fg);
            font-family: var(--font-display);
            font-size: clamp(64px, 8vw, 136px);
            line-height: 0.84;
            letter-spacing: 0.02em;
          }
          .hero-image-lead {
            margin-top: 28px;
            max-width: 520px;
            color: var(--fg-dim);
            font-size: 18px;
            line-height: 1.6;
          }
          .hero-image-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 34px;
          }
          .hero-image-media-wrap {
            min-width: 0;
          }
          .hero-image-media {
            position: relative;
            width: min(900px, 100%);
            min-height: 360px;
            height: clamp(420px, 54vw, 680px);
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 18px;
            background: #0b0b0d;
            box-shadow: 0 34px 90px rgba(0,0,0,0.46);
          }
          .hero-image-media::after {
            content: "";
            position: absolute;
            inset: 0;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 -120px 160px rgba(0,0,0,0.16);
            pointer-events: none;
          }
          .hero-image-sheen {
            position: absolute;
            inset: 0;
            background: linear-gradient(110deg, rgba(255,255,255,0.12), transparent 28%, transparent 70%, rgba(209,26,42,0.08));
            pointer-events: none;
          }
          .hero-image-meta {
            margin-top: 14px;
            color: var(--fg-mute);
            text-align: right;
          }
          .hero-image-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 32px;
            margin-top: 42px;
          }
          @media (max-width: 980px) {
            .hero-image-shell { padding-top: 126px !important; }
            .hero-image-layout { grid-template-columns: 1fr; }
            .hero-image-title { font-size: clamp(48px, 12vw, 92px); }
            .hero-image-lead { max-width: 100%; }
            .hero-image-actions { align-items: stretch; }
            .hero-image-actions .btn { flex: 1 1 220px; justify-content: center; }
            .hero-image-media {
              width: 100%;
              min-height: 300px;
              height: clamp(320px, 76vw, 560px);
              border-radius: 14px;
            }
            .hero-image-meta { text-align: left; }
          }
          @media (max-width: 560px) {
            .hero-image-shell { padding-top: 112px !important; }
            .hero-image-title { font-size: clamp(40px, 15vw, 64px); }
            .hero-image-lead { font-size: 16px; }
            .hero-image-actions { flex-direction: column; }
            .hero-image-media { min-height: 260px; height: 92vw; }
            .hero-image-stats { gap: 22px; justify-content: center; text-align: center; }
          }
        `}</style>
      </section>
    );
  }

  return (
    <section id="top" style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <div className="hero-bg">
        <div className="hero-grid" />
        <div className="light-sweep" />
        {/* particles */}
        <div style={{ position: "absolute", inset: 0 }}>
          {particles.map((p, i) =>
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${p.left}%`, top: `${p.top}%`,
              width: p.size, height: p.size,
              background: "rgba(255,255,255,0.7)",
              borderRadius: "50%",
              opacity: p.op,
              animation: `floatUp ${p.dur}s linear ${p.delay}s infinite`,
              boxShadow: "0 0 6px rgba(255,255,255,0.4)"
            }} />

          )}
        </div>
        {/* big red glow */}
        <div style={{
          position: "absolute", bottom: "-20%", right: "-10%",
          width: 600, height: 600,
          background: "radial-gradient(circle, rgba(209,26,42,0.4), transparent 60%)",
          filter: "blur(60px)",
          transform: `translateY(${parallax}px)`
        }} />
      </div>

      <div className="shell" style={{ position: "relative", zIndex: 3, paddingTop: 180, paddingBottom: 60 }}>
        {/* top mono row */}
        <div className="hero-meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 60 }}>
          <Reveal as="div" className="mono" delay={1200}>
            ● BUKA — MENYAJIKAN SEKARANG / EST. 2024
          </Reveal>
          <Reveal as="div" className="mono" delay={1300} style={{ textAlign: "right" }}>
            JL. MAYJEN SUTOYO, RAMBUNG, / BUKA 07—23
          </Reveal>
        </div>

        {/* brand mark — real logo as primary visual focus */}
        <div style={{ textAlign: "center", marginBottom: 32, position: "relative" }}>
          <div className="logo-enter logo-float" style={{ display: "inline-block", position: "relative" }}>
            <LogoImage
              variant="wordmark"
              width="min(640px, 78vw)"
              shimmer={false}
            />
          </div>
        </div>

        {/* main lockup */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Reveal mask delay={400} as="h1" className="display hero-title" aria-label="Lebih dari sekedar kopi."
          style={{ marginBottom: 8 }}>
            <span className="chrome hero-title-kicker" style={{
              display: "block",
              fontSize: "clamp(56px, 11vw, 168px)",
              background: "linear-gradient(180deg, #f4f4f5 0%, #c8c8cc 30%, #6a6a72 55%, #c8c8cc 78%, #f4f4f5 100%)",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              fontFamily: "var(--font-display)"
            }}>LEBIH&nbsp;DARI</span>
            <span className="hero-title-main" style={{
              display: "block",
              fontSize: "clamp(72px, 14vw, 220px)",
              color: "var(--fg)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.02em"
            }}>
              <span className="chrome" style={{
                background: "linear-gradient(180deg, #f4f4f5 0%, #c8c8cc 30%, #6a6a72 55%, #c8c8cc 78%, #f4f4f5 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent"
              }}>SEKED</span>
              <span className="red-a" style={{
                background: "linear-gradient(180deg, #ff5a6a 0%, var(--red) 50%, #6a0a14 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: "drop-shadow(0 0 14px rgba(209,26,42,0.5))"
              }}>A</span>
              <span className="chrome" style={{
                background: "linear-gradient(180deg, #f4f4f5 0%, #c8c8cc 30%, #6a6a72 55%, #c8c8cc 78%, #f4f4f5 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent"
              }}>R&nbsp;KOPI.</span>
            </span>
          </Reveal>
        </div>

        {/* sub copy + CTAs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: 40, marginTop: 80 }} className="hero-bottom">
          <Reveal delay={900} className="hero-bottom-left">
            <div className="eyebrow" style={{ marginBottom: 18 }}>Tentang kami</div>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: "var(--fg-dim)", maxWidth: 360 }}>
              Kopi premium dengan jiwa otomotif. Sebuah bengkel rasa untuk mereka yang masih bertahan duduk
              lama setelah seruputan terakhir.
            </p>
          </Reveal>

          <Reveal delay={1100} className="hero-bottom-mid">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Jelajahi Menu</span><ArrowRight /></Link>
              <button type="button" onClick={requestTablePanelOpen} className="btn"><span>Reservasi Meja</span><ArrowRight /></button>
            </div>
          </Reveal>

          <Reveal delay={1300} className="hero-bottom-right" style={{ textAlign: "right" }}>
            <div className="eyebrow" style={{ marginBottom: 18, justifyContent: "flex-end" }}>Sedang diseduh</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, flexWrap: "wrap" }}>
              <Stat n="14" l="Menu signature" />
              <Stat n="48jam" l="Roasting segar" />
              <Stat n="4.9" l="Rating pelanggan" />
            </div>
          </Reveal>
        </div>

        {/* scroll cue */}
        <div style={{ textAlign: "center", marginTop: 80 }}>
          <Reveal delay={1500} className="mono">
            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              GULIR UNTUK MULAI
              <span style={{
                width: 1, height: 40,
                background: "linear-gradient(180deg, var(--red), transparent)",
                animation: "scrollLine 2s ease-in-out infinite"
              }} />
            </span>
          </Reveal>
        </div>
      </div>

      {/* marquee */}
      <Reveal delay={1400} className="marquee" style={{ marginTop: 40 }}>
        <div className="marquee-track">
          {Array.from({ length: 4 }).flatMap((_, k) => [
          <span key={`a${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>SINGLE ORIGIN</span>,
          <span key={`b${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
          <span key={`c${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>SLOW BAR</span>,
          <span key={`d${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
          <span key={`e${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>GARAGE SPESIAL</span>,
          <span key={`f${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
          <span key={`g${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>BUDAYA MOTOR</span>,
          <span key={`h${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>]
          )}
        </div>
      </Reveal>

      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(20vh) translateX(0); opacity: 0; }
          10%  { opacity: var(--op, 1); }
          90%  { opacity: var(--op, 1); }
          100% { transform: translateY(-110vh) translateX(20px); opacity: 0; }
        }
        @keyframes scrollLine {
          0%, 100% { transform: scaleY(0.2); transform-origin: top; }
          50%      { transform: scaleY(1); transform-origin: top; }
        }
        @media (max-width: 900px) {
          .hero-meta-row { display: none !important; }
          .hero-bottom { grid-template-columns: 1fr !important; text-align: center !important; gap: 40px !important; }
          .hero-bottom-left p { max-width: 100% !important; margin: 0 auto !important; }
          .hero-bottom-right { text-align: center !important; }
          .hero-bottom-right .eyebrow { justify-content: center !important; }
          .hero-bottom-right > div:last-child { justify-content: center !important; }
        }
      `}</style>
    </section>);

}

function Stat({ n, l }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1, color: "var(--fg)" }}>{n}</div>
      <div className="mono" style={{ marginTop: 4 }}>{l}</div>
    </div>);

}

// ---------------- PROMO BAR ----------------
function PromoBar() {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const promoMessages = [
    "BELI 2 KOPI GRATIS CEMILAN — BERLAKU SAMPAI 31/05",
    "CAFE RACER NIGHT — JUM 16 MEI · RSVP DI INSTAGRAM",
    "MEMBER GARAGE CARD — DISKON 15% SETIAP HARI",
  ];
  return (
    <div className="promo-bar">
      <span className="promo-bar__label">✦ PROMO MEI</span>
      <div className="promo-bar__viewport">
        <div className="promo-bar__track">
          {[0, 1].map((group) => (
            <div className="promo-bar__group" key={group} aria-hidden={group === 1}>
              {promoMessages.map((message) => (
                <React.Fragment key={`${group}-${message}`}>
                  <span>{message}</span>
                  <span className="promo-bar__star">✶</span>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button className="promo-bar__close" onClick={() => setClosed(true)} aria-label="Tutup">
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3L11 11M3 11L11 3" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <style>{`
        .promo-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 51;
          min-height: 40px;
          display: flex;
          align-items: center;
          gap: 14px;
          overflow: hidden;
          isolation: isolate;
          padding: 8px 16px;
          color: #fff;
          background: linear-gradient(90deg, var(--red), #8b0f1a);
          border-bottom: 1px solid rgba(0,0,0,0.4);
        }
        .promo-bar__label,
        .promo-bar__close {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
        }
        .promo-bar__label,
        .promo-bar__group span {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          line-height: 1;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .promo-bar__viewport {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
        }
        .promo-bar__track {
          display: flex;
          width: max-content;
          transform: translate3d(0, 0, 0);
          animation: promoBarScroll 32s linear infinite;
          will-change: transform;
        }
        .promo-bar__group {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 28px;
          padding-right: 28px;
        }
        .promo-bar__star {
          color: rgba(255,255,255,0.78);
          letter-spacing: 0;
        }
        .promo-bar__close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          color: #fff;
          opacity: 0.82;
        }
        @keyframes promoBarScroll {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @media (max-width: 640px) {
          .promo-bar {
            gap: 10px;
            padding-inline: 10px;
          }
          .promo-bar__label,
          .promo-bar__group span {
            font-size: 10px;
            letter-spacing: 0.1em;
          }
          .promo-bar__group {
            gap: 22px;
            padding-right: 22px;
          }
        }
      `}</style>
    </div>);

}

// ---------------- FLOATING WHATSAPP ----------------
function FloatingWA() {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={WHATSAPP_URL}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed", bottom: 24, right: 24,
        zIndex: 49,
        display: "inline-flex", alignItems: "center", gap: hover ? 10 : 0,
        padding: hover ? "14px 18px 14px 14px" : "14px",
        background: "#25D366",
        color: "#0a3a1f",
        borderRadius: 100,
        boxShadow: "0 12px 36px rgba(37,211,102,0.4), 0 0 0 0 rgba(37,211,102,0.4)",
        transition: "all 0.4s var(--ease-out)",
        textDecoration: "none"
      }}
      aria-label="Order via WhatsApp"
      className="floating-wa">
      
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.6.1l-.9 1c-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.8-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.1.2 2.1 3.3 5.1 4.5 1.7.7 2.4.8 3.3.7.5-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.2-.3-.2-.6-.3z" />
        <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.5.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.3-1.2l-.3-.2L4 19.4l.8-3.4-.2-.3C3.4 14.5 3 13.3 3 12c0-5 4-9 9-9s9 4 9 9-4 9-9 9z" opacity="0.6" />
      </svg>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        letterSpacing: "0.18em", textTransform: "uppercase",
        fontWeight: 600,
        whiteSpace: "nowrap",
        maxWidth: hover ? 200 : 0,
        overflow: "hidden",
        transition: "max-width 0.4s var(--ease-out)"
      }}>
        Order via WhatsApp
      </span>
      <span style={{
        position: "absolute", top: 8, right: 8,
        width: 10, height: 10, borderRadius: "50%",
        background: "#0db86c",
        border: "2px solid #25D366",
        animation: "waPulse 2s ease-in-out infinite"
      }} />
      <style>{`
        @keyframes waPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(13,184,108,0.6); }
          50% { box-shadow: 0 0 0 10px rgba(13,184,108,0); }
        }
      `}</style>
    </a>);

}



// Source: garage-website/project/menu.jsx

const MENU = {
  "Coffee": {
    eyebrow: "Bar utama",
    summary: "Espresso, manual brew, dan klasik Nusantara — diseduh dari biji single-origin yang di-roasting in-house.",
    pricingHeader: ["Cold", "Hot"],
    groups: [{
      items: [
        { name: "Espresso Single",   prices: ["—",  "10"] },
        { name: "Espresso Double",   prices: ["—",  "15"] },
        { name: "Americano",         prices: ["15", "13"], badge: "Terlaris" },
        { name: "Americano Honey",   prices: ["20", "—"] },
        { name: "V60",               prices: ["—",  "25"], badge: "Manual Brew" },
        { name: "Long Black",        prices: ["17", "14"] },
        { name: "Ice Japanese",      prices: ["25", "—"], badge: "Rekomendasi" },
        { name: "Vietnam Drip",      prices: ["16", "14"] },
        { name: "Sanger",            prices: ["12", "10"], badge: "Klasik" },
        { name: "Coffee Latte",      prices: ["17", "15"] },
        { name: "Coffee Gula Aren",  prices: ["17", "15"], badge: "Lokal" },
      ]
    }],
  },

  "Flavor Coffee": {
    eyebrow: "Susu & rasa",
    summary: "Latte dengan sirup rumahan. Manis seimbang, espresso tetap terasa.",
    pricingHeader: ["Cold", "Hot"],
    groups: [{
      items: [
        { name: "Butterscotch Coffee Latte",  prices: ["23", "20"], badge: "Terlaris" },
        { name: "Butterscotch Coffee (Toast)", prices: ["25", "23"], badge: "Baru" },
        { name: "Vanilla Coffee Latte",        prices: ["20", "18"] },
        { name: "Caramel Coffee Latte",        prices: ["20", "18"] },
        { name: "Mocca Coffee Latte",          prices: ["20", "18"] },
        { name: "Strawberry Coffee Latte",     prices: ["20", "—"] },
        { name: "Hazelnut Coffee Latte",       prices: ["20", "18"] },
        { name: "Bon Bon",                     prices: ["18", "16"] },
        { name: "Americano Lemonade",          prices: ["19", "—"], badge: "Refreshing" },
        { name: "Coffee Honey",                prices: ["20", "—"] },
      ]
    }],
  },

  "Non-Coffee": {
    eyebrow: "Tanpa kopi",
    summary: "12 varian es kekinian. Satu harga: Rp 12K — semua dingin, semua kenyang rasa.",
    pricingHeader: ["Cold"],
    groups: [{
      items: [
        { name: "Cappucino",        prices: ["12"] },
        { name: "Mango",            prices: ["12"] },
        { name: "Avocado",          prices: ["12"] },
        { name: "Milk Tea",         prices: ["12"], badge: "Terlaris" },
        { name: "Taro",             prices: ["12"] },
        { name: "Cotton Candy",     prices: ["12"], badge: "Baru" },
        { name: "Strawberry",       prices: ["12"] },
        { name: "Lemon Tea",        prices: ["12"] },
        { name: "Permen Karet",     prices: ["12"] },
        { name: "Red Velvet",       prices: ["12"], badge: "Rekomendasi" },
        { name: "Chocolate",        prices: ["12"] },
        { name: "Cookies & Cream",  prices: ["12"] },
        { name: "Matcha Green Tea", prices: ["12"] },
      ]
    }],
  },

  "Makanan": {
    eyebrow: "Berat & ngenyangin",
    summary: "Indomie spesial, nasi goreng level pedas, dan paket Ayam Richeese untuk yang lapar besar.",
    groups: [
      {
        sub: "Indomie",
        pricingHeader: ["Harga"],
        items: [
          { name: "Indomie Kuah",   prices: ["12"] },
          { name: "Indomie Goreng", prices: ["12"] },
        ]
      },
      {
        sub: "Nasi Goreng",
        pricingHeader: ["Sedang", "Pedas"],
        items: [
          { name: "Nasi Goreng Telur",    prices: ["12", "13"] },
          { name: "Nasi Goreng Ayam",     prices: ["15", "16"], badge: "Terlaris" },
          { name: "Nasi Goreng Kampung",  prices: ["17", "18"] },
          { name: "Nasi Goreng Komplit",  prices: ["20", "21"], badge: "Rekomendasi" },
        ]
      },
      {
        sub: "Ayam Richeese",
        pricingHeader: ["BBQ", "Balado", "Campur"],
        items: [
          { name: "Ayam Richeese 1/4 · Paket 1 Orang + Nasi",  prices: ["25", "25", "30"] },
          { name: "Ayam Richeese 1/2 · Paket 2 Orang + Nasi",  prices: ["42", "42", "47"], badge: "Hemat" },
          { name: "Ayam Richeese Utuh · Paket 4 Orang + Nasi", prices: ["80", "80", "85"], badge: "Family" },
        ]
      },
    ],
  },

  "Burger & Kebab": {
    eyebrow: "Tangan terbaik di Kemang",
    summary: "30+ kombinasi mulai Rp 8K. Burger telur, crispy, kebab, sampai paket spesial komplit.",
    groups: [
      {
        sub: "Burger Telur",
        pricingHeader: ["Harga"],
        items: [
          { name: "Burger + Telur",                                    prices: ["8"] },
          { name: "Burger + Telur + Ayam",                             prices: ["10"] },
          { name: "Burger + Telur + Ayam + Sosis",                     prices: ["13"] },
          { name: "Burger + Telur + Ayam + Nugget Stick",              prices: ["13"] },
          { name: "Burger + Telur + Ayam + Sosis + Nugget Stick",      prices: ["16"], badge: "Komplit" },
          { name: "Burger + Telur + Sosis",                            prices: ["15"] },
          { name: "Burger + Telur + Sosis + Nugget",                   prices: ["14"] },
          { name: "Burger + Telur + Nugget",                           prices: ["12"] },
          { name: "Burger + Telur + Keju",                             prices: ["12"] },
          { name: "Burger + Telur + Keju + Ayam",                      prices: ["15"] },
          { name: "Burger + Telur + Keju + Ayam + Sosis",              prices: ["17"] },
          { name: "Burger + Telur + Keju + Ayam + Nugget Stick",       prices: ["17"] },
          { name: "Burger + Telur + Keju + Ayam + Sosis + Nugget",     prices: ["19"], badge: "Komplit" },
        ]
      },
      {
        sub: "Burger Crispy",
        pricingHeader: ["Harga"],
        items: [
          { name: "Burger + Telur + Crispy",                            prices: ["15"], badge: "Terlaris" },
          { name: "Burger + Telur + Crispy + Sosis",                    prices: ["17"] },
          { name: "Burger + Telur + Crispy + Nugget",                   prices: ["17"] },
          { name: "Burger + Telur + Keju + Crispy",                     prices: ["18"] },
          { name: "Burger + Telur + Crispy + Sosis + Nugget",           prices: ["20"] },
          { name: "Burger + Telur + Keju + Crispy + Sosis",             prices: ["19"] },
          { name: "Burger + Telur + Keju + Crispy + Nugget",            prices: ["19"] },
          { name: "Burger + Telur + Keju + Crispy + Sosis + Nugget",    prices: ["22"], badge: "Komplit" },
        ]
      },
      {
        sub: "Burger Spesial",
        pricingHeader: ["Harga"],
        items: [
          { name: "Burger Spesial Komplit", prices: ["25"], badge: "Signature" },
        ]
      },
      {
        sub: "Kebab",
        pricingHeader: ["Harga"],
        items: [
          { name: "Kebab + Telur",                            prices: ["10"] },
          { name: "Kebab + Telur + Ayam",                     prices: ["12"], badge: "Terlaris" },
          { name: "Kebab + Telur + Ayam + Sosis",             prices: ["20"] },
          { name: "Kebab + Telur + Ayam + Nugget",            prices: ["20"] },
          { name: "Kebab + Telur + Ayam + Sosis + Nugget",    prices: ["22"], badge: "Komplit" },
          { name: "Kebab + Telur + Sosis",                    prices: ["17"] },
          { name: "Kebab + Telur + Sosis + Nugget",           prices: ["20"] },
          { name: "Kebab + Telur + Nugget",                   prices: ["17"] },
        ]
      },
      {
        sub: "Kebab Spesial",
        pricingHeader: ["Harga"],
        items: [
          { name: "Kebab Spesial Komplit", prices: ["28"], badge: "Signature" },
        ]
      },
    ]
  },

  "Cemilan": {
    eyebrow: "Pelengkap ngopi",
    summary: "Goreng-gorengan klasik, satu harga Rp 10K. Pas buat nemenin pour over yang lama.",
    pricingHeader: ["Harga"],
    groups: [{
      items: [
        { name: "Kentang Goreng", prices: ["10"], badge: "Terlaris" },
        { name: "Sosis",          prices: ["10"] },
        { name: "Nugget",         prices: ["10"] },
      ]
    }],
  },
};

// ---------------- MENU SECTION ----------------
function Menu() {
  const cats = Object.keys(MENU);
  const [cat, setCat] = useState(cats[0]);
  const data = MENU[cat];
  const headerCols = data.pricingHeader || (data.groups[0]?.pricingHeader);

  return (
    <section id="menu" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-0), var(--bg-1))",
    }}>
      <div className="shell">
        {/* head */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 56, flexWrap: "wrap", gap: 24 }}>
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>02 / Bar</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Menu lengkap." style={{ fontSize: "clamp(48px, 8vw, 132px)" }}>
              <span style={{ display: "block" }}>Menu</span>
              <span style={{ display: "block", color: "var(--red)" }}>lengkap.</span>
            </Reveal>
          </div>
          <Reveal delay={400} style={{ maxWidth: 380 }}>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--fg-dim)" }}>
              90+ menu dari kopi single-origin, manual brew, sampai burger & kebab yang dimasak fresh.
              Mulai dari Rp 8K — selalu ada yang pas untuk semua mood.
            </p>
            <div style={{ display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" }}>
              <MenuStat n="90+" l="Total menu" />
              <MenuStat n="8K" l="Mulai dari" />
              <MenuStat n="07—23" l="Tersedia" />
            </div>
          </Reveal>
        </div>

        {/* tabs */}
        <div className="menu-tabs">
          {cats.map((c, i) => {
            const active = cat === c;
            return (
              <button key={c} onClick={() => setCat(c)} className={`menu-tab ${active ? "active" : ""}`}>
                <div className="mono" style={{ marginBottom: 8, color: active ? "var(--red)" : "var(--fg-mute)" }}>
                  0{i+1} · Kategori
                </div>
                <div className="menu-tab-name">{c}</div>
                <span className="menu-tab-underline" />
              </button>
            );
          })}
        </div>

        {/* category intro */}
        <div key={cat + "-intro"} style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40,
          padding: "32px 0",
          borderBottom: "1px solid var(--line)",
          alignItems: "end",
        }} className="cat-intro">
          <div>
            <div className="mono" style={{ color: "var(--red)", marginBottom: 8 }}>— {data.eyebrow}</div>
            <h3 style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(28px, 3vw, 40px)",
              letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--fg)",
              maxWidth: 500,
            }}>{data.summary}</h3>
          </div>
          {headerCols && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 0 }}>
              <div className="mono" style={{ marginRight: 32, alignSelf: "end", color: "var(--fg-mute)" }}>
                {data.groups.reduce((sum, g) => sum + g.items.length, 0)} item
              </div>
            </div>
          )}
        </div>

        {/* groups */}
        <div key={cat}>
          {data.groups.map((g, gi) => (
            <MenuGroup key={gi} group={g} />
          ))}
        </div>

        {/* footer cta */}
        <Reveal as="div" style={{
          marginTop: 56, padding: "32px 36px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 24, flexWrap: "wrap",
          border: "1px solid var(--line)",
          background: "linear-gradient(135deg, rgba(209,26,42,0.08), transparent)",
        }}>
          <div>
            <div className="mono" style={{ marginBottom: 8, color: "var(--red)" }}>✶ ORDER LANGSUNG</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "0.02em", textTransform: "uppercase" }}>
              Buka menu digital, pilih item, lalu kirim ke kasir.
            </h3>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn btn-primary" href={DIGITAL_MENU_URL}><span>Menu Digital</span><ArrowRight /></Link>
            <a className="btn" href={WHATSAPP_URL}><span>WhatsApp Order</span><ArrowRight /></a>
            <a className="btn" href={WHATSAPP_URL}><span>GoFood / Grab</span><ArrowRight /></a>
          </div>
        </Reveal>
      </div>

      <style>{`
        .menu-tabs {
          display: flex; gap: 0;
          border-top: 1px solid var(--line);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .menu-tabs::-webkit-scrollbar { display: none; }
        .menu-tab {
          position: relative;
          padding: 22px 24px;
          border-right: 1px solid var(--line);
          flex: 1 1 0;
          min-width: 160px;
          text-align: left;
          background: transparent;
          transition: background 0.4s var(--ease-out);
          cursor: pointer;
        }
        .menu-tab:last-child { border-right: 0; }
        .menu-tab.active { background: rgba(209,26,42,0.08); }
        .menu-tab-name {
          font-family: var(--font-display);
          font-size: 20px; letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--fg-dim);
          transition: color 0.4s var(--ease-out);
          line-height: 1;
        }
        .menu-tab.active .menu-tab-name { color: var(--fg); }
        .menu-tab:hover .menu-tab-name { color: var(--fg); }
        .menu-tab-underline {
          position: absolute; left: 0; bottom: -1px;
          width: 0; height: 2px;
          background: var(--red);
          transition: width 0.5s var(--ease-out);
        }
        .menu-tab.active .menu-tab-underline { width: 100%; }
        @media (max-width: 700px) {
          .cat-intro { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>
    </section>
  );
}

function MenuStat({ n, l }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--fg)", lineHeight: 1 }}>{n}</div>
      <div className="mono" style={{ marginTop: 4 }}>{l}</div>
    </div>
  );
}

function MenuGroup({ group }) {
  const cols = group.pricingHeader || ["Harga"];
  return (
    <div>
      {/* sub group header */}
      {group.sub && (
        <Reveal as="div" style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "32px 0 16px",
          borderBottom: "1px solid var(--line)",
        }}>
          <span className="mono" style={{ color: "var(--red)" }}>◢</span>
          <h4 style={{
            fontFamily: "var(--font-display)",
            fontSize: 22, letterSpacing: "0.04em",
            textTransform: "uppercase", color: "var(--fg)",
          }}>{group.sub}</h4>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span className="mono">{group.items.length} item</span>
        </Reveal>
      )}

      {/* pricing labels header (above first row) */}
      <div className="menu-priceheader" style={{
        display: "grid",
        gridTemplateColumns: `36px 1fr minmax(${Math.max(cols.length * 60, 60)}px, max-content) 80px`,
        gap: 16,
        padding: "16px 0",
        borderBottom: "1px solid var(--line)",
      }}>
        <span />
        <span className="mono">Menu</span>
        <div className="menu-price-cols">
          {cols.map((c, i) => (
            <span
              key={i}
              className="mono"
              style={{
                textAlign: "right",
                color: c === "Hot" ? "#ff6b75" : c === "Cold" ? "#5bb8ff" : c === "Pedas" ? "var(--red)" : c === "Sedang" ? "#0db86c" : c === "BBQ" ? "#b08858" : c === "Balado" ? "var(--red)" : c === "Campur" ? "#7a8cff" : "var(--fg-mute)",
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <span className="mono" style={{ textAlign: "right" }}>Aksi</span>
      </div>

      {/* items */}
      <div>
        {group.items.map((it, i) => (
          <MenuRow key={i} item={it} idx={i} cols={cols} />
        ))}
      </div>
    </div>
  );
}

function MenuRow({ item, idx, cols }) {
  const [ref, seen] = useReveal();
  const colorForBadge = (b) => {
    if (!b) return "";
    if (b === "Terlaris" || b === "Signature") return "red";
    if (b === "Baru" || b === "Komplit") return "new";
    return "amber";
  };
  return (
    <div
      ref={ref}
      data-reveal={seen ? "in" : ""}
      style={{
        display: "grid",
        gridTemplateColumns: `36px 1fr minmax(${Math.max(item.prices.length * 60, 60)}px, max-content) 80px`,
        gap: 16, alignItems: "center",
        padding: "18px 0",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        transition: "background 0.3s var(--ease-out), padding 0.3s var(--ease-out)",
        "--reveal-delay": `${(idx % 8) * 50}ms`,
      }}
      className="menurow"
    >
      <span className="idx">{String(idx + 1).padStart(2, "0")}</span>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h5 style={{
            fontFamily: "var(--font-body)",
            fontWeight: 600, fontSize: 15.5,
            color: "var(--fg)",
            letterSpacing: "0.005em",
          }}>{item.name}</h5>
          {item.badge && <span className={`tag ${colorForBadge(item.badge)}`}>{item.badge}</span>}
        </div>
      </div>
      <div className="menu-price-cols menu-row-prices">
        {item.prices.map((p, i) => (
          <span
            key={i}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: p === "—" ? 14 : 22,
              color: p === "—" ? "var(--fg-mute)" : "var(--fg)",
              textAlign: "right",
              lineHeight: 1,
            }}
          >
            {p === "—" ? "—" : (
              <>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-mute)", letterSpacing: "0.15em", marginRight: 2 }}>RP</span>
                {p}<span style={{ fontSize: 14, color: "var(--fg-mute)" }}>K</span>
              </>
            )}
          </span>
        ))}
      </div>
      <Link className="menu-add" href={digitalMenuItemUrl(item.name)} aria-label={`Pesan ${item.name}`}>
        <span>Pesan</span>
        <ArrowRight size={11} />
      </Link>

      <style>{`
        .menurow:hover { background: rgba(209,26,42,0.04); padding-left: 8px !important; padding-right: 8px !important; }
        .menu-price-cols {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(48px, 60px);
          gap: 0;
          justify-content: end;
          align-items: center;
        }
        .menu-add {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--fg-mute);
          display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px;
          transition: color 0.3s var(--ease-out);
          white-space: nowrap;
        }
        .menurow:hover .menu-add { color: var(--red); }
        @media (max-width: 700px) {
          .menu-priceheader { display: none !important; }
          .menurow {
            grid-template-columns: 28px minmax(0, 1fr) !important;
            gap: 10px !important;
            padding: 16px 0 !important;
          }
          .menurow:hover { padding-left: 0 !important; padding-right: 0 !important; }
          .menu-row-prices {
            display: flex;
            grid-column: 2 / -1;
            grid-auto-columns: auto;
            justify-content: start;
            gap: 10px 16px;
            flex-wrap: wrap;
          }
          .menu-add {
            grid-column: 2 / -1;
            min-height: 44px;
            justify-content: center;
            border: 1px solid var(--line);
            background: rgba(255,255,255,0.035);
          }
        }
      `}</style>
    </div>
  );
}



// Source: garage-website/project/sections-1.jsx

// ---------------- ABOUT ----------------
function About() {
  return (
    <section id="about" className="section-pad" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 80 }} className="about-grid">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 28 }}>01 / Identitas</Reveal>
            <Reveal as="div" delay={100} className="mono" style={{ marginBottom: 8 }}>SIAPA KAMI</Reveal>
            <Reveal mask as="h2" delay={200} className="display" aria-label="Tempat kopi bertemu budaya otomotif." style={{ fontSize: "clamp(40px, 5vw, 78px)" }}>
              <span style={{ display: "block" }}>Tempat kopi</span>
              <span style={{ display: "block" }}>bertemu <span style={{ color: "var(--red)" }}>budaya</span></span>
              <span style={{ display: "block" }}>otomotif.</span>
            </Reveal>

            <Reveal delay={700} as="div" style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 24, maxWidth: 460 }}>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--fg-dim)" }}>
                Dibangun untuk mereka yang menikmati ritual lambat — proses giling, seruputan pertama, dan obrolan yang
                tidak ingin selesai. Garage adalah bengkel yang menyamar jadi coffee shop, tempat material industrial
                bertemu seni meracik kopi, dan setiap kunjungan terasa seperti pulang ke garasi favoritmu.
              </p>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--fg-dim)" }}>
                Kami me-roasting dalam batch kecil. Buka pagi, tutup larut. Tidak mengikuti tren — kami sedang membangun
                tempat yang layak ditempuh perjalanannya.
              </p>
            </Reveal>

            <Reveal delay={900} as="div" style={{ marginTop: 48, display: "flex", gap: 36, flexWrap: "wrap" }}>
              <AboutStat n="240+" l="Cangkir per hari" />
              <AboutStat n="6" l="Origin di bar" />
              <AboutStat n="12" l="Event komunitas" />
            </Reveal>
          </div>

          {/* right column — feature card */}
          <div style={{ position: "relative" }}>
            <Reveal as="div">
              <div style={{
                position: "relative",
                aspectRatio: "4/5",
                background: "linear-gradient(180deg, #18181c, #0d0d10)",
                border: "1px solid var(--line)",
                overflow: "hidden",
              }}>
                {/* coffee cup background image */}
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img
                    src="/garage-website/assets/coffee-cup.png"
                    alt="Garage Coffee Cup"
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center",
                      opacity: 0.35,
                      filter: "brightness(0.7) contrast(1.2)",
                    }}
                  />
                </div>
                {/* dark gradient overlay for text readability */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(180deg, rgba(13,13,16,0.4) 0%, rgba(13,13,16,0.15) 40%, rgba(13,13,16,0.7) 70%, rgba(13,13,16,0.92) 100%)",
                  pointerEvents: "none",
                }} />

                <div style={{
                  position: "relative", padding: 40, height: "100%",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="tag red">● MANIFESTO</span>
                    <span className="mono">001 / 001</span>
                  </div>

                  <div>
                    <div className="mono" style={{ marginBottom: 14, color: "var(--red)" }}>— Janji kami</div>
                    <p style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "clamp(28px, 3.4vw, 48px)",
                      lineHeight: 1, letterSpacing: "0.01em",
                      textTransform: "uppercase",
                      color: "var(--fg)",
                    }}>
                      Dibangun untuk rasa,<br/>jiwa otomotif, dan<br/>komunitas.
                    </p>
                    <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
                      <span className="tag">Industrial</span>
                      <span className="tag">Otomotif</span>
                      <span className="tag">Slow craft</span>
                    </div>
                  </div>
                </div>

                {/* corner ticks */}
                {[[0,0],[0,100],[100,0],[100,100]].map(([x,y],i) => (
                  <span key={i} style={{
                    position: "absolute", top: `${y}%`, left: `${x}%`,
                    transform: `translate(${x===0?"-50%":"-50%"}, ${y===0?"-50%":"-50%"})`,
                    width: 16, height: 16, border: "1px solid var(--red)",
                    borderRight: x===0 ? "1px solid var(--red)" : 0,
                    borderBottom: y===0 ? "1px solid var(--red)" : 0,
                    borderLeft: x===100 ? "1px solid var(--red)" : 0,
                    borderTop: y===100 ? "1px solid var(--red)" : 0,
                  }} />
                ))}
              </div>
            </Reveal>

            <Reveal delay={200} as="div" style={{
              position: "absolute", bottom: -30, left: -30,
              padding: "14px 18px",
              background: "var(--bg-1)",
              border: "1px solid var(--red)",
              fontFamily: "var(--font-display)", fontSize: 20,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              EST. 2024 ◢ JAKARTA
            </Reveal>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .about-grid { grid-template-columns: 1fr !important; gap: 60px !important; }
        }
      `}</style>
    </section>
  );
}
function AboutStat({ n, l }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 44, color: "var(--fg)", lineHeight: 1 }}>{n}</div>
      <div className="mono" style={{ marginTop: 6 }}>{l}</div>
    </div>
  );
}


// ---------------- ATMOSPHERE ----------------
function Atmosphere({ landingHero = null }) {
  const tiles = [
    { l: "Interior — area utama",         h: 360, c: 1 },
    { l: "Bar — pour over station",       h: 460, c: 1 },
    { l: "Suasana malam — eksterior",     h: 400, c: 2 },
    { l: "Pintu garasi — open kitchen",   h: 340, c: 1 },
    { l: "Dinding fitur motor",           h: 420, c: 1 },
    { l: "Latte art — close up",          h: 360, c: 1 },
  ];
  return (
    <section id="atmosphere" className="section-pad" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 64, flexWrap: "wrap", gap: 24 }}>
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>03 / Suasana</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Ruang yang betah ditinggali." style={{ fontSize: "clamp(48px, 8vw, 132px)" }}>
              <span style={{ display: "block" }}>Ruang yang</span>
              <span style={{ display: "block" }}><span style={{ color: "var(--red)" }}>betah</span> ditinggali.</span>
            </Reveal>
          </div>
          <Reveal delay={400} style={{ maxWidth: 340 }}>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--fg-dim)" }}>
              Beton ekspos. Mezzanine baja. CB350 vintage tergantung di tempat yang biasanya jadi papan menu.
              Dirancang untuk malam yang enggan diakhiri.
            </p>
          </Reveal>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr 1fr",
          gridAutoRows: "minmax(0, auto)",
          gap: 16,
        }} className="gallery-grid">
          <Reveal delay={0}><ImageSlot label={tiles[0].l} height={tiles[0].h} /></Reveal>
          <Reveal delay={120}>
            <ImageSlot label={landingHero?.alt || "Garage signature cup"} height={tiles[1].h}>
              {landingHero?.publicUrl ? (
                <>
                  <Image
                    src={landingHero.publicUrl}
                    alt={landingHero.alt || "Garage Coffee & Motor"}
                    fill
                    sizes="(max-width: 900px) 92vw, 520px"
                    quality={75}
                    style={{ objectFit: "cover", objectPosition: "center" }}
                  />
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.34))",
                      pointerEvents: "none",
                    }}
                  />
                </>
              ) : (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CoffeeCup size={Math.min(280, tiles[1].h * 0.62)} />
                </div>
              )}
            </ImageSlot>
          </Reveal>
          <Reveal delay={240}><ImageSlot label={tiles[2].l} height={tiles[2].h} dark /></Reveal>
          <Reveal delay={360}><ImageSlot label={tiles[3].l} height={tiles[3].h} dark /></Reveal>
          <Reveal delay={480}><ImageSlot label={tiles[4].l} height={tiles[4].h} /></Reveal>
          <Reveal delay={600}><ImageSlot label={tiles[5].l} height={tiles[5].h} /></Reveal>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .gallery-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

// ---------------- EXPERIENCE ----------------
function Experience() {
  const props = [
    {
      n: "01",
      t: "Kopi premium",
      d: "Biji specialty grade, di-roasting maksimal 48 jam sebelum diseduh. Setiap batch dicicipi sebelum tampil di bar.",
      i: <PromoIcon kind="cup" />,
    },
    {
      n: "02",
      t: "Nyaman ditinggali lama",
      d: "Meja panjang. Kursi empuk. Colokan di setiap tempat duduk. Ruang yang dirancang untuk obrolan empat jam.",
      i: <PromoIcon kind="chair" />,
    },
    {
      n: "03",
      t: "Pas buat kerja",
      d: "Wi-Fi kencang, zona tenang, dan bar yang siap refill sebelum kamu minta.",
      i: <PromoIcon kind="wifi" />,
    },
    {
      n: "04",
      t: "Garasi komunitas",
      d: "Kopdar motor, supper club, malam kreatif. Pintu selalu terbuka untuk yang suka berkarya.",
      i: <PromoIcon kind="cog" />,
    },
    {
      n: "05",
      t: "Pelayanan tulus",
      d: "Barista terlatih, regular yang dipanggil namanya, tanpa basa-basi. Visualnya industrial — sambutannya hangat.",
      i: <PromoIcon kind="hand" />,
    },
  ];

  return (
    <section id="experience" className="section-pad" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div style={{ marginBottom: 64 }}>
          <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>04 / Pengalaman</Reveal>
          <Reveal mask as="h2" delay={100} className="display" aria-label="Lima alasan untuk mampir akhir pekan ini." style={{ fontSize: "clamp(48px, 7vw, 116px)", maxWidth: 1100 }}>
            <span style={{ display: "block" }}>Lima alasan untuk</span>
            <span style={{ display: "block" }}>mampir <span style={{ color: "var(--red)" }}>akhir pekan ini.</span></span>
          </Reveal>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }} className="exp-grid">
          {props.map((p, i) => (
            <Reveal as="div" key={p.n} delay={i * 100}>
              <ExpCard p={p} i={i} />
            </Reveal>
          ))}
          <Reveal as="div" delay={500}>
            <div style={{
              position: "relative",
              padding: 36,
              height: "100%",
              minHeight: 320,
              background: "var(--red)",
              color: "#fff",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              border: "1px solid var(--red)",
            }}>
              <div className="mono" style={{ color: "rgba(255,255,255,0.7)" }}>06 / SELANJUTNYA</div>
              <div>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: 36,
                  letterSpacing: "0.02em", textTransform: "uppercase",
                  lineHeight: 0.9, marginBottom: 16,
                }}>
                  Datang dan temukan<br/>alasan kelimamu.
                </div>
                <a href="#location" className="btn" style={{ background: "rgba(0,0,0,0.2)", borderColor: "rgba(255,255,255,0.4)", color: "#fff" }}>
                  <span>Kunjungi Garage</span><ArrowRight />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { .exp-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 600px) { .exp-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

function ExpCard({ p, i }) {
  return (
    <div className="exp-card card" style={{
      padding: 36, minHeight: 320,
      borderRight: (i+1) % 3 !== 0 ? "1px solid var(--line)" : "1px solid var(--line)",
      borderBottom: "1px solid var(--line)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      background: "transparent",
    }}>
      <span className="card-edge" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <span className="mono" style={{ color: "var(--red)" }}>{p.n}</span>
        <div style={{ width: 48, height: 48, color: "var(--silver)" }}>{p.i}</div>
      </div>
      <div>
        <h3 style={{
          fontFamily: "var(--font-display)", fontSize: 30,
          letterSpacing: "0.02em", textTransform: "uppercase",
          marginBottom: 12, lineHeight: 1,
        }}>
          {p.t}
        </h3>
        <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.55 }}>{p.d}</p>
      </div>
    </div>
  );
}

function PromoIcon({ kind }) {
  const stroke = "currentColor";
  switch (kind) {
    case "cup":
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M10 14H34V30C34 35 30 38 24 38C18 38 14 35 14 30L10 14Z" stroke={stroke} strokeWidth="1.4"/>
          <path d="M34 18H40C42 18 42 24 40 24H34" stroke={stroke} strokeWidth="1.4"/>
          <path d="M18 6V10M22 4V10M26 6V10" stroke={stroke} strokeWidth="1.4"/>
        </svg>
      );
    case "chair":
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <rect x="10" y="14" width="28" height="6" stroke={stroke} strokeWidth="1.4"/>
          <path d="M12 20V36M36 20V36M10 26H38" stroke={stroke} strokeWidth="1.4"/>
        </svg>
      );
    case "wifi":
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M8 20C18 12 30 12 40 20" stroke={stroke} strokeWidth="1.4"/>
          <path d="M14 26C20 21 28 21 34 26" stroke={stroke} strokeWidth="1.4"/>
          <path d="M19 32C22 30 26 30 29 32" stroke={stroke} strokeWidth="1.4"/>
          <circle cx="24" cy="38" r="2" fill={stroke}/>
        </svg>
      );
    case "cog":
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="8" stroke={stroke} strokeWidth="1.4"/>
          <circle cx="24" cy="24" r="2.5" fill={stroke}/>
          {Array.from({length:8}).map((_,i)=>{
            const a = (i*Math.PI*2)/8;
            const x1 = 24 + Math.cos(a)*12, y1 = 24 + Math.sin(a)*12;
            const x2 = 24 + Math.cos(a)*16, y2 = 24 + Math.sin(a)*16;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.4"/>
          })}
        </svg>
      );
    case "hand":
      return (
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M16 24V14C16 12 18 12 18 14V24M22 22V10C22 8 24 8 24 10V22M28 22V12C28 10 30 10 30 12V24M34 24V18C34 16 36 16 36 18V30C36 36 30 42 24 42C18 42 14 38 14 32V24C14 22 16 22 16 24" stroke={stroke} strokeWidth="1.4" strokeLinecap="square"/>
        </svg>
      );
    default: return null;
  }
}



// Source: garage-website/project/sections-2.jsx

// ---------------- EVENTS ----------------
const EVENTS = [
{ d: "JUM", date: "16 MEI", time: "19:00", title: "Cafe Racer Night", tag: "Kopdar Motor", desc: "Garage Coffee + Sunday Steel Riders — motor vintage, espresso flight, buka sampai larut.", capacity: "60 KURSI" },
{ d: "SAB", date: "24 MEI", time: "20:00", title: "Slow Bar — Live Set", tag: "Live Musik", desc: "Trio akustik. Dua kopi. Satu malam panjang. Hanya untuk yang reservasi.", capacity: "40 KURSI" },
{ d: "RAB", date: "04 JUN", time: "18:30", title: "Workshop Manual Brew", tag: "Workshop", desc: "V60, Aeropress, dan sains di balik ekstraksi. Dipandu Head Barista Ardi.", capacity: "12 KURSI" },
{ d: "JUM", date: "13 JUN", time: "19:00", title: "Creative Supper Club", tag: "Komunitas", desc: "Desainer, builder, dan satu meja panjang. Kopi, makanan, dan kerja bareng.", capacity: "30 KURSI" }];


function Events() {
  const [hover, setHover] = useState(-1);
  return (
    <section id="events" className="section-pad" style={{ borderTop: "1px solid var(--line)", background: "var(--bg-1)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, marginBottom: 64, alignItems: "end" }} className="events-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>05 / Komunitas</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Garasi yang tidak pernah tutup." style={{ fontSize: "clamp(48px, 7vw, 116px)" }}>
              <span style={{ display: "block" }}>Garasi yang</span>
              <span style={{ display: "block" }}>tidak pernah <span style={{ color: "var(--red)" }}>tutup.</span></span>
            </Reveal>
          </div>
          <Reveal delay={400}>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--fg-dim)", maxWidth: 480 }}>
              Kopdar motor, live set, workshop manual brew, dan supper club kreatif. Kalender berjalan sepanjang tahun —
              daftar mailing list dan kami akan kasih kabar duluan.
            </p>
            <a href="#location" className="btn" style={{ marginTop: 28 }}>
              <span>Daftar Sekarang</span><ArrowRight />
            </a>
          </Reveal>
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }}>
          {EVENTS.map((e, i) =>
          <Reveal key={i} delay={i * 100}>
              <EventRow e={e} i={i} hover={hover === i} setHover={(v) => setHover(v ? i : -1)} />
            </Reveal>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { .events-head { grid-template-columns: 1fr !important; gap: 40px !important; } }
      `}</style>
    </section>);

}

function MembershipMasterPro() {
  const tierShowcase = [
    {
      tier: "Silver",
      memberId: "GRG-SLV-2024-0001",
      name: "GARAGE ROOKIE",
      since: "2024-01-15",
    },
    {
      tier: "Gold",
      memberId: "GRG-GLD-2024-0042",
      name: "REGULAR ELITE",
      since: "2023-08-22",
    },
    {
      tier: "Platinum",
      memberId: "GRG-PLT-2023-0118",
      name: "PRESTIGE CLUB",
      since: "2022-11-08",
    },
    {
      tier: "Ultra",
      memberId: "GRG-OMEGA-2021-0007",
      name: "OWNER CIRCLE",
      since: "2021-05-30",
    },
  ];

  return (
    <section id="membership" className="section-pad" style={{ borderTop: "1px solid var(--line)", background: "var(--bg-0)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 48, alignItems: "center" }} className="membership-master">
          <Reveal>
            <div>
              <div className="eyebrow" style={{ marginBottom: 20 }}>05 / Membership Master Pro</div>
              <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 104px)", lineHeight: 0.88 }}>
                Premium<br /><span style={{ color: "var(--red)" }}>Member Card</span>
              </h2>
              <p style={{ marginTop: 24, maxWidth: 500, color: "var(--fg-dim)", lineHeight: 1.7 }}>
                Empat tier kartu dengan hologram aktif, QR access, dan benefit yang naik tiap level. Hover kartu untuk lihat motion 3D &mdash; tap untuk flip ke sisi belakang.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
                <Link href={MEMBER_LOGIN_URL} className="btn primary">
                  <span>Daftar Member</span><ArrowRight />
                </Link>
                <Link href="#membership-benefits" className="btn ghost" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
                  <span>Lihat benefit</span>
                </Link>
              </div>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="garage-membership-carousel membership-showcase">
              {tierShowcase.map((entry) => (
                <PremiumMembershipCard
                  key={entry.tier}
                  data={{
                    name: entry.name,
                    memberId: entry.memberId,
                    phone: "+62 813 9618 6251",
                    address: "Jl. Sembada, Medan",
                    tier: entry.tier,
                    membershipSince: entry.since,
                  }}
                  flippable
                />
              ))}
            </div>
          </Reveal>
        </div>

        <div id="membership-benefits" style={{ marginTop: 72 }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>Tier comparison</div>
          <div className="membership-comparison">
            {PREMIUM_TIER_OPTIONS.map((option) => (
              <div key={option.tier} className={`membership-comparison-card membership-comparison-card--${option.tier.toLowerCase()}`}>
                <div className="mono" style={{ color: "var(--fg-mute)", letterSpacing: "0.28em", fontSize: 10 }}>
                  {option.tagline}
                </div>
                <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1, color: "var(--fg)" }}>
                  {option.label}
                </div>
                <p style={{ marginTop: 14, color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.6 }}>
                  {option.perks}
                </p>
                <Link href={MEMBER_LOGIN_URL} className="mono" style={{ marginTop: 22, display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg)", letterSpacing: "0.22em", fontSize: 11, textTransform: "uppercase" }}>
                  Apply <ArrowRight size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .membership-master { grid-template-columns: 1fr !important; }
        }
        .membership-showcase {
          padding-top: 28px;
        }
        .membership-comparison {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .membership-comparison-card {
          background: linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012));
          border: 1px solid rgba(255,255,255,0.10);
          padding: 22px;
          position: relative;
          overflow: hidden;
          transition: transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 360ms ease;
        }
        .membership-comparison-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 60%, rgba(255,255,255,0.04));
          pointer-events: none;
        }
        .membership-comparison-card:hover {
          transform: translateY(-4px);
        }
        .membership-comparison-card--silver { border-color: rgba(200, 210, 230, 0.32); }
        .membership-comparison-card--silver:hover { border-color: rgba(200, 210, 230, 0.7); }
        .membership-comparison-card--gold { border-color: rgba(245, 197, 66, 0.45); }
        .membership-comparison-card--gold:hover { border-color: rgba(245, 197, 66, 0.85); }
        .membership-comparison-card--platinum { border-color: rgba(96, 180, 232, 0.42); }
        .membership-comparison-card--platinum:hover { border-color: rgba(96, 180, 232, 0.82); }
        .membership-comparison-card--ultra { border-color: rgba(140, 92, 240, 0.5); }
        .membership-comparison-card--ultra:hover { border-color: rgba(140, 92, 240, 0.9); }
      `}</style>
    </section>
  );
}

function EventRow({ e, i, hover, setHover }) {
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "120px 1fr 1fr 1fr auto",
        gap: 32, alignItems: "center",
        padding: "32px 0",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        transition: "padding 0.5s var(--ease-out)",
        paddingLeft: hover ? 24 : 0
      }}
      className="event-row">
      
      <span style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: hover ? 4 : 0, background: "var(--red)",
        transition: "width 0.4s var(--ease-out)"
      }} />
      <div>
        <div className="mono" style={{ color: hover ? "var(--red)" : "var(--fg-mute)", marginBottom: 4 }}>{e.d}</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1, color: "var(--fg)" }}>{e.date}</div>
        <div className="mono" style={{ marginTop: 4 }}>{e.time}</div>
      </div>
      <div>
        <span className="tag" style={{ marginBottom: 12, display: "inline-flex" }}>{e.tag}</span>
        <h3 style={{
          fontFamily: "var(--font-display)", fontSize: 36,
          letterSpacing: "0.02em", textTransform: "uppercase",
          color: hover ? "var(--red)" : "var(--fg)",
          transition: "color 0.4s var(--ease-out)"
        }}>
          {e.title}
        </h3>
      </div>
      <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.55, gridColumn: "3 / span 2" }} className="event-desc">
        {e.desc}
      </p>
      <div style={{ textAlign: "right" }} className="event-cap">
        <div className="mono" style={{ marginBottom: 6 }}>{e.capacity}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: hover ? "var(--red)" : "var(--fg-dim)", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          RSVP <ArrowRight size={11} />
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .event-row { grid-template-columns: 100px 1fr !important; gap: 16px !important; }
          .event-row .event-desc, .event-row .event-cap { grid-column: 2 / -1 !important; }
          .event-row .event-cap { text-align: left !important; }
        }
      `}</style>
    </div>);

}

// ---------------- TESTIMONIALS ----------------
const TESTI = [
{ q: "Kafe yang nggak terasa kafe. Masuk ke sini rasanya kayak masuk ke bengkel — bengkel buat lidahmu.", a: "Reza A.", r: "Regular sejak '24" },
{ q: "Garage Black satu-satunya kopi yang boleh ganggu ritual pagiku. Worth dijabanin dari ujung kota.", a: "Mira H.", r: "Cafe racer rider" },
{ q: "Datang karena motornya, balik lagi karena V60-nya. Baristanya jelasin tiga origin kayak teman ngobrol.", a: "Daffa K.", r: "Desainer / pelanggan" },
{ q: "Cukup tenang buat kerja. Cukup hidup buat ngerasa nggak sendiri. Kebanyakan kafe gagal di sini — Garage tepat sasaran.", a: "Vania P.", r: "Penulis lepas" },
{ q: "Octane Affogato bikin saya ubah rencana Minggu. Sekarang punya ritual baru.", a: "Bayu T.", r: "Pengunjung pertama" }];


function Testimonials() {
  const trackRef = useRef(null);
  const scroll = (dir) => {
    if (!trackRef.current) return;
    trackRef.current.scrollBy({ left: dir * 420, behavior: "smooth" });
  };
  return (
    <section className="section-pad" style={{ borderTop: "1px solid var(--line)", overflow: "hidden" }}>
      <div className="shell">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 60, flexWrap: "wrap", gap: 24 }}>
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>06 / Suara Mereka</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Cerita dari dalam garasi." style={{ fontSize: "clamp(48px, 7vw, 116px)" }}>
              <span style={{ display: "block" }}>Cerita dari</span>
              <span style={{ display: "block" }}>dalam <span style={{ color: "var(--red)" }}>garasi.</span></span>
            </Reveal>
          </div>
          <Reveal delay={400} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 64, lineHeight: 1, color: "var(--fg)" }}>4.9</div>
              <div className="mono" style={{ marginTop: 4 }}>1.240 ULASAN</div>
            </div>
            <div style={{ display: "flex", gap: 4, color: "var(--red)" }}>
              {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={20} />)}
            </div>
          </Reveal>
        </div>
      </div>

      <div
        ref={trackRef}
        style={{
          display: "flex", gap: 24,
          overflowX: "auto", scrollSnapType: "x mandatory",
          paddingLeft: "max(32px, calc((100vw - 1440px) / 2 + 32px))",
          paddingRight: 32, paddingBottom: 32,
          scrollbarWidth: "none"
        }}
        className="testi-track">
        
        {TESTI.map((t, i) =>
        <Reveal key={i} delay={i * 80}>
            <article className="card" style={{
            flexShrink: 0, width: 380, padding: 36, scrollSnapAlign: "start",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            minHeight: 320,
            background: "linear-gradient(180deg, var(--bg-2), var(--bg-1))"
          }}>
              <span className="card-edge" />
              <div>
                <div style={{ display: "flex", gap: 4, color: "var(--red)", marginBottom: 20 }}>
                  {[1, 2, 3, 4, 5].map((s) => <Star key={s} size={14} />)}
                </div>
                <p style={{
                fontFamily: "var(--font-display)",
                fontSize: 22, lineHeight: 1.15, letterSpacing: "0.01em",
                textTransform: "uppercase",
                color: "var(--fg)"
              }}>
                  "{t.q}"
                </p>
              </div>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontFamily: "var(--font-mono)", color: "var(--fg)", fontSize: 13 }}>{t.a}</div>
                <div className="mono" style={{ marginTop: 4 }}>{t.r}</div>
              </div>
            </article>
          </Reveal>
        )}
        <div style={{ flexShrink: 0, width: 1 }} />
      </div>

      <div className="shell" style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="round-btn" onClick={() => scroll(-1)} aria-label="Previous">
          <ArrowRight size={14} style={{ transform: "rotate(180deg)" }} />
        </button>
        <button className="round-btn" onClick={() => scroll(1)} aria-label="Next">
          <ArrowRight size={14} />
        </button>
      </div>

      <style>{`
        .testi-track::-webkit-scrollbar { display: none; }
        .round-btn {
          width: 52px; height: 52px;
          border: 1px solid var(--line-2);
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--fg);
          transition: all 0.3s var(--ease-out);
        }
        .round-btn:hover { background: var(--red); border-color: var(--red); }
      `}</style>
    </section>);

}

// ---------------- LOCATION ----------------
function Location() {
  return (
    <section id="location" className="section-pad" style={{ borderTop: "1px solid var(--line)", background: "var(--bg-1)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: "1px solid var(--line)" }} className="loc-grid">
          {/* left — info */}
          <div style={{ padding: 56 }}>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>07 / Temukan kami</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Mampir saja. Kami menunggu." style={{ fontSize: "clamp(40px, 5vw, 76px)" }}>
              <span style={{ display: "block" }}>Mampir saja.</span>
              <span style={{ display: "block" }}>Kami <span style={{ color: "var(--red)" }}>menunggu.</span></span>
            </Reveal>

            <div style={{ marginTop: 48, display: "grid", gap: 28 }}>
              <Reveal delay={400}>
                <InfoBlock label="Alamat" mainline="Jl. Mayjen Sutoyo, Rambung, Kec. Tebing Tinggi Kota" sub="Kota Tebing Tinggi, Sumatera Utara, 20631" />
              </Reveal>
              <Reveal delay={500}>
                <InfoBlock label="Jam Buka" mainline="07:00 — 23:00" sub="Buka hari Selasa - Minggu · Dapur tutup 22:30" />
              </Reveal>
              <Reveal delay={600}>
                <InfoBlock label="Kontak" mainline="+62 813 9618 6251" sub="hello@garagecoffee.id" />
              </Reveal>
              <Reveal delay={700}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                  <a className="btn btn-primary" href={WHATSAPP_URL}><span>WhatsApp</span><ArrowRight /></a>
                  <a className="btn" href={MAPS_URL} target="_blank" rel="noreferrer"><span>Buka di Maps</span><ArrowRight /></a>
                </div>
              </Reveal>
            </div>
          </div>

          {/* right — map placeholder */}
          <div style={{ position: "relative", minHeight: 520, borderLeft: "1px solid var(--line)" }} className="loc-map">
            <div className="img-slot dark" style={{ position: "absolute", inset: 0, height: "100%", border: 0 }}>
              <div style={{ position: "absolute", inset: 0 }}>
                <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%", opacity: 0.25 }}>
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M40 0H0V40" fill="none" stroke="#3a3a42" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="600" height="600" fill="url(#grid)" />
                  {/* fake roads */}
                  <path d="M0 280 L600 320" stroke="#3a3a42" strokeWidth="6" />
                  <path d="M0 290 L600 330" stroke="#5a5a62" strokeWidth="1" strokeDasharray="6 8" />
                  <path d="M280 0 L320 600" stroke="#3a3a42" strokeWidth="6" />
                  <path d="M290 0 L330 600" stroke="#5a5a62" strokeWidth="1" strokeDasharray="6 8" />
                  <path d="M100 100 L500 500" stroke="#2a2a30" strokeWidth="3" />
                  <path d="M400 80 L420 540" stroke="#2a2a30" strokeWidth="3" />
                </svg>
              </div>
              {/* pin */}
              <div style={{
                position: "absolute", top: "48%", left: "52%",
                transform: "translate(-50%, -100%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8
              }}>
                <div style={{
                  padding: "10px 14px",
                  background: "var(--red)",
                  color: "#fff",
                  fontFamily: "var(--font-display)", fontSize: 18,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  boxShadow: "0 14px 40px rgba(209,26,42,0.4)",
                  whiteSpace: "nowrap"
                }}>
                  GARAGE COFFEE
                </div>
                <div style={{ width: 2, height: 30, background: "var(--red)" }} />
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: "var(--red)",
                  boxShadow: "0 0 0 6px rgba(209,26,42,0.2), 0 0 0 14px rgba(209,26,42,0.1)",
                  animation: "pinPulse 2s ease-in-out infinite"
                }} />
              </div>
              <span className="img-label" style={{ position: "absolute", bottom: 16, right: 16 }}>Slot peta — embed di sini</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pinPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @media (max-width: 900px) {
          .loc-grid { grid-template-columns: 1fr !important; }
          .loc-map { border-left: 0 !important; border-top: 1px solid var(--line) !important; min-height: 360px !important; }
        }
      `}</style>
    </section>);

}

function InfoBlock({ label, mainline, sub }) {
  return (
    <div>
      <div className="mono" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--fg)", letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1 }}>
        {mainline}
      </div>
      <div style={{ marginTop: 6, color: "var(--fg-dim)", fontSize: 14 }}>{sub}</div>
    </div>);

}

// ---------------- FINAL CTA ----------------
function FinalCTA() {
  return (
    <section className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      position: "relative",
      overflow: "hidden",
      background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(209,26,42,0.25), transparent 60%), var(--bg-0)"
    }}>
      <div className="hero-grid" style={{ opacity: 0.4 }} />
      <div className="shell" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
        <Reveal as="div" className="mono" style={{ marginBottom: 32, color: "var(--red)" }}>
          ● SAATNYA BERGERAK
        </Reveal>
        <Reveal mask as="h2" className="display" aria-label="Datang ke Garage." style={{ fontSize: "clamp(72px, 16vw, 260px)", marginBottom: 0 }}>
          <span style={{
            display: "block",
            background: "linear-gradient(180deg, #f4f4f5 0%, #c8c8cc 30%, #6a6a72 55%, #c8c8cc 78%, #f4f4f5 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            fontFamily: "var(--font-display)"
          }}>
            DATANG KE
          </span>
          <span style={{
            display: "block",
            background: "linear-gradient(180deg, #ff5a6a 0%, var(--red) 50%, #6a0a14 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            fontFamily: "var(--font-display)",
            filter: "drop-shadow(0 0 30px rgba(209,26,42,0.4))"
          }}>
            GARAGE.
          </span>
        </Reveal>

        <Reveal delay={400} as="p" style={{
          marginTop: 32, maxWidth: 540, marginInline: "auto",
          fontSize: 17, lineHeight: 1.6, color: "var(--fg-dim)"
        }}>
          Kopi siap tuang. Meja sudah hangat. CB350 sudah dipoles. Pintu kami tutup pukul 23:00 —
          tapi satu kursi kami sisakan untukmu.
        </Reveal>

        <Reveal delay={600} as="div" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 40 }}>
          <a href={MAPS_URL} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: "22px 36px" }}><span>Kunjungi Sekarang</span><ArrowRight /></a>
          <a href={WHATSAPP_URL} className="btn" style={{ padding: "22px 36px" }}><span>Order via WhatsApp</span><ArrowRight /></a>
          <button type="button" onClick={requestTablePanelOpen} className="btn" style={{ padding: "22px 36px" }}><span>Reservasi Meja</span><ArrowRight /></button>
        </Reveal>

        {/* horizontal text */}
        <div style={{ marginTop: 100, opacity: 0.4 }}>
          <div className="mono">JL. INDUSTRI 24 · KEMANG · JAKARTA · 07—23 SETIAP HARI</div>
        </div>
      </div>
    </section>);

}

// ---------------- FOOTER ----------------
function Footer() {
  const cols = [
  {
    h: "Jelajahi",
    links: [["Tentang", "#about"], ["Menu", "#menu"], ["Suasana", "#atmosphere"], ["Pengalaman", "#experience"], ["Event", "#events"]]
  },
  {
    h: "Kunjungi",
    links: [["Lokasi", "#location"], ["Jam Buka", "#location"], ["WhatsApp", "#"], ["Reservasi", "#location"], ["Login Karyawan", LOGIN_URL], ["Login Member", MEMBER_LOGIN_URL]]
  },
  {
    h: "Ikuti",
    links: [["Instagram", "#"], ["TikTok", "#"], ["Spotify", "#"], ["YouTube", "#"]]
  }];

  return (
    <footer style={{ borderTop: "1px solid var(--line)", background: "var(--bg-1)", position: "relative", zIndex: 2 }}>
      <div className="shell" style={{ paddingTop: 80, paddingBottom: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 60 }} className="foot-grid">
          <div>
            <LogoImage variant="wordmark" height={56} />
            <div className="mono" style={{ marginTop: 8 }}>COFFEE & MOTOR · EST. 2026</div>
            <p style={{ marginTop: 28, color: "var(--fg-dim)", maxWidth: 360, fontSize: 14, lineHeight: 1.6 }}>
              Kopi premium dengan jiwa otomotif. Buka tujuh hari seminggu, sampai larut malam.
            </p>
            <div style={{ marginTop: 24, padding: "14px 18px", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 8, height: 8, background: "#0db86c", borderRadius: "50%", boxShadow: "0 0 0 4px rgba(13,184,108,0.2)" }} />
              <span className="mono" style={{ color: "var(--fg)" }}>SEDANG BUKA · TUTUP 23:00</span>
            </div>
          </div>
          {cols.map((c) =>
          <div key={c.h}>
              <div className="mono" style={{ marginBottom: 24 }}>{c.h}</div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
                {c.links.map(([l, h]) =>
              <li key={l}>
                  {isLoginHref(h) ? (
                    <a href={h} onClick={(event) => goToAccess(event, h)} className="foot-link">{l}</a>
                  ) : (
                    <a href={h} className="foot-link">{l}</a>
                  )}
                </li>
              )}
              </ul>
            </div>
          )}
        </div>

        <div style={{ marginTop: 80, paddingTop: 28, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div className="mono">© 2026 GARAGE COFFEE &amp; MOTOR · SEMUA HAK CIPTA DILINDUNGI</div>
          <div className="mono">DIBUAT UNTUK RASA, JIWA, KOMUNITAS</div>
        </div>
      </div>

      {/* Giant brand statement — real logo as atmospheric footer mark */}
      <div style={{ marginTop: 24, overflow: "hidden", position: "relative", paddingBottom: 0 }}>
        <Reveal>
          <div style={{
            position: "relative",
            width: "100%",
            display: "flex", justifyContent: "center"
          }}>
            <LogoImage
              variant="wordmark"
              width="min(1600px, 96vw)"
              style={{
                opacity: 0.55,
                maskImage: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 92%)",
                WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 92%)"
              }}
            />
          </div>
        </Reveal>
      </div>

      <style>{`
        .foot-link {
          font-size: 14px; color: var(--fg-dim);
          transition: color 0.3s var(--ease-out); display: inline-block;
          position: relative;
        }
        .foot-link::after {
          content: ""; position: absolute; left: 0; bottom: -2px;
          width: 0; height: 1px; background: var(--red);
          transition: width 0.4s var(--ease-out);
        }
        .foot-link:hover { color: var(--fg); }
        .foot-link:hover::after { width: 100%; }
        @media (max-width: 900px) {
          .foot-grid { grid-template-columns: 1fr 1fr !important; gap: 40px !important; }
        }
        @media (max-width: 560px) {
          .foot-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>);

}


function GarageWebsiteRoot({
  landingHero = null,
}: {
  landingHero?: SiteAsset | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const handleLoaderDone = useCallback(() => setLoaded(true), []);

  useEffect(() => {
    document.body.style.overflow = loaded ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [loaded]);

  return (
    <main id="top" className="garage-website">
      {!loaded && <Loader onDone={handleLoaderDone} />}
      <CursorGlow />
      <div className="bg-grain" />
      <div className="bg-vignette" />
      <PromoBar />
      <Nav />
      <Hero landingHero={landingHero} />
      <About />
      <Menu />
      <Atmosphere landingHero={landingHero} />
      <Experience />
      <MembershipMasterPro />
      <Events />
      <Testimonials />
      <Location />
      <FinalCTA />
      <Footer />
      <FloatingWA />
    </main>
  );
}

export { GarageWebsiteRoot as GarageWebsite };
