import { describe, expect, it } from "vitest";

import { buildPointLedger } from "@/lib/member-point-ledger";

const at = (iso: string) => new Date(iso);

describe("buildPointLedger", () => {
  it("menggabungkan dapat/pakai/kembali/kedaluwarsa, urut terbaru, saldo berjalan benar", () => {
    const ledger = buildPointLedger(
      [
        { id: "a", source: "WELCOME", pointsEarned: 50, orderId: null, createdAt: at("2026-10-01T02:00:00Z") },
        { id: "b", source: "POS", pointsEarned: 30, orderId: "o1", createdAt: at("2026-10-02T02:00:00Z") },
        { id: "c", source: "EXPIRE", pointsEarned: -10, orderId: null, createdAt: at("2026-10-05T02:00:00Z") },
        { id: "z", source: "POS", pointsEarned: 0, orderId: null, createdAt: at("2026-10-06T02:00:00Z") },
      ],
      [
        {
          id: "r",
          pointsUsed: 40,
          source: "POS",
          status: "returned",
          returnedPoints: 40,
          returnedAt: at("2026-10-04T02:00:00Z"),
          orderId: "o2",
          createdAt: at("2026-10-03T02:00:00Z"),
        },
      ],
      70,
    );
    expect(ledger.map((e) => [e.kind, e.points, e.balanceAfter])).toEqual([
      ["expire", -10, 70],
      ["return", 40, 80],
      ["redeem", -40, 40],
      ["earn", 30, 80],
      ["earn", 50, 50],
    ]);
    expect(ledger[0].label).toBe("Poin kedaluwarsa");
    expect(ledger[2].label).toBe("Pakai poin di kasir");
  });

  it("membatasi jumlah baris", () => {
    const tx = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      source: "QR",
      pointsEarned: 1,
      orderId: null,
      createdAt: at(`2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
    }));
    expect(buildPointLedger(tx, [], 50, 30)).toHaveLength(30);
  });
});
