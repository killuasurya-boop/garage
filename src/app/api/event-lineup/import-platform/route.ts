import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { importPlatformLineup, importPlatformSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Impor lineup yang sudah tayang di platform GIGS (nama, jenis, logo). Tidak menimpa data yang sudah ada. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, importPlatformSchema);
  if (body.error) return body.error;
  return lineupRoute(() => importPlatformLineup(body.data, session.data));
}
