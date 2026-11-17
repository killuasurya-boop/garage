import { describe, expect, it } from "vitest";

import { groupLineup, instagramUrl, lineupSummary, mergeLineup, parseInstagramHandle, parseLineupKind, type LineupItem } from "@/lib/gigs-lineup";

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

describe("mergeLineup", () => {
  it("tanpa data Garage OS → lineup platform apa adanya", () => {
    const platform = [{ name: "A", logo: "/event/a.png", kind: null }];
    expect(mergeLineup(platform, [])).toBe(platform);
  });
  it("data Garage OS menggantikan, logo platform dipakai untuk nama yang sama", () => {
    const merged = mergeLineup([{ name: "SURAI", logo: "/event/surai.png", kind: null }], [
      { name: "Surai", kind: "band", time: "20.00–20.30" },
      { name: "Standup Indo Tebing Tinggi", kind: "standup" },
    ]);
    expect(merged).toEqual([
      { name: "Surai", kind: "band", logo: "/event/surai.png", time: "20.00–20.30", live: false, tagline: null, instagram: null },
      { name: "Standup Indo Tebing Tinggi", kind: "standup", logo: null, time: null, live: false, tagline: null, instagram: null },
    ]);
  });
  it("logo unggahan Garage OS & tagline menang atas logo platform", () => {
    const merged = mergeLineup([{ name: "Lost Side", logo: "/event/lost.png", kind: null }], [
      { name: "Lost Side", kind: "band", logo: "/garage-uploads/event-lineup/x.webp", tagline: "Heavy / Metallic Roster" },
    ]);
    expect(merged[0]).toMatchObject({ logo: "/garage-uploads/event-lineup/x.webp", tagline: "Heavy / Metallic Roster" });
  });
});

describe("instagram", () => {
  it("menerima @akun, akun, atau tautan profil", () => {
    expect(parseInstagramHandle("@lostside.band")).toBe("lostside.band");
    expect(parseInstagramHandle("https://www.instagram.com/surau_official/?igsh=abc")).toBe("surau_official");
    expect(parseInstagramHandle("  ")).toBeNull();
    expect(() => parseInstagramHandle("bukan akun!")).toThrow();
  });
  it("tautan hanya untuk akun valid", () => {
    expect(instagramUrl("standout")).toBe("https://www.instagram.com/standout/");
    expect(instagramUrl("javascript:alert(1)")).toBeNull();
    expect(instagramUrl(null)).toBeNull();
  });
});
