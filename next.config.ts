import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Next.js dev server (>=15.2) blocks cross-origin dev resources (RSC payload,
// HMR) from origins not listed in `allowedDevOrigins`. When the app is opened
// over the shop WiFi via the machine's LAN IP, that IP must be allowed or the
// page renders but never hydrates (content stays at opacity:0 / blank).
//
// The LAN IP changes whenever the WiFi/network changes (DHCP), so detect every
// non-internal IPv4 address at server start and allow it automatically — no
// manual edit needed when the network changes. Same approach as the Better Auth
// trusted-origins auto-detect in src/lib/auth.ts.
function lanDevOrigins(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

// Header keamanan untuk semua halaman & API (audit kesiapan 2026-10-05).
// HSTS dipasang di Caddyfile (hanya relevan di HTTPS VPS, bukan PC kasir LAN).
// Kamera, GPS & mikrofon tetap diizinkan untuk origin sendiri: absen selfie+GPS,
// scan WMS, dan perintah suara.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Standalone output HANYA untuk build Docker/VPS (set GARAGE_STANDALONE=true).
  // Di PC kasir lokal (Windows) kita pakai `next build` + `next start`, dan
  // standalone justru bikin (a) `next start` tidak kompatibel & (b) copy file
  // tracing gagal karena path spasi / salah deteksi workspace root.
  output: process.env.GARAGE_STANDALONE === "true" ? "standalone" : undefined,
  // Manual image builds on a constrained host may reuse a successful, separately
  // recorded typecheck of this exact source. Normal CI/local builds still check.
  typescript: {
    ignoreBuildErrors: process.env.GARAGE_STANDALONE === "true" && process.env.GARAGE_BUILD_TYPECHECK_VERIFIED === "true",
  },
  // Opt-in for the constrained manual Webpack builder; normal builds keep defaults.
  experimental: {
    webpackMemoryOptimizations: process.env.GARAGE_STANDALONE === "true" && process.env.GARAGE_BUILD_WEBPACK_MEMORY_OPTIMIZATIONS === "true",
  },
  // pdfkit dibiarkan eksternal (jangan di-bundle webpack): kalau di-bundle,
  // __dirname-nya jadi path palsu (mis. "D:\ROOT\...") sehingga file font .afm
  // tidak ketemu → invoice PDF 500. Sebagai eksternal, ia di-require dari
  // node_modules asli dengan path benar.
  serverExternalPackages: ["@electric-sql/pglite", "pdfkit"],
  // Pastikan data font bawaan pdfkit (.afm) ikut tertrace ke build standalone
  // (Docker/VPS hanya menyalin .next/standalone). Tanpa ini, file font hilang.
  outputFileTracingIncludes: {
    "/api/orders/[id]/invoice": ["./node_modules/pdfkit/js/data/*.afm"],
    "/api/payroll/payslips": ["./node_modules/pdfkit/js/data/*.afm", "./public/garage-brand/logo-website.png"],
    "/api/absen/slip": ["./node_modules/pdfkit/js/data/*.afm", "./public/garage-brand/logo-website.png"],
  },
  allowedDevOrigins: lanDevOrigins(),
  // next/image lokal menolak query string kecuali diizinkan. QRIS memakai
  // ?v=<versi> (src/lib/garage-qris.ts) agar gambar QRIS baru tidak tertahan cache.
  images: {
    localPatterns: [{ pathname: "/**", search: "" }, { pathname: "/payments/**" }],
  },
  // Ada package-lock.json nyasar di folder home user → Next menebak root
  // workspace = C:\Users\<user> dan men-trace puluhan ribu file di luar proyek.
  // Kunci root ke folder proyek (QA-audit 2026-09-28).
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // Route yang membaca file lewat path dinamis (process.cwd() + ...) membuat
  // tracing standalone menyalin SELURUH folder proyek — termasuk DB PGlite asli,
  // backup, dan salinan uji (terukur 1,7 GB). Data & artefak ini tidak pernah
  // dibaca aplikasi saat runtime (upload/selfie memakai volume Docker).
  outputFileTracingExcludes: {
    "*": [
      ".pglite-data/**",
      ".pglite-data.*/**",
      "pglite-data*/**",
      "backups/**",
      ".tmp/**",
      "tmp/**",
      ".next-verify/**",
      "storage/**",
      "public/uploads/**",
      "test-artifacts/**",
      "testsprite_tests/**",
      "docs/**",
      "PRD/**",
      "archive/**",
      "output/**",
      "outputs/**",
      "garage-profitmax/**",
      "garage-profitmax-ui/**",
      "*.log",
      "tsconfig.tsbuildinfo",
    ],
  },
  // Google Drive (I:) tidak mendukung junction/symlink yang Turbopack butuhkan.
  // Arahkan build cache ke disk lokal saat dev di Drive.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
