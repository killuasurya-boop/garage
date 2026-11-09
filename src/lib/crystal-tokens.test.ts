import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CRYSTAL_TOKENS, crystalTierSkin } from "@/lib/crystal-tokens";
import { contrastRatio, WCAG_AA } from "@/lib/design-tokens";

const backgrounds = CRYSTAL_TOKENS.filter((t) => t.group === "background");
const TEXT_TOKENS = ["text.primary", "text.cream", "text.secondary", "accent.laser-bright", "status.available", "status.reserved-text", "status.warning"];

describe("Crystal V5 — kontras AA", () => {
  it("token teks & teks status ≥ 4.5:1 di setiap latar crystal", () => {
    for (const fg of CRYSTAL_TOKENS.filter((t) => TEXT_TOKENS.includes(t.name))) {
      for (const bg of backgrounds) {
        expect(contrastRatio(fg.hex, bg.hex), `${fg.name} di ${bg.name}`).toBeGreaterThanOrEqual(WCAG_AA.text);
      }
    }
  });

  it("tombol merah utama: teks putih ≥ 4.5:1", () => {
    expect(contrastRatio("#ffffff", "#e1252b")).toBeGreaterThanOrEqual(WCAG_AA.text);
  });

  it("setiap token didefinisikan di crystal.css dengan nilai yang sama", () => {
    const css = readFileSync(path.join(process.cwd(), "src/components/crystal/crystal.css"), "utf8").toLowerCase();
    for (const t of CRYSTAL_TOKENS) {
      expect(css, t.cssVar).toContain(`${t.cssVar}: ${t.hex}`);
    }
  });

  it("skin tier member dari data nyata", () => {
    expect(crystalTierSkin("Silver")).toBe("silver");
    expect(crystalTierSkin("GOLD")).toBe("gold");
    expect(crystalTierSkin("Platinum")).toBe("platinum");
    expect(crystalTierSkin("Ultra")).toBe("ultra");
    expect(crystalTierSkin(null)).toBe("silver");
  });
});
