import { describe, expect, it } from "vitest";

import { groupLineup, instagramUrl, lineupSummary, mergeLineup, officialLineupName, parseInstagramHandle, parseLineupKind, enrichSlotsForEventPage, garageLineupAsEventSlots, lineupKey, type LineupItem } from "@/lib/gigs-lineup";

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

describe("officialLineupName (Owner: SURAU → SURAI)", () => {
  it("ejaan platform diganti nama resmi, nama lain apa adanya", () => {
    expect(officialLineupName("SURAU")).toBe("SURAI");
    expect(officialLineupName(" surau ")).toBe("SURAI");
    expect(officialLineupName("SURAI")).toBe("SURAI");
    expect(officialLineupName("Lost Side")).toBe("Lost Side");
  });
  it("logo platform ikut ke kartu Garage OS bernama resmi", () => {
    const platform: LineupItem[] = [{ name: officialLineupName("SURAU"), platformName: "SURAU", logo: "/event/uploads/surau.png", kind: "band" }];
    expect(mergeLineup(platform, [{ name: "SURAI", kind: "band" }])[0]).toMatchObject({ name: "SURAI", logo: "/event/uploads/surau.png" });
  });
  it("baris Garage OS yang masih tersimpan 'SURAU' (impor lama) tampil SURAI di beranda, logo platform tetap ikut", () => {
    const platform: LineupItem[] = [{ name: officialLineupName("SURAU"), platformName: "SURAU", logo: "/event/uploads/surau.png", kind: "band" }];
    const out = mergeLineup(platform, [{ name: "LOST SIDE", kind: "band" }, { name: "SURAU", kind: "band" }]);
    expect(out.map((item) => item.name)).toEqual(["LOST SIDE", "SURAI"]);
    expect(out[1].logo).toBe("/event/uploads/surau.png");
  });
});


describe("enrichSlotsForEventPage (halaman event platform, Owner 18 Nov 2026)", () => {
  it("slot penampil kosong → penampil = nama resmi slot, logo dilengkapi; sesi non-penampil apa adanya", () => {
    const logos = new Map([[lineupKey("LOST SIDE"), "/event/x/lost-side.jpg"], [lineupKey("SURAI"), "/garage-uploads/event-lineup/surai.webp"]]);
    const out = enrichSlotsForEventPage(
      [
        { id: "1", name: "SURAI HC", category: "band", startTime: "20:00", durationMin: 30, performer: "", logo: "" },
        { id: "2", name: "LOSTSIDE", category: "band", startTime: "", durationMin: 30, performer: "", logo: "" },
        { id: "3", name: "Slot Komika", category: "komika", startTime: "", durationMin: 20, performer: "Standup Tebing", logo: "/event/x/su.png" },
        { id: "4", name: "Sesi sponsor 1", category: "sponsor", startTime: "", durationMin: 5, performer: "", logo: "" },
        null,
      ],
      logos,
    );
    expect(out).toEqual([
      { id: "1", name: "Official Lineup", category: "band", startTime: "20:00", durationMin: 30, performer: "SURAI", logo: "/garage-uploads/event-lineup/surai.webp" },
      { id: "2", name: "Official Lineup", category: "band", startTime: "", durationMin: 30, performer: "LOST SIDE", logo: "/event/x/lost-side.jpg" },
      { id: "3", name: "Official Lineup", category: "komika", startTime: "", durationMin: 20, performer: "Standup Tebing", logo: "/event/x/su.png" },
      { id: "4", name: "Sesi sponsor 1", category: "sponsor", startTime: "", durationMin: 5, performer: "", logo: "" },
    ]);
    expect(enrichSlotsForEventPage("bukan array", logos)).toEqual([]);
  });
  it("SATU pintu: lineup Garage OS → slot halaman event (tagline, jam rundown, logo Garage lalu platform)", () => {
    const logos = new Map([[lineupKey("LOST SIDE"), "/event/x/lost-side.jpg"]]);
    const out = garageLineupAsEventSlots(
      [
        { name: "LOST SIDE", kind: "band", time: "20.00–20.30", logo: null, tagline: "Heavy / Metallic Roster" },
        { name: "SURAU", kind: "band", time: null, logo: "/garage-uploads/event-lineup/surai.webp", photo: "/garage-uploads/event-lineup/surai-foto.webp", tagline: null },
      ],
      logos,
    );
    expect(out).toEqual([
      { id: "garage-1", name: "Heavy / Metallic Roster", category: "band", startTime: "20.00–20.30", durationMin: 0, performer: "LOST SIDE", logo: "/event/x/lost-side.jpg" },
      { id: "garage-2", name: "Official Lineup", category: "band", startTime: "", durationMin: 0, performer: "SURAI", logo: "/garage-uploads/event-lineup/surai.webp", photo: "/garage-uploads/event-lineup/surai-foto.webp" },
    ]);
  });
});
