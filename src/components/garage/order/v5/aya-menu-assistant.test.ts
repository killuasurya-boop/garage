import { describe, expect, it } from "vitest";

import type { MenuItem } from "@/lib/garage-api-types";

import { AYA_SAMPLE_PROMPTS, answerAya, ayaQuickPrompts, detectAyaIntents, normalizeAyaText } from "./aya-menu-assistant";

function menu(id: string, name: string, category: string, extra: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    name,
    category,
    section: extra.section ?? category,
    variants: extra.variants ?? [{ id: `${id}-v`, label: "Regular", price: 20000 }],
    stock: "ready",
    prep: "5",
    tags: [],
    ...extra,
  } as MenuItem;
}

const items: MenuItem[] = [
  menu("americano", "Americano", "Coffee", { section: "Americano", variants: [{ id: "a-c", label: "Cold", price: 18000 }, { id: "a-h", label: "Hot", price: 16000 }] }),
  menu("spanish", "Spanish Latte", "Coffee", { section: "Kopi Susu", variants: [{ id: "s-c", label: "Cold", price: 26000 }] }),
  menu("caramel", "Caramel Macchiato", "Coffee", { section: "Kopi Susu", variants: [{ id: "c-c", label: "Cold", price: 28000 }] }),
  menu("tubruk", "Kopi Tubruk", "Coffee", { section: "Manual", variants: [{ id: "t-h", label: "Hot", price: 12000 }] }),
  menu("matcha", "Matcha Latte", "Non-Coffee", { section: "Milk Series", variants: [{ id: "m-c", label: "Cold", price: 24000 }] }),
  menu("lychee", "Lychee Tea", "Non-Coffee", { section: "Tea Series", variants: [{ id: "l-c", label: "Cold", price: 20000 }] }),
  menu("nasgor", "Nasi Goreng", "Makanan"),
  menu("indomie", "Indomie Kuah", "Makanan"),
  menu("kentang", "Kentang Goreng", "Cemilan"),
  menu("habis", "Iced Vanilla Latte", "Coffee", { stock: "sold_out", variants: [{ id: "h-c", label: "Cold", price: 25000 }] }),
];
const ctx = { items, bestSellerIds: ["spanish", "nasgor", "americano"] };
const ids = (list: MenuItem[]) => list.map((item) => item.id);

describe("AYA Assistant (aturan, tanpa AI)", () => {
  it("normalisasi teks & deteksi maksud", () => {
    expect(normalizeAyaText("  Kopi, CREAMY!! ")).toBe("kopi creamy");
    expect(detectAyaIntents("Halo AYA")).toEqual(["greeting"]);
    expect(detectAyaIntents("kopi creamy yang dingin")).toEqual(expect.arrayContaining(["coffee", "creamy", "cold"]));
    expect(detectAyaIntents("gimana cara pesan?")).toContain("howTo");
    expect(detectAyaIntents("pesan")).not.toContain("cold"); // "es" di dalam kata tidak dihitung
  });

  it("kopi favorit = kopi terlaris lebih dulu, menu habis tidak pernah disarankan", () => {
    const answer = answerAya("Rekomendasikan menu kopi paling favorit", ctx);
    expect(ids(answer.items)[0]).toBe("spanish");
    expect(answer.items.every((item) => item.category === "Coffee")).toBe(true);
    expect(ids(answer.items)).not.toContain("habis");
  });

  it("semua syarat harus cocok: kopi + creamy + dingin", () => {
    const answer = answerAya("kopi creamy dingin", ctx);
    expect(ids(answer.items).sort()).toEqual(["caramel", "spanish"]);
  });

  it("kopi bold, minuman dingin, makanan kenyang, teman kerja", () => {
    expect(ids(answerAya("kopi dengan rasa bold", ctx).items)).toEqual(expect.arrayContaining(["americano", "tubruk"]));
    expect(answerAya("minuman dingin yang segar", ctx).items.every((item) => item.category !== "Makanan")).toBe(true);
    expect(answerAya("lapar, mau yang kenyang", ctx).items.every((item) => item.category === "Makanan")).toBe(true);
    expect(answerAya("menu buat pendamping kerja", ctx).items.every((item) => item.category === "Coffee")).toBe(true);
  });

  it("pencarian bebas memakai nama menu", () => {
    expect(ids(answerAya("lychee", ctx).items)).toEqual(["lychee"]);
  });

  it("tidak ketemu → jujur + tawarkan favorit, tidak mengarang", () => {
    const answer = answerAya("pizza", ctx);
    expect(answer.empty).toBe(true);
    expect(answer.text).toMatch(/belum menemukan/);
    expect(answer.items.length).toBeGreaterThan(0);
  });

  it("cara pesan & panggil staf memberi aksi, bukan menu", () => {
    expect(answerAya("cara pesan gimana?", ctx)).toMatchObject({ action: "guide", items: [] });
    expect(answerAya("panggil waiter", ctx)).toMatchObject({ action: "staff", items: [] });
  });

  it("chip Promo hanya muncul bila ada menu promo; tidak ada rating/menu terbaru", () => {
    expect(ayaQuickPrompts(ctx).map((prompt) => prompt.id)).not.toContain("promo");
    const promo = { items: [...items, menu("promo", "Es Kopi Susu", "Coffee", { promoActive: true, promoPrice: 10000 })] };
    expect(ayaQuickPrompts(promo).map((prompt) => prompt.id)).toContain("promo");
    const text = [...AYA_SAMPLE_PROMPTS.map((prompt) => prompt.label), answerAya("rekomendasi", ctx).text].join(" ");
    expect(text).not.toMatch(/rating|terbaru|★/i);
  });
});
