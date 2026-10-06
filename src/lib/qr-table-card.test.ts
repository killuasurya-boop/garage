import jsQR from "jsqr";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { garageQrOrderUrl } from "@/lib/garage-qr";
import { ALL_TABLE_NUMBERS } from "@/lib/garage-tables";
import { buildCardLayout, CARD_CONTACT, drawCardPdf, renderCardSvg, type CardItem } from "@/lib/qr-table-card";

// =============================================================================
// Kartu QR meja: QR yang DIPINDAI harus membuka meja yang sama dengan nomor
// besar di kartu — diuji untuk SEMUA meja 01–50 dengan memindai gambar kartu.
// =============================================================================

const BASE = "https://garagecoffee.id";

async function scanCard(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 144 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)?.data ?? null;
}

function bigNumber(items: CardItem[]) {
  const texts = items.filter((item): item is Extract<CardItem, { t: "text" }> => item.t === "text");
  return texts.reduce((largest, item) => (item.size > largest.size ? item : largest)).text;
}

describe("Kartu QR meja", () => {
  it("semua meja 01–50: QR terpindai = link meja itu, nomor besar = meja itu", async () => {
    expect(ALL_TABLE_NUMBERS).toHaveLength(50);
    for (const table of ALL_TABLE_NUMBERS) {
      const url = garageQrOrderUrl(BASE, table);
      const items = buildCardLayout(table, url);
      expect(bigNumber(items)).toBe(table);
      const decoded = await scanCard(renderCardSvg(items, null));
      expect(decoded, `meja ${table}`).toBe(url);
      const params = new URL(decoded as string).searchParams;
      expect(params.get("table")).toBe(table);
      expect(params.get("source")).toBe("qr_table");
    }
  }, 120_000);

  it("QR dengan outlet tetap terbaca & membawa outlet", async () => {
    const outlet = "0f3c2a1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
    const url = garageQrOrderUrl(BASE, "07", outlet);
    const decoded = await scanCard(renderCardSvg(buildCardLayout("07", url), null));
    expect(new URL(decoded as string).searchParams.get("outletId")).toBe(outlet);
    expect(new URL(decoded as string).searchParams.get("table")).toBe("07");
  });

  it("kontak di kartu sesuai desain owner", () => {
    const texts = buildCardLayout("01", garageQrOrderUrl(BASE, "01"))
      .filter((item): item is Extract<CardItem, { t: "text" }> => item.t === "text")
      .map((item) => item.text);
    expect(texts).toEqual(expect.arrayContaining([CARD_CONTACT.whatsapp, CARD_CONTACT.website, CARD_CONTACT.phone, "MEJA", "WEBSITE"]));
    expect(CARD_CONTACT.whatsapp).toBe("+62 851-2155-2341");
  });

  it("PDF: 2 kartu per halaman A4 landscape, tanpa error", async () => {
    const tables = ["01", "02", "03"];
    const pdf: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      tables.forEach((table, i) => {
        if (i > 0 && i % 2 === 0) doc.addPage();
        drawCardPdf(doc, buildCardLayout(table, garageQrOrderUrl(BASE, table)), null, { x: 24 + (i % 2) * 409, y: 24, w: 385, h: 547 });
      });
      doc.end();
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
  });
});
