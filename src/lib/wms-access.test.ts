import { describe, it, expect } from "vitest";

import { wmsIsElevated, wmsAllowedWarehouseTypes } from "@/lib/wms-access";

describe("WMS access control (peran)", () => {
  it("peran elevated → akses semua gudang", () => {
    for (const role of ["Owner / CEO", "Admin", "Manager Operasional"]) {
      expect(wmsIsElevated(role)).toBe(true);
      expect(wmsAllowedWarehouseTypes(role)).toBe("all");
    }
  });

  it("peran outlet → hanya bar & dapur, bukan gudang utama", () => {
    for (const role of ["Barista", "Kasir", "Kitchen", null, undefined]) {
      expect(wmsIsElevated(role)).toBe(false);
      const allowed = wmsAllowedWarehouseTypes(role);
      expect(allowed).toEqual(["bar", "kitchen"]);
      expect(allowed).not.toContain("main");
    }
  });
});
