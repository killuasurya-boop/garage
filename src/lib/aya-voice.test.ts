import { describe, expect, it } from "vitest";

import { captionDurationMs } from "@/components/garage/aya/aya-floating-pet";
import { AYA_LINES, pickAyaLine, type AyaLineCategory } from "@/lib/aya-lines";
import {
  AYA_SFX,
  AYA_SFX_COOLDOWN_MS,
  AYA_SFX_GLOBAL_GAP_MS,
  ayaSfxAllowed,
  ayaSoundDefaults,
  pickIndonesianVoice,
  speakableText,
  type AyaSfx,
} from "@/lib/aya-sound";
import { ZZFX_SAMPLE_RATE, zzfxBuildSamples } from "@/lib/zzfx";

const categories = Object.keys(AYA_LINES) as AyaLineCategory[];

describe("bank kalimat Aya — bijak, lucu, imut (A4)", () => {
  it("setiap kategori berisi kalimat & tidak ada duplikat", () => {
    for (const category of categories) {
      const lines = AYA_LINES[category];
      expect(lines.length, category).toBeGreaterThanOrEqual(3);
      expect(new Set(lines).size, category).toBe(lines.length);
    }
  });

  it("aturan isi: ≤2 kalimat, ringkas, tanpa harga/promo/stok/data internal", () => {
    for (const category of categories) {
      for (const line of AYA_LINES[category]) {
        const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean);
        expect(sentences.length, line).toBeLessThanOrEqual(2);
        expect(line.length, line).toBeLessThanOrEqual(140);
        expect(line, line).not.toMatch(/\bRp\b|\d+\s*%|\bdiskon\b|\bpromo\b|\bgratis\b|stok habis|\bomzet\b|\bgaji\b|\bHPP\b/i);
      }
    }
  });

  it("semangat staf tidak menegur/menyalahkan siapa pun", () => {
    for (const line of [...AYA_LINES.staffCheer, ...AYA_LINES.staffAllClear]) {
      expect(line, line).not.toMatch(/lambat|malas|salah|telat|kurang|jangan sampai/i);
    }
  });

  it("tidak mengulang kalimat yang sudah dipakai di sesi; bila habis, tidak mengulang yang terakhir", () => {
    const lines = AYA_LINES.joke;
    const used = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = pickAyaLine("joke", used, () => 0.99);
      expect(used.has(line)).toBe(false);
      used.add(line);
    }
    // Semua sudah dipakai → boleh ulang, kecuali kalimat terakhir.
    const last = [...used].at(-1);
    for (const r of [0, 0.5, 0.99]) expect(pickAyaLine("joke", used, () => r)).not.toBe(last);
  });

  it("caption cukup lama untuk dibaca, tidak berlarut", () => {
    expect(captionDurationMs("Hai!")).toBe(3500);
    expect(captionDurationMs("x".repeat(100))).toBe(7000);
    expect(captionDurationMs("x".repeat(500))).toBe(9000);
  });
});

describe("suara & SFX Aya (OD-04)", () => {
  it("bawaan: customer nyala, staf (POS/KDS) mati", () => {
    expect(ayaSoundDefaults("customer").enabled).toBe(true);
    expect(ayaSoundDefaults("staff").enabled).toBe(false);
  });

  it("SFX punya jeda: efek sama ≥350 ms, efek apa pun ≥120 ms", () => {
    const last = new Map<AyaSfx | "*", number>();
    expect(ayaSfxAllowed(last, "pop", 1000)).toBe(true);
    last.set("pop", 1000).set("*", 1000);
    expect(ayaSfxAllowed(last, "pop", 1000 + AYA_SFX_COOLDOWN_MS - 1)).toBe(false);
    expect(ayaSfxAllowed(last, "tap", 1000 + AYA_SFX_GLOBAL_GAP_MS - 1)).toBe(false);
    expect(ayaSfxAllowed(last, "tap", 1000 + AYA_SFX_GLOBAL_GAP_MS)).toBe(true);
    expect(ayaSfxAllowed(last, "pop", 1000 + AYA_SFX_COOLDOWN_MS)).toBe(true);
  });

  it("memilih suara Bahasa Indonesia; tanpa suara Indonesia → null (cukup caption)", () => {
    const voices = [
      { lang: "en-US", name: "Google US English" },
      { lang: "id-ID", name: "Microsoft Andika" },
      { lang: "id-ID", name: "Google Bahasa Indonesia" },
    ];
    expect(pickIndonesianVoice(voices)?.name).toBe("Google Bahasa Indonesia");
    expect(pickIndonesianVoice([{ lang: "id_ID", name: "Bahasa" }])?.name).toBe("Bahasa");
    expect(pickIndonesianVoice([{ lang: "en-GB", name: "Daniel" }])).toBeNull();
  });

  it("teks yang dibacakan bersih dari emoji & simbol", () => {
    expect(speakableText("Hai! Aku Aya 👋")).toBe("Hai! Aku Aya");
    expect(speakableText("Cara pesan · 1/4 “latte”…")).toBe("Cara pesan, 1/4 latte...");
  });

  it("tiap SFX menghasilkan bunyi pendek (≤0,6 dtk) yang valid", () => {
    for (const [name, params] of Object.entries(AYA_SFX)) {
      const samples = zzfxBuildSamples(...(params as number[]));
      expect(samples.length, name).toBeGreaterThan(0);
      expect(samples.length / ZZFX_SAMPLE_RATE, name).toBeLessThanOrEqual(0.6);
      let peak = 0;
      for (const s of samples) {
        expect(Number.isFinite(s), name).toBe(true);
        peak = Math.max(peak, Math.abs(s));
      }
      expect(peak, name).toBeGreaterThan(0.01); // terdengar
      expect(peak, name).toBeLessThanOrEqual(1.0001); // tidak pecah
    }
  });
});
