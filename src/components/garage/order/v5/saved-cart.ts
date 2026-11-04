// Daftar Pilihan tidak hilang saat halaman dimuat ulang atau pelanggan sempat keluar ke website (audit F2).
// Disimpan di sessionStorage (per tab, per outlet & meja), bukan di server. Saat dipulihkan, setiap baris
// divalidasi ulang terhadap menu yang berlaku: menu/varian yang sudah tidak ada dan paket event dibuang.
// Harga TIDAK disimpan — total selalu dihitung ulang dari menu terkini.
import type { MenuItem } from "@/lib/garage-api-types";

import { cartKey } from "../order-ui";

export type SavedCart = { cart: Record<string, number>; notes: Record<string, string> };

const MAX_QTY = 99;

export function savedCartKey(outletId: string | null | undefined, tableLabel: string) {
  return `garage:order-cart:${outletId || "main"}:${tableLabel}`;
}

/** Validasi isi tersimpan terhadap menu saat ini (murni, untuk diuji). */
export function restoreCart(raw: unknown, menu: MenuItem[]): SavedCart | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as { cart?: unknown; notes?: unknown };
  if (!source.cart || typeof source.cart !== "object") return null;
  const cart: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const [key, value] of Object.entries(source.cart as Record<string, unknown>)) {
    const [itemId, variantId] = key.split("::");
    if (!itemId || !variantId || itemId.startsWith("event:")) continue;
    const item = menu.find((entry) => entry.id === itemId);
    if (!item || item.stock === "sold_out" || !item.variants.some((variant) => variant.id === variantId)) continue;
    const qty = typeof value === "number" && Number.isInteger(value) ? Math.min(MAX_QTY, value) : 0;
    if (qty <= 0) continue;
    const canonical = cartKey(itemId, variantId);
    cart[canonical] = qty;
    const note = source.notes && typeof source.notes === "object" ? (source.notes as Record<string, unknown>)[key] : undefined;
    if (typeof note === "string" && note.trim()) notes[canonical] = note.slice(0, 200);
  }
  return Object.keys(cart).length ? { cart, notes } : null;
}

export function readSavedCart(key: string, menu: MenuItem[]): SavedCart | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? restoreCart(JSON.parse(raw) as unknown, menu) : null;
  } catch {
    return null;
  }
}

export function writeSavedCart(key: string, cart: Record<string, number>, notes: Record<string, string>) {
  try {
    const regular = Object.fromEntries(Object.entries(cart).filter(([entry, qty]) => qty > 0 && !entry.startsWith("event:")));
    if (!Object.keys(regular).length) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify({ cart: regular, notes }));
  } catch {
    // Penyimpanan diblokir (mode privat): Daftar Pilihan hanya bertahan selama halaman terbuka.
  }
}
