/* eslint-disable */
// @ts-nocheck
"use client";

import Link from "next/link";
import { CUSTOMER_TABLE_STATUS_COPY, TABLE_STATUS_COLORS } from "@/lib/garage-table-status";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteAsset } from "@/lib/site-assets";
import { GARAGE_BRAND_ASSETS, GARAGE_BRAND_LOGO_ASPECT } from "@/lib/garage-brand-assets";
import type { PublicEvent } from "@/lib/event-format";
import { GrandOpeningBanner } from "@/components/garage-website/grand-opening-banner";
import { SuryaShowcase } from "@/components/surya/surya-showcase";
import { SuryaDeveloperCredit } from "@/components/surya/surya-developer-credit";
import {
  Award,
  ChevronDown,
  Coffee,
  Bike,
  Clock,
  ConciergeBell,
  Cookie,
  CreditCard,
  LayoutGrid,
  MessageCircle,
  QrCode,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Timer,
  TrainFront,
  Trees,
  UtensilsCrossed,
  Handshake,
} from "lucide-react";
import { PartnerShowcase } from "@/components/garage-website/partner-showcase";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  GOLD_ANNUAL_SPEND,
  PLATINUM_ANNUAL_SPEND,
  POINT_EARN_AMOUNT,
  memberLevelRules,
} from "@/lib/member-types";
import { GARAGE_LOCATION, formatBusinessHours, formatIdPhone, isOpen24h, openStatus } from "@/lib/garage-location";
const WHATSAPP_PHONE = GARAGE_LOCATION.phone;
const BUSINESS_EMAIL = "garagetebingtinggi@gmail.com";
const BUSINESS_ADDRESS = GARAGE_LOCATION.address;
const WHATSAPP_DEFAULT_MESSAGE = "Halo GARAGE, saya lihat status meja di website. Saya mau reservasi/order.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(WHATSAPP_DEFAULT_MESSAGE)}`;
const MAPS_URL = GARAGE_LOCATION.mapsUrl;
const DEFAULT_HOURS_OPEN = "15:00";
const DEFAULT_HOURS_CLOSE = "23:00";
// Label jam ringkas: "24 JAM" bila buka 24 jam, selain itu "HH:MM–HH:MM".
// Baris jalan dari alamat lengkap: "Jl. Mayjen Sutoyo, Rambung, Kec. …" → "Jl. Mayjen Sutoyo, Rambung".
const streetLine = (address) => String(address || BUSINESS_ADDRESS).split(",").slice(0, 2).join(",").trim();
const hoursShort = (biz) =>
  isOpen24h(biz.hoursOpen, biz.hoursClose) ? "24 JAM" : `${biz.hoursOpen.replace(":", ".")}–${biz.hoursClose.replace(":", ".")}`;

// Link Maps selalu ke profil bisnis resmi (Place ID), tidak memakai mapsUrl dari DB —
// URL tempelan manual sering hanya membuka pin/pencarian, bukan profil Google.
// Info bisnis editable (C10) lewat context — default = konstanta hardcoded di atas
// supaya komponen yang belum di-wire tetap aman & tanpa regresi.
const BizContext = React.createContext(null);
const useBiz = () => {
  const ctx = React.useContext(BizContext);
  return {
    whatsapp: ctx?.whatsapp || WHATSAPP_PHONE,
    email: ctx?.email || BUSINESS_EMAIL,
    address: ctx?.address || BUSINESS_ADDRESS,
    hoursOpen: ctx?.hoursOpen || DEFAULT_HOURS_OPEN,
    hoursClose: ctx?.hoursClose || DEFAULT_HOURS_CLOSE,
    instagram: ctx?.instagram || "",
    mapsUrl: ctx?.mapsUrl || "",
    aboutText: ctx?.aboutText || "",
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
const BRAND_LOGO_URL = GARAGE_BRAND_ASSETS.wordmark;
const BRAND_LOGO_ASPECT = GARAGE_BRAND_LOGO_ASPECT;
const SOCIAL_LINKS = [
  {
    id: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@GarageId",
    handle: "@GarageId",
    proof: "Video suasana & menu",
    description: "Lihat suasana GARAGE, menu favorit, dan cerita komunitas dalam format video.",
    cta: "Tonton di YouTube",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/garage_tbt.id/",
    handle: "@garage_tbt.id",
    proof: "Foto menu, story, promo",
    description: "Cek foto menu, promo aktif, story harian, dan vibe tempat sebelum datang.",
    cta: "Follow Instagram",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@garage_tbt.id",
    handle: "@garage_tbt.id",
    proof: "Short video & vibe harian",
    description: "Tonton video pendek tentang menu, suasana malam, dan momen customer GARAGE.",
    cta: "Follow TikTok",
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/garagetbt.id/",
    handle: "garagetbt.id",
    proof: "Update komunitas & info",
    description: "Ikuti update komunitas, info event, dan pengumuman GARAGE Tebing Tinggi.",
    cta: "Ikuti Facebook",
  },
];
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
// Versi string (untuk <a> biasa) dengan campaign per-section agar sumber order terlacak.
const digitalMenuItemHref = (itemName, campaign = "landing_menu") =>
  `/order?${new URLSearchParams({ source: "qr_takeaway", campaign, q: itemName }).toString()}`;
const reservationWhatsAppUrl = (tableLabel, phone = WHATSAPP_PHONE) => {
  const message = tableLabel
    ? `Halo GARAGE, saya mau reservasi ${tableLabel}. Mohon info ketersediaan jamnya.`
    : WHATSAPP_DEFAULT_MESSAGE;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
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
  // Status & warna sama dengan menu digital (PDF owner): Kosong hijau, Sedang
  // dipilih kuning, Terisi merah, Reserved biru, Perlu dibersihkan abu-abu.
  if (row.customerStatus && CUSTOMER_TABLE_STATUS_COPY[row.customerStatus]) {
    return {
      label: CUSTOMER_TABLE_STATUS_COPY[row.customerStatus].label,
      tone: row.customerStatus === "available" ? "ready" : "full",
      color: TABLE_STATUS_COLORS[row.customerStatus].dot,
    };
  }
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

// Bar pesan bawah khusus HP (≤700px). Label tombol utama mengikuti kondisi live
// outlet: saat meja penuh/padat mengarahkan ke takeaway, saat longgar ke pesan
// dari meja. Data dari /api/site/live-visit, di-refresh 30 dtk HANYA di HP.
function MobileOrderBar() {
  const biz = useBiz();
  const [tone, setTone] = useState("calm");

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 700px)").matches) return;
    let cancelled = false;
    const load = async () => {
      try {
        const live = await getPublicLiveVisit();
        const rows = live.tables ?? [];
        const available = rows.filter((row) => row.available).length;
        const rec = liveVisitRecommendation(rows.length, available, live.orderPulse?.active ?? 0);
        if (!cancelled) setTone(rec.tone);
      } catch {
        // Tetap tampil dengan label default bila data live gagal dimuat.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const busy = tone === "full" || tone === "busy";
  const href = busy
    ? `/order?${new URLSearchParams({ source: "qr_takeaway", campaign: "mobile_bar_takeaway" }).toString()}`
    : `/order?${new URLSearchParams({ source: "qr_takeaway", campaign: "mobile_bar" }).toString()}`;

  return (
    <div className="mobile-order-bar" role="navigation" aria-label="Pesan cepat">
      <a href={href} className="mob-order-primary">
        <span>
          {busy ? "Meja Penuh? Pesan Takeaway" : "Menu & Pesan"}
          <small>{busy ? "Ambil tanpa antre" : "Pesan dari meja atau takeaway"}</small>
        </span>
        <ArrowRight size={16} />
      </a>
      <a
        href={bizWaUrl(biz.whatsapp)}
        target="_blank"
        rel="noopener noreferrer"
        className="mob-order-wa"
        aria-label="Chat WhatsApp GARAGE"
      >
        WA
      </a>
    </div>
  );
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
        alt="Garage Coffee Tebing Tinggi"
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

// ---------------- LOADER ----------------
// ---------------- NAV ----------------
const MEGA_CATS = [
{ Icon: Coffee, name: "Kopi Susu", desc: "Spanish Latte · Caramel Macchiato · Gula Aren · Biscoff", count: "Coffee" },
{ Icon: Snowflake, name: "Americano", desc: "Americano · Peach · Berry · Cranberry · Pongah", count: "Coffee" },
{ Icon: Sparkles, name: "Milk Series", desc: "Matcha · Coklat · Strawberry Milk · Choco Cloud", count: "Non-Coffee" },
{ Icon: Sparkles, name: "Tea Series", desc: "Lychee Tea · Lemon Tea · Peach Tea · Ice Tea", count: "Non-Coffee" },
{ Icon: UtensilsCrossed, name: "Makanan", desc: "Menu makan untuk nongkrong lama", count: "Dapur" },
{ Icon: Cookie, name: "Cemilan", desc: "Teman ngopi & sharing bareng", count: "Dapur" }];


function EventBadge() {
  // GARAGE EVENT PLATFORM: badge kecil dari /event/api/events; gagal -> disembunyikan.
  const [badge, setBadge] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/event/api/events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.events) ? d.events : [];
        const ev = list.find((e) => e.online) ?? list[0];
        if (!alive || !ev) return;
        if (ev.live) return setBadge("LIVE");
        const dt = ev.date ? new Date(ev.date) : null;
        const label = dt && !Number.isNaN(dt.getTime())
          ? dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).replace(".", "").toUpperCase()
          : "";
        setBadge(label ? `GIGS · ${label}` : "GIGS");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!badge) return null;
  return (
    <span
      className="mono"
      style={{ marginLeft: 6, padding: "2px 6px", fontSize: 9, lineHeight: 1.4, letterSpacing: "0.06em", background: "var(--red)", color: "#fff", borderRadius: 999, whiteSpace: "nowrap" }}
    >
      {badge}
    </span>
  );
}

function Nav() {
  const y = useScrollY();
  const biz = useBiz();
  const condensed = y > 80;
  // Desktop: 5 tujuan utama saja agar nav tidak sesak. Halaman sekunder
  // (Franchise, Karier) ada di drawer HP & footer.
  const items = [
  ["Menu", "#menu", true],
  ["Live Outlet", "#live-status"],
  ["Member", "#membership"],
  ["Event", "/event", false, true],
  ["Lokasi", "#location"]];
  const mobileItems = [
  ...items,
  ["Cara Pesan", "#cara-pesan"],
  ["Lacak Pesanan", "#tracking-order"],
  ["Produk Mitra", "#mitra"],
  ["Jadi Mitra", "/mitra"],
  ["Franchise", "/franchise"],
  ["Karier", "/recruitment"]];

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
        data-condensed={condensed ? "true" : "false"}
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
            {items.map(([label, href, hasMega, isEvent]) =>
            <li
              key={href}
              onMouseEnter={hasMega ? openMega : undefined}
              onMouseLeave={hasMega ? closeMega : undefined}
              style={{ position: "relative" }}>
              
                {href.startsWith("/") && !href.startsWith("/event") ? (
                  <Link href={href} className="navlink">
                    <span>{label}</span>
                  </Link>
                ) : (
                  <a href={href} className="navlink">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}{hasMega && <ChevronDown size={13} aria-hidden="true" style={{ opacity: 0.75 }} />}{isEvent && <EventBadge />}</span>
                  </a>
                )}
              </li>
            )}
          </ul>

          <div
            className="site-nav-status"
            aria-label="Garage outlet status"
            data-open={openStatus(biz.hoursOpen, biz.hoursClose).isOpen ? "true" : "false"}
            suppressHydrationWarning
          >
            <span />
            <strong suppressHydrationWarning>{openStatus(biz.hoursOpen, biz.hoursClose).isOpen ? "OPEN" : "TUTUP"}</strong>
            <em>{hoursShort(biz)}</em>
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
                className="btn"
                style={{ padding: "9px 12px", fontSize: 10 }}
              >
                <span>Login</span><ChevronDown size={13} aria-hidden="true" style={{ opacity: 0.8, transform: loginOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
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
              <span>Pesan</span><ArrowRight size={12} />
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
              <span className="mono" style={{ color: "var(--red)" }}>MENU GARAGE · COFFEE · NON-COFFEE · MAKANAN</span>
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
                    <c.Icon size={22} color="var(--red)" strokeWidth={1.75} aria-hidden="true" />
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
          {mobileItems.map(([label, href], i) =>
          <li key={href}>
              {href.startsWith("/") && !href.startsWith("/event") ? (
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
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
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
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
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
                          style={copy.color ? { background: copy.color, boxShadow: `0 0 10px ${copy.color}` } : undefined}
                          aria-hidden="true"
                        />
                      </span>
                      <strong className="garage-table-number">{row.tableNumber}</strong>
                      <span className="garage-table-state">
                        <i
                          className="garage-table-indicator"
                          data-state={availability}
                          style={copy.color ? { background: copy.color } : undefined}
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
                href={reservationWhatsAppUrl(selectedTable?.tableLabel, biz.whatsapp)}
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
        /* Menu tidak boleh menyusut lebih kecil dari teksnya — dulu saat navbar
           mengecil ke 980px (scroll), "RECRUITMENT"/"LOKASI" dkk saling tumpuk. */
        .nav-desktop li {
          flex-shrink: 0;
        }
        /* Mode ringkas (setelah scroll): lepas status jam buka & tahun berdiri
           supaya menu + tombol tetap muat di navbar 980px. */
        .site-nav[data-condensed="true"] .site-nav-status,
        .site-nav[data-condensed="true"] .brand-year,
        .site-nav[data-condensed="true"] .brand-divider {
          display: none !important;
        }
        .site-nav-status {
          position: relative;
          z-index: 1;
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(228,228,231,0.28);
          background: rgba(228,228,231,0.08);
          padding: 0 10px;
          color: #e4e4e7;
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
          background: #e4e4e7;
          box-shadow: 0 0 0 4px rgba(228,228,231,0.16), 0 0 18px rgba(228,228,231,0.44);
        }
        .site-nav-status em {
          color: rgba(228,228,231,0.66);
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
          background: #e4e4e7;
          box-shadow:
            0 0 0 1px rgba(228,228,231,0.36),
            0 0 16px rgba(228,228,231,0.3);
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
          background: rgba(228,228,231,0.08);
          border-color: rgba(228,228,231,0.34);
        }
        .garage-table-card[data-available="true"] .garage-table-state {
          border-color: rgba(228,228,231,0.38);
          color: #d4d4d8;
        }
        .garage-table-card[data-available="true"] .garage-table-number {
          color: #fafafa;
        }
        .garage-table-card[data-available="true"]:hover,
        .garage-table-card[data-selected="true"] {
          background: rgba(228,228,231,0.14);
          border-color: rgba(228,228,231,0.74);
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
              0 0 0 1px rgba(228,228,231,0.26),
              0 0 10px rgba(228,228,231,0.2);
          }
          50% {
            opacity: 1;
            transform: scale(1.14);
            box-shadow:
              0 0 0 3px rgba(228,228,231,0.18),
              0 0 20px rgba(228,228,231,0.36);
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
  const biz = useBiz();
  const hoursLabel = hoursShort(biz);
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
              GARAGE COFFEE · TEBING TINGGI · EST. 2026
            </Reveal>
            <Reveal as="div" className="mono" delay={1000} style={{ textAlign: "right" }}>
              {`${biz.address.split(",")[0].toUpperCase()} / BUKA ${hoursLabel}`}
            </Reveal>
          </div>

          <div className="hero-image-layout">
            <Reveal delay={240} className="hero-image-copy">
              <div className="hero-kicker mono">GARAGE COFFEE · TEBING TINGGI</div>
              <div className="garage-steam-wrap" aria-hidden>
                <span className="garage-steam garage-steam-1" />
                <span className="garage-steam garage-steam-2" />
                <span className="garage-steam garage-steam-3" />
              </div>
              <h1 className="display hero-image-title" aria-label="Garage Coffee Tebing Tinggi — lebih dari sekedar kopi.">
                <span className="gw-sr-only">Garage Coffee Tebing Tinggi — </span>
                <span className="hero-title-line hero-title-top">LEBIH DARI</span>
                {/* Baris kedua = gambar transparan dari font Anton yang sama (perak + "A" merah terpisah agar kilaunya tetap
                    berdenyut). Huruf "S" Anton digambar rusak oleh background-clip:text, jadi tidak dipakai di baris ini. */}
                <span className="hero-title-line hero-title-bottom hero-title-stack">
                  <span className="gw-sr-only">SEKEDAR KOPI.</span>
                  <img className="hero-title-img" src="/garage-brand/hero-title/sekedar-kopi-silver.webp" alt="" aria-hidden="true" width={1948} height={332} decoding="async" fetchPriority="high" />
                  <img className="hero-title-img hero-title-img-a" src="/garage-brand/hero-title/sekedar-kopi-a-red.webp" alt="" aria-hidden="true" width={1948} height={332} decoding="async" />
                </span>
              </h1>
              <p className="hero-image-lead">
                Ngopi, makan, dan nongkrong di GARAGE sekarang lebih gampang. Cek tempat sebelum datang, pesan dari website, lalu ambil atau duduk santai.
              </p>
              <div className="hero-image-actions">
                <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Pesan Sekarang</span><ArrowRight /></Link>
                <button type="button" onClick={requestTablePanelOpen} className="btn"><span>Cek Meja Kosong</span><ArrowRight /></button>
                <a href="#mitra" className="btn hero-partner-tab"><Handshake aria-hidden /><span>Mitra</span></a>
              </div>
            </Reveal>
          </div>

          <Reveal delay={760} className="hero-image-stats">
            <Stat n={hoursLabel} l="Buka setiap hari" />
            <Stat n="QR" l="Pesan dari meja" />
            <Stat n={GARAGE_LOCATION.rating.toFixed(1)} l={`Google · ${GARAGE_LOCATION.reviewCount} ulasan`} />
          </Reveal>
        </div>

        <Reveal delay={940} className="marquee" style={{ marginTop: 0 }}>
          <div className="marquee-track">
            {Array.from({ length: 4 }).flatMap((_, k) => [
            <span key={`a${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>NGOPI & MAKAN</span>,
            <span key={`b${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
            <span key={`c${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>PESAN VIA QR</span>,
            <span key={`d${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
            <span key={`e${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>GARAGE SPESIAL</span>,
            <span key={`f${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
            <span key={`g${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>TEBING TINGGI</span>,
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
          /* Judul baris kedua = gambar (lihat catatan di JSX); lebar mengikuti font-size baris (em). */
          .hero-title-stack {
            display: grid;
            width: 5.41em;
            max-width: 100%;
            background: none;
            -webkit-background-clip: border-box;
            background-clip: border-box;
            color: inherit;
          }
          .hero-title-stack > * { grid-area: 1 / 1; }
          .hero-title-img { display: block; width: 100%; height: auto; user-select: none; pointer-events: none; }
          .hero-title-img-a {
            filter: drop-shadow(0 0 18px rgba(209,26,42,0.42));
            animation: garageRedA 2.6s ease-in-out infinite;
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
            ● GARAGE COFFEE · TEBING TINGGI · EST. 2026
          </Reveal>
          <Reveal as="div" className="mono" delay={1300} style={{ textAlign: "right" }}>
            {`${biz.address.split(",")[0].toUpperCase()} / BUKA ${hoursLabel}`}
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
          <Reveal mask delay={400} as="h1" className="display hero-title" aria-label="Garage Coffee Tebing Tinggi — lebih dari sekedar kopi."
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
              Kopi, makanan, dan tempat nongkrong bernuansa garasi industrial — untuk mereka yang betah duduk
              lama setelah seruputan terakhir.
            </p>
          </Reveal>

          <Reveal delay={1100} className="hero-bottom-mid">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Pesan Sekarang</span><ArrowRight /></Link>
              <button type="button" onClick={requestTablePanelOpen} className="btn"><span>Cek Meja Kosong</span><ArrowRight /></button>
              <a href="#mitra" className="btn hero-partner-tab"><Handshake aria-hidden /><span>Mitra</span></a>
            </div>
          </Reveal>

          <Reveal delay={1300} className="hero-bottom-right" style={{ textAlign: "right" }}>
            <div className="eyebrow" style={{ marginBottom: 18, justifyContent: "flex-end" }}>Sedang diseduh</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, flexWrap: "wrap" }}>
              <Stat n={hoursLabel} l="Buka setiap hari" />
              <Stat n="QR" l="Pesan dari meja" />
              <Stat n={GARAGE_LOCATION.rating.toFixed(1)} l={`Google · ${GARAGE_LOCATION.reviewCount} ulasan`} />
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
          <span key={`a${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>NGOPI & MAKAN</span>,
          <span key={`b${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
          <span key={`c${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>PESAN VIA QR</span>,
          <span key={`d${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
          <span key={`e${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>GARAGE SPESIAL</span>,
          <span key={`f${k}`} style={{ fontSize: 28, color: "var(--red)" }}>✶</span>,
          <span key={`g${k}`} className="display" style={{ fontSize: 36, color: "var(--silver)" }}>TEBING TINGGI</span>,
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
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Sebelum datang</Reveal>
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
              <Link href={DIGITAL_MENU_URL} className="btn btn-primary"><span>Pesan Sekarang</span><ArrowRight /></Link>
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
                <Link href={DIGITAL_MENU_URL}>Pesan Sekarang</Link>
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
          background: #e4e4e7;
          box-shadow: 0 0 0 8px rgba(228,228,231,0.12), 0 0 32px rgba(228,228,231,0.36);
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
          border-color: rgba(228,228,231,0.52);
          background: rgba(228,228,231,0.11);
          color: #f4f4f5;
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
        .live-legend i[data-state="ready"] { background: #e4e4e7; }
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

// ---------------- CARA PESAN & TEKNOLOGI ----------------
// Marketing: semua cara pesan yang benar-benar didukung sistem (QR meja, takeaway
// online, waiter, WhatsApp) + teknologi pendukungnya (status meja, lacak pesanan,
// pembayaran, poin member).
function HowToOrder() {
  const biz = useBiz();
  const ways = [
    {
      Icon: QrCode,
      step: "Dine-in",
      title: "Scan QR di meja",
      body: "Duduk, scan QR di mejamu, pilih menu. Pesanan langsung masuk ke kasir, bar, dan dapur — tanpa antre.",
      cta: { label: "Cek meja kosong", onClick: requestTablePanelOpen },
    },
    {
      Icon: ShoppingBag,
      step: "Takeaway",
      title: "Pesan online, ambil sendiri",
      body: "Pesan dari HP sebelum berangkat. Pantau statusnya, datang saat pesanan siap diambil.",
      cta: { label: "Pesan takeaway", href: DIGITAL_MENU_URL },
    },
    {
      Icon: ConciergeBell,
      step: "Dibantu",
      title: "Pesan lewat waiter",
      body: "Tidak mau repot? Panggil waiter — pesananmu dicatat di tablet dan langsung terkirim ke kasir.",
    },
    {
      Icon: MessageCircle,
      step: "Rombongan",
      title: "Reservasi via WhatsApp",
      body: "Datang rame-rame atau mau bikin acara? Kabari jumlah orang & jam datang, kami siapkan tempatnya.",
      cta: {
        label: "Chat WhatsApp",
        href: bizWaUrl(biz.whatsapp, "Halo GARAGE, saya mau reservasi meja. Mohon info ketersediaannya."),
        external: true,
      },
    },
  ];
  const tech = [
    { Icon: LayoutGrid, title: "Status meja live", body: "Lihat meja kosong sebelum berangkat.", href: "#live-status" },
    { Icon: Timer, title: "Lacak pesanan", body: "Antre, diracik, siap — terpantau dari HP.", href: "#tracking-order" },
    { Icon: CreditCard, title: "Tunai · QRIS · Transfer", body: "Bayar dengan cara yang kamu suka." },
    { Icon: Award, title: "Poin member otomatis", body: "Tiap belanja jadi poin & naik level.", href: "#membership" },
  ];

  return (
    <section id="cara-pesan" className="section-pad how-order" aria-labelledby="cara-pesan-title">
      <div className="shell">
        <div className="how-order-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Cara pesan</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Pesan tanpa antre." style={{ fontSize: "clamp(44px, 7vw, 112px)" }}>
              <span id="cara-pesan-title" style={{ display: "block" }}>Pesan</span>
              <span style={{ display: "block", color: "var(--red)" }}>tanpa antre.</span>
            </Reveal>
          </div>
          <Reveal delay={300} as="p" className="how-order-lead">
            GARAGE memakai sistem pemesanan digital sendiri: dari meja, dari rumah, atau lewat waiter —
            semua pesanan masuk ke satu antrean yang sama di kasir, bar, dan dapur.
          </Reveal>
        </div>

        <ol className="how-order-grid">
          {ways.map((way, index) => (
            <Reveal as="li" key={way.title} delay={index * 80} className="how-order-card">
              <div className="how-order-card-top">
                <span className="how-order-icon"><way.Icon size={22} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="mono">{String(index + 1).padStart(2, "0")} · {way.step}</span>
              </div>
              <h3>{way.title}</h3>
              <p>{way.body}</p>
              {way.cta ? (
                way.cta.onClick ? (
                  <button type="button" className="how-order-link" onClick={way.cta.onClick}>
                    {way.cta.label} <ArrowRight size={12} />
                  </button>
                ) : way.cta.external ? (
                  <a className="how-order-link" href={way.cta.href} target="_blank" rel="noopener noreferrer">
                    {way.cta.label} <ArrowRight size={12} />
                  </a>
                ) : (
                  <Link className="how-order-link" href={way.cta.href}>
                    {way.cta.label} <ArrowRight size={12} />
                  </Link>
                )
              ) : null}
            </Reveal>
          ))}
        </ol>

        <Reveal className="how-order-tech" aria-label="Teknologi GARAGE">
          <div className="how-order-tech-label mono">Teknologi GARAGE</div>
          <ul>
            {tech.map((item) => {
              const body = (
                <>
                  <item.Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                  </span>
                </>
              );
              return (
                <li key={item.title}>
                  {item.href ? <a href={item.href}>{body}</a> : <div>{body}</div>}
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
      <style>{`
        .how-order {
          border-top: 1px solid var(--line);
          background:
            radial-gradient(circle at 12% 0%, rgba(209,26,42,0.12), transparent 34%),
            linear-gradient(180deg, var(--bg-1), var(--bg-0));
        }
        .how-order-head {
          display: flex; justify-content: space-between; align-items: end;
          gap: 24px 48px; flex-wrap: wrap; margin-bottom: 48px;
        }
        .how-order-lead { max-width: 440px; color: var(--fg-dim); font-size: 16px; line-height: 1.65; }
        .how-order-grid {
          list-style: none; margin: 0; padding: 0;
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;
        }
        .how-order-card {
          display: flex; flex-direction: column; gap: 12px; height: 100%;
          padding: 24px; border: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015));
          transition: border-color 0.25s var(--ease-out), transform 0.25s var(--ease-out);
        }
        .how-order-card:hover { border-color: rgba(209,26,42,0.6); transform: translateY(-3px); }
        .how-order-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .how-order-card-top .mono { color: var(--amber, #f5a742); }
        .how-order-icon {
          display: inline-grid; place-items: center; width: 44px; height: 44px;
          border: 1px solid rgba(209,26,42,0.5); background: rgba(209,26,42,0.12); color: #ff5a6a;
        }
        .how-order-card h3 {
          font-family: var(--font-display); font-size: 26px; line-height: 1;
          letter-spacing: 0.02em; text-transform: uppercase; color: var(--fg);
        }
        .how-order-card p { color: var(--fg-dim); font-size: 14px; line-height: 1.6; flex: 1; }
        .how-order .how-order-link {
          align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
          min-height: 44px; padding: 0; background: none; border: 0; cursor: pointer;
          color: var(--fg); font-family: var(--font-mono); font-size: 12px;
          letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none;
          border-bottom: 1px solid var(--red);
        }
        .how-order .how-order-link:hover { color: #ff5a6a; }
        .how-order-tech {
          margin-top: 16px; border: 1px solid var(--line); background: rgba(10,10,12,0.6);
          display: grid; grid-template-columns: auto 1fr; align-items: stretch;
        }
        .how-order-tech-label {
          display: flex; align-items: center; padding: 18px 22px;
          border-right: 1px solid var(--line); color: var(--red); white-space: nowrap;
        }
        .how-order-tech ul {
          list-style: none; margin: 0; padding: 0;
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .how-order-tech li + li { border-left: 1px solid var(--line); }
        .how-order-tech li > a, .how-order-tech li > div {
          display: flex; align-items: flex-start; gap: 10px; padding: 16px 18px; height: 100%;
          color: var(--silver, #d4d4d8); text-decoration: none;
        }
        .how-order-tech li > a:hover { background: rgba(209,26,42,0.08); }
        .how-order-tech strong { display: block; color: var(--fg); font-size: 14px; line-height: 1.3; }
        .how-order-tech small { display: block; color: var(--fg-dim); font-size: 12px; line-height: 1.45; margin-top: 2px; }
        @media (max-width: 1100px) {
          .how-order-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .how-order-tech { grid-template-columns: 1fr; }
          .how-order-tech-label { border-right: 0; border-bottom: 1px solid var(--line); }
          .how-order-tech ul { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .how-order-tech li:nth-child(3) { border-left: 0; }
          .how-order-tech li:nth-child(n+3) { border-top: 1px solid var(--line); }
        }
        @media (max-width: 600px) {
          .how-order-grid { grid-template-columns: 1fr; }
          .how-order-tech ul { grid-template-columns: 1fr; }
          .how-order-tech li + li { border-left: 0; border-top: 1px solid var(--line); }
        }
        @media (prefers-reduced-motion: reduce) {
          .how-order-card { transition: none; }
          .how-order-card:hover { transform: none; }
        }
      `}</style>
    </section>
  );
}

// ---------------- PROMO BAR ----------------
function PromoBar() {
  const [closed, setClosed] = useState(false);
  const biz = useBiz();
  if (closed) return null;
  const status = openStatus(biz.hoursOpen, biz.hoursClose);
  const promoMessages = [
    status.isOpen ? `BUKA SEKARANG · ${hoursShort(biz)} WIB` : `BUKA SETIAP HARI ${hoursShort(biz)} WIB`,
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
        background: "#ffffff",
        border: "2px solid #25D366",
        animation: "waPulse 2s ease-in-out infinite"
      }} />
      <style>{`
        @keyframes waPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(228,228,231,0.6); }
          50% { box-shadow: 0 0 0 10px rgba(228,228,231,0); }
        }
      `}</style>
    </a>);

}



// Source: garage-website/project/menu.jsx

const MENU = {
  "Coffee": {
    eyebrow: "Bar utama",
    summary: "Kopi susu, Americano series, dan klasik — dari Americano sampai Spanish Latte & Caramel Macchiato.",
    pricingHeader: ["Cold", "Hot"],
    groups: [{
      items: [
        { name: "Americano",              prices: ["15", "14"], badge: "Terlaris" },
        { name: "Cappuccino",             prices: ["25", "23"], badge: "Terlaris" },
        { name: "Latte",                  prices: ["20", "18"], badge: "Terlaris" },
        { name: "Sanger",                 prices: ["16", "15"], badge: "Klasik" },
        { name: "Coklat Latte",           prices: ["22", "20"] },
        { name: "Matcha Latte",           prices: ["22", "20"] },
        { name: "Red Velvet Latte",       prices: ["22", "20"] },
        { name: "Spanish Latte",          prices: ["26", "—"], badge: "Rekomendasi" },
        { name: "Caramel Macchiato",      prices: ["28", "—"], badge: "Signature" },
        { name: "Butterscotch Sea Salt",  prices: ["28", "—"] },
        { name: "Creamy Nutty",           prices: ["28", "—"] },
        { name: "Biscoffe",               prices: ["28", "—"], badge: "Baru" },
        { name: "Dirty Blanc",            prices: ["26", "—"] },
        { name: "Choco Cloud",            prices: ["26", "—"] },
        { name: "Mocha Peanut",           prices: ["25", "—"] },
        { name: "Matcha Strawberry",      prices: ["25", "—"] },
        { name: "Matcha Butterscotch",    prices: ["25", "—"] },
        { name: "Hazelnut Latte",         prices: ["23", "—"] },
        { name: "Vanilla Latte",          prices: ["23", "—"] },
        { name: "Caramel Latte",          prices: ["23", "—"] },
        { name: "Dirty Latte",            prices: ["23", "—"] },
        { name: "Mont Blanc",             prices: ["23", "—"] },
        { name: "Palm Sugar",             prices: ["23", "—"] },
        { name: "Double Peach Americano", prices: ["23", "—"] },
        { name: "Americano Berry",        prices: ["23", "—"] },
        { name: "Americano Pongah",       prices: ["23", "—"] },
        { name: "Americano Cranberry",    prices: ["23", "—"] },
        { name: "Taro Latte",             prices: ["20", "—"], badge: "Lokal" },
        { name: "Strawberry Milk",        prices: ["20", "—"] },
        { name: "Lecy Tea",               prices: ["15", "—"] },
      ]
    }],
  },
};

// ---------------- MENU SECTION ----------------
// Satu fetch menu live dipakai bersama semua section (Menu, Unggulan, Galeri)
// agar harga & nama di website selalu sama dengan menu digital/POS.
let liveMenuPromise = null;
function fetchLiveMenu() {
  if (!liveMenuPromise) {
    liveMenuPromise = fetch("/api/customer/menu", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const rows = json?.data ?? json;
        return Array.isArray(rows) ? rows : [];
      })
      .catch(() => {
        liveMenuPromise = null;
        return [];
      });
  }
  return liveMenuPromise;
}
function useLiveMenu() {
  const [state, setState] = useState({ rows: [], loaded: false });
  useEffect(() => {
    let cancelled = false;
    fetchLiveMenu().then((rows) => {
      if (!cancelled) setState({ rows, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
const LIVE_MENU_ORDER = ["Coffee", "Non-Coffee", "Makanan", "Cemilan"];
const LIVE_MENU_EYEBROW = { Coffee: "Bar · Kopi", "Non-Coffee": "Bar · Non-Kopi", Makanan: "Dapur", Cemilan: "Dapur · Cemilan" };
const liveItemPrice = (item) => {
  const prices = (item.variants || []).map((v) => Number(v.price) || 0).filter((v) => v > 0);
  const base = prices.length ? Math.min(...prices) : 0;
  return item.promoActive && Number(item.promoPrice) > 0 ? Math.min(base || Infinity, Number(item.promoPrice)) : base;
};
const formatRupiahK = (value) =>
  value >= 1000 ? `Rp ${Math.round(value / 100) / 10}K`.replace(".", ",") : `Rp ${value}`;
const liveItemBadge = (item) => {
  if (item.promoActive) return "Promo";
  const tag = (item.tags || []).find((t) => /bestseller|terlaris|unggulan|signature|favorit|baru/i.test(String(t)));
  if (tag) return String(tag);
  return item.featured ? "Unggulan" : null;
};
// Ubah baris menu live → struktur MENU (kategori → item) yang dipakai section Menu.
function liveMenuToCategories(rows) {
  const byCat = new Map();
  for (const item of rows) {
    if (!item?.name || item.stock === "sold_out") continue;
    const price = liveItemPrice(item);
    if (!price) continue;
    const list = byCat.get(item.category) || [];
    list.push({
      name: item.name,
      priceLabel: formatRupiahK(price),
      price,
      badge: liveItemBadge(item),
      featured: Boolean(item.featured),
      sub: item.section || null,
    });
    byCat.set(item.category, list);
  }
  const ordered = [...byCat.keys()].sort(
    (a, b) => (LIVE_MENU_ORDER.indexOf(a) + 99) % 99 - (LIVE_MENU_ORDER.indexOf(b) + 99) % 99
  );
  const result = {};
  for (const cat of ordered) {
    const items = byCat.get(cat);
    const minPrice = Math.min(...items.map((it) => it.price));
    result[cat] = {
      eyebrow: LIVE_MENU_EYEBROW[cat] || cat,
      summary: `${items.length} pilihan ${cat.toLowerCase()} — mulai ${formatRupiahK(minPrice)}.`,
      groups: [{ items: items.map(({ sub, ...it }) => ({ ...it, groupSub: sub })) }],
      minPrice,
    };
  }
  return result;
}
function menuSpotlightItems(data) {
  const allItems = data.groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupLabel: item.groupSub ?? group.sub ?? data.eyebrow,
    }))
  );
  const priority = ["Promo", "Unggulan", "Bestseller", "Signature", "Terlaris", "Rekomendasi", "Manual Brew", "Komplit", "Baru", "Klasik", "Lokal"];
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
  if (item.priceLabel) return item.priceLabel;
  const firstAvailable = item.prices.find((price) => price && price !== "—" && price !== "â€”");
  return firstAvailable ? `Rp ${firstAvailable}K` : "Cek menu";
}

function Menu() {
  const biz = useBiz();
  const hoursLabel = hoursShort(biz);
  const { rows: liveRows } = useLiveMenu();
  // Menu live dari database bila tersedia; data statis hanya cadangan offline.
  const source = useMemo(() => {
    const live = liveMenuToCategories(liveRows);
    return Object.keys(live).length ? live : MENU;
  }, [liveRows]);
  const cats = Object.keys(source);
  const [pickedCat, setCat] = useState(null);
  const cat = pickedCat && source[pickedCat] ? pickedCat : cats[0];
  const data = source[cat];
  const spotlightItems = menuSpotlightItems(data);
  const totalItems = data.groups.reduce((sum, group) => sum + group.items.length, 0);
  const allMinPrices = Object.values(source).map((c) => c.minPrice).filter(Boolean);
  const startFrom = allMinPrices.length ? formatRupiahK(Math.min(...allMinPrices)).replace("Rp ", "") : "8K";
  const menuCount = Object.values(source).reduce(
    (sum, c) => sum + c.groups.reduce((n, g) => n + g.items.length, 0), 0);

  return (
    <section id="menu" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-0), var(--bg-1))",
    }}>
      <div className="shell">
        <div className="menu-compact-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Menu</Reveal>
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
              <MenuStat n={String(menuCount)} l="Menu aktif" />
              <MenuStat n={startFrom} l="Mulai dari" />
              <MenuStat n={hoursLabel} l="Tersedia" />
            </div>
          </Reveal>
        </div>

        <div className="menu-tabs">
          {cats.map((category, index) => {
            const active = cat === category;
            return (
              <button key={category} onClick={() => setCat(category)} className={`menu-tab ${active ? "active" : ""}`}>
                <div className="mono" style={{ marginBottom: 8, color: active ? "var(--red)" : "var(--fg-mute)" }}>
                  {String(index + 1).padStart(2, "0")} / Kategori
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
            <Link className="btn btn-primary" href={DIGITAL_MENU_URL}><span>Pesan Sekarang</span><ArrowRight /></Link>
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
                color: c === "Hot" ? "#ff6b75" : c === "Cold" ? "#d4d4d8" : c === "Pedas" ? "var(--red)" : c === "Sedang" ? "#e4e4e7" : c === "BBQ" ? "#b08858" : c === "Balado" ? "var(--red)" : c === "Campur" ? "#f5a742" : "var(--fg-mute)",
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
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {p === "—" ? "—" : (
              <>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-dim)", letterSpacing: "0.15em", marginRight: 2 }}>RP</span>
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
  const biz = useBiz();
  const aboutParas = (biz.aboutText || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section id="about" className="section-pad" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 80 }} className="about-grid">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 28 }}>Identitas</Reveal>
            <Reveal as="div" delay={100} className="mono" style={{ marginBottom: 8 }}>SIAPA KAMI</Reveal>
            <Reveal mask as="h2" delay={200} className="display" aria-label="Tempat kopi bertemu cerita Tebing Tinggi." style={{ fontSize: "clamp(40px, 5vw, 78px)" }}>
              <span style={{ display: "block" }}>Tempat kopi</span>
              <span style={{ display: "block" }}>bertemu <span style={{ color: "var(--red)" }}>cerita</span></span>
              <span style={{ display: "block" }}>Tebing Tinggi.</span>
            </Reveal>

            <Reveal delay={700} as="div" style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 24, maxWidth: 460 }}>
              {(aboutParas.length ? aboutParas : [
                "Dibangun untuk mereka yang menikmati ritual lambat — proses giling, seruputan pertama, dan obrolan yang tidak ingin selesai. Garage adalah bengkel yang menyamar jadi coffee shop, tempat material industrial bertemu seni meracik kopi, dan setiap kunjungan terasa seperti pulang ke garasi favoritmu.",
                "Kopi, non-kopi, makanan, dan cemilan dalam satu tempat. Pesan dari meja lewat QR, pantau pesananmu secara live, dan nikmati suasana garasi di Tebing Tinggi — kami sedang membangun tempat yang layak ditempuh perjalanannya.",
              ]).map((para, i) => (
                <p key={i} style={{ fontSize: 16, lineHeight: 1.65, color: "var(--fg-dim)" }}>
                  {para}
                </p>
              ))}
            </Reveal>

            <Reveal delay={900} as="div" style={{ marginTop: 48, display: "flex", gap: 36, flexWrap: "wrap" }}>
              <AboutStat n={hoursShort(biz)} l="Buka setiap hari" />
              <AboutStat n="4" l="Kategori menu" />
              <AboutStat n="Live" l="Status meja & pesanan" />
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
                {/* foto gedung Garage Coffee (foto gelas lama bertuliskan "Coffee & Motor" diganti) */}
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img
                    src="/grand-opening/garage-venue.webp"
                    alt="Gedung Garage Coffee Tebing Tinggi"
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center",
                      opacity: 0.55,
                      filter: "brightness(0.8) contrast(1.1)",
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
                      Dibangun untuk rasa,<br/>suasana, dan<br/>komunitas.
                    </p>
                    <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
                      <span className="tag">Industrial</span>
                      <span className="tag">Nongkrong</span>
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
              EST. 2026 ◢ TEBING TINGGI
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


// ---------------- SOCIAL PORTFOLIO ----------------
function SocialMark({ id }) {
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="social-mark-svg">
        <rect x="8" y="16" width="48" height="32" rx="10" fill="#ff0033" />
        <path d="M28 24L42 32L28 40V24Z" fill="#fff" />
      </svg>
    );
  }
  if (id === "instagram") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="social-mark-svg">
        <defs>
          <linearGradient id="garage-instagram-mark" x1="10" y1="54" x2="54" y2="10" gradientUnits="userSpaceOnUse">
            <stop stopColor="#feda75" />
            <stop offset="0.35" stopColor="#fa7e1e" />
            <stop offset="0.68" stopColor="#d62976" />
            <stop offset="1" stopColor="#8134af" />
          </linearGradient>
        </defs>
        <rect x="13" y="13" width="38" height="38" rx="12" fill="none" stroke="url(#garage-instagram-mark)" strokeWidth="5" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="url(#garage-instagram-mark)" strokeWidth="5" />
        <circle cx="43" cy="21" r="3.2" fill="#f4f4f5" />
      </svg>
    );
  }
  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="social-mark-svg">
        <path d="M36 12V38.5C36 47 30.5 52 23.5 52C17.4 52 12 47.7 12 41.2C12 34.4 17.5 30.1 24.2 30.1C25.5 30.1 26.7 30.3 27.8 30.7V38.1C26.8 37.5 25.8 37.2 24.5 37.2C21.7 37.2 19.4 38.8 19.4 41.2C19.4 43.6 21.4 45.2 23.8 45.2C26.7 45.2 28.6 43.1 28.6 39.4V12H36Z" fill="#f4f4f5" />
        <path d="M36 12C37.3 19.3 42.1 23.4 50 24.1V31.6C44.6 31.3 39.9 29.3 36 25.7V12Z" fill="#25f4ee" />
        <path d="M39.7 15.5C41.7 20.1 45.9 22.6 52 23.1V28.4C46.3 28.1 41.9 25.9 38.5 22.5L39.7 15.5Z" fill="#fe2c55" opacity="0.82" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="social-mark-svg">
      <rect x="12" y="10" width="40" height="44" rx="10" fill="#1877f2" opacity="0.92" />
      <path d="M35.6 54V35.8H42L43.2 28.2H35.6V23.4C35.6 21.3 36.6 19.8 39.6 19.8H43V13.1C41.4 12.9 39.6 12.8 37.6 12.8C31.2 12.8 27.1 16.8 27.1 22.8V28.2H20.8V35.8H27.1V54H35.6Z" fill="#fff" />
    </svg>
  );
}

// Label & CTA per platform untuk kartu feed sosmed (link diisi owner di modul Website).
const SOCIAL_POST_META = {
  instagram: { label: "Instagram", cta: "Lihat di Instagram" },
  tiktok: { label: "TikTok", cta: "Tonton di TikTok" },
  youtube: { label: "YouTube", cta: "Tonton di YouTube" },
  facebook: { label: "Facebook", cta: "Lihat di Facebook" },
};

function SocialPortfolio() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site/social-posts", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.data)) setPosts(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section id="social-portfolio" className="social-portfolio" style={{
      padding: "88px 0",
      borderTop: "1px solid var(--line)",
      background:
        "radial-gradient(circle at 18% 12%, rgba(209,26,42,0.16), transparent 32%), linear-gradient(180deg, var(--bg-1), var(--bg-0))",
    }}>
      <div className="shell">
        <div className="social-portfolio-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Media Sosial</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Ikuti GARAGE di media sosial." style={{ fontSize: "clamp(36px, 4.4vw, 64px)" }}>
              <span style={{ display: "block" }}>Ikuti GARAGE</span>
              <span style={{ display: "block" }}>di <span style={{ color: "var(--red)" }}>media sosial.</span></span>
            </Reveal>
          </div>
          <Reveal delay={320} as="p" className="social-portfolio-copy">
            Promo terbaru, menu baru, info event, dan suasana GARAGE setiap hari — langsung dari akun resmi kami.
          </Reveal>
        </div>

        {posts.length > 0 ? (
          <>
            <p className="mono" style={{ marginBottom: 14, color: "var(--amber)" }}>TERBARU DARI SOSMED GARAGE</p>
            <div className="social-portfolio-grid" style={{ marginBottom: 28 }}>
              {posts.map((post, idx) => {
                const meta = SOCIAL_POST_META[post.platform] ?? SOCIAL_POST_META.instagram;
                return (
                  <Reveal key={`${post.url}-${idx}`} delay={idx * 80}>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${meta.cta}: ${post.title || "postingan GARAGE"} (tab baru)`}
                      className={`social-portfolio-card social-portfolio-card-${post.platform}`}
                      style={{ minHeight: 220 }}
                    >
                      <div className="social-card-top">
                        <div className="social-mark">
                          <SocialMark id={post.platform} />
                        </div>
                        <span className="mono">TERBARU</span>
                      </div>
                      <div>
                        <p className="social-proof">{meta.label}</p>
                        <h3 style={{ fontSize: 22, lineHeight: 1.2 }}>{post.title || `Postingan ${meta.label} GARAGE`}</h3>
                      </div>
                      <div className="social-card-cta">
                        <span>{meta.cta}</span>
                        <ArrowRight size={12} />
                      </div>
                    </a>
                  </Reveal>
                );
              })}
            </div>
          </>
        ) : null}

        {/* Akun resmi: satu baris pill ringkas (ikon + handle), bukan kartu besar. */}
        <ul className="social-pill-row" aria-label="Akun media sosial resmi Garage Coffee">
          {SOCIAL_LINKS.map((social) => (
            <li key={social.id}>
              <a
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${social.cta} Garage Coffee (${social.handle}), buka di tab baru`}
                className={`social-pill social-pill-${social.id}`}
              >
                <span className="social-pill-mark"><SocialMark id={social.id} /></span>
                <span className="social-pill-text">
                  <strong>{social.label}</strong>
                  <span>{social.handle}</span>
                </span>
                <ArrowRight size={14} aria-hidden />
              </a>
            </li>
          ))}
        </ul>

        <Reveal className="social-tag-strip">
          <div>
            <span className="mono">Mampir & posting</span>
            <h3>Tag <a href={SOCIAL_LINKS.find((x) => x.id === "instagram")?.href} target="_blank" rel="noopener noreferrer">@garage_tbt.id</a> di story & postinganmu.</h3>
            <p>Momen terbaikmu di GARAGE bisa tampil di akun resmi kami.</p>
          </div>
          <a className="btn" href={GARAGE_LOCATION.reviewUrl} target="_blank" rel="noopener noreferrer">
            <span>Tulis Ulasan Google</span><ArrowRight />
          </a>
        </Reveal>
      </div>

      <style>{`
        .social-pill-row {
          list-style: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 32px;
        }
        .social-pill {
          display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 12px 16px;
          border: 1px solid var(--line-2); background: rgba(255,255,255,0.035); color: var(--fg);
          transition: border-color 0.25s var(--ease-out), background 0.25s var(--ease-out), transform 0.25s var(--ease-out);
        }
        .social-pill:hover { border-color: var(--red); background: rgba(209,26,42,0.08); transform: translateY(-2px); }
        .social-pill:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
        .social-pill-mark { width: 36px; height: 36px; flex: none; display: grid; place-items: center; }
        .social-pill-mark svg { width: 28px; height: 28px; }
        .social-pill-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .social-pill-text strong { font-family: var(--font-display); font-weight: 400; font-size: 20px; letter-spacing: 0.02em; text-transform: uppercase; }
        .social-pill-text span { font-family: var(--font-mono); font-size: 12px; color: var(--fg-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 980px) { .social-pill-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 520px) {
          .social-pill { gap: 10px; padding: 10px 12px; }
          .social-pill-mark { width: 28px; height: 28px; }
          .social-pill-mark svg { width: 24px; height: 24px; }
          .social-pill-text strong { font-size: 16px; }
          .social-pill > svg:last-child { display: none; }
        }
        @media (max-width: 330px) { .social-pill-row { grid-template-columns: 1fr; } }
        .social-tag-strip {
          margin-top: 16px; padding: 22px 24px;
          display: flex; align-items: center; justify-content: space-between; gap: 16px 32px; flex-wrap: wrap;
          border: 1px solid var(--line); border-left: 3px solid var(--red);
          background: rgba(255,255,255,0.03);
        }
        .social-tag-strip .mono { color: var(--amber, #f5a742); }
        .social-tag-strip h3 {
          margin-top: 6px; font-family: var(--font-display); font-size: clamp(22px, 2.6vw, 32px);
          line-height: 1.05; letter-spacing: 0.02em; text-transform: uppercase; color: var(--fg);
        }
        .social-tag-strip h3 a { color: #ff5a6a; text-decoration: none; border-bottom: 1px solid currentColor; }
        .social-tag-strip p { margin-top: 6px; color: var(--fg-dim); font-size: 14px; }
        @media (max-width: 600px) { .social-tag-strip .btn { width: 100%; justify-content: center; } }
        .social-portfolio-head {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
          gap: 40px;
          align-items: end;
          margin-bottom: 48px;
        }
        .social-portfolio-copy {
          color: var(--fg-dim);
          font-size: 16px;
          line-height: 1.7;
          max-width: 520px;
        }
        .social-portfolio-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .social-portfolio-card {
          min-height: 320px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 28px;
          border: 1px solid rgba(244,244,245,0.14);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.065), rgba(255,255,255,0.018)),
            rgba(14,14,18,0.88);
          color: var(--fg);
          padding: 24px;
          position: relative;
          overflow: hidden;
          transition:
            border-color 0.28s var(--ease-out),
            box-shadow 0.28s var(--ease-out),
            transform 0.28s var(--ease-out);
        }
        .social-portfolio-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, transparent 0 60%, rgba(255,255,255,0.06) 100%),
            radial-gradient(circle at 20% 20%, var(--social-glow, rgba(209,26,42,0.18)), transparent 38%);
          opacity: 0.72;
          pointer-events: none;
          transition: opacity 0.28s var(--ease-out);
        }
        .social-portfolio-card > * {
          position: relative;
          z-index: 1;
        }
        .social-portfolio-card-youtube { --social-glow: rgba(255,0,51,0.22); }
        .social-portfolio-card-instagram { --social-glow: rgba(214,41,118,0.20); }
        .social-portfolio-card-tiktok { --social-glow: rgba(37,244,238,0.16); }
        .social-portfolio-card-facebook { --social-glow: rgba(24,119,242,0.18); }
        .social-portfolio-card:hover {
          border-color: rgba(209,26,42,0.58);
          box-shadow: 0 20px 54px rgba(0,0,0,0.28), 0 0 34px rgba(209,26,42,0.11);
          transform: translateY(-4px);
        }
        .social-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .social-card-top .mono {
          color: var(--fg-mute);
          font-size: 10px;
          letter-spacing: 0.13em;
        }
        .social-mark {
          width: 64px;
          height: 64px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(244,244,245,0.16);
          background: rgba(0,0,0,0.24);
        }
        .social-mark-svg {
          width: 42px;
          height: 42px;
          display: block;
        }
        .social-proof {
          color: var(--red);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          margin-bottom: 14px;
          text-transform: uppercase;
        }
        .social-portfolio-card h3 {
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(30px, 3vw, 42px);
          line-height: 0.92;
          text-transform: uppercase;
        }
        .social-handle {
          color: var(--fg-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          margin-top: 8px;
        }
        .social-description {
          color: var(--fg-dim);
          font-size: 14px;
          line-height: 1.6;
          margin-top: 18px;
        }
        .social-card-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .social-portfolio-card:hover .social-card-cta {
          color: #fff;
        }
        @media (max-width: 1100px) {
          .social-portfolio-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 760px) {
          .social-portfolio-head { grid-template-columns: 1fr; }
          .social-portfolio-grid { grid-template-columns: 1fr; }
          .social-portfolio-card { min-height: 280px; }
        }
      `}</style>
    </section>
  );
}

// ---------------- EXPERIENCE ----------------
function Experience() {
  const biz = useBiz();
  const props = [
    {
      n: "01",
      t: "Diracik di bar",
      d: "Coffee & non-coffee diracik barista dengan resep tetap — rasanya sama setiap kali kamu pesan. Cold atau Hot.",
      i: <PromoIcon kind="cup" />,
    },
    {
      n: "02",
      t: "Nyaman ditinggali lama",
      d: "Area duduk santai untuk ngobrol berjam-jam — sendiri, bareng teman, atau satu rombongan.",
      i: <PromoIcon kind="chair" />,
    },
    {
      n: "03",
      t: "Pesan tanpa antre",
      d: "Scan QR di meja, pilih menu, bayar tunai/QRIS/transfer, lalu pantau status pesanan secara live.",
      i: <PromoIcon kind="wifi" />,
    },
    {
      n: "04",
      t: "Garasi komunitas",
      d: "Kopdar dan acara komunitas. Info event terbaru selalu diumumkan di Instagram GARAGE.",
      i: <PromoIcon kind="cog" />,
    },
    {
      n: "05",
      t: "Buka setiap hari",
      d: `Jam buka ${hoursShort(biz) === "24 JAM" ? "24 jam" : hoursShort(biz)} setiap hari. Mampir kapan pun — cek status meja dulu dari website.`,
      i: <PromoIcon kind="hand" />,
    },
  ];

  return (
    <section id="experience" className="section-pad" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div style={{ marginBottom: 64 }}>
          <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Pengalaman</Reveal>
          <Reveal mask as="h2" delay={100} className="display" aria-label="Lima alasan untuk mampir hari ini." style={{ fontSize: "clamp(48px, 7vw, 116px)", maxWidth: 1100 }}>
            <span style={{ display: "block" }}>Lima alasan untuk</span>
            <span style={{ display: "block" }}>mampir <span style={{ color: "var(--red)" }}>hari ini.</span></span>
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
                  Datang dan temukan<br/>alasan keenammu.
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
// Jadwal event diatur Owner/Manajer di OS → Website → "Event Website"
// (/api/site/events, hanya event yang belum lewat). Bila kosong tampil ajakan
// follow Instagram & booking acara.
const EVENT_DAY = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const EVENT_MONTH = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
function toEventRows(list) {
  return (Array.isArray(list) ? list : []).map((e) => {
    const [y, m, dd] = String(e.date || "").split("-").map(Number);
    const weekday = new Date(Date.UTC(y, (m || 1) - 1, dd || 1)).getUTCDay();
    return {
      ...e,
      key: e.id || `${e.date}-${e.time}-${e.title}`,
      d: EVENT_DAY[weekday] ?? "",
      date: `${String(dd || "").padStart(2, "0")} ${EVENT_MONTH[(m || 1) - 1] ?? ""}`,
      capacity: e.capacity ? `${e.capacity} ORANG` : "",
    };
  });
}
const EVENT_IDEAS = [
  { title: "Kopdar & touring", desc: "Kumpul bareng rombongan — pesan meja & menu untuk satu rombongan sekaligus." },
  { title: "Ulang tahun & syukuran", desc: "Booking area dan atur menu lebih dulu lewat WhatsApp." },
  { title: "Meeting & komunitas", desc: "Rapat santai, nobar, atau kumpul komunitas sambil ngopi." },
];

function Events() {
  const biz = useBiz();
  const [hover, setHover] = useState(-1);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site/events", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setEvents(toEventRows(json?.data));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const instagram = SOCIAL_LINKS.find((s) => s.id === "instagram");
  const bookingUrl = bizWaUrl(biz.whatsapp, "Halo GARAGE, saya mau booking tempat untuk acara/rombongan. Mohon info ketersediaannya.");
  return (
    <section id="events" className="section-pad" style={{ borderTop: "1px solid var(--line)", background: "var(--bg-1)" }}>
      <div className="shell">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, marginBottom: 64, alignItems: "end" }} className="events-head">
          <div>
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Event</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Event & komunitas." style={{ fontSize: "clamp(48px, 7vw, 116px)" }}>
              <span style={{ display: "block" }}>Event &</span>
              <span style={{ display: "block", color: "var(--red)" }}>komunitas.</span>
            </Reveal>
          </div>
          <Reveal delay={400}>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--fg-dim)", maxWidth: 480 }}>
              Kopdar, acara komunitas, dan kumpul rombongan di GARAGE. Jadwal event diumumkan di Instagram — mau bikin acara sendiri? Booking tempat lewat WhatsApp.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <a href="/event" className="btn btn-primary">
                <span>Lihat Event Garage</span><ArrowRight />
              </a>
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="btn">
                <span>Booking Acara</span><ArrowRight />
              </a>
              {instagram ? (
                <a href={instagram.href} target="_blank" rel="noopener noreferrer" className="btn">
                  <span>Info Event di Instagram</span><ArrowRight />
                </a>
              ) : null}
            </div>
          </Reveal>
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }}>
          {events.map((e, i) =>
          <Reveal key={e.key} delay={i * 100}>
              <EventRow e={e} i={i} hover={hover === i} setHover={(v) => setHover(v ? i : -1)} />
            </Reveal>
          )}
          {events.length === 0 ? (
            <div className="events-empty">
              <p className="mono events-empty-note">Belum ada jadwal event terdekat — pantau Instagram untuk pengumuman berikutnya.</p>
              <div className="events-ideas">
                {EVENT_IDEAS.map((idea) => (
                  <div key={idea.title} className="events-idea">
                    <strong>{idea.title}</strong>
                    <span>{idea.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <style>{`
        .events-empty { padding: 28px 0 4px; }
        .events-empty-note { color: var(--amber, #f5a742); margin-bottom: 18px; letter-spacing: 0.08em; }
        .events-ideas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .events-idea {
          display: flex; flex-direction: column; gap: 8px; padding: 20px;
          border: 1px solid var(--line); background: rgba(255,255,255,0.03);
        }
        .events-idea strong {
          font-family: var(--font-display); font-size: 22px; letter-spacing: 0.02em;
          text-transform: uppercase; color: var(--fg);
        }
        .events-idea span { color: var(--fg-dim); font-size: 14px; line-height: 1.55; }
        @media (max-width: 900px) {
          .events-head { grid-template-columns: 1fr !important; gap: 40px !important; }
          .events-ideas { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>);

}

// Tier sama persis dengan sistem member (member-types.ts): Silver → Gold → Platinum
// berdasarkan belanja 12 bulan terakhir. Ultra (owner approval) tidak dipasarkan.
const rupiahShort = (value) =>
  value >= 1_000_000 ? `Rp ${String(value / 1_000_000).replace(".", ",")} jt` : `Rp ${Math.round(value / 1000)}rb`;
const MEMBER_TIER_META = {
  Silver: { meta: "Daftar gratis", badge: "Mulai" },
  Gold: { meta: `Belanja ${rupiahShort(GOLD_ANNUAL_SPEND)}/tahun`, badge: `Poin ${"1,2"}x` },
  Platinum: { meta: `Belanja ${rupiahShort(PLATINUM_ANNUAL_SPEND)}/tahun`, badge: `Poin ${"1,6"}x` },
  Ultra: { meta: "Undangan owner", badge: "Poin 2x" },
};
// Warna pembeda tier — sama dengan kartu member di dashboard (member-card.tsx).
const MEMBER_TIER_COLOR = {
  Silver: "#d4d4d8",
  Gold: "#f5a742",
  Platinum: "#70b8ee",
  Ultra: "#a77bff",
};
const MEMBER_PERK_LABEL = {
  "Earn normal point": `1 poin tiap Rp ${(POINT_EARN_AMOUNT * 2).toLocaleString("id-ID")} · 1 poin = Rp100 saat bayar`,
  "Akses promo umum": "Akses promo umum",
  "Welcome reward": "Welcome reward",
  "Point 1.2x": "Poin 1,2x lebih cepat",
  "Birthday reward": "Hadiah ulang tahun",
  "Priority promo": "Promo prioritas",
  "Early access seasonal drink": "Duluan coba minuman musiman",
  "Point 1.6x": "Poin 1,6x lebih cepat",
  "Free monthly drink": "Gratis minuman tiap bulan",
  "Exclusive event": "Event eksklusif member",
  "Faster redeem": "Tukar poin lebih cepat",
  "Point 2x": "Poin 2x lebih cepat",
  "Prototype access": "Duluan coba menu baru (prototype)",
  "Owner-only privilege": "Privilege khusus dari owner",
  "Lifetime card priority": "Kartu prioritas seumur hidup",
};

function MembershipMasterPro() {
  const memberTiers = memberLevelRules.map((rule) => ({
    name: rule.level,
    meta: MEMBER_TIER_META[rule.level]?.meta ?? "",
    badge: MEMBER_TIER_META[rule.level]?.badge ?? "",
    color: MEMBER_TIER_COLOR[rule.level] ?? "#d4d4d8",
    invite: Boolean(rule.requiresApproval),
    benefits: rule.perks.map((perk) => MEMBER_PERK_LABEL[perk] ?? perk).filter((perk) => !/^Eligible setelah/i.test(perk)),
  }));

  return (
    <section id="membership" className="section-pad" style={{
      borderTop: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--bg-0), #0b0809)",
    }}>
      <div className="shell">
        <div className="membership-master">
          <Reveal>
            <div>
              <div className="eyebrow" style={{ marginBottom: 20 }}>Membership</div>
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
              <div><span>03</span><strong>Naik level</strong><p>Kumpulkan poin tiap belanja — level naik otomatis ke Gold & Platinum.</p></div>
            </div>
          </Reveal>
        </div>

        <div id="membership-benefits" className="membership-tier-grid">
          {memberTiers.map((tier, index) => (
            <Reveal
              key={tier.name}
              delay={index * 90}
              className="membership-tier-card"
              data-tier={tier.name}
              style={{ "--tier": tier.color }}
            >
              <div className="membership-tier-top">
                <span className="membership-tier-meta">{tier.meta}</span>
                <span className="membership-tier-badge">{tier.badge}</span>
              </div>
              <h3>
                <span className="membership-tier-dot" aria-hidden />
                {tier.name}
              </h3>
              <ul>
                {tier.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
              </ul>
              {tier.invite ? (
                <span className="membership-tier-link membership-tier-link--muted">Khusus undangan owner</span>
              ) : (
                <Link href={`${MEMBER_LOGIN_URL}?mode=register`} className="membership-tier-link">
                  {index === 0 ? "Daftar gratis" : "Mulai dari Silver"} <ArrowRight size={12} />
                </Link>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal className="membership-bottom-cta">
          <div>
            <div className="mono" style={{ color: "var(--red)", marginBottom: 8 }}>Untuk pelanggan tetap</div>
            <h3>Datang sekali boleh. Balik lagi lebih enak.</h3>
            <p style={{ marginTop: 12, maxWidth: 620, color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.55 }}>
              Level dihitung otomatis dari total belanja 12 bulan terakhir. Poin yang terkumpul bisa ditukar potongan harga.
            </p>
          </div>
          <div className="membership-bottom-actions">
            <Link href={`${MEMBER_LOGIN_URL}?mode=register`} className="btn btn-primary">
              <span>Daftar Member</span><ArrowRight />
            </Link>
            <Link href={DIGITAL_MENU_URL} className="btn">
              <span>Pesan Sekarang</span><ArrowRight />
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
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-top: 56px;
        }
        .membership-tier-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--tier) 45%, transparent);
          border-top: 4px solid var(--tier);
          background:
            radial-gradient(120% 70% at 100% 0%, color-mix(in srgb, var(--tier) 22%, transparent), transparent 60%),
            linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
          padding: 24px;
          transition: transform 0.32s var(--ease-out), border-color 0.32s var(--ease-out), background 0.32s var(--ease-out);
        }
        .membership-tier-card:hover {
          transform: translateY(-4px);
          border-color: var(--tier);
          box-shadow: 0 18px 40px -24px var(--tier);
        }
        .membership-tier-meta {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-dim);
        }
        .membership-tier-dot {
          display: inline-block;
          width: 14px;
          height: 14px;
          margin-right: 12px;
          vertical-align: middle;
          border-radius: 999px;
          background: var(--tier);
          box-shadow: 0 0 14px var(--tier);
        }
        .membership-tier-link--muted { color: var(--fg-dim) !important; }
        .membership-tier-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .membership-tier-badge {
          border: 1px solid var(--tier);
          background: color-mix(in srgb, var(--tier) 18%, transparent);
          padding: 6px 8px;
          color: var(--tier);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .membership-tier-card h3 {
          margin-top: 24px;
          color: var(--tier);
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
        @media (max-width: 1180px) {
          .membership-tier-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 980px) {
          .membership-master {
            grid-template-columns: 1fr;
          }
          .membership-flow {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .membership-tier-grid { grid-template-columns: 1fr; }
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
  const biz = useBiz();
  const rsvpUrl = bizWaUrl(biz.whatsapp, `Halo GARAGE, saya mau RSVP event ${e.title} (${e.date} ${e.time}).`);
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
        {e.capacity ? <div className="mono" style={{ marginBottom: 10 }}>KAPASITAS {e.capacity}</div> : null}
        <a href={rsvpUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: hover ? "var(--red)" : "var(--fg-dim)", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
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
          background: #e4e4e7;
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
{ q: "Datang karena tempatnya, balik lagi karena V60-nya. Baristanya jelasin tiga origin kayak teman ngobrol.", a: "Daffa K.", r: "Desainer / pelanggan" },
{ q: "Cukup tenang buat kerja. Cukup hidup buat ngerasa nggak sendiri. Kebanyakan kafe gagal di sini — Garage tepat sasaran.", a: "Vania P.", r: "Penulis lepas" },
{ q: "Octane Affogato bikin saya ubah rencana Minggu. Sekarang punya ritual baru.", a: "Bayu T.", r: "Pengunjung pertama" }];


// ---------------- LOCATION ----------------
function LocationMvp() {
  const biz = useBiz();
  const reservationMessage = "Halo GARAGE, saya mau reservasi. Mohon info ketersediaan meja dan jamnya.";
  return (
    <section id="location" className="section-pad location-mvp">
      <div className="shell">
        <div className="location-mvp-grid">
          <div className="location-mvp-info">
            <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Garage Coffee Tebing Tinggi</Reveal>
            <Reveal mask as="h2" delay={100} className="display" aria-label="Mampir saja. Kami menunggu." style={{ fontSize: "clamp(40px, 5vw, 76px)" }}>
              <span style={{ display: "block" }}>Mampir saja.</span>
              <span style={{ display: "block" }}>Kami <span style={{ color: "var(--red)" }}>menunggu.</span></span>
            </Reveal>
            <Reveal delay={260} as="p" className="location-mvp-copy">
              Jl. Mayjen Sutoyo, Rambung — dekat jalur kereta api, area outdoor bisa lihat kereta lewat.
              Tekan <strong>Rute ke GARAGE</strong> untuk navigasi langsung dari Google Maps.
            </Reveal>
            <Reveal delay={300} as="ul" className="location-mvp-perks" aria-label="Keunggulan lokasi">
              <li><TrainFront size={16} aria-hidden="true" /> Dekat jalur kereta api</li>
              <li><Trees size={16} aria-hidden="true" /> Area outdoor — lihat kereta lewat</li>
              <li><Clock size={16} aria-hidden="true" /> {isOpen24h(biz.hoursOpen, biz.hoursClose) ? "Buka 24 jam, setiap hari" : `Buka ${hoursShort(biz)} setiap hari`}</li>
              <li><Bike size={16} aria-hidden="true" /> Ramah komunitas & rombongan</li>
            </Reveal>
            <Reveal delay={360} as="div" className="location-mvp-cta-row">
              <a className="btn btn-primary" href={GARAGE_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer"><span>Rute ke GARAGE</span><ArrowRight /></a>
              <a className="btn" href={`tel:+${biz.whatsapp}`}><span>Telepon</span><ArrowRight /></a>
              <a className="btn" href={bizWaUrl(biz.whatsapp, reservationMessage)} target="_blank" rel="noopener noreferrer"><span>Reservasi via WhatsApp</span><ArrowRight /></a>
            </Reveal>
            <Reveal delay={420} as="div" className="location-mvp-rating">
              <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="location-mvp-rating-link">
                <span className="location-mvp-stars" aria-hidden="true">★★★★★</span>
                <strong>{GARAGE_LOCATION.rating.toFixed(1).replace(".", ",")}</strong>
                <span>· {GARAGE_LOCATION.reviewCount} ulasan Google</span>
              </a>
              <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="location-mvp-review-cta">Lihat profil Google →</a>
              <a href={GARAGE_LOCATION.reviewUrl} target="_blank" rel="noopener noreferrer" className="location-mvp-review-cta">Tulis ulasan →</a>
            </Reveal>
            <div className="location-mvp-cards">
              <Reveal delay={460}>
                <InfoBlock label="Alamat" mainline={streetLine(biz.address)} sub={`Tebing Tinggi Kota, Sumatera Utara 20631 · Plus Code ${GARAGE_LOCATION.plusCode.split(",")[0]}`} />
              </Reveal>
              <Reveal delay={540}>
                <InfoBlock label="Jam Buka" mainline={formatBusinessHours(biz.hoursOpen, biz.hoursClose)} sub={isOpen24h(biz.hoursOpen, biz.hoursClose) ? "Buka setiap hari, 24 jam." : "Buka setiap hari. Dapur tutup 30 menit sebelum closing."} />
              </Reveal>
              <Reveal delay={620}>
                <InfoBlock label="Telepon & WhatsApp" mainline={formatIdPhone(biz.whatsapp)} sub={biz.email} />
              </Reveal>
            </div>
          </div>
          <Reveal delay={260} className="location-mvp-map">
            <div className="location-mvp-frame">
              <iframe
                src={GARAGE_LOCATION.embedUrl}
                width="100%"
                height="100%"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Peta lokasi GARAGE Coffee Tebing Tinggi"
              />
              <a className="location-mvp-map-label" href={GARAGE_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer">
                <strong>GARAGE Coffee Tebing Tinggi</strong>
                <small>Tap untuk rute dari lokasimu →</small>
              </a>
            </div>
          </Reveal>
        </div>
      </div>
      <style>{`
        .location-mvp { border-top: 1px solid var(--line); background: radial-gradient(circle at 78% 16%, rgba(209,26,42,0.12), transparent 30%), var(--bg-1); }
        .location-mvp-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr); border: 1px solid var(--line); min-height: 560px; }
        .location-mvp-info { padding: 56px; display: flex; flex-direction: column; }
        .location-mvp-copy { color: var(--fg-dim); font-size: 16px; line-height: 1.7; margin-top: 26px; max-width: 560px; }
        .location-mvp-perks { list-style: none; margin: 22px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .location-mvp-perks li { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); background: rgba(255,255,255,0.035); color: var(--fg); font-size: 14px; line-height: 1.35; }
        .location-mvp-perks svg { flex-shrink: 0; color: #f5a742; }
        @media (max-width: 560px) { .location-mvp-perks { grid-template-columns: 1fr; } }
        .location-mvp-cta-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 28px; }
        .location-mvp-rating { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; margin-top: 22px; }
        .location-mvp-rating-link { display: inline-flex; align-items: center; gap: 8px; color: var(--fg); font-size: 15px; text-decoration: none; }
        .location-mvp-rating-link strong { font-size: 18px; }
        .location-mvp-rating-link span:last-child { color: var(--fg-dim); }
        .location-mvp-stars { color: #f59e0b; letter-spacing: 2px; font-size: 16px; }
        .location-mvp-review-cta { color: #f59e0b; font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; border-bottom: 1px solid rgba(245,158,11,0.4); padding-bottom: 2px; }
        .location-mvp-review-cta:hover { color: #fbbf24; }
        .location-mvp-cards { display: grid; gap: 28px; margin-top: 44px; }
        .location-mvp-map { min-height: 560px; border-left: 1px solid var(--line); }
        .location-mvp-frame { position: relative; min-height: 560px; height: 100%; overflow: hidden; background: #111116; }
        .location-mvp-frame iframe { position: absolute; inset: 0; border: 0; filter: grayscale(55%) contrast(1.1) invert(90%) hue-rotate(180deg); }
        .location-mvp-map-label { position: absolute; left: 20px; bottom: 20px; right: auto; max-width: calc(100% - 40px); border: 1px solid rgba(244,244,245,0.18); border-left: 3px solid var(--red); background: rgba(8,8,11,0.88); padding: 14px 18px; text-decoration: none; transition: transform 0.2s var(--ease-out); }
        .location-mvp-map-label:hover { transform: translateY(-2px); }
        .location-mvp-map-label strong { color: var(--fg); display: block; font-family: var(--font-display); font-size: 20px; line-height: 1.05; text-transform: uppercase; }
        .location-mvp-map-label small { color: #f59e0b; display: block; font-size: 13px; margin-top: 6px; }
        @media (prefers-reduced-motion: reduce) { .location-mvp-map-label { transition: none; } .location-mvp-map-label:hover { transform: none; } }
        @media (max-width: 960px) { .location-mvp-grid { grid-template-columns: 1fr; } .location-mvp-map { border-left: 0; border-top: 1px solid var(--line); min-height: 360px; } .location-mvp-frame { min-height: 360px; } }
        @media (max-width: 560px) { .location-mvp-info { padding: 32px 24px; } .location-mvp-cta-row .btn { width: 100%; justify-content: center; } .location-mvp-map-label { left: 12px; bottom: 12px; max-width: calc(100% - 24px); } }
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
  const biz = useBiz();
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
          <Link href={DIGITAL_MENU_URL} className="btn" style={{ padding: "22px 36px" }}><span>Pesan Sekarang</span><ArrowRight /></Link>
          <a href={WHATSAPP_URL} className="btn" style={{ padding: "22px 36px" }}><span>Reservasi WhatsApp</span><ArrowRight /></a>
        </Reveal>

        <Reveal delay={720} as="p" className="mono" style={{
          marginTop: 22,
          color: "var(--fg-dim)",
          fontSize: 12,
          letterSpacing: "0.12em"
        }}>
          LIHAT MENU, EVENT, DAN SUASANA TERBARU DI SOCIAL MEDIA GARAGE.
        </Reveal>

        {/* horizontal text */}
        <div style={{ marginTop: 100, opacity: 0.4 }}>
          <div className="mono">{`${biz.address.split(",")[0].toUpperCase()} / ${hoursShort(biz)} SETIAP HARI`}</div>
        </div>
      </div>
    </section>);

}

// ---------------- FOOTER ----------------
function FooterMvp() {
  const biz = useBiz();
  const waUrl = bizWaUrl(biz.whatsapp);
  const mapsUrl = MAPS_URL;
  const shortAddress = `${streetLine(biz.address)}, Tebing Tinggi`;
  const quickLinks = [
    ["Menu", "#menu"],
    ["Cara Pesan", "#cara-pesan"],
    ["Cek Meja", "#live-status"],
    ["Event", "/event"],
    ["Member", MEMBER_LOGIN_URL],
    ["Franchise", "/franchise"],
    ["Jadi Mitra", "/mitra"],
    ["Karier", "/recruitment"],
    ["Login Karyawan", LOGIN_URL],
  ];

  return (
    <footer className="footer-mvp">
      <div className="shell footer-mvp-shell">
        <div className="footer-mvp-grid">
          <div className="footer-mvp-brand">
            <LogoImage variant="wordmark" height={56} />
            <div className="mono footer-mvp-est">COFFEE · TEBING TINGGI · EST. 2026</div>
            <p className="footer-mvp-copy">
              Kopi, makanan, dan tempat nongkrong bernuansa garasi industrial. Pesan via QR,
              takeaway, reservasi meja, dan event komunitas dalam satu tempat.
            </p>
            <div className="footer-mvp-social">
              <div className="mono footer-mvp-label">FOLLOW THE GARAGE</div>
              <div className="footer-mvp-social-row" aria-label="Social media resmi GARAGE">
                {SOCIAL_LINKS.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Buka ${social.label} resmi GARAGE di tab baru`}
                    className="footer-mvp-social-link"
                  >
                    <span className="footer-mvp-social-mark" aria-hidden="true">
                      <SocialMark id={social.id} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="footer-mvp-visit">
            <div className="mono footer-mvp-label">KUNJUNGI</div>
            <p className="footer-mvp-address">{shortAddress}</p>
            <div className="footer-mvp-open">
              <span className="footer-mvp-open-dot" />
              <span className="mono">{isOpen24h(biz.hoursOpen, biz.hoursClose) ? "BUKA 24 JAM" : `BUKA SETIAP HARI ${hoursShort(biz)} WIB`}</span>
            </div>
            <p className="footer-mvp-meta"><a href={`tel:+${biz.whatsapp}`} style={{ color: "inherit" }}>{formatIdPhone(biz.whatsapp)}</a></p>
            <p className="footer-mvp-meta">{biz.email}</p>
          </div>

          <div className="footer-mvp-action">
            <div className="mono footer-mvp-label">AKSI CEPAT</div>
            <div className="footer-mvp-cta-row">
              <a href={waUrl} className="footer-mvp-cta footer-mvp-cta-primary">
                <span>Reservasi WhatsApp</span>
                <ArrowRight size={12} />
              </a>
              <a href={GARAGE_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer" className="footer-mvp-cta">
                <span>Rute ke GARAGE</span>
                <ArrowRight size={12} />
              </a>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="footer-mvp-cta">
                <span>Profil Google ★ {GARAGE_LOCATION.rating.toFixed(1).replace(".", ",")}</span>
                <ArrowRight size={12} />
              </a>
            </div>
            <nav className="footer-mvp-quick-links" aria-label="Link cepat footer">
              {quickLinks.map(([label, href]) =>
                isLoginHref(href) ? (
                  <a key={label} href={href} onClick={(event) => goToAccess(event, href)} className="footer-mvp-link">{label}</a>
                ) : (
                  <a key={label} href={href} className="footer-mvp-link">{label}</a>
                )
              )}
            </nav>
          </div>
        </div>

        <div className="footer-mvp-bottom">
          <SuryaDeveloperCredit variant="compact" />
          <div className="footer-mvp-bottom-links">
            <a href={MEMBER_LOGIN_URL} className="footer-mvp-link">Login Member</a>
            <a href={LOGIN_URL} onClick={(event) => goToAccess(event, LOGIN_URL)} className="footer-mvp-link">Login Karyawan</a>
          </div>
        </div>
      </div>

      <div className="footer-mvp-watermark" aria-hidden="true">
        <Reveal>
          <LogoImage
            variant="wordmark"
            width="min(1500px, 94vw)"
            style={{
              opacity: 0.28,
              maskImage: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, transparent 92%)",
              WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, transparent 92%)",
            }}
          />
        </Reveal>
      </div>

      <style>{`
        .footer-mvp {
          border-top: 1px solid var(--line);
          background:
            radial-gradient(circle at 18% 0%, rgba(209,26,42,0.12), transparent 34%),
            var(--bg-1);
          position: relative;
          z-index: 2;
        }
        .footer-mvp-shell {
          padding-top: 72px;
          padding-bottom: 32px;
        }
        .footer-mvp-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.75fr) minmax(270px, 0.9fr);
          gap: 56px;
          align-items: start;
        }
        .footer-mvp-est {
          margin-top: 8px;
        }
        .footer-mvp-copy,
        .footer-mvp-address,
        .footer-mvp-meta {
          color: var(--fg-dim);
          font-size: 14px;
          line-height: 1.6;
        }
        .footer-mvp-copy {
          margin-top: 24px;
          max-width: 430px;
        }
        .footer-mvp-social {
          margin-top: 24px;
        }
        .footer-mvp-label {
          color: var(--fg);
          margin-bottom: 14px;
        }
        .footer-mvp-social-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          max-width: 520px;
        }
        .footer-mvp-social-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: rgba(244,244,245,0.08);
          color: var(--fg);
          transition:
            background 0.25s var(--ease-out),
            color 0.25s var(--ease-out),
            opacity 0.25s var(--ease-out),
            transform 0.25s var(--ease-out);
        }
        .footer-mvp-social-link:hover {
          background: rgba(244,244,245,0.14);
          color: #fff;
          transform: translateY(-1px);
        }
        .footer-mvp-social-mark {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }
        .footer-mvp-social-mark .social-mark-svg {
          width: 21px;
          height: 21px;
        }
        .footer-mvp-address {
          max-width: 280px;
          margin-bottom: 18px;
        }
        .footer-mvp-open {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: var(--fg);
        }
        .footer-mvp-open-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #e4e4e7;
          box-shadow: 0 0 0 4px rgba(228,228,231,0.16);
        }
        .footer-mvp-meta {
          margin-top: 16px;
          word-break: break-word;
        }
        .footer-mvp-cta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 22px;
        }
        .footer-mvp-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(244,244,245,0.18);
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          padding: 12px 14px;
          text-transform: uppercase;
          transition:
            border-color 0.25s var(--ease-out),
            color 0.25s var(--ease-out),
            transform 0.25s var(--ease-out);
        }
        .footer-mvp-cta-primary {
          background: var(--red);
          border-color: var(--red);
          color: #fff;
        }
        .footer-mvp-cta:hover {
          border-color: rgba(209,26,42,0.78);
          color: #fff;
          transform: translateY(-1px);
        }
        .footer-mvp-quick-links,
        .footer-mvp-bottom-links {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
        }
        .footer-mvp-quick-links {
          max-width: 340px;
        }
        .footer-mvp-link {
          color: var(--fg-dim);
          display: inline-block;
          font-size: 14px;
          position: relative;
          transition: color 0.25s var(--ease-out);
        }
        .footer-mvp-link::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: -2px;
          width: 0;
          height: 1px;
          background: var(--red);
          transition: width 0.32s var(--ease-out);
        }
        .footer-mvp-link:hover {
          color: var(--fg);
        }
        .footer-mvp-link:hover::after {
          width: 100%;
        }
        .footer-mvp-bottom {
          margin-top: 64px;
          padding-top: 24px;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .footer-mvp-watermark {
          margin-top: 24px;
          overflow: hidden;
          position: relative;
          display: flex;
          justify-content: center;
        }
        @media (max-width: 1040px) {
          .footer-mvp-grid {
            grid-template-columns: 1fr 1fr;
            gap: 44px;
          }
          .footer-mvp-action {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 900px) {
          .footer-mvp-grid {
            grid-template-columns: 1fr;
            gap: 36px;
          }
          .footer-mvp-copy,
          .footer-mvp-address {
            max-width: 560px;
          }
        }
        @media (max-width: 560px) {
          .footer-mvp-shell {
            padding-top: 56px;
          }
          .footer-mvp-cta-row {
            flex-direction: column;
          }
          .footer-mvp-cta {
            justify-content: center;
          }
          .footer-mvp-social-row {
            gap: 16px 18px;
          }
          .footer-mvp-bottom {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </footer>
  );
}

const formatRupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

function PromoProducts() {
  const biz = useBiz();
  const { rows, loaded } = useLiveMenu();
  const items = useMemo(() => rows
    .filter((it) => it && it.promoActive && Number(it.promoPrice) > 0)
    .map((it) => {
      const base = Array.isArray(it.variants) && it.variants.length
        ? Math.min(...it.variants.map((v) => Number(v.price) || 0))
        : 0;
      return { ...it, basePrice: base };
    })
    .filter((it) => it.basePrice > Number(it.promoPrice)), [rows]);

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
            // Kartu promo langsung membuka menu digital di item ini (bisa langsung
            // pesan & terlacak campaign); WhatsApp jadi opsi sekunder di bawah kartu.
            const waUrl = bizWaUrl(
              biz.whatsapp,
              `Halo GARAGE, saya mau tanya promo ${it.name} (${formatRupiah(it.promoPrice)}).`,
            );
            return (
              <Reveal key={it.id || idx} delay={idx * 60}>
                <a href={digitalMenuItemHref(it.name, "landing_promo")} className="promo-card" style={{
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
                      <span className="card-order-pill" style={{ marginLeft: "auto" }}>Pesan</span>
                    </div>
                  </div>
                </a>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="card-wa-link">
                  Tanya via WhatsApp
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Section Menu Unggulan (C3) — produk bertag "Bestseller"/"Unggulan" dari DB.
// Owner kontrol via tag di Produk Manajemen. Additive, tampil bila ada isi.
function FeaturedMenu() {
  const biz = useBiz();
  const { rows, loaded } = useLiveMenu();
  const items = useMemo(() => rows
    .filter((it) => it?.featured || (Array.isArray(it?.tags) && it.tags.some((t) =>
      /bestseller|unggulan|favorit|signature/i.test(String(t)))))
    .map((it) => ({
      name: it.name,
      imageUrl: it.imageUrl,
      category: it.category,
      price: liveItemPrice(it),
    }))
    .slice(0, 8), [rows]);
  if (!loaded || items.length === 0) return null;
  const fmt = (v) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v) || 0);
  return (
    <section id="unggulan" className="section-pad" style={{
      borderTop: "1px solid var(--line)", background: "linear-gradient(180deg, var(--bg-1), var(--bg-0))",
    }}>
      <div className="shell">
        <div style={{ marginBottom: 40 }}>
          <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Unggulan</Reveal>
          <Reveal mask as="h2" delay={100} className="display" aria-label="Menu unggulan."
            style={{ fontSize: "clamp(40px, 7vw, 110px)" }}>
            <span style={{ display: "block" }}>Menu</span>
            <span style={{ display: "block", color: "var(--red)" }}>unggulan.</span>
          </Reveal>
        </div>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {items.map((it, idx) => {
            const waUrl = bizWaUrl(biz.whatsapp, `Halo GARAGE, saya mau tanya menu ${it.name}.`);
            return (
              <Reveal key={idx} delay={idx * 60}>
                <a href={digitalMenuItemHref(it.name, "landing_unggulan")} style={{
                  display: "block", borderRadius: 14, overflow: "hidden",
                  border: "1px solid var(--line)", background: "var(--bg-2, #18181f)",
                  textDecoration: "none", color: "inherit",
                }}>
                  <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#15151b" }}>
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt={it.name} loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : null}
                    <span style={{
                      position: "absolute", top: 10, left: 10, background: "var(--red)",
                      color: "#fff", fontWeight: 900, fontSize: 10, letterSpacing: ".05em",
                      padding: "4px 8px", borderRadius: 6,
                    }}>UNGGULAN</span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <p style={{ fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.3 }}>{it.name}</p>
                    <p className="mono" style={{ margin: "4px 0 8px", color: "var(--fg-mute)", fontSize: 11 }}>{it.category}</p>
                    <div className="card-order-row">
                      {it.price ? <span style={{ color: "var(--fg)", fontWeight: 800, fontSize: 16 }}>{fmt(it.price)}</span> : <span />}
                      <span className="card-order-pill">Pesan</span>
                    </div>
                  </div>
                </a>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="card-wa-link">
                  Tanya via WhatsApp
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Section Galeri (C5) — foto produk asli dari DB (/api/customer/menu). Additive,
// tampil hanya bila ada foto. Tidak butuh upload terpisah.
function MenuGallery() {
  const { rows, loaded } = useLiveMenu();
  const photos = useMemo(() => rows
    .filter((it) => it && it.imageUrl)
    .map((it) => ({ name: it.name, imageUrl: it.imageUrl }))
    .slice(0, 12), [rows]);
  if (!loaded || photos.length < 3) return null;
  return (
    <section id="galeri" className="section-pad" style={{
      borderTop: "1px solid var(--line)", background: "var(--bg-1)",
    }}>
      <div className="shell">
        <div style={{ marginBottom: 40 }}>
          <Reveal as="div" className="eyebrow" style={{ marginBottom: 24 }}>Galeri</Reveal>
          <Reveal mask as="h2" delay={100} className="display" aria-label="Dari dapur kami."
            style={{ fontSize: "clamp(40px, 7vw, 110px)" }}>
            <span style={{ display: "block" }}>Dari dapur</span>
            <span style={{ display: "block", color: "var(--red)" }}>kami.</span>
          </Reveal>
        </div>
        <div className="gw-gallery-grid" style={{
          display: "grid", gap: 8,
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        }}>
          {photos.map((p, idx) => (
            <Reveal key={idx} delay={idx * 40}>
              <div style={{
                position: "relative", aspectRatio: "1 / 1", overflow: "hidden",
                borderRadius: 10, border: "1px solid var(--line)", background: "#15151b",
              }}>
                <img src={p.imageUrl} alt={p.name} loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// Section Testimoni (C6) — review ASLI yang diisi owner dari modul Website.
// Tampil hanya bila ada isi (hidden saat kosong).
function LiveTestimonials() {
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
  featuredEvent = null,
}: {
  landingHero?: SiteAsset | null;
  featuredEvent?: PublicEvent | null;
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
    hoursOpen: businessInfo?.hoursOpen || DEFAULT_HOURS_OPEN,
    hoursClose: businessInfo?.hoursClose || DEFAULT_HOURS_CLOSE,
    instagram: businessInfo?.instagram || "",
    mapsUrl: businessInfo?.mapsUrl || "",
    tagline: businessInfo?.tagline || "Ngopi, makan, nongkrong, dan kumpul komunitas di GARAGE.",
    aboutText: businessInfo?.aboutText || "",
  };

  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: "Garage Coffee Tebing Tinggi",
    alternateName: GARAGE_LOCATION.name,
    description:
      `Garage Coffee Tebing Tinggi — cafe & coffee shop, buka setiap hari ${hoursShort(biz)} WIB. Coffee shop, tempat nongkrong, menu digital, takeaway, reservasi WhatsApp, membership, dan event komunitas.`,
    // Domain publik (https) dari env bila sudah ada; alamat LAN (http://192.168…) tidak dipakai untuk Google.
    url: process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.startsWith("https://")
      ? process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL
      : "https://garagecoffee.id",
    telephone: `+${biz.whatsapp}`,
    email: biz.email,
    priceRange: "Rp 8K - Rp 100K",
    hasMap: MAPS_URL,
    geo: {
      "@type": "GeoCoordinates",
      latitude: GARAGE_LOCATION.lat,
      longitude: GARAGE_LOCATION.lng,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: GARAGE_LOCATION.rating,
      reviewCount: GARAGE_LOCATION.reviewCount,
      bestRating: 5,
    },
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
    sameAs: SOCIAL_LINKS.map((social) => social.href),
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
      {featuredEvent ? <GrandOpeningBanner event={featuredEvent} /> : null}
      {/* 1. Pesan: menu, promo, unggulan, cara pesan */}
      <Menu />
      <PromoProducts />
      <FeaturedMenu />
      <PartnerShowcase />
      <HowToOrder />
      <SuryaShowcase />
      {/* 2. Live outlet: meja, keramaian, estimasi, lacak pesanan */}
      <LiveVisitBoard />
      {/* 3. Member */}
      <MembershipMasterPro />
      {/* 4. Tentang & suasana */}
      <About />
      <MenuGallery />
      <LiveTestimonials />
      <Experience />
      {/* 5. Event */}
      <Events />
      {/* 6. Lokasi & sosmed */}
      <LocationMvp />
      <SocialPortfolio />
      <FinalCTA />
      <FooterMvp />
      <FloatingWA />
      <MobileOrderBar />
    </main>
    </BizContext.Provider>
  );
}

export { GarageWebsiteRoot as GarageWebsite };
