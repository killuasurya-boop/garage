import { ok } from "@/lib/api-response";
import { listChatUsers } from "@/lib/chat-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const users = await listChatUsers(session.data.user.id);
  return ok({ users });
}
