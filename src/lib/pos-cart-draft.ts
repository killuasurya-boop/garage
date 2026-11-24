/**
 * Draf keranjang POS per perangkat (audit POS Nov 2026).
 *
 * Keranjang dulu hanya ada di memori: tombol Absen/Opname (pindah halaman penuh),
 * refresh, atau tablet crash menghapus isinya tanpa peringatan. Draf ini disimpan
 * tiap kali keranjang berubah dan dipulihkan saat POS dibuka lagi.
 *
 * Sengaja TANPA data pelanggan (nama/HP/member/voucher): tablet kasir dipakai
 * bergantian, jadi yang disimpan hanya item, jenis pesanan, dan nomor meja.
 */
import type { CartLine, OrderType } from "@/lib/garage-api-types";
import { POS_MAX_LINE_QTY } from "@/lib/pos-payment-method";

export const POS_CART_DRAFT_KEY = "garage:pos:cart-draft:v1";
/** Draf lebih tua dari ini dianggap basi (shift berikutnya tidak mewarisi keranjang lama). */
export const POS_CART_DRAFT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export type PosCartDraft = {
  cart: CartLine[];
  orderType: OrderType;
  tableNumber: string;
  savedAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const ORDER_TYPES: readonly OrderType[] = ["dine-in", "takeaway", "delivery"];

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cleanLine(value: unknown): CartLine | null {
  if (!value || typeof value !== "object") return null;
  const line = value as Record<string, unknown>;
  if (typeof line.itemId !== "string" || typeof line.variantId !== "string") return null;
  const qty = typeof line.qty === "number" && Number.isFinite(line.qty) ? Math.trunc(line.qty) : 0;
  if (qty < 1) return null;
  const note = typeof line.note === "string" && line.note.trim() ? line.note.slice(0, 120) : undefined;
  return { itemId: line.itemId, variantId: line.variantId, qty: Math.min(qty, POS_MAX_LINE_QTY), ...(note ? { note } : {}) };
}

export function saveCartDraft(
  draft: { cart: CartLine[]; orderType: OrderType; tableNumber: string },
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
) {
  if (!storage) return;
  try {
    if (!draft.cart.length) {
      storage.removeItem(POS_CART_DRAFT_KEY);
      return;
    }
    // Pilih kolom satu per satu: data pelanggan tidak ikut walau pemanggil mengirimnya.
    const value: PosCartDraft = {
      cart: draft.cart,
      orderType: draft.orderType,
      tableNumber: draft.tableNumber,
      savedAt: now,
    };
    storage.setItem(POS_CART_DRAFT_KEY, JSON.stringify(value));
  } catch {
    // Storage penuh/diblokir: POS tetap jalan, hanya tanpa pemulihan keranjang.
  }
}

export function loadCartDraft(
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): PosCartDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(POS_CART_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!savedAt || now - savedAt > POS_CART_DRAFT_MAX_AGE_MS || savedAt > now + 60_000) {
      storage.removeItem(POS_CART_DRAFT_KEY);
      return null;
    }
    const cart = (Array.isArray(parsed.cart) ? parsed.cart : [])
      .map(cleanLine)
      .filter((line): line is CartLine => line !== null);
    if (!cart.length) return null;
    const orderType = ORDER_TYPES.includes(parsed.orderType as OrderType) ? (parsed.orderType as OrderType) : "dine-in";
    const tableNumber = typeof parsed.tableNumber === "string" ? parsed.tableNumber.slice(0, 8) : "";
    return { cart, orderType, tableNumber, savedAt };
  } catch {
    return null;
  }
}

/** Buang baris yang produk/variannya sudah tidak ada di menu (dihapus/diubah sejak draf disimpan). */
export function restorableCartLines(
  lines: CartLine[],
  menuVariants: ReadonlyMap<string, { variants: ReadonlyArray<{ id: string }> }>,
): CartLine[] {
  return lines.filter((line) =>
    menuVariants.get(line.itemId)?.variants.some((variant) => variant.id === line.variantId),
  );
}
