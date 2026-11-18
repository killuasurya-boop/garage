import { forwardToPlatform, publicRegistrationRoute } from "@/lib/event-registration-route";
import { lookupRegistration, resolveRegistrationEvent, saveRegistrationSetlist, updateRegistration } from "@/lib/event-registration-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cek / ubah / setlist pendaftaran (ID + kode edit) dari form halaman event platform, lewat Caddy (Owner 18 Nov 2026).
// ID yang tidak ada di Garage (pendaftaran lama di platform) atau event belum tertaut → diteruskan ke platform.
const ACTIONS = new Set(["lookup", "update", "setlist"]);

export async function POST(request: Request, context: { params: Promise<{ slug: string; action: string }> }) {
  const limited = rateLimit(request, "public-gigs-registration", { limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const { slug, action } = await context.params;
  if (!ACTIONS.has(action)) return Response.json({ error: "Tidak ditemukan." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Isian tidak terbaca." }, { status: 400 });
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  return publicRegistrationRoute(
    async () => {
      const event = /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) ? await resolveRegistrationEvent(slug) : null;
      if (!event) return null;
      if (action === "lookup") return lookupRegistration(event, id, code);
      if (action === "update") {
        const { id: _id, code: _code, ...data } = body;
        void _id;
        void _code;
        return updateRegistration(event, id, code, data);
      }
      return saveRegistrationSetlist(event, id, code, body.setlist);
    },
    () => forwardToPlatform(request, slug, `registration/${action}`, body),
  );
}
