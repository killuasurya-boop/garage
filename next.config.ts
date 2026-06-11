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

const nextConfig: NextConfig = {
  // Standalone output bundles a minimal server (.next/standalone/server.js) plus
  // only the node_modules actually used — kebutuhan untuk image Docker kecil di
  // VPS. `next start` tidak dipakai di production container; kita jalankan
  // `node server.js`.
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: lanDevOrigins(),
  // Google Drive (I:) tidak mendukung junction/symlink yang Turbopack butuhkan.
  // Arahkan build cache ke disk lokal saat dev di Drive.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
