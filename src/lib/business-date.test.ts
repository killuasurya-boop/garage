import { describe, expect, it } from "vitest";

import {
  CALENDAR_POLICY,
  businessDateKey,
  businessDayRange,
  businessDayStart,
  normalizeBusinessDayPolicy,
} from "@/lib/business-date";

const wib = (iso: string) => new Date(`${iso}+07:00`);
const policy = { cutoffHour: 4, effectiveFrom: "2026-11-01" };

describe("business date — kebijakan kalender (default, perilaku lama)", () => {
  it("tanggal = kalender WIB, hari mulai 00:00", () => {
    expect(businessDateKey(wib("2026-11-05T01:30:00"))).toBe("2026-11-05");
    expect(businessDayStart("2026-11-05").toISOString()).toBe(wib("2026-11-05T00:00:00").toISOString());
    const range = businessDayRange("2026-11-05", "2026-11-05");
    expect(range.end.getTime() - range.start.getTime()).toBe(24 * 3_600_000);
  });

  it("pengaturan kosong / tidak valid → kalender", () => {
    expect(normalizeBusinessDayPolicy({ cutoffHour: 4, effectiveFrom: "" })).toEqual(CALENDAR_POLICY);
    expect(normalizeBusinessDayPolicy({ cutoffHour: 4, effectiveFrom: "2026-02-31" })).toEqual(CALENDAR_POLICY);
    expect(normalizeBusinessDayPolicy({ cutoffHour: 0, effectiveFrom: "2026-11-01" })).toEqual(CALENDAR_POLICY);
    expect(normalizeBusinessDayPolicy({ cutoffHour: 13, effectiveFrom: "2026-11-01" })).toEqual(CALENDAR_POLICY);
    expect(normalizeBusinessDayPolicy({ cutoffHour: 4, effectiveFrom: " 2026-11-01 " })).toEqual(policy);
  });
});

describe("business date — cut-off 04:00 mulai 2026-11-01 (keputusan Owner)", () => {
  it("shift malam tidak terbelah: penjualan 01:30 masuk hari sebelumnya", () => {
    expect(businessDateKey(wib("2026-11-05T23:00:00"), policy)).toBe("2026-11-05");
    expect(businessDateKey(wib("2026-11-06T01:30:00"), policy)).toBe("2026-11-05");
    expect(businessDateKey(wib("2026-11-06T03:59:59"), policy)).toBe("2026-11-05");
    expect(businessDateKey(wib("2026-11-06T04:00:00"), policy)).toBe("2026-11-06");
  });

  it("sebelum tanggal efektif tetap kalender (laporan lama tidak berubah)", () => {
    expect(businessDateKey(wib("2026-10-31T01:30:00"), policy)).toBe("2026-10-31");
    expect(businessDayStart("2026-10-31", policy).toISOString()).toBe(wib("2026-10-31T00:00:00").toISOString());
    expect(businessDayRange("2026-10-01", "2026-10-30", policy).end.toISOString()).toBe(wib("2026-10-31T00:00:00").toISOString());
  });

  it("hari transisi E: 00:00 E sampai 04:00 E+1 (28 jam), tanpa celah/tumpang tindih", () => {
    expect(businessDateKey(wib("2026-11-01T01:00:00"), policy)).toBe("2026-11-01");
    const e = businessDayRange("2026-11-01", "2026-11-01", policy);
    expect(e.start.toISOString()).toBe(wib("2026-11-01T00:00:00").toISOString());
    expect(e.end.toISOString()).toBe(wib("2026-11-02T04:00:00").toISOString());
    const before = businessDayRange("2026-10-31", "2026-10-31", policy);
    expect(before.end.toISOString()).toBe(e.start.toISOString());
    const after = businessDayRange("2026-11-02", "2026-11-02", policy);
    expect(after.start.toISOString()).toBe(e.end.toISOString());
    expect(after.end.getTime() - after.start.getTime()).toBe(24 * 3_600_000);
  });

  it("setiap jam sepanjang 10 hari masuk tepat satu hari operasional yang rentangnya memuatnya", () => {
    for (let h = 0; h < 240; h++) {
      const at = new Date(wib("2026-10-28T00:30:00").getTime() + h * 3_600_000);
      const key = businessDateKey(at, policy);
      const { start, end } = businessDayRange(key, key, policy);
      expect(at >= start && at < end, `${at.toISOString()} → ${key}`).toBe(true);
    }
  });
});
