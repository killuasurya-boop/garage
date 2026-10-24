// =============================================================================
// Blind count di SERVER (owner, Okt 2026): Kasir tidak boleh melihat "kas
// seharusnya" & selisih selama shift masih buka — dulu hanya disembunyikan di
// layar, padahal API tetap mengirim angkanya. Owner/Manajer tetap melihat.
// =============================================================================

type CashFigures = {
  status?: string | null;
  expectedCash?: number | null;
  discrepancy?: number | null;
};

export function hidesOpenShiftCash(role: string | null | undefined) {
  return role === "Kasir";
}

/** Nolkan kas seharusnya & selisih bila sesi masih buka dan peminta Kasir. */
export function redactOpenShiftCash<T extends CashFigures>(session: T, role: string | null | undefined): T {
  if (!hidesOpenShiftCash(role) || session.status !== "open") return session;
  return {
    ...session,
    ...(session.expectedCash !== undefined ? { expectedCash: 0 } : {}),
    ...(session.discrepancy !== undefined ? { discrepancy: 0 } : {}),
    cashFiguresHidden: true,
  };
}

type SummaryWithDrawer = {
  session: CashFigures;
  reconciliation?: { expectedCash: number; otherAdjustments: number } & Record<string, unknown>;
  movements?: Array<{ balanceBefore: number | null; balanceAfter: number | null } & Record<string, unknown>>;
};

/** Ringkasan shift: ikut sembunyikan saldo laci per transaksi & kas akhir rekonsiliasi. */
export function redactOpenShiftSummary<T extends SummaryWithDrawer>(summary: T, role: string | null | undefined): T {
  if (!hidesOpenShiftCash(role) || summary.session.status !== "open") return summary;
  return {
    ...summary,
    session: redactOpenShiftCash(summary.session, role),
    ...(summary.reconciliation
      ? {
          // Rincian penyesuaian buku kas juga disembunyikan: bersama modal & penjualan
          // tunai, kasir bisa menghitung ulang kas seharusnya.
          reconciliation: { ...summary.reconciliation, expectedCash: 0, otherAdjustments: 0, adjustmentsBreakdown: [], hidden: true },
        }
      : {}),
    ...(summary.movements
      ? {
          movements: summary.movements.map((row) => ({
            ...row,
            balanceBefore: null,
            balanceAfter: null,
            balanceHidden: row.balanceBefore != null,
          })),
        }
      : {}),
  };
}
