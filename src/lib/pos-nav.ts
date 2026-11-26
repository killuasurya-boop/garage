/**
 * Model menu POS satu sumber (sidebar ringkas + lembar "Lainnya", 25 Nov 2026).
 * Data murni: tanpa React/lucide. Komponen memetakan `icon` (kebab-case) ke ikon lucide.
 * Tombol F (F1 Kasir, F2 Pesanan QR, F3 Meja, F4 Riwayat Struk, F6 Belum Bayar) tidak boleh berubah.
 */

export type PosNavId =
  | "kasir" | "pesanan-qr" | "meja" | "belum-bayar" | "riwayat-struk" | "produksi" | "stok-habis" | "shift" | "kas"
  | "laporan-shift-saya" | "riwayat-penjualan" | "riwayat-laporan-shift" | "petty-cash" | "catatan-kejadian"
  | "kontak-member" | "daftar-member" | "pesanan-mitra" | "penjualan-mitra"
  | "qc-kasir" | "stok-opname" | "pengumuman-suara" | "mode-tampilan" | "theme-studio" | "pengaturan-pos" | "muat-ulang";

/** Kunci ikon lucide (kebab-case), dipetakan di komponen. Harus unik di seluruh model. */
export type PosNavIconKey = string;

export type PosNavItem = {
  id: PosNavId;
  label: string;
  icon: PosNavIconKey;
  shortcut?: string;
  count?: number;
  dot?: "good" | "warn" | "danger";
  testId?: string;
};

export type PosNavGroup = { id: string; label: string; items: PosNavItem[] };

export type PosNavContext = {
  shiftOpen: boolean;
  waitingQr: number;
  pendingAll: number;
  pendingOverdue: number;
  receiptCount: number;
  kitchenTickets: number;
  soldOut: number;
  partnerHubEnabled: boolean;
  partnerAttention: number;
  canQuickCount: boolean;
  canManagePosSettings: boolean;
  refreshing: boolean;
};

export type PosNavModel = { primary: PosNavItem[]; more: PosNavGroup[]; moreAttention: number };

const positive = (n: number) => (n > 0 ? n : undefined);

export function posNavModel(ctx: PosNavContext): PosNavModel {
  const primary: PosNavItem[] = [
    { id: "kasir", label: "Kasir", icon: "shopping-cart", shortcut: "F1" },
    { id: "pesanan-qr", label: "Pesanan QR", icon: "qr-code", shortcut: "F2", count: positive(ctx.waitingQr), dot: ctx.waitingQr > 0 ? "warn" : undefined },
    { id: "meja", label: "Meja", icon: "layout-grid", shortcut: "F3" },
    {
      id: "belum-bayar", label: "Belum Bayar", icon: "clock", shortcut: "F6", testId: "pos-pending-open",
      count: positive(ctx.pendingAll),
      dot: ctx.pendingAll > 0 ? (ctx.pendingOverdue > 0 ? "danger" : "warn") : undefined,
    },
    { id: "riwayat-struk", label: "Riwayat Struk", icon: "receipt", shortcut: "F4", count: positive(ctx.receiptCount) },
    { id: "produksi", label: "Produksi Bar & Dapur", icon: "chef-hat", count: positive(ctx.kitchenTickets), dot: ctx.kitchenTickets > 0 ? "good" : undefined },
    { id: "stok-habis", label: "Atur Stok Habis", icon: "package-x", count: positive(ctx.soldOut), dot: ctx.soldOut > 0 ? "danger" : undefined },
    ctx.shiftOpen
      ? { id: "shift", label: "Shift aktif", icon: "timer", dot: "good" }
      : { id: "shift", label: "Mulai shift", icon: "timer", dot: "danger" },
    { id: "kas", label: "Kas Keluar / Masuk", icon: "wallet" },
  ];

  const partnerItems: PosNavItem[] = ctx.partnerHubEnabled
    ? [
        {
          id: "pesanan-mitra", label: "Pesanan mitra", icon: "handshake", testId: "pos-menu-partners",
          count: positive(ctx.partnerAttention), dot: ctx.partnerAttention > 0 ? "danger" : undefined,
        },
        { id: "penjualan-mitra", label: "Penjualan mitra hari ini", icon: "trending-up", testId: "pos-menu-partner-sales" },
      ]
    : [];

  const gudangItems: PosNavItem[] = [{ id: "qc-kasir", label: "QC kasir", icon: "clipboard-check", testId: "pos-qc-open-menu" }];
  if (ctx.canQuickCount) gudangItems.push({ id: "stok-opname", label: "Stok opname gudang", icon: "clipboard-list" });

  const perangkatItems: PosNavItem[] = [
    { id: "pengumuman-suara", label: "Pengumuman suara", icon: "volume-2" },
    { id: "mode-tampilan", label: "Mode tampilan", icon: "monitor" },
    { id: "theme-studio", label: "Theme Studio", icon: "palette" },
  ];
  if (ctx.canManagePosSettings) perangkatItems.push({ id: "pengaturan-pos", label: "Pengaturan POS", icon: "settings" });
  perangkatItems.push({ id: "muat-ulang", label: ctx.refreshing ? "Memuat…" : "Muat ulang POS", icon: "refresh-cw" });

  const groups: PosNavGroup[] = [
    {
      id: "laporan", label: "Laporan & riwayat",
      items: [
        { id: "laporan-shift-saya", label: "Laporan shift saya", icon: "file-text" },
        { id: "riwayat-penjualan", label: "Riwayat penjualan", icon: "history" },
        { id: "riwayat-laporan-shift", label: "Riwayat & laporan shift", icon: "calendar-clock" },
        { id: "petty-cash", label: "Petty cash", icon: "coins", testId: "pos-menu-petty" },
        { id: "catatan-kejadian", label: "Catatan kejadian", icon: "triangle-alert", testId: "pos-menu-incident" },
      ],
    },
    {
      id: "pelanggan", label: "Pelanggan",
      items: [
        { id: "kontak-member", label: "Kontak / member", icon: "contact" },
        { id: "daftar-member", label: "Daftar member", icon: "users" },
      ],
    },
    { id: "mitra", label: "Mitra", items: partnerItems },
    { id: "gudang", label: "Gudang & cek", items: gudangItems },
    { id: "perangkat", label: "Perangkat", items: perangkatItems },
  ];

  return {
    primary,
    more: groups.filter((g) => g.items.length > 0),
    moreAttention: ctx.partnerHubEnabled ? ctx.partnerAttention : 0,
  };
}

export function allNavIds(model: PosNavModel): PosNavId[] {
  return [...model.primary, ...model.more.flatMap((g) => g.items)].map((i) => i.id);
}
