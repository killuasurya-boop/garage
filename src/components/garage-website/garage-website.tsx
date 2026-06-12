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
const WHATSAPP_PHONE = "6285188983600";
const BUSINESS_EMAIL = "garagetebingtinggi@gmail.com";
const BUSINESS_ADDRESS = "Jl. Mayjen Sutoyo, Rambung, Kec. Tebing Tinggi Kota, Kota Tebing Tinggi, Sumatera Utara 20631";
const WHATSAPP_DEFAULT_MESSAGE = "Halo GARAGE, saya lihat status meja di website. Saya mau reservasi/order.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(WHATSAPP_DEFAULT_MESSAGE)}`;
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS_ADDRESS)}`;

// Info bisnis editable (C10) lewat context — default = konstanta hardcoded di atas
// supaya komponen yang belum di-wire tetap aman & tanpa regresi.
const BizContext = React.createContext(null);
const useBiz = () => {
  const ctx = React.useContext(BizContext);
  return {
    whatsapp: ctx?.whatsapp || WHATSAPP_PHONE,
    email: ctx?.email || BUSINESS_EMAIL,
    address: ctx?.address || BUSINESS_ADDRESS,
    hoursOpen: ctx?.hoursOpen || "07:00",
    hoursClose: ctx?.hoursClose || "23:00",
    instagram: ctx?.instagram || "",
    mapsUrl: ctx?.mapsUrl || "",
  };
};
const bizWaUrl = (phone, message) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(message || WHATSAPP_DEFAULT_MESSAGE)}`;
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
    : WHATSAPP_DEFAULT_MESSAGE;
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
};
const requestTablePanelOpen = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TABLE_PANEL_OPEN_EVENT));
};
const TRACKING_SECTION_ID = "tracking-order";

const TABLE_STATUS_COPY = {
  empty: { label: "Kosong", tone: "ready" },
  pending: { label: "Terisi", tone: "full" },
  occupied: { label: "Terisi", tone: "full" },
  accepted: { label: "Terisi", tone: "full" },
  awaiting_payment: { label: "Menunggu Bayar", tone: "full" },
  paid: { label: "Lunas", tone: "full" },
  ready: { label: "Siap Disajikan", tone: "full" },
  mixed: { label: "Terisi", tone: "full" },
  needs_cleaning: { label: "Perlu dibersihkan", tone: "full" },
  unavailable: { label: "Tidak Aktif", tone: "unknown" },
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

async function getPublicLiveVisit() {
  const response = await fetch("/api/site/live-visit", {
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? "Status live sedang disinkronkan.");
  }
  return json.data ?? { tables: [], orderPulse: { active: 0, queue: 0, cooking: 0, ready: 0 } };
}

async function getPublicLiveTracking() {
  const response = await fetch("/api/site/live-tracking", {
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? "Live tracking sedang disinkronkan.");
  }
  return json.data;
}

async function getPublicTrackingStatus(trackingId) {
  const response = await fetch(`/api/customer/orders/${encodeURIComponent(trackingId)}/public-status`, {
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? "Status order tidak ditemukan.");
  }
  return json.data;
}

function tableStatusCopy(row) {
  if (row.needsCleaning || row.status === "needs_cleaning") return TABLE_STATUS_COPY.needs_cleaning;
  return TABLE_STATUS_COPY[row.status] ?? TABLE_STATUS_COPY.unavailable;
}

function tableAvailabilityState(row) {
  if (!row) return "unknown";
  // Jika data belum datang sama sekali (row.status undefined dan available juga undefined)
  if (row.status === undefined && row.available === undefined) return "unknown";
  // Meja benar-benar tidak aktif / tidak ada data (status="unavailable" dari API)
  if (row.status === "unavailable") return "unknown";
  // Jika needsCleaning, tampilkan sebagai full (sedang proses cleaning)
  if (row.needsCleaning) return "full";
  // Meja tersedia dan status valid
  if (row.available && row.status !== undefined) return "ready";
  // Meja terisi secara eksplisit
  if (row.status === "occupied" || row.status === "pending") return "full";
  // Meja perlu dibersihkan (eksplicit dari API)
  if (row.status === "needs_cleaning") return "full";
  // Meja tersedia tapi status tidak diketahui (sync berjalan, data belum lengkap)
  if (row.available && !row.status) return "unknown";
  // Meja tidak tersedia (available = false) dan belum masuk kondisi di atas
  if (!row.available) return "full";
  return "unknown";
}

function formatTableTimestamp(value) {
  if (!value) return "Belum ada aktivitas";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update live";
  return `Update ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}

function liveVisitRecommendation(totalTables, availableTables, activeOrders) {
  if (!totalTables) {
    return {
      mood: "Sinkron live",
      eta: "Cek langsung",
      advice: "Status live sedang disinkronkan. Untuk reservasi cepat, hubungi WhatsApp.",
      tone: "sync",
    };
  }

  const busyTables = totalTables - availableTables;
  const occupancy = busyTables / totalTables;
  const etaBase = Math.max(6, Math.min(24, Math.round(activeOrders * 1.6 + busyTables * 1.2)));

  if (availableTables <= 0 || occupancy >= 0.92) {
    return {
      mood: "Full",
      eta: `${Math.max(etaBase, 18)}+ menit`,
      advice: "Meja sedang padat. Reservasi via WhatsApp lebih aman sebelum datang.",
      tone: "full",
    };
  }
  if (occupancy >= 0.68 || activeOrders >= 12) {
    return {
      mood: "Padat",
      eta: `${Math.max(etaBase, 14)} menit`,
      advice: "Takeaway lebih cepat. Untuk rombongan, reservasi dulu.",
      tone: "busy",
    };
  }
  if (occupancy >= 0.36 || activeOrders >= 5) {
    return {
      mood: "Ramai santai",
      eta: `${Math.max(etaBase, 9)} menit`,
      advice: "Masih aman datang sekarang. Pilih meja kosong atau order dulu.",
      tone: "normal",
    };
  }
  return {
    mood: "Sepi nyaman",
    eta: "6-8 menit",
    advice: "Aman datang sekarang. Pilih meja dan lanjut order digital.",
    tone: "calm",
  };
}

function liveOrderEta(orderPulse, recommendation) {
  const active = Number(orderPulse?.active ?? 0);
  const queue = Number(orderPulse?.queue ?? 0);
  const cooking = Number(orderPulse?.cooking ?? 0);
  const ready = Number(orderPulse?.ready ?? 0);
  const takeawayMinutes = Math.max(8, Math.min(34, 8 + queue * 3 + cooking * 2));
  const drinkMinutes = Math.max(5, Math.min(18, 5 + queue * 2 + Math.ceil(cooking * 0.8)));
  const foodMinutes = Math.max(12, Math.min(38, 12 + queue * 3 + cooking * 2));
  const pickupTone = ready > 0 ? "ready" : active >= 12 ? "busy" : active > 0 ? "normal" : "calm";

  return {
    takeaway: active ? `${takeawayMinutes}-${takeawayMinutes + 6} menit` : "8-12 menit",
    drinks: active ? `${drinkMinutes}-${drinkMinutes + 4} menit` : "5-8 menit",
    food: active ? `${foodMinutes}-${foodMinutes + 8} menit` : "12-18 menit",
    pickupTone,
    recommendation:
      ready > 0
        ? "Ada order siap pickup. Datang sesuai notifikasi tracking."
        : recommendation?.tone === "full" || active >= 12
          ? "Takeaway lebih aman. Reservasi dulu untuk dine-in."
          : active >= 5
            ? "Order digital dulu agar antrean lebih singkat."
            : "Aman order sekarang. Estimasi masih ringan.",
  };
}

function eventSeatInfo(event, index) {
  const capacity = Number(String(event?.capacity ?? "").match(/\d+/)?.[0] ?? 0);
  const reserved = capacity ? Math.min(capacity - 1, Math.round(capacity * (0.34 + index * 0.11))) : 0;
  const available = Math.max(0, capacity - reserved);
  const tone = available <= 3 ? "full" : available <= Math.ceil(capacity * 0.35) ? "busy" : "ready";
  return { capacity, reserved, available, tone };
}

function publicOrderStageLabel(status) {
  const labels = {
    waiting_cashier: "Menunggu validasi kasir",
    pending_cashier: "Menunggu validasi kasir",
    awaiting_payment: "Menunggu pembayaran",
    queue: "Masuk antrean",
    cooking: "Sedang diproses",
    ready: "Siap diambil/diantar",
    delivered: "Selesai",
    paid: "Lunas",
    rejected: "Order ditolak",
  };
  return labels[status] ?? String(status || "Update live").replace(/_/g, " ");
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
        loading={preload ? "eager" : undefined}
        fetchPriority={preload ? "high" : undefined}
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
      data-garage-disabled-splash
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
            <span>DISABLED</span>
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
  ["Live", "#live-status"],
  ["Menu", "#menu", true],
  ["Tracking", "#live-tracking-system"],
  ["Event", "#events"],
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
        className="site-nav"
        style={{
          position: "fixed", top: condensed ? 46 : 52, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          transition: "all 0.5s var(--ease-out)",
          width: condensed ? "min(980px, calc(100vw - 32px))" : "min(1180px, calc(100vw - 32px))",
          maxWidth: 1180
        }}>
        
        <div
          className="site-nav-inner"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 18,
            padding: condensed ? "10px 14px" : "12px 16px",
            background: condensed
              ? "linear-gradient(90deg, rgba(10,10,13,0.9), rgba(24,13,15,0.86), rgba(10,10,13,0.9))"
              : "linear-gradient(90deg, rgba(10,10,13,0.74), rgba(28,13,16,0.68), rgba(10,10,13,0.74))",
            backdropFilter: "blur(16px) saturate(140%)",
            WebkitBackdropFilter: "blur(16px) saturate(140%)",
            border: "1px solid var(--line)",
            transition: "all 0.5s var(--ease-out)"
          }}>
          
          <a className="site-nav-brand" href="#top" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoImage variant="wordmark" height={condensed ? 24 : 28} preload />
            <span className="brand-divider" style={{ width: 1, height: 18, background: "var(--line-2)" }} />
            <span className="mono brand-year" style={{ fontSize: 9 }}>EST. 2026</span>
          </a>

          <ul style={{ display: "flex", gap: 20, listStyle: "none" }} className="nav-desktop">
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
                    <span>{label}{hasMega && <span style={{ marginLeft: 6, opacity: 0.6 }}>v</span>}</span>
                  </a>
                )}
              </li>
            )}
          </ul>

          <div className="site-nav-status" aria-label="Garage outlet status">
            <span />
            <strong>OPEN</strong>
            <em>07-23</em>
          </div>

          <div className="site-nav-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                style={{ padding: "9px 12px", fontSize: 10 }}
              >
                <span>Login</span><span style={{ marginLeft: 2, opacity: 0.72 }}>v</span>
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
              style={{ padding: "9px 12px", fontSize: 10 }}
              onClick={openTablePanel}
            >
              <span>Cek Meja</span><ArrowRight size={12} />
            </button>
            <Link
              href={DIGITAL_MENU_URL}
              className="btn btn-primary"
              style={{ padding: "9px 14px", fontSize: 10 }}
            >
              <span>Order</span><ArrowRight size={12} />
            </Link>
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
              <span className="mono" style={{ color: "var(--red)" }}>MENU GARAGE - 90+ ITEM</span>
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
              <span className="mono" style={{ color: "var(--amber)" }}>LIVE GARAGE: CEK MEJA KOSONG SEBELUM DATANG</span>
              <a href="#menu" onClick={() => setMegaOpen(false)} className="navlink" style={{ color: "var(--red)" }}>
                LIHAT MENU LENGKAP -&gt;
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
          <LogoImage variant="wordmark" height={30} preload />
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
          Navigasi Garage
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
          <Link
            href={DIGITAL_MENU_URL}
            className="mob-reserve-link"
            onClick={() => setMobOpen(false)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              minHeight: 50,
              marginTop: 8,
              padding: "12px 14px",
              border: "1px solid var(--line-2)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase"
            }}>
            <span>Order / Reservasi</span>
            <ArrowRight size={14} />
          </Link>
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
          display: inline-flex;
          align-items: center;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--fg-dim);
          padding: 8px 0;
          white-space: nowrap;
          transition: color 0.3s var(--ease-out);
        }
        .navlink span {
          white-space: nowrap;
        }
        .navlink::after {
          content: ""; position: absolute; bottom: 0; left: 0;
          width: 0; height: 1px; background: var(--red);
          transition: width 0.4s var(--ease-out);
        }
        .navlink:hover { color: var(--fg); }
        .navlink:hover::after { width: 100%; }
        .site-nav-inner {
          position: relative;
          min-height: 58px;
          overflow: visible;
          box-shadow:
            0 22px 70px rgba(0,0,0,0.42),
            inset 0 1px 0 rgba(255,255,255,0.07);
        }
        .site-nav-inner::before {
          content: "";
          position: absolute;
          left: 12px;
          right: 12px;
          top: -1px;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(209,26,42,0.95), rgba(245,167,66,0.78), transparent);
          pointer-events: none;
        }
        .site-nav-inner::after {
          content: "";
          position: absolute;
          left: 18%;
          right: 18%;
          bottom: -16px;
          height: 18px;
          background: radial-gradient(ellipse at center, rgba(209,26,42,0.28), transparent 68%);
          filter: blur(8px);
          pointer-events: none;
        }
        .site-nav-brand {
          position: relative;
          z-index: 1;
          flex: 0 0 auto;
          min-width: 0;
          padding: 6px 8px;
          border: 1px solid rgba(255,255,255,0.04);
          background: rgba(255,255,255,0.025);
          transition: border-color 0.24s var(--ease-out), background 0.24s var(--ease-out);
        }
        .site-nav-brand:hover {
          border-color: rgba(209,26,42,0.36);
          background: rgba(209,26,42,0.07);
        }
        .nav-desktop {
          position: relative;
          z-index: 1;
          flex: 1 1 auto;
          min-width: 0;
          justify-content: center;
        }
        .site-nav-status {
          position: relative;
          z-index: 1;
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(13,184,108,0.28);
          background: rgba(13,184,108,0.08);
          padding: 0 10px;
          color: #c7ffdf;
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .site-nav-status span {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #0db86c;
          box-shadow: 0 0 0 4px rgba(13,184,108,0.16), 0 0 18px rgba(13,184,108,0.44);
        }
        .site-nav-status em {
          color: rgba(199,255,223,0.66);
          font-style: normal;
        }
        .site-nav-actions {
          position: relative;
          z-index: 1;
          flex: 0 0 auto;
          min-width: 0;
        }
        .site-nav-actions .btn,
        .site-nav-actions button,
        .site-nav-actions a {
          min-height: 40px;
          white-space: nowrap;
        }
        .site-nav-actions svg {
          flex-shrink: 0;
        }
        .site-nav-actions > a.btn-primary {
          border-color: rgba(255,255,255,0.1);
          box-shadow:
            0 14px 36px rgba(209,26,42,0.28),
            inset 0 1px 0 rgba(255,255,255,0.16);
        }
        .site-nav-actions > button.btn,
        .login-dropdown > button {
          background: rgba(0,0,0,0.18);
          border-color: rgba(255,255,255,0.08);
        }
        .site-nav-actions > button.btn:hover,
        .login-dropdown > button:hover {
          border-color: rgba(245,167,66,0.34);
          background: rgba(245,167,66,0.08);
        }
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
          animation: garageTableUnknownBlink 1.5s ease-in-out infinite;
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
        .garage-table-card[data-availability="unknown"] {
          border-color: rgba(150,150,161,0.28);
          background: rgba(114,114,124,0.06);
        }
        .garage-table-card[data-availability="unknown"] .garage-table-state {
          border-color: rgba(150,150,161,0.42);
          color: #a1a1aa;
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
        @keyframes garageTableUnknownBlink {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.35;
            transform: scale(0.95);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .garage-table-indicator {
            animation: none !important;
          }
        }
        @media (max-width: 1240px) {
          .site-nav-inner {
            gap: 14px !important;
          }
          .nav-desktop {
            gap: 16px !important;
          }
          .brand-year {
            display: none !important;
          }
          .site-nav-status {
            display: none !important;
          }
        }
        @media (max-width: 1120px) {
          .nav-desktop { display: none !important; }
          .login-dropdown { display: none !important; }
          .site-nav-actions > .btn,
          .site-nav-actions > a.btn {
            display: none !important;
          }
          .mob-toggle { display: inline-flex !important; }
          .mob-drawer { display: flex !important; }
          .site-nav {
            width: calc(100vw - 24px) !important;
            top: 50px !important;
          }
          .site-nav-inner {
            min-height: 58px;
            padding: 11px 12px !important;
          }
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
          <div className="garage-headlight" />
          <div className="garage-redline" />
          <div className="garage-engine-glow" />
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
              BUKA SEKARANG / EST. 2024
            </Reveal>
            <Reveal as="div" className="mono" delay={1000} style={{ textAlign: "right" }}>
              JL. MAYJEN SUTOYO, RAMBUNG / BUKA 07-23
            </Reveal>
          </div>

          <div className="hero-image-layout">
            <Reveal delay={240} className="hero-image-copy">
              <div className="hero-kicker mono">GARAGE COFFEE & MOTOR</div>
              <div className="garage-steam-wrap" aria-hidden>
                <span className="garage-steam garage-steam-1" />
                <span className="garage-steam garage-steam-2" />
                <span className="garage-steam garage-steam-3" />
              </div>
              <h1 className="display hero-image-title" aria-label="Lebih dari sekedar kopi.">
                <span className="hero-title-line hero-title-top">LEBIH DARI</span>
                <span className="hero-title-line hero-title-bottom">
                  <span>SEKED</span><span className="hero-title-red">A</span><span>R KOPI.</span>
                </span>
              </h1>
              <p className="hero-image-lead">
                Ngopi, makan, dan nongkrong di GARAGE sekarang lebih gampang. Cek tempat sebelum datang, pesan dari website, lalu ambil atau duduk santai.
              </p>
              <div className="hero-image-actions">
                <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Jelajahi Menu</span><ArrowRight /></Link>
                <button type="button" onClick={requestTablePanelOpen} className="btn"><span>Reservasi Meja</span><ArrowRight /></button>
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
          .garage-headlight,
          .garage-redline,
          .garage-engine-glow {
            position: absolute;
            pointer-events: none;
          }
          .garage-headlight {
            top: 10%;
            left: -32%;
            width: 58vw;
            height: 32vh;
            background: linear-gradient(92deg, transparent 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.22) 50%, rgba(209,26,42,0.16) 58%, transparent 78%);
            filter: blur(18px);
            transform: skewX(-18deg);
            mix-blend-mode: screen;
            animation: garageHeadlightSweep 7.5s cubic-bezier(0.65, 0, 0.25, 1) infinite;
          }
          .garage-redline {
            left: 0;
            right: 0;
            bottom: 18%;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(209,26,42,0.12), rgba(255,70,82,0.88), rgba(245,167,66,0.42), transparent);
            box-shadow: 0 0 28px rgba(209,26,42,0.42);
            animation: garageRedlinePulse 2.8s ease-in-out infinite;
          }
          .garage-engine-glow {
            width: min(720px, 78vw);
            height: min(720px, 78vw);
            left: 50%;
            bottom: -34%;
            transform: translateX(-50%);
            border-radius: 50%;
            background: radial-gradient(circle at 50% 50%, rgba(209,26,42,0.22), transparent 48%), radial-gradient(circle at 50% 50%, rgba(245,167,66,0.12), transparent 68%);
            filter: blur(28px);
            animation: garageEngineIdle 4.8s ease-in-out infinite;
          }
          .garage-steam-wrap {
            position: relative;
            width: min(220px, 48vw);
            height: 42px;
            margin: 0 auto -4px;
            pointer-events: none;
          }
          .garage-steam {
            position: absolute;
            bottom: 0;
            width: 2px;
            height: 34px;
            border-radius: 999px;
            background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.42), rgba(255,255,255,0));
            filter: blur(1px);
            opacity: 0;
          }
          .garage-steam-1 { left: 34%; animation: garageSteamRise 4.6s ease-in-out infinite; }
          .garage-steam-2 { left: 50%; animation: garageSteamRise 5.2s ease-in-out 0.8s infinite; }
          .garage-steam-3 { left: 66%; animation: garageSteamRise 4.9s ease-in-out 1.5s infinite; }
          .hero-title-line {
            animation: garageChromeBreathe 5.8s ease-in-out infinite;
          }
          .hero-title-red {
            animation: garageRedA 2.6s ease-in-out infinite;
          }
          .btn-primary {
            position: relative;
            overflow: hidden;
          }
          .btn-primary::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.24) 50%, transparent 70%);
            transform: translateX(-120%);
            animation: garageButtonIgnition 4.8s ease-in-out infinite;
            pointer-events: none;
          }
          @keyframes garageHeadlightSweep {
            0%, 38% { transform: translateX(0) skewX(-18deg); opacity: 0; }
            48% { opacity: 0.85; }
            72% { opacity: 0.16; }
            100% { transform: translateX(190vw) skewX(-18deg); opacity: 0; }
          }
          @keyframes garageRedlinePulse {
            0%, 100% { opacity: 0.28; transform: scaleX(0.72); }
            45% { opacity: 0.9; transform: scaleX(1); }
            70% { opacity: 0.42; transform: scaleX(0.9); }
          }
          @keyframes garageEngineIdle {
            0%, 100% { opacity: 0.36; transform: translateX(-50%) scale(0.96); }
            50% { opacity: 0.72; transform: translateX(-50%) scale(1.05); }
          }
          @keyframes garageSteamRise {
            0% { opacity: 0; transform: translateY(14px) translateX(0) scaleY(0.72); }
            24% { opacity: 0.5; }
            78% { opacity: 0.18; }
            100% { opacity: 0; transform: translateY(-30px) translateX(18px) scaleY(1.3); }
          }
          @keyframes garageChromeBreathe {
            0%, 100% { filter: drop-shadow(0 20px 38px rgba(0,0,0,0.5)); }
            50% { filter: drop-shadow(0 24px 48px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(255,255,255,0.1)); }
          }
          @keyframes garageRedA {
            0%, 100% { filter: drop-shadow(0 0 12px rgba(209,26,42,0.38)); }
            50% { filter: drop-shadow(0 0 28px rgba(209,26,42,0.76)); }
          }
          @keyframes garageButtonIgnition {
            0%, 62% { transform: translateX(-120%); opacity: 0; }
            74% { opacity: 1; }
            100% { transform: translateX(120%); opacity: 0; }
          }
          .hero-image-layout {
            display: block;
            max-width: 1120px;
            margin: 0 auto;
            text-align: center;
          }
          .hero-kicker {
            width: fit-content;
            margin: 0 auto;
            border-left: 3px solid var(--red);
            padding: 8px 12px 8px 14px;
            color: var(--amber);
            background: rgba(209,26,42,0.08);
            letter-spacing: 0.18em;
          }
          .hero-image-title {
            display: grid;
            gap: clamp(8px, 1.2vw, 18px);
            justify-items: center;
            margin: 22px auto 0;
            max-width: min(1240px, calc(100vw - 56px));
            font-family: var(--font-display);
            line-height: 0.92;
            letter-spacing: 0;
            text-wrap: balance;
          }
          .hero-title-line {
            display: block;
            width: fit-content;
            max-width: 100%;
            background:
              linear-gradient(180deg, #ffffff 0%, #d8d8dc 21%, #878890 50%, #cdced4 75%, #f5f5f6 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            filter:
              drop-shadow(0 24px 44px rgba(0,0,0,0.48))
              drop-shadow(0 1px 0 rgba(255,255,255,0.18));
            white-space: nowrap;
          }
          .hero-title-top {
            font-size: clamp(58px, 7.6vw, 128px);
            letter-spacing: 0.08em;
            transform: translateX(0.045em);
          }
          .hero-title-bottom {
            margin-top: 0;
            font-size: clamp(82px, 11.4vw, 184px);
            letter-spacing: 0.006em;
          }
          .hero-title-red {
            display: inline-block;
            margin-inline: -0.015em;
            background: linear-gradient(180deg, #ff4859 0%, #d7192b 48%, #7a0c17 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            filter: drop-shadow(0 0 18px rgba(209,26,42,0.42));
          }
          .hero-image-lead {
            margin-top: 28px;
            margin-left: auto;
            margin-right: auto;
            max-width: 680px;
            color: var(--fg-dim);
            font-size: 18px;
            line-height: 1.6;
          }
          .hero-image-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 12px;
            margin-top: 34px;
          }
          .hero-image-stats {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            text-align: center;
            gap: 32px;
            margin-top: 42px;
          }
          @media (max-width: 980px) {
            .hero-image-shell { padding-top: 126px !important; }
            .hero-meta-row { gap: 18px; align-items: flex-start !important; }
            .hero-image-title { max-width: min(100%, calc(100vw - 40px)); gap: clamp(7px, 1.4vw, 14px); line-height: 0.94; }
            .hero-title-top { font-size: clamp(42px, 9.7vw, 76px); letter-spacing: 0.06em; }
            .hero-title-bottom { margin-top: 0; font-size: clamp(56px, 13vw, 100px); letter-spacing: 0.004em; }
            .hero-image-lead { max-width: 100%; }
            .hero-image-actions { align-items: stretch; }
            .hero-image-actions .btn { flex: 1 1 220px; justify-content: center; }
          }
          @media (max-width: 560px) {
            .hero-image-shell { padding-top: 112px !important; }
            .hero-meta-row { display: none !important; }
            .hero-kicker { font-size: 10px; max-width: 100%; }
            .hero-image-title { margin-top: 18px; gap: 6px; line-height: 0.96; }
            .hero-title-top { font-size: clamp(30px, 9.7vw, 40px); letter-spacing: 0.045em; }
            .hero-title-bottom { margin-top: 0; font-size: clamp(38px, 12.4vw, 50px); letter-spacing: 0; }
            .hero-image-lead { font-size: 16px; }
            .hero-image-actions { flex-direction: column; }
            .hero-image-actions .btn { width: 100%; flex: 0 0 auto; min-height: 54px; }
            .hero-image-stats { gap: 22px; justify-content: center; text-align: center; }
          }
          @media (prefers-reduced-motion: reduce) {
            .garage-headlight,
            .garage-redline,
            .garage-engine-glow,
            .garage-steam,
            .hero-title-line,
            .hero-title-red,
            .btn-primary::after {
              animation: none !important;
            }
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
        <div className="garage-headlight" />
        <div className="garage-redline" />
        <div className="garage-engine-glow" />
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
              preload
            />
          </div>
        </div>

        {/* main lockup */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div className="garage-steam-wrap" aria-hidden>
            <span className="garage-steam garage-steam-1" />
            <span className="garage-steam garage-steam-2" />
            <span className="garage-steam garage-steam-3" />
          </div>
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
        .garage-headlight,
        .garage-redline,
        .garage-engine-glow {
          position: absolute;
          pointer-events: none;
        }
        .garage-headlight {
          top: 10%;
          left: -32%;
          width: 58vw;
          height: 32vh;
          background: linear-gradient(92deg, transparent 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.22) 50%, rgba(209,26,42,0.16) 58%, transparent 78%);
          filter: blur(18px);
          transform: skewX(-18deg);
          mix-blend-mode: screen;
          animation: garageHeadlightSweep 7.5s cubic-bezier(0.65, 0, 0.25, 1) infinite;
        }
        .garage-redline {
          left: 0;
          right: 0;
          bottom: 18%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(209,26,42,0.12), rgba(255,70,82,0.88), rgba(245,167,66,0.42), transparent);
          box-shadow: 0 0 28px rgba(209,26,42,0.42);
          transform-origin: center;
          animation: garageRedlinePulse 2.8s ease-in-out infinite;
        }
        .garage-engine-glow {
          width: min(720px, 78vw);
          height: min(720px, 78vw);
          left: 50%;
          bottom: -34%;
          transform: translateX(-50%);
          border-radius: 50%;
          background:
            radial-gradient(circle at 50% 50%, rgba(209,26,42,0.22), transparent 48%),
            radial-gradient(circle at 50% 50%, rgba(245,167,66,0.12), transparent 68%);
          filter: blur(28px);
          animation: garageEngineIdle 4.8s ease-in-out infinite;
        }
        .garage-steam-wrap {
          position: relative;
          width: min(220px, 48vw);
          height: 42px;
          margin: 0 auto -4px;
          pointer-events: none;
        }
        .garage-steam {
          position: absolute;
          bottom: 0;
          width: 2px;
          height: 34px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.42), rgba(255,255,255,0));
          filter: blur(1px);
          opacity: 0;
        }
        .garage-steam-1 { left: 34%; animation: garageSteamRise 4.6s ease-in-out infinite; }
        .garage-steam-2 { left: 50%; animation: garageSteamRise 5.2s ease-in-out 0.8s infinite; }
        .garage-steam-3 { left: 66%; animation: garageSteamRise 4.9s ease-in-out 1.5s infinite; }
        .hero-title .chrome,
        .hero-title-kicker,
        .hero-title-main .chrome,
        .hero-title-line {
          background-size: 100% 160%, 240% 100%;
          animation: garageChromeBreathe 5.8s ease-in-out infinite;
        }
        .red-a,
        .hero-title-red {
          animation: garageRedA 2.6s ease-in-out infinite;
        }
        .btn-primary {
          position: relative;
          overflow: hidden;
        }
        .btn-primary::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.24) 50%, transparent 70%);
          transform: translateX(-120%);
          animation: garageButtonIgnition 4.8s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes scrollLine {
          0%, 100% { transform: scaleY(0.2); transform-origin: top; }
          50%      { transform: scaleY(1); transform-origin: top; }
        }
        @keyframes garageHeadlightSweep {
          0%, 38% { transform: translateX(0) skewX(-18deg); opacity: 0; }
          48% { opacity: 0.85; }
          72% { opacity: 0.16; }
          100% { transform: translateX(190vw) skewX(-18deg); opacity: 0; }
        }
        @keyframes garageRedlinePulse {
          0%, 100% { opacity: 0.28; transform: scaleX(0.72); }
          45% { opacity: 0.9; transform: scaleX(1); }
          70% { opacity: 0.42; transform: scaleX(0.9); }
        }
        @keyframes garageEngineIdle {
          0%, 100% { opacity: 0.36; transform: translateX(-50%) scale(0.96); }
          50% { opacity: 0.72; transform: translateX(-50%) scale(1.05); }
        }
        @keyframes garageSteamRise {
          0% { opacity: 0; transform: translateY(14px) translateX(0) scaleY(0.72); }
          24% { opacity: 0.5; }
          78% { opacity: 0.18; }
          100% { opacity: 0; transform: translateY(-30px) translateX(18px) scaleY(1.3); }
        }
        @keyframes garageChromeBreathe {
          0%, 100% { filter: drop-shadow(0 20px 38px rgba(0,0,0,0.5)); }
          50% { filter: drop-shadow(0 24px 48px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(255,255,255,0.1)); }
        }
        @keyframes garageRedA {
          0%, 100% { filter: drop-shadow(0 0 12px rgba(209,26,42,0.38)); }
          50% { filter: drop-shadow(0 0 28px rgba(209,26,42,0.76)); }
        }
        @keyframes garageButtonIgnition {
          0%, 62% { transform: translateX(-120%); opacity: 0; }
          74% { opacity: 1; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        @media (max-width: 900px) {
          .hero-meta-row { display: none !important; }
          .hero-bottom { grid-template-columns: 1fr !important; text-align: center !important; gap: 40px !important; }
          .hero-bottom-left p { max-width: 100% !important; margin: 0 auto !important; }
          .hero-bottom-right { text-align: center !important; }
          .hero-bottom-right .eyebrow { justify-content: center !important; }
          .hero-bottom-right > div:last-child { justify-content: center !important; }
        }
        @media (max-width: 560px) {
          .garage-headlight { width: 78vw; height: 24vh; filter: blur(22px); }
          .garage-redline { bottom: 24%; }
          .garage-steam-wrap { height: 28px; margin-bottom: 0; }
          .garage-steam { height: 24px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .garage-headlight,
          .garage-redline,
          .garage-engine-glow,
          .garage-steam,
          .hero-title .chrome,
          .hero-title-kicker,
          .hero-title-main .chrome,
          .hero-title-line,
          .red-a,
          .hero-title-red,
          .btn-primary::after {
            animation: none !important;
          }
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

// ---------------- LIVE VISIT BOARD ----------------
function LiveVisitBoard() {
  const [rows, setRows] = useState([]);
  const [orderPulse, setOrderPulse] = useState({ active: 0, queue: 0, cooking: 0, ready: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [trackingId, setTrackingId] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [trackingResult, setTrackingResult] = useState(null);

  const refreshLiveBoard = useCallback(async (options = {}) => {
    if (!options.silent) setLoading(true);
    setError("");
    try {
      const liveVisit = await getPublicLiveVisit();
      setRows(liveVisit.tables ?? []);
      setOrderPulse(liveVisit.orderPulse ?? { active: 0, queue: 0, cooking: 0, ready: 0 });
      setUpdatedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status live sedang disinkronkan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLiveBoard();
    const timer = window.setInterval(() => void refreshLiveBoard({ silent: true }), 10_000);
    return () => window.clearInterval(timer);
  }, [refreshLiveBoard]);

  const availableTables = rows.filter((row) => row.available).length;
  const busyTables = rows.length ? rows.length - availableTables : 0;
  const cleaningTables = rows.filter((row) => row.needsCleaning || row.status === "needs_cleaning").length;
  const activeOrders = orderPulse.active ?? 0;
  const cookingOrders = orderPulse.cooking ?? 0;
  const readyOrders = orderPulse.ready ?? 0;
  const queuedOrders = orderPulse.queue ?? 0;
  const recommendation = liveVisitRecommendation(rows.length, availableTables, activeOrders);
  const syncLabel = updatedAt
    ? updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : loading
      ? "Memuat"
      : "Belum sinkron";

  const handleTrackingSubmit = async (event) => {
    event.preventDefault();
    const cleanId = trackingId.trim();
    setTrackingError("");
    setTrackingResult(null);
    if (!cleanId) {
      setTrackingError("Masukkan nomor tracking/order dari struk atau link order.");
      return;
    }

    setTrackingLoading(true);
    try {
      const status = await getPublicTrackingStatus(cleanId);
      setTrackingResult(status);
    } catch (caught) {
      setTrackingError(caught instanceof Error ? caught.message : "Status order tidak ditemukan.");
    } finally {
      setTrackingLoading(false);
    }
  };

  return (
    <section id="live-status" className="section-pad live-visit" style={{ borderTop: "1px solid var(--line)", background: "var(--bg-1)" }}>
      <div className="shell">
        <div className="live-visit-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>01 / Sebelum datang</Reveal>
            <Reveal mask as="h2" delay={100} className="display live-visit-title" aria-label="Cek suasana Garage.">
              <span style={{ display: "block" }}>Cek suasana</span>
              <span style={{ display: "block", color: "var(--red)" }}>Garage.</span>
            </Reveal>
          </div>
          <Reveal delay={260} className="live-visit-copy">
            <p>
              Lihat gambaran kursi, suasana, estimasi tunggu, dan status pesanan sebelum kamu berangkat ke GARAGE.
            </p>
            <div className="live-visit-actions">
              <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Order Sekarang</span><ArrowRight /></Link>
              <button type="button" onClick={requestTablePanelOpen} className="btn"><span>Pilih Meja</span><ArrowRight /></button>
            </div>
          </Reveal>
        </div>

        <div className="live-visit-grid">
          <Reveal delay={120} className="live-command-card">
            <div className="live-card-top">
              <span className="mono" style={{ color: "var(--red)" }}>GARAGE HARI INI</span>
              <span className="live-sync">{syncLabel}</span>
            </div>
            <div className="live-main-status">
              <span className="live-dot" data-tone={recommendation.tone} />
              <div>
                <p className="live-status-label">Buka sekarang</p>
                <strong>{recommendation.mood}</strong>
              </div>
            </div>
            <p className="live-advice">{error ? "Status live sedang disinkronkan. Untuk reservasi cepat, hubungi WhatsApp." : recommendation.advice}</p>
            {error ? <div className="live-alert">{error}</div> : null}
            <div className="live-metrics">
              <div>
                <span>Meja kosong</span>
                <strong>{rows.length ? `${availableTables}/${rows.length}` : "-"}</strong>
              </div>
              <div>
                <span>Terisi</span>
                <strong>{rows.length ? busyTables : "-"}</strong>
              </div>
              <div>
                <span>Order aktif</span>
                <strong>{activeOrders}</strong>
              </div>
              <div>
                <span>Estimasi</span>
                <strong>{recommendation.eta}</strong>
              </div>
            </div>
            <div className="order-pulse">
              <span>{queuedOrders} menunggu</span>
              <span>{cookingOrders} disiapkan</span>
              <span>{readyOrders} siap</span>
            </div>
          </Reveal>

          <Reveal delay={240} className="live-table-card">
            <div className="live-card-top">
              <span className="mono" style={{ color: "var(--fg)" }}>KURSI & MEJA</span>
              <button type="button" onClick={requestTablePanelOpen}>Buka detail</button>
            </div>
            <div className="live-mini-table-grid" aria-label="Status meja publik">
              {loading && !rows.length
                ? Array.from({ length: 18 }).map((_, index) => <span key={index} className="live-mini-table skeleton" />)
                : rows.slice(0, 24).map((row) => {
                    const availability = tableAvailabilityState(row);
                    return (
                      <button
                        key={row.tableNumber}
                        type="button"
                        className="live-mini-table"
                        data-state={availability}
                        title={`${row.tableLabel} - ${tableStatusCopy(row).label}`}
                        onClick={row.available ? requestTablePanelOpen : undefined}
                      >
                        {row.tableNumber}
                      </button>
                    );
                  })}
            </div>
            <div className="live-legend">
              <span><i data-state="ready" /> Kosong</span>
              <span><i data-state="full" /> Terisi</span>
              <span><i data-state="unknown" /> Tidak Aktif</span>
              {cleaningTables ? <span><i data-state="full" /> {cleaningTables} cleaning</span> : null}
            </div>
          </Reveal>

          <Reveal delay={360} className="live-tracking-card" id={TRACKING_SECTION_ID}>
            <div className="live-card-top">
              <span className="mono" style={{ color: "var(--fg)" }}>CEK PESANAN</span>
              <span className="live-sync">Dari struk</span>
            </div>
            <form onSubmit={handleTrackingSubmit} className="tracking-form">
              <input
                value={trackingId}
                onChange={(event) => setTrackingId(event.target.value)}
                placeholder="Masukkan ID / nomor order"
                aria-label="Masukkan ID atau nomor order"
              />
              <button type="submit" disabled={trackingLoading}>
                {trackingLoading ? "Cek..." : "Cek Status"}
              </button>
            </form>
            {trackingResult ? (
              <div className="tracking-result">
                <span className="mono">Order {trackingResult.orderNo ?? trackingResult.id}</span>
                <strong>{publicOrderStageLabel(trackingResult.kitchenStatus ?? trackingResult.orderStatus)}</strong>
                <p>{trackingResult.message ?? "Status order sedang diperbarui."}</p>
                <div>
                  <span>{trackingResult.estimatedMinutes ? `Estimasi ${trackingResult.estimatedMinutes} menit` : "Estimasi mengikuti antrean"}</span>
                  <span>{trackingResult.updatedAt ? formatTableTimestamp(trackingResult.updatedAt) : "Update live"}</span>
                </div>
              </div>
            ) : (
              <div className="tracking-empty">
                <strong>Belum punya order?</strong>
                <p>Pesan dari menu digital, simpan nomor order, lalu cek progresnya kapan saja.</p>
                <Link href={DIGITAL_MENU_URL}>Order Sekarang</Link>
              </div>
            )}
            {trackingError ? <div className="live-alert">{trackingError}</div> : null}
          </Reveal>
        </div>
      </div>

      <style>{`
        .live-visit-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
          gap: 48px;
          align-items: end;
          margin-bottom: 36px;
        }
        .live-visit-title {
          font-size: clamp(46px, 8vw, 132px);
        }
        .live-visit-copy p {
          color: var(--fg-dim);
          font-size: 15px;
          line-height: 1.7;
        }
        .live-visit-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }
        .live-visit-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.85fr);
          gap: 16px;
          align-items: stretch;
        }
        .live-command-card,
        .live-table-card,
        .live-tracking-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border: 1px solid var(--line);
          background: linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025));
          padding: 22px;
        }
        .live-command-card::before,
        .live-table-card::before,
        .live-tracking-card::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 34%;
          left: -42%;
          background: linear-gradient(90deg, transparent, rgba(209,26,42,0.12), rgba(255,255,255,0.08), transparent);
          transform: skewX(-18deg);
          animation: garagePanelScan 6.4s ease-in-out infinite;
          pointer-events: none;
        }
        .live-table-card::before { animation-delay: 1.2s; }
        .live-tracking-card::before { animation-delay: 2.2s; }
        .live-command-card {
          grid-row: span 2;
        }
        .live-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }
        .live-sync,
        .live-card-top button {
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.045);
          padding: 6px 9px;
          color: var(--fg-dim);
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .live-card-top button {
          color: var(--fg);
          transition: border-color 0.2s var(--ease-out), color 0.2s var(--ease-out);
        }
        .live-card-top button:hover {
          border-color: var(--red);
          color: #fff;
        }
        .live-main-status {
          display: flex;
          align-items: center;
          gap: 18px;
          margin-bottom: 18px;
        }
        .live-dot {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #0db86c;
          box-shadow: 0 0 0 8px rgba(13,184,108,0.12), 0 0 32px rgba(13,184,108,0.36);
          animation: garageLiveDot 2.2s ease-in-out infinite;
        }
        .live-dot[data-tone="busy"],
        .live-dot[data-tone="normal"] {
          background: var(--amber);
          box-shadow: 0 0 0 8px rgba(245,167,66,0.12), 0 0 32px rgba(245,167,66,0.28);
        }
        .live-dot[data-tone="full"] {
          background: var(--red);
          box-shadow: 0 0 0 8px rgba(209,26,42,0.14), 0 0 32px rgba(209,26,42,0.34);
        }
        .live-dot[data-tone="sync"] {
          background: #8f8f98;
          box-shadow: 0 0 0 8px rgba(143,143,152,0.12);
        }
        .live-status-label {
          color: var(--fg-mute);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .live-main-status strong {
          display: block;
          margin-top: 4px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(44px, 5vw, 72px);
          line-height: 0.9;
          text-transform: uppercase;
        }
        .live-advice {
          max-width: 640px;
          color: var(--fg-dim);
          font-size: 16px;
          line-height: 1.65;
        }
        .live-alert {
          margin-top: 14px;
          border: 1px solid rgba(209,26,42,0.42);
          background: rgba(209,26,42,0.12);
          padding: 12px;
          color: #ffd7da;
          font-size: 13px;
          line-height: 1.5;
        }
        .live-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 26px;
        }
        .live-metrics div {
          min-width: 0;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.18);
          padding: 13px;
        }
        .live-metrics span,
        .order-pulse span {
          display: block;
          color: var(--fg-mute);
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .live-metrics strong {
          display: block;
          margin-top: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 30px;
          line-height: 1;
        }
        .order-pulse {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .order-pulse span {
          border: 1px solid rgba(245,167,66,0.26);
          background: rgba(245,167,66,0.08);
          padding: 7px 9px;
          color: #ffd08a;
        }
        .live-mini-table-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 7px;
        }
        .live-mini-table {
          min-height: 42px;
          border: 1px solid rgba(143,143,152,0.34);
          background: rgba(255,255,255,0.04);
          color: var(--fg-dim);
          font-family: var(--font-display);
          font-size: 18px;
          line-height: 1;
          transition: transform 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out);
        }
        .live-mini-table[data-state="ready"] {
          border-color: rgba(13,184,108,0.52);
          background: rgba(13,184,108,0.11);
          color: #dfffee;
        }
        .live-mini-table[data-state="full"] {
          border-color: rgba(209,26,42,0.48);
          background: rgba(209,26,42,0.11);
          color: #ffc2c8;
        }
        .live-mini-table[data-state="unknown"] {
          border-color: rgba(143,143,152,0.34);
          background: rgba(114,114,124,0.08);
          color: #8a8a90;
        }
        .live-mini-table:hover {
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.42);
        }
        .live-mini-table.skeleton {
          display: block;
          background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04));
          background-size: 220% 100%;
          animation: garageTableSkeleton 1.2s linear infinite;
        }
        .live-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
          color: var(--fg-mute);
          font-size: 12px;
        }
        .live-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .live-legend i {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #8f8f98;
        }
        .live-legend i[data-state="ready"] { background: #0db86c; }
        .live-legend i[data-state="full"] { background: var(--red); }
        .live-legend i[data-state="unknown"] {
          background: #8f8f98;
          animation: garageLegendUnknownPulse 1.5s ease-in-out infinite;
        }
        @keyframes garageLegendUnknownPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .tracking-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 128px;
          gap: 8px;
        }
        .tracking-form input {
          min-width: 0;
          min-height: 46px;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.24);
          padding: 0 13px;
          color: var(--fg);
          outline: none;
        }
        .tracking-form input:focus {
          border-color: rgba(245,167,66,0.58);
        }
        .tracking-form button,
        .tracking-empty a {
          min-height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--red);
          background: var(--red);
          color: #fff;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .tracking-form button:disabled {
          cursor: wait;
          opacity: 0.7;
        }
        .tracking-result,
        .tracking-empty {
          margin-top: 14px;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.18);
          padding: 14px;
        }
        .tracking-result strong {
          display: block;
          margin-top: 8px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 24px;
          line-height: 1;
          text-transform: uppercase;
        }
        .tracking-result p,
        .tracking-empty p {
          margin-top: 8px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.55;
        }
        .tracking-result div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .tracking-result div span {
          border: 1px solid var(--line);
          padding: 5px 7px;
          color: var(--fg-mute);
          font-size: 11px;
        }
        .tracking-empty a {
          width: fit-content;
          margin-top: 12px;
          padding: 0 14px;
          background: rgba(255,255,255,0.06);
          border-color: var(--line-2);
        }
        @keyframes garagePanelScan {
          0%, 55% { left: -42%; opacity: 0; }
          68% { opacity: 1; }
          100% { left: 118%; opacity: 0; }
        }
        @keyframes garageLiveDot {
          0%, 100% { transform: scale(0.92); }
          50% { transform: scale(1.12); }
        }
        @media (max-width: 980px) {
          .live-visit-head,
          .live-visit-grid {
            grid-template-columns: 1fr;
          }
          .live-command-card {
            grid-row: auto;
          }
        }
        @media (max-width: 640px) {
          .live-command-card,
          .live-table-card,
          .live-tracking-card {
            padding: 16px;
          }
          .live-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .live-mini-table-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .tracking-form {
            grid-template-columns: 1fr;
          }
          .live-visit-actions .btn {
            width: 100%;
            justify-content: center;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-command-card::before,
          .live-table-card::before,
          .live-tracking-card::before,
          .live-dot {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

function LiveTrackingSystem() {
  const [trackingData, setTrackingData] = useState(null);
  const [status, setStatus] = useState("sync");
  const [updatedAt, setUpdatedAt] = useState(null);

  const refreshTrackingSystem = useCallback(async () => {
    try {
      const liveTracking = await getPublicLiveTracking();
      setTrackingData(liveTracking);
      setUpdatedAt(liveTracking?.generatedAt ? new Date(liveTracking.generatedAt) : new Date());
      setStatus("live");
    } catch {
      setStatus("fallback");
    }
  }, []);

  useEffect(() => {
    void refreshTrackingSystem();
    const timer = window.setInterval(() => void refreshTrackingSystem(), 12_000);
    return () => window.clearInterval(timer);
  }, [refreshTrackingSystem]);

  const orderPulse = trackingData?.orderPulse ?? { active: 0, queue: 0, cooking: 0, ready: 0, eta: "8-12 menit", overdue: 0 };
  const barPulse = trackingData?.stationPulse?.bar ?? { active: 0, queue: 0, cooking: 0, ready: 0, eta: "5-8 menit", status: "Minuman siap dipesan", unit: "minuman" };
  const kitchenPulse = trackingData?.stationPulse?.kitchen ?? { active: 0, queue: 0, cooking: 0, ready: 0, eta: "12-18 menit", status: "Dapur siap memasak", unit: "makanan" };
  const takeawayPulse = trackingData?.takeaway ?? { active: 0, queue: 0, cooking: 0, ready: 0, eta: "8-12 menit", recommendation: "Pesan sekarang, ambil saat sudah siap." };
  const eventList = trackingData?.events?.length ? trackingData.events : EVENTS.map((event, index) => {
    const seats = eventSeatInfo(event, index);
    return {
      title: event.title,
      date: event.date,
      time: event.time,
      tag: event.tag,
      capacity: seats.capacity,
      available: seats.available,
      reserved: seats.reserved,
      tone: seats.tone,
    };
  });
  const activeOrders = Number(orderPulse.active ?? 0);
  const queuedOrders = Number(orderPulse.queue ?? 0);
  const cookingOrders = Number(orderPulse.cooking ?? 0);
  const readyOrders = Number(orderPulse.ready ?? 0);
  const nextEvent = eventList[0];
  const syncLabel = status === "live" && updatedAt
    ? `Update ${updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
    : status === "fallback"
      ? "Fallback WA"
      : "Sinkron";

  const liveCards = [
    {
      label: "Pesanan Hari Ini",
      value: `${activeOrders}`,
      unit: "sedang berjalan",
      tone: activeOrders >= 12 ? "busy" : activeOrders > 0 ? "normal" : "ready",
      copy: `${queuedOrders} menunggu, ${cookingOrders} disiapkan, ${readyOrders} siap diambil. Estimasi ${orderPulse.eta ?? "8-12 menit"}.`,
    },
    {
      label: "Estimasi Makanan",
      value: kitchenPulse.eta ?? "12-18 menit",
      unit: kitchenPulse.unit ?? "makanan",
      tone: kitchenPulse.active >= 6 ? "busy" : kitchenPulse.active > 0 ? "normal" : "ready",
      copy: `${kitchenPulse.queue ?? 0} menunggu, ${kitchenPulse.cooking ?? 0} sedang dimasak. ${kitchenPulse.status ?? "Dapur siap memasak"}.`,
    },
    {
      label: "Estimasi Minuman",
      value: barPulse.eta ?? "5-8 menit",
      unit: barPulse.unit ?? "minuman",
      tone: barPulse.active >= 6 ? "busy" : barPulse.active > 0 ? "normal" : "ready",
      copy: `${barPulse.queue ?? 0} menunggu, ${barPulse.cooking ?? 0} sedang dibuat. ${barPulse.status ?? "Minuman siap dipesan"}.`,
    },
    {
      label: "Ambil Sendiri",
      value: takeawayPulse.eta ?? "8-12 menit",
      unit: "pickup",
      tone: takeawayPulse.ready > 0 ? "ready" : takeawayPulse.active >= 8 ? "busy" : takeawayPulse.active > 0 ? "normal" : "ready",
      copy: takeawayPulse.recommendation ?? "Pesan sekarang, ambil saat sudah siap.",
    },
  ];

  return (
    <section id="live-tracking-system" className="live-system" aria-label="Estimasi pesanan GARAGE">
      <div className="shell">
        <div className="live-system-shell">
          <Reveal className="live-system-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 16 }}>02 / Pesan lebih tenang</div>
              <h2 className="display live-system-title">
                Tahu estimasi<br /><span>sebelum pesan.</span>
              </h2>
            </div>
            <div className="live-system-brief">
              <span className="mono">{syncLabel}</span>
              <p>
                Mau dine-in atau takeaway, kamu bisa lihat gambaran waktu tunggu sebelum pesan. Lebih jelas, lebih santai,
                dan tidak perlu bolak-balik tanya lewat chat.
              </p>
            </div>
          </Reveal>

          <div className="live-system-grid">
            {liveCards.map((card, index) => (
              <Reveal key={card.label} delay={index * 90} className="live-system-card" style={{ "--track-delay": `${index * 120}ms` }}>
                <div className="live-system-card-top">
                  <span className="mono">{card.label}</span>
                  <i data-tone={card.tone} />
                </div>
                <strong>{card.value}</strong>
                <span>{card.unit}</span>
                <p>{card.copy}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={420} className="live-system-bottom">
            <div className="live-stepper" aria-label="Alur pesanan GARAGE">
              {[
                ["01", "Pesan menu"],
                ["02", "Kami siapkan"],
                ["03", "Siap diambil"],
                ["04", "Selesai"],
              ].map((step, index) => (
                <div key={step[0]} className={index <= Math.min(3, activeOrders ? 2 : 1) ? "is-active" : ""}>
                  <span>{step[0]}</span>
                  <strong>{step[1]}</strong>
                </div>
              ))}
            </div>
            <div className="event-live-capacity">
              <div>
                <span className="mono">Slot event</span>
                <h3>{nextEvent?.title ?? "Event GARAGE"}</h3>
                <p>{nextEvent?.available ?? "-"}/{nextEvent?.capacity ?? "-"} slot tersedia. Simpan tempatmu lebih cepat lewat WhatsApp.</p>
              </div>
              <a
                href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(`Halo GARAGE, saya mau RSVP event ${nextEvent?.title ?? "GARAGE"}.`)}`}
                className="btn btn-primary"
              >
                <span>RSVP Event</span><ArrowRight />
              </a>
            </div>
          </Reveal>
        </div>
      </div>

      <style>{`
        .live-system {
          position: relative;
          overflow: hidden;
          border-top: 1px solid var(--line);
          background:
            radial-gradient(circle at 18% 12%, rgba(209,26,42,0.16), transparent 32%),
            radial-gradient(circle at 82% 62%, rgba(245,167,66,0.1), transparent 30%),
            var(--bg-0);
          padding: clamp(36px, 6vw, 86px) 0;
        }
        .live-system::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: linear-gradient(180deg, transparent, #000 18%, #000 78%, transparent);
          animation: garageLiveGridDrift 18s linear infinite;
        }
        .live-system-shell {
          position: relative;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(9,9,11,0.74);
          backdrop-filter: blur(10px);
          padding: clamp(18px, 3vw, 34px);
        }
        .live-system-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 430px);
          gap: 32px;
          align-items: end;
          margin-bottom: 24px;
        }
        .live-system-title {
          font-size: clamp(42px, 6.4vw, 94px);
          line-height: 0.9;
        }
        .live-system-title span {
          color: var(--red);
        }
        .live-system-brief {
          border-left: 2px solid rgba(209,26,42,0.7);
          padding-left: 18px;
        }
        .live-system-brief p {
          margin-top: 12px;
          color: var(--fg-dim);
          font-size: 14px;
          line-height: 1.65;
        }
        .live-system-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .live-system-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(160deg, rgba(255,255,255,0.058), rgba(255,255,255,0.018));
          padding: 18px;
          isolation: isolate;
        }
        .live-system-card::after {
          content: "";
          position: absolute;
          inset: -40% -60%;
          z-index: -1;
          background: linear-gradient(110deg, transparent 38%, rgba(255,255,255,0.08) 50%, transparent 62%);
          transform: translateX(-55%);
          animation: garageLiveSweep 5.8s var(--ease-out) infinite;
          animation-delay: var(--track-delay);
        }
        .live-system-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .live-system-card-top i {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #0db86c;
          box-shadow: 0 0 0 6px rgba(13,184,108,0.12), 0 0 22px rgba(13,184,108,0.28);
        }
        .live-system-card-top i[data-tone="busy"] {
          background: var(--amber);
          box-shadow: 0 0 0 6px rgba(245,167,66,0.12), 0 0 22px rgba(245,167,66,0.28);
        }
        .live-system-card-top i[data-tone="normal"] {
          background: #60b4e8;
          box-shadow: 0 0 0 6px rgba(96,180,232,0.12), 0 0 22px rgba(96,180,232,0.28);
        }
        .live-system-card strong {
          display: block;
          margin-top: 26px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(30px, 4vw, 52px);
          line-height: 0.92;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }
        .live-system-card > span {
          display: block;
          margin-top: 6px;
          color: var(--red);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .live-system-card p {
          margin-top: 18px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.55;
        }
        .live-system-bottom {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr);
          gap: 12px;
          margin-top: 12px;
        }
        .live-stepper,
        .event-live-capacity {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.2);
          padding: 18px;
        }
        .live-stepper {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .live-stepper div {
          position: relative;
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.09);
          padding: 14px;
          color: var(--fg-mute);
        }
        .live-stepper div.is-active {
          border-color: rgba(209,26,42,0.48);
          background: rgba(209,26,42,0.08);
          color: var(--fg);
        }
        .live-stepper span,
        .event-live-capacity .mono {
          color: var(--red);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .live-stepper strong {
          display: block;
          margin-top: 10px;
          font-family: var(--font-display);
          font-size: 24px;
          line-height: 1;
          text-transform: uppercase;
        }
        .event-live-capacity {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .event-live-capacity h3 {
          margin-top: 10px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(26px, 3vw, 38px);
          line-height: 0.95;
          text-transform: uppercase;
        }
        .event-live-capacity p {
          margin-top: 10px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.5;
        }
        @keyframes garageLiveGridDrift {
          from { background-position: 0 0, 0 0; }
          to { background-position: 56px 56px, 56px 56px; }
        }
        @keyframes garageLiveSweep {
          0%, 58% { transform: translateX(-55%); opacity: 0; }
          72% { opacity: 1; }
          100% { transform: translateX(55%); opacity: 0; }
        }
        @media (max-width: 1080px) {
          .live-system-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .live-system-head,
          .live-system-bottom {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .live-system-shell {
            padding: 16px;
          }
          .live-system-grid,
          .live-stepper {
            grid-template-columns: 1fr;
          }
          .event-live-capacity {
            align-items: stretch;
            flex-direction: column;
          }
          .event-live-capacity .btn {
            width: 100%;
            justify-content: center;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-system::before,
          .live-system-card::after {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

function S3MvpStrip() {
  const items = [
    {
      label: "Status",
      title: "Cek suasana dulu",
      body: "Lihat kursi kosong, suasana, dan estimasi tunggu sebelum kamu berangkat.",
    },
    {
      label: "Serve",
      title: "Pesan tanpa ribet",
      body: "Pilih menu dari website, pesan takeaway, atau reservasi meja lewat WhatsApp.",
    },
    {
      label: "Stay",
      title: "Balik lagi lebih seru",
      body: "Ikut event, kumpul komunitas, dan nikmati benefit member setiap kali datang.",
    },
  ];

  return (
    <section className="s3-strip" aria-label="GARAGE MVP S3">
      <div className="shell">
        <Reveal className="s3-strip-grid">
          {items.map((item, index) => (
            <div key={item.label} className="s3-strip-card">
              <span className="mono">S{index + 1} / {item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
      <style>{`
        .s3-strip {
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          background:
            linear-gradient(90deg, rgba(209,26,42,0.08), transparent 26%, rgba(245,167,66,0.045), transparent 78%),
            var(--bg-0);
          padding: 28px 0;
        }
        .s3-strip-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .s3-strip-card {
          min-width: 0;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.025);
          padding: 18px;
          transition: transform 0.24s var(--ease-out), border-color 0.24s var(--ease-out), background 0.24s var(--ease-out);
        }
        .s3-strip-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: -20%;
          bottom: -20%;
          width: 2px;
          background: linear-gradient(180deg, transparent, var(--red), transparent);
          opacity: 0.55;
          animation: garageEdgeSignal 3.8s ease-in-out infinite;
        }
        .s3-strip-card:nth-child(2)::before { animation-delay: 0.7s; }
        .s3-strip-card:nth-child(3)::before { animation-delay: 1.4s; }
        .s3-strip-card:hover {
          transform: translateY(-2px);
          border-color: rgba(209,26,42,0.38);
          background: rgba(209,26,42,0.055);
        }
        .s3-strip-card h3 {
          margin-top: 10px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(24px, 2.6vw, 36px);
          line-height: 0.96;
          text-transform: uppercase;
        }
        .s3-strip-card p {
          margin-top: 12px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.55;
        }
        @keyframes garageEdgeSignal {
          0%, 100% { opacity: 0.2; transform: translateY(-12%); }
          50% { opacity: 0.9; transform: translateY(12%); }
        }
        @media (max-width: 760px) {
          .s3-strip-grid { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .s3-strip-card::before { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

// ---------------- PROMO BAR ----------------
function PromoBar() {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const promoMessages = [
    "LIVE GARAGE - BUKA SEKARANG",
    "CEK MEJA KOSONG SEBELUM DATANG",
    "ORDER DIGITAL / TAKEAWAY TERSEDIA",
    "TRACKING ORDER AKTIF",
    "RESERVASI CEPAT VIA WHATSAPP",
  ];
  return (
    <div className="promo-bar">
      <span className="promo-bar__label">LIVE OUTLET</span>
      <div className="promo-bar__viewport">
        <div className="promo-bar__track">
          {[0, 1].map((group) => (
            <div className="promo-bar__group" key={group} aria-hidden={group === 1}>
              {promoMessages.map((message) => (
                <React.Fragment key={`${group}-${message}`}>
                  <span>{message}</span>
                  <span className="promo-bar__star">|</span>
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
        .promo-bar__label {
          padding: 5px 9px;
          border: 1px solid rgba(255,255,255,0.24);
          background: rgba(0,0,0,0.12);
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
            min-height: 38px;
          }
          .promo-bar__label,
          .promo-bar__group span {
            font-size: 10px;
            letter-spacing: 0.1em;
          }
          .promo-bar__label {
            max-width: 108px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .promo-bar__group {
            gap: 22px;
            padding-right: 22px;
          }
        }
        @media (max-width: 380px) {
          .promo-bar {
            padding-inline: 8px;
          }
          .promo-bar__label {
            max-width: 92px;
            padding-inline: 7px;
          }
          .promo-bar__close {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>
    </div>);

}

// ---------------- FLOATING WHATSAPP ----------------
function FloatingWA() {
  const [hover, setHover] = useState(false);
  const biz = useBiz();
  return (
    <a
      href={bizWaUrl(biz.whatsapp)}
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
    eyebrow: "Tangan terbaik di Tebing Tinggi",
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
function menuSpotlightItems(data) {
  const allItems = data.groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupLabel: group.sub ?? data.eyebrow,
    }))
  );
  const priority = ["Signature", "Terlaris", "Rekomendasi", "Manual Brew", "Komplit", "Baru", "Klasik", "Lokal"];
  const picked = [];
  for (const label of priority) {
    const found = allItems.find((item) => item.badge === label && !picked.some((pickedItem) => pickedItem.name === item.name));
    if (found) picked.push(found);
    if (picked.length >= 4) break;
  }
  for (const item of allItems) {
    if (picked.length >= 4) break;
    if (!picked.some((pickedItem) => pickedItem.name === item.name)) picked.push(item);
  }
  return picked;
}

function menuDisplayPrice(item) {
  const firstAvailable = item.prices.find((price) => price && price !== "—" && price !== "â€”");
  return firstAvailable ? `Rp ${firstAvailable}K` : "Cek menu";
}

function Menu() {
  const cats = Object.keys(MENU);
  const [cat, setCat] = useState(cats[0]);
  const data = MENU[cat];
  const spotlightItems = menuSpotlightItems(data);
  const totalItems = data.groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section id="menu" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-0), var(--bg-1))",
    }}>
      <div className="shell">
        <div className="menu-compact-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>02 / Menu</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Menu pilihan." style={{ fontSize: "clamp(48px, 8vw, 132px)" }}>
              <span style={{ display: "block" }}>Menu</span>
              <span style={{ display: "block", color: "var(--red)" }}>pilihan.</span>
            </Reveal>
          </div>
          <Reveal delay={360} className="menu-compact-copy">
            <p>
              Lagi lapar, butuh kopi, atau mau takeaway? Pilih favorit GARAGE di sini, lalu buka menu digital untuk order lengkap.
            </p>
            <div className="menu-compact-stats">
              <MenuStat n="4" l="Pilihan cepat" />
              <MenuStat n="8K" l="Mulai dari" />
              <MenuStat n="07-23" l="Tersedia" />
            </div>
          </Reveal>
        </div>

        <div className="menu-tabs">
          {cats.map((category, index) => {
            const active = cat === category;
            return (
              <button key={category} onClick={() => setCat(category)} className={`menu-tab ${active ? "active" : ""}`}>
                <div className="mono" style={{ marginBottom: 8, color: active ? "var(--red)" : "var(--fg-mute)" }}>
                  0{index + 1} / Kategori
                </div>
                <div className="menu-tab-name">{category}</div>
                <span className="menu-tab-underline" />
              </button>
            );
          })}
        </div>

        <div key={`${cat}-compact`} className="menu-compact-intro">
          <div>
            <div className="mono" style={{ color: "var(--red)", marginBottom: 8 }}>{data.eyebrow}</div>
            <h3>{data.summary}</h3>
          </div>
          <div className="menu-category-side">
            <span className="mono">{spotlightItems.length} pilihan ditampilkan</span>
            <span className="mono">{totalItems} item di menu digital</span>
          </div>
        </div>

        <div className="menu-spotlight-grid">
          {spotlightItems.map((item, index) => (
            <Reveal key={item.name} delay={index * 70} className="menu-spotlight-card">
              <div className="menu-card-top">
                <span className="mono">{String(index + 1).padStart(2, "0")} / {item.groupLabel}</span>
                {item.badge ? <span className="tag red">{item.badge}</span> : <span className="tag amber">Pilihan</span>}
              </div>
              <h4>{item.name}</h4>
              <div className="menu-card-bottom">
                <strong>{menuDisplayPrice(item)}</strong>
                <Link className="menu-card-order" href={digitalMenuItemUrl(item.name)} aria-label={`Pesan ${item.name}`}>
                  <span>Pesan</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal as="div" className="menu-compact-cta">
          <div>
            <div className="mono" style={{ marginBottom: 8, color: "var(--red)" }}>ORDER LANGSUNG</div>
            <h3>Pesan dari website, tinggal tunggu panggilan.</h3>
          </div>
          <div className="menu-compact-actions">
            <Link className="btn btn-primary" href={DIGITAL_MENU_URL}><span>Lihat Menu Digital</span><ArrowRight /></Link>
            <Link className="btn" href={DIGITAL_MENU_URL}><span>Order Sekarang</span><ArrowRight /></Link>
            <a className="btn" href={WHATSAPP_URL}><span>Reservasi via WhatsApp</span><ArrowRight /></a>
          </div>
        </Reveal>
      </div>

      <style>{`
        .menu-compact-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 56px;
        }
        .menu-compact-copy {
          max-width: 390px;
        }
        .menu-compact-copy p {
          color: var(--fg-dim);
          font-size: 15px;
          line-height: 1.65;
        }
        .menu-compact-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 18px;
        }
        .menu-tabs {
          display: flex;
          gap: 0;
          border-top: 1px solid var(--line);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .menu-tabs::-webkit-scrollbar { display: none; }
        .menu-tab {
          position: relative;
          flex: 1 1 0;
          min-width: 160px;
          border-right: 1px solid var(--line);
          padding: 22px 24px;
          text-align: left;
          background: transparent;
          cursor: pointer;
          transition: background 0.4s var(--ease-out);
        }
        .menu-tab:last-child { border-right: 0; }
        .menu-tab.active { background: rgba(209,26,42,0.08); }
        .menu-tab-name {
          color: var(--fg-dim);
          font-family: var(--font-display);
          font-size: 20px;
          letter-spacing: 0.02em;
          line-height: 1;
          text-transform: uppercase;
          transition: color 0.4s var(--ease-out);
        }
        .menu-tab.active .menu-tab-name,
        .menu-tab:hover .menu-tab-name {
          color: var(--fg);
        }
        .menu-tab-underline {
          position: absolute;
          left: 0;
          bottom: -1px;
          width: 0;
          height: 2px;
          background: var(--red);
          transition: width 0.5s var(--ease-out);
        }
        .menu-tab.active .menu-tab-underline { width: 100%; }
        .menu-compact-intro {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
          gap: 40px;
          align-items: end;
          border-bottom: 1px solid var(--line);
          padding: 32px 0;
        }
        .menu-compact-intro h3 {
          max-width: 620px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(28px, 3vw, 40px);
          letter-spacing: 0.02em;
          line-height: 1;
          text-transform: uppercase;
        }
        .menu-category-side {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .menu-spotlight-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          padding-top: 28px;
        }
        .menu-spotlight-card {
          min-width: 0;
          border: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02));
          padding: 18px;
          transition: transform 0.28s var(--ease-out), border-color 0.28s var(--ease-out), background 0.28s var(--ease-out);
        }
        .menu-spotlight-card:hover {
          transform: translateY(-3px);
          border-color: rgba(209,26,42,0.42);
          background: linear-gradient(180deg, rgba(209,26,42,0.08), rgba(255,255,255,0.025));
        }
        .menu-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 28px;
        }
        .menu-spotlight-card h4 {
          min-height: 72px;
          margin-top: 20px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(25px, 2.15vw, 34px);
          letter-spacing: 0.01em;
          line-height: 0.95;
          text-transform: uppercase;
        }
        .menu-card-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 24px;
        }
        .menu-card-bottom strong {
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 30px;
          line-height: 1;
          white-space: nowrap;
        }
        .menu-card-order {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid var(--line-2);
          padding: 0 10px;
          color: var(--fg-dim);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          white-space: nowrap;
          transition: color 0.25s var(--ease-out), border-color 0.25s var(--ease-out), background 0.25s var(--ease-out);
        }
        .menu-card-order:hover {
          border-color: var(--red);
          background: var(--red);
          color: #fff;
        }
        .menu-compact-cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          margin-top: 56px;
          border: 1px solid var(--line);
          background: linear-gradient(135deg, rgba(209,26,42,0.08), transparent);
          padding: 32px 36px;
        }
        .menu-compact-cta h3 {
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 28px;
          letter-spacing: 0.02em;
          line-height: 1;
          text-transform: uppercase;
        }
        .menu-compact-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        @media (min-width: 701px) and (max-width: 1100px) {
          .menu-spotlight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 700px) {
          .menu-compact-intro { grid-template-columns: 1fr; gap: 16px; }
          .menu-category-side { align-items: flex-start; }
          .menu-spotlight-grid { grid-template-columns: 1fr; }
          .menu-spotlight-card h4 { min-height: 0; }
          .menu-card-bottom { align-items: stretch; }
          .menu-card-order { min-height: 46px; }
          .menu-compact-cta { padding: 22px; }
          .menu-compact-actions,
          .menu-compact-actions .btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </section>
  );

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
              EST. 2024 ◢ TEBING TINGGI
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
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>06 / Event</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Event minggu ini." style={{ fontSize: "clamp(48px, 7vw, 116px)" }}>
              <span style={{ display: "block" }}>Event</span>
              <span style={{ display: "block" }}>minggu <span style={{ color: "var(--red)" }}>ini.</span></span>
            </Reveal>
          </div>
          <Reveal delay={400}>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--fg-dim)", maxWidth: 480 }}>
              Kopdar motor, live set, workshop manual brew, dan komunitas GARAGE. Cek kapasitas, lalu RSVP langsung via WhatsApp.
            </p>
            <a href={WHATSAPP_URL} className="btn" style={{ marginTop: 28 }}>
              <span>RSVP WhatsApp</span><ArrowRight />
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
  const memberTiers = [
    {
      name: "Starter",
      meta: "Daftar gratis",
      badge: "Basic",
      benefits: ["Riwayat order tersimpan", "Info promo basic", "Akses login member", "Lebih cepat repeat order"],
    },
    {
      name: "Rider",
      meta: "Pelanggan aktif",
      badge: "Popular",
      benefits: ["Poin transaksi", "Diskon menu pilihan", "Prioritas info event", "Benefit reservasi tertentu"],
    },
    {
      name: "Garage Pro",
      meta: "Member loyal",
      badge: "Best",
      benefits: ["Prioritas reservasi", "Birthday treat", "Promo eksklusif", "Akses komunitas/event"],
    },
  ];

  return (
    <section id="membership" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-0), #0b0809)",
    }}>
      <div className="shell">
        <div className="membership-master">
          <Reveal>
            <div>
              <div className="eyebrow" style={{ marginBottom: 20 }}>05 / Membership Master Pro</div>
              <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 104px)", lineHeight: 0.88 }}>
                Member<br /><span style={{ color: "var(--red)" }}>Garage.</span>
              </h2>
              <p style={{ marginTop: 24, maxWidth: 500, color: "var(--fg-dim)", lineHeight: 1.7 }}>
                Jadi bagian dari GARAGE. Dapatkan info promo lebih cepat, akses event, dan benefit untuk kunjungan berikutnya.
              </p>
              <div className="membership-actions">
                <Link href={`${MEMBER_LOGIN_URL}?mode=register`} className="btn btn-primary">
                  <span>Daftar Member</span><ArrowRight />
                </Link>
                <Link href={MEMBER_LOGIN_URL} className="btn">
                  <span>Login Member</span><ArrowRight />
                </Link>
                <a href={WHATSAPP_URL} className="btn"><span>Tanya via WhatsApp</span><ArrowRight /></a>
              </div>
            </div>
          </Reveal>
          <Reveal delay={160} className="membership-live-panel">
            <div className="mono" style={{ color: "var(--red)" }}>Cara jadi member</div>
            <div className="membership-flow">
              <div><span>01</span><strong>Daftar</strong><p>Buat akun member dari website.</p></div>
              <div><span>02</span><strong>Datang</strong><p>Pesan menu favoritmu seperti biasa.</p></div>
              <div><span>03</span><strong>Nikmati</strong><p>Dapatkan info promo, event, dan benefit lebih dulu.</p></div>
            </div>
          </Reveal>
        </div>

        <div id="membership-benefits" className="membership-tier-grid">
          {memberTiers.map((tier, index) => (
            <Reveal key={tier.name} delay={index * 90} className={`membership-tier-card membership-tier-card--${index}`}>
              <div className="membership-tier-top">
                <span className="mono">{tier.meta}</span>
                <span className="membership-tier-badge">{tier.badge}</span>
              </div>
              <h3>{tier.name}</h3>
              <ul>
                {tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
              </ul>
              <Link href={`${MEMBER_LOGIN_URL}?mode=register`} className="membership-tier-link">
                Daftar tier <ArrowRight size={12} />
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal className="membership-bottom-cta">
          <div>
            <div className="mono" style={{ color: "var(--red)", marginBottom: 8 }}>Untuk pelanggan tetap</div>
            <h3>Datang sekali boleh. Balik lagi lebih enak.</h3>
            <p style={{ marginTop: 12, maxWidth: 620, color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.55 }}>
              Benefit mengikuti promo aktif outlet. Member mendapat info lebih cepat, akses event lebih mudah, dan pengalaman pesan yang lebih praktis.
            </p>
          </div>
          <div className="membership-bottom-actions">
            <Link href={`${MEMBER_LOGIN_URL}?mode=register`} className="btn btn-primary">
              <span>Daftar Member</span><ArrowRight />
            </Link>
            <Link href={DIGITAL_MENU_URL} className="btn">
              <span>Order Dulu</span><ArrowRight />
            </Link>
          </div>
        </Reveal>
      </div>
      <style>{`
        .membership-master {
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(320px, 1.08fr);
          gap: 48px;
          align-items: center;
        }
        .membership-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 28px;
        }
        .membership-live-panel {
          border: 1px solid var(--line);
          background:
            radial-gradient(circle at 18% 18%, rgba(209,26,42,0.18), transparent 34%),
            linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          padding: clamp(22px, 3vw, 36px);
        }
        .membership-flow {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }
        .membership-flow div {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.18);
          padding: 18px;
        }
        .membership-flow span {
          color: var(--red);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
        }
        .membership-flow strong {
          display: block;
          margin-top: 12px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: 28px;
          line-height: 1;
          text-transform: uppercase;
        }
        .membership-flow p {
          margin-top: 12px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.55;
        }
        .membership-tier-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 56px;
        }
        .membership-tier-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border: 1px solid var(--line);
          background: linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018));
          padding: 24px;
          transition: transform 0.32s var(--ease-out), border-color 0.32s var(--ease-out), background 0.32s var(--ease-out);
        }
        .membership-tier-card:hover {
          transform: translateY(-4px);
          border-color: rgba(209,26,42,0.48);
          background: linear-gradient(160deg, rgba(209,26,42,0.09), rgba(255,255,255,0.024));
        }
        .membership-tier-card--1 {
          border-color: rgba(245,167,66,0.32);
        }
        .membership-tier-card--2 {
          border-color: rgba(96,180,232,0.32);
        }
        .membership-tier-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .membership-tier-badge {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          padding: 6px 8px;
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .membership-tier-card h3 {
          margin-top: 24px;
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(36px, 4.4vw, 62px);
          line-height: 0.92;
          text-transform: uppercase;
        }
        .membership-tier-card ul {
          display: grid;
          gap: 10px;
          margin-top: 22px;
          list-style: none;
        }
        .membership-tier-card li {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 10px;
          color: var(--fg-dim);
          font-size: 14px;
          line-height: 1.45;
        }
        .membership-tier-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 24px;
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .membership-bottom-cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          margin-top: 48px;
          border: 1px solid var(--line);
          background: linear-gradient(135deg, rgba(209,26,42,0.08), transparent);
          padding: 28px 32px;
        }
        .membership-bottom-cta h3 {
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(28px, 3.5vw, 44px);
          line-height: 0.95;
          text-transform: uppercase;
        }
        .membership-bottom-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        @media (max-width: 980px) {
          .membership-master,
          .membership-tier-grid {
            grid-template-columns: 1fr;
          }
          .membership-flow {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .membership-actions .btn,
          .membership-bottom-actions,
          .membership-bottom-actions .btn {
            width: 100%;
            justify-content: center;
          }
          .membership-bottom-cta,
          .membership-tier-card,
          .membership-live-panel {
            padding: 20px;
          }
        }
      `}</style>
    </section>
  );
}

function EventRow({ e, i, hover, setHover }) {
  const rsvpUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(`Halo GARAGE, saya mau RSVP event ${e.title} (${e.date} ${e.time}).`)}`;
  const seats = eventSeatInfo(e, i);
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
        <div className="mono" style={{ marginBottom: 6 }}>{seats.available}/{seats.capacity || "-"} SLOT</div>
        <div className="event-seat-meter" data-tone={seats.tone} aria-label={`Slot event tersedia ${seats.available} dari ${seats.capacity || 0}`}>
          <span style={{ width: seats.capacity ? `${Math.max(4, Math.round((seats.available / seats.capacity) * 100))}%` : "0%" }} />
        </div>
        <a href={rsvpUrl} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: hover ? "var(--red)" : "var(--fg-dim)", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          RSVP <ArrowRight size={11} />
        </a>
      </div>
      <style>{`
        .event-seat-meter {
          width: 92px;
          height: 4px;
          margin: 0 0 10px auto;
          overflow: hidden;
          background: rgba(255,255,255,0.1);
        }
        .event-seat-meter span {
          display: block;
          height: 100%;
          background: #0db86c;
        }
        .event-seat-meter[data-tone="busy"] span { background: var(--amber); }
        .event-seat-meter[data-tone="full"] span { background: var(--red); }
        @media (max-width: 900px) {
          .event-row { grid-template-columns: 100px 1fr !important; gap: 16px !important; }
          .event-row .event-desc, .event-row .event-cap { grid-column: 2 / -1 !important; }
          .event-row .event-cap { text-align: left !important; }
          .event-seat-meter { margin-left: 0 !important; }
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
  const biz = useBiz();
  return (
    <section id="location" className="section-pad" style={{ borderTop: "1px solid var(--line)", background: "var(--bg-1)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: "1px solid var(--line)" }} className="loc-grid">
          {/* left — info */}
          <div style={{ padding: 56 }}>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>08 / Temukan kami</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Mampir saja. Kami menunggu." style={{ fontSize: "clamp(40px, 5vw, 76px)" }}>
              <span style={{ display: "block" }}>Mampir saja.</span>
              <span style={{ display: "block" }}>Kami <span style={{ color: "var(--red)" }}>menunggu.</span></span>
            </Reveal>

            <div style={{ marginTop: 48, display: "grid", gap: 28 }}>
              <Reveal delay={400}>
                <InfoBlock label="Alamat" mainline={biz.address} sub="Tebing Tinggi Kota, Sumatera Utara" />
              </Reveal>
              <Reveal delay={500}>
                <InfoBlock label="Jam Buka" mainline={`${biz.hoursOpen} — ${biz.hoursClose}`} sub="Buka setiap hari · Dapur tutup 30 menit sebelum closing" />
              </Reveal>
              <Reveal delay={600}>
                <InfoBlock label="Kontak" mainline={`+${biz.whatsapp}`} sub={biz.email} />
              </Reveal>
              <Reveal delay={700}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                  <a className="btn btn-primary" href={bizWaUrl(biz.whatsapp)}><span>WhatsApp</span><ArrowRight /></a>
                  <a className="btn" href={biz.mapsUrl || MAPS_URL} target="_blank" rel="noreferrer"><span>Buka di Maps</span><ArrowRight /></a>
                </div>
              </Reveal>
            </div>
          </div>

          {/* right — Google Maps embed */}
          <div style={{ position: "relative", minHeight: 520, borderLeft: "1px solid var(--line)" }} className="loc-map">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3982.123456789!2d98.876543!3d3.612345!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMxCU2Ny41ODc0OTk4OTA1NywzLjEyMzQ1NjY5NjE1MDQzIlc.KpABCD"
              width="100%"
              height="100%"
              style={{ border: 0, position: "absolute", inset: 0, filter: "grayscale(80%) contrast(1.2) invert(92%) hue-rotate(180deg)" }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="GARAGE Coffee & Motor Location"
            />
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

function LocalSeoBlock() {
  return (
    <section id="local-seo" className="local-seo-band">
      <div className="shell">
        <Reveal className="local-seo-grid">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>07 / Local SEO</div>
            <h2>GARAGE Coffee & Motor Tebing Tinggi</h2>
            <p>
              Cafe dan coffee shop di Tebing Tinggi untuk ngopi, makan, nongkrong, pesan takeaway, reservasi WhatsApp, ikut event komunitas, dan jadi member GARAGE.
            </p>
          </div>
          <div className="local-seo-list">
            <InfoBlock label="Alamat" mainline="Jl. Mayjen Sutoyo, Rambung" sub="Kec. Tebing Tinggi Kota, Kota Tebing Tinggi, Sumatera Utara 20631" />
            <InfoBlock label="Reservasi" mainline="+62 851 8898 3600" sub="WhatsApp bisnis GARAGE" />
            <InfoBlock label="Akses cepat" mainline="Menu digital & reservasi" sub="Pesan takeaway, cek tempat, dan ikuti progres order" />
          </div>
        </Reveal>
      </div>
      <style>{`
        .local-seo-band {
          border-top: 1px solid var(--line);
          background: linear-gradient(180deg, var(--bg-0), var(--bg-1));
          padding: 72px 0;
        }
        .local-seo-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr);
          gap: 48px;
          align-items: start;
        }
        .local-seo-grid h2 {
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(40px, 6vw, 86px);
          line-height: 0.9;
          text-transform: uppercase;
        }
        .local-seo-grid p {
          margin-top: 22px;
          max-width: 620px;
          color: var(--fg-dim);
          font-size: 16px;
          line-height: 1.7;
        }
        .local-seo-list {
          display: grid;
          gap: 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.025);
          padding: 24px;
        }
        @media (max-width: 860px) {
          .local-seo-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
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
          LIVE GARAGE / TEBING TINGGI
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
          Cek tempat, pilih menu, pesan takeaway, atau reservasi via WhatsApp sebelum datang.
          GARAGE bukan cuma tempat ngopi. Ini tempat pulang untuk obrolan panjang.
        </Reveal>

        <Reveal delay={600} as="div" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 40 }}>
          <button type="button" onClick={requestTablePanelOpen} className="btn btn-primary" style={{ padding: "22px 36px" }}><span>Cek Meja</span><ArrowRight /></button>
          <Link href={DIGITAL_MENU_URL} className="btn" style={{ padding: "22px 36px" }}><span>Order Sekarang</span><ArrowRight /></Link>
          <a href={WHATSAPP_URL} className="btn" style={{ padding: "22px 36px" }}><span>Reservasi WhatsApp</span><ArrowRight /></a>
        </Reveal>

        {/* horizontal text */}
        <div style={{ marginTop: 100, opacity: 0.4 }}>
          <div className="mono">JL. MAYJEN SUTOYO / TEBING TINGGI / 07-23 SETIAP HARI</div>
        </div>
      </div>
    </section>);

}

// ---------------- FOOTER ----------------
function Footer() {
  const biz = useBiz();
  const waUrl = bizWaUrl(biz.whatsapp);
  const mapsUrl = biz.mapsUrl || MAPS_URL;
  const cols = [
  {
    h: "Jelajahi",
    links: [["Live Status", "#live-status"], ["Live Tracking", "#live-tracking-system"], ["Menu", "#menu"], ["Cek Nomor Order", `#${TRACKING_SECTION_ID}`], ["Event", "#events"]]
  },
  {
    h: "Kunjungi",
    links: [["Lokasi", "#location"], ["Jam Buka", "#location"], ["WhatsApp", waUrl], ["Reservasi", waUrl], ["Login Karyawan", LOGIN_URL], ["Login Member", MEMBER_LOGIN_URL]]
  },
  {
    h: "Kontak",
    links: [[biz.email, `mailto:${biz.email}`], ["Order Digital", "/order"], ["Cek Meja", "#live-status"], ["Maps", mapsUrl]]
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
            <p style={{ marginTop: 16, color: "var(--fg-dim)", maxWidth: 420, fontSize: 13, lineHeight: 1.55 }}>
              {biz.address}
            </p>
            <div style={{ marginTop: 24, padding: "14px 18px", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 8, height: 8, background: "#0db86c", borderRadius: "50%", boxShadow: "0 0 0 4px rgba(13,184,108,0.2)" }} />
              <span className="mono" style={{ color: "var(--fg)" }}>BUKA {biz.hoursOpen} · TUTUP {biz.hoursClose}</span>
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


// Section Promo Aktif — tarik produk promo (promoActive) langsung dari DB lewat
// /api/customer/menu. Tampil hanya bila ada promo. Harga promo + harga coret.
const formatRupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

function PromoProducts() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customer/menu", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        const promos = rows
          .filter((it) => it && it.promoActive && Number(it.promoPrice) > 0)
          .map((it) => {
            const base = Array.isArray(it.variants) && it.variants.length
              ? Math.min(...it.variants.map((v) => Number(v.price) || 0))
              : 0;
            return { ...it, basePrice: base };
          })
          .filter((it) => it.basePrice > Number(it.promoPrice));
        setItems(promos);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || items.length === 0) return null;

  return (
    <section id="promo" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-1), var(--bg-0))",
    }}>
      <div className="shell">
        <div style={{ marginBottom: 40 }}>
          <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>
            03 / Promo
          </Reveal>
          <Reveal mask as="h2" delay={100} className="display" aria-label="Promo aktif."
            style={{ fontSize: "clamp(40px, 7vw, 110px)" }}>
            <span style={{ display: "block" }}>Promo</span>
            <span style={{ display: "block", color: "var(--red)" }}>aktif.</span>
          </Reveal>
          <Reveal delay={300} as="p" style={{ marginTop: 16, color: "var(--fg-mute)", maxWidth: 520 }}>
            Harga spesial yang lagi jalan di GARAGE. Datang langsung atau order via WhatsApp selagi promo masih ada.
          </Reveal>
        </div>

        <div style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}>
          {items.map((it, idx) => {
            const off = Math.round(
              ((it.basePrice - Number(it.promoPrice)) / it.basePrice) * 100,
            );
            const waUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
              `Halo GARAGE, saya mau pesan ${it.name} (promo ${formatRupiah(it.promoPrice)}).`,
            )}`;
            return (
              <Reveal key={it.id || idx} delay={idx * 60}>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="promo-card" style={{
                  display: "block",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid var(--line)",
                  background: "var(--bg-2, #18181f)",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "transform .25s, border-color .25s",
                }}>
                  <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#15151b" }}>
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt={it.name} loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : null}
                    <span style={{
                      position: "absolute", top: 10, left: 10,
                      background: "var(--red)", color: "#fff",
                      fontWeight: 900, fontSize: 11, letterSpacing: ".05em",
                      padding: "4px 8px", borderRadius: 6,
                    }}>
                      PROMO{off > 0 ? ` -${off}%` : ""}
                    </span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <p style={{ fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.3 }}>
                      {it.name}
                    </p>
                    <p className="mono" style={{ margin: "4px 0 10px", color: "var(--fg-mute)", fontSize: 11 }}>
                      {it.category}
                    </p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ color: "var(--red)", fontWeight: 800, fontSize: 18 }}>
                        {formatRupiah(it.promoPrice)}
                      </span>
                      <span style={{ color: "var(--fg-mute)", textDecoration: "line-through", fontSize: 13 }}>
                        {formatRupiah(it.basePrice)}
                      </span>
                    </div>
                  </div>
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Section Testimoni (C6) — review ASLI yang diisi owner dari modul Website.
// Tampil hanya bila ada isi (hidden saat kosong).
function Testimonials() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site/testimonials", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const rows = json?.data ?? json;
        if (Array.isArray(rows)) setItems(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!loaded || items.length === 0) return null;
  return (
    <section id="testimoni" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-0), var(--bg-1))",
    }}>
      <div className="shell">
        <div style={{ marginBottom: 40 }}>
          <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Testimoni</Reveal>
          <Reveal mask as="h2" delay={100} className="display" aria-label="Kata mereka."
            style={{ fontSize: "clamp(40px, 7vw, 110px)" }}>
            <span style={{ display: "block" }}>Kata</span>
            <span style={{ display: "block", color: "var(--red)" }}>mereka.</span>
          </Reveal>
        </div>
        <div style={{
          display: "grid", gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        }}>
          {items.map((t, idx) => (
            <Reveal key={idx} delay={idx * 60}>
              <figure style={{
                margin: 0, height: "100%", display: "flex", flexDirection: "column",
                borderRadius: 14, border: "1px solid var(--line)",
                background: "var(--bg-2, #18181f)", padding: 24,
              }}>
                <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ color: i < (t.rating || 5) ? "var(--red)" : "var(--line)", fontSize: 16 }}>★</span>
                  ))}
                </div>
                <blockquote style={{ margin: 0, flex: 1, color: "var(--fg)", fontSize: 15, lineHeight: 1.6 }}>
                  “{t.text}”
                </blockquote>
                <figcaption style={{ marginTop: 16, color: "var(--fg-mute)", fontSize: 13 }}>
                  <strong style={{ color: "#fff" }}>{t.name || "Pelanggan"}</strong>
                  {t.role ? ` · ${t.role}` : ""}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function GarageWebsiteRoot({
  landingHero = null,
  businessInfo = null,
}: {
  landingHero?: SiteAsset | null;
  businessInfo?: {
    tagline?: string;
    whatsapp?: string;
    instagram?: string;
    email?: string;
    address?: string;
    hoursOpen?: string;
    hoursClose?: string;
    mapsUrl?: string;
  } | null;
}) {
  // Info bisnis editable (C10) dengan fallback ke nilai default sekarang → tanpa regresi.
  const biz = {
    whatsapp: businessInfo?.whatsapp || WHATSAPP_PHONE,
    email: businessInfo?.email || BUSINESS_EMAIL,
    address: businessInfo?.address || BUSINESS_ADDRESS,
    hoursOpen: businessInfo?.hoursOpen || "07:00",
    hoursClose: businessInfo?.hoursClose || "23:00",
    instagram: businessInfo?.instagram || "",
    mapsUrl: businessInfo?.mapsUrl || "",
    tagline: businessInfo?.tagline || "Ngopi, makan, nongkrong, dan kumpul komunitas di GARAGE.",
  };

  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: "GARAGE Coffee & Motor",
    description:
      "GARAGE Coffee & Motor Tebing Tinggi. Cafe, coffee shop, tempat nongkrong, menu digital, takeaway, reservasi WhatsApp, membership, dan event komunitas.",
    telephone: `+${biz.whatsapp}`,
    email: biz.email,
    priceRange: "Rp 8K - Rp 100K",
    address: {
      "@type": "PostalAddress",
      streetAddress: biz.address,
      addressLocality: "Tebing Tinggi Kota",
      addressRegion: "Sumatera Utara",
      postalCode: "20631",
      addressCountry: "ID",
    },
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: biz.hoursOpen,
      closes: biz.hoursClose,
    }],
    servesCuisine: ["Coffee", "Indonesian", "Burger", "Kebab"],
    areaServed: "Tebing Tinggi",
  };

  return (
    <BizContext.Provider value={biz}>
    <main id="top" className="garage-website">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />
      <CursorGlow />
      <div className="bg-grain" />
      <div className="bg-vignette" />
      <PromoBar />
      <Nav />
      <Hero landingHero={landingHero} />
      <LiveVisitBoard />
      <LiveTrackingSystem />
      <S3MvpStrip />
      <Menu />
      <PromoProducts />
      <Testimonials />
      <About />
      <Atmosphere landingHero={landingHero} />
      <Experience />
      <MembershipMasterPro />
      <Events />
      <LocalSeoBlock />
      <Location />
      <FinalCTA />
      <Footer />
      <FloatingWA />
    </main>
    </BizContext.Provider>
  );
}

export { GarageWebsiteRoot as GarageWebsite };
