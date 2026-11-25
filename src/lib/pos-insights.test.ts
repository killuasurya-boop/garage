import { describe, expect, it } from "vitest";

import { rankBestsellers, rankPairings } from "@/lib/pos-insights";

describe("rankBestsellers", () => {
  it("buang di bawah ambang & tanpa id, urut qty lalu jumlah order, batasi", () => {
    const rows = [
      { menuItemId: "a", qty: 3, orders: 3 },
      { menuItemId: "b", qty: 9, orders: 2 },
      { menuItemId: null, qty: 50, orders: 9 },
      { menuItemId: "c", qty: 2, orders: 2 },
      { menuItemId: "d", qty: 9, orders: 5 },
    ];
    expect(rankBestsellers(rows, { limit: 2 }).map((row) => row.menuItemId)).toEqual(["d", "b"]);
    expect(rankBestsellers(rows).map((row) => row.menuItemId)).toEqual(["d", "b", "a"]);
  });

  it("data kosong → kosong (POS pakai tag manual)", () => {
    expect(rankBestsellers([])).toEqual([]);
  });
});

describe("rankPairings", () => {
  it("abaikan jangkar & di bawah ambang, gabung nama ganda pakai hitungan terbesar", () => {
    const rows = [
      { menuItemId: "x", itemName: "Croissant", pairCount: 4 },
      { menuItemId: "x", itemName: "Croissant (lama)", pairCount: 2 },
      { menuItemId: "anchor", itemName: "Kopi", pairCount: 9 },
      { menuItemId: "y", itemName: "Roti", pairCount: 2 },
      { menuItemId: "z", itemName: "Air", pairCount: 7 },
    ];
    expect(rankPairings(rows, "anchor")).toEqual([
      { menuItemId: "z", itemName: "Air", pairCount: 7 },
      { menuItemId: "x", itemName: "Croissant", pairCount: 4 },
    ]);
  });
});
