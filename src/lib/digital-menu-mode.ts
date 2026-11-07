// Mode menu digital per outlet (Owner, 4 Nov 2026 — Menu V5):
// - "self_order"  = pelanggan memesan & membayar sendiri lewat /order (perilaku lama, DEFAULT saat rilis).
// - "waiter_list" = pelanggan hanya melihat menu & menyusun Daftar Pilihan, lalu "Tunjukkan ke Waiter";
//                   pesanan resmi dicatat waiter (mode Pesankan) dan masuk POS + Bar/Dapur seperti biasa.
// Server menolak checkout pelanggan di mode waiter_list (lihat /api/customer/orders), jadi mode ini tidak
// bisa dilewati dari HP. Order staf (Pesankan/open bill) tidak terpengaruh.

export const DIGITAL_MENU_MODES = ["self_order", "waiter_list"] as const;
export type DigitalMenuMode = (typeof DIGITAL_MENU_MODES)[number];

export const DEFAULT_DIGITAL_MENU_MODE: DigitalMenuMode = "self_order";

export const DIGITAL_MENU_MODE_LABEL: Record<DigitalMenuMode, string> = {
  self_order: "Pelanggan pesan & bayar sendiri",
  waiter_list: "Daftar Pilihan → pesanan dicatat waiter",
};

export function parseDigitalMenuMode(value: unknown): DigitalMenuMode {
  return value === "waiter_list" ? "waiter_list" : DEFAULT_DIGITAL_MENU_MODE;
}

/** Bolehkah pelanggan checkout sendiri dari menu digital? */
export function selfOrderAllowed(mode: DigitalMenuMode | null | undefined): boolean {
  return parseDigitalMenuMode(mode) === "self_order";
}

export const VIEW_ONLY_MESSAGE =
  "Menu digital outlet ini untuk melihat menu & menyusun Daftar Pilihan. Tunjukkan daftar ke waiter untuk memesan.";
