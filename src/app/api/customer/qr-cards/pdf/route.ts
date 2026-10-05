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
      // Wordmark GARAGE saja (tanpa tagline "Coffee & Motor") khusus kartu meja.
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

// Kartu PDF = tata letak yang sama dengan SVG /api/customer/qr-card (540×840),
// digambar ulang dengan pdfkit pada skala kartu (2×2 per A4 → QR ±6 cm).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCard(doc: any, x: number, y: number, w: number, h: number, table: string, qrBuf: Buffer, logoBuf: Buffer | null) {
  const s = Math.min(w / 540, h / 840);
  const W = 540 * s;
  const H = 840 * s;
  const ox = x + (w - W) / 2;
  const oy = y + (h - H) / 2;
  const X = (v: number) => ox + v * s;
  const Y = (v: number) => oy + v * s;
  // Teks dengan koordinat baseline seperti SVG (pdfkit memakai sisi atas kotak teks).
  const text = (
    value: string,
    cx: number,
    baseline: number,
    size: number,
    opts: { color: string; bold?: boolean; align?: "center" | "left"; spacing?: number },
  ) => {
    const fs = size * s;
    doc.font(opts.bold === false ? "Helvetica" : "Helvetica-Bold").fontSize(fs).fillColor(opts.color);
    const top = Y(baseline) - fs * 0.76;
    if (opts.align === "left") {
      doc.text(value, X(cx), top, { lineBreak: false, characterSpacing: (opts.spacing ?? 0) * s });
    } else {
      const boxW = W;
      doc.text(value, X(cx) - boxW / 2, top, {
        width: boxW,
        align: "center",
        lineBreak: false,
        characterSpacing: (opts.spacing ?? 0) * s,
      });
    }
  };

  // Garis potong.
  doc.save().lineWidth(0.8).strokeColor("#cfc8bc").dash(4, { space: 3 })
    .roundedRect(X(4), Y(4), 532 * s, 832 * s, 28 * s).stroke().undash().restore();

  doc.save();
  doc.roundedRect(X(14), Y(14), 512 * s, 812 * s, 22 * s).clip();
  doc.rect(X(0), Y(0), W, H).fill("#ffffff");

  // Header: logo krom langsung di atas hitam + glow merah halus.
  const hdr = doc.linearGradient(X(0), Y(0), X(0), Y(170));
  hdr.stop(0, "#1c1c22").stop(1, "#0a0a0d");
  doc.rect(X(0), Y(0), W, 170 * s).fill(hdr);
  const glow = doc.radialGradient(X(270), Y(78), 0, X(270), Y(78), 230 * s);
  glow.stop(0, "#d11a2a", 0.38).stop(1, "#d11a2a", 0);
  doc.save();
  doc.ellipse(X(270), Y(78), 230 * s, 70 * s).fill(glow);
  doc.restore();
  if (logoBuf) {
    doc.image(logoBuf, X((540 - 400) / 2), Y(34), { fit: [400 * s, 90 * s], align: "center", valign: "center" });
  } else {
    text("GARAGE", 270, 104, 64, { color: "#e4e4e7" });
  }
  doc.save().lineWidth(2.5 * s).strokeColor("#d11a2a");
  doc.moveTo(X(270 - 150), Y(143)).lineTo(X(270 - 78), Y(143)).stroke();
  doc.moveTo(X(270 + 78), Y(143)).lineTo(X(270 + 150), Y(143)).stroke();
  doc.restore();
  text("COFFEE", 270, 150, 20, { color: "#d4d4d8", spacing: 9 });
  doc.rect(X(0), Y(170), W, 6 * s).fill("#d11a2a");

  // Nomor meja.
  text("MEJA", 270, 212, 18, { color: "#d11a2a", spacing: 12 });
  text(table, 270, 320, 128, { color: "#111116", spacing: -3 });

  // QR + bingkai bidik.
  const qrBox = 236;
  const qrX = (540 - qrBox) / 2;
  const qrY = 350;
  doc.image(qrBuf, X(qrX), Y(qrY), { width: qrBox * s, height: qrBox * s });
  const pad = 18;
  const arm = 34;
  const bx0 = qrX - pad;
  const by0 = qrY - pad;
  const bx1 = qrX + qrBox + pad;
  const by1 = qrY + qrBox + pad;
  doc.save().lineWidth(7 * s).strokeColor("#d11a2a").lineCap("round").lineJoin("round");
  for (const [cx, cy, dx, dy] of [
    [bx0, by0, 1, 1],
    [bx1, by0, -1, 1],
    [bx0, by1, 1, -1],
    [bx1, by1, -1, -1],
  ]) {
    doc.moveTo(X(cx), Y(cy + dy * arm)).lineTo(X(cx), Y(cy)).lineTo(X(cx + dx * arm), Y(cy)).stroke();
  }
  doc.restore();

  // Ajakan + 3 langkah.
  text("SCAN & PESAN DARI MEJA", 270, by1 + 40, 22, { color: "#111116", spacing: 1 });
  const steps = [
    { x: 120, label: "Scan QR" },
    { x: 270, label: "Pilih menu" },
    { x: 420, label: "Kirim pesanan" },
  ];
  doc.save().lineWidth(3 * s).strokeColor("#e3ddd2").dash(4 * s, { space: 5 * s });
  doc.moveTo(X(steps[0].x + 26), Y(by1 + 72)).lineTo(X(steps[1].x - 26), Y(by1 + 72)).stroke();
  doc.moveTo(X(steps[1].x + 26), Y(by1 + 72)).lineTo(X(steps[2].x - 26), Y(by1 + 72)).stroke();
  doc.undash().restore();
  steps.forEach((step, index) => {
    doc.circle(X(step.x), Y(by1 + 72), 16 * s).fill("#d11a2a");
    text(String(index + 1), step.x, by1 + 78, 17, { color: "#ffffff" });
    text(step.label, step.x, by1 + 104, 15, { color: "#3a332c" });
  });

  // Footer.
  doc.rect(X(0), Y(840 - 96), W, 96 * s).fill("#111116");
  text("GARAGE COFFEE", 40, 840 - 54, 18, { color: "#ffffff", align: "left", spacing: 2 });
  text("Butuh bantuan? Panggil pelayan.", 40, 840 - 30, 13, { color: "#f5a742", align: "left" });
  doc.rect(X(540 - 150), Y(840 - 96), 150 * s, 96 * s).fill("#d11a2a");
  text("MEJA", 540 - 75, 840 - 62, 12, { color: "#ffd7dc", spacing: 4 });
  text(table, 540 - 75, 840 - 24, 40, { color: "#ffffff" });
  doc.restore();
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
    // 2×2 kartu per A4 (±12×18 cm, QR ±6 cm) — lebih mudah discan dari kursi.
    const cols = 2;
    const rows = 2;
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
