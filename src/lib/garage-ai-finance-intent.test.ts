import { describe, expect, it } from "vitest";

import { classifyGarageAiIntent } from "./garage-ai-context";

// PRD V2.0 §1 — pertanyaan CEO harus diarahkan ke agen finance (AI Financial Assistant).
describe("AI Financial Assistant — routing pertanyaan CEO", () => {
  it.each([
    "Berapa omzet Garage hari ini?",
    "Berapa laba sebenarnya?",
    "Apakah hari ini sudah mencapai BEP?",
    "Apakah cashflow sehat?",
    "Berapa modal Rp500 juta yang sudah kembali?",
    "Berapa lama estimasi balik modal?",
    "Kenapa HPP naik?",
  ])("%s → finance_check", (message) => {
    expect(classifyGarageAiIntent(message, [])).toBe("finance_check");
  });

  it("pertanyaan stok & dapur tetap ke agen masing-masing", () => {
    expect(classifyGarageAiIntent("Cek stok yang menipis untuk shift sekarang.", [])).toBe("inventory_warning");
    expect(classifyGarageAiIntent("Cek kitchen delay dan station yang bottleneck.", [])).toBe("kitchen_warning");
  });
});
