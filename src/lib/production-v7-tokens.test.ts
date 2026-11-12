import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Production V7: palet `.phv4` di globals.css harus lolos kontras WCAG AA (4.5:1 teks, 3:1 batas/ikon)
// dan tidak boleh memakai animasi tanpa henti (kebijakan gerak Garage + prefers-reduced-motion).

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokens(): Record<string, string> {
  const start = css.indexOf("\n.phv4 {");
  expect(start).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--phv4-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[match[1]] = match[2].toLowerCase();
  return out;
}

function luminance(hex: string) {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Production V7 — token warna", () => {
  const t = tokens();
  const surfaces = ["bg", "bg2", "card", "elev"] as const;

  it("semua token palet terdefinisi", () => {
    for (const name of [...surfaces, "red", "brand", "text", "muted", "success", "process", "wait", "overdue", "critical", "batch", "sync", "border"]) {
      expect(t[name], `--phv4-${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("teks utama & teks redup ≥ 4.5:1 di semua permukaan", () => {
    for (const surface of surfaces) {
      expect(contrast(t.text, t[surface]), `text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t[surface]), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("warna status sebagai teks ≥ 4.5:1 di latar papan dan kartu", () => {
    for (const status of ["success", "process", "wait", "overdue", "critical", "batch", "sync", "brand"] as const) {
      for (const surface of ["bg", "bg2", "card"] as const) {
        expect(contrast(t[status], t[surface]), `${status} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("tombol aksi merah: teks putih ≥ 4.5:1; chip status: teks gelap ≥ 4.5:1", () => {
    expect(contrast("#ffffff", t.red)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#1a1203", t.wait)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#04222f", t.process)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#052e16", t.success)).toBeGreaterThanOrEqual(4.5);
  });

  it("garis batas terlihat (≥ 1.5:1 terhadap kartu; batas kartu terpilih putih ≥ 3:1)", () => {
    expect(contrast(t.border, t.card)).toBeGreaterThanOrEqual(1.5);
    expect(contrast("#ffffff", t.card)).toBeGreaterThanOrEqual(3);
  });
});

describe("Production V7 — gerak", () => {
  const start = css.indexOf("\n.phv4 {");
  const section = css.slice(start, start + 12_000);

  it("tidak ada animasi tanpa henti pada kartu/laci Production", () => {
    const rules = [...section.matchAll(/\.(phv4|phv7)[^{]*\{[^}]*\}/g)].map((m) => m[0]);
    expect(rules.length).toBeGreaterThan(5);
    for (const rule of rules) expect(rule, rule.slice(0, 60)).not.toMatch(/infinite/);
  });

  it("menghormati prefers-reduced-motion", () => {
    expect(section).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
