import { readJson } from "@/lib/api-response";
import { bulkCreateSponsors, sponsorBulkSchema } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/** "Tempel daftar" sponsor: kesepakatan saja (tanpa uang masuk). Satu baris salah = tidak ada yang disimpan. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, sponsorBulkSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => bulkCreateSponsors(body.data, session.data));
}
