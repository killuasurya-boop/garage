// Smart Partner Hub — sinkron status produk mitra di layar yang sudah terbuka (menu digital, POS).
// Menu dimuat sekali saat halaman dibuka; tanpa ini Buka/Jeda/Tutup atau Tersedia/Habis dari Portal Mitra baru
// terlihat setelah refresh manual. Hanya `stock` + `partner` produk mitra yang diperbarui: data lain di layar
// (harga event, varian paket, keranjang) tidak disentuh. Murni (tanpa I/O) — diuji di partner-menu-refresh.test.ts.

type PartnerAware = { id: string; stock?: string | null; partner?: { name: string; label: string | null } | null };

/** Interval cek ulang status mitra di layar terbuka (ms). */
export const PARTNER_MENU_REFRESH_MS = 30_000;

export function hasPartnerItems(items: readonly PartnerAware[]) {
  return items.some((item) => Boolean(item.partner));
}

/**
 * Salin status mitra terbaru ke daftar di layar. Kembalikan array yang SAMA bila tidak ada perubahan
 * (tidak memicu render ulang). Produk mitra yang hilang dari data baru (hub dimatikan / mitra nonaktif)
 * ditandai Habis tanpa label mitra baru, supaya tidak bisa ditambah sampai halaman dimuat ulang.
 */
export function mergePartnerStatus<T extends PartnerAware>(current: T[], fresh: readonly PartnerAware[]): T[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  let changed = false;
  const next = current.map((item) => {
    if (!item.partner) return item;
    const latest = byId.get(item.id);
    const stock = latest ? latest.stock : "sold_out";
    const partner = latest ? (latest.partner ?? null) : { name: item.partner.name, label: "Tidak tersedia" };
    const samePartner = (partner?.name ?? null) === (item.partner?.name ?? null) && (partner?.label ?? null) === (item.partner?.label ?? null);
    if (stock === item.stock && samePartner) return item;
    changed = true;
    return { ...item, stock, partner: partner ?? undefined } as T;
  });
  return changed ? next : current;
}
