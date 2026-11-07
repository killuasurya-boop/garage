import { fail, ok } from "@/lib/api-response";
import { getInvoiceMemberContext } from "@/lib/customer-experience-service";
import { readAccessToken, readRefreshToken, requireMemberAuth } from "@/lib/member-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Konteks membership untuk halaman invoice (CX Engine V4). Token invoice hanya
// membuka invoice; data member HANYA dari sesi member (cookie). Tanpa sesi = guest.
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, "invoice-member-context", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await context.params;
  const session = await requireMemberAuth(request);
  const customerId = session.data?.customer.id ?? null;
  const result = await getInvoiceMemberContext(token, customerId);
  if (!result) return fail(404, "INVOICE_NOT_FOUND", "Invoice tidak ditemukan.");

  // Ada cookie sesi tapi tidak valid → klien boleh mencoba refresh sekali.
  const sessionExpired = !customerId && Boolean(readAccessToken(request) || readRefreshToken(request));
  return ok({ ...result, sessionExpired }, { headers: { "Cache-Control": "no-store" } });
}
