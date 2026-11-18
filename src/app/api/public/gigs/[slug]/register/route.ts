import { forwardToPlatform, publicRegistrationRoute } from "@/lib/event-registration-route";
import { registerPublic, resolveRegistrationEvent } from "@/lib/event-registration-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Pendaftaran kreator/sponsor/kru dari form halaman event platform (lewat Caddy, Owner 18 Nov 2026). Event belum
// tertaut ke master Garage → diteruskan ke platform seperti sebelumnya.
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = rateLimit(request, "public-gigs-register", { limit: 6, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const { slug } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Isian tidak terbaca." }, { status: 400 });
  return publicRegistrationRoute(
    async () => {
      const event = /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) ? await resolveRegistrationEvent(slug) : null;
      return event ? registerPublic(event, body) : null;
    },
    () => forwardToPlatform(request, slug, "register", body),
  );
}
