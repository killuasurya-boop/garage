import { describe, expect, it } from "vitest";
import { POS_NAV_ICONS } from "@/components/garage/pos/pos-v6-nav";
import { allNavIds, posNavModel, type PosNavContext, type PosNavItem } from "./pos-nav";

const base: PosNavContext = {
  shiftOpen: false, waitingQr: 0, pendingAll: 0, pendingOverdue: 0, receiptCount: 0,
  kitchenTickets: 0, soldOut: 0, partnerHubEnabled: true, partnerAttention: 0,
  canQuickCount: true, canManagePosSettings: true, refreshing: false,
};
const build = (o: Partial<PosNavContext> = {}) => posNavModel({ ...base, ...o });
const find = (o: Partial<PosNavContext>, id: string): PosNavItem | undefined => {
  const m = build(o);
  return [...m.primary, ...m.more.flatMap((g) => g.items)].find((i) => i.id === id);
};

describe("posNavModel", () => {
  it("primary urut dan shortcut F-key tetap", () => {
    const m = build();
    expect(m.primary.map((i) => i.id)).toEqual(["kasir", "pesanan-qr", "meja", "belum-bayar", "riwayat-struk", "produksi", "stok-habis", "shift", "kas"]);
    const sc = Object.fromEntries(m.primary.map((i) => [i.id, i.shortcut]));
    expect(sc).toMatchObject({ kasir: "F1", "pesanan-qr": "F2", meja: "F3", "riwayat-struk": "F4", "belum-bayar": "F6" });
    expect(sc.produksi).toBeUndefined();
    expect(sc["stok-habis"]).toBeUndefined();
    expect(sc.shift).toBeUndefined();
    expect(sc.kas).toBeUndefined();
  });

  it("grup more urut, label, dan isi", () => {
    const m = build();
    expect(m.more.map((g) => [g.id, g.label])).toEqual([
      ["laporan", "Laporan & riwayat"], ["pelanggan", "Pelanggan"], ["mitra", "Mitra"], ["gudang", "Gudang & cek"], ["perangkat", "Perangkat"],
    ]);
    const ids = Object.fromEntries(m.more.map((g) => [g.id, g.items.map((i) => i.id)]));
    expect(ids.laporan).toEqual(["laporan-shift-saya", "riwayat-penjualan", "riwayat-laporan-shift", "petty-cash", "catatan-kejadian"]);
    expect(ids.pelanggan).toEqual(["kontak-member", "daftar-member"]);
    expect(ids.mitra).toEqual(["pesanan-mitra", "penjualan-mitra"]);
    expect(ids.gudang).toEqual(["qc-kasir", "stok-opname"]);
    expect(ids.perangkat).toEqual(["pengumuman-suara", "mode-tampilan", "theme-studio", "pengaturan-pos", "muat-ulang"]);
  });

  it("allNavIds 25 unik", () => {
    const ids = allNavIds(build());
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });

  it("ikon unik dan label bukan huruf besar semua", () => {
    const items = [...build().primary, ...build().more.flatMap((g) => g.items)];
    const icons = items.map((i) => i.icon);
    expect(new Set(icons).size).toBe(icons.length);
    for (const i of items) expect(i.label).not.toBe(i.label.toUpperCase());
  });

  it("kondisi izin menyembunyikan item/grup", () => {
    expect(build({ partnerHubEnabled: false }).more.map((g) => g.id)).not.toContain("mitra");
    expect(find({ canQuickCount: false }, "stok-opname")).toBeUndefined();
    expect(find({ canQuickCount: false }, "qc-kasir")).toBeDefined();
    expect(find({ canManagePosSettings: false }, "pengaturan-pos")).toBeUndefined();
    for (const g of build({ partnerHubEnabled: false, canQuickCount: false }).more) expect(g.items.length).toBeGreaterThan(0);
  });

  it("shift", () => {
    expect(find({ shiftOpen: true }, "shift")).toMatchObject({ label: "Shift aktif", dot: "good" });
    expect(find({ shiftOpen: false }, "shift")).toMatchObject({ label: "Mulai shift", dot: "danger" });
  });

  it("belum bayar", () => {
    expect(find({ pendingAll: 3, pendingOverdue: 1 }, "belum-bayar")).toMatchObject({ count: 3, dot: "danger" });
    expect(find({ pendingAll: 3, pendingOverdue: 0 }, "belum-bayar")).toMatchObject({ count: 3, dot: "warn" });
    expect(find({ pendingAll: 0 }, "belum-bayar")?.dot).toBeUndefined();
  });

  it("produksi dan stok habis", () => {
    expect(find({ kitchenTickets: 2 }, "produksi")).toMatchObject({ count: 2, dot: "good" });
    expect(find({ soldOut: 4 }, "stok-habis")).toMatchObject({ count: 4, dot: "danger" });
  });

  it("mitra attention", () => {
    expect(find({ partnerAttention: 5 }, "pesanan-mitra")).toMatchObject({ count: 5, dot: "danger" });
    expect(build({ partnerAttention: 5 }).moreAttention).toBe(5);
    expect(build({ partnerAttention: 5, partnerHubEnabled: false }).moreAttention).toBe(0);
  });

  it("muat ulang", () => {
    expect(find({ refreshing: true }, "muat-ulang")?.label).toBe("Memuat…");
  });

  it("testId", () => {
    const t = (id: string) => find({}, id)?.testId;
    expect(t("belum-bayar")).toBe("pos-pending-open");
    expect(t("qc-kasir")).toBe("pos-qc-open-menu");
    expect(t("petty-cash")).toBe("pos-menu-petty");
    expect(t("catatan-kejadian")).toBe("pos-menu-incident");
    expect(t("pesanan-mitra")).toBe("pos-menu-partners");
    expect(t("penjualan-mitra")).toBe("pos-menu-partner-sales");
  });
});

describe("POS_NAV_ICONS", () => {
  it("setiap icon key model punya ikon, semua unik, plus 'more'", () => {
    const m = build();
    const keys = [...m.primary, ...m.more.flatMap((g) => g.items)].map((i) => i.icon);
    for (const k of keys) expect(POS_NAV_ICONS[k], k).toBeDefined();
    expect(POS_NAV_ICONS.more).toBeDefined();
    const all = [...new Set(keys), "more"].map((k) => POS_NAV_ICONS[k]);
    expect(new Set(all).size).toBe(all.length);
  });
});
