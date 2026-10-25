import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import QRCode from "qrcode";

import type { MemberLevel } from "@/lib/member-types";
import {
  CARD_BRAND_LINE,
  CARD_WEBSITE,
  cardMemberSince,
  cardPerks,
  cardValidity,
  formatMemberCode,
  memberQrPayload,
  optionalCardText,
} from "@/lib/membership-card-model";

type MembershipCardPdfData = {
  name: string;
  phone: string;
  tier: string;
  memberCode?: string | null;
  membershipSince?: string | Date | null;
  expiresAt?: string | Date | null;
  address?: string | null;
  points?: number | null;
  ultraCandidate?: boolean | null;
};

const tierTheme: Record<MemberLevel, { accent: string; dark: string; soft: string; muted: string }> = {
  Silver: {
    accent: "#A8B0C0",
    dark: "#1A1D26",
    soft: "#D0D4E0",
    muted: "#C3C8D4",
  },
  Gold: {
    accent: "#C89828",
    dark: "#0D0B09",
    soft: "#D4B040",
    muted: "#D9BC6A",
  },
  Platinum: {
    accent: "#6090B8",
    dark: "#080D18",
    soft: "#D0E8F8",
    muted: "#9EC2E4",
  },
  Ultra: {
    accent: "#8050E0",
    dark: "#060408",
    soft: "#B890FF",
    muted: "#C2A8EC",
  },
};

function normalizeTier(tier: string): MemberLevel {
  if (tier === "Ultra") return "Ultra";
  if (tier === "Platinum") return "Platinum";
  if (tier === "Gold") return "Gold";
  return "Silver";
}

function drawCardFace(
  doc: PDFKit.PDFDocument,
  input: MembershipCardPdfData,
  x: number,
  y: number,
  title: "FRONT" | "BACK",
  qrPng: string,
) {
  const tier = normalizeTier(input.tier);
  const theme = tierTheme[tier];
  const width = 360;
  const height = 226;
  const code = input.memberCode ?? `${tier.slice(0, 3).toUpperCase()}-${input.phone.slice(-4)}`;
  const validity = cardValidity({ expiresAt: input.expiresAt });

  doc.save();
  doc.roundedRect(x, y, width, height, 16).fill(theme.dark);
  // Hiasan dipotong di dalam kartu (sebelumnya meluber ke kertas).
  doc.save();
  doc.roundedRect(x, y, width, height, 16).clip();
  doc.opacity(0.18).fillColor(theme.accent).circle(x + width - 60, y + 42, 90).fill().opacity(1);
  doc.restore();
  doc.roundedRect(x + 1, y + 1, width - 2, height - 2, 15).strokeColor(theme.accent).lineWidth(1.4).stroke();

  const label = (text: string, lx: number, ly: number, options?: PDFKit.Mixins.TextOptions) =>
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(theme.muted).text(text, lx, ly, { characterSpacing: 1, ...options });
  const value = (text: string, vx: number, vy: number, options?: PDFKit.Mixins.TextOptions) =>
    doc.font("Helvetica-Bold").fontSize(11).fillColor(theme.soft).text(text, vx, vy, { lineBreak: false, ...options });

  if (title === "FRONT") {
    doc.font("Helvetica-Bold").fontSize(22).fillColor(theme.soft).text("GARAGE", x + 24, y + 22);
    label(CARD_BRAND_LINE, x + 25, y + 47);
    label("MEMBER TIER", x + width - 132, y + 24, { width: 108, align: "right" });
    doc.font("Helvetica-Bold").fontSize(20).fillColor(theme.accent).text(tier.toUpperCase(), x + width - 162, y + 36, { width: 138, align: "right" });

    doc.roundedRect(x + width - 106, y + 74, 82, 82, 6).fill("#FFFFFF");
    doc.image(qrPng, x + width - 102, y + 78, { width: 74, height: 74 });

    doc.font("Helvetica-Bold").fontSize(15).fillColor(theme.soft).text((input.name || "Member Garage").slice(0, 28), x + 24, y + 92, { width: 220, lineBreak: false });
    doc.font("Courier-Bold").fontSize(12).fillColor(theme.soft).text(formatMemberCode(code), x + 24, y + 116, { width: 220, lineBreak: false });

    label("MEMBER SEJAK", x + 24, y + 176);
    value(cardMemberSince(input.membershipSince) ?? "-", x + 24, y + 188, { width: 150 });
    label(validity.label, x + 200, y + 176, { width: 136, align: "right" });
    value(validity.value, x + 200, y + 188, { width: 136, align: "right" });
  } else {
    label("BENEFIT", x + 24, y + 22);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(theme.accent).text(tier.toUpperCase(), x + 24, y + 34);
    cardPerks(tier)
      .perks.slice(0, 4)
      .forEach((perk, index) => {
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(theme.soft).text(`- ${optionalCardText(perk, 40) ?? ""}`, x + 24, y + 60 + index * 15, { width: 220, lineBreak: false });
      });

    doc.roundedRect(x + width - 106, y + 22, 82, 82, 6).fill("#FFFFFF");
    doc.image(qrPng, x + width - 102, y + 26, { width: 74, height: 74 });

    const info: Array<[string, string]> = [];
    if (typeof input.points === "number" && Number.isFinite(input.points)) {
      info.push(["POIN", new Intl.NumberFormat("id-ID").format(input.points)]);
    }
    info.push([validity.label, validity.value]);
    const phone = optionalCardText(input.phone, 24);
    const address = optionalCardText(input.address, 26);
    if (phone) info.push(["KONTAK", phone]);
    if (address) info.push(["ALAMAT", address]);
    info.slice(0, 4).forEach(([l, v], index) => {
      const fx = x + 24 + (index % 2) * 160;
      const fy = y + 128 + Math.floor(index / 2) * 30;
      label(l, fx, fy);
      value(v, fx, fy + 11, { width: 150 });
    });

    doc.strokeColor(theme.muted).opacity(0.4).lineWidth(0.6).moveTo(x + 24, y + 196).lineTo(x + width - 24, y + 196).stroke().opacity(1);
    label(CARD_WEBSITE, x + 24, y + 203);
    label(formatMemberCode(code), x + 180, y + 203, { width: 156, align: "right" });
  }

  doc.restore();
}

export async function generateMembershipCardPdf(data: MembershipCardPdfData): Promise<Buffer> {
  const tier = normalizeTier(data.tier);
  const code = data.memberCode ?? `${tier.slice(0, 3).toUpperCase()}-${data.phone.slice(-4)}`;
  // QR asli (bukan pola hiasan) — modul gelap di atas putih agar terbaca scanner kasir.
  // Data URL (bukan Buffer): build standalone pdfkit hanya mengenali Buffer miliknya sendiri.
  const qrPng = await QRCode.toDataURL(memberQrPayload({ memberCode: code, tier, name: data.name }), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#0d1018", light: "#ffffff" },
  });
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 34 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text("KARTU MEMBER GARAGE COFFEE", 34, 30);
      doc.font("Helvetica").fontSize(9).fillColor("#555555").text("Sisi depan dan belakang - siap cetak (85,6 x 54 mm saat diskalakan).", 34, 52);
      drawCardFace(doc, data, 42, 92, "FRONT", qrPng);
      drawCardFace(doc, data, 430, 92, "BACK", qrPng);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
