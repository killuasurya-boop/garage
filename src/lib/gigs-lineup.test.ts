import { describe, expect, it } from "vitest";

import { groupLineup, lineupSummary, parseLineupKind, type LineupItem } from "@/lib/gigs-lineup";

const item = (name: string, kind: LineupItem["kind"] = null): LineupItem => ({ name, logo: null, kind });

describe("parseLineupKind", () => {
  it("mengenali band dan stand-up dalam beberapa ejaan", () => {
    expect(parseLineupKind("Band")).toBe("band");
    expect(parseLineupKind("standup")).toBe("standup");
    expect(parseLineupKind("Stand-Up")).toBe("standup");
    expect(parseLineupKind("komika")).toBe("standup");
  });
  it("nilai tak dikenal atau bukan teks → null (tidak menebak)", () => {
    expect(parseLineupKind("sulap")).toBeNull();
    expect(parseLineupKind(undefined)).toBeNull();
    expect(parseLineupKind(3)).toBeNull();
  });
});

describe("groupLineup", () => {
  it("tanpa jenis → satu daftar seperti sebelumnya", () => {
    const groups = groupLineup([item("A"), item("B")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: null, label: "Penampil" });
    expect(lineupSummary(groups)).toBe("");
  });
  it("dengan jenis → Band dulu, lalu Stand-up, urutan dalam kelompok tetap", () => {
    const groups = groupLineup([item("Komika 1", "standup"), item("Band 1", "band"), item("Band 2", "band"), item("X")]);
    expect(groups.map((g) => g.label)).toEqual(["Band", "Stand-up Comedy", "Penampil lain"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Band 1", "Band 2"]);
    expect(lineupSummary(groups)).toBe("2 band · 1 stand-up");
  });
  it("lineup kosong → tidak ada kelompok", () => {
    expect(groupLineup([])).toEqual([]);
  });
});
