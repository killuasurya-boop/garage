import { describe, expect, it } from "vitest";

import { budgetStatus } from "./finance-daily-costs";

describe("budgetStatus (anggaran bahan baku harian)", () => {
  it("membedakan kosong, di bawah, sesuai, dan melebihi anggaran", () => {
    expect(budgetStatus(0, 300_000, 800_000)).toBe("kosong");
    expect(budgetStatus(150_000, 300_000, 800_000)).toBe("di_bawah");
    expect(budgetStatus(300_000, 300_000, 800_000)).toBe("sesuai");
    expect(budgetStatus(800_000, 300_000, 800_000)).toBe("sesuai");
    expect(budgetStatus(800_001, 300_000, 800_000)).toBe("melebihi");
  });
});
