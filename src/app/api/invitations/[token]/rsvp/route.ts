import { fail, ok, readJson } from "@/lib/api-response";
import { EventError } from "@/lib/event-service";
import { rsvpInputSchema, submitRsvp } from "@/lib/event-invitations";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik: tamu mengirim/mengubah RSVP lewat token undangan pribadi.
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, "event-rsvp", { limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const { token } = await context.params;
  const body = await readJson(request, rsvpInputSchema);
  if (body.error) return body.error;
  try {
    return ok({ rsvp: await submitRsvp(token, body.data) });
  } catch (error) {
    if (error instanceof EventError) return fail(error.status, error.code, error.message);
    console.error("[rsvp] submit failed", error instanceof Error ? error.message : "unknown");
    return fail(500, "RSVP_FAILED", "RSVP gagal disimpan. Coba lagi.");
  }
}
