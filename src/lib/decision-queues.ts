// Audit Smart Approval SA-16: indeks keputusan lintas modul (baca-saja). Antrean persetujuan modul lain
// tetap di modulnya (aturan & aksinya sendiri); Decision Center hanya menghitung dan menautkan, supaya Owner
// melihat SEMUA yang menunggu keputusan di satu tempat. Tidak ada aksi dari sini.
import { and, count, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { cashMovements, cashSessions, pettyCashEntries, wmsPurchaseOrder, wmsStockOpname, wmsWaste } from "@/db/schema";

export type DecisionQueue = { key: string; label: string; count: number; href: string; note: string };

async function safeCount(run: () => Promise<Array<{ n: number }>>) {
  try {
    const [row] = await run();
    return Number(row?.n ?? 0);
  } catch {
    // Satu modul gagal dibaca tidak boleh menjatuhkan Decision Center; ditandai -1 = tidak terbaca.
    return -1;
  }
}

export async function getDecisionQueues(): Promise<DecisionQueue[]> {
  const db = getDb();
  const [cashOut, pettySubmitted, pettyUnpaid, shiftFinal, po, waste, opname] = await Promise.all([
    safeCount(() => db.select({ n: count() }).from(cashMovements).where(eq(cashMovements.status, "pending_approval"))),
    safeCount(() => db.select({ n: count() }).from(pettyCashEntries).where(eq(pettyCashEntries.status, "submitted"))),
    safeCount(() => db.select({ n: count() }).from(pettyCashEntries).where(and(eq(pettyCashEntries.status, "approved"), isNull(pettyCashEntries.paidAt)))),
    safeCount(() => db.select({ n: count() }).from(cashSessions).where(and(eq(cashSessions.status, "closed"), eq(cashSessions.finalStatus, "pending")))),
    safeCount(() => db.select({ n: count() }).from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.status, "pending_approval"))),
    safeCount(() => db.select({ n: count() }).from(wmsWaste).where(eq(wmsWaste.status, "pending_approval"))),
    safeCount(() => db.select({ n: count() }).from(wmsStockOpname).where(eq(wmsStockOpname.status, "submitted"))),
  ]);
  return [
    { key: "shift_final", label: "Final Owner shift kasir", count: shiftFinal, href: "/control/cash-closing", note: "Tutup shift menunggu final Owner (2FA)" },
    { key: "cash_out", label: "Kas keluar laci", count: cashOut, href: "/control/cash-closing", note: "Pengajuan kasir, uang belum bergerak" },
    { key: "petty_submitted", label: "Petty cash diajukan", count: pettySubmitted, href: "/control/cash-closing", note: "Menunggu persetujuan" },
    { key: "petty_unpaid", label: "Petty cash disetujui, belum dibayar", count: pettyUnpaid, href: "/control/cash-closing", note: "Persetujuan ≠ pembayaran" },
    { key: "po", label: "Purchase order", count: po, href: "/warehouse/purchase-orders", note: "Menunggu persetujuan PO" },
    { key: "waste", label: "Waste gudang", count: waste, href: "/warehouse/waste", note: "Waste staf ≥ Rp50.000" },
    { key: "opname", label: "Stok opname", count: opname, href: "/warehouse/opname", note: "Menunggu finalisasi" },
  ];
}
