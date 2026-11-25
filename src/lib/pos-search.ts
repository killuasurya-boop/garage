import { shortcodeMatchRank } from "@/lib/menu-shortcode";

/**
 * Pencarian kolom kasir POS (Fase 2 "Kasir Lancar", audit 24 Nov 2026 U5).
 * Satu sumber untuk daftar menu yang tampil DAN tombol Enter, supaya Enter selalu
 * memakai teks yang baru diketik/discan (dulu berhenti diam-diam saat hasil cari belum "settle").
 */

export type PosSearchEntry<T> = {
  item: T;
  /** Teks gabungan huruf kecil: nama, kategori, tag, varian, SKU, barcode. */
  searchIndex: string;
  shortcodes: readonly string[];
};

/** Qty maksimal lewat sintaks `N*kode` (sama dengan batas server per baris). */
export const POS_SEARCH_MAX_QTY = 999;

/**
 * `3*cl` / `3* cl` / `3x cl` → qty 3, kata "cl". Tanpa awalan qty → qty 1.
 * Angka saja (mis. barcode) tidak pernah dianggap qty.
 */
export function parseQuantityQuery(raw: string): { qty: number; term: string } {
  const text = raw.trim();
  const match = /^(\d{1,3})\s*[*x×]\s*(.+)$/i.exec(text);
  if (match) {
    const qty = Number(match[1]);
    const term = match[2].trim();
    if (qty >= 1 && qty <= POS_SEARCH_MAX_QTY && term && !/^\d+$/.test(text.replace(/\s/g, ""))) {
      return { qty, term: term.toLowerCase() };
    }
  }
  return { qty: 1, term: text.toLowerCase() };
}

/** Pola kode scanner (EAN/UPC dsb.): ≥ 8 digit saja. Tanpa kecocokan persis → jangan tebak hasil teratas. */
export function isBarcodeLike(term: string) {
  return /^\d{8,}$/.test(term.trim());
}

/**
 * Hasil cari berurutan: kode singkat persis di depan, lalu cocok teks/awalan kode.
 * `accept` = filter kategori/bestseller yang sedang aktif.
 */
export function searchMenuEntries<E extends PosSearchEntry<unknown>>(
  entries: readonly E[],
  term: string,
  accept: (entry: E) => boolean = () => true,
): E["item"][] {
  const query = term.trim().toLowerCase();
  const exact: E["item"][] = [];
  const result: E["item"][] = [];
  for (const entry of entries) {
    if (!accept(entry)) continue;
    if (query) {
      const codeRank = shortcodeMatchRank(query, entry.shortcodes);
      if (codeRank === 2) {
        exact.push(entry.item);
        continue;
      }
      if (!codeRank && !entry.searchIndex.includes(query)) continue;
    }
    result.push(entry.item);
  }
  return exact.length ? [...exact, ...result] : result;
}

type SearchableReceipt = {
  orderNo: string;
  invoiceNo: string;
  tableLabel?: string | null;
  total: number;
  customer?: { name: string | null; phone: string | null };
};

/**
 * Cari Riwayat Struk (U7): no order/invoice, meja, nama/HP pelanggan, atau nominal
 * ("45000", "45.000", "Rp 45.000" semua cocok dengan total 45.000).
 */
export function filterReceipts<R extends SearchableReceipt>(receipts: readonly R[], query: string): R[] {
  const text = query.trim().toLowerCase();
  if (!text) return [...receipts];
  const digits = text.replace(/[^\d]/g, "");
  const amountQuery = /^(rp\s*)?[\d.,\s]+$/.test(text) && digits.length > 0;
  return receipts.filter((receipt) => {
    if (amountQuery && String(receipt.total).includes(digits)) return true;
    const haystack = [receipt.orderNo, receipt.invoiceNo, receipt.tableLabel ?? "", receipt.customer?.name ?? "", receipt.customer?.phone ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(text);
  });
}
