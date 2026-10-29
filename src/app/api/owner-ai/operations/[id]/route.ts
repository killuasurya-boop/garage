import { fail, ok } from "@/lib/api-response";
import { getOperation } from "@/lib/owner-ai-commands";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Receipt lengkap satu operasi (argumen, hasil ringkas, sidik). Hanya operasi milik Owner ini. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  if (session.data.profile.agentKey) return fail(403, "FORBIDDEN", "Receipt hanya dari layar Owner.");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "INVALID_ID", "ID operasi tidak valid.");
  const operation = await getOperation(id, session.data.user.id);
  if (!operation) return fail(404, "NOT_FOUND", "Operasi tidak ditemukan.");
  return ok({ operation }, { headers: { "cache-control": "no-store" } });
}
