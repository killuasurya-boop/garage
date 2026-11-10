import { describe, expect, it } from "vitest";

import {
  estimateRunoutAt,
  materialStatus,
  portionsLeft,
  receiveShortfall,
  suggestRequestQty,
  targetStock,
  TRADING_HOURS_PER_DAY,
  usagePerHour,
} from "@/lib/material-request-rules";
import { cueDurationMs, cueForScenario } from "@/lib/station-sound-theme";

describe("Minta Bahan — saran jumlah (M1)", () => {
  it("stok target = par_stock, kosong → 2× minimum", () => {
    expect(targetStock(500, 3000)).toBe(3000);
    expect(targetStock(500, 0)).toBe(1000);
    expect(targetStock(0, 0)).toBe(0);
  });

  it("hanya bahan menipis/habis yang diusulkan", () => {
    expect(materialStatus(0, 100)).toBe("out");
    expect(materialStatus(80, 100)).toBe("low");
    expect(materialStatus(500, 100)).toBe("ok");
    expect(suggestRequestQty({ onHand: 500, minStock: 100, parStock: 1000 })).toBe(0);
  });

  it("target − sisa, dibulatkan ke kemasan terkecil", () => {
    // Susu: sisa 300 ml, min 1000, target 4000 → kurang 3700 → 4 karton 1000 ml.
    expect(suggestRequestQty({ onHand: 300, minStock: 1000, parStock: 4000, packFactors: [1000, 12_000] })).toBe(4000);
    // Tanpa kemasan → apa adanya (2 desimal).
    expect(suggestRequestQty({ onHand: 2, minStock: 5, parStock: 0 })).toBe(8);
  });

  it("kemasan raksasa diabaikan (jangan kirim 1 karung untuk kurang sedikit)", () => {
    expect(suggestRequestQty({ onHand: 900, minStock: 1000, parStock: 1200, packFactors: [25_000] })).toBe(300);
  });

  it("stok minus dihitung dari nol", () => {
    expect(suggestRequestQty({ onHand: -50, minStock: 100, parStock: 400 })).toBe(400);
  });
});

describe("Minta Bahan — perkiraan habis (M2)", () => {
  it("laju hari ini dipakai bila ada; selain itu rata-rata 7 hari ÷ jam jual", () => {
    expect(usagePerHour({ usedToday: 600, hoursOpenToday: 3, used7d: 0 })).toBe(200);
    expect(usagePerHour({ usedToday: 0, hoursOpenToday: 0, used7d: 7 * TRADING_HOURS_PER_DAY * 50 })).toBe(50);
    expect(usagePerHour({ usedToday: 0, hoursOpenToday: 0, used7d: 0 })).toBe(0);
  });

  it("jam habis & sisa porsi", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(estimateRunoutAt(400, 200, now)?.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(estimateRunoutAt(400, 0, now)).toBeNull();
    expect(estimateRunoutAt(0, 10, now)).toBeNull();
    expect(portionsLeft(250, 18)).toBe(13);
    expect(portionsLeft(250, null)).toBeNull();
  });
});

describe("Minta Bahan — koreksi terima (M6)", () => {
  it("selisih hanya bila diterima < dikirim", () => {
    expect(receiveShortfall(1000, 800)).toBe(200);
    expect(receiveShortfall(1000, 1000)).toBe(0);
    expect(receiveShortfall(1000, 1200)).toBe(0);
    expect(receiveShortfall(1000, null)).toBe(0);
  });
});

describe("Tema suara Stasiun Kereta", () => {
  it("pesanan Bar & Dapur punya lonceng berbeda; siap antar = kereta tiba", () => {
    expect(cueForScenario("order_new_bar")).toBe("new_bar");
    expect(cueForScenario("order_new_kitchen")).toBe("new_dapur");
    expect(cueForScenario("order_ready")).toBe("ready");
    expect(cueForScenario("warning_lowstock")).toBe("late");
    expect(cueForScenario("test_ceo")).toBeNull();
  });

  it("durasi cue cukup panjang agar voice tidak menimpa bunyi", () => {
    expect(cueDurationMs("new_bar")).toBeGreaterThanOrEqual(1000);
    expect(cueDurationMs("approved")).toBeGreaterThan(cueDurationMs("attention"));
  });
});
