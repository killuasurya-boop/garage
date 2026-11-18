import { fail, readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { panitiaTaskStatusSchema, panitiaUpdateTaskStatus } from "@/lib/event-panitia-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ubah status tugas: milik sendiri, atau semua tugas event bila Ketua/Sekretaris. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "INVALID_ID", "ID tugas tidak valid.");
  const body = await readJson(request, panitiaTaskStatusSchema);
  if (body.error) return body.error;
  return lineupRoute(() => panitiaUpdateTaskStatus(id, body.data, session.data));
}
