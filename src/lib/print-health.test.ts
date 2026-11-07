import { describe, expect, it } from "vitest";

import { getPrintHealth, recordPrintResult, subscribePrintHealth } from "./print-health";

describe("print-health — status cetak terakhir untuk QC Kasir", () => {
  it("mencatat hasil terakhir & memberi tahu pelanggan", () => {
    let calls = 0;
    const off = subscribePrintHealth(() => (calls += 1));
    recordPrintResult(true, "Cetak berhasil", 1000);
    expect(getPrintHealth()).toEqual({ at: 1000, ok: true, message: "Cetak berhasil" });
    recordPrintResult(false, "Kertas habis", 2000);
    expect(getPrintHealth()).toMatchObject({ ok: false, message: "Kertas habis" });
    expect(calls).toBe(2);
    off();
    recordPrintResult(true, "x", 3000);
    expect(calls).toBe(2);
  });
});
