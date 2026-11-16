// Portofolio SURYA.dev di homepage Garage Coffee (owner 16 Nov 2026).
//
// ATURAN DATA (jangan dilanggar):
// - `summary`/`category` hanya diisi dengan keterangan yang SUDAH DIVERIFIKASI (dari website proyek itu sendiri
//   atau dari Owner). Kosong = kartu menampilkan domain saja. Jangan mengarang klaim, angka, atau fitur.
// - `image` hanya screenshot ASLI website itu (simpan di public/surya-dev/portfolio/<id>.webp, 1440×900 → ±1200 px).
//   Kosong = bingkai browser netral dengan nama domain (bukan gambar palsu).
// - Logo proyek tidak digambar ulang; nama ditulis sebagai teks biasa.

export type PortfolioProject = {
  id: string;
  name: string;
  url: string;
  domain: string;
  /** Kategori pekerjaan terverifikasi, mis. "Website · UI/UX". */
  category?: string;
  /** Satu kalimat terverifikasi. */
  summary?: string;
  /** Path screenshot asli di /public. */
  image?: { src: string; width: number; height: number };
  featured?: boolean;
};

export const PORTFOLIO_PROJECTS: PortfolioProject[] = [
  {
    id: "garagecoffee",
    name: "Garage Coffee",
    url: "https://garagecoffee.id/",
    domain: "garagecoffee.id",
    featured: true,
    // Terverifikasi dari kode repo ini: website publik + menu digital + Garage OS (POS, Bar/Dapur, Owner).
    category: "Website · Menu digital · Garage OS",
    summary:
      "Website coffee shop dengan menu digital, status meja live, member, dan Garage OS untuk kasir, Bar, Dapur, sampai laporan Owner.",
    // Screenshot garagecoffee.id live (16 Nov 2026).
    image: { src: "/surya-dev/portfolio/garagecoffee.webp", width: 1200, height: 750 },
  },
  // Deskripsi di bawah diambil dari meta/hero website masing-masing (dicek 16 Nov 2026), bukan karangan.
  {
    id: "suryadev",
    name: "SURYA.dev",
    url: "https://suryadev.click/",
    domain: "suryadev.click",
    category: "Portofolio · Desain · Product building",
    summary: "Portofolio SURYA: desain, motion, 3D, website, dan sistem bisnis.",
    image: { src: "/surya-dev/portfolio/suryadev.webp", width: 1200, height: 750 },
  },
  {
    id: "killuasurya",
    name: "KILLUASURYA.TECH",
    url: "https://killuasurya.tech/",
    domain: "killuasurya.tech",
    category: "Digital growth agency",
    summary: "Digital agency untuk UMKM: digital marketing, konten kreatif, website, dan sistem bisnis.",
    image: { src: "/surya-dev/portfolio/killuasurya.webp", width: 1200, height: 750 },
  },
  {
    id: "desainajadulu",
    name: "Desain Aja Dulu",
    url: "https://www.desainajadulu.com/",
    domain: "desainajadulu.com",
    category: "Workshop · Printshop · Branding",
    summary: "Workshop & printshop di Tebing Tinggi: percetakan, branding usaha, gerobak custom, dan packaging.",
    image: { src: "/surya-dev/portfolio/desainajadulu.webp", width: 1200, height: 750 },
  },
  {
    id: "tm87farm",
    name: "TM 87 Farm",
    url: "https://tm87farm.site/",
    domain: "tm87farm.site",
    category: "Peternakan · Company profile",
    summary: "Peternakan ayam kampung dengan pengelolaan terencana dan pencatatan yang disiplin.",
    image: { src: "/surya-dev/portfolio/tm87farm.webp", width: 1200, height: 750 },
  },
];

/** Tautan eksternal portofolio selalu dibuka di tab baru tanpa akses ke window Garage. */
export const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

/** UTM agar kunjungan dari Garage Coffee terbaca di analitik proyek tujuan. */
export function withRef(url: string, content: string) {
  const u = new URL(url);
  if (u.hostname.endsWith("garagecoffee.id")) return url; // situs sendiri: tanpa UTM

  u.searchParams.set("utm_source", "garagecoffee.id");
  u.searchParams.set("utm_medium", "referral");
  u.searchParams.set("utm_content", content);
  return u.toString();
}
