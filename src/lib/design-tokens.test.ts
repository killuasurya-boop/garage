import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatRupiah } from "@/components/ds/money-text";
import { contrastRatio, DESIGN_TOKENS, FORBIDDEN_TERMS, token, WCAG_AA } from "@/lib/design-tokens";

// U1 (PRD §24.2/§24.5, D-02 gelap): token semantik lolos WCAG 2.2 AA di SEMUA latar.

const backgrounds = DESIGN_TOKENS.filter((t) => t.group === "background");

describe("kontras WCAG 2.2 AA", () => {
  it("rumus kontras benar (hitam/putih = 21, sama = 1)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("setiap token teks & status ≥ 4.5:1 di setiap latar", () => {
    for (const fg of DESIGN_TOKENS.filter((t) => t.group === "text" || t.group === "status")) {
      for (const bg of backgrounds) {
        expect(contrastRatio(fg.hex, bg.hex), `${fg.name} di ${bg.name}`).toBeGreaterThanOrEqual(WCAG_AA.text);
      }
    }
  });

  it("batas kontrol & focus ring ≥ 3:1 di setiap latar", () => {
    for (const fg of DESIGN_TOKENS.filter((t) => t.group === "control")) {
      for (const bg of backgrounds) {
        expect(contrastRatio(fg.hex, bg.hex), `${fg.name} di ${bg.name}`).toBeGreaterThanOrEqual(WCAG_AA.nonText);
      }
    }
  });

  it("teks tombol utama di atas merah brand ≥ 4.5:1; merah brand sendiri TIDAK lolos sebagai teks", () => {
    expect(contrastRatio(token("brand.on-primary").hex, token("brand.primary").hex)).toBeGreaterThanOrEqual(WCAG_AA.text);
    // Alasan token status.danger ada: merah brand di kartu gelap < 4.5:1.
    expect(contrastRatio(token("brand.primary").hex, token("bg.surface").hex)).toBeLessThan(WCAG_AA.text);
  });
});

describe("sinkron dengan CSS", () => {
  it("setiap token punya variabel --gos-* bernilai sama di globals.css", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const t of DESIGN_TOKENS) {
      expect(css, t.cssVar).toMatch(new RegExp(`${t.cssVar}:\\s*${t.hex};`, "i"));
    }
  });
});

describe("format uang", () => {
  it("Rp IDR, minus eksplisit, tanda + opsional, tanpa desimal", () => {
    expect(formatRupiah(2_066_000)).toBe("Rp2.066.000");
    expect(formatRupiah(-16_000)).toBe("−Rp16.000");
    expect(formatRupiah(3_000, { signed: true })).toBe("+Rp3.000");
    expect(formatRupiah(0, { signed: true })).toBe("Rp0");
  });
});

describe("terminologi baku (PRD §24.9)", () => {
  it("komponen design system tidak memakai istilah terlarang", () => {
    const dir = path.join(process.cwd(), "src/components/ds");
    for (const file of readdirSync(dir)) {
      const text = readFileSync(path.join(dir, file), "utf8");
      for (const term of FORBIDDEN_TERMS) expect(text, `${file}: ${term.avoid}`).not.toMatch(term.avoid);
    }
  });
});
