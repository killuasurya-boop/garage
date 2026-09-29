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

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-qr", { limit: 180, windowMs: 60_000 });
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

  // Opsi PNG resolusi tinggi untuk cetak (tidak pecah). ?format=png&size=1600
  // (default 1024, maksimum 3000). SVG tetap default untuk render layar tajam.
  const format = url.searchParams.get("format")?.toLowerCase();
  if (format === "png") {
    const rawSize = Number(url.searchParams.get("size"));
    const width = Math.min(
      3000,
      Math.max(256, Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 1024),
    );
    const png = await QRCode.toBuffer(orderUrl, {
      type: "png",
      width,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f0f14", light: "#ffffff" },
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="qr-meja-${table}.png"`,
        "X-Garage-Order-Url": orderUrl,
      },
    });
  }

  const svg = await QRCode.toString(orderUrl, {
    type: "svg",
    width: 420,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0f0f14",
      light: "#ffffff",
    },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Garage-Order-Url": orderUrl,
    },
  });
}
