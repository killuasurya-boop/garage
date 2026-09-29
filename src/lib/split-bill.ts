import type { AppSettings } from "@/lib/garage-app-settings-types";
import { calculateBillingTotals } from "@/lib/garage-billing";

// =============================================================================
// Split bill per produk (keranjang POS): tiap porsi di keranjang ditugaskan ke
// satu tamu; tiap tamu jadi order & pembayaran sendiri. Logika murni (tanpa DB)
// supaya bisa diuji unit dan dipakai UI.
// =============================================================================

export type SplitSourceLine = {
  itemId: string;
  variantId: string;
  qty: number;
  note?: string;
  price: number;
};

/** Satu porsi keranjang: baris ke-`lineIndex`, porsi ke-`unitIndex`. */
export type SplitUnit = { lineIndex: number; unitIndex: number };

/** assignment[lineIndex][unitIndex] = nomor tamu (0-based). */
export type SplitAssignment = number[][];

export function initialAssignment(lines: Array<{ qty: number }>): SplitAssignment {
  return lines.map((line) => Array.from({ length: Math.max(0, line.qty) }, () => 0));
}

/** Kecilkan jumlah tamu: porsi milik tamu yang dihapus kembali ke Tamu 1. */
export function clampAssignment(assignment: SplitAssignment, guestCount: number): SplitAssignment {
  return assignment.map((units) => units.map((guest) => (guest < guestCount ? guest : 0)));
}

/** Gabungkan porsi per tamu menjadi baris order (item+varian+catatan sama digabung). */
export function linesForGuest<T extends SplitSourceLine>(
  lines: T[],
  assignment: SplitAssignment,
  guest: number,
): Array<T & { qty: number }> {
  const result: Array<T & { qty: number }> = [];
  lines.forEach((line, lineIndex) => {
    const qty = (assignment[lineIndex] ?? []).filter((g) => g === guest).length;
    if (qty > 0) result.push({ ...line, qty });
  });
  return result;
}

export function guestSubtotal(lines: SplitSourceLine[], assignment: SplitAssignment, guest: number) {
  return linesForGuest(lines, assignment, guest).reduce((sum, line) => sum + line.price * line.qty, 0);
}

/** Perkiraan total tamu (service & pajak proporsional karena dihitung per order). */
export function guestEstimate(
  lines: SplitSourceLine[],
  assignment: SplitAssignment,
  guest: number,
  settings: Pick<AppSettings, "serviceChargePct" | "taxPct" | "roundingMode">,
) {
  const subtotal = guestSubtotal(lines, assignment, guest);
  const { service, tax, grossTotal } = calculateBillingTotals(subtotal, settings as AppSettings);
  return { subtotal, service, tax, total: subtotal > 0 ? grossTotal : 0 };
}

/** Tamu yang punya minimal satu porsi. */
export function activeGuests(assignment: SplitAssignment, guestCount: number) {
  const used = new Set(assignment.flat());
  return Array.from({ length: guestCount }, (_, guest) => guest).filter((guest) => used.has(guest));
}

/**
 * Kurangi keranjang dengan porsi milik tamu yang sudah lunas. Dipakai saat
 * dialog ditutup di tengah jalan supaya porsi lunas tidak tertagih dua kali.
 */
export function remainingCart<T extends { qty: number }>(
  lines: T[],
  assignment: SplitAssignment,
  paidGuests: Set<number>,
): T[] {
  return lines
    .map((line, lineIndex) => {
      const paidUnits = (assignment[lineIndex] ?? []).filter((guest) => paidGuests.has(guest)).length;
      return { ...line, qty: line.qty - paidUnits };
    })
    .filter((line) => line.qty > 0);
}
