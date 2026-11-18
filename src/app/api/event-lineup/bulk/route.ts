import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { bulkPaste, bulkPasteSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/** "Tempel daftar": banyak talent (kind=performer) atau panitia (kind=crew) sekaligus. Satu baris salah = tidak ada yang disimpan. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, bulkPasteSchema);
  if (body.error) return body.error;
  return lineupRoute(() => bulkPaste(body.data, session.data));
}
