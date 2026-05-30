import { fail, ok } from "@/lib/api-response";
import { getInvoiceLiveStatus } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  // Polling-friendly rate limit: 80 calls/menit/IP = 1 polling tiap ~750ms.
  // Frontend default poll: 8 detik → masih jauh dibawah limit.
  const limited = rateLimit(request, "invoice-live-status", { limit: 80, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await context.params;
  const status = await getInvoiceLiveStatus(token);
  if (!status) {
    return fail(404, "INVOICE_NOT_FOUND", "Invoice tidak ditemukan.");
  }

  return ok(status, {
    headers: {
      // No cache — selalu fresh
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
