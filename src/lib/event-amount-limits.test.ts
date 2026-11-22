import { describe, expect, it } from "vitest";

import { budgetLineSchema, expensePaymentSchema } from "@/lib/event-finance-service";
import { sponsorInputSchema } from "@/lib/event-sponsor-service";

// Kolom nominal event = integer PostgreSQL (maks. 2.147.483.647). Batas validasi Rp2 miliar supaya nilai besar ditolak
// sebagai pesan form, bukan error database (Owner 22 Nov 2026).
describe("batas nominal event sesuai kolom database", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("pos anggaran & pembayaran: 2 miliar boleh, 2,5 miliar ditolak dengan pesan", () => {
    expect(budgetLineSchema.safeParse({ eventId: id, category: "sound", title: "Sound", plannedAmount: 2_000_000_000 }).success).toBe(true);
    const big = budgetLineSchema.safeParse({ eventId: id, category: "sound", title: "Sound", plannedAmount: 2_500_000_000 });
    expect(big.success).toBe(false);
    expect(big.error?.issues[0]?.message).toContain("Rp2.000.000.000");
    expect(expensePaymentSchema.safeParse({ budgetLineId: id, amount: 2_500_000_000, paidAt: "2026-11-01", source: "external", payee: "X", idempotencyKey: "k-1" }).success).toBe(false);
  });
  it("nilai kesepakatan sponsor: 2,5 miliar ditolak", () => {
    expect(sponsorInputSchema.shape.agreedAmount.safeParse(2_500_000_000).success).toBe(false);
    expect(sponsorInputSchema.shape.agreedAmount.safeParse(2_000_000_000).success).toBe(true);
  });
});
