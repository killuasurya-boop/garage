import { describe, expect, it } from "vitest";

import { parseCsv, parseLocaleNumber, parseYesNo } from "@/lib/bulk-import";
import { parseWmsScan } from "@/lib/wms-scan";

describe("parser impor massal", () => {
  it("CSV: kutip, koma di dalam sel, titik koma, BOM, CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
    expect(parseCsv("a;b;c\n1;2,5;3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2,5", "3"],
    ]);
    expect(parseCsv('a,b\n"multi\nline",2')).toEqual([
      ["a", "b"],
      ["multi\nline", "2"],
    ]);
  });

  it("angka format Indonesia & Excel", () => {
    expect(parseLocaleNumber("22000")).toBe(22000);
    expect(parseLocaleNumber("22.000")).toBe(22000);
    expect(parseLocaleNumber("Rp 22.000")).toBe(22000);
    expect(parseLocaleNumber("1.234.567")).toBe(1234567);
    expect(parseLocaleNumber("0,12")).toBe(0.12);
    expect(parseLocaleNumber("18,5")).toBe(18.5);
    expect(parseLocaleNumber("1.234,5")).toBe(1234.5);
    expect(parseLocaleNumber("1,234.5")).toBe(1234.5);
    expect(parseLocaleNumber("0.125")).toBe(0.125);
    expect(parseLocaleNumber("")).toBeNull();
    expect(parseLocaleNumber("sepuluh")).toBeNaN();
    expect(parseLocaleNumber("12abc")).toBeNaN();
  });

  it("Ya/Tidak", () => {
    expect(parseYesNo("Ya")).toBe(true);
    expect(parseYesNo("tidak")).toBe(false);
    expect(parseYesNo("")).toBeNull();
    expect(parseYesNo("mungkin")).toBeNull();
  });
});

describe("scan label gudang", () => {
  it("label penerimaan SKU|BATCH → SKU + batch; SKU/barcode biasa apa adanya", () => {
    expect(parseWmsScan("BAR-001|RCV-20261013-ABCD-1")).toEqual({ code: "BAR-001", batch: "RCV-20261013-ABCD-1" });
    expect(parseWmsScan(" BAR-001 ")).toEqual({ code: "BAR-001", batch: null });
    expect(parseWmsScan("8991234567890")).toEqual({ code: "8991234567890", batch: null });
    expect(parseWmsScan("BAR-001|")).toEqual({ code: "BAR-001", batch: null });
  });
});
