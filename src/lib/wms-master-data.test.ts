import { describe, expect, it } from "vitest";

import { WmsMasterError, diffMaster, nextSkuFrom, normalizeWhatsapp, skuPrefixForCategory } from "@/lib/wms-master-data";

// Unit test helper murni Master Data WMS (tanpa DB).

describe("SKU otomatis", () => {
  it("prefix = 3 huruf/angka pertama kategori, huruf besar", () => {
    expect(skuPrefixForCategory("Kopi")).toBe("KOP");
    expect(skuPrefixForCategory("Frozen Food")).toBe("FRO");
    expect(skuPrefixForCategory("  ")).toBe("PRD");
  });

  it("nomor berikut = tertinggi + 1, abaikan pola lain & beda huruf besar", () => {
    expect(nextSkuFrom("KOP", [])).toBe("KOP-001");
    expect(nextSkuFrom("KOP", ["KOP-001", "kop-007", "KOP-X", "KOPI-099", "SUS-050"])).toBe("KOP-008");
  });
});

describe("Nomor WhatsApp supplier", () => {
  it("normalisasi 08 / 62 / +62 dengan spasi & strip", () => {
    expect(normalizeWhatsapp("0812-3456-7890")).toBe("081234567890");
    expect(normalizeWhatsapp("+62 812 3456 7890")).toBe("081234567890");
    expect(normalizeWhatsapp("6281234567890")).toBe("081234567890");
    expect(normalizeWhatsapp("")).toBe("");
  });

  it("tolak huruf, nomor pendek, dan bukan nomor HP", () => {
    expect(() => normalizeWhatsapp("08abc")).toThrow(WmsMasterError);
    expect(() => normalizeWhatsapp("0812")).toThrow(/10–15 digit/);
    expect(() => normalizeWhatsapp("0215551234")).toThrow(WmsMasterError);
  });
});

describe("diffMaster (audit before/after)", () => {
  it("hanya field yang berubah; angka dibanding toleransi", () => {
    const before = { name: "Susu", hpp: 18.5, brand: "", unit: "ml" };
    const after = { name: "Susu UHT", hpp: 18.5000001, brand: "", unit: "ml" };
    expect(diffMaster(before, after, ["name", "hpp", "brand", "unit"])).toEqual({ name: { before: "Susu", after: "Susu UHT" } });
  });
});
