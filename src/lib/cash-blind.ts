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
