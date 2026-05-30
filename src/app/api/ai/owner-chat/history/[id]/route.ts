import { fail, ok } from "@/lib/api-response";
import {
  deleteOwnerChatHistory,
  getOwnerChatHistory,
} from "@/lib/garage-owner-chat-history";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const history = await getOwnerChatHistory(session.data.user.id, id);
  if (!history) {
    return fail(404, "OWNER_CHAT_HISTORY_NOT_FOUND", "Riwayat chat tidak ditemukan.");
  }

  return ok({ history });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const deleted = await deleteOwnerChatHistory(session.data.user.id, id);
  if (!deleted) {
    return fail(404, "OWNER_CHAT_HISTORY_NOT_FOUND", "Riwayat chat tidak ditemukan.");
  }

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI owner chat history deleted",
    object: id,
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: { deleted },
  }).catch(() => undefined);

  return ok({ deleted });
}
