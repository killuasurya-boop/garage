import { ok } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { reissueInvitation } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string; invitationId: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id, invitationId } = await context.params;
  const bad = invalidId(id, invitationId);
  if (bad) return bad;
  try {
    return ok(await reissueInvitation(id, invitationId, eventActor(session.data)));
  } catch (error) {
    return eventErrorResponse(error, "Gagal membuat ulang undangan.");
  }
}
