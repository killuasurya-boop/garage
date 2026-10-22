import { readFileSync } from "fs";
import { join } from "path";

import {
  garageQrOrderUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";
import { buildCardLayout, renderCardSvg } from "@/lib/qr-table-card";
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
      // Wordmark GARAGE saja (tanpa tagline "Coffee · Tebing Tinggi") khusus kartu meja.
      join(process.cwd(), "public", "garage-brand", "logo-wordmark.png"),
    );
    logoDataUriCache = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    logoDataUriCache = null;
  }
  return logoDataUriCache;
}

/**
 * Kartu QR meja (SVG vektor 600×900) — desain "Scan & Pesan dari Meja".
 * Tata letak tunggal di lib/qr-table-card (dipakai juga oleh PDF cetak).
 */
async function buildQrCardSvg(table: string, orderUrl: string): Promise<string> {
  return renderCardSvg(buildCardLayout(table, orderUrl), logoDataUri());
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
