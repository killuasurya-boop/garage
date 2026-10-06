import { and, like, ne, sql } from "drizzle-orm";

import { expenses } from "@/db/schema";
import type { getDb } from "@/db";
import { jakartaDateKey } from "@/lib/finance-control-core";

// =============================================================================
// Belanja bahan baku = biaya (konsep owner, Okt 2026). Setiap penerimaan gudang
// yang selesai langsung dicatat sebagai pengeluaran kas LUNAS per area — tidak
// ada hutang supplier. Baris ber-sourceDoc inilah sumber "Belanja bahan" di laba
// rugi (finance-control), sehingga pembayaran/expense lain kategori belanja
// tetap hanya arus kas (tidak dobel).
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type PurchaseArea = "bar" | "dapur" | "umum";

export const PURCHASE_PAYMENT_METHODS = ["Cash", "Transfer", "QRIS"] as const;
export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number];

/** Tanggal terima "YYYY-MM-DD" (WIB); kosong = hari ini. Tidak boleh di masa depan. */
export function normalizeReceivedDate(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Format tanggal terima harus YYYY-MM-DD.");
  if (raw > jakartaDateKey()) throw new Error("Tanggal terima tidak boleh di masa depan.");
  return raw;
}

/** Waktu biaya untuk tanggal terima: hari ini = sekarang, tanggal lalu = 12:00 WIB. */
export function purchaseDateFor(dateKey: string): Date {
  if (dateKey === jakartaDateKey()) return new Date();
  return new Date(`${dateKey}T05:00:00.000Z`);
}

export const PURCHASE_CATEGORY: Record<PurchaseArea, string> = {
  bar: "Belanja Bar",
  dapur: "Belanja Dapur",
  umum: "Belanja Umum",
};

export function purchaseAreaOf(area: string | null | undefined): PurchaseArea {
  const value = (area ?? "").trim().toLowerCase();
  if (value === "bar") return "bar";
  if (value === "dapur" || value === "kitchen") return "dapur";
  return "umum";
}

export function purchaseAreaForCategory(category: string): PurchaseArea | null {
  const entry = (Object.entries(PURCHASE_CATEGORY) as Array<[PurchaseArea, string]>).find(
    ([, name]) => name.toLowerCase() === category.trim().toLowerCase(),
  );
  return entry ? entry[0] : null;
}

/** Catat belanja cash lunas per area; idempoten lewat sourceDoc "<doc>#<area>". */
export async function recordCashPurchases(
  tx: Tx | Db,
  input: {
    sourceDoc: string;
    outletId: string | null;
    supplierId?: string | null;
    description: string;
    byArea: Partial<Record<PurchaseArea, number>>;
    userId?: string | null;
    notes?: string | null;
    date?: Date;
    paymentMethod?: string | null;
  },
) {
  const rows = (Object.entries(input.byArea) as Array<[PurchaseArea, number]>)
    .map(([area, amount]) => [area, Math.round(amount)] as const)
    .filter(([, amount]) => amount > 0)
    .map(([area, amount]) => ({
      outletId: input.outletId,
      supplierId: input.supplierId ?? null,
      category: PURCHASE_CATEGORY[area],
      description: `${input.description} · ${PURCHASE_CATEGORY[area]}`,
      amount,
      paymentMethod: input.paymentMethod || "Cash",
      status: "paid",
      expenseDate: input.date ?? new Date(),
      notes: input.notes ?? null,
      sourceDoc: `${input.sourceDoc}#${area}`,
      createdBy: input.userId ?? null,
    }));
  if (!rows.length) return 0;
  await tx.insert(expenses).values(rows).onConflictDoNothing({ target: expenses.sourceDoc });
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Batalkan belanja dari satu dokumen penerimaan (status "void" → keluar dari
 * laba rugi & arus kas). Mengembalikan baris yang dibatalkan.
 */
export async function voidCashPurchases(tx: Tx | Db, input: { sourceDoc: string; reason: string }) {
  return tx
    .update(expenses)
    .set({
      status: "void",
      notes: sql`coalesce(${expenses.notes} || ' · ', '') || ${`Dibatalkan: ${input.reason}`}`,
      updatedAt: new Date(),
    })
    .where(and(like(expenses.sourceDoc, `${input.sourceDoc}#%`), ne(expenses.status, "void")))
    .returning({ id: expenses.id, amount: expenses.amount, expenseDate: expenses.expenseDate });
}
