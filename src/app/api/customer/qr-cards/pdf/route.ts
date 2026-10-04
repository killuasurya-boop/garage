import { readFileSync } from "node:fs";
import { join } from "node:path";

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import {
  QR_TABLE_NUMBERS,
  garageQrOrderUrl,
  normalizeGarageBaseUrl,
  normalizeQrTableNumber,
} from "@/lib/garage-qr";
import { getActiveTableNumbers } from "@/lib/garage-service";
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
      join(process.cwd(), "public", "garage-brand", "logo-website.png"),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCard(doc: any, x: number, y: number, w: number, h: number, table: string, qrBuf: Buffer, logoBuf: Buffer | null) {
  // Garis potong (dashed) untuk gunting stiker.
  doc.save().lineWidth(0.7).strokeColor("#cfcabf").dash(4, { space: 3 })
    .rect(x, y, w, h).stroke().undash().restore();

  // Aksen atas.
  doc.rect(x + 12, y + 12, w - 24, 6).fill("#d11a2a");

  // Logo / brand.
  if (logoBuf) {
    doc.image(logoBuf, x + (w - 96) / 2, y + 24, { width: 96 });
  } else {
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#111116")
      .text("GARAGE", x, y + 28, { width: w, align: "center" });
  }

  // Band nomor meja.
  const bandY = y + 60;
  const bandH = 48;
  doc.roundedRect(x + 14, bandY, w - 28, bandH, 5).fill("#111116");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#f5a742")
    .text("MEJA", x + 24, bandY + 9, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff")
    .text("SCAN UNTUK PESAN", x + 24, bandY + 25, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(34).fillColor("#ffffff")
    .text(table, x + w - 24 - 70, bandY + 6, { width: 70, align: "right", lineBreak: false });

  // QR.
  const qr = 112;
  const qrY = bandY + bandH + 10;
  doc.image(qrBuf, x + (w - qr) / 2, qrY, { width: qr, height: qr });

  // Instruksi.
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#d11a2a")
    .text("SCAN DENGAN KAMERA HP", x, qrY + qr + 8, { width: w, align: "center" });
  doc.font("Helvetica").fontSize(7).fillColor("#5f554b")
    .text("1. Scan  ·  2. Pilih menu  ·  3. Kirim ke kasir", x, qrY + qr + 21, { width: w, align: "center" });

  // Footer nomor.
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#d11a2a")
    .text(table, x + w - 44, y + h - 24, { width: 32, align: "right", lineBreak: false });
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

  // Pra-generate QR PNG hi-res per meja.
  const qrByTable = new Map<string, Buffer>();
  for (const table of tables) {
    const orderUrl = garageQrOrderUrl(baseUrl, table, qrOutletId(url));
    const buf = await QRCode.toBuffer(orderUrl, {
      type: "png",
      width: 600,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0b0f", light: "#ffffff" },
    });
    qrByTable.set(table, buf);
  }

  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 30;
    const cols = 2;
    const rows = 3;
    const gap = 16;
    const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cardH = (pageH - margin * 2 - gap * (rows - 1)) / rows;
    const perPage = cols * rows;

    tables.forEach((table, i) => {
      const slot = i % perPage;
      if (i > 0 && slot === 0) doc.addPage();
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const x = margin + col * (cardW + gap);
      const y = margin + row * (cardH + gap);
      drawCard(doc, x, y, cardW, cardH, table, qrByTable.get(table)!, logoBuf);
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
