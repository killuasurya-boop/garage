import { describe, expect, it } from "vitest";

import { hasPartnerItems, mergePartnerStatus } from "@/lib/partner-menu-refresh";

const coffee = { id: "kopi", stock: "ready", name: "Kopi", price: 20_000 };
const dimsum = { id: "dsm-1", stock: "sold_out", name: "Dimsum Kepiting", partner: { name: "Mitra Dimsum", label: "Mitra jeda" } };

describe("mergePartnerStatus", () => {
  it("mitra BUKA lagi → status di layar ikut terbuka tanpa refresh", () => {
    const next = mergePartnerStatus([coffee, dimsum], [
      { id: "kopi", stock: "sold_out" },
      { id: "dsm-1", stock: "ready", partner: { name: "Mitra Dimsum", label: null } },
    ]);
    expect(next[1]).toMatchObject({ stock: "ready", partner: { label: null }, name: "Dimsum Kepiting" });
    // produk Garage tidak disentuh (stoknya diatur kasir, ikut alur lama)
    expect(next[0]).toBe(coffee);
  });

  it("tanpa perubahan → array yang sama (tidak render ulang)", () => {
    const current = [coffee, dimsum];
    expect(mergePartnerStatus(current, [{ id: "dsm-1", stock: "sold_out", partner: { name: "Mitra Dimsum", label: "Mitra jeda" } }])).toBe(current);
  });

  it("produk mitra hilang dari data baru (hub mati / mitra nonaktif) → dikunci", () => {
    const open = { ...dimsum, stock: "ready", partner: { name: "Mitra Dimsum", label: null } };
    const [next] = mergePartnerStatus([open], []);
    expect(next).toMatchObject({ stock: "sold_out", partner: { label: "Tidak tersedia" } });
  });

  it("hasPartnerItems", () => {
    expect(hasPartnerItems([coffee])).toBe(false);
    expect(hasPartnerItems([coffee, dimsum])).toBe(true);
  });
});
