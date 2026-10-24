import { describe, expect, it } from "vitest";

import { countPack, formatPacks, packNameFromLabel, portionsPerPack, purchasePack, splitPacks, toBaseQty } from "@/lib/stock-uom";

const biangTeh = [{ uom: "kotak", factor: 1000, isPurchase: true, isCount: true }];
const freshMilk = [
  { uom: "dus", factor: 22704, isPurchase: true },
  { uom: "botol", factor: 946, isCount: true },
];

describe("satuan kemasan", () => {
  it("memecah ml ke kotak + sisa", () => {
    expect(splitPacks(3250, biangTeh)).toEqual({ sign: 1, packs: [{ uom: "kotak", count: 3 }], rest: 250 });
    expect(formatPacks(3250, "ml", biangTeh)).toBe("3 kotak + 250 ml");
    expect(formatPacks(750, "ml", biangTeh)).toBe("750 ml");
    expect(formatPacks(2000, "ml", biangTeh)).toBe("2 kotak");
    expect(formatPacks(0, "ml", biangTeh)).toBe("0 ml");
    expect(formatPacks(-1000, "ml", biangTeh)).toBe("−1 kotak");
    expect(formatPacks(1234, "gr", [])).toBe("1.234 gr");
  });

  it("bertingkat: dus → botol → ml", () => {
    expect(formatPacks(22704 + 946 * 5 + 100, "ml", freshMilk)).toBe("1 dus + 5 botol + 100 ml");
    expect(countPack(freshMilk)?.uom).toBe("botol");
    expect(purchasePack(freshMilk)?.uom).toBe("dus");
  });

  it("input kemasan → satuan dasar", () => {
    expect(toBaseQty({ count: 2, factor: 1000, rest: 300 })).toBe(2300);
    expect(toBaseQty({ rest: 250 })).toBe(250);
  });

  it("porsi per kemasan: es teh 250 ml dari kotak 1000 ml = 4 porsi", () => {
    expect(portionsPerPack(250, 1000)).toBe(4);
    expect(portionsPerPack(30 * 1.05, 760)).toBe(24);
    expect(portionsPerPack(0, 1000)).toBe(0);
  });

  it("nama kemasan dari label katalog", () => {
    expect(packNameFromLabel("kotak 1000 ml")).toBe("kotak");
    expect(packNameFromLabel("Botol 760 ml")).toBe("botol");
    expect(packNameFromLabel("1000 ml")).toBe("");
  });
});
