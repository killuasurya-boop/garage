import { requireMemberAuth } from "@/lib/member-auth";
import { errorJson } from "@/lib/member-types";

export const runtime = "nodejs";

/**
 * Ditutup (owner, Okt 2026): tukar poin terpisah tidak memotong tagihan apa pun.
 * Poin dipakai langsung saat bayar — tombol "Pakai poin" di menu digital / kasir.
 */
export async function POST(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;
  return errorJson(410, "Poin sekarang dipakai langsung saat bayar: pilih \"Pakai poin\" di checkout atau minta kasir.");
}
