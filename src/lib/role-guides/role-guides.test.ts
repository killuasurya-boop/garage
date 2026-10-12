import { describe, expect, it } from "vitest";

import { guidesForRole, ROLE_GUIDES } from "@/lib/role-guides";

const ids = (role: string, ws: string | null = null) => guidesForRole(role, ws).map((guide) => guide.id);

describe("panduan per posisi", () => {
  it("tiap akun hanya melihat panduan posisinya", () => {
    expect(ids("Kasir")).toEqual(["kasir"]);
    expect(ids("Kasir", "bar")).toEqual(["barista"]);
    expect(ids("Kasir", "dapur")).toEqual(["dapur"]);
    expect(ids("Kasir", "all")).toEqual(["barista", "dapur"]);
    expect(ids("Kasir", "helper_dapur")).toEqual(["dapur"]);
    expect(ids("Waiter")).toEqual(["waiter"]);
    expect(ids("Waiter", "kurir")).toEqual(["kurir"]);
  });

  it("Manajer melihat semua kecuali panduan Owner; Owner melihat semua", () => {
    expect(ids("Manajer")).not.toContain("owner");
    expect(ids("Manajer")).toContain("manajer-harian");
    expect(ids("Owner")).toHaveLength(ROLE_GUIDES.length);
  });

  it("id panduan unik & tiap bab punya langkah", () => {
    expect(new Set(ROLE_GUIDES.map((g) => g.id)).size).toBe(ROLE_GUIDES.length);
    for (const guide of ROLE_GUIDES) {
      for (const section of guide.sections) expect(section.steps.length).toBeGreaterThan(0);
    }
  });
});
