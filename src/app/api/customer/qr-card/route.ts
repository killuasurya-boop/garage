import { readFileSync } from "fs";
import { join } from "path";

import QRCode from "qrcode";

import {
  garageQrOrderUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function configuredPublicOrigin() {
  const raw =
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim();
  return raw ? normalizeGarageBaseUrl(raw) : null;
}

// Logo di-cache sekali (base64) supaya SVG mandiri (bisa diunduh & tetap ada logo).
let logoDataUriCache: string | null | undefined;
function logoDataUri(): string | null {
  if (logoDataUriCache !== undefined) return logoDataUriCache;
  try {
    const buf = readFileSync(
      join(process.cwd(), "public", "garage-brand", "logo-website.png"),
    );
    logoDataUriCache = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    logoDataUriCache = null;
  }
  return logoDataUriCache;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rakit KARTU QR meja lengkap sebagai SVG mandiri (vektor):
 * aksen Garage + logo + nomor meja besar + QR + instruksi + footer + garis potong.
 * Body putih untuk cetak hemat tinta & scan paling andal.
 */
export async function buildQrCardSvg(table: string, orderUrl: string): Promise<string> {
  const W = 540;
  const H = 840;

  // QR sebagai SVG (tanpa margin sendiri — quiet-zone diatur manual di kartu).
  const qrSvg = await QRCode.toString(orderUrl, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0b0f", light: "#ffffff" },
  });
  const vbMatch = qrSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const qrN = vbMatch ? parseFloat(vbMatch[1]) : 25;
  const qrPaths = (qrSvg.match(/<path[\s\S]*?\/>/g) ?? []).join("");

  // Area QR di kartu.
  const qrBox = 300;
  const qrX = (W - qrBox) / 2;
  const qrY = 300;
  const qrScale = qrBox / qrN;

  const logo = logoDataUri();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
  <defs>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d11a2a"/>
      <stop offset="0.6" stop-color="#f5a742"/>
      <stop offset="1" stop-color="#111116"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#d8d0c4" stroke-width="2" stroke-dasharray="8 7"/>

  <rect x="22" y="24" width="${W - 44}" height="12" fill="url(#acc)"/>

  ${
    logo
      ? `<image href="${logo}" x="${(W - 210) / 2}" y="52" width="210" height="70" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${W / 2}" y="104" text-anchor="middle" font-size="40" font-weight="900" fill="#111116">GARAGE</text>`
  }

  <!-- Band nomor meja -->
  <rect x="34" y="150" width="${W - 68}" height="120" rx="10" fill="#111116"/>
  <text x="58" y="196" font-size="20" font-weight="800" letter-spacing="4" fill="#f5a742">MEJA</text>
  <text x="58" y="238" font-size="22" font-weight="800" fill="#ffffff">SCAN UNTUK PESAN</text>
  <text x="${W - 58}" y="252" text-anchor="end" font-size="118" font-weight="900" fill="#ffffff">${escapeXml(table)}</text>

  <!-- QR -->
  <rect x="${qrX - 16}" y="${qrY - 16}" width="${qrBox + 32}" height="${qrBox + 32}" rx="8" fill="#ffffff" stroke="#e3ddd2" stroke-width="2"/>
  <g transform="translate(${qrX}, ${qrY}) scale(${qrScale})">${qrPaths}</g>

  <!-- Instruksi 3 langkah -->
  <text x="${W / 2}" y="${qrY + qrBox + 58}" text-anchor="middle" font-size="26" font-weight="900" fill="#d11a2a" letter-spacing="1">SCAN DENGAN KAMERA HP</text>
  <text x="${W / 2}" y="${qrY + qrBox + 90}" text-anchor="middle" font-size="17" font-weight="700" fill="#5f554b">1. Scan  ·  2. Pilih menu  ·  3. Kirim ke kasir</text>

  <!-- URL fallback -->
  <text x="${W / 2}" y="${qrY + qrBox + 118}" text-anchor="middle" font-size="11" fill="#9a9086">${escapeXml(orderUrl)}</text>

  <!-- Footer -->
  <line x1="34" y1="${H - 70}" x2="${W - 34}" y2="${H - 70}" stroke="#e3ddd2" stroke-width="2"/>
  <text x="34" y="${H - 42}" font-size="15" font-weight="800" letter-spacing="1" fill="#5f554b">GARAGE COFFEE &amp; MOTOR</text>
  <text x="34" y="${H - 24}" font-size="11" fill="#9a9086">Butuh bantuan? Panggil pelayan.</text>
  <text x="${W - 34}" y="${H - 30}" text-anchor="end" font-size="30" font-weight="900" fill="#d11a2a">${escapeXml(table)}</text>
</svg>`;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-qr-card", { limit: 180, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  const table = normalizeQrTableNumber(url.searchParams.get("table"));
  if (!table) {
    return Response.json(
      { error: { code: "INVALID_TABLE", message: "Nomor meja harus 1 sampai 50." } },
      { status: 400 },
    );
  }

  const baseUrl = configuredPublicOrigin() ?? requestOrigin(request);
  const orderUrl = garageQrOrderUrl(baseUrl, table);
  const svg = await buildQrCardSvg(table, orderUrl);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Garage-Order-Url": orderUrl,
    },
  });
}
