import { describe, expect, it } from "vitest";

import { defaultTableFloor } from "@/lib/garage-tables";
import { filterTables, floorsOf, noTableAvailable, occupancySummary, tableFloor, type FloorTable } from "@/lib/table-floor-view";

const t = (n: string, status: FloorTable["customerStatus"], floor?: number): FloorTable => ({
  tableNumber: n,
  tableLabel: `Meja ${n}`,
  floor,
  area: "",
  capacity: 4,
  customerStatus: status,
});

describe("Smart Table Selector — lantai", () => {
  it("default lantai: 01–25 = 1, 26–50 = 2", () => {
    expect(defaultTableFloor("01")).toBe(1);
    expect(defaultTableFloor("25")).toBe(1);
    expect(defaultTableFloor("26")).toBe(2);
    expect(defaultTableFloor("50")).toBe(2);
    expect(tableFloor({ tableNumber: "30", floor: null })).toBe(2);
    expect(tableFloor({ tableNumber: "30", floor: 1 })).toBe(1);
  });

  it("daftar lantai + rentang + jumlah tersedia", () => {
    const floors = floorsOf([t("01", "available"), t("02", "occupied"), t("26", "available", 2), t("27", "reserved", 2)]);
    expect(floors).toEqual([
      { floor: 1, label: "Lantai 1", range: "01–02", total: 2, available: 1 },
      { floor: 2, label: "Lantai 2", range: "26–27", total: 2, available: 1 },
    ]);
  });

  it("ringkasan okupansi menghitung per status nyata", () => {
    const s = occupancySummary([t("01", "available"), t("02", "occupied"), t("03", "occupied"), t("04", "cleaning")]);
    expect(s).toMatchObject({ available: 1, occupied: 2, cleaning: 1, reserved: 0, held: 0, total: 4 });
  });

  it("filter lantai, status, dan cari nomor (8 = 08)", () => {
    const tables = [t("08", "available"), t("18", "occupied"), t("28", "available")];
    expect(filterTables(tables, { floor: 1, status: "all", query: "" }).map((r) => r.tableNumber)).toEqual(["08", "18"]);
    expect(filterTables(tables, { floor: "all", status: "available", query: "" }).map((r) => r.tableNumber)).toEqual(["08", "28"]);
    expect(filterTables(tables, { floor: "all", status: "all", query: "8" }).map((r) => r.tableNumber)).toContain("08");
    expect(filterTables(tables, { floor: "all", status: "all", query: "meja 28" }).map((r) => r.tableNumber)).toEqual(["28"]);
  });

  it("semua meja tidak tersedia terdeteksi; meja milik sendiri tetap dianggap tersedia", () => {
    expect(noTableAvailable([t("01", "occupied"), t("02", "reserved")])).toBe(true);
    expect(noTableAvailable([t("01", "occupied"), { ...t("02", "held"), mine: true }])).toBe(false);
    expect(noTableAvailable([])).toBe(false);
  });
});
