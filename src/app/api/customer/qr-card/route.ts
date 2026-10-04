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
 * Rakit KARTU QR meja (SVG vektor, 540×840 — sama dengan tata letak PDF):
 * header hitam + logo di chip putih, nomor meja raksasa, QR dengan bingkai
 * bidik merah, 3 langkah bernomor, footer hitam + nomor meja di blok merah.
 * Badan kartu putih agar hemat tinta & QR paling mudah discan.
 */
export async function buildQrCardSvg(table: string, orderUrl: string): Promise<string> {
  const W = 540;
  const H = 840;

  const qrSvg = await QRCode.toString(orderUrl, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0b0f", light: "#ffffff" },
  });
  const vbMatch = qrSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const qrN = vbMatch ? parseFloat(vbMatch[1]) : 25;
  const qrPaths = (qrSvg.match(/<path[\s\S]*?\/>/g) ?? []).join("");

  const qrBox = 250;
  const qrX = (W - qrBox) / 2;
  const qrY = 326;
  const qrScale = qrBox / qrN;
  const pad = 18; // jarak bingkai bidik dari QR
  const arm = 34; // panjang lengan sudut bingkai
  const bx0 = qrX - pad;
  const by0 = qrY - pad;
  const bx1 = qrX + qrBox + pad;
  const by1 = qrY + qrBox + pad;
  const corner = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${x} ${y + dy * arm} L${x} ${y} L${x + dx * arm} ${y}" fill="none" stroke="#d11a2a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;

  const steps = [
    { x: 120, label: "Scan QR" },
    { x: 270, label: "Pilih menu" },
    { x: 420, label: "Kirim pesanan" },
  ];

  const logo = logoDataUri();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
  <defs>
    <clipPath id="card"><rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="22"/></clipPath>
  </defs>

  <!-- Garis potong -->
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="28" fill="none" stroke="#cfc8bc" stroke-width="2" stroke-dasharray="9 7"/>

  <g clip-path="url(#card)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>

    <!-- Header -->
    <rect x="0" y="0" width="${W}" height="128" fill="#111116"/>
    <rect x="0" y="128" width="${W}" height="8" fill="#d11a2a"/>
    <rect x="${(W - 248) / 2}" y="30" width="248" height="76" rx="14" fill="#f4f4f5"/>
    ${
      logo
        ? `<image href="${logo}" x="${(W - 220) / 2}" y="36" width="220" height="64" preserveAspectRatio="xMidYMid meet"/>`
        : `<text x="${W / 2}" y="82" text-anchor="middle" font-size="38" font-weight="900" fill="#111116">GARAGE</text>`
    }

    <!-- Nomor meja -->
    <text x="${W / 2}" y="178" text-anchor="middle" font-size="20" font-weight="800" letter-spacing="12" fill="#d11a2a">MEJA</text>
    <text x="${W / 2}" y="294" text-anchor="middle" font-size="140" font-weight="900" letter-spacing="-3" fill="#111116">${escapeXml(table)}</text>

    <!-- QR + bingkai bidik -->
    <g transform="translate(${qrX}, ${qrY}) scale(${qrScale})">${qrPaths}</g>
    ${corner(bx0, by0, 1, 1)}
    ${corner(bx1, by0, -1, 1)}
    ${corner(bx0, by1, 1, -1)}
    ${corner(bx1, by1, -1, -1)}

    <!-- Ajakan + 3 langkah -->
    <text x="${W / 2}" y="${by1 + 42}" text-anchor="middle" font-size="23" font-weight="900" letter-spacing="1" fill="#111116">SCAN &amp; PESAN DARI MEJA</text>
    ${steps
      .map(
        (step, index) => `<circle cx="${step.x}" cy="${by1 + 74}" r="16" fill="#d11a2a"/>
    <text x="${step.x}" y="${by1 + 80}" text-anchor="middle" font-size="17" font-weight="900" fill="#ffffff">${index + 1}</text>
    <text x="${step.x}" y="${by1 + 108}" text-anchor="middle" font-size="15" font-weight="700" fill="#3a332c">${step.label}</text>`,
      )
      .join("\n    ")}
    <line x1="${steps[0].x + 26}" y1="${by1 + 74}" x2="${steps[1].x - 26}" y2="${by1 + 74}" stroke="#e3ddd2" stroke-width="3" stroke-dasharray="4 5"/>
    <line x1="${steps[1].x + 26}" y1="${by1 + 74}" x2="${steps[2].x - 26}" y2="${by1 + 74}" stroke="#e3ddd2" stroke-width="3" stroke-dasharray="4 5"/>

    <!-- Footer -->
    <rect x="0" y="${H - 96}" width="${W}" height="96" fill="#111116"/>
    <text x="40" y="${H - 54}" font-size="17" font-weight="900" letter-spacing="1.5" fill="#ffffff">GARAGE COFFEE &amp; MOTOR</text>
    <text x="40" y="${H - 30}" font-size="13" font-weight="700" fill="#f5a742">Butuh bantuan? Panggil pelayan.</text>
    <rect x="${W - 150}" y="${H - 96}" width="150" height="96" fill="#d11a2a"/>
    <text x="${W - 75}" y="${H - 62}" text-anchor="middle" font-size="12" font-weight="800" letter-spacing="4" fill="#ffd7dc">MEJA</text>
    <text x="${W - 75}" y="${H - 24}" text-anchor="middle" font-size="40" font-weight="900" fill="#ffffff">${escapeXml(table)}</text>
  </g>

  <!-- URL cadangan (di luar area potong bawah tetap terbaca di cetakan) -->
  <text x="${W / 2}" y="${H - 110}" text-anchor="middle" font-size="10" fill="#9a9086">${escapeXml(orderUrl)}</text>
</svg>`;
}

// Outlet opsional di link QR (multi-outlet). Hanya UUID valid yang diteruskan.
function qrOutletId(url: URL) {
  const raw = url.searchParams.get("outletId");
  return raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-qr-card", { limit: 180, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  const table = normalizeQrTableNumber(url.searchParams.get("table"));
  if (!table) {
    return Response.json(
      { error: { code: "INVALID_TABLE", message: "Nomor meja harus 01 sampai 50." } },
      { status: 400 },
    );
  }

  const baseUrl = configuredPublicOrigin() ?? requestOrigin(request);
  const orderUrl = garageQrOrderUrl(baseUrl, table, qrOutletId(url));
  const svg = await buildQrCardSvg(table, orderUrl);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Garage-Order-Url": orderUrl,
    },
  });
}
