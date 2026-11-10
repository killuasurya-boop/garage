export const SURYA_PORTFOLIO_URL = "https://suryadev.click/";
export const SURYA_WA_NUMBER = "6281396186251";
export const SURYA_WA_MESSAGE =
  "Halo Surya, saya melihat Garage OS melalui Garage Coffee. Saya ingin konsultasi pembuatan website, aplikasi, desain, atau sistem bisnis.";
export const SURYA_WA_URL = `https://wa.me/${SURYA_WA_NUMBER}?text=${encodeURIComponent(SURYA_WA_MESSAGE)}`;

export type SuryaModuleId = "waiter" | "pos" | "bar" | "kitchen" | "owner";

/** Posisi di kanvas 100 x 70 (y ke bawah). Dipakai label HTML, jalur SVG, dan objek 3D. */
export const SURYA_MODULES: {
  id: SuryaModuleId;
  label: string;
  sub: string;
  x: number;
  y: number;
}[] = [
  { id: "waiter", label: "WAITER", sub: "Order & Pelayanan", x: 15, y: 25 },
  { id: "pos", label: "POS", sub: "Transaksi & Operasional", x: 50, y: 12 },
  { id: "bar", label: "BAR", sub: "Preparasi Minuman", x: 86, y: 20 },
  { id: "kitchen", label: "KITCHEN", sub: "Preparasi Makanan", x: 86, y: 45 },
  { id: "owner", label: "OWNER DASHBOARD", sub: "Laporan & Manajemen Bisnis", x: 50, y: 61 },
];

export const SURYA_CORE = { x: 50, y: 34 };
export const SURYA_READY = { x: 73, y: 34 };

/** Alur konseptual (ilustrasi modul perangkat lunak, bukan data langsung). */
export const SURYA_PATHS: { id: string; d: string; from: SuryaModuleId | "core" | "ready"; to: SuryaModuleId | "core" | "ready" }[] = [
  { id: "waiter-pos", from: "waiter", to: "pos", d: "M22 25 C 32 25, 34 12, 42 12" },
  { id: "pos-core", from: "pos", to: "core", d: "M50 18 L 50 27" },
  { id: "pos-bar", from: "pos", to: "bar", d: "M58 12 C 70 12, 70 20, 78 20" },
  { id: "pos-kitchen", from: "pos", to: "kitchen", d: "M58 12 C 64 12, 66 17, 66 24 L 66 40 C 66 45, 72 45, 78 45" },
  { id: "bar-ready", from: "bar", to: "ready", d: "M86 25 C 86 30, 82 34, 77.5 34" },
  { id: "kitchen-ready", from: "kitchen", to: "ready", d: "M86 40 C 86 36, 82 34, 77.5 34" },
  { id: "core-owner", from: "core", to: "owner", d: "M50 42 L 50 54" },
];

export const SURYA_HUD = [
  { label: "Inventaris", sub: "Stok & Bahan Baku" },
  { label: "Member & CRM", sub: "Pelanggan & Loyalti" },
  { label: "Laporan Bisnis", sub: "Penjualan & Analitik" },
  { label: "Operasional", sub: "Waktu, Tim & Workflow" },
  { label: "Integrasi Sistem", sub: "Koneksi antar modul" },
];

export const SURYA_SERVICES = [
  { id: "software", title: "CUSTOM SOFTWARE DEVELOPMENT", desc: "Sistem bisnis, aplikasi internal, POS, ERP, dan dashboard sesuai kebutuhan." },
  { id: "web", title: "WEBSITE & WEB APPLICATION", desc: "Company profile, landing page, aplikasi web, dan website interaktif profesional." },
  { id: "uiux", title: "UI/UX & DIGITAL PRODUCT DESIGN", desc: "Product design, design system, prototype, dan interface yang fungsional." },
  { id: "automation", title: "BUSINESS SYSTEMS & AUTOMATION", desc: "Digitalisasi operasional, otomasi workflow bisnis, dan integrasi sistem." },
  { id: "marketing", title: "DIGITAL MARKETING & BRANDING", desc: "Brand identity, creative strategy, marketing website, dan digital campaign." },
] as const;

export const SURYA_CAPABILITIES = [
  "3D Interactive Experience",
  "Motion Graphics",
  "Creative Development",
  "Graphic Design",
  "Business Consulting",
] as const;
