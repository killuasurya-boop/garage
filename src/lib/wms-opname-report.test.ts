import { describe, expect, it } from "vitest";

import { deriveInsights } from "@/lib/wms-opname-insights";
import { resolveLossPeriod } from "@/lib/wms-opname-report";

describe("resolveLossPeriod (WIB)", () => {
  it("harian = 00:00–24:00 WIB", () => {
    const r = resolveLossPeriod("daily", "2026-10-29");
    expect(r.from.toISOString()).toBe("2026-10-28T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-29T17:00:00.000Z");
  });
  it("mingguan = Senin–Minggu, bulanan = bulan kalender", () => {
    expect(resolveLossPeriod("weekly", "2026-10-29")).toMatchObject({ fromKey: "2026-10-26", toKey: "2026-11-01" });
    expect(resolveLossPeriod("weekly", "2026-11-01")).toMatchObject({ fromKey: "2026-10-26", toKey: "2026-11-01" });
    expect(resolveLossPeriod("monthly", "2026-02-15")).toMatchObject({ fromKey: "2026-02-01", toKey: "2026-02-28" });
  });
  it("tanggal tidak valid ditolak", () => {
    expect(() => resolveLossPeriod("daily", "2026-02-30")).toThrow();
    expect(() => resolveLossPeriod("daily", "29-10-2026")).toThrow();
  });
});

describe("deriveInsights", () => {
  const now = new Date("2026-10-29T05:00:00Z");
  const base = {
    now,
    products: [
      { productId: "p1", warehouseId: "w1", sku: "A", name: "Kopi", unit: "gr", qty: 1000, hpp: 300 },
      { productId: "p2", warehouseId: "w1", sku: "B", name: "Gula", unit: "gr", qty: -20, hpp: 20 },
    ],
    shortages: [1, 2, 3].map((i) => ({ productId: "p1", warehouseId: "w1", doc: `OPN-${i}`, at: new Date(now.getTime() - i * 86_400_000), variance: -10, value: -3000 })),
    lastCounted: new Map([["p1:w1", new Date(now.getTime() - 40 * 86_400_000)]]), // 40 hari → lama tidak dihitung
    expiring: [{ productId: "p1", warehouseId: "w1", batchNo: "B1", qty: 50, expiredAt: new Date(now.getTime() - 86_400_000) }],
    waste: [{ warehouseId: "w1", last7: 200_000, prior28: 80_000 }],
    warehouseNames: new Map([["w1", "Bar"]]),
  };
  it("setiap temuan punya bukti, batasan, PJ; dedup key stabil", () => {
    const out = deriveInsights(base);
    const rules = out.map((i) => i.rule).sort();
    expect(rules).toEqual(["near_expiry", "negative_stock", "repeat_shortage", "stale_count", "waste_spike"]);
    for (const i of out) {
      expect(i.limitation.length).toBeGreaterThan(10);
      expect(Object.keys(i.evidence).length).toBeGreaterThan(0);
      expect(["Owner", "Manajer"]).toContain(i.ownerRole);
    }
    expect(deriveInsights(base).map((i) => i.dedupKey)).toEqual(out.map((i) => i.dedupKey));
  });
  it("baru dihitung (< 30 hari) tidak memicu lama-tidak-dihitung", () => {
    const out = deriveInsights({ ...base, lastCounted: new Map([["p1:w1", new Date(now.getTime() - 86_400_000)]]) });
    expect(out.some((i) => i.rule === "stale_count")).toBe(false);
  });
  it("kejadian di bawah ambang tidak memicu kekurangan berulang", () => {
    const out = deriveInsights({ ...base, shortages: base.shortages.slice(0, 2) });
    expect(out.some((i) => i.rule === "repeat_shortage")).toBe(false);
  });
});
