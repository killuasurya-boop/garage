import { ok } from "@/lib/api-response";
import { eventErrorResponse, invalidId } from "@/lib/event-api";
import { getInvitationShareInfo } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Link undangan + data pesan WA untuk dibagikan manual. Respons tidak di-cache.
export async function GET(_request: Request, context: { params: Promise<{ id: string; invitationId: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id, invitationId } = await context.params;
  const bad = invalidId(id, invitationId);
  if (bad) return bad;
  try {
    const info = await getInvitationShareInfo(id, invitationId);
    return ok(info, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return eventErrorResponse(error, "Gagal mengambil link undangan.");
  }
}
