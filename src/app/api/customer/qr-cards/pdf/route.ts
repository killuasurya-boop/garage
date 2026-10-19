import { readFileSync } from "node:fs";
import { join } from "node:path";

import PDFDocument from "pdfkit";

import {
  QR_TABLE_NUMBERS,
  garageQrOrderUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";
import { getActiveTableNumbers } from "@/lib/garage-service";
import { buildCardLayout, drawCardPdf } from "@/lib/qr-table-card";
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

let logoBufCache: Buffer | null | undefined;
function logoBuffer(): Buffer | null {
  if (logoBufCache !== undefined) return logoBufCache;
  try {
    logoBufCache = readFileSync(
      // Wordmark GARAGE saja (tanpa tagline "Coffee · Tebing Tinggi") khusus kartu meja.
      join(process.cwd(), "public", "garage-brand", "logo-wordmark.png"),
    );
  } catch {
    logoBufCache = null;
  }
  return logoBufCache;
}

function selectedTables(raw: string | null): string[] {
  if (!raw) return QR_TABLE_NUMBERS;
  const tables = raw
    .split(",")
    .map((t) => normalizeQrTableNumber(t))
    .filter((t): t is string => Boolean(t));
  return tables.length ? Array.from(new Set(tables)) : QR_TABLE_NUMBERS;
}

// Outlet opsional di link QR (multi-outlet). Hanya UUID valid yang diteruskan.
function qrOutletId(url: URL) {
  const raw = url.searchParams.get("outletId");
  return raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-qr-pdf", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  // Tanpa ?tables → meja aktif outlet (menu Atur Meja), bukan selalu 50 kartu.
  const tables = url.searchParams.get("tables")
    ? selectedTables(url.searchParams.get("tables"))
    : await getActiveTableNumbers().catch(() => QR_TABLE_NUMBERS);
  const baseUrl = configuredPublicOrigin() ?? requestOrigin(request);
  const logoBuf = logoBuffer();

  const outletId = qrOutletId(url);

  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    // A4 landscape, 2 kartu berdampingan (±13 × 19,5 cm — ukuran standee A5).
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- openImage belum ada di tipe pdfkit
    const logoImage = logoBuf ? (doc as any).openImage(logoBuf) : null;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 24;
    const gap = 24;
    const cardW = (pageW - margin * 2 - gap) / 2;
    const cardH = pageH - margin * 2;

    tables.forEach((table, i) => {
      const slot = i % 2;
      if (i > 0 && slot === 0) doc.addPage();
      // QR & angka besar dibangun dari nomor meja yang SAMA (tidak bisa beda).
      const items = buildCardLayout(table, garageQrOrderUrl(baseUrl, table, outletId));
      drawCardPdf(doc, items, logoImage, { x: margin + slot * (cardW + gap), y: margin, w: cardW, h: cardH });
    });

    doc.end();
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="GARAGE-QR-Meja.pdf"`,
    },
  });
}
