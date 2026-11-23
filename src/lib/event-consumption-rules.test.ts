import { describe, expect, it } from "vitest";

import { buildConsumption, consumptionCsv } from "@/lib/event-consumption-rules";

describe("buildConsumption", () => {
  it("menjumlah porsi panitia + talent + tambahan; jumlah orang kosong/aneh = 1, dibatasi 100", () => {
    const r = buildConsumption({
      crew: [
        { name: "A", role: "Ketua", members: 2, attendance: "persiapan", diet: " halal " },
        { name: "B", role: "Sound", members: null, attendance: null, diet: null },
      ],
      talents: [
        { name: "Band", kind: "Band", members: 5, diet: null, funded: true },
        { name: "Solo", kind: "Akustik", members: 0, diet: "", funded: false },
        { name: "Besar", kind: "Band", members: 500, diet: null, funded: false },
      ],
      extraPortions: 2.6,
      crewWaiting: 4,
    });
    expect(r.totals).toEqual({ crew: 3, crewWaiting: 4, fundedTalent: 5, volunteerTalent: 101, extra: 3, portions: 112 });
    expect(r.rows[0]).toMatchObject({ group: "Panitia", attendance: "Persiapan (H-1)", diet: "halal" });
    expect(r.rows[1]).toMatchObject({ attendance: "-", diet: "-" });
    expect(r.rows[3].group).toBe("Talent non-honor");
  });

  it("porsi tambahan negatif → 0", () => {
    expect(buildConsumption({ crew: [], talents: [], extraPortions: -5, crewWaiting: 0 }).totals.portions).toBe(0);
  });
});

describe("consumptionCsv", () => {
  it("BOM, kutip ganda di-escape, sel formula diberi apostrof, baris total", () => {
    const csv = consumptionCsv(buildConsumption({ crew: [{ name: '=SUM(A1) "x"', role: "Ketua", members: 1, attendance: null, diet: "@alergi" }], talents: [], extraPortions: 2, crewWaiting: 0 }));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=SUM(A1) ""x"""`);
    expect(csv).toContain(`"'@alergi"`);
    expect(csv).toContain('"Tambahan","MC / tamu / lainnya","","2"');
    expect(csv).toContain('"TOTAL PORSI","","","3"');
  });
});
