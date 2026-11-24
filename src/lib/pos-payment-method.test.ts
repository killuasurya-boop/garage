import { describe, expect, it } from "vitest";

import { paymentMethods } from "@/components/garage/garage-app-helpers";
import { CORRECTABLE_PAYMENT_METHODS } from "@/lib/garage-service";
import { isPosPaymentMethod, posPaymentMethodGroup } from "@/lib/pos-payment-method";

describe("metode bayar POS", () => {
  it("semua metode yang ditawarkan UI kasir & koreksi metode diterima", () => {
    for (const method of [...paymentMethods, ...CORRECTABLE_PAYMENT_METHODS]) {
      expect(isPosPaymentMethod(method), method).toBe(true);
    }
  });

  it("ejaan lama tetap masuk kelompok yang benar", () => {
    expect(posPaymentMethodGroup("Tunai")).toBe("cash");
    expect(posPaymentMethodGroup(" cash ")).toBe("cash");
    expect(posPaymentMethodGroup("Transfer")).toBe("transfer");
    expect(posPaymentMethodGroup("Bank Transfer")).toBe("transfer");
    expect(posPaymentMethodGroup("E-wallet")).toBe("ewallet");
    expect(posPaymentMethodGroup("qris")).toBe("qris");
  });

  it("teks bebas yang bisa salah golong di laporan ditolak", () => {
    for (const method of ["Gopay", "Kartu", "Card", "Debit", "cash back", "QRIS BCA", "", "TEST"]) {
      expect(isPosPaymentMethod(method), method).toBe(false);
    }
  });
});
