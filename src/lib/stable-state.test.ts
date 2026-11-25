import { describe, expect, it } from "vitest";

import { keepIfEqual } from "@/lib/stable-state";

// Fase 3 (U3): polling POS dengan data sama tidak boleh memicu render ulang.
describe("keepIfEqual", () => {
  it("isi sama → referensi lama (React melewati render)", () => {
    const previous = [{ id: "a", total: 10 }];
    expect(keepIfEqual(previous, [{ id: "a", total: 10 }])).toBe(previous);
  });

  it("isi berubah → data baru", () => {
    const previous = [{ id: "a", total: 10 }];
    const next = [{ id: "a", total: 12 }];
    expect(keepIfEqual(previous, next)).toBe(next);
    expect(keepIfEqual(null as unknown, next)).toBe(next);
  });
});
