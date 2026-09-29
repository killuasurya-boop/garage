import { describe, it, expect } from "vitest";

import {
  activeGuests,
  clampAssignment,
  guestEstimate,
  initialAssignment,
  linesForGuest,
  remainingCart,
} from "@/lib/split-bill";

const lines = [
  { itemId: "kopi", variantId: "hot", qty: 3, price: 20_000 },
  { itemId: "nasi", variantId: "reg", qty: 1, price: 30_000, note: "pedas" },
];
const settings = { serviceChargePct: 5, taxPct: 10, roundingMode: "none" };

describe("split bill per produk (keranjang)", () => {
  it("awalnya semua porsi milik Tamu 1", () => {
    expect(initialAssignment(lines)).toEqual([[0, 0, 0], [0]]);
  });

  it("baris per tamu digabung sesuai porsi yang dipilih", () => {
    const assignment = [[0, 1, 1], [1]];
    expect(linesForGuest(lines, assignment, 0)).toEqual([{ ...lines[0], qty: 1 }]);
    expect(linesForGuest(lines, assignment, 1)).toEqual([
      { ...lines[0], qty: 2 },
      { ...lines[1], qty: 1 },
    ]);
  });

  it("service & pajak ikut proporsional; jumlah semua tamu = bill utuh", () => {
    const assignment = [[0, 1, 1], [1]];
    const a = guestEstimate(lines, assignment, 0, settings);
    const b = guestEstimate(lines, assignment, 1, settings);
    expect(a.subtotal).toBe(20_000);
    expect(a.total).toBe(23_100);
    expect(b.subtotal).toBe(70_000);
    expect(a.total + b.total).toBe(Math.round(90_000 * 1.05 * 1.1));
  });

  it("mengurangi jumlah tamu memindahkan porsinya ke Tamu 1", () => {
    expect(clampAssignment([[0, 2, 1], [2]], 2)).toEqual([[0, 0, 1], [0]]);
  });

  it("hanya tamu yang punya porsi yang ditagih", () => {
    expect(activeGuests([[0, 2, 2], [2]], 3)).toEqual([0, 2]);
  });

  it("porsi tamu yang sudah lunas dikeluarkan dari keranjang", () => {
    const rest = remainingCart(lines, [[0, 1, 1], [1]], new Set([1]));
    expect(rest).toEqual([{ ...lines[0], qty: 1 }]);
  });
});
