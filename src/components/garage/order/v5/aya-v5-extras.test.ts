import { describe, expect, it } from "vitest";

import type { MenuItem } from "@/lib/garage-api-types";
import { GARAGE_LOCATION } from "@/lib/garage-location";

import { parseAyaChat, serializeAyaChat } from "./aya-chat-history";
import { answerAya, ayaQuickPrompts, detectAyaIntents } from "./aya-menu-assistant";
import { filterTables } from "./table-info-v5";

function menu(id: string, name: string, category: string, extra: Partial<MenuItem> = {}): MenuItem {
  return { id, name, category, section: category, variants: [{ id: `${id}-v`, label: "Regular", price: 20000 }], stock: "ready", prep: "5", tags: [], ...extra } as MenuItem;
}

const items = [
  menu("kopi-garage", "Kopi Garage", "Coffee", { tags: ["Signature"] }),
  menu("latte", "Coffee Latte", "Coffee", { featured: true }),
  menu("matcha", "Matcha Latte", "Non-Coffee"),
  menu("nasgor", "Nasi Goreng", "Makanan"),
];
const ctx = { items, bestSellerIds: [], mode: "waiter_list" as const, tableLabel: "Meja 07" };

describe("AYA V5 — navigasi pintar & info", () => {
  it("“tunjukkan menu kopi” = kartu kopi + pindah ke kategori Coffee", () => {
    const answer = answerAya("Aya, tunjukkan menu kopi", ctx);
    expect(answer.nav).toEqual({ kind: "category", category: "Coffee", label: "menu Coffee" });
    expect(answer.autoNav).toBe(true);
    expect(answer.items.every((item) => item.category === "Coffee")).toBe(true);
  });

  it("Signature (tag) ≠ Unggulan (featured)", () => {
    const sig = answerAya("mana menu signature?", ctx);
    expect(sig.items.map((item) => item.id)).toEqual(["kopi-garage"]);
    expect(sig.nav).toMatchObject({ kind: "chip", chip: "signature" });
    const ung = answerAya("menu unggulan apa?", ctx);
    expect(ung.items.map((item) => item.id)).toEqual(["latte"]);
    expect(ung.autoNav).toBe(false);
  });

  it("tanpa data Signature → jujur, tidak mengarang", () => {
    const answer = answerAya("menu signature", { items: items.filter((item) => item.id !== "kopi-garage") });
    expect(answer.empty).toBe(true);
    expect(answer.text).toMatch(/belum ada menu yang ditandai Signature/);
  });

  it("cara pesan di mode Daftar Pilihan = lewat waiter", () => {
    const answer = answerAya("Bagaimana cara pesan?", ctx);
    expect(answer.text).toMatch(/waiter/);
    expect(answer.nav?.kind).toBe("help");
  });

  it("lokasi & Instagram dari data resmi, meja = info saja", () => {
    expect(answerAya("di mana lokasi garage coffee?", ctx).links?.[0].href).toBe(GARAGE_LOCATION.directionsUrl);
    expect(answerAya("instagram garage apa", ctx).links?.[0].href).toMatch(/instagram\.com/);
    const table = answerAya("informasi meja", ctx);
    expect(table.text).toMatch(/Meja 07/);
    expect(table.text).toMatch(/tidak membuat pesanan/);
    expect(detectAyaIntents("panggil waiter")).toContain("staff");
  });

  it("saran cepat sesuai master prompt; chip berdata hanya bila datanya ada", () => {
    const labels = ayaQuickPrompts(ctx).map((prompt) => prompt.label);
    expect(labels).toEqual(expect.arrayContaining(["Lihat Menu Coffee", "Rekomendasi Minuman", "Menu Signature", "Menu Unggulan", "Bagaimana Cara Memesan?", "Informasi Meja", "Lokasi Garage Coffee", "Instagram Garage Coffee"]));
    expect(ayaQuickPrompts({ items: [items[2]] }).map((prompt) => prompt.id)).not.toContain("signature");
  });
});

describe("Riwayat chat sesi & filter meja", () => {
  it("menyimpan id menu, membaca ulang dari data terbaru, menu habis dibuang", () => {
    const raw = serializeAyaChat([{ id: 1, from: "aya", text: "Ini", items: [items[0], items[1]], at: new Date("2026-11-05T01:00:00Z") }]);
    expect(raw).not.toContain("20000");
    const back = parseAyaChat(raw, [items[0], { ...items[1], stock: "sold_out" }]);
    expect(back?.[0].items?.map((item) => item.id)).toEqual(["kopi-garage"]);
    expect(parseAyaChat("rusak{", items)).toBeNull();
  });

  it("cari nomor meja", () => {
    const tables = ["01", "07", "17", "20"].map((tableNumber) => ({ tableNumber, area: tableNumber === "20" ? "Teras" : "Dalam" }));
    expect(filterTables(tables, "7").map((table) => table.tableNumber)).toEqual(["07", "17"]);
    expect(filterTables(tables, "07").map((table) => table.tableNumber)).toEqual(["07"]);
    expect(filterTables(tables, "teras").map((table) => table.tableNumber)).toEqual(["20"]);
    expect(filterTables(tables, "")).toHaveLength(4);
  });
});
