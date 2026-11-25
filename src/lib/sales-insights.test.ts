import { describe, expect, it } from "vitest";

import { activeHours, weekdayHourGrid, wibWeekday } from "@/lib/sales-insights";

describe("weekdayHourGrid (jam sibuk WIB)", () => {
  it("memakai hari & jam WIB, bukan UTC", () => {
    // Minggu 22 Nov 2026 17:30 UTC = Senin 23 Nov 00:30 WIB.
    const lateNight = new Date("2026-11-22T17:30:00Z");
    expect(wibWeekday(lateNight)).toBe(0);
    const cells = weekdayHourGrid([
      { createdAt: lateNight, total: 10_000 },
      { createdAt: new Date("2026-11-22T17:50:00Z"), total: 5_000 },
      // Sabtu 28 Nov 2026 12:10 WIB.
      { createdAt: new Date("2026-11-28T05:10:00Z"), total: 20_000 },
    ]);
    expect(cells).toEqual([
      { weekday: 0, hour: 0, count: 2, revenue: 15_000 },
      { weekday: 5, hour: 12, count: 1, revenue: 20_000 },
    ]);
    expect(activeHours(cells)).toEqual([0, 12]);
  });

  it("tanpa order → kosong", () => {
    expect(weekdayHourGrid([])).toEqual([]);
  });
});
