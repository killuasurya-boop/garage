import { readJson } from "@/lib/api-response";
import { createSponsor, listSponsors, sponsorInputSchema } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Daftar sponsor + ringkasan (Owner). `?event=` menyaring satu event. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const event = new URL(request.url).searchParams.get("event");
  return sponsorRoute(() => listSponsors(session.data, { eventName: event || null }));
}

/** Catat sponsor baru (kesepakatan). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, sponsorInputSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => createSponsor(body.data, session.data), 201);
}
