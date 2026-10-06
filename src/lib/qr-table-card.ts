// =============================================================================
// KARTU QR MEJA — desain owner Okt 2026 ("Scan & Pesan dari Meja").
// Satu tata letak (draw list) dirender ke DUA keluaran yang identik:
//   - SVG  → /api/customer/qr-card (pratinjau & unduh PNG di /order/qr-print)
//   - PDF  → /api/customer/qr-cards/pdf (cetak, 2 kartu per A4 landscape)
// QR selalu dibangun dari garageQrOrderUrl(meja) yang sama dengan angka besar
// di kartu → nomor meja di kartu & isi QR tidak mungkin berbeda.
// Kanvas logis 600×900 (rasio 2:3).
// =============================================================================

import QRCode from "qrcode";

export const CARD_W = 600;
export const CARD_H = 900;

export const CARD_CONTACT = {
  whatsapp: "+62 851-2155-2341",
  website: "www.garagecoffee.id",
  phone: "0812 3491 5936",
};

const RED = "#d11a2a";
const INK = "#111114";
const PAPER = "#f4f4f4";

// Ikon lucide (viewBox 24, stroke) — dipakai di SVG & PDF (doc.path).
const ICON = {
  utensils: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  cup: "m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8 M5 8h14 M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0 M12 8l1-6h2",
  bike: "M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0 M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0 M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12 17.5V14l-3-3 4-3 2 3h2",
  wifi: "M12 20h.01 M2 8.82a15 15 0 0 1 20 0 M5 12.859a10 10 0 0 1 14 0 M8.5 16.429a5 5 0 0 1 7 0",
  chat: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
  globe: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20",
  phone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2z M12 18h.01",
  coffee: "M10 2v2 M14 2v2 M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1 M6 2v2",
  house: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  search: "m21 21-4.34-4.34 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  bag: "M16 10a4 4 0 0 1-8 0 M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  chevron: "m9 18 6-6-6-6",
} as const;

type Anchor = "start" | "middle" | "end";
export type CardItem =
  | { t: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; sw?: number }
  | { t: "poly"; pts: Array<[number, number]>; fill: string }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: "icon"; name: keyof typeof ICON; x: number; y: number; size: number; color: string; sw?: number }
  | {
      t: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      color: string;
      bold?: boolean;
      italic?: boolean;
      anchor?: Anchor;
      spacing?: number;
    }
  | { t: "logo"; x: number; y: number; w: number; h: number }
  | { t: "qr"; x: number; y: number; size: number; modules: boolean[][] }
  | { t: "group"; rotate: number; cx: number; cy: number; items: CardItem[] };

/** Matriks modul QR (vektor) — sama persis untuk SVG & PDF. */
export function qrModules(url: string): boolean[][] {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const rows: boolean[][] = [];
  for (let y = 0; y < n; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x += 1) row.push(Boolean(qr.modules.get(y, x)));
    rows.push(row);
  }
  return rows;
}

/** Tata letak lengkap satu kartu meja. */
export function buildCardLayout(table: string, orderUrl: string): CardItem[] {
  const items: CardItem[] = [];
  const add = (...next: CardItem[]) => items.push(...next);

  // ── Latar: putih kanan, hitam kiri dengan potongan diagonal ──
  add({ t: "rect", x: 0, y: 0, w: CARD_W, h: CARD_H, fill: PAPER });
  add({ t: "poly", pts: [[0, 0], [334, 0], [278, CARD_H], [0, CARD_H]], fill: "#0b0b0d" });
  add({ t: "poly", pts: [[334, 0], [344, 0], [288, CARD_H], [278, CARD_H]], fill: "#2a2a2e" });
  // garis aksen merah & abu (kiri atas / kiri bawah / kanan bawah)
  add({ t: "poly", pts: [[0, 36], [62, 0], [84, 0], [0, 50]], fill: RED });
  add({ t: "poly", pts: [[0, 70], [120, 0], [128, 0], [0, 76]], fill: "#3a3a3f" });
  add({ t: "poly", pts: [[0, 612], [60, 576], [60, 588], [0, 624]], fill: RED });
  add({ t: "poly", pts: [[0, 772], [74, 728], [74, 740], [0, 784]], fill: RED });
  add({ t: "poly", pts: [[CARD_W, 838], [CARD_W, 856], [540, CARD_H], [516, CARD_H]], fill: RED });
  add({ t: "poly", pts: [[CARD_W, 866], [CARD_W, CARD_H], [554, CARD_H]], fill: INK });

  // ── Kiri: logo GARAGE + COFFEE ──
  const lx = 162;
  add({ t: "logo", x: lx - 120, y: 70, w: 240, h: 54 });
  add({ t: "line", x1: lx - 112, y1: 146, x2: lx - 56, y2: 146, stroke: RED, sw: 3 });
  add({ t: "line", x1: lx + 56, y1: 146, x2: lx + 112, y2: 146, stroke: RED, sw: 3 });
  add({ t: "text", x: lx, y: 152, text: "COFFEE", size: 17, color: "#ffffff", bold: true, anchor: "middle", spacing: 6 });

  // ── Kiri: SCAN & PESAN DARI MEJA (miring) ──
  add({
    t: "group",
    rotate: -8,
    cx: lx,
    cy: 270,
    items: [
      { t: "text", x: 50, y: 226, text: "SCAN &", size: 44, color: "#ffffff", bold: true, italic: true },
      { t: "text", x: 40, y: 290, text: "PESAN", size: 68, color: RED, bold: true, italic: true },
      { t: "text", x: 70, y: 336, text: "DARI MEJA", size: 36, color: "#ffffff", bold: true, italic: true },
      { t: "line", x1: 130, y1: 350, x2: 236, y2: 346, stroke: RED, sw: 5 },
    ],
  });

  // ── Kiri: mockup HP ──
  const phone: CardItem[] = [
    { t: "rect", x: 50, y: 372, w: 226, h: 378, r: 30, fill: "#18181b", stroke: "#cfcfd6", sw: 3 },
    { t: "rect", x: 60, y: 382, w: 206, h: 358, r: 22, fill: "#0d0d10" },
    { t: "rect", x: 133, y: 382, w: 60, h: 12, r: 6, fill: "#000000" },
    { t: "text", x: 76, y: 404, text: "9:41", size: 10, color: "#ffffff", bold: true },
    { t: "logo", x: 98, y: 418, w: 130, h: 30 },
    { t: "line", x1: 104, y1: 458, x2: 130, y2: 458, stroke: RED, sw: 2 },
    { t: "line", x1: 196, y1: 458, x2: 222, y2: 458, stroke: RED, sw: 2 },
    { t: "text", x: 163, y: 461, text: "COFFEE", size: 8, color: "#ffffff", bold: true, anchor: "middle", spacing: 3 },
    { t: "text", x: 163, y: 496, text: "ORDER NOW", size: 20, color: "#ffffff", bold: true, anchor: "middle" },
  ];
  const options: Array<{ icon: keyof typeof ICON; label: string; sub?: string }> = [
    { icon: "utensils", label: "Dine In /", sub: "Table Order" },
    { icon: "cup", label: "Take Away" },
    { icon: "bike", label: "Delivery" },
  ];
  options.forEach((option, index) => {
    const y = 512 + index * 58;
    phone.push(
      { t: "rect", x: 74, y, w: 178, h: 48, r: 10, fill: "#17171b", stroke: "#3a3a42", sw: 1.2 },
      { t: "icon", name: option.icon, x: 84, y: y + 12, size: 24, color: RED, sw: 2 },
    );
    if (option.sub) {
      phone.push(
        { t: "text", x: 118, y: y + 21, text: option.label, size: 11, color: "#ffffff" },
        { t: "text", x: 118, y: y + 36, text: option.sub, size: 11, color: "#ffffff" },
      );
    } else {
      phone.push({ t: "text", x: 118, y: y + 29, text: option.label, size: 12, color: "#ffffff" });
    }
    phone.push({ t: "icon", name: "chevron", x: 230, y: y + 17, size: 14, color: "#ffffff", sw: 2.4 });
  });
  phone.push({ t: "rect", x: 60, y: 694, w: 206, h: 46, r: 0, fill: "#141417" });
  (["house", "search", "bag", "user"] as const).forEach((name, index) => {
    phone.push({ t: "icon", name, x: 78 + index * 50, y: 704, size: 18, color: index === 0 ? "#ffffff" : "#9b9ba3", sw: 2 });
  });
  phone.push({ t: "rect", x: 128, y: 730, w: 70, h: 3, r: 1.5, fill: "#ffffff" });
  add({ t: "group", rotate: -5, cx: 163, cy: 560, items: phone });

  // ── Kiri bawah: slogan + ikon ──
  add({ t: "text", x: lx, y: 784, text: "GOOD COFFEE", size: 12, color: "#ffffff", bold: true, anchor: "middle", spacing: 6 });
  add({ t: "text", x: lx, y: 802, text: "BETTER MOOD", size: 12, color: "#ffffff", bold: true, anchor: "middle", spacing: 6 });
  add({ t: "line", x1: lx - 26, y1: 814, x2: lx + 26, y2: 814, stroke: RED, sw: 3 });
  (["coffee", "utensils", "bike", "wifi"] as const).forEach((name, index) => {
    const x = 70 + index * 48;
    add({ t: "icon", name, x, y: 836, size: 20, color: "#ffffff", sw: 1.6 });
    if (index < 3) add({ t: "line", x1: x + 34, y1: 836, x2: x + 34, y2: 858, stroke: "#6b6b73", sw: 1.2 });
  });

  // ── Kanan: banner MEJA + nomor besar ──
  const rx = 462;
  add({ t: "poly", pts: [[378, 58], [570, 58], [552, 100], [360, 100]], fill: RED });
  add({ t: "text", x: rx - 3, y: 92, text: "MEJA", size: 32, color: "#ffffff", bold: true, anchor: "middle", spacing: 9 });
  add({ t: "text", x: rx, y: 292, text: table, size: 196, color: INK, bold: true, anchor: "middle", spacing: -6 });

  // ── Kanan: ajakan + QR ──
  add({ t: "text", x: 352, y: 334, text: "Login to our", size: 19, color: INK });
  add({ t: "text", x: rx, y: 386, text: "WEBSITE", size: 54, color: RED, bold: true, anchor: "middle" });
  const qrSize = 196;
  const qrX = rx - qrSize / 2;
  const qrY = 428;
  add({ t: "rect", x: qrX - 12, y: qrY - 12, w: qrSize + 24, h: qrSize + 24, fill: "#ffffff" });
  add({ t: "qr", x: qrX, y: qrY, size: qrSize, modules: qrModules(orderUrl) });
  const pad = 22;
  const arm = 30;
  const b0x = qrX - pad;
  const b0y = qrY - pad;
  const b1x = qrX + qrSize + pad;
  const b1y = qrY + qrSize + pad;
  for (const [x, y, dx, dy] of [
    [b0x, b0y, 1, 1],
    [b1x, b0y, -1, 1],
    [b0x, b1y, 1, -1],
    [b1x, b1y, -1, -1],
  ] as const) {
    add({ t: "line", x1: x, y1: y, x2: x + dx * arm, y2: y, stroke: RED, sw: 6 });
    add({ t: "line", x1: x, y1: y, x2: x, y2: y + dy * arm, stroke: RED, sw: 6 });
  }

  // ── Kanan: kontak ──
  const cx = 360;
  const tx = 392;
  add({ t: "circle", cx, cy: 686, r: 23, fill: RED });
  add({ t: "icon", name: "chat", x: cx - 12, y: 674, size: 24, color: "#ffffff", sw: 2 });
  add({ t: "text", x: tx, y: 676, text: "Chat via WhatsApp Resmi", size: 11.5, color: INK });
  add({ t: "text", x: tx, y: 700, text: CARD_CONTACT.whatsapp, size: 21, color: INK, bold: true });
  add({ t: "line", x1: tx, y1: 714, x2: tx + 84, y2: 714, stroke: RED, sw: 3 });
  add({ t: "circle", cx, cy: 748, r: 19, fill: RED });
  add({ t: "icon", name: "globe", x: cx - 10, y: 738, size: 20, color: "#ffffff", sw: 2 });
  add({ t: "text", x: tx, y: 744, text: "Website", size: 12, color: INK, bold: true });
  add({ t: "text", x: tx, y: 761, text: CARD_CONTACT.website, size: 13, color: INK });
  add({ t: "circle", cx, cy: 798, r: 19, fill: RED });
  add({ t: "icon", name: "phone", x: cx - 10, y: 788, size: 20, color: "#ffffff", sw: 2 });
  add({ t: "text", x: tx, y: 794, text: "Phone", size: 12, color: INK, bold: true });
  add({ t: "text", x: tx, y: 811, text: CARD_CONTACT.phone, size: 13, color: INK });

  add({ t: "text", x: rx - 10, y: 846, text: "SIMPLE ORDER", size: 12, color: INK, bold: true, anchor: "middle", spacing: 5 });
  add({ t: "text", x: rx - 10, y: 863, text: "GREAT TASTE", size: 12, color: INK, bold: true, anchor: "middle", spacing: 5 });
  add({ t: "line", x1: rx - 34, y1: 874, x2: rx + 14, y2: 874, stroke: RED, sw: 3 });

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer SVG
// ─────────────────────────────────────────────────────────────────────────────

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function svgItem(item: CardItem, logoHref: string | null): string {
  switch (item.t) {
    case "rect":
      return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"${item.r ? ` rx="${item.r}"` : ""} fill="${
        item.fill ?? "none"
      }"${item.stroke ? ` stroke="${item.stroke}" stroke-width="${item.sw ?? 1}"` : ""}/>`;
    case "poly":
      return `<polygon points="${item.pts.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${item.fill}"/>`;
    case "circle":
      return `<circle cx="${item.cx}" cy="${item.cy}" r="${item.r}" fill="${item.fill ?? "none"}"${
        item.stroke ? ` stroke="${item.stroke}" stroke-width="${item.sw ?? 1}"` : ""
      }/>`;
    case "line":
      return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${item.stroke}" stroke-width="${item.sw}" stroke-linecap="round"/>`;
    case "icon": {
      const s = item.size / 24;
      return `<g transform="translate(${item.x} ${item.y}) scale(${s})"><path d="${ICON[item.name]}" fill="none" stroke="${item.color}" stroke-width="${
        item.sw ?? 2
      }" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
    case "text": {
      const family = item.bold ? "'Arial Black','Helvetica Neue',Arial,Helvetica,sans-serif" : "Arial,Helvetica,sans-serif";
      const attrs = `font-family="${family}" font-size="${item.size}" font-weight="${item.bold ? 900 : 400}" fill="${item.color}" text-anchor="${
        item.anchor ?? "start"
      }"${item.spacing ? ` letter-spacing="${item.spacing}"` : ""}`;
      // Miring lewat transform (bukan font-style) supaya tetap miring walau font italic tidak ada.
      if (item.italic) {
        return `<g transform="translate(${item.x} ${item.y}) skewX(-12)"><text x="0" y="0" ${attrs}>${esc(item.text)}</text></g>`;
      }
      return `<text x="${item.x}" y="${item.y}" ${attrs}>${esc(item.text)}</text>`;
    }
    case "logo":
      return logoHref
        ? `<image href="${logoHref}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" preserveAspectRatio="xMidYMid meet"/>`
        : `<text x="${item.x + item.w / 2}" y="${item.y + item.h * 0.8}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${
            item.h * 0.85
          }" font-weight="900" fill="#e4e4e7">GARAGE</text>`;
    case "qr": {
      const n = item.modules.length;
      const m = item.size / n;
      let d = "";
      item.modules.forEach((row, y) =>
        row.forEach((on, x) => {
          if (on) d += `M${(item.x + x * m).toFixed(3)} ${(item.y + y * m).toFixed(3)}h${m.toFixed(3)}v${m.toFixed(3)}h${(-m).toFixed(3)}z`;
        }),
      );
      return `<path d="${d}" fill="#0b0b0f" shape-rendering="crispEdges"/>`;
    }
    case "group":
      return `<g transform="rotate(${item.rotate} ${item.cx} ${item.cy})">${item.items.map((child) => svgItem(child, logoHref)).join("")}</g>`;
  }
}

/** Kartu sebagai SVG mandiri (logo disematkan sebagai data URI). */
export function renderCardSvg(items: CardItem[], logoHref: string | null) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">${items
    .map((item) => svgItem(item, logoHref))
    .join("")}</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer PDF (pdfkit) — koordinat kartu diskalakan ke kotak (x, y, w, h)
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function pdfItem(doc: any, item: CardItem, logo: unknown) {
  switch (item.t) {
    case "rect":
      if (item.r) doc.roundedRect(item.x, item.y, item.w, item.h, item.r);
      else doc.rect(item.x, item.y, item.w, item.h);
      if (item.fill && item.stroke) doc.lineWidth(item.sw ?? 1).fillAndStroke(item.fill, item.stroke);
      else if (item.fill) doc.fill(item.fill);
      else if (item.stroke) doc.lineWidth(item.sw ?? 1).stroke(item.stroke);
      return;
    case "poly":
      doc.polygon(...item.pts).fill(item.fill);
      return;
    case "circle":
      doc.circle(item.cx, item.cy, item.r);
      if (item.fill) doc.fill(item.fill);
      else if (item.stroke) doc.lineWidth(item.sw ?? 1).stroke(item.stroke);
      return;
    case "line":
      doc.save().lineCap("round").lineWidth(item.sw).moveTo(item.x1, item.y1).lineTo(item.x2, item.y2).stroke(item.stroke).restore();
      return;
    case "icon": {
      const s = item.size / 24;
      doc.save().translate(item.x, item.y).scale(s).lineWidth(item.sw ?? 2).lineCap("round").lineJoin("round");
      doc.path(ICON[item.name]).stroke(item.color);
      doc.restore();
      return;
    }
    case "text": {
      const font = item.bold ? (item.italic ? "Helvetica-BoldOblique" : "Helvetica-Bold") : item.italic ? "Helvetica-Oblique" : "Helvetica";
      doc.font(font).fontSize(item.size).fillColor(item.color);
      const spacing = item.spacing ?? 0;
      const width = doc.widthOfString(item.text, { characterSpacing: spacing }) - (spacing > 0 ? spacing : 0);
      const x = item.anchor === "middle" ? item.x - width / 2 : item.anchor === "end" ? item.x - width : item.x;
      doc.text(item.text, x, item.y, { lineBreak: false, baseline: "alphabetic", characterSpacing: spacing });
      return;
    }
    case "logo":
      if (logo) doc.image(logo, item.x, item.y, { fit: [item.w, item.h], align: "center", valign: "center" });
      return;
    case "qr": {
      const n = item.modules.length;
      const m = item.size / n;
      item.modules.forEach((row, y) =>
        row.forEach((on, x) => {
          if (on) doc.rect(item.x + x * m, item.y + y * m, m + 0.05, m + 0.05);
        }),
      );
      doc.fill("#0b0b0f");
      return;
    }
    case "group":
      doc.save().rotate(item.rotate, { origin: [item.cx, item.cy] });
      item.items.forEach((child) => pdfItem(doc, child, logo));
      doc.restore();
      return;
  }
}

/**
 * Gambar satu kartu di PDF, pas di kotak (x, y, w, h) dengan garis potong putus-putus.
 * `logo` sebaiknya hasil doc.openImage(buffer) — dimuat SEKALI per dokumen
 * (Buffer mentah akan disematkan ulang di setiap kartu → PDF membengkak).
 */
export function drawCardPdf(doc: any, items: CardItem[], logo: unknown, box: { x: number; y: number; w: number; h: number }) {
  const s = Math.min(box.w / CARD_W, box.h / CARD_H);
  const ox = box.x + (box.w - CARD_W * s) / 2;
  const oy = box.y + (box.h - CARD_H * s) / 2;
  doc.save().translate(ox, oy).scale(s);
  doc.rect(0, 0, CARD_W, CARD_H).clip();
  items.forEach((item) => pdfItem(doc, item, logo));
  doc.restore();
  doc.save().lineWidth(0.6).dash(4, { space: 3 }).rect(ox, oy, CARD_W * s, CARD_H * s).stroke("#bdb6aa").undash().restore();
}
/* eslint-enable @typescript-eslint/no-explicit-any */
