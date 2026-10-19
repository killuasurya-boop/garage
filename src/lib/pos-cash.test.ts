import { describe, expect, it } from "vitest";

import { quickCashOptions } from "@/lib/pos-cash";

describe("nominal cepat tunai", () => {
  it("total kecil menawarkan 5.000 & 10.000", () => {
    expect(quickCashOptions(5_000)).toEqual([5_000, 10_000, 20_000, 50_000, 100_000]);
    expect(quickCashOptions(3_000)).toEqual([5_000, 10_000, 20_000, 50_000, 100_000]);
  });

  it("pembulatan ke atas total", () => {
    expect(quickCashOptions(19_000)).toEqual([20_000, 50_000, 100_000]);
    expect(quickCashOptions(37_500)).toEqual([40_000, 50_000, 100_000]);
    expect(quickCashOptions(126_000)).toEqual([130_000, 150_000, 200_000]);
  });
});
