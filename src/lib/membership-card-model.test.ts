import { describe, expect, it } from "vitest";

import { memberLevelRules } from "@/lib/member-types";
import {
  cardPerks,
  cardValidity,
  formatCardDate,
  formatMemberCode,
  memberInitials,
  memberQrPayload,
  optionalCardText,
} from "@/lib/membership-card-model";

describe("model kartu member", () => {
  it("kode member asli, tanpa padding nol palsu", () => {
    expect(formatMemberCode("grg-2026-0001")).toBe("GRG-2026-0001");
    expect(formatMemberCode("GRG-0001")).toBe("GRG-0001");
    expect(formatMemberCode("")).toBe("—");
  });

  it("tanggal diformat bulan + tahun WIB", () => {
    expect(formatCardDate("2027-10-25T10:00:00.000Z")).toBe("OKT 2027");
    // 31 Des 20:00 UTC = 1 Jan WIB
    expect(formatCardDate("2026-12-31T20:00:00.000Z")).toBe("JAN 2027");
    expect(formatCardDate("bukan tanggal")).toBeNull();
  });

  it("masa berlaku tidak memakai tanggal member sejak", () => {
    expect(cardValidity({ expiresAt: "2027-10-25T00:00:00Z" })).toEqual({ label: "BERLAKU S/D", value: "OKT 2027" });
    expect(cardValidity({ validThru: "12/28" })).toEqual({ label: "BERLAKU S/D", value: "12/28" });
    expect(cardValidity({})).toEqual({ label: "BERLAKU", value: "TANPA BATAS" });
  });

  it("benefit mengikuti multiplier aturan poin", () => {
    for (const rule of memberLevelRules) {
      const { multiplier, perks } = cardPerks(rule.level);
      expect(multiplier).toBe(rule.multiplier);
      expect(perks[0]).toBe(`Poin ${rule.multiplier}x`);
      expect(perks.filter((p) => /^point\b/i.test(p))).toHaveLength(0);
    }
  });

  it("payload QR tetap format scanner kasir", () => {
    expect(JSON.parse(memberQrPayload({ memberCode: "GRG-1", tier: "Gold", name: "Budi" }))).toEqual({
      v: 1,
      id: "GRG-1",
      tier: "Gold",
      n: "Budi",
    });
  });

  it("inisial & teks opsional tanpa placeholder", () => {
    expect(memberInitials("budi santoso garage")).toBe("BG");
    expect(memberInitials("")).toBe("GM");
    expect(optionalCardText("  ")).toBeNull();
    expect(optionalCardText(null)).toBeNull();
  });
});
