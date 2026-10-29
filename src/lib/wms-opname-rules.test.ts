import { describe, expect, it } from "vitest";

import { DEFAULT_TOLERANCE, classifyVariance, countFromPacks, riskScores, worstClass } from "@/lib/wms-opname-rules";

describe("klasifikasi selisih opname", () => {
  it("sesuai bila fisik = sistem", () => {
    expect(classifyVariance({ systemQty: 5000, physicalQty: 5000, unit: "gram", rate: 200 })).toMatchObject({ classification: "match", value: 0 });
  });

  it("contoh brief: kopi 5.000 → 4.600 g @Rp200 = −Rp80.000 → review Manajer", () => {
    const r = classifyVariance({ systemQty: 5000, physicalQty: 4600, unit: "gram", rate: 200 });
    expect(r).toMatchObject({ variance: -400, variancePct: -8, value: -80_000, classification: "manager" });
  });

  it("selisih kecil dalam batas absolut satuan (±5 g) tidak minta hitung ulang", () => {
    expect(classifyVariance({ systemQty: 50, physicalQty: 46, unit: "gram", rate: 1 }).classification).toBe("minor");
  });

  it("> 5% bernilai kecil → hitung ulang; setelah dihitung ulang tetap selisih → Manajer", () => {
    expect(classifyVariance({ systemQty: 100, physicalQty: 80, unit: "pcs", rate: 100 }).classification).toBe("recount");
    expect(classifyVariance({ systemQty: 100, physicalQty: 80, unit: "pcs", rate: 100, recounted: true }).classification).toBe("manager");
  });

  it("stok sistem 0 tidak dibagi nol", () => {
    const r = classifyVariance({ systemQty: 0, physicalQty: 3, unit: "pcs", rate: 1000 });
    expect(r.variancePct).toBeNull();
    expect(r.classification).toBe("recount");
    expect(Number.isFinite(r.value)).toBe(true);
  });

  it("nilai ≥ Rp250.000 atau selisih berulang → eskalasi Owner", () => {
    expect(classifyVariance({ systemQty: 10_000, physicalQty: 8_000, unit: "gram", rate: 200 }).classification).toBe("owner");
    expect(classifyVariance({ systemQty: 100, physicalQty: 99, unit: "pcs", rate: 10, priorVarianceEvents: 3 }).classification).toBe("owner");
  });

  it("toleransi per kategori lebih ketat", () => {
    const cfg = { ...DEFAULT_TOLERANCE, recountPctByCategory: { Kopi: 1 } };
    expect(classifyVariance({ systemQty: 1000, physicalQty: 980, unit: "gram", rate: 1, category: "Kopi" }, cfg).classification).toBe("recount");
    expect(classifyVariance({ systemQty: 1000, physicalQty: 980, unit: "gram", rate: 1, category: "Gula" }, cfg).classification).toBe("minor");
  });

  it("kelas terberat menentukan penyetuju", () => {
    expect(worstClass(["match", "minor", "manager", null])).toBe("manager");
    expect(worstClass(["owner", "recount"])).toBe("owner");
  });
});

describe("konversi kemasan", () => {
  it("2 pack × 1.000 g + 350 g terbuka = 2.350 g", () => {
    expect(countFromPacks({ packs: 2, factor: 1000, loose: 350 })).toBe(2350);
  });
});

describe("skor risiko", () => {
  it("deterministik, berurutan, dan menyebut alasan", () => {
    const items = [
      { id: "beans", factors: { stockValue: 900_000, usageCount30d: 300, varianceEvents90d: 4, varianceLoss90d: 200_000, daysToExpiry: 60, daysSinceCount: 2 } },
      { id: "gula", factors: { stockValue: 50_000, usageCount30d: 20, varianceEvents90d: 0, varianceLoss90d: 0, daysToExpiry: null, daysSinceCount: 3 } },
      { id: "susu", factors: { stockValue: 400_000, usageCount30d: 280, varianceEvents90d: 1, varianceLoss90d: 30_000, daysToExpiry: 2, daysSinceCount: null } },
    ];
    const a = riskScores(items);
    const b = riskScores(items);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a[0].id).toBe("beans");
    expect(a.at(-1)?.id).toBe("gula");
    expect(a[0].reasons.length).toBeGreaterThan(0);
    expect(a.every((x) => x.score >= 0 && x.score <= 100)).toBe(true);
  });
});
