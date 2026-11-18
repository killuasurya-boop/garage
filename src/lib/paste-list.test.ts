import { describe, expect, it } from "vitest";

import {
  markDuplicateNames,
  parseClock,
  parseCrewRole,
  parseCrewRows,
  parseRupiah,
  parseSponsorRows,
  parseTalentRows,
  splitPasted,
} from "@/lib/paste-list";

describe("splitPasted", () => {
  it("tab dari Excel, baris kosong dilewati, nomor baris asli disimpan", () => {
    expect(splitPasted("A\tB\n\nC\tD\n")).toEqual([
      { line: 1, cells: ["A", "B"] },
      { line: 3, cells: ["C", "D"] },
    ]);
  });
  it("WhatsApp dengan ' - ' dan CSV titik koma", () => {
    expect(splitPasted("LOST SIDE - band - @lostside").map((r) => r.cells)).toEqual([["LOST SIDE", "band", "@lostside"]]);
    expect(splitPasted('"Surai";band').map((r) => r.cells)).toEqual([["Surai", "band"]]);
  });
});

describe("talent", () => {
  it("tempelan Excel dengan judul kolom + nomor urut → data siap simpan", () => {
    const rows = parseTalentRows(
      [
        "No\tNama\tJenis\tTagline\tInstagram\tJam\tDurasi\tWA",
        "1\tLOST SIDE\tband\tHeavy / Metallic Roster\t@lostside.official\t20.00\t40\t0812-3456-7890",
        "2\tSURAI\tBand\tUnderground Stage Unit\thttps://instagram.com/surai.band\t2045\t40\t",
        "3\tSTAND OUT\tkomika\tHigh-Energy Performer\t\t21:30\t30 menit\t",
      ].join("\n"),
    );
    expect(rows.map((r) => r.errors)).toEqual([[], [], []]);
    expect(rows[0].value).toEqual({
      name: "LOST SIDE",
      kind: "band",
      tagline: "Heavy / Metallic Roster",
      instagram: "lostside.official",
      setStart: "20:00",
      setMinutes: 40,
      contactPhone: "081234567890",
    });
    expect(rows[1].value).toMatchObject({ instagram: "surai.band", setStart: "20:45", contactPhone: null });
    expect(rows[2].value).toMatchObject({ kind: "standup", setMinutes: 30 });
  });
  it("kesalahan per baris jelas, tidak ditebak", () => {
    const [row] = parseTalentRows("X\tsulap\t\tbukan akun!\t25:00\tlama\t123");
    expect(row.value).toBeNull();
    expect(row.errors.join(" | ")).toMatch(/Nama wajib/);
    expect(row.errors.join(" | ")).toMatch(/Jenis "sulap"/);
    expect(row.errors.join(" | ")).toMatch(/Instagram/);
    expect(row.errors.join(" | ")).toMatch(/Jam "25:00"/);
    expect(row.errors.join(" | ")).toMatch(/Durasi/);
    expect(row.errors.join(" | ")).toMatch(/WA/);
  });
  it("nama dobel di tempelan yang sama ditandai", () => {
    const rows = markDuplicateNames(parseTalentRows("Surai\nsurai"));
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual(["Nama ini sudah ada di baris sebelumnya."]);
  });
});

describe("panitia", () => {
  it("jabatan dari singkatan/label; kosong = Lainnya", () => {
    expect(parseCrewRole("Ketua Panitia")).toBe("ketua");
    expect(parseCrewRole("SM")).toBe("stage");
    expect(parseCrewRole("Liaison Officer (LO)")).toBe("lo");
    expect(parseCrewRole("")).toBe("lainnya");
    expect(parseCrewRole("presiden")).toBeNull();
  });
  it("baris WhatsApp panitia", () => {
    const rows = parseCrewRows("Ace - Ketua - 081211112222 - Lineup, honor band\nRafly - sound - 6281233334444");
    expect(rows.map((r) => r.value)).toEqual([
      { name: "Ace", role: "ketua", phone: "081211112222", duties: "Lineup, honor band" },
      { name: "Rafly", role: "sound", phone: "081233334444", duties: null },
    ]);
  });
});

describe("sponsor", () => {
  it("nilai rupiah dalam banyak penulisan", () => {
    expect(parseRupiah("Rp1.000.000")).toBe(1_000_000);
    expect(parseRupiah("1,5 juta")).toBe(1_500_000);
    expect(parseRupiah("500rb")).toBe(500_000);
    expect(parseRupiah("300k")).toBe(300_000);
    expect(parseRupiah("")).toBe(0);
    expect(() => parseRupiah("seikhlasnya")).toThrow();
  });
  it("baris sponsor lengkap", () => {
    const [row] = parseSponsorRows("Nama\tPaket\tNilai\tInstagram\tKontak\tWA\nDesain Aja Dulu\tGold\tRp1.000.000\t@desainajadulu\tBudi\t08123456789");
    expect(row.value).toEqual({
      name: "Desain Aja Dulu",
      packageName: "Gold",
      agreedAmount: 1_000_000,
      instagram: "desainajadulu",
      contactName: "Budi",
      contactPhone: "08123456789",
    });
  });
});

describe("parseClock", () => {
  it("format jam umum", () => {
    expect(parseClock("19.30 WIB")).toBe("19:30");
    expect(parseClock("7")).toBe("07:00");
    expect(parseClock("-")).toBeNull();
  });
});
