import { describe, expect, it } from "vitest";

import {
  defaultApprovedSellPrice,
  partnerHealthAlerts,
  partnerPerformance,
  priceProposalBlockReason,
  priceProposalImpact,
  serviceGrade,
} from "@/lib/partner-hub-insights";

const base = { currentUnitCost: 22_000, currentSellPrice: 25_000, reason: "Harga daging ayam naik" };

describe("pengajuan harga mitra", () => {
  it("menerima pengajuan sah", () => {
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 23_000 })).toBeNull();
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 22_000, suggestedSellPrice: 27_000 })).toBeNull();
  });

  it("menolak angka tidak sah, harga sama, jual di bawah setor, alasan kosong", () => {
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 0 })).toMatch(/lebih dari 0/);
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 22_500.5 })).toMatch(/rupiah bulat/);
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 22_000 })).toMatch(/sama/);
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 30_000, suggestedSellPrice: 28_000 })).toMatch(/di bawah harga setor/);
    expect(priceProposalBlockReason({ ...base, proposedUnitCost: 23_000, reason: "  " })).toMatch(/alasan/);
  });

  it("dampak margin & tanda perubahan besar", () => {
    const impact = priceProposalImpact({ currentUnitCost: 20_000, currentSellPrice: 25_000, proposedUnitCost: 26_000, sellPrice: 30_000 });
    expect(impact.costDelta).toBe(6_000);
    expect(impact.costDeltaPct).toBe(30);
    expect(impact.marginBefore).toBe(5_000);
    expect(impact.marginAfter).toBe(4_000);
    expect(impact.bigChange).toBe(true);
    expect(impact.belowCost).toBe(false);
  });

  it("harga jual default: usulan mitra → harga sekarang → jaga margin rupiah bila harga sekarang di bawah setor baru", () => {
    expect(defaultApprovedSellPrice({ currentUnitCost: 22_000, currentSellPrice: 25_000, proposedUnitCost: 23_000, suggestedSellPrice: 27_000 })).toBe(27_000);
    expect(defaultApprovedSellPrice({ currentUnitCost: 22_000, currentSellPrice: 25_000, proposedUnitCost: 23_000 })).toBe(25_000);
    expect(defaultApprovedSellPrice({ currentUnitCost: 22_000, currentSellPrice: 25_000, proposedUnitCost: 26_000 })).toBe(29_000);
  });
});

const at = (min: number) => new Date(Date.UTC(2026, 10, 10, 5, 0) + min * 60_000); // 12:00 WIB

describe("rapor kinerja mitra", () => {
  const options = { acceptSlaMinutes: 5, prepTargetMinutes: 15, pickupSlaMinutes: 3 };

  it("menghitung waktu terima/siap, tolak, batal, skor & jam ramai", () => {
    const report = partnerPerformance(
      [
        { status: "served", createdAt: at(0), acceptedAt: at(2), readyAt: at(12), claimedAt: at(14) },
        { status: "served", createdAt: at(5), acceptedAt: at(13), readyAt: at(40), claimedAt: at(50) },
        { status: "rejected", createdAt: at(10), rejectReason: "Bahan habis" },
        { status: "cancelled", createdAt: at(20) },
        // diterima, belum siap: dihitung di waktu terima, tidak di waktu siap
        { status: "queue", createdAt: at(70), acceptedAt: at(71) },
      ],
      options,
    );
    expect(report.totalTickets).toBe(5);
    expect(report.completed).toBe(2);
    expect(report.rejected).toBe(1);
    expect(report.cancelled).toBe(1);
    // diputuskan mitra = 3 diterima + 1 ditolak
    expect(report.rejectRatePct).toBe(25);
    expect(report.accept.count).toBe(3);
    expect(report.accept.late).toBe(1);
    expect(report.prep.count).toBe(2);
    expect(report.prep.late).toBe(1);
    expect(report.pickup.late).toBe(1);
    expect(report.rejectReasons).toEqual([{ reason: "Bahan habis", count: 1 }]);
    expect(report.peakHours[0]).toEqual({ hour: 12, count: 4 });
    expect(report.serviceScore).toBeGreaterThan(0);
    expect(report.serviceScore).toBeLessThan(100);
  });

  it("tanpa data: skor null, bukan 0", () => {
    const report = partnerPerformance([], options);
    expect(report.serviceScore).toBeNull();
    expect(report.rejectRatePct).toBeNull();
    expect(serviceGrade(report.serviceScore)).toBe("Belum ada data");
  });

  it("semua tepat waktu → skor 100", () => {
    const report = partnerPerformance([{ status: "served", createdAt: at(0), acceptedAt: at(1), readyAt: at(10) }], options);
    expect(report.serviceScore).toBe(100);
    expect(serviceGrade(100)).toBe("Sangat baik");
  });
});

describe("kesehatan mitra", () => {
  const now = at(60);
  const healthy = {
    partnerName: "Pokat Au",
    partnerStatus: "aktif",
    operationalStatus: "buka",
    products: [{ name: "Es Krim", active: true, available: true, availabilityUpdatedAt: at(0) }],
    activeTickets: [],
    pendingProposals: 0,
    pendingAdjustments: 0,
    unpaidApproved: 0,
    hasVerifiedBank: true,
  };

  it("mitra sehat tanpa peringatan", () => {
    expect(partnerHealthAlerts(healthy, { now })).toEqual([]);
  });

  it("tiket telat diterima (kritis) lebih dulu, tiket diterima tidak dianggap telat terima", () => {
    const alerts = partnerHealthAlerts(
      {
        ...healthy,
        pendingProposals: 1,
        activeTickets: [
          { ticketNo: "M-1", status: "queue", createdAt: at(40) },
          { ticketNo: "M-2", status: "queue", createdAt: at(40), acceptedAt: at(41) },
        ],
      },
      { now, acceptSlaMinutes: 5 },
    );
    expect(alerts[0]).toMatchObject({ level: "critical", code: "ACCEPT_LATE", text: expect.stringContaining("1 pesanan") });
    expect(alerts.map((a) => a.code)).toContain("PRICE_PROPOSAL_PENDING");
  });

  it("ketersediaan basi, rekening belum terverifikasi, mitra nonaktif diabaikan", () => {
    const codes = partnerHealthAlerts({ ...healthy, hasVerifiedBank: false }, { now: new Date(at(0).getTime() + 5 * 86_400_000) }).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(["AVAILABILITY_STALE", "NO_BANK"]));
    expect(partnerHealthAlerts({ ...healthy, partnerStatus: "nonaktif", hasVerifiedBank: false }, { now })).toEqual([]);
  });

  it("bahasa netral: tidak menuduh", () => {
    const alerts = partnerHealthAlerts(
      { ...healthy, operationalStatus: "tutup", hasVerifiedBank: false, unpaidApproved: 50_000, activeTickets: [{ ticketNo: "M-3", status: "cooking", createdAt: at(0), acceptedAt: at(1) }] },
      { now },
    );
    for (const alert of alerts) expect(alert.text).not.toMatch(/curang|bohong|lalai|salah mitra|menipu/i);
  });
});

describe("klaim grup per meja", () => {
  it("mengelompokkan Siap Antar per meja, take away terpisah, urut paling lama siap", async () => {
    const { groupPickupByTable } = await import("@/lib/partner-hub-insights");
    const groups = groupPickupByTable([
      { ticketNo: "M-1", tableLabel: "Meja 06", status: "ready", claimedByName: null, readyAt: "2026-11-11T05:05:00Z", partnerName: "Pokat Au" },
      { ticketNo: "M-2", tableLabel: "Meja 06", status: "ready", claimedByName: "Dewi", readyAt: "2026-11-11T05:02:00Z", partnerName: "Dimsum" },
      { ticketNo: "M-3", tableLabel: null, status: "ready", claimedByName: null, readyAt: "2026-11-11T05:01:00Z" },
      { ticketNo: "M-4", tableLabel: null, status: "ready", claimedByName: null, readyAt: "2026-11-11T05:03:00Z" },
      { ticketNo: "M-5", tableLabel: "Meja 06", status: "cooking", claimedByName: null },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["takeaway:M-3", "table:Meja 06", "takeaway:M-4"]);
    const table = groups[1];
    expect(table.claimable).toEqual(["M-1"]);
    expect(table.deliverable).toEqual(["M-2"]);
    expect(table.partners).toEqual(["Pokat Au", "Dimsum"]);
  });
});
