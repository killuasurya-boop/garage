import { describe, expect, it } from "vitest";

import { isPartnerPickupOrder, partnerDeskPlan, partnerDeskSteps, partnerShiftCoverage, partnerShiftPayoutNote, partnerShiftSales, type PartnerShiftLine } from "@/lib/partner-cashier-rules";
import {
  clockLabel,
  isWithinPartnerServiceHours,
  partnerCardLabel,
  partnerOrderBlockReason,
  partnerServiceClosedSince,
  partnerServiceHoursActive,
  partnerServiceHoursText,
} from "@/lib/partner-hub-rules";

const cashier = { userId: "u-kasir", canHandleMoney: true, isManager: false };
const waiter = { userId: "u-waiter", canHandleMoney: false, isManager: false };
const owner = { userId: "u-owner", canHandleMoney: true, isManager: true };

describe("isPartnerPickupOrder", () => {
  it("take away / delivery / label tanpa meja = diserahkan", () => {
    expect(isPartnerPickupOrder({ tableLabel: "Take away", fulfillment: null })).toBe(true);
    expect(isPartnerPickupOrder({ tableLabel: "Meja 06", fulfillment: "takeaway" })).toBe(true);
    expect(isPartnerPickupOrder({ tableLabel: null, fulfillment: "delivery" })).toBe(true);
    expect(isPartnerPickupOrder({ tableLabel: null })).toBe(true);
  });
  it("meja = diantar", () => {
    expect(isPartnerPickupOrder({ tableLabel: "Meja 06", fulfillment: null })).toBe(false);
    expect(isPartnerPickupOrder({ tableLabel: "Take away", fulfillment: "dine-in" })).toBe(false);
  });
});

describe("partnerDeskPlan", () => {
  const base = { tableLabel: "Take away", fulfillment: "takeaway", claimedByName: null, claimedById: null, paymentLabel: "Lunas" };

  it("menunggu mitra: tanpa tombol utama, terima/tolak a.n. mitra sebagai cadangan", () => {
    const plan = partnerDeskPlan({ ...base, status: "queue" }, cashier);
    expect(plan.primary).toBeNull();
    expect(plan.secondary.map((a) => a.kind)).toEqual(["accept", "reject"]);
    expect(plan.secondary.every((a) => a.onBehalf)).toBe(true);
  });

  it("diterima → mulai proses; diproses → tandai siap", () => {
    expect(partnerDeskPlan({ ...base, status: "accepted" }, cashier).primary?.kind).toBe("start");
    expect(partnerDeskPlan({ ...base, status: "cooking" }, cashier).primary?.kind).toBe("ready");
  });

  it("siap + take away: kasir menyerahkan ke pelanggan satu ketukan", () => {
    const plan = partnerDeskPlan({ ...base, status: "ready" }, cashier);
    expect(plan.primary).toMatchObject({ kind: "handover", label: "Serahkan ke pelanggan" });
  });

  it("siap + take away: waiter klaim lalu sudah diserahkan (bukan pemegang uang)", () => {
    expect(partnerDeskPlan({ ...base, status: "ready" }, waiter).primary?.kind).toBe("claim");
    expect(partnerDeskPlan({ ...base, status: "ready", claimedByName: "Wati", claimedById: "u-waiter" }, waiter).primary).toMatchObject({ kind: "deliver", label: "Sudah diserahkan" });
  });

  it("siap + meja: klaim & antar, lalu sudah diantar", () => {
    const table = { ...base, tableLabel: "Meja 06", fulfillment: "dine-in" };
    expect(partnerDeskPlan({ ...table, status: "ready" }, cashier).primary?.kind).toBe("claim");
    expect(partnerDeskPlan({ ...table, status: "ready", claimedByName: "Kasir", claimedById: "u-kasir" }, cashier).primary).toMatchObject({ kind: "deliver", label: "Sudah diantar" });
  });

  it("diklaim orang lain: tanpa tombol untuk staf biasa, Owner/Manajer tetap bisa menyelesaikan", () => {
    const claimed = { ...base, status: "ready", claimedByName: "Budi", claimedById: "u-budi" };
    const plan = partnerDeskPlan(claimed, cashier);
    expect(plan.primary).toBeNull();
    expect(plan.hint).toContain("Budi");
    expect(partnerDeskPlan(claimed, owner).primary?.kind).toBe("handover");
  });

  it("ditolak mitra & item masih di bill: refund (lunas) / keluarkan dari bill (belum bayar), hanya pemegang uang", () => {
    expect(partnerDeskPlan({ ...base, status: "rejected", needsRefund: true }, cashier).primary?.kind).toBe("refund");
    expect(partnerDeskPlan({ ...base, status: "rejected", needsRefund: true, paymentLabel: "Pending" }, cashier).primary?.kind).toBe("cancel_item");
    const forWaiter = partnerDeskPlan({ ...base, status: "rejected", needsRefund: true }, waiter);
    expect(forWaiter.primary).toBeNull();
    expect(forWaiter.hint).toContain("kasir");
  });
});

describe("partnerDeskSteps", () => {
  it("4 langkah dengan langkah terakhir sesuai jenis pesanan", () => {
    expect(partnerDeskSteps({ status: "queue", tableLabel: "Take away" }).map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(partnerDeskSteps({ status: "cooking", tableLabel: "Meja 03" }).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    const ready = partnerDeskSteps({ status: "ready", tableLabel: "Take away" });
    expect(ready.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(ready[3].label).toBe("Diserahkan");
    expect(partnerDeskSteps({ status: "ready", tableLabel: "Meja 03" })[3].label).toBe("Diantar");
    expect(partnerDeskSteps({ status: "delivered", tableLabel: "Take away" }).every((s) => s.state === "done")).toBe(true);
  });
});

const line = (over: Partial<PartnerShiftLine> = {}): PartnerShiftLine => ({
  id: over.id ?? "l1",
  partnerId: "p1",
  partnerName: "Mitra Dimsum",
  itemName: "Dimsum Ayam",
  variantLabel: "Regular",
  orderNo: "ORD-1",
  orderPayment: "paid",
  createdAt: "2026-11-16T11:00:00Z",
  qty: 2,
  unitPrice: 25_000,
  unitCost: 22_000,
  status: "ready",
  cancelledQty: 0,
  fulfilledQty: 2,
  ...over,
});

describe("partnerShiftSales", () => {
  it("per mitra & produk: penjualan, modal mitra (wajib bayar), profit Garage", () => {
    const result = partnerShiftSales([line(), line({ id: "l2", orderNo: "ORD-2", qty: 1, fulfilledQty: 1, status: "delivered" })]);
    expect(result.partners).toHaveLength(1);
    const p = result.partners[0];
    expect(p).toMatchObject({ partnerName: "Mitra Dimsum", orderCount: 2, qty: 3, sales: 75_000, partnerCost: 66_000, payable: 66_000, garageProfit: 9_000 });
    expect(p.products).toEqual([{ itemName: "Dimsum Ayam", variantLabel: "Regular", qty: 3, unitPrice: 25_000, sales: 75_000, partnerCost: 66_000, garageProfit: 9_000 }]);
    expect(result.totals).toMatchObject({ qty: 3, sales: 75_000, payable: 66_000, garageProfit: 9_000 });
  });

  it("belum siap = belum dihitung; ditolak/batal = Rp0 ke mitra", () => {
    const result = partnerShiftSales([
      line(),
      line({ id: "l2", status: "processing", fulfilledQty: 0 }),
      line({ id: "l3", status: "rejected", cancelledQty: 2, fulfilledQty: 0 }),
    ]);
    const p = result.partners[0];
    expect(p.qty).toBe(2);
    expect(p.payable).toBe(44_000);
    expect(p.pending).toEqual({ qty: 2, sales: 50_000, partnerCost: 44_000 });
    expect(p.cancelled).toEqual({ qty: 2, sales: 50_000 });
    expect(result.totals).toMatchObject({ pendingQty: 2, cancelledQty: 2 });
  });

  it("void setelah siap: penjualan 0, modal mitra tetap dibayar (DEC-04)", () => {
    const p = partnerShiftSales([line({ salesVoided: true, orderPayment: "cancelled" })]).partners[0];
    expect(p).toMatchObject({ sales: 0, partnerCost: 44_000, payable: 44_000, garageProfit: -44_000 });
  });

  it("refund pelanggan mengurangi profit, tidak mengurangi wajib bayar", () => {
    const result = partnerShiftSales([line()], [{ orderLineId: "l1", partnerId: "p1", kind: "refund", salesDelta: -25_000, liabilityDelta: 0, status: "approved" }]);
    expect(result.partners[0]).toMatchObject({ refunds: 25_000, payable: 44_000, garageProfit: -19_000 });
  });

  it("refund item yang belum siap tidak mengurangi profit (penjualannya belum diakui); refund dibatasi penjualan baris", () => {
    const result = partnerShiftSales(
      [line(), line({ id: "l2", status: "queue", fulfilledQty: 0, qty: 1 })],
      [
        { orderLineId: "l2", partnerId: "p1", kind: "refund", salesDelta: -25_000, liabilityDelta: 0, status: "approved" },
        { orderLineId: "l1", partnerId: "p1", kind: "refund", salesDelta: -75_000, liabilityDelta: 0, status: "approved" },
      ],
    );
    // l1 hanya punya penjualan diakui 50.000 → refund dihitung 50.000; l2 belum siap → 0.
    expect(result.partners[0]).toMatchObject({ sales: 50_000, refunds: 50_000, payable: 44_000, garageProfit: -44_000 });
  });

  it("bill belum dibayar pelanggan tetap wajib bayar ke mitra (ditandai terpisah)", () => {
    const p = partnerShiftSales([line({ orderPayment: "pending" })]).partners[0];
    expect(p.payable).toBe(44_000);
    expect(p.unpaidBill).toEqual({ qty: 2, sales: 50_000 });
  });

  it("dua mitra & harga berbeda tetap terpisah; total = Σ mitra", () => {
    const result = partnerShiftSales([
      line(),
      line({ id: "l2", partnerId: "p2", partnerName: "Es Krim Pokat Au", itemName: "Es Krim Alpukat", unitPrice: 18_000, unitCost: 12_000, qty: 1, fulfilledQty: 1 }),
      line({ id: "l3", unitPrice: 27_000, qty: 1, fulfilledQty: 1 }),
    ]);
    expect(result.partners.map((p) => p.partnerName)).toEqual(["Mitra Dimsum", "Es Krim Pokat Au"]);
    expect(result.partners[0].products).toHaveLength(2);
    const sum = result.partners.reduce((acc, p) => acc + p.payable, 0);
    expect(result.totals.payable).toBe(sum);
    expect(result.totals.sales).toBe(50_000 + 27_000 + 18_000);
  });

  it("kosong → tanpa mitra", () => {
    expect(partnerShiftSales([])).toEqual({ partners: [], totals: expect.objectContaining({ sales: 0, payable: 0 }) });
  });

  it("catatan setoran menyebut tanggal rekap & batas H+1 12.00", () => {
    const note = partnerShiftPayoutNote("2026-11-16T10:00:00Z");
    expect(note).toContain("16 November 2026");
    expect(note).toContain("17 November 2026 pukul 12.00");
  });
});

describe("partnerShiftCoverage (cek silang laporan shift ↔ setoran harian)", () => {
  const cov = (over: Partial<PartnerShiftLine> & { orderId: string }) => ({ ...line(over), orderId: over.orderId });
  it("baris wajib bayar di order shift = tercatat; di luar shift = muncul dengan sebab netral; belum siap diabaikan", () => {
    const result = partnerShiftCoverage(
      [
        cov({ id: "a", orderId: "o-shift" }),
        cov({ id: "b", orderId: "o-owner", orderNo: "ORD-OWN", orderPayment: "paid", qty: 1, fulfilledQty: 1 }),
        cov({ id: "c", orderId: "o-unpaid", orderNo: "ORD-UNP", orderPayment: "pending", qty: 1, fulfilledQty: 1 }),
        cov({ id: "d", orderId: "o-void", orderNo: "ORD-VOID", orderPayment: "cancelled", qty: 1, fulfilledQty: 1, salesVoided: true }),
        cov({ id: "e", orderId: "o-wait", status: "queue", fulfilledQty: 0 }),
      ],
      new Set(["o-shift"]),
    );
    expect(result).toMatchObject({ totalPayable: 44_000 + 22_000 * 3, coveredPayable: 44_000, uncoveredPayable: 66_000 });
    expect(result.missing.map((m) => m.orderNo)).toEqual(["ORD-OWN", "ORD-UNP", "ORD-VOID"]);
    expect(result.missing[0].reason).toMatch(/luar shift kasir/);
    expect(result.missing[1].reason).toMatch(/belum dibayar/);
    expect(result.missing[2].reason).toMatch(/dibatalkan setelah mitra menyiapkan/);
  });

  it("penyesuaian kewajiban disetujui ikut dihitung: di order shift = tercatat, tanpa pesanan = selisih", () => {
    const result = partnerShiftCoverage([cov({ id: "a", orderId: "o1" })], new Set(["o1"]), [
      { partnerName: "Mitra Dimsum", orderId: "o1", orderNo: "ORD-1", liabilityDelta: -2_000, kind: "correction" },
      { partnerName: "Mitra Dimsum", orderId: null, orderNo: null, liabilityDelta: 5_000, kind: "dispute" },
    ]);
    expect(result).toMatchObject({ totalPayable: 44_000 - 2_000 + 5_000, coveredPayable: 42_000, uncoveredPayable: 5_000 });
    expect(result.missing).toEqual([expect.objectContaining({ payable: 5_000, reason: expect.stringMatching(/tanpa pesanan/) })]);
  });

  it("semua tercatat → selisih 0", () => {
    expect(partnerShiftCoverage([cov({ id: "a", orderId: "o1" })], new Set(["o1"]))).toMatchObject({ uncoveredPayable: 0, missing: [] });
  });
});

// Jam layanan produk mitra (Owner 16 Nov 2026): 17.00–22.30 WIB. WIB = UTC+7.// Jam layanan produk mitra (Owner 16 Nov 2026): 17.00–22.30 WIB. WIB = UTC+7.
const wib = (hhmm: string, day = "2026-11-16") => new Date(`${day}T${hhmm}:00+07:00`);
const HOURS = { open: "17:00", close: "22:30" };

describe("jam layanan mitra", () => {
  it("batas jam: 16.59 tutup, 17.00 buka, 22.29 buka, 22.30 tutup", () => {
    expect(isWithinPartnerServiceHours(HOURS, wib("16:59"))).toBe(false);
    expect(isWithinPartnerServiceHours(HOURS, wib("17:00"))).toBe(true);
    expect(isWithinPartnerServiceHours(HOURS, wib("22:29"))).toBe(true);
    expect(isWithinPartnerServiceHours(HOURS, wib("22:30"))).toBe(false);
    expect(isWithinPartnerServiceHours(HOURS, wib("02:00"))).toBe(false);
  });

  it("jendela lewat tengah malam & setelan kosong", () => {
    const night = { open: "18:00", close: "02:00" };
    expect(isWithinPartnerServiceHours(night, wib("23:30"))).toBe(true);
    expect(isWithinPartnerServiceHours(night, wib("01:59"))).toBe(true);
    expect(isWithinPartnerServiceHours(night, wib("02:00"))).toBe(false);
    expect(partnerServiceHoursActive({ open: "", close: "" })).toBe(false);
    expect(isWithinPartnerServiceHours({ open: "", close: "22:30" }, wib("23:00"))).toBe(true);
    expect(isWithinPartnerServiceHours(null, wib("23:00"))).toBe(true);
  });

  it("teks jam & label kartu", () => {
    expect(partnerServiceHoursText(HOURS)).toBe("17.00–22.30");
    expect(clockLabel("17:00")).toBe("17.00");
    const input = { hubEnabled: true, partnerStatus: "aktif", operationalStatus: "buka", linkActive: true, productStock: "ready", serviceHours: HOURS };
    expect(partnerOrderBlockReason({ ...input, at: wib("20:00") })).toBeNull();
    expect(partnerOrderBlockReason({ ...input, at: wib("22:31") })).toContain("Di luar jam layanan mitra (17.00–22.30)");
    expect(partnerCardLabel({ ...input, at: wib("23:00") })).toBe("Tutup · buka 17.00");
    // Habis tetap menang (alasan paling jelas untuk kasir).
    expect(partnerCardLabel({ ...input, productStock: "sold_out", at: wib("23:00") })).toBe("Habis");
  });

  it("waktu tutup terakhir untuk sweeper (hari ini / kemarin lewat tengah malam)", () => {
    expect(partnerServiceClosedSince(HOURS, wib("20:00"))).toBeNull();
    expect(partnerServiceClosedSince(HOURS, wib("23:10"))?.toISOString()).toBe(wib("22:30").toISOString());
    expect(partnerServiceClosedSince(HOURS, wib("08:00", "2026-11-17"))?.toISOString()).toBe(wib("22:30").toISOString());
  });
});
