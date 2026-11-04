import { describe, expect, it } from "vitest";

import { buildOrderGuideSteps, petSpotBeside, pickVisible } from "@/lib/aya-order-guide";

const open = { orderingOpen: true, hasCart: true, hasOrderType: true, orderType: "dine-in" };

describe("panduan cara pesan Aya (OD-01)", () => {
  it("outlet buka: tipe → cari → tambah → checkout → kirim; tiap langkah ber-anchor sesuai tombol", () => {
    const steps = buildOrderGuideSteps(open);
    expect(steps.map((s) => s.id)).toEqual(["order-type", "search", "add-item", "checkout", "send"]);
    expect(steps.map((s) => s.anchor)).toEqual(["order-type", "search", "add-item", "checkout", null]);
    expect(steps[0].text).toMatch(/makan di tempat/i);
    // Alur nyata: kasir konfirmasi dulu sebelum Bar/Dapur.
    expect(steps[4].text).toMatch(/kasir mengonfirmasi dulu, baru Bar\/Dapur/);
  });

  it("outlet belum buka: Aya TIDAK menunjuk checkout dan menjelaskan alasannya", () => {
    const steps = buildOrderGuideSteps({ ...open, orderingOpen: false });
    expect(steps.some((s) => s.anchor === "checkout")).toBe(false);
    expect(steps.at(-1)).toMatchObject({ id: "closed", anchor: null });
    expect(steps.at(-1)?.text).toMatch(/setelah outlet buka/);
  });

  it("keranjang kosong: langkah checkout dijelaskan tanpa menunjuk tombol yang belum ada", () => {
    const step = buildOrderGuideSteps({ ...open, hasCart: false }).find((s) => s.id === "checkout");
    expect(step).toMatchObject({ anchor: null });
    expect(step?.text).toMatch(/Setelah ada menu di keranjang/);
  });

  it("delivery: pembayaran disebut QRIS dulu (sesuai aturan delivery)", () => {
    const delivery = buildOrderGuideSteps({ ...open, orderType: "delivery" }).find((s) => s.id === "checkout");
    expect(delivery?.text).toMatch(/delivery bayar QRIS dulu/);
    expect(delivery?.text).not.toMatch(/tunai/);
    const dineIn = buildOrderGuideSteps(open).find((s) => s.id === "checkout");
    expect(dineIn?.text).toMatch(/tunai, QRIS, atau transfer/);
  });

  it("tanpa baris tipe pesanan (mis. meja bermasalah) langkah pertama langsung cari menu", () => {
    expect(buildOrderGuideSteps({ ...open, hasOrderType: false })[0].id).toBe("search");
  });

  it("teks panduan tidak menyebut harga/angka promo (tidak mengarang data)", () => {
    for (const ctx of [open, { ...open, orderingOpen: false }, { ...open, hasCart: false, orderType: "delivery" }]) {
      for (const step of buildOrderGuideSteps(ctx)) expect(step.text).not.toMatch(/Rp|\d+\s*%|diskon|gratis/i);
    }
  });
});

describe("posisi Aya di samping tombol", () => {
  const vp = { width: 390, height: 844 };
  const size = 72;

  it("tombol kecil: Aya di kanan tombol, menghadap kiri (tangan menunjuk ke tombol)", () => {
    const spot = petSpotBeside({ left: 40, top: 400, width: 120, height: 44 }, vp, size);
    expect(spot).toEqual({ x: 168, y: 386, faceLeft: true, bubble: "below" });
  });

  it("tombol mepet kanan: Aya pindah ke kiri, menghadap kanan", () => {
    const spot = petSpotBeside({ left: 260, top: 400, width: 120, height: 44 }, vp, size);
    expect(spot).toMatchObject({ x: 180, faceLeft: false });
  });

  it("elemen selebar layar (kotak cari di HP): Aya di atas/bawahnya, tidak menutupi, tetap di layar", () => {
    for (const top of [300, 420, 600]) {
      const rect = { left: 16, top, width: 358, height: 44 };
      const spot = petSpotBeside(rect, vp, size);
      expect(spot.y + size <= rect.top || spot.y >= rect.top + rect.height).toBe(true);
      expect(spot.x).toBeGreaterThanOrEqual(8);
      expect(spot.x + size).toBeLessThanOrEqual(vp.width - 8);
    }
  });

  it("bar keranjang di dasar layar: Aya di atas bar, tetap di dalam layar", () => {
    const bar = { left: 16, top: 770, width: 358, height: 56 };
    const spot = petSpotBeside(bar, vp, size);
    expect(spot.y + size).toBeLessThanOrEqual(bar.top);
  });

  it("elemen di paling atas: Aya di bawahnya bila atas tidak muat", () => {
    const rect = { left: 0, top: 4, width: 390, height: 40 };
    const spot = petSpotBeside(rect, vp, size);
    expect(spot.y).toBeGreaterThanOrEqual(rect.top + rect.height);
  });

  it("balon Aya (300×220) tidak menutupi tombol & tetap di dalam layar", () => {
    const bubbleW = 300;
    const bubbleH = 220;
    const rects = [
      { left: 40, top: 400, width: 120, height: 44 },
      { left: 260, top: 120, width: 120, height: 44 },
      { left: 16, top: 300, width: 358, height: 64 },
      { left: 16, top: 770, width: 358, height: 56 },
      { left: 20, top: 380, width: 160, height: 140 },
      { left: 200, top: 330, width: 170, height: 150 },
      { left: 16, top: 60, width: 343, height: 64 }, // tipe pesanan di puncak halaman
      { left: 16, top: 200, width: 343, height: 44 },
    ];
    for (const rect of rects) {
      const spot = petSpotBeside(rect, vp, size);
      const bx = Math.min(Math.max(12, spot.x + size / 2 - bubbleW / 2), vp.width - bubbleW - 12);
      const by = spot.bubble === "above" ? spot.y - 6 - bubbleH : spot.y + size + 6;
      const overlap = !(bx + bubbleW <= rect.left || bx >= rect.left + rect.width || by + bubbleH <= rect.top || by >= rect.top + rect.height);
      expect(overlap, JSON.stringify({ rect, spot })).toBe(false);
      // Balon juga harus utuh di dalam layar.
      expect(by >= 0 && by + bubbleH <= vp.height, JSON.stringify({ rect, spot, by })).toBe(true);
    }
  });

  it("memilih elemen yang benar-benar terlihat (desktop panel vs bar HP)", () => {
    const hidden = { id: "aside", rect: { left: 0, top: 0, width: 0, height: 0 } };
    const shown = { id: "bar", rect: { left: 16, top: 770, width: 358, height: 56 } };
    expect(pickVisible([hidden, shown])?.id).toBe("bar");
    expect(pickVisible([hidden])).toBeNull();
  });
});
