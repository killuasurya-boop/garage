import { describe, expect, it } from "vitest";

import { catalogTotals, PRD_PARTNER_CATALOG } from "@/lib/partner-hub-catalog";

// Angka katalog wajib sama persis dengan PRD V1.0 bagian 05 (bukan angka dari gambar papan).
describe("katalog awal PRD 05", () => {
  const es = PRD_PARTNER_CATALOG.find((p) => p.code === "PAU")!;
  const dimsum = PRD_PARTNER_CATALOG.find((p) => p.code === "DSM")!;

  it("Es Krim Pokat Au: 4 produk, harga & HPP sesuai PRD 05.1", () => {
    expect(es.products.map((p) => [p.code, p.unitCost, p.sellPrice])).toEqual([
      ["PAU-001", 19_000, 22_000],
      ["PAU-002", 19_000, 22_000],
      ["PAU-003", 25_000, 30_000],
      ["PAU-004", 25_000, 30_000],
    ]);
    expect(es.lastOrderByDay).toMatchObject({ "0": "21:45", "5": "21:45", "6": "22:45" });
  });

  it("Dimsum: 20 produk, harga jual = HPP + 3.000, simulasi PRD (HPP 410.000, jual 470.000, laba 60.000)", () => {
    expect(dimsum.products).toHaveLength(20);
    expect(dimsum.products.every((p) => p.sellPrice - p.unitCost === 3_000)).toBe(true);
    expect(catalogTotals(dimsum)).toEqual({ count: 20, cost: 410_000, sell: 470_000, margin: 60_000 });
  });

  it("kode produk unik", () => {
    const codes = PRD_PARTNER_CATALOG.flatMap((p) => p.products.map((x) => x.code));
    expect(new Set(codes).size).toBe(codes.length);
  });
});
