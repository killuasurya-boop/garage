import { ok } from "@/lib/api-response";
import {
  clearOwnerChatHistory,
  listOwnerChatHistory,
} from "@/lib/garage-owner-chat-history";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const history = await listOwnerChatHistory({
    ownerId: session.data.user.id,
    search: url.searchParams.get("q"),
  });

  return ok({ history });
}

export async function DELETE() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const deleted = await clearOwnerChatHistory(session.data.user.id);

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI owner chat history cleared",
    object: "ai_owner_chat_history",
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: { deleted },
  }).catch(() => undefined);

  return ok({ deleted });
}
