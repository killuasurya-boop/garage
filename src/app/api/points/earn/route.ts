import { requireMemberAuth } from "@/lib/member-auth";
import { errorJson } from "@/lib/member-types";

export const runtime = "nodejs";

/**
 * Ditutup (owner, Okt 2026): member tidak boleh menambah poin sendiri. Poin
 * hanya didapat otomatis dari pesanan yang lunas (POS / menu digital).
 */
export async function POST(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;
  return errorJson(410, "Poin didapat otomatis dari pesanan yang sudah lunas.");
}
