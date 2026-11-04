import { afterEach, describe, expect, it, vi } from "vitest";

const played: Array<[string, string]> = [];
vi.mock("@/lib/aya-sound", () => ({
  playAyaSfx: (name: string, audience: string) => {
    played.push([name, audience]);
    return true;
  },
}));

import { flyToList, menuSfxFor, playMenuSfx, type MenuFeedbackAction } from "./menu-feedback";
import { MENU_TOAST_LIMIT, pushMenuToast } from "./toast-v5";

afterEach(() => {
  played.length = 0;
});

describe("menu-feedback", () => {
  it("memetakan aksi ke efek suara papan 06", () => {
    const expected: Record<MenuFeedbackAction, string> = {
      add: "pop",
      remove: "tap",
      "favorite-on": "sparkle",
      "favorite-off": "tap",
      "quickview-open": "whoosh",
      "quickview-close": "tap",
      "checkout-success": "sparkle",
      "checkout-error": "oops",
    };
    for (const [action, sfx] of Object.entries(expected)) expect(menuSfxFor(action as MenuFeedbackAction)).toBe(sfx);
  });

  it("memutar lewat audiens pelanggan", () => {
    expect(playMenuSfx("add")).toBe(true);
    expect(played).toEqual([["pop", "customer"]]);
  });

  it("mode staf (Pesankan waiter) tidak pernah berbunyi", () => {
    expect(menuSfxFor("checkout-success", { staff: true })).toBeNull();
    expect(playMenuSfx("add", { staff: true })).toBe(false);
    expect(played).toEqual([]);
  });

  it("terbang ke Daftar aman tanpa DOM / asal", () => {
    expect(flyToList(null)).toBe(false);
  });
});

describe("toast bertingkat", () => {
  it("maksimal 3, yang lama dibuang; judul + nada sama diganti", () => {
    let list = pushMenuToast([], { id: 1, tone: "success", title: "Latte" });
    list = pushMenuToast(list, { id: 2, tone: "warning", title: "Stok terbatas" });
    list = pushMenuToast(list, { id: 3, tone: "success", title: "Latte" });
    expect(list.map((toast) => toast.id)).toEqual([2, 3]);
    for (let id = 4; id < 9; id += 1) list = pushMenuToast(list, { id, tone: "error", title: `Gagal ${id}` });
    expect(list).toHaveLength(MENU_TOAST_LIMIT);
    expect(list.at(-1)?.id).toBe(8);
  });
});
