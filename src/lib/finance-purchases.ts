import { expenses } from "@/db/schema";
import type { getDb } from "@/db";

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
      paymentMethod: "Cash",
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
