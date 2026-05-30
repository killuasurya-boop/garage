import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import type { MemberLevel } from "@/lib/member-types";

type MembershipCardPdfData = {
  name: string;
  phone: string;
  tier: string;
  memberCode?: string | null;
  membershipSince?: string | Date | null;
  expiresAt?: string | Date | null;
  ultraCandidate?: boolean | null;
};

const tierTheme: Record<MemberLevel, { accent: string; dark: string; soft: string; concept: string; code: string }> = {
  Silver: {
    accent: "#A8B0C0",
    dark: "#1A1D26",
    soft: "#D0D4E0",
    concept: "INDUSTRIAL ACCESS",
    code: "CLASS-S",
  },
  Gold: {
    accent: "#C89828",
    dark: "#0D0B09",
    soft: "#D4B040",
    concept: "ELITE EXECUTIVE",
    code: "CLASS-G",
  },
  Platinum: {
    accent: "#6090B8",
    dark: "#080D18",
    soft: "#D0E8F8",
    concept: "QUANTUM PRESTIGE",
    code: "CLASS-P",
  },
  Ultra: {
    accent: "#8050E0",
    dark: "#060408",
    soft: "#B890FF",
    concept: "FORBIDDEN PROTOTYPE",
    code: "CLASS-OMEGA",
  },
};

function normalizeTier(tier: string): MemberLevel {
  if (tier === "Ultra") return "Ultra";
  if (tier === "Platinum") return "Platinum";
  if (tier === "Gold") return "Gold";
  return "Silver";
}

function formatSince(value?: string | Date | null) {
  if (!value) return "LIFETIME";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "LIFETIME";
  return date.toLocaleDateString("id-ID", { month: "short", year: "numeric" }).toUpperCase();
}

function memberNumber(code: string, tier: MemberLevel) {
  const fallback = `${tier.slice(0, 3).toUpperCase()}-0000-0000-0001`;
  const base = code || fallback;
  return base.replace(/-/g, "  ");
}

function drawCardFace(doc: PDFKit.PDFDocument, input: MembershipCardPdfData, x: number, y: number, title: "FRONT" | "BACK") {
  const tier = normalizeTier(input.tier);
  const theme = tierTheme[tier];
  const width = 360;
  const height = 226;
  const code = input.memberCode ?? `${tier.slice(0, 3).toUpperCase()}-${input.phone.slice(-4)}`;

  doc.save();
  doc.roundedRect(x, y, width, height, 16).fill(theme.dark);
  doc.roundedRect(x + 1, y + 1, width - 2, height - 2, 15).strokeColor(theme.accent).lineWidth(1.4).stroke();
  doc
    .opacity(0.18)
    .fillColor(theme.accent)
    .circle(x + width - 60, y + 42, 90)
    .fill()
    .opacity(1);

  for (let i = 0; i < 12; i += 1) {
    const yy = y + 18 + i * 16;
    doc.strokeColor(i % 2 === 0 ? "#FFFFFF18" : `${theme.accent}22`).lineWidth(0.4).moveTo(x + 18, yy).lineTo(x + width - 18, yy).stroke();
  }

  if (title === "FRONT") {
    doc.font("Helvetica-Bold").fontSize(22).fillColor(theme.soft).text("GARAGE", x + 24, y + 24);
    doc.font("Helvetica").fontSize(7).fillColor("#FFFFFF88").text("COFFEE & MOTOR · MEDAN", x + 26, y + 50);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(theme.accent).text("ACCESS TIER", x + width - 122, y + 25, { width: 92, align: "right" });
    doc.font("Helvetica-Bold").fontSize(20).fillColor(theme.soft).text(tier.toUpperCase(), x + width - 150, y + 40, { width: 120, align: "right" });

    doc.roundedRect(x + 26, y + 78, 48, 34, 5).fill(theme.accent);
    doc.roundedRect(x + 34, y + 85, 32, 20, 3).fill("#00000055");
    doc.font("Helvetica").fontSize(10).fillColor(theme.accent).text("NFC", x + 85, y + 88);

    doc.font("Courier-Bold").fontSize(16).fillColor(theme.soft).text(memberNumber(code, tier), x + 24, y + 128, { characterSpacing: 1.4 });
    doc.font("Helvetica").fontSize(7).fillColor("#FFFFFF80").text("MEMBER", x + 24, y + 170);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(theme.soft).text(input.name.toUpperCase(), x + 24, y + 182, { width: 190 });
    doc.font("Helvetica").fontSize(7).fillColor("#FFFFFF80").text("VALID", x + 250, y + 170);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(theme.soft).text(formatSince(input.expiresAt ?? input.membershipSince), x + 250, y + 182, { width: 86 });
  } else {
    doc.rect(x + 0, y + 28, width, 42).fill("#050505");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(theme.accent).text(`${tier.toUpperCase()} PROTOCOL`, x + 24, y + 88);
    doc.roundedRect(x + 24, y + 106, 74, 74, 5).strokeColor(theme.accent).lineWidth(1).stroke();
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        if ((row * 3 + col * 5 + code.length) % 4 !== 0) {
          doc.rect(x + 32 + col * 8, y + 114 + row * 8, 5, 5).fill(theme.accent);
        }
      }
    }
    doc.font("Helvetica").fontSize(8).fillColor("#FFFFFF88").text("ACCESS POINT", x + 122, y + 112);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(theme.soft).text("garage-motor.id", x + 122, y + 126);
    doc.font("Helvetica").fontSize(8).fillColor("#FFFFFF88").text("MEMBER GRADE", x + 122, y + 150);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(theme.soft).text(`${tier.toUpperCase()} · ${theme.code}`, x + 122, y + 164);
    doc.font("Courier").fontSize(7).fillColor(theme.accent).text(`${code} · ${theme.concept}`, x + 24, y + 198, { width: 300 });
  }

  doc.restore();
}

export async function generateMembershipCardPdf(data: MembershipCardPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 34 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text("GARAGE MEMBERSHIP MASTER PRO", 34, 30);
      doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Single member card export · front and back print layout", 34, 52);
      drawCardFace(doc, data, 42, 92, "FRONT");
      drawCardFace(doc, data, 430, 92, "BACK");
      doc.font("Helvetica").fontSize(8).fillColor("#666666").text("Ultra activation requires Owner / CEO approval.", 42, 340);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
