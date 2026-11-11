import { describe, expect, it } from "vitest";

import {
  canChangePartnerStatus,
  effectiveOperationalStatus,
  isPastLastOrder,
  partnerCardLabel,
  partnerOrdersNeedingAttention,
  maskAccountNumber,
  partnerActivationBlockers,
  partnerLineFinance,
  partnerOrderBlockReason,
  partnerSettlementTotals,
  partnerTicketNextStatus,
  partnerTicketWhatsappText,
  payoutBlockReason,
  settlementStatusAfterPayment,
} from "@/lib/partner-hub-rules";

const ok = { hubEnabled: true, partnerStatus: "aktif", operationalStatus: "buka", linkActive: true, productStock: "ready", lastOrderByDay: {} };

describe("Partner Hub — ketersediaan", () => {
  it("hanya boleh dipesan bila hub aktif, mitra aktif & BUKA, produk tersedia", () => {
    expect(partnerOrderBlockReason(ok)).toBeNull();
    expect(partnerOrderBlockReason({ ...ok, hubEnabled: false })).toMatch(/belum aktif/);
    expect(partnerOrderBlockReason({ ...ok, partnerStatus: "dibekukan" })).toMatch(/dihentikan/);
    expect(partnerOrderBlockReason({ ...ok, linkActive: false })).toMatch(/belum disetujui/);
    expect(partnerOrderBlockReason({ ...ok, operationalStatus: "jeda" })).toMatch(/jeda/);
    expect(partnerOrderBlockReason({ ...ok, operationalStatus: "tutup" })).toMatch(/tutup/);
    expect(partnerOrderBlockReason({ ...ok, operationalStatus: "?" })).toMatch(/belum terkonfirmasi/);
    expect(partnerOrderBlockReason({ ...ok, productStock: "sold_out" })).toMatch(/Sold Out/);
  });

  it("last order per hari WIB (Minggu–Jumat 21:45, Sabtu 22:45)", () => {
    const rules = { "0": "21:45", "1": "21:45", "2": "21:45", "3": "21:45", "4": "21:45", "5": "21:45", "6": "22:45" };
    // Selasa 10 Nov 2026 21:40 WIB = 14:40 UTC.
    expect(isPastLastOrder(rules, new Date("2026-11-10T14:40:00Z"))).toBe(false);
    expect(isPastLastOrder(rules, new Date("2026-11-10T14:46:00Z"))).toBe(true);
    // Sabtu 14 Nov 2026 22:00 WIB masih boleh.
    expect(isPastLastOrder(rules, new Date("2026-11-14T15:00:00Z"))).toBe(false);
    expect(isPastLastOrder({}, new Date())).toBe(false);
    expect(partnerOrderBlockReason({ ...ok, lastOrderByDay: rules }, new Date("2026-11-10T15:00:00Z"))).toMatch(/last order/);
  });
});

describe("Partner Hub — kenyamanan kasir", () => {
  it("label kartu POS menyebut alasan, bukan sekadar Habis", () => {
    expect(partnerCardLabel(ok)).toBeNull();
    expect(partnerCardLabel({ ...ok, operationalStatus: "tutup" })).toBe("Mitra tutup");
    expect(partnerCardLabel({ ...ok, operationalStatus: "jeda" })).toBe("Mitra jeda");
    expect(partnerCardLabel({ ...ok, operationalStatus: "?" })).toBe("Mitra belum konfirmasi");
    expect(partnerCardLabel({ ...ok, productStock: "sold_out" })).toBe("Habis");
    const rules = { "2": "21:45" };
    expect(partnerCardLabel({ ...ok, lastOrderByDay: rules }, new Date("2026-11-10T15:00:00Z"))).toBe("Lewat last order");
  });

  it("badge perhatian: belum diterima lewat SLA atau siap belum diambil", () => {
    const now = new Date("2026-11-10T10:10:00Z").getTime();
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    const orders = [
      { status: "queue", createdAt: at(1), readyAt: null },
      { status: "queue", createdAt: at(3), readyAt: null },
      { status: "cooking", createdAt: at(9), readyAt: null },
      { status: "ready", createdAt: at(9), readyAt: at(4), claimedByName: null },
      { status: "ready", createdAt: at(9), readyAt: at(4), claimedByName: "Waiter A" },
      { status: "ready", createdAt: at(9), readyAt: at(1), claimedByName: null },
    ];
    expect(partnerOrdersNeedingAttention(orders, now, 2, 3)).toBe(2);
  });
});

describe("Partner Hub — status layanan yang berlaku", () => {
  const now = new Date("2026-11-10T08:00:00Z"); // Selasa 15:00 WIB
  it("Buka kemarin tidak terbawa ke hari ini (batas 05:00 WIB)", () => {
    expect(effectiveOperationalStatus({ operationalStatus: "buka", operationalStatusAt: "2026-11-09T12:00:00Z" }, now)).toBe("tutup");
    expect(effectiveOperationalStatus({ operationalStatus: "jeda", operationalStatusAt: "2026-11-09T12:00:00Z" }, now)).toBe("tutup");
    // Dibuka 06:00 WIB hari ini (= 23:00 UTC kemarin) tetap berlaku.
    expect(effectiveOperationalStatus({ operationalStatus: "buka", operationalStatusAt: "2026-11-09T23:00:00Z" }, now)).toBe("buka");
    // Lewat tengah malam (01:00 WIB) masih hari operasional yang sama dengan pembukaan kemarin sore.
    expect(effectiveOperationalStatus({ operationalStatus: "buka", operationalStatusAt: "2026-11-10T08:00:00Z" }, new Date("2026-11-10T18:00:00Z"))).toBe("buka");
  });

  it("portal mitra tidak terhubung → offline; 0 menit = tidak dicek", () => {
    const base = { operationalStatus: "buka", operationalStatusAt: "2026-11-10T02:00:00Z" };
    expect(effectiveOperationalStatus({ ...base, lastSeenAt: "2026-11-10T07:58:00Z", heartbeatMinutes: 5 }, now)).toBe("buka");
    expect(effectiveOperationalStatus({ ...base, lastSeenAt: "2026-11-10T07:50:00Z", heartbeatMinutes: 5 }, now)).toBe("offline");
    expect(effectiveOperationalStatus({ ...base, lastSeenAt: null, heartbeatMinutes: 5 }, now)).toBe("offline");
    expect(effectiveOperationalStatus({ ...base, lastSeenAt: null, heartbeatMinutes: 0 }, now)).toBe("buka");
    expect(partnerOrderBlockReason({ ...ok, operationalStatus: "offline" })).toMatch(/tidak terhubung/);
    expect(partnerCardLabel({ ...ok, operationalStatus: "offline" })).toBe("Mitra tidak terhubung");
    expect(partnerOrdersNeedingAttention([{ status: "rejected", createdAt: now, readyAt: null, needsRefund: true }], now.getTime(), 2, 3)).toBe(1);
  });
});

describe("Partner Hub — status & aktivasi", () => {
  it("alur status mitra tidak bisa dilompati", () => {
    expect(canChangePartnerStatus("draft", "aktif")).toBe(false);
    expect(canChangePartnerStatus("disetujui", "aktif")).toBe(true);
    expect(canChangePartnerStatus("aktif", "dibekukan")).toBe(true);
    expect(canChangePartnerStatus("dibekukan", "aktif")).toBe(true);
  });

  it("syarat aktivasi lengkap", () => {
    const full = { status: "disetujui", hasVerifiedBank: true, hasActiveAccount: true, phone: "0812", activeProductCount: 1, termsAccepted: true };
    expect(partnerActivationBlockers(full)).toEqual([]);
    expect(partnerActivationBlockers({ ...full, hasVerifiedBank: false, activeProductCount: 0 })).toHaveLength(2);
  });

  it("tiket: terima → proses → siap; tolak hanya sebelum diproses", () => {
    expect(partnerTicketNextStatus("queue", "accept")).toBe("accepted");
    expect(partnerTicketNextStatus("queue", "start")).toBeNull();
    expect(partnerTicketNextStatus("accepted", "start")).toBe("cooking");
    expect(partnerTicketNextStatus("cooking", "ready")).toBe("ready");
    expect(partnerTicketNextStatus("ready", "accept")).toBeNull();
    expect(partnerTicketNextStatus("cooking", "reject")).toBeNull();
    expect(partnerTicketNextStatus("queue", "reject")).toBe("rejected");
  });
});

describe("Partner Hub — rumus keuangan (PRD 12.1)", () => {
  it("contoh PRD 12.2: 2 Es Krim Pokat + 3 Dimsum Ayam", () => {
    const iceCream = partnerLineFinance({ qty: 2, unitPrice: 22_000, unitCost: 19_000, fulfilledQty: 2, cancelledQty: 0, status: "delivered" });
    const dimsum = partnerLineFinance({ qty: 3, unitPrice: 25_000, unitCost: 22_000, fulfilledQty: 3, cancelledQty: 0, status: "ready" });
    expect(iceCream).toMatchObject({ gross: 44_000, cost: 38_000, profit: 6_000, liability: 38_000 });
    expect(dimsum).toMatchObject({ gross: 75_000, cost: 66_000, profit: 9_000, liability: 66_000 });
    expect(iceCream.gross + dimsum.gross).toBe(119_000);
    expect(iceCream.profit + dimsum.profit).toBe(15_000);
  });

  it("belum siap = belum wajib bayar; dibatalkan = tidak ada penjualan; void setelah siap = kewajiban tetap", () => {
    expect(partnerLineFinance({ qty: 2, unitPrice: 22_000, unitCost: 19_000, fulfilledQty: 0, cancelledQty: 0, status: "processing" })).toMatchObject({ gross: 44_000, cost: 38_000, profit: 6_000, liability: 0 });
    expect(partnerLineFinance({ qty: 2, unitPrice: 22_000, unitCost: 19_000, fulfilledQty: 0, cancelledQty: 2, status: "cancelled" })).toMatchObject({ gross: 0, liability: 0 });
    expect(partnerLineFinance({ qty: 1, unitPrice: 22_000, unitCost: 19_000, fulfilledQty: 1, cancelledQty: 0, status: "delivered", salesVoided: true })).toMatchObject({ gross: 0, liability: 19_000 });
  });

  it("ringkasan: penyesuaian disetujui saja, sisa = kewajiban − bayar", () => {
    const totals = partnerSettlementTotals(
      [{ qty: 2, unitPrice: 22_000, unitCost: 19_000, fulfilledQty: 2, cancelledQty: 0, status: "delivered" }],
      [
        { salesDelta: -22_000, liabilityDelta: 0, status: "approved" },
        { salesDelta: 0, liabilityDelta: -5_000, status: "pending" },
      ],
      20_000,
    );
    expect(totals).toMatchObject({ grossSales: 44_000, netSales: 22_000, liabilityTotal: 38_000, garageProfit: -16_000, outstanding: 18_000 });
  });

  it("pembayaran tidak boleh melebihi sisa; status lunas/parsial", () => {
    expect(payoutBlockReason({ status: "draft", liabilityTotal: 38_000, verifiedPaid: 0, recordedPending: 0, amount: 1 })).toMatch(/disetujui/);
    expect(payoutBlockReason({ status: "approved", liabilityTotal: 38_000, verifiedPaid: 20_000, recordedPending: 10_000, amount: 9_000 })).toMatch(/melebihi/);
    expect(payoutBlockReason({ status: "partially_paid", liabilityTotal: 38_000, verifiedPaid: 20_000, recordedPending: 0, amount: 18_000 })).toBeNull();
    expect(settlementStatusAfterPayment(38_000, 20_000)).toBe("partially_paid");
    expect(settlementStatusAfterPayment(38_000, 38_000)).toBe("paid");
  });

  it("WA ke mitra tanpa HPP & tanpa nomor pelanggan; rekening disamarkan", () => {
    const text = partnerTicketWhatsappText({ partnerName: "Es Krim Pokat Au", orderNo: "GRG-4827", tableLabel: "Meja 12", items: [{ name: "Es Krim Pokat", qty: 2, note: "tanpa es" }] });
    expect(text).toContain("Meja 12");
    expect(text).toContain("Es Krim Pokat x2 (tanpa es)");
    expect(text).not.toMatch(/HPP|19\.000/);
    expect(maskAccountNumber("1234560148")).toBe("•••• 0148");
  });
});
