import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Penjaga warna POS (U9, owner 25 Nov 2026 — "versi aman"): kelas warna hex lama (`bg-[#111116]`, `text-white`, …)
// dipetakan ulang oleh 3 lapis selector substring (preset OS, tema kasir lama, remap POS V6; lihat
// docs/pos-v6/WARNA-TEMA-3-LAPIS.md). Kelas hex BARU di file POS = warna salah di sebagian tema. Tes ini hanya
// mengunci: jumlah per file tidak boleh naik; file POS baru wajib 0. Warna baru → token `--pos-*`
// (mis. `bg-[var(--pos-surface)]`, `text-[var(--pos-muted)]`). Angka turun = bagus: perbarui baseline di bawah.
const HEX_COLOR_CLASS = /\b(?:bg|text|border)-(?:\[#[0-9a-fA-F]{3,8}\]|(?:white|black)\b)/g;

const BASELINE: Record<string, number> = {
  "src/components/garage/pos-view.tsx": 969,
  "src/components/garage/pos/pos-checkout-panels.tsx": 201,
  "src/components/garage/pos/pos-dialogs.tsx": 247,
  "src/components/garage/pos/pos-event-bundles.tsx": 39,
  "src/components/garage/pos/pos-quick-retail.tsx": 25,
  "src/components/garage/pos/pos-receipt-panels.tsx": 76,
  "src/components/garage/pos/pos-table-detail-dialog.tsx": 79,
  "src/components/garage/pos/pos-ui-shared.tsx": 5,
  "src/components/garage/pos/pos-v6-module-sheet.tsx": 3,
};

function posFiles() {
  const dir = "src/components/garage/pos";
  const files = readdirSync(path.join(process.cwd(), dir))
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => `${dir}/${name}`);
  return ["src/components/garage/pos-view.tsx", ...files];
}

export function countHexColorClasses(source: string) {
  return source.match(HEX_COLOR_CLASS)?.length ?? 0;
}

describe("warna POS: tidak ada kelas warna hex baru", () => {
  it("pola mengenali kelas hex & putih/hitam, bukan token", () => {
    expect(countHexColorClasses('className="bg-[#111116] text-white border-[#34343c]/50 bg-[var(--pos-surface)]"')).toBe(3);
    expect(countHexColorClasses('className="text-[var(--pos-muted)] bg-white/[0.04] text-whitesmoke"')).toBe(1);
  });

  for (const file of posFiles()) {
    it(`${file} tidak menambah kelas warna hex`, () => {
      const count = countHexColorClasses(readFileSync(path.join(process.cwd(), file), "utf8"));
      const limit = BASELINE[file] ?? 0;
      expect(
        count,
        count > limit
          ? `${file}: ${count} kelas warna hex (batas ${limit}). Pakai token --pos-* (docs/pos-v6/WARNA-TEMA-3-LAPIS.md).`
          : `${file}: turun ke ${count} — perbarui BASELINE`,
      ).toBeLessThanOrEqual(limit);
    });
  }
});
