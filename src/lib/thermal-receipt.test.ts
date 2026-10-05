import { describe, expect, it } from "vitest";

import { buildKitchenChitContent, buildThermalContent } from "@/lib/thermal-receipt";

describe("Nomor meja di struk thermal", () => {
  it("struk pelanggan dine-in mencetak MEJA 06 (format kanonik), takeaway tidak", () => {
    const dineIn = buildThermalContent({ orderNo: "POS-1", tableLabel: "Meja 6", items: [] });
    expect(dineIn).toContain("MEJA 06");
    const takeaway = buildThermalContent({ orderNo: "POS-2", tableLabel: "Takeaway", items: [] });
    expect(takeaway).not.toContain("MEJA");
  });

  it("chit dapur/bar memakai banner meja besar", () => {
    const chit = buildKitchenChitContent({
      orderNo: "POS-3",
      tableLabel: "Meja 12",
      createdAt: new Date().toISOString(),
      items: [{ name: "Kopi", qty: 1, station: "Bar" }],
    } as never);
    expect(chit).toContain(">>> MEJA 12 <<<");
  });
});

describe("chit dapur/bar — nama pemesan", () => {
  it("mencetak NAMA di bawah banner meja, melewati placeholder Guest Customer", () => {
    const base = {
      orderNo: "POS-1",
      tableLabel: "Meja 07",
      items: [{ name: "Nasi Goreng", qty: 2, station: "Dapur" }],
    };
    const withName = buildKitchenChitContent({ ...base, customerName: "Andi" });
    expect(withName).toContain("NAMA: ANDI");
    expect(withName.indexOf("MEJA")).toBeLessThan(withName.indexOf("NAMA: ANDI"));
    expect(buildKitchenChitContent({ ...base, customerName: "Guest Customer" })).not.toContain("NAMA:");
  });
});
