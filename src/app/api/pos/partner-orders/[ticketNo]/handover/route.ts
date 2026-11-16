import { handoverPartnerTicket } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Kasir menyerahkan pesanan mitra yang sudah SIAP ke pelanggan (take away / ambil di kasir / kurir) — Owner 16 Nov 2026.
// Hanya pemegang uang (kasir/Owner/Manajer); tiket harus milik mitra di outlet kasir dan berstatus Siap.
export async function POST(request: Request, context: { params: Promise<{ ticketNo: string }> }) {
  const limited = rateLimit(request, "partner-handover", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { ticketNo } = await context.params;
  return partnerRoute(() => handoverPartnerTicket(session.data, ticketNo));
}
