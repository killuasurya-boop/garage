import { describe, expect, it } from "vitest";

import { isCalendarDateKey, validateDateRange } from "@/lib/date-range";
import { REPORT_TYPES as FINANCE_TYPES } from "@/lib/finance-reports";
import { reportFileName } from "@/lib/report-file-name";
import { canShiftForward, periodError, periodLabel, presetPeriod, shiftPeriod } from "@/lib/report-periods";
import { REPORT_CATALOG } from "@/lib/reports/catalog";
import { classifyMovement } from "@/lib/reports/inventory";

const TODAY = "2026-10-13"; // Selasa

describe("tanggal kalender", () => {
  it("menolak tanggal yang tidak ada & format salah", () => {
    expect(isCalendarDateKey("2026-02-28")).toBe(true);
    expect(isCalendarDateKey("2028-02-29")).toBe(true);
    expect(isCalendarDateKey("2026-02-29")).toBe(false);
    expect(isCalendarDateKey("2026-02-31")).toBe(false);
    expect(isCalendarDateKey("2026-13-01")).toBe(false);
    expect(isCalendarDateKey("13/10/2026")).toBe(false);
    expect(isCalendarDateKey("")).toBe(false);
  });

  it("validasi rentang: terbalik, masa depan, terlalu panjang", () => {
    expect(validateDateRange("2026-10-01", "2026-10-13", { maxDays: 366, today: TODAY })).toEqual({ ok: true, from: "2026-10-01", to: "2026-10-13" });
    expect(validateDateRange("2026-10-14", "2026-10-13", { maxDays: 366, today: TODAY })).toMatchObject({ ok: false, code: "INVALID_RANGE" });
    expect(validateDateRange("2026-10-14", "2026-10-20", { maxDays: 366, today: TODAY })).toMatchObject({ ok: false, code: "FUTURE_RANGE" });
    expect(validateDateRange("2025-01-01", "2026-10-13", { maxDays: 366, today: TODAY })).toMatchObject({ ok: false, code: "RANGE_TOO_LONG" });
    // Bulan/tahun berjalan penuh boleh (akhir periode di masa depan).
    expect(validateDateRange("2026-01-01", "2026-12-31", { maxDays: 366, today: TODAY }).ok).toBe(true);
    expect(validateDateRange("2026-02-31", "2026-03-01", { maxDays: 366, today: TODAY })).toMatchObject({ ok: false, code: "INVALID_DATE" });
  });
});

describe("preset & navigasi periode", () => {
  it("preset menghasilkan rentang yang benar", () => {
    expect(presetPeriod("today", TODAY)).toEqual({ from: TODAY, to: TODAY, unit: "day" });
    expect(presetPeriod("yesterday", TODAY)).toEqual({ from: "2026-10-12", to: "2026-10-12", unit: "day" });
    expect(presetPeriod("7d", TODAY)).toEqual({ from: "2026-10-07", to: TODAY, unit: "range" });
    expect(presetPeriod("this_week", TODAY)).toEqual({ from: "2026-10-12", to: "2026-10-18", unit: "week" });
    expect(presetPeriod("this_month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31", unit: "month" });
    expect(presetPeriod("last_month", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30", unit: "month" });
    expect(presetPeriod("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31", unit: "month" });
    expect(presetPeriod("this_year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31", unit: "year" });
  });

  it("geser periode tanpa overflow bulan (31 → Februari)", () => {
    expect(shiftPeriod({ from: "2026-01-01", to: "2026-01-31", unit: "month" }, 1)).toEqual({ from: "2026-02-01", to: "2026-02-28", unit: "month" });
    expect(shiftPeriod({ from: "2026-03-01", to: "2026-03-31", unit: "month" }, -1)).toEqual({ from: "2026-02-01", to: "2026-02-28", unit: "month" });
    expect(shiftPeriod({ from: "2026-12-01", to: "2026-12-31", unit: "month" }, 1)).toEqual({ from: "2027-01-01", to: "2027-01-31", unit: "month" });
    expect(shiftPeriod({ from: "2026-10-12", to: "2026-10-18", unit: "week" }, -1)).toEqual({ from: "2026-10-05", to: "2026-10-11", unit: "week" });
    expect(shiftPeriod({ from: "2026-10-07", to: "2026-10-13", unit: "range" }, -1)).toEqual({ from: "2026-09-30", to: "2026-10-06", unit: "range" });
    expect(shiftPeriod({ from: "2026-01-01", to: "2026-12-31", unit: "year" }, -1)).toEqual({ from: "2025-01-01", to: "2025-12-31", unit: "year" });
  });

  it("tidak bisa maju ke periode yang belum dimulai", () => {
    expect(canShiftForward({ from: TODAY, to: TODAY, unit: "day" }, TODAY)).toBe(false);
    expect(canShiftForward({ from: "2026-10-12", to: "2026-10-12", unit: "day" }, TODAY)).toBe(true);
    expect(canShiftForward(presetPeriod("this_month", TODAY), TODAY)).toBe(false);
    expect(canShiftForward(presetPeriod("last_month", TODAY), TODAY)).toBe(true);
  });

  it("validasi input & label", () => {
    expect(periodError("", TODAY, { today: TODAY })).toMatch(/valid/);
    expect(periodError("2026-10-10", "2026-10-01", { today: TODAY })).toMatch(/sebelum/);
    expect(periodError("2026-10-01", "2026-10-13", { today: TODAY })).toBeNull();
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-31", unit: "month" })).toBe("Oktober 2026");
    expect(periodLabel({ from: "2026-01-01", to: "2026-12-31", unit: "year" })).toBe("Tahun 2026");
    expect(periodLabel({ from: "2026-10-07", to: "2026-10-13", unit: "range" })).toBe("7 Okt 2026 – 13 Okt 2026");
  });
});

describe("nama file standar", () => {
  it("mengikuti pola GARAGE_{JENIS}[_{DIVISI}]_{PERIODE}.{ext}", () => {
    expect(reportFileName({ kind: "LAPORAN_PENJUALAN", from: TODAY, to: TODAY, ext: "pdf" })).toBe("GARAGE_LAPORAN_PENJUALAN_2026-10-13.pdf");
    expect(reportFileName({ kind: "PEMBELIAN_BAHAN_BAKU", division: "BAR", from: "2026-10-01", to: "2026-10-31", ext: "csv" })).toBe(
      "GARAGE_PEMBELIAN_BAHAN_BAKU_BAR_2026-10.csv",
    );
    expect(reportFileName({ kind: "PEMBELIAN_BAHAN_BAKU", division: "KITCHEN", from: "2026-10-01", to: "2026-10-31", ext: "pdf" })).toBe(
      "GARAGE_PEMBELIAN_BAHAN_BAKU_KITCHEN_2026-10.pdf",
    );
    expect(reportFileName({ kind: "LAPORAN_STOK", from: TODAY, to: TODAY, ext: "xlsx" })).toBe("GARAGE_LAPORAN_STOK_2026-10-13.xlsx");
    expect(reportFileName({ kind: "LAPORAN_PENJUALAN", from: "2026-01-01", to: "2026-12-31", ext: "pdf" })).toBe("GARAGE_LAPORAN_PENJUALAN_2026.pdf");
    expect(reportFileName({ kind: "LAPORAN_PENJUALAN", from: "2026-02-01", to: "2026-02-28", ext: "pdf" })).toBe("GARAGE_LAPORAN_PENJUALAN_2026-02.pdf");
    expect(reportFileName({ kind: "LAPORAN_PENJUALAN", from: "2026-10-07", to: TODAY, ext: "pdf" })).toBe("GARAGE_LAPORAN_PENJUALAN_2026-10-07_2026-10-13.pdf");
  });
});

describe("katalog & klasifikasi mutasi", () => {
  it("setiap jenis laporan keuangan engine ada di katalog Pusat Laporan", () => {
    const ids = REPORT_CATALOG.keuangan.types.map((t) => t.id);
    for (const type of FINANCE_TYPES) expect(ids).toContain(type);
  });

  it("refDoc ledger WMS → golongan laporan stok", () => {
    expect(classifyMovement("in", "RCV-20261013-ABCD", 10)).toBe("purchase");
    expect(classifyMovement("out", "BATAL RCV-20261013-ABCD", -10)).toBe("purchase");
    expect(classifyMovement("out", "SALE ORD-1", -5)).toBe("sale");
    expect(classifyMovement("in", "Refund ORD-1: stok dikembalikan", 5)).toBe("sale");
    expect(classifyMovement("out", "PRD-20261013-X", -3)).toBe("productionUse");
    expect(classifyMovement("in", "PRD-20261013-X", 2)).toBe("productionIn");
    expect(classifyMovement("transfer", "TRF-1", -2)).toBe("transfer");
    expect(classifyMovement("internal_out", "IO-1", -2)).toBe("transfer");
    expect(classifyMovement("adjustment", "OPN-1 · opname", -1)).toBe("adjustment");
    expect(classifyMovement("waste", "x", -1)).toBe("waste");
    expect(classifyMovement("in", "STOK-AWAL", 9)).toBe("other");
  });
});
