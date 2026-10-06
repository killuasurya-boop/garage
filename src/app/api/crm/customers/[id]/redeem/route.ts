import { fail } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

/**
 * Ditutup (owner, Okt 2026): tukar semua poin dari CRM tidak tercatat ke tagihan.
 * Poin member dipakai di kasir (POS → pilih member → "Pakai poin").
 */
export async function POST() {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;
  return fail(410, "POINTS_REDEEM_AT_CHECKOUT", "Poin dipakai saat bayar di kasir: pilih member → \"Pakai poin\".");
}
