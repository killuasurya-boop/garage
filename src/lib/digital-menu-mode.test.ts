import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@/lib/garage-app-settings-types";
import { SETTINGS_CATEGORIES } from "@/lib/garage-settings-schema";
import { DEFAULT_DIGITAL_MENU_MODE, parseDigitalMenuMode, selfOrderAllowed } from "@/lib/digital-menu-mode";

describe("Mode menu digital (Menu V5)", () => {
  it("bawaan saat rilis = pelanggan pesan & bayar sendiri (perilaku lama)", () => {
    expect(DEFAULT_DIGITAL_MENU_MODE).toBe("self_order");
    expect(DEFAULT_APP_SETTINGS.digitalMenuMode).toBe("self_order");
  });

  it("nilai tak dikenal jatuh ke bawaan; hanya waiter_list yang menutup checkout pelanggan", () => {
    expect(parseDigitalMenuMode("waiter_list")).toBe("waiter_list");
    expect(parseDigitalMenuMode("apa saja")).toBe("self_order");
    expect(parseDigitalMenuMode(undefined)).toBe("self_order");
    expect(selfOrderAllowed("self_order")).toBe(true);
    expect(selfOrderAllowed(undefined)).toBe(true);
    expect(selfOrderAllowed("waiter_list")).toBe(false);
  });

  it("muncul di Pengaturan → Meja & Menu Digital sebagai pilihan dua mode", () => {
    const field = SETTINGS_CATEGORIES.flatMap((section) => section.fields).find((entry) => entry.key === "digitalMenuMode");
    expect(field?.type).toBe("select");
    expect((field as { options?: Array<{ value: string }> }).options?.map((option) => option.value)).toEqual(["self_order", "waiter_list"]);
  });
});
