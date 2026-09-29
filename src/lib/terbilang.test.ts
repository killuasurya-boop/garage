import { describe, expect, it } from "vitest";

import { terbilang, terbilangRupiah } from "@/lib/terbilang";

describe("terbilang", () => {
  it.each([
    [0, "nol"],
    [11, "sebelas"],
    [12, "dua belas"],
    [45, "empat puluh lima"],
    [100, "seratus"],
    [1_000, "seribu"],
    [1_500, "seribu lima ratus"],
    [66_667, "enam puluh enam ribu enam ratus enam puluh tujuh"],
    [2_100_000, "dua juta seratus ribu"],
    [1_291_341, "satu juta dua ratus sembilan puluh satu ribu tiga ratus empat puluh satu"],
    [1_000_000_000, "satu miliar"],
  ])("%i → %s", (n, words) => {
    expect(terbilang(n)).toBe(words);
  });

  it("format rupiah dengan huruf besar di awal", () => {
    expect(terbilangRupiah(170_000)).toBe("Seratus tujuh puluh ribu rupiah");
  });
});
