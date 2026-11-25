// Pemetaan path internal → popup modul POS (dipisah dari pos-v6-module-sheet.tsx supaya POS tidak ikut memuat
// laporan shift/riwayat penjualan/mitra saat halaman dibuka; sheet-nya di-lazy-load, Fase 3 tahap C).

export type PosModuleView =
  | { kind: "sales"; title: string }
  | { kind: "shift"; title: string; tab?: string }
  | { kind: "partners"; title: string; tab: "orders" | "finance" }
  | { kind: "frame"; title: string; url: string };

const SHIFT_TABS = ["active", "history", "sales", "full", "petty", "incident"];

/** Path internal → tampilan popup. Path lain (atau host luar) = null (biarkan apa adanya). */
export function moduleViewForPath(path: string, title = "Dokumen"): PosModuleView | null {
  let url: URL;
  try {
    url = new URL(path, "http://pos.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://pos.local") return null;
  if (url.pathname === "/sales-history") return { kind: "sales", title: "Riwayat Penjualan" };
  if (url.pathname === "/shift") {
    const tab = url.searchParams.get("tab") ?? undefined;
    const label = tab === "petty" ? "Petty Cash" : tab === "incident" ? "Catatan Kejadian" : "Riwayat & Laporan Shift";
    return { kind: "shift", title: label, tab: tab && SHIFT_TABS.includes(tab) ? tab : undefined };
  }
  // Partner Hub (Owner 16 Nov 2026): Pesanan Mitra & Penjualan/Setoran Mitra tampil sebagai panel asli di POS
  // (bukan iframe halaman /partners). Tab lain (Kelola/Pendaftar) tetap halaman penuh.
  if (url.pathname === "/partners") {
    const tab = url.searchParams.get("tab");
    if (!tab || tab === "orders") return { kind: "partners", title: "Pesanan Mitra", tab: "orders" };
    if (tab === "finance") return { kind: "partners", title: "Penjualan & Setoran Mitra", tab: "finance" };
  }
  // PDF unduhan internal → tampil inline di popup.
  if (/^\/api\/(finance\/cash-sessions\/[^/]+\/report|orders\/[^/]+\/invoice)$/.test(url.pathname)) {
    url.searchParams.set("inline", "1");
  }
  return { kind: "frame", title, url: `${url.pathname}${url.search}${url.hash}` };
}
