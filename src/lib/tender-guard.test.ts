import { describe, expect, it } from "vitest";

import {
  cashConfirmLabel,
  normalizePaymentReference,
  paymentReferenceKey,
  planTender,
  referenceNeedsUniqueness,
  tenderKindOf,
  TenderGuardError,
} from "@/lib/tender-guard";

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    return error instanceof TenderGuardError ? error.code : String(error);
  }
  return null;
}

describe("tenderKindOf", () => {
  it("mengenali metode kasir & nama lama", () => {
    expect(tenderKindOf("Cash")).toBe("cash");
    expect(tenderKindOf("Tunai")).toBe("cash");
    expect(tenderKindOf("QRIS")).toBe("qris");
    expect(tenderKindOf("Bank Transfer")).toBe("transfer");
    expect(tenderKindOf("E-Wallet")).toBe("ewallet");
    expect(tenderKindOf("Voucher")).toBe("other");
  });
});

describe("referensi pembayaran", () => {
  it("dinormalisasi: trim, spasi tunggal, huruf besar, kosong = null", () => {
    expect(normalizePaymentReference("  rrn  123 abc ")).toBe("RRN 123 ABC");
    expect(normalizePaymentReference("   ")).toBeNull();
    expect(normalizePaymentReference(undefined)).toBeNull();
    expect(normalizePaymentReference("x".repeat(100))).toHaveLength(80);
  });

  it("kunci pembanding hanya huruf & angka", () => {
    expect(paymentReferenceKey("RRN 0012-34")).toBe(paymentReferenceKey("rrn001234"));
  });

  it("hanya referensi non-tunai ≥ 6 karakter yang wajib unik", () => {
    expect(referenceNeedsUniqueness("QRIS", "123456")).toBe(true);
    expect(referenceNeedsUniqueness("QRIS", "1234")).toBe(false);
    expect(referenceNeedsUniqueness("Cash", "123456789")).toBe(false);
    expect(referenceNeedsUniqueness("Bank Transfer", "TRX-998877")).toBe(true);
  });
});

describe("planTender — tunai", () => {
  it("wajib isi uang diterima (AC: CASH tanpa input tidak bisa final)", () => {
    expect(codeOf(() => planTender({ method: "Cash", total: 250_000 }))).toBe("CASH_RECEIVED_REQUIRED");
  });

  it("uang kurang ditolak", () => {
    expect(codeOf(() => planTender({ method: "Cash", total: 50_000, cashReceived: 20_000 }))).toBe("CASH_INSUFFICIENT");
  });

  it("kembalian dihitung, laci menerima total (bukan uang diterima)", () => {
    expect(planTender({ method: "Cash", total: 38_000, cashReceived: 50_000 })).toEqual({
      cashPortion: 38_000,
      cashShortfall: 0,
      change: 12_000,
      uniqueReferences: [],
    });
  });

  it("sinkron offline: kekurangan dicatat, tidak ditolak", () => {
    const plan = planTender({ method: "Cash", total: 50_000, cashReceived: 40_000, offlineSync: true });
    expect(plan.cashShortfall).toBe(10_000);
    expect(planTender({ method: "Cash", total: 50_000, offlineSync: true }).cashShortfall).toBe(0);
  });
});

describe("planTender — QRIS", () => {
  it("QRIS tidak masuk laci", () => {
    expect(planTender({ method: "QRIS", total: 30_000, reference: "RRN778899" })).toEqual({
      cashPortion: 0,
      cashShortfall: 0,
      change: 0,
      uniqueReferences: ["RRN778899"],
    });
  });

  it("referensi wajib bila diaktifkan Owner", () => {
    expect(codeOf(() => planTender({ method: "QRIS", total: 30_000, qrisReferenceRequired: true }))).toBe(
      "QRIS_REFERENCE_REQUIRED",
    );
    expect(codeOf(() => planTender({ method: "QRIS", total: 30_000, reference: "  ", qrisReferenceRequired: true }))).toBe(
      "QRIS_REFERENCE_REQUIRED",
    );
    // Tunai tidak terpengaruh pengaturan QRIS.
    expect(codeOf(() => planTender({ method: "Cash", total: 5_000, cashReceived: 5_000, qrisReferenceRequired: true }))).toBeNull();
  });
});

describe("planTender — split", () => {
  it("harus seimbang; pesan menyebut kurang/lebih", () => {
    expect(() =>
      planTender({ method: "Cash", total: 100_000, splits: [{ method: "Cash", amount: 40_000 }, { method: "QRIS", amount: 50_000 }] }),
    ).toThrow(/kurang/);
    expect(() =>
      planTender({ method: "Cash", total: 100_000, splits: [{ method: "Cash", amount: 60_000 }, { method: "QRIS", amount: 50_000 }] }),
    ).toThrow(/lebih/);
  });

  it("bagian laci = hanya tender tunai", () => {
    const plan = planTender({
      method: "Cash",
      total: 100_000,
      splits: [
        { method: "Cash", amount: 40_000 },
        { method: "QRIS", amount: 60_000, reference: "rrn-123456" },
      ],
    });
    expect(plan.cashPortion).toBe(40_000);
    expect(plan.uniqueReferences).toEqual(["RRN-123456"]);
  });

  it("referensi sama dua kali di satu order ditolak", () => {
    expect(
      codeOf(() =>
        planTender({
          method: "QRIS",
          total: 20_000,
          splits: [
            { method: "QRIS", amount: 10_000, reference: "RRN123456" },
            { method: "QRIS", amount: 10_000, reference: "rrn 123456" },
          ],
        }),
      ),
    ).toBe("REFERENCE_DUPLICATE_IN_ORDER");
  });

  it("minimal 2 tender & nominal positif bulat", () => {
    expect(codeOf(() => planTender({ method: "Cash", total: 10_000, splits: [{ method: "Cash", amount: 10_000 }] }))).toBe("SPLIT_TOO_FEW");
    expect(
      codeOf(() =>
        planTender({ method: "Cash", total: 10_000, splits: [{ method: "Cash", amount: 0 }, { method: "QRIS", amount: 10_000 }] }),
      ),
    ).toBe("SPLIT_INVALID_AMOUNT");
  });
});

describe("cashConfirmLabel", () => {
  it("menyebut uang diterima & kembalian", () => {
    expect(cashConfirmLabel(50_000, 38_000)).toMatch(/Terima Rp\s?50\.000 · kembali Rp\s?12\.000/);
    expect(cashConfirmLabel(38_000, 38_000)).toMatch(/uang pas/);
  });
});
