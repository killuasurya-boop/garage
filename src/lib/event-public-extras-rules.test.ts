import { describe, expect, it } from "vitest";

import { buildCloseout, buildReadiness, mergeParticipants, platformTimestamp, sponsorSupport } from "@/lib/event-public-extras-rules";

// Halaman event dari Garage (Owner 19 Nov 2026): peserta, kesiapan, laporan akhir.
describe("mergeParticipants", () => {
  it("Garage dulu, data platform lama ikut; nama sama (beda ejaan/spasi) tidak dobel", () => {
    const out = mergeParticipants(
      { sponsors: [{ name: "Kopi Lama" }], creators: [{ name: "SURAU", category: "band" }, { name: "Standup Lama", category: "komika" }], sponsorCounts: { committed: 1 } },
      {
        sponsors: [{ name: "Kopi Baru", category: "kuliner", support: "kas", supportNote: "", logo: "" }],
        creators: [{ id: "1", name: "SURAI", category: "band", description: "", instagram: "", portfolio: "", address: "", logo: "" }],
      },
    );
    expect(out.sponsors.map((s) => s.name)).toEqual(["Kopi Baru", "Kopi Lama"]);
    expect(out.creators.map((c) => c.name)).toEqual(["SURAI", "Standup Lama"]);
    expect(out.sponsorCounts).toEqual({ committed: 1 });
  });
  it("sponsor tanpa uang tapi ada barang = nonkas", () => {
    expect(sponsorSupport(0, ["Air mineral", "Es batu"])).toEqual({ support: "nonkas", supportNote: "Air mineral, Es batu" });
    expect(sponsorSupport(500_000, ["Air mineral"])).toEqual({ support: "kas", supportNote: "" });
  });
});

describe("buildReadiness", () => {
  it("dari data nyata; yang tidak ada datanya tidak dihitung (bukan 0 palsu)", () => {
    const r = buildReadiness({
      ops: [{ key: "izin", done: true }, { key: "keamanan", done: false }, { key: "soundcheck", done: false }],
      finance: { target: 1_000_000, income: 500_000, committedCount: 0, budgetLines: [{ stage: "dp", needsVendor: true }, { stage: "belum-dipesan", needsVendor: true }] },
      performers: [{ hasTime: true }, { hasTime: false }],
      activeCrew: 2,
      obligations: { done: 0, total: 0 },
    });
    expect(r.gates).toEqual([{ gate: "A", done: 1, total: 2 }, { gate: "B", done: 3, total: 3 }, { gate: "C", done: 2, total: 4 }]);
    expect(r.components.find((c) => c.key === "dana")).toMatchObject({ available: true, percent: 50 });
    expect(r.components.find((c) => c.key === "sponsor")).toMatchObject({ available: false });
    // (30×50 + 25×50 + 20×67 + 10×50) / 85 = 54
    expect(r.total).toBe(54);
  });
  it("tanpa transparansi aktif: dana & vendor tidak tersedia, Gate B 0", () => {
    const r = buildReadiness({ ops: [], finance: null, performers: [], activeCrew: 0, obligations: { done: 0, total: 0 } }, { decision: "go" });
    expect(r.components.filter((c) => c.available).map((c) => c.key)).toEqual(["checklist", "lineup"]);
    expect(r.gates[1]).toEqual({ gate: "B", done: 0, total: 3 });
    expect(r.decision).toEqual({ decision: "go" });
  });
});

describe("buildCloseout", () => {
  const base = {
    event: { name: "GIGS", venue: "Garage Coffee" },
    finance: { income: 3_000_000, expense: 2_500_000, target: 5_000_000 },
    attendance: 120,
    program: [{ name: "SURAI", actualStart: "20.05", actualEnd: "20.40" }],
    sponsors: [{ name: "Kopi", support: "kas" as const }],
    obligations: { done: 2, total: 3, sponsors: 1 },
  };
  it("belum diterbitkan → null", () => {
    expect(buildCloseout({ ...base, closeout: { published: false, publishedAt: null, evaluation: "", recommendations: "", surplusDecision: "", incidentsTotal: 0, incidentsResolved: 0 } })).toBeNull();
  });
  it("diterbitkan → bentuk halaman event (saldo dihitung, insiden ditangani ≤ total)", () => {
    const c = buildCloseout({ ...base, closeout: { published: true, publishedAt: "2027-01-02T03:04:05.000Z", evaluation: "Ramai", recommendations: "Tambah tenda", surplusDecision: "Kas event berikutnya", incidentsTotal: 1, incidentsResolved: 3 } });
    expect(c).toMatchObject({
      publishedAt: "2027-01-02 03:04:05",
      finance: { income: 3_000_000, expense: 2_500_000, balance: 500_000, target: 5_000_000, corrections: 0, pendingPayments: 0 },
      attendance: 120,
      incidents: { total: 1, resolved: 1 },
      program: [{ name: "SURAI", performer: "", actualStart: "20.05", actualEnd: "20.40" }],
      benefits: { hak: { done: 2, total: 3 }, konten: { done: 0, total: 0 }, sponsors: 1 },
    });
    expect(platformTimestamp("2026-12-31T12:00:00.000Z")).toBe("2026-12-31 12:00:00");
  });
});
