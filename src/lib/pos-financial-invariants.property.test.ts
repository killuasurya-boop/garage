// GOD++ Fase 5 — invarian keuangan POS diuji dengan ribuan kombinasi nominal acak (fast-check).
// Menguji fungsi yang SAMA dengan yang dipakai server (tender-guard, garage-billing) — tidak ada
// rumus kedua. Rupiah = bilangan bulat.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@/lib/garage-app-settings-types";
import { applyRoundingMode, calculateBillingTotals, capVoucherDiscountBySettings, computeManualDiscountAmount, computeRefundSplit } from "@/lib/garage-billing";
import { finalPayLabel } from "@/lib/pos-final-pay-label";
import { quickCashOptions } from "@/lib/pos-cash";
import { planTender, TenderGuardError } from "@/lib/tender-guard";

const rupiah = fc.integer({ min: 1, max: 50_000_000 });
const runs = { numRuns: 2_000 };

describe("Invarian tunai (tender guard)", () => {
  it("uang ≥ total → kembalian = uang − total ≥ 0, laci menerima tepat total", () => {
    fc.assert(
      fc.property(rupiah, fc.integer({ min: 0, max: 10_000_000 }), (total, extra) => {
        const plan = planTender({ method: "Cash", total, cashReceived: total + extra });
        expect(plan.change).toBe(extra);
        expect(plan.cashPortion).toBe(total);
        expect(plan.cashShortfall).toBe(0);
      }),
      runs,
    );
  });

  it("uang < total selalu ditolak (bukan offline)", () => {
    fc.assert(
      fc.property(rupiah, (total) => {
        fc.pre(total > 1);
        const short = fc.sample(fc.integer({ min: 0, max: total - 1 }), 1)[0];
        expect(() => planTender({ method: "Cash", total, cashReceived: short })).toThrow(TenderGuardError);
      }),
      runs,
    );
  });

  it("tunai tanpa uang diterima ditolak", () => {
    fc.assert(fc.property(rupiah, (total) => {
      expect(() => planTender({ method: "Cash", total, cashReceived: null })).toThrow(/uang diterima/i);
    }), runs);
  });
});

describe("Invarian non-tunai: tidak masuk laci", () => {
  it("QRIS/Transfer/E-Wallet → cashPortion 0, tanpa kembalian", () => {
    fc.assert(
      fc.property(rupiah, fc.constantFrom("QRIS", "Bank Transfer", "E-Wallet"), (total, method) => {
        const plan = planTender({ method, total, reference: "RRN123456" });
        expect(plan.cashPortion).toBe(0);
        expect(plan.change).toBe(0);
      }),
      runs,
    );
  });
});

describe("Invarian split", () => {
  it("jumlah bagian = total → diterima; bagian tunai = jumlah split tunai ≤ total", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ amount: fc.integer({ min: 1, max: 5_000_000 }), cash: fc.boolean() }), { minLength: 2, maxLength: 5 }), (parts) => {
        const total = parts.reduce((s, p) => s + p.amount, 0);
        const splits = parts.map((p, i) => ({ method: p.cash ? "Cash" : "QRIS", amount: p.amount, reference: p.cash ? null : `RRN${100000 + i}` }));
        const plan = planTender({ method: "Cash", total, splits });
        const cash = parts.filter((p) => p.cash).reduce((s, p) => s + p.amount, 0);
        expect(plan.cashPortion).toBe(cash);
        expect(plan.cashPortion).toBeLessThanOrEqual(total);
      }),
      runs,
    );
  });

  it("jumlah bagian ≠ total → ditolak", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 2, maxLength: 5 }), fc.integer({ min: -100_000, max: 100_000 }), (amounts, delta) => {
        fc.pre(delta !== 0);
        const sum = amounts.reduce((s, a) => s + a, 0);
        fc.pre(sum + delta > 0);
        expect(() => planTender({ method: "Cash", total: sum + delta, splits: amounts.map((amount) => ({ method: "Cash", amount })) })).toThrow(/split/i);
      }),
      runs,
    );
  });

  it("referensi sama dua kali dalam satu order ditolak", () => {
    expect(() =>
      planTender({ method: "QRIS", total: 20_000, splits: [{ method: "QRIS", amount: 10_000, reference: "RRN-777777" }, { method: "Transfer", amount: 10_000, reference: "rrn 777777" }] }),
    ).toThrow(/dua kali/);
  });
});

describe("Invarian tagihan (service, pajak, pembulatan, diskon)", () => {
  const settingsArb = fc.record({
    serviceChargePct: fc.integer({ min: 0, max: 15 }),
    taxPct: fc.integer({ min: 0, max: 12 }),
    roundingMode: fc.constantFrom("none", "nearest_100", "nearest_500", "nearest_1000"),
  });

  it("total bulat, tidak negatif, selisih pembulatan ≤ setengah langkah", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50_000_000 }), settingsArb, (subtotal, part) => {
        const settings = { ...DEFAULT_APP_SETTINGS, ...part };
        const { service, tax, grossTotal } = calculateBillingTotals(subtotal, settings);
        expect(Number.isInteger(grossTotal)).toBe(true);
        expect(grossTotal).toBeGreaterThanOrEqual(0);
        expect(service).toBeGreaterThanOrEqual(0);
        expect(tax).toBeGreaterThanOrEqual(0);
        const step = { none: 0, nearest_100: 100, nearest_500: 500, nearest_1000: 1000 }[part.roundingMode];
        expect(Math.abs(grossTotal - (subtotal + service + tax))).toBeLessThanOrEqual(step / 2);
      }),
      runs,
    );
  });

  it("pembulatan idempoten (dibulatkan dua kali = sekali)", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 50_000_000 }), fc.constantFrom("none", "nearest_100", "nearest_500", "nearest_1000"), (n, mode) => {
      expect(applyRoundingMode(applyRoundingMode(n, mode), mode)).toBe(applyRoundingMode(n, mode));
    }), runs);
  });

  it("diskon manual & voucher tidak pernah melebihi dasar / batas", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: 100 }), (base, pct) => {
        const amount = Math.min(base, Math.round((base * pct) / 100));
        const value = computeManualDiscountAmount({ type: "percent", rawValue: pct, amount, reason: "uji" } as never, base);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(base);
        const voucher = capVoucherDiscountBySettings(base * 2, base, DEFAULT_APP_SETTINGS);
        expect(voucher).toBeLessThanOrEqual(Math.round(base * (DEFAULT_APP_SETTINGS.voucherMaxDiscountPct / 100)));
        expect(voucher).toBeGreaterThanOrEqual(0);
      }),
      runs,
    );
  });
});

describe("Invarian refund sebagian", () => {
  it("refund + total baru = total lama; total baru tidak negatif", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000_000 }), fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 100 }), (subtotal, pct, refundPct) => {
        const service = Math.round(subtotal * pct / 100);
        const total = subtotal + service;
        const refundSubtotal = Math.max(1, Math.round((subtotal * refundPct) / 100));
        fc.pre(refundSubtotal <= subtotal);
        const result = computeRefundSplit({ subtotal, service, tax: 0, discount: 0, total }, refundSubtotal);
        expect(result.refundAmount + result.next.total).toBe(total);
        expect(result.next.total).toBeGreaterThanOrEqual(0);
        expect(result.refundAmount).toBeGreaterThanOrEqual(0);
      }),
      runs,
    );
  });
});

describe("Nominal cepat & label tombol final", () => {
  it("nominal cepat selalu ≥ total, unik, urut, ≤ batas", () => {
    fc.assert(fc.property(rupiah, fc.integer({ min: 1, max: 8 }), (total, limit) => {
      const options = quickCashOptions(total, limit);
      expect(options.length).toBeLessThanOrEqual(limit);
      expect(new Set(options).size).toBe(options.length);
      options.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(total);
        if (i) expect(v).toBeGreaterThan(options[i - 1]);
      });
    }), runs);
  });

  it("tombol tunai tidak pernah berkata 'Terima' bila uang kosong atau kurang", () => {
    fc.assert(fc.property(rupiah, fc.integer({ min: 0, max: 60_000_000 }), fc.boolean(), (total, received, empty) => {
      const label = finalPayLabel({ method: "Cash", cashReceived: empty ? "" : String(received), cashReceivedValue: empty ? 0 : received, totalDue: total, qrisReferenceMissing: false });
      if (empty || received < total) expect(label).not.toMatch(/^Terima/);
      else expect(label).toMatch(/^Terima/);
    }), runs);
  });

  it("tombol non-tunai selalu menyebut metodenya (QRIS tidak tampil sebagai Tunai)", () => {
    fc.assert(fc.property(rupiah, fc.constantFrom("QRIS", "Bank Transfer", "E-Wallet" as const), (total, method) => {
      const label = finalPayLabel({ method, cashReceived: "", cashReceivedValue: 0, totalDue: total, qrisReferenceMissing: false });
      expect(label).toMatch(method === "QRIS" ? /QRIS/ : method === "Bank Transfer" ? /Transfer/ : /E-Wallet/);
      expect(label).not.toMatch(/Terima|Tunai/);
    }), runs);
  });
});
